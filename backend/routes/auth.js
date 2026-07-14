import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../db/pool.js'
import { requireAuth } from '../middleware/requireAuth.js'
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
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body

    if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'Email inválido' })
    if (!password || password.length < 6)
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' })
    if (!firstName?.trim() || !lastName?.trim())
      return res.status(400).json({ error: 'Nombre y apellido son requeridos' })

    const normalizedEmail = email.trim().toLowerCase()

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
    res.status(201).json({ user: toPublicUser(user) })
  } catch (err) {
    console.error('[POST /api/auth/register]', err)
    res.status(500).json({ error: 'Error interno al crear la cuenta' })
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
