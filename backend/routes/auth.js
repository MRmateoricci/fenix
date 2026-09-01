import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { pool } from '../db/pool.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { emailVerificationEmail, passwordResetEmail, sendMail } from '../services/mailer.js'
import { sendPendingReviewInvitationsForUser } from '../services/reviewInvitations.js'
import { isValidEmail, normalizeEmail } from '../utils/email.js'
import { claimGuestOrdersForUser } from '../services/orderClaims.js'
import 'dotenv/config'

const router = Router()

const COOKIE_NAME  = 'fenix_session'
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000 // 30 días

function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production'
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: COOKIE_MAX_AGE,
  }
}

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' })
}

function toPublicUser(row) {
  return {
    id:         row.id,
    email:      row.email,
    firstName:  row.first_name,
    lastName:   row.last_name,
    dni:        row.dni,
    phone:      row.phone,
    address:    row.address,
    city:       row.city,
    postalCode: row.postal_code,
    emailVerified: Boolean(row.email_verified_at),
  }
}

const hashVerificationToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex')

async function issueEmailVerification(user) {
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashVerificationToken(token)

  await pool.query(
    `DELETE FROM email_verification_tokens
     WHERE user_id = $1 AND used_at IS NULL`,
    [user.id]
  )
  await pool.query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
    [user.id, tokenHash]
  )

  return sendMail({
    to: user.email,
    ...emailVerificationEmail({ firstName: user.first_name, token }),
  })
}

const frontendBaseUrl = () =>
  (process.env.FRONTEND_BASE_URL || process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, '')

const backendBaseUrl = () =>
  (process.env.APP_BASE_URL || 'http://localhost:3001').replace(/\/$/, '')

function safeReturnTo(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/account'
}

function redirectWithQuery(pathname, key, value) {
  const url = new URL(safeReturnTo(pathname), frontendBaseUrl())
  url.searchParams.set(key, value)
  return url.toString()
}

function oauthConfig(provider) {
  if (provider === 'google') {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scope: 'openid email profile',
    }
  }
  if (provider === 'facebook') {
    return {
      clientId: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      authorizationUrl: 'https://www.facebook.com/dialog/oauth',
      tokenUrl: 'https://graph.facebook.com/oauth/access_token',
      scope: 'email,public_profile',
    }
  }
  return null
}

async function socialProfile(provider, code, redirectUri) {
  const config = oauthConfig(provider)
  const tokenResponse = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const tokens = await tokenResponse.json().catch(() => ({}))
  if (!tokenResponse.ok || !tokens.access_token) throw new Error('No se pudo validar el acceso social')

  if (provider === 'google') {
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const profile = await response.json().catch(() => ({}))
    if (!response.ok || !profile.email || profile.email_verified === false) throw new Error('Google no devolvió un email verificado')
    return { email: profile.email, firstName: profile.given_name, lastName: profile.family_name }
  }

  const response = await fetch(`https://graph.facebook.com/me?${new URLSearchParams({
    fields: 'id,email,first_name,last_name',
    access_token: tokens.access_token,
  })}`)
  const profile = await response.json().catch(() => ({}))
  if (!response.ok || !profile.email) throw new Error('Facebook no compartió un email con la aplicación')
  return { email: profile.email, firstName: profile.first_name, lastName: profile.last_name }
}

