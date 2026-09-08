import { Router } from 'express'
import { pool } from '../db/pool.js'
import { requireAdmin } from '../middleware/requireAdmin.js'

const router = Router()

// La API interna usa snake_case; el frontend camelCase. La conversión de las
// cuentas se hace acá (igual que routes/catalog.js para el catálogo).
// `password_hash` nunca sale de este archivo.
export function mapCustomerRow(row) {
  return {
    id:             row.id,
    email:          row.email,
    firstName:      row.first_name,
    lastName:       row.last_name,
    phone:          row.phone,
    address:        row.address,
    city:           row.city,
    postalCode:     row.postal_code,
    emailVerified:  Boolean(row.email_verified_at),
    emailVerifiedAt: row.email_verified_at,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
    ordersCount:     Number(row.orders_count) || 0,
    paidOrdersCount: Number(row.paid_orders_count) || 0,
    totalSpent:      Number(row.total_spent) || 0,
    lastOrderAt:     row.last_order_at,
    favoritesCount:  Number(row.favorites_count) || 0,
    reviewsCount:    Number(row.reviews_count) || 0,
    newsletterSubscribed: Boolean(row.newsletter_subscribed),
  }
}

// Filtro de búsqueda por nombre o email. Devuelve el WHERE y sus parámetros
// para que la ruta arme la query; sin término, no filtra.
export function buildCustomerSearch(search) {
  const term = typeof search === 'string' ? search.trim() : ''
  if (!term) return { where: '', params: [] }
  return {
    where: `WHERE (
      u.email ILIKE $1
      OR u.first_name ILIKE $1
      OR u.last_name ILIKE $1
      OR (u.first_name || ' ' || u.last_name) ILIKE $1
    )`,
    params: [`%${term}%`],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/customers — listado de cuentas con resumen de actividad (solo admin)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { where, params } = buildCustomerSearch(req.query.search)
    const { rows } = await pool.query(
      `SELECT
         u.id, u.email, u.first_name, u.last_name, u.phone,
         u.address, u.city, u.postal_code,
         u.email_verified_at, u.created_at, u.updated_at,
         COALESCE(o.orders_count, 0)      AS orders_count,
         COALESCE(o.paid_orders_count, 0) AS paid_orders_count,
         COALESCE(o.total_spent, 0)       AS total_spent,
         o.last_order_at,
         COALESCE(f.favorites_count, 0)   AS favorites_count,
         COALESCE(r.reviews_count, 0)     AS reviews_count,
         (n.email IS NOT NULL)            AS newsletter_subscribed
       FROM users u
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*)                                    AS orders_count,
           COUNT(*) FILTER (WHERE paid_at IS NOT NULL) AS paid_orders_count,
           COALESCE(SUM(total_amount) FILTER (WHERE paid_at IS NOT NULL), 0) AS total_spent,
           MAX(created_at)                             AS last_order_at
         FROM orders WHERE user_id = u.id
       ) o ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS favorites_count FROM favorites WHERE user_id = u.id
       ) f ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS reviews_count FROM reviews WHERE user_id = u.id
       ) r ON TRUE
       LEFT JOIN newsletter_subscribers n ON LOWER(n.email) = LOWER(u.email)
       ${where}
       ORDER BY u.created_at DESC`,
      params
    )
    res.json({ customers: rows.map(mapCustomerRow), total: rows.length })
  } catch (err) {
    console.error('[GET /api/customers]', err)
    res.status(500).json({ error: 'No se pudieron cargar las cuentas' })
  }
})

export default router
