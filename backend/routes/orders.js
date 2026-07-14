import { Router } from 'express'
import { pool } from '../db/pool.js'
import { createPreference } from '../services/mercadopago.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { attachUserIfPresent, requireAuth } from '../middleware/requireAuth.js'
import { reserveStock, releaseOrderStock, InsufficientStockError } from '../services/stockReservation.js'
import { estimateDeliveryDate } from '../services/correoArgentino.js'
import { getShippingForCP } from '../config/shipping.js'
import { sendMail, customerConfirmationEmail, adminNewOrderEmail } from '../services/mailer.js'
import 'dotenv/config'

const router = Router()

// Pedidos pay-in-store sin pagar/retirar: vencen a los 2 días de la fecha de
// retiro elegida. Pedidos mercadopago sin completar el pago: vencen a los 45
// minutos (MP no avisa cuando el cliente simplemente abandona el checkout).
const PICKUP_RESERVATION_GRACE_DAYS  = 2
const PENDING_PAYMENT_EXPIRY_MINUTES = 45

// Estados que liberan el stock reservado de un pedido (ver stockReservation.js
// — releaseOrderStock es idempotente, así que da igual si más de uno de estos
// caminos termina llamándolo para el mismo pedido).
export const RELEASES_STOCK = ['cancelled', 'payment_failed', 'expired']

// ── Genera número de orden legible (FX-A3B9C2) ───────────────────────────────
function generateOrderNumber() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let rand = ''
  for (let i = 0; i < 6; i++) rand += chars[Math.floor(Math.random() * chars.length)]
  return `FX-${rand}`
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orders
// Body: { customer: {...formData incl. deliveryType/paymentMethod/pickupDate}, items }
// Crea la orden en DB (reservando stock) + preferencia MP si corresponde.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', attachUserIfPresent, async (req, res) => {
  try {
    const { customer, items } = req.body
    const deliveryType  = customer?.deliveryType
    const pickupDate    = customer?.pickupDate
    const paymentMethod = customer?.paymentMethod || 'mercadopago'

    if (!customer?.email || !customer?.nombre || !items?.length) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }
    if (!['pickup', 'delivery'].includes(deliveryType)) {
      return res.status(400).json({ error: 'Modalidad de entrega inválida' })
    }
    if (!['mercadopago', 'pay_in_store'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Método de pago inválido' })
    }
    if (paymentMethod === 'pay_in_store' && deliveryType !== 'pickup') {
      return res.status(400).json({ error: 'Pagar en el local solo está disponible para retiro en el local' })
    }
    if (deliveryType === 'pickup' && !pickupDate) {
      return res.status(400).json({ error: 'Falta la fecha de retiro' })
    }

    // Precio y stock disponible se recalculan contra la DB — nunca se confía
    // en lo que manda el cliente (podría mandar cualquier item.price).
    const productIds = items.map((i) => i.id)
    const { rows: dbProducts } = await pool.query(
      `SELECT id, precio_venta FROM products WHERE id = ANY($1::uuid[])`,
      [productIds]
    )
    const productMap = new Map(dbProducts.map((p) => [p.id, p]))

    const itemsSnapshot = []
    for (const i of items) {
      const dbProduct = productMap.get(i.id)
      if (!dbProduct || dbProduct.precio_venta == null) {
        return res.status(400).json({ error: `Producto no disponible: ${i.name || i.id}` })
      }
      const price = Number(dbProduct.precio_venta)
      itemsSnapshot.push({
        id:       dbProduct.id,
        name:     i.name,
        category: i.category,
        price,
        quantity: i.quantity,
        subtotal: price * i.quantity,
        image:    i.image || null,
        color:    i.color || null,
      })
    }
    const productsTotal = itemsSnapshot.reduce((sum, i) => sum + i.subtotal, 0)

    // Envío: costo por zona + estimación de entrega (Correo Argentino + margen
    // propio de stock). Llamado fuera de la transacción de DB — es red, no
    // debe sostener locks de Postgres.
    let shippingCost = 0
    let estimatedDeliveryDate = null
    if (deliveryType === 'delivery') {
      const zone = getShippingForCP(customer.codigoPostal)
      if (!zone) {
        return res.status(400).json({ error: 'No pudimos calcular el envío para ese código postal — consultanos por WhatsApp' })
      }
      shippingCost = zone.price
      const estimate = await estimateDeliveryDate(customer.codigoPostal)
      estimatedDeliveryDate = estimate.estimatedDate
    }

    const total = productsTotal + shippingCost

    let reservationExpiresAt = null
    if (deliveryType === 'pickup' && paymentMethod === 'pay_in_store') {
      reservationExpiresAt = new Date(pickupDate)
      reservationExpiresAt.setDate(reservationExpiresAt.getDate() + PICKUP_RESERVATION_GRACE_DAYS)
    } else if (paymentMethod === 'mercadopago') {
      reservationExpiresAt = new Date(Date.now() + PENDING_PAYMENT_EXPIRY_MINUTES * 60 * 1000)
    }

    const initialStatus = paymentMethod === 'pay_in_store' ? 'reserved' : 'pending_payment'
    const orderNumber   = generateOrderNumber()

    const client = await pool.connect()
    let order
    try {
      await client.query('BEGIN')
      await reserveStock(client, itemsSnapshot)

      const { rows } = await client.query(
        `INSERT INTO orders
           (order_number, status, customer_name, customer_email, customer_phone,
            delivery_type, address, city, postal_code, total_amount, shipping_cost,
            payment_method, pickup_date, estimated_delivery_date, reservation_expires_at,
            items, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING *`,
        [
          orderNumber, initialStatus,
          `${customer.nombre} ${customer.apellido}`.trim(),
          customer.email,
          customer.telefono,
          deliveryType,
          customer.direccion    || null,
          customer.ciudad       || null,
          customer.codigoPostal || null,
          total,
          shippingCost || null,
          paymentMethod,
          deliveryType === 'pickup' ? pickupDate : null,
          estimatedDeliveryDate,
          reservationExpiresAt,
          JSON.stringify(itemsSnapshot),
          req.userId || null,
        ]
      )
      order = rows[0]
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      if (err instanceof InsufficientStockError) {
        return res.status(409).json({ error: err.message })
      }
      throw err
    } finally {
      client.release()
    }

    let checkoutUrl = null
    if (paymentMethod === 'mercadopago') {
      const { preferenceId, initPoint, sandboxInitPoint } = await createPreference(order)

      await pool.query(
        'UPDATE orders SET mp_preference_id = $1 WHERE id = $2',
        [preferenceId, order.id]
      )

      const isProd = process.env.NODE_ENV === 'production'
      checkoutUrl  = isProd ? initPoint : sandboxInitPoint
    }

    // Mails best-effort — nunca deben tumbar una compra/reserva ya confirmada.
    sendMail({ to: order.customer_email, ...customerConfirmationEmail(order) })
    if (process.env.ADMIN_NOTIFICATION_EMAIL) {
      sendMail({ to: process.env.ADMIN_NOTIFICATION_EMAIL, ...adminNewOrderEmail(order) })
    }

    res.status(201).json({
      orderId:      order.id,
      orderNumber:  order.order_number,
      checkoutUrl,
    })
  } catch (err) {
    console.error('[POST /api/orders]', err)
    res.status(500).json({ error: 'Error interno al crear el pedido' })
  }
})

