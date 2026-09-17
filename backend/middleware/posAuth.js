import jwt from 'jsonwebtoken'
import { pool } from '../db/pool.js'

// Auth del POS: JWT por header Authorization (no cookie). El POS vive en un
// subdominio propio (pos.fenixelectricidadiluminacion.com), separado del
// dominio del e-commerce/admin, así que una cookie HTTP-only cruzaría dominios
// y complicaría CORS sin necesidad — el POS es una SPA que ya guarda el token
// en memoria del navegador.
//
// El payload del JWT solo lleva el id: rol y estado `active` se leen de la
// base en cada request. Si solo confiáramos en el payload, desactivar a un
// vendedor o cambiarle el rol no tendría efecto hasta que el token expirara.
export async function requirePosAuth(req, res, next) {
  const header = req.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null
  if (!token) return res.status(401).json({ error: 'No autenticado' })

  try {
    const { posUserId } = jwt.verify(token, process.env.POS_JWT_SECRET)
    const { rows } = await pool.query(
      `SELECT id, username, name, role, active FROM pos_users WHERE id = $1`,
      [posUserId]
    )
    const user = rows[0]
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Sesión inválida o usuario deshabilitado' })
    }
    req.posUser = { id: user.id, username: user.username, name: user.name, role: user.role }
    next()
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o expirada' })
  }
}

export function requirePosRole(role) {
  return (req, res, next) => {
    if (req.posUser?.role !== role) return res.status(403).json({ error: 'No autorizado' })
    next()
  }
}
