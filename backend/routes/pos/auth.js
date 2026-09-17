import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../../db/pool.js'
import { requirePosAuth } from '../../middleware/posAuth.js'

const router = Router()

// Turno de mostrador, no sesión de 30 días: el POS corre en una terminal
// compartida del local, conviene que pida login de nuevo entre turnos.
const TOKEN_EXPIRY = '12h'

function signPosToken(posUserId) {
  return jwt.sign({ posUserId }, process.env.POS_JWT_SECRET, { expiresIn: TOKEN_EXPIRY })
}

function toPublicPosUser(row) {
  return { id: row.id, username: row.username, name: row.name, role: row.role }
}

router.post('/login', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim()
    const password = String(req.body?.password || '')
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' })
    }

    const { rows } = await pool.query(
      `SELECT id, username, password_hash, name, role, active
       FROM pos_users WHERE LOWER(username) = LOWER($1)`,
      [username]
    )
    const user = rows[0]
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' })
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash)
    if (!passwordOk) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' })
    }

    res.json({ token: signPosToken(user.id), user: toPublicPosUser(user) })
  } catch (err) {
    console.error('[POST /api/pos/auth/login]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.get('/me', requirePosAuth, (req, res) => {
  res.json({ user: req.posUser })
})

// Stateless: no hay tabla de sesiones que invalidar. El frontend borra el
// token guardado y listo.
router.post('/logout', requirePosAuth, (_req, res) => {
  res.json({ ok: true })
})

export default router
