import { Router } from 'express'
import { pool } from '../db/pool.js'
import { attachUserIfPresent, requireAuth } from '../middleware/requireAuth.js'

const router = Router()

async function getReviewEligibility(userId, productId) {
  if (!userId) {
    return {
      authenticated: false,
      emailVerified: false,
      hasDeliveredOrder: false,
      canReview: false,
    }
  }

  const { rows } = await pool.query(
    `SELECT
       (u.email_verified_at IS NOT NULL) AS email_verified,
       EXISTS (
         SELECT 1
         FROM orders o
         WHERE (o.user_id = u.id OR LOWER(o.customer_email) = u.email)
           AND o.status = 'delivered'
           AND EXISTS (
             SELECT 1
             FROM jsonb_array_elements(o.items) item
             WHERE item->>'id' = $2
           )
       ) AS has_delivered_order
     FROM users u
     WHERE u.id = $1`,
    [userId, productId]
  )

  const eligibility = rows[0]
  const emailVerified = Boolean(eligibility?.email_verified)
  const hasDeliveredOrder = Boolean(eligibility?.has_delivered_order)
  return {
    authenticated: true,
    emailVerified,
    hasDeliveredOrder,
    canReview: emailVerified && hasDeliveredOrder,
  }
}

// GET /api/reviews/:productId — lista pública de reseñas + promedio
router.get('/:productId', attachUserIfPresent, async (req, res) => {
  try {
    const [{ rows }, eligibility] = await Promise.all([
      pool.query(
        `SELECT r.id, r.user_id, r.rating, r.comment, r.created_at, u.first_name, u.last_name
         FROM reviews r
         JOIN users u ON u.id = r.user_id
         WHERE r.product_id = $1
         ORDER BY r.created_at DESC`,
        [req.params.productId]
      ),
      getReviewEligibility(req.userId, req.params.productId),
    ])

    const reviews = rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.created_at,
      author: `${r.first_name} ${r.last_name.charAt(0)}.`,
    }))
    const count   = reviews.length
    const average = count ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0

    res.json({ reviews, average, count, eligibility })
  } catch (err) {
    console.error('[GET /api/reviews/:productId]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/reviews — crea o reemplaza la reseña propia de un producto
router.post('/', requireAuth, async (req, res) => {
  try {
    const { productId, rating, comment } = req.body
    if (productId == null || !Number.isInteger(rating) || rating < 1 || rating > 5)
      return res.status(400).json({ error: 'productId y un rating entre 1 y 5 son requeridos' })
    if (typeof comment === 'string' && comment.length > 2000)
      return res.status(400).json({ error: 'La reseña no puede superar los 2000 caracteres' })

    const eligibility = await getReviewEligibility(req.userId, productId)
    if (!eligibility.emailVerified) {
      return res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        error: 'Confirmá tu email antes de publicar una reseña',
      })
    }
    if (!eligibility.hasDeliveredOrder) {
      return res.status(403).json({
        code: 'REVIEW_NOT_ELIGIBLE',
        error: 'Solo podés reseñar productos de pedidos entregados',
      })
    }

    const { rows } = await pool.query(
      `INSERT INTO reviews (user_id, product_id, rating, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, product_id)
       DO UPDATE SET rating = $3, comment = $4, updated_at = NOW()
       RETURNING id, rating, comment, created_at`,
      [req.userId, productId, rating, comment?.trim() || null]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    console.error('[POST /api/reviews]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// DELETE /api/reviews/:productId — borra la reseña propia de un producto
router.delete('/:productId', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM reviews WHERE user_id = $1 AND product_id = $2',
      [req.userId, req.params.productId]
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/reviews/:productId]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
