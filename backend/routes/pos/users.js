import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { pool } from '../../db/pool.js'
import { requirePosAuth, requirePosRole } from '../../middleware/posAuth.js'

const router = Router()
const ROLES = ['admin', 'vendedor']

router.use(requirePosAuth, requirePosRole('admin'))

function toPublicPosUser(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    active: row.active,
    createdAt: row.created_at,
  }
}

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, name, role, active, created_at
       FROM pos_users ORDER BY active DESC, name`
    )
    res.json({ users: rows.map(toPublicPosUser) })
  } catch (err) {
    console.error('[GET /api/pos/users]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.post('/', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim()
    const password = String(req.body?.password || '')
    const name = String(req.body?.name || '').trim()
    const role = ROLES.includes(req.body?.role) ? req.body.role : 'vendedor'

    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Usuario, contraseña y nombre son obligatorios' })
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const { rows } = await pool.query(
      `INSERT INTO pos_users (username, password_hash, name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, name, role, active, created_at`,
      [username, passwordHash, name, role]
    )
    res.status(201).json({ user: toPublicPosUser(rows[0]) })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ese nombre de usuario ya existe' })
    }
    console.error('[POST /api/pos/users]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const { name, password, role, active } = req.body || {}
    const fields = []
    const params = []
    let idx = 1

    if (name != null) { fields.push(`name = $${idx++}`); params.push(String(name).trim()) }
    if (role != null) {
      if (!ROLES.includes(role)) return res.status(400).json({ error: 'Rol inválido' })
      fields.push(`role = $${idx++}`); params.push(role)
    }
    if (active != null) { fields.push(`active = $${idx++}`); params.push(Boolean(active)) }
    if (password) {
      if (String(password).length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' })
      }
      fields.push(`password_hash = $${idx++}`); params.push(await bcrypt.hash(String(password), 10))
    }

    if (!fields.length) return res.status(400).json({ error: 'No hay cambios para aplicar' })

    params.push(req.params.id)
    const { rows } = await pool.query(
      `UPDATE pos_users SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, username, name, role, active, created_at`,
      params
    )
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' })
    res.json({ user: toPublicPosUser(rows[0]) })
  } catch (err) {
    console.error('[PUT /api/pos/users/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// Soft delete: un usuario POS nunca se borra de verdad porque sus ventas
// (pos_sales.user_id) tienen que seguir identificando quién vendió.
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE pos_users SET active = FALSE WHERE id = $1
       RETURNING id, username, name, role, active, created_at`,
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' })
    res.json({ user: toPublicPosUser(rows[0]) })
  } catch (err) {
    console.error('[DELETE /api/pos/users/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
