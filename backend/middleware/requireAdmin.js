import jwt from 'jsonwebtoken'
import { isDevLocalhostOrigin, normalizeOrigin, requestOrigin } from '../config/cors.js'

export const ADMIN_COOKIE_NAME = 'fenix_admin_session'

export function adminSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET
}

function trustedMutationOrigin(req) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return true
  const origin = normalizeOrigin(req.get('origin'))
  if (!origin) return true
  if (isDevLocalhostOrigin(origin)) return true
  const allowed = new Set([
    normalizeOrigin(process.env.FRONTEND_BASE_URL),
    normalizeOrigin(process.env.APP_BASE_URL),
    requestOrigin(req),
  ].filter(Boolean))
  return allowed.has(origin)
}

export function requireAdmin(req, res, next) {
  if (!trustedMutationOrigin(req)) {
    return res.status(403).json({ error: 'Origen administrativo no permitido' })
  }

  const token = req.cookies?.[ADMIN_COOKIE_NAME]
  const secret = adminSessionSecret()
  if (!token || !secret) return res.status(401).json({ error: 'No autorizado' })

  try {
    const payload = jwt.verify(token, secret)
    if (payload?.role !== 'admin') throw new Error('Rol inválido')
    req.admin = { role: 'admin' }
    next()
  } catch {
    return res.status(401).json({ error: 'Sesión administrativa inválida o expirada' })
  }
}