const PUBLIC_ORDER_FIELDS = `
  id, order_number, status, customer_name, delivery_type,
  address, city, postal_code, total_amount, shipping_cost,
  payment_method, pickup_date, estimated_delivery_date,
  items, created_at, paid_at
`

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders/public/:id
// Endpoint público — devuelve campos no sensibles para la página de confirmación
// ─────────────────────────────────────────────────────────────────────────────
router.get('/public/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_ORDER_FIELDS} FROM orders WHERE id = $1`,
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Pedido no encontrado' })
    res.json(rows[0])
  } catch (err) {
    console.error('[GET /api/orders/public/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders/track/:orderNumber
// Endpoint público — rastreo por número de orden (FX-XXXXXX)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/track/:orderNumber', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_ORDER_FIELDS} FROM orders WHERE order_number = $1`,
      [req.params.orderNumber.toUpperCase()]
    )
    if (!rows.length) return res.status(404).json({ error: 'Pedido no encontrado' })
    res.json(rows[0])
  } catch (err) {
    console.error('[GET /api/orders/track/:orderNumber]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders/mine
// Historial de pedidos del usuario autenticado
// ─────────────────────────────────────────────────────────────────────────────
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_ORDER_FIELDS}
       FROM orders WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.userId]
    )
    res.json(rows)
  } catch (err) {
    console.error('[GET /api/orders/mine]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders  (admin)
// Query params: ?status=paid&search=email&page=1&limit=50
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query
    const offset = (Number(page) - 1) * Number(limit)

    const conditions = []
    const params     = []
    let idx = 1

    if (status) {
      conditions.push(`status = $${idx++}`)
      params.push(status)
    }
    if (search) {
      conditions.push(
        `(customer_email ILIKE $${idx} OR customer_name ILIKE $${idx} OR order_number ILIKE $${idx})`
      )
      params.push(`%${search}%`)
      idx++
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const [data, countResult] = await Promise.all([
      pool.query(
        `SELECT id, order_number, status, customer_name, customer_email, customer_phone,
                delivery_type, address, city, postal_code, total_amount, shipping_cost,
                payment_method, pickup_date, estimated_delivery_date, items,
                created_at, paid_at, mp_payment_id
         FROM orders ${where}
         ORDER BY created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, Number(limit), offset]
      ),
      pool.query(`SELECT COUNT(*) FROM orders ${where}`, params),
    ])

    res.json({
      orders: data.rows,
      total:  Number(countResult.rows[0].count),
      page:   Number(page),
      limit:  Number(limit),
    })
  } catch (err) {
    console.error('[GET /api/orders]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders/:id  (admin)
// Detalle completo de un pedido
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM orders WHERE id = $1',
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Pedido no encontrado' })
    res.json(rows[0])
  } catch (err) {
    console.error('[GET /api/orders/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/orders/:id/status  (admin)
// Body: { status: 'preparing' }
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id/status', requireAdmin, async (req, res) => {
  try {
    const VALID = [
      'pending_payment', 'paid', 'preparing', 'shipped',
      'delivered', 'cancelled', 'payment_failed', 'reserved', 'expired',
    ]
    const { status } = req.body

    if (!VALID.includes(status)) {
      return res.status(400).json({ error: 'Estado inválido' })
    }

    const { rows } = await pool.query(
      `UPDATE orders
       SET status  = $1,
           paid_at = CASE WHEN $3 = 'paid' AND paid_at IS NULL THEN NOW() ELSE paid_at END
       WHERE id = $2 RETURNING *`,
      [status, req.params.id, status]
    )
    if (!rows.length) return res.status(404).json({ error: 'Pedido no encontrado' })

    if (RELEASES_STOCK.includes(status)) {
      await releaseOrderStock(req.params.id)
    }

    res.json(rows[0])
  } catch (err) {
    console.error('[PATCH /api/orders/:id/status]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