async function findOrCreateSocialUser(profile) {
  const email = normalizeEmail(profile.email)
  const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email])
  if (existing.rows.length) {
    const { rows } = await pool.query(
      'UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = $1 RETURNING *',
      [existing.rows[0].id]
    )
    return rows[0]
  }

  const randomPasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10)
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, email_verified_at)
     VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
    [email, randomPasswordHash, profile.firstName?.trim() || 'Cliente', profile.lastName?.trim() || 'Fénix']
  )
  return rows[0]
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, dni, subscribeNewsletter } = req.body

    if (!isValidEmail(email))
      return res.status(400).json({ error: 'Email inválido' })
    if (!password || password.length < 6)
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' })
    if (!firstName?.trim() || !lastName?.trim())
      return res.status(400).json({ error: 'Nombre y apellido son requeridos' })

    const normalizedEmail = normalizeEmail(email)
    const rawDni = typeof dni === 'string' ? dni.trim() : ''
    const normalizedDni = rawDni.replace(/\D/g, '')
    if (rawDni && !/^\d{7,8}$/.test(normalizedDni))
      return res.status(400).json({ error: 'El DNI debe tener 7 u 8 dígitos' })

    const passwordHash = await bcrypt.hash(password, 10)
    const client = await pool.connect()
    let user
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone, dni)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO NOTHING
         RETURNING *`,
        [
          normalizedEmail,
          passwordHash,
          firstName.trim(),
          lastName.trim(),
          phone?.trim() || null,
          normalizedDni || null,
        ]
      )
      if (!rows.length) {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: 'Ya existe una cuenta con ese email' })
      }

      user = rows[0]
      if (subscribeNewsletter === true) {
        await client.query(
          'INSERT INTO newsletter_subscribers (email) VALUES ($1) ON CONFLICT (email) DO NOTHING',
          [normalizedEmail]
        )
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    res.cookie(COOKIE_NAME, signToken(user.id), cookieOptions())
    const verificationEmailSent = await issueEmailVerification(user)
    res.status(201).json({ user: toPublicUser(user), verificationEmailSent })
  } catch (err) {
    console.error('[POST /api/auth/register]', err)
    res.status(500).json({ error: 'Error interno al crear la cuenta' })
  }
})

router.post('/verify-email', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
  if (!token || token.length > 200) {
    return res.status(400).json({ error: 'Enlace de verificación inválido' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const tokenHash = hashVerificationToken(token)
    const { rows } = await client.query(
      `SELECT user_id
       FROM email_verification_tokens
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       FOR UPDATE`,
      [tokenHash]
    )

    if (!rows.length) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'El enlace es inválido o ya venció' })
    }

    const userId = rows[0].user_id
    await client.query(
      'UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = $1',
      [userId]
    )
    await client.query(
      'UPDATE email_verification_tokens SET used_at = NOW() WHERE token_hash = $1',
      [tokenHash]
    )
    await claimGuestOrdersForUser(userId, client)
    await client.query('COMMIT')

    sendPendingReviewInvitationsForUser(userId).catch((err) => {
      console.error('[review invitation after email verification]', err)
    })

    res.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[POST /api/auth/verify-email]', err)
    res.status(500).json({ error: 'No pudimos verificar el email' })
  } finally {
    client.release()
  }
})

router.post('/resend-verification', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [req.userId]
    )
    const user = rows[0]
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })
    if (user.email_verified_at) return res.json({ ok: true, alreadyVerified: true })

    const recent = await pool.query(
      `SELECT 1 FROM email_verification_tokens
       WHERE user_id = $1
         AND used_at IS NULL
         AND created_at > NOW() - INTERVAL '1 minute'
       LIMIT 1`,
      [req.userId]
    )
    if (recent.rows.length) {
      return res.status(429).json({ error: 'Esperá un minuto antes de pedir otro correo' })
    }

    const emailSent = await issueEmailVerification(user)
    if (!emailSent) {
      return res.status(503).json({ error: 'No pudimos enviar el correo en este momento' })
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/auth/resend-verification]', err)
    res.status(500).json({ error: 'No pudimos reenviar el correo' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Recuperación de contraseña
// ─────────────────────────────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    if (!isValidEmail(req.body?.email)) {
      return res.status(400).json({ error: 'Ingresá un email válido' })
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [normalizeEmail(req.body.email)])
    const user = rows[0]
    // Respuesta uniforme: no revelamos si una dirección está registrada.
    if (!user) return res.json({ ok: true })

    const recent = await pool.query(
      `SELECT 1 FROM password_reset_tokens
       WHERE user_id = $1 AND used_at IS NULL AND created_at > NOW() - INTERVAL '1 minute' LIMIT 1`,
      [user.id]
    )
    if (recent.rows.length) return res.json({ ok: true })

    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = hashVerificationToken(token)
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL', [user.id])
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
      [user.id, tokenHash]
    )
    await sendMail({ to: user.email, ...passwordResetEmail({ firstName: user.first_name, token }) })
    res.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/auth/forgot-password]', err)
    res.status(500).json({ error: 'No pudimos procesar la solicitud' })
  }
})

router.post('/reset-password', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (!token || token.length > 200) return res.status(400).json({ error: 'Enlace inválido' })
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const tokenHash = hashVerificationToken(token)
    const { rows } = await client.query(
      `SELECT user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW() FOR UPDATE`,
      [tokenHash]
    )
    if (!rows.length) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'El enlace es inválido o ya venció' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const userId = rows[0].user_id
    const updated = await client.query('UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING *', [passwordHash, userId])
    await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = $1', [tokenHash])
    await client.query('COMMIT')
    res.cookie(COOKIE_NAME, signToken(userId), cookieOptions())
    res.json({ user: toPublicUser(updated.rows[0]) })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[POST /api/auth/reset-password]', err)
    res.status(500).json({ error: 'No pudimos cambiar la contraseña' })
  } finally {
    client.release()
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Acceso con Google / Facebook (OAuth 2.0, Authorization Code)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/oauth/:provider', (req, res) => {
  const provider = req.params.provider
  const config = oauthConfig(provider)
  const returnTo = safeReturnTo(req.query.returnTo)
  if (!config) return res.redirect(redirectWithQuery('/login', 'authError', 'Proveedor no disponible'))
  if (!config.clientId || !config.clientSecret) {
    return res.redirect(redirectWithQuery('/login', 'authError', `${provider === 'google' ? 'Google' : 'Facebook'} todavía no está configurado`))
  }

  const redirectUri = `${backendBaseUrl()}/api/auth/oauth/${provider}/callback`
  const state = jwt.sign({ purpose: 'social_login', provider, returnTo }, process.env.JWT_SECRET, { expiresIn: '10m' })
  const query = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scope,
    state,
  })
  if (provider === 'google') query.set('prompt', 'select_account')
  res.redirect(`${config.authorizationUrl}?${query}`)
})

router.get('/oauth/:provider/callback', async (req, res) => {
  let returnTo = '/account'
  try {
    const provider = req.params.provider
    const config = oauthConfig(provider)
    if (!config || !req.query.code || !req.query.state) throw new Error('Respuesta OAuth incompleta')
    const state = jwt.verify(req.query.state, process.env.JWT_SECRET)
    if (state.purpose !== 'social_login' || state.provider !== provider) throw new Error('Estado OAuth inválido')
    returnTo = safeReturnTo(state.returnTo)

    const redirectUri = `${backendBaseUrl()}/api/auth/oauth/${provider}/callback`
    const profile = await socialProfile(provider, String(req.query.code), redirectUri)
    const user = await findOrCreateSocialUser(profile)
    await claimGuestOrdersForUser(user.id)
    res.cookie(COOKIE_NAME, signToken(user.id), cookieOptions())
    res.redirect(redirectWithQuery(returnTo, 'socialLogin', 'success'))
  } catch (err) {
    console.error('[GET /api/auth/oauth callback]', err)
    res.redirect(redirectWithQuery(returnTo === '/account' ? '/login' : returnTo, 'authError', err.message || 'No pudimos iniciar sesión'))
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email?.trim() || !password)
      return res.status(400).json({ error: 'Email y contraseña son requeridos' })

    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    )
    const user = rows[0]
    const genericError = () => res.status(401).json({ error: 'Email o contraseña incorrectos' })

    if (!user) return genericError()

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) return genericError()

    if (user.email_verified_at) await claimGuestOrdersForUser(user.id)
    res.cookie(COOKIE_NAME, signToken(user.id), cookieOptions())
    res.json({ user: toPublicUser(user) })
  } catch (err) {
    console.error('[POST /api/auth/login]', err)
    res.status(500).json({ error: 'Error interno al iniciar sesión' })
  }
})

// POST /api/auth/email-status
// Permite que el checkout invite a iniciar sesión antes de reservar stock.
router.post('/email-status', async (req, res) => {
  try {
    if (!isValidEmail(req.body?.email)) {
      return res.status(400).json({ error: 'Email inválido' })
    }

    const email = normalizeEmail(req.body.email)
    const { rows } = await pool.query(
      'SELECT 1 FROM users WHERE email = $1 LIMIT 1',
      [email]
    )
    res.json({ hasAccount: rows.length > 0 })
  } catch (err) {
    console.error('[POST /api/auth/email-status]', err)
    res.status(500).json({ error: 'No pudimos verificar el email' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────────────────
router.post('/logout', (_req, res) => {
  const { maxAge, ...clearOptions } = cookieOptions()
  res.clearCookie(COOKIE_NAME, clearOptions)
  res.json({ ok: true })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me
// ─────────────────────────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId])
    if (!rows.length) return res.status(401).json({ error: 'No autenticado' })
    res.json({ user: toPublicUser(rows[0]) })
  } catch (err) {
    console.error('[GET /api/auth/me]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/auth/me
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/me', requireAuth, async (req, res) => {
  try {
    const { firstName, lastName, phone, address, city, postalCode } = req.body

    const { rows } = await pool.query(
      `UPDATE users SET
         first_name  = COALESCE($1, first_name),
         last_name   = COALESCE($2, last_name),
         phone       = COALESCE($3, phone),
         address     = COALESCE($4, address),
         city        = COALESCE($5, city),
         postal_code = COALESCE($6, postal_code)
       WHERE id = $7
       RETURNING *`,
      [
        firstName?.trim()  || null,
        lastName?.trim()   || null,
        phone?.trim()      ?? null,
        address?.trim()    ?? null,
        city?.trim()       ?? null,
        postalCode?.trim() ?? null,
        req.userId,
      ]
    )
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' })
    res.json({ user: toPublicUser(rows[0]) })
  } catch (err) {
    console.error('[PATCH /api/auth/me]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
