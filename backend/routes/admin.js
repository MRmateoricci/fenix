import jwt from 'jsonwebtoken'
import { Router } from 'express'
import {
  ADMIN_COOKIE_NAME,
  adminSessionSecret,
  requireAdmin,
} from '../middleware/requireAdmin.js'
import { passwordsMatch } from '../utils/adminSecurity.js'

const router = Router()
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000
const FAILED_WINDOW_MS = 15 * 60 * 1000
const MAX_FAILED_ATTEMPTS = 5
const failedAttempts = new Map()

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/',
  }
}

function ipKey(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown')
}

function activeFailures(key, now = Date.now()) {
  const entry = failedAttempts.get(key)
  if (!entry || now - entry.startedAt >= FAILED_WINDOW_MS) {
    failedAttempts.delete(key)
    return null
  }
  return entry
}

router.post('/session', (req, res) => {
  const key = ipKey(req)
  const current = activeFailures(key)
  if (current?.count >= MAX_FAILED_ATTEMPTS) {
    return res.status(429).json({ error: 'Demasiados intentos. Esperá 15 minutos.' })
  }

  const password = req.body?.password
  const expected = process.env.ADMIN_SECRET
  const secret = adminSessionSecret()
  if (!expected || !secret) {
    return res.status(503).json({ error: 'El acceso administrativo no está configurado' })
  }
  if (!passwordsMatch(password, expected)) {
    const now = Date.now()
    failedAttempts.set(key, current
      ? { ...current, count: current.count + 1 }
      : { count: 1, startedAt: now })
    return res.status(401).json({ error: 'Contraseña incorrecta' })
  }

  failedAttempts.delete(key)
  const token = jwt.sign({ role: 'admin' }, secret, { expiresIn: '8h' })
  res.cookie(ADMIN_COOKIE_NAME, token, cookieOptions())
  return res.json({ authenticated: true })
})

router.get('/session', requireAdmin, (_req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json({ authenticated: true })
})

router.delete('/session', (_req, res) => {
  const { maxAge, ...options } = cookieOptions()
  res.clearCookie(ADMIN_COOKIE_NAME, options)
  res.json({ authenticated: false })
})

export default router
