import { Router } from 'express'
import { pool } from '../db/pool.js'
import { createPreference } from '../services/mercadopago.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { attachUserIfPresent, requireAuth } from '../middleware/requireAuth.js'
import { reserveStock, releaseOrderStock, InsufficientStockError } from '../services/stockReservation.js'
import { estimateDeliveryDate } from '../services/correoArgentino.js'
import { SHIPPING_SERVICES } from '../config/shipping.js'
import { quoteShipping } from '../services/shippingQuotes.js'
import { sendOrderConfirmationNotifications } from '../services/orderNotifications.js'
import { PaymentReconciliationError, reconcileMercadoPagoPayment } from '../services/mercadopagoPayments.js'
import { sendReviewInvitationForOrder } from '../services/reviewInvitations.js'
import { isValidEmail, normalizeEmail } from '../utils/email.js'
import { resolveVariantRule, ruleMatches } from '../services/productVariants.js'
import 'dotenv/config'

const router = Router()

// Pedidos pay-in-store sin pagar/retirar: vencen a los 2 días de la fecha de
// retiro elegida. Pedidos mercadopago sin completar el pago: vencen a los 45
// minutos (MP no avisa cuando el cliente simplemente abandona el checkout).
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

// Combina color + tono en una sola clave de fila para variant_stock: un
// producto puede tener color de carcasa y tono de luz (cálido/neutro/frío) a
// la vez, pero la matriz de stock sigue siendo 2D (fila × medida). Misma
// convención en ProductModal (AdminDashboard.jsx) y ProductDetail.jsx — si
// se cambia acá hay que cambiarla en los tres lados.
export function combineVariantRowKey(selectedColor, selectedTone) {
  if (selectedColor && selectedTone) return `${selectedColor} / ${selectedTone}`
  return selectedColor || selectedTone || '_'
}

// Si el color, el tono y la medida elegidos tienen precio propio, la medida
// manda (suele ser lo que más cambia el costo, ej. largo de un cable); el
// tono pisa al color, y el color solo se usa si ni el tono ni la medida
// tienen precio propio.
export function resolveProductVariantPrice(product, selectedColor, selectedSize, selectedTone) {
  const basePrice = Number(product?.precio_venta)
  if (!Number.isFinite(basePrice)) return { error: 'missing_price', price: null }
  let price = basePrice
  const hasOption = (options, key, selected) => !selected || !options.length || options.some(option =>
    String(option?.[key] || '').localeCompare(String(selected), 'es-AR', { sensitivity: 'base' }) === 0
  )
  const availableColors = Array.isArray(product.color_options) ? product.color_options : []
  const availableSizes = Array.isArray(product.size_options) ? product.size_options : []
  const availableTones = Array.isArray(product.tone_options) ? product.tone_options : []
  if (!hasOption(availableColors, 'name', selectedColor)) return { error: 'invalid_color', price: null }
  if (!hasOption(availableSizes, 'label', selectedSize)) return { error: 'invalid_size', price: null }
  if (!hasOption(availableTones, 'name', selectedTone)) return { error: 'invalid_tone', price: null }
  const usdArsRate = Number(product?.usd_ars_rate) || 1510
  const normalizedRules = (Array.isArray(product?.variant_rules) ? product.variant_rules : []).map(rule => ({
    ...rule,
    precio_venta: rule.price_currency === 'USD' && rule.precio_venta_usd != null
      ? Number(rule.precio_venta_usd) * usdArsRate
      : rule.precio_venta,
  }))
  const priceRule = resolveVariantRule(normalizedRules, {
    color: selectedColor, size: selectedSize, tone: selectedTone,
  }, 'precio_venta')
  if (priceRule?.error) return { error: 'invalid_variant', price: null }
  if (priceRule) return { error: null, price: Number(priceRule.precio_venta), ruleId: priceRule.id }
  if (normalizedRules.length && !normalizedRules.some(rule => ruleMatches(rule, {
    color: selectedColor, size: selectedSize, tone: selectedTone,
  }))) return { error: 'invalid_variant', price: null }

  if (selectedColor) {
    const colors = Array.isArray(product.color_options) ? product.color_options : []
    const variant = colors.find(color =>
      String(color?.name || '').localeCompare(String(selectedColor), 'es-AR', { sensitivity: 'base' }) === 0
    )
    if (colors.length && !variant) return { error: 'invalid_color', price: null }
    const variantPrice = Number(variant?.price)
    if (Number.isFinite(variantPrice)) price = variantPrice
  }

  if (selectedTone) {
    const tones = Array.isArray(product.tone_options) ? product.tone_options : []
    const variant = tones.find(tone =>
      String(tone?.name || '').localeCompare(String(selectedTone), 'es-AR', { sensitivity: 'base' }) === 0
    )
    if (tones.length && !variant) return { error: 'invalid_tone', price: null }
    const variantPrice = Number(variant?.price)
    if (Number.isFinite(variantPrice)) price = variantPrice
  }

  if (selectedSize) {
    const sizes = Array.isArray(product.size_options) ? product.size_options : []
    const variant = sizes.find(size =>
      String(size?.label || '').localeCompare(String(selectedSize), 'es-AR', { sensitivity: 'base' }) === 0
    )
    if (sizes.length && !variant) return { error: 'invalid_size', price: null }
    const variantPrice = Number(variant?.price)
    if (Number.isFinite(variantPrice)) price = variantPrice
  }

  return { error: null, price }
}

