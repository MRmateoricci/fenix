import jwt from 'jsonwebtoken'

export function requireAuth(req, res, next) {
  const token = req.cookies?.fenix_session
  if (!token) return res.status(401).json({ error: 'No autenticado' })
  try {
    const { userId } = jwt.verify(token, process.env.JWT_SECRET)
    req.userId = userId
    next()
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o expirada' })
  }
}

// Variante para rutas que admiten invitados: si hay cookie válida adjunta
// req.userId, si no, sigue sin autenticar (no responde 401).
export function attachUserIfPresent(req, _res, next) {
  const token = req.cookies?.fenix_session
  if (token) {
    try {
      req.userId = jwt.verify(token, process.env.JWT_SECRET).userId
    } catch {
      // token inválido/expirado — se trata como invitado
    }
  }
  next()
}
