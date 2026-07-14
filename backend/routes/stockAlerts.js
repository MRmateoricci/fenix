import { Router } from 'express'
import { pool } from '../db/pool.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { attachUserIfPresent } from '../middleware/requireAuth.js'

const router = Router()

// Invitados permitidos: pedir que te avisen cuando vuelva el stock no
// debería exigir crear una cuenta.
router.post('/', attachUserIfPresent, async (req, res) => {
  try {
    const { productId, email } = req.body
    if (productId == null || !email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'productId y un email válido son requeridos' })

    await pool.query(
      'INSERT INTO stock_alerts (user_id, product_id, email) VALUES ($1, $2, $3)',
      [req.userId || null, productId, email.trim().toLowerCase()]
    )
    res.status(201).json({ ok: true })
  } catch (err) {
    console.error('[POST /api/stock-alerts]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// Vista simple para el dueño del local
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { productId, notified } = req.query
    const conditions = []
    const params     = []
    let idx = 1

    if (productId) { conditions.push(`product_id = $${idx++}`); params.push(productId) }
    if (notified != null) { conditions.push(`notified = $${idx++}`); params.push(notified === 'true') }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const { rows } = await pool.query(
      `SELECT id, product_id, email, notified, created_at
       FROM stock_alerts ${where}
       ORDER BY created_at DESC`,
      params
    )
    res.json(rows)
  } catch (err) {
    console.error('[GET /api/stock-alerts]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
