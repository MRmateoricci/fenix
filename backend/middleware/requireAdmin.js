export function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token']
  if (!token || token !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'No autorizado' })
  }
  next()
}
