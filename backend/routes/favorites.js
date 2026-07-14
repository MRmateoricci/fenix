import { Router } from 'express'
import { pool } from '../db/pool.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, product_id, created_at FROM favorites WHERE user_id = $1 ORDER BY created_at DESC',
      [req.userId]
    )
    res.json(rows.map((r) => ({ id: r.id, productId: r.product_id, createdAt: r.created_at })))
  } catch (err) {
    console.error('[GET /api/favorites]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.post('/', requireAuth, async (req, res) => {
  try {
    const { productId } = req.body
    if (productId == null) return res.status(400).json({ error: 'productId es requerido' })

    const { rows } = await pool.query(
      `INSERT INTO favorites (user_id, product_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, product_id) DO NOTHING
       RETURNING id, product_id, created_at`,
      [req.userId, productId]
    )
    res.status(201).json(rows[0] ? { id: rows[0].id, productId: rows[0].product_id, createdAt: rows[0].created_at } : { ok: true })
  } catch (err) {
    console.error('[POST /api/favorites]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.delete('/:productId', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM favorites WHERE user_id = $1 AND product_id = $2',
      [req.userId, req.params.productId]
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/favorites/:productId]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