// Si el producto carga stock por combinación exacta (variant_stock no vacío),
// resuelve a qué celda de esa matriz corresponde el color+tono/medida
// elegidos — '_' es el comodín para la dimensión que el producto no usa.
// Devuelve null si el producto no usa stock por variante (ese item sigue
// reservando contra el `stock` plano de siempre, sin cambios). Si el
// producto sí lo usa pero la combinación pedida no es una celda cargada,
// devuelve error 'invalid_variant'.
export function resolveVariantStockPath(product, selectedColor, selectedSize, selectedTone) {
  const normalizedRules = Array.isArray(product?.variant_rules) ? product.variant_rules : []
  const stockRule = resolveVariantRule(normalizedRules, {
    color: selectedColor, size: selectedSize, tone: selectedTone,
  }, 'stock')
  if (stockRule?.error) return { error: 'invalid_variant' }
  if (stockRule) return { error: null, variantRuleId: stockRule.id }
  if (normalizedRules.length) return { error: 'invalid_variant' }
  const variantStock = product?.variant_stock
  const colorKeys = variantStock && typeof variantStock === 'object' ? Object.keys(variantStock) : []
  if (!colorKeys.length) return null

  const targetRowKey = combineVariantRowKey(selectedColor, selectedTone)
  const colorKey = colorKeys.find(key =>
    String(key).localeCompare(targetRowKey, 'es-AR', { sensitivity: 'base' }) === 0
  )
  if (!colorKey) return { error: 'invalid_variant' }

  const sizeMap = variantStock[colorKey]
  const sizeKeys = sizeMap && typeof sizeMap === 'object' ? Object.keys(sizeMap) : []
  const sizeKey = sizeKeys.find(key =>
    key === '_' ? !selectedSize : String(key).localeCompare(String(selectedSize || ''), 'es-AR', { sensitivity: 'base' }) === 0
  )
  if (!sizeKey) return { error: 'invalid_variant' }

  return { error: null, colorKey, sizeKey }
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
    const shippingService = String(customer?.shippingService || 'clasico').toLowerCase()
    let customerEmail   = normalizeEmail(customer?.email)
    let orderUserId     = req.userId || null

    const customerDni = String(customer?.dni || '').replace(/\D/g, '')
    const billingSameAsShipping = deliveryType === 'delivery' && customer?.billingSameAsShipping !== false

    if (!isValidEmail(customerEmail) || !customer?.nombre || !items?.length) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }
    if (!/^\d{7,8}$/.test(customerDni)) {
      return res.status(400).json({ error: 'Ingresá un DNI válido (7 u 8 números)' })
    }
    if (!['pickup', 'delivery'].includes(deliveryType)) {
      return res.status(400).json({ error: 'Modalidad de entrega inválida' })
    }
    if (paymentMethod !== 'mercadopago') {
      return res.status(400).json({ error: 'Por el momento, Mercado Pago es el único método de pago disponible' })
    }
    if (deliveryType === 'pickup' && !pickupDate) {
      return res.status(400).json({ error: 'Falta la fecha de retiro' })
    }
    if (deliveryType === 'delivery' && !SHIPPING_SERVICES.includes(shippingService)) {
      return res.status(400).json({ error: 'Servicio de envío inválido' })
    }
    if (deliveryType === 'delivery' && (!customer?.direccion?.trim() || !customer?.ciudad?.trim() || !customer?.provincia?.trim())) {
      return res.status(400).json({ error: 'Completá la dirección de envío' })
    }
    if (!billingSameAsShipping && (
      !customer?.billingAddress?.trim() || !customer?.billingCity?.trim() ||
      !customer?.billingPostalCode?.trim() || !customer?.billingProvince?.trim()
    )) {
      return res.status(400).json({ error: 'Completá la dirección de facturación' })
    }

    if (orderUserId) {
      const { rows: users } = await pool.query(
        'SELECT email FROM users WHERE id = $1',
        [orderUserId]
      )
      if (!users.length) return res.status(401).json({ error: 'Sesión inválida' })
      customerEmail = users[0].email
    } else {
      // Si el email ya pertenece a una cuenta, asociamos el pedido igualmente.
      // El cliente puede comprar como invitado y luego encontrar la compra al
      // iniciar sesión con ese mismo email.
      const existingUser = await pool.query(
        'SELECT id, email FROM users WHERE email = $1 LIMIT 1',
        [customerEmail]
      )
      if (existingUser.rows.length) {
        orderUserId = existingUser.rows[0].id
        customerEmail = existingUser.rows[0].email
      }
    }

    // Precio y stock disponible se recalculan contra la DB — nunca se confía
    // en lo que manda el cliente (podría mandar cualquier item.price).
    const productIds = items.map((i) => i.id)
    const { rows: dbProducts } = await pool.query(
      `SELECT products.id, precio_venta, color_options, size_options, tone_options, variant_stock,
              COALESCE((SELECT usd_ars_rate FROM store_settings WHERE id=1),1510) AS usd_ars_rate,
              COALESCE((SELECT jsonb_agg(to_jsonb(vr)) FROM product_variant_rules vr
                        WHERE vr.product_id=products.id), '[]'::jsonb) AS variant_rules
       FROM products WHERE id = ANY($1::uuid[])`,
      [productIds]
    )
    const productMap = new Map(dbProducts.map((p) => [p.id, p]))

    const itemsSnapshot = []
    for (const i of items) {
      const dbProduct = productMap.get(i.id)
      if (!dbProduct || dbProduct.precio_venta == null) {
        return res.status(400).json({ error: `Producto no disponible: ${i.name || i.id}` })
      }
      const resolvedPrice = resolveProductVariantPrice(dbProduct, i.color, i.size, i.tone)
      if (resolvedPrice.error === 'invalid_color') {
        return res.status(400).json({ error: `Color no disponible para ${i.name || i.id}` })
      }
      if (resolvedPrice.error === 'invalid_tone') {
        return res.status(400).json({ error: `Tono no disponible para ${i.name || i.id}` })
      }
      if (resolvedPrice.error === 'invalid_size') {
        return res.status(400).json({ error: `Medida no disponible para ${i.name || i.id}` })
      }
      if (resolvedPrice.error === 'invalid_variant') {
        return res.status(400).json({ error: `Combinación ambigua o no disponible para ${i.name || i.id}` })
      }
      const variantPath = resolveVariantStockPath(dbProduct, i.color, i.size, i.tone)
      if (variantPath?.error === 'invalid_variant') {
        return res.status(400).json({ error: `Combinación no disponible para ${i.name || i.id}` })
      }

      const price = resolvedPrice.price
      itemsSnapshot.push({
        id:       dbProduct.id,
        name:     i.name,
        category: i.category,
        price,
        quantity: i.quantity,
        subtotal: price * i.quantity,
        image:    i.image || null,
        color:    i.color || null,
        size:     i.size || null,
        tone:     i.tone || null,
        colorKey: variantPath ? variantPath.colorKey : null,
        sizeKey:  variantPath ? variantPath.sizeKey : null,
        variantRuleId: variantPath?.variantRuleId || null,
      })
    }
    const productsTotal = itemsSnapshot.reduce((sum, i) => sum + i.subtotal, 0)

    // Envío: costo por zona + estimación de entrega (Correo Argentino + margen
    // propio de stock). Llamado fuera de la transacción de DB — es red, no
    // debe sostener locks de Postgres.
    let shippingCost = 0
    let estimatedDeliveryDate = null
    if (deliveryType === 'delivery') {
      const quote = await quoteShipping({
        postalCode: customer.codigoPostal,
        service: shippingService,
      })
      if (!quote) {
        return res.status(400).json({ error: 'No pudimos calcular el envío para ese código postal — consultanos por WhatsApp' })
      }
      shippingCost = quote.cost
      const estimate = await estimateDeliveryDate(customer.codigoPostal)
      estimatedDeliveryDate = estimate.estimatedDate
    }

    const total = productsTotal + shippingCost

    let reservationExpiresAt = null
    if (paymentMethod === 'mercadopago') {
      reservationExpiresAt = new Date(Date.now() + PENDING_PAYMENT_EXPIRY_MINUTES * 60 * 1000)
    }

    const initialStatus = 'pending_payment'
    const orderNumber   = generateOrderNumber()

    const client = await pool.connect()
    let order
    try {
      await client.query('BEGIN')
      await reserveStock(client, itemsSnapshot)

      const { rows } = await client.query(
        `INSERT INTO orders
           (order_number, status, customer_name, customer_email, customer_phone,
            delivery_type, address, city, postal_code, total_amount, shipping_cost, shipping_service,
            payment_method, pickup_date, estimated_delivery_date, reservation_expires_at,
            items, user_id, customer_dni, address_extra, province, billing_same_as_shipping,
            billing_address, billing_address_extra, billing_city, billing_postal_code, billing_province)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
                 $19, $20, $21, $22, $23, $24, $25, $26, $27)
         RETURNING *`,
        [
          orderNumber, initialStatus,
          `${customer.nombre} ${customer.apellido}`.trim(),
          customerEmail,
          customer.telefono,
          deliveryType,
          customer.direccion    || null,
          customer.ciudad       || null,
          customer.codigoPostal || null,
          total,
          shippingCost || null,
          deliveryType === 'delivery' ? shippingService : null,
          paymentMethod,
          deliveryType === 'pickup' ? pickupDate : null,
          estimatedDeliveryDate,
          reservationExpiresAt,
          JSON.stringify(itemsSnapshot),
          orderUserId,
          customerDni,
          customer.piso?.trim() || null,
          customer.provincia?.trim() || null,
          billingSameAsShipping,
          billingSameAsShipping ? customer.direccion?.trim() || null : customer.billingAddress?.trim() || null,
          billingSameAsShipping ? customer.piso?.trim() || null : customer.billingAddressExtra?.trim() || null,
          billingSameAsShipping ? customer.ciudad?.trim() || null : customer.billingCity?.trim() || null,
          billingSameAsShipping ? customer.codigoPostal?.trim() || null : customer.billingPostalCode?.trim() || null,
          billingSameAsShipping ? customer.provincia?.trim() || null : customer.billingProvince?.trim() || null,
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
      let preference
      try {
        preference = await createPreference(order)
      } catch (err) {
        await pool.query(
          `UPDATE orders
           SET status = 'payment_failed',
               mp_status = 'preference_creation_failed'
           WHERE id = $1`,
          [order.id]
        )
        await releaseOrderStock(order.id)
        throw err
      }

      const { preferenceId, initPoint, sandboxInitPoint } = preference

      await pool.query(
        'UPDATE orders SET mp_preference_id = $1 WHERE id = $2',
        [preferenceId, order.id]
      )

      // El entorno de pago depende de las credenciales, no de NODE_ENV.
      // Un token APP_USR crea pagos reales aunque el backend se ejecute
      // localmente; un token TEST debe usar siempre el checkout sandbox.
      const usesProductionCredentials = process.env.MP_ACCESS_TOKEN
        ?.trim()
        .startsWith('APP_USR-')
      checkoutUrl = usesProductionCredentials ? initPoint : sandboxInitPoint
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
  address, city, postal_code, total_amount, shipping_cost, shipping_service,
  payment_method, pickup_date, estimated_delivery_date,
  items, created_at, paid_at
`

// POST /api/orders/public/:id/reconcile-payment
// El retorno de Checkout Pro puede llegar antes que el webhook. Usamos el ID
// solo para volver a consultar a Mercado Pago y verificar orden, monto y moneda.
router.post('/public/:id/reconcile-payment', async (req, res) => {
  try {
    const { paymentId } = req.body || {}
    const { order } = await reconcileMercadoPagoPayment({
      paymentId,
      expectedOrderId: req.params.id,
    })

    res.set('Cache-Control', 'no-store')
    res.json({
      id: order.id,
      status: order.status,
      paidAt: order.paid_at,
    })
  } catch (err) {
    if (err instanceof PaymentReconciliationError) {
      return res.status(err.statusCode).json({ error: err.message })
    }
    console.error('[POST /api/orders/public/:id/reconcile-payment]', err)
    res.status(502).json({ error: 'No pudimos verificar el pago con Mercado Pago' })
  }
})

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

// Detalle privado de un pedido perteneciente a la cuenta autenticada.
router.get('/mine/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, order_number, status, customer_name, customer_email, customer_phone, customer_dni,
              delivery_type, address, address_extra, city, province, postal_code,
              billing_same_as_shipping, billing_address, billing_address_extra,
              billing_city, billing_province, billing_postal_code,
              total_amount, shipping_cost, shipping_service, payment_method,
              pickup_date, estimated_delivery_date, items, created_at, paid_at
       FROM orders WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    )
    if (!rows.length) return res.status(404).json({ error: 'Pedido no encontrado' })
    res.set('Cache-Control', 'no-store')
    res.json(rows[0])
  } catch (err) {
    console.error('[GET /api/orders/mine/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders  (admin)
// Query params: ?status=paid&search=email&page=1&limit=50
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50, all = 'false' } = req.query
    const fetchAll = all === 'true'
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

    const pagination = fetchAll ? '' : `LIMIT $${idx} OFFSET $${idx + 1}`
    const dataParams = fetchAll ? params : [...params, Number(limit), offset]

    const [data, countResult] = await Promise.all([
      pool.query(
        `SELECT id, order_number, status, customer_name, customer_email, customer_phone,
                delivery_type, address, city, postal_code, total_amount, shipping_cost, shipping_service,
                payment_method, pickup_date, estimated_delivery_date, items,
                created_at, updated_at, paid_at, mp_payment_id
         FROM orders ${where}
         ORDER BY created_at DESC
         ${pagination}`,
        dataParams
      ),
      pool.query(`SELECT COUNT(*) FROM orders ${where}`, params),
    ])

    res.json({
      orders: data.rows,
      total:  Number(countResult.rows[0].count),
      page:   Number(page),
      limit:  fetchAll ? data.rows.length : Number(limit),
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
           paid_at = CASE
             WHEN $3 IN ('paid', 'preparing', 'shipped', 'delivered') AND paid_at IS NULL THEN NOW()
             ELSE paid_at
           END
       WHERE id = $2 RETURNING *`,
      [status, req.params.id, status]
    )
    if (!rows.length) return res.status(404).json({ error: 'Pedido no encontrado' })

    if (RELEASES_STOCK.includes(status)) {
      await releaseOrderStock(req.params.id)
    }
    if (status === 'delivered') {
      await sendReviewInvitationForOrder(req.params.id)
    }
    if (status === 'paid' || status === 'reserved') {
      await sendOrderConfirmationNotifications(req.params.id)
    }

    res.json(rows[0])
  } catch (err) {
    console.error('[PATCH /api/orders/:id/status]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
