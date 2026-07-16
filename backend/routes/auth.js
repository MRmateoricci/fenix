import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { pool } from '../db/pool.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { emailVerificationEmail, sendMail } from '../services/mailer.js'
import { sendPendingReviewInvitationsForUser } from '../services/reviewInvitations.js'
import { isValidEmail, normalizeEmail } from '../utils/email.js'
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body

    if (!isValidEmail(email))
      return res.status(400).json({ error: 'Email inválido' })
    if (!password || password.length < 6)
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' })
    if (!firstName?.trim() || !lastName?.trim())
      return res.status(400).json({ error: 'Nombre y apellido son requeridos' })

    const normalizedEmail = normalizeEmail(email)

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail])
    if (existing.rows.length)
      return res.status(409).json({ error: 'Ya existe una cuenta con ese email' })

    const passwordHash = await bcrypt.hash(password, 10)

    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [normalizedEmail, passwordHash, firstName.trim(), lastName.trim(), phone?.trim() || null]
    )

    const user = rows[0]
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
