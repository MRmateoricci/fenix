import { Router } from 'express'
import { pool } from '../../db/pool.js'
import { requirePosAuth } from '../../middleware/posAuth.js'
import { resolvePublicPrice } from '../../services/publicPricing.js'
import { applySaleDecrement } from '../../services/productsRepo.js'
import { createInvoiceForPosSale, publicPosInvoice } from '../../services/invoicePosFiscal.js'

const router = Router()
router.use(requirePosAuth)

// Mismo criterio de "día calendario" que la analítica de visitas: Postgres
// guarda todo en UTC, pero "ventas de hoy" tiene que cortar a medianoche de
// Argentina, no de UTC.
const TZ = 'America/Argentina/Buenos_Aires'
const PAYMENT_METHODS = ['efectivo', 'debito', 'credito', 'transferencia', 'qr']
const roundMoney = value => Math.round(Number(value) * 100) / 100

function resolveItemPrice(product, variant) {
  const usdArsRate = Number(product.price_exchange_rate) || 1510
  if (variant) {
    return resolvePublicPrice({
      priceWithTax: variant.precio_iva ?? product.precio_iva,
      priceWithTaxUsd: variant.precio_iva_usd ?? product.precio_iva_usd,
      price: variant.precio_venta ?? product.precio_venta,
      priceUsd: variant.precio_venta_usd ?? product.precio_venta_usd,
      currency: variant.price_currency || product.price_currency,
      usdArsRate,
    })
  }
  return resolvePublicPrice({
    priceWithTax: product.precio_iva,
    priceWithTaxUsd: product.precio_iva_usd,
    price: product.precio_venta,
    priceUsd: product.precio_venta_usd,
    currency: product.price_currency,
    usdArsRate,
  })
}

// POST /api/pos/sales — crea el ticket completo (ítems + pagos) en una sola
// transacción. Los precios SIEMPRE se recalculan acá con el dato fresco de la
// base (nunca se confía en lo que mande el navegador, ver CLAUDE.md 4.1): el
// cache local del POS puede tener hasta 2-3 minutos de desactualización.
router.post('/', async (req, res) => {
  const rawItems = Array.isArray(req.body?.items) ? req.body.items : []
  const rawPayments = Array.isArray(req.body?.payments) ? req.body.payments : []
  const notes = req.body?.notes ? String(req.body.notes).slice(0, 2000) : null
  const isInvoiced = Boolean(req.body?.isInvoiced)

  if (!rawItems.length) return res.status(400).json({ error: 'La venta no tiene productos' })
  for (const item of rawItems) {
    if (!item?.productId || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      return res.status(400).json({ error: 'Hay un ítem inválido en la venta' })
    }
  }
  if (!rawPayments.length) return res.status(400).json({ error: 'La venta no tiene medio de pago' })
  for (const payment of rawPayments) {
    if (!PAYMENT_METHODS.includes(payment?.method) || !(Number(payment?.amount) > 0)) {
      return res.status(400).json({ error: 'Hay un medio de pago inválido' })
    }
  }

  // El descuento se manda de una sola forma por vez: porcentaje (botón
  // "descuento efectivo" o manual en %) o monto fijo (manual en $). Cuando es
  // por monto, discount_percent queda NULL en la base — es solo un dato de
  // registro, no hace falta reconstruirlo.
  const discountPercent = req.body?.discountPercent != null ? Number(req.body.discountPercent) : null
  const fixedDiscountAmount = req.body?.discountAmount != null ? Number(req.body.discountAmount) : null
  if (discountPercent != null && fixedDiscountAmount != null) {
    return res.status(400).json({ error: 'El descuento no puede ser por porcentaje y por monto a la vez' })
  }
  if (discountPercent != null && (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent >= 100)) {
    return res.status(400).json({ error: 'Descuento inválido' })
  }
  if (fixedDiscountAmount != null && (!Number.isFinite(fixedDiscountAmount) || fixedDiscountAmount < 0)) {
    return res.status(400).json({ error: 'Descuento inválido' })
  }

  // Recargo por cuotas con tarjeta: excluyente con el descuento (una venta no
  // puede tener las dos manijas de precio tironeando a la vez) y siempre viene
  // con la cantidad de cuotas — incluso a 0% de recargo (ej. "1 pago") — para
  // que el historial pueda mostrar en cuántas cuotas se vendió.
  const surchargePercent = req.body?.surchargePercent != null ? Number(req.body.surchargePercent) : null
  const installments = req.body?.installments != null ? Number(req.body.installments) : null
  if (surchargePercent != null && (discountPercent != null || fixedDiscountAmount != null)) {
    return res.status(400).json({ error: 'La venta no puede tener descuento y recargo por cuotas a la vez' })
  }
  if (surchargePercent != null && (!Number.isFinite(surchargePercent) || surchargePercent < 0 || surchargePercent >= 100)) {
    return res.status(400).json({ error: 'Recargo inválido' })
  }
  if (surchargePercent != null && (!Number.isInteger(installments) || installments < 1 || installments > 60)) {
    return res.status(400).json({ error: 'Cantidad de cuotas inválida' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // La caja la resuelve el servidor, nunca el cliente (Fase 2): sin caja
    // abierta no se puede vender. Se lee dentro de la misma transacción para
    // no dejar una ventana entre "hay caja abierta" y el INSERT de la venta.
    const { rows: openRegisterRows } = await client.query(
      `SELECT id FROM pos_cash_registers WHERE status = 'open' LIMIT 1`
    )
    const cashRegisterId = openRegisterRows[0]?.id
    if (!cashRegisterId) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'No hay una caja abierta. Abrí la caja antes de vender.' })
    }

    const productIds = [...new Set(rawItems.map(item => item.productId))]
    const { rows: products } = await client.query(
      `SELECT id, codigo, name, descripcion, stock,
              precio_venta, precio_venta_usd, precio_iva, precio_iva_usd,
              price_currency, price_exchange_rate
       FROM products WHERE id = ANY($1::uuid[])`,
      [productIds]
    )
    const productMap = new Map(products.map(p => [p.id, p]))

    const variantIds = [...new Set(rawItems.map(item => item.variantId).filter(Boolean))]
    let variantMap = new Map()
    if (variantIds.length) {
      const { rows: variants } = await client.query(
        `SELECT id, product_id, color_name, size_label, tone_name, stock,
                precio_venta, precio_venta_usd, precio_iva, precio_iva_usd, price_currency
         FROM product_variant_rules WHERE id = ANY($1::uuid[])`,
        [variantIds]
      )
      variantMap = new Map(variants.map(v => [v.id, v]))
    }

    const items = []
    const lowStockItems = []
    for (const raw of rawItems) {
      const product = productMap.get(raw.productId)
      if (!product) {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: `Un producto ya no existe en el catálogo (${raw.productId})` })
      }
      const variant = raw.variantId ? variantMap.get(raw.variantId) : null
      if (raw.variantId && (!variant || variant.product_id !== product.id)) {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: `La variante elegida ya no existe para ${product.codigo}` })
      }

      const unitPrice = resolveItemPrice(product, variant)
      if (unitPrice == null) {
        await client.query('ROLLBACK')
        return res.status(409).json({
          error: `${product.codigo} no tiene precio cargado — cargale un precio desde el panel antes de venderlo`,
        })
      }
      const availableStock = variant?.stock != null ? Number(variant.stock) : Number(product.stock) || 0
      if (availableStock < raw.quantity) lowStockItems.push({ productId: product.id, codigo: product.codigo, available: availableStock })

      items.push({
        productId: product.id,
        variantId: variant?.id || null,
        productName: [product.name, product.descripcion, product.codigo].map(v => String(v || '').trim()).find(Boolean),
        productCode: product.codigo,
        unitPrice,
        quantity: raw.quantity,
        lineTotal: roundMoney(unitPrice * raw.quantity),
      })
    }

    const subtotal = roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0))
    const discountAmount = roundMoney(
      discountPercent != null ? subtotal * discountPercent / 100 : fixedDiscountAmount || 0
    )
    if (discountAmount > subtotal) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'El descuento no puede superar el subtotal' })
    }
    const surchargeAmount = roundMoney(surchargePercent != null ? subtotal * surchargePercent / 100 : 0)
    const total = roundMoney(subtotal - discountAmount + surchargeAmount)

    const paymentsTotal = roundMoney(rawPayments.reduce((sum, p) => sum + Number(p.amount), 0))
    if (Math.abs(paymentsTotal - total) > 0.01) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: `Los pagos suman $${paymentsTotal} pero el total es $${total}` })
    }

    const { rows: saleRows } = await client.query(
      `INSERT INTO pos_sales
         (user_id, subtotal, discount_amount, discount_percent, surcharge_amount, surcharge_percent, installments, total, is_invoiced, notes, cash_register_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, sale_number, created_at`,
      [req.posUser.id, subtotal, discountAmount, discountPercent, surchargeAmount, surchargePercent, installments, total, isInvoiced, notes, cashRegisterId]
    )
    const sale = saleRows[0]

    for (const item of items) {
      await client.query(
        `INSERT INTO pos_sale_items
           (sale_id, product_id, variant_id, product_name, product_code, unit_price, quantity, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [sale.id, item.productId, item.variantId, item.productName, item.productCode, item.unitPrice, item.quantity, item.lineTotal]
      )
    }

    for (const payment of rawPayments) {
      await client.query(
        `INSERT INTO pos_sale_payments (sale_id, method, amount) VALUES ($1, $2, $3)`,
        [sale.id, payment.method, roundMoney(payment.amount)]
      )
    }

    // Descuento de stock: no bloqueante a propósito (ver CLAUDE.md 4.4). Reusa
    // el mismo mecanismo que ya usa la importación de reportes de venta del
    // admin (services/productsRepo.js) en vez del reserveStock de
    // stockReservation.js, que sí bloquea sin stock suficiente — justo lo que
    // el POS no debe hacer — y está pensado para pedidos online cancelables,
    // no para una venta de mostrador inmediata y final. Solo toca el stock
    // agregado del producto: el de cada variante tiene un CHECK >= 0 en la
    // base y acá se muestra a modo informativo, no se escribe.
    await applySaleDecrement(client, items.map(item => ({ codigo: item.productCode, cantidad: item.quantity })))

    await client.query('COMMIT')

    // La factura se intenta DESPUÉS de confirmar la venta, nunca dentro de la
    // misma transacción — ARCA es una llamada de red lenta a un servidor de
    // terceros, y el stock ya se descontó. Mismo criterio que ya usa el
    // webhook de Mercado Pago (services/mercadopagoPayments.js): si ARCA
    // falla, la venta queda igual registrada, sin factura, para reintentar
    // después (ver A5 del pedido — Fase 5).
    let invoice = null
    let invoiceError = null
    if (isInvoiced) {
      try {
        const result = await createInvoiceForPosSale(sale.id, {
          name: req.body?.customerName,
          docType: req.body?.customerDocType,
          docNumber: req.body?.customerDocNumber,
          vatConditionId: req.body?.vatConditionId,
        })
        invoice = publicPosInvoice(result.invoice)
      } catch (err) {
        console.error('[POST /api/pos/sales] factura', err.code || err.name, err.message)
        invoiceError = { error: err.message || 'No se pudo emitir la factura', code: err.code || 'INVOICE_ERROR' }
      }
    }

    res.status(201).json({
      sale: {
        id: sale.id, saleNumber: sale.sale_number, subtotal, discountAmount, surchargeAmount, installments, total,
        createdAt: sale.created_at,
      },
      lowStockItems,
      invoice,
      invoiceError,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[POST /api/pos/sales]', err)
    res.status(500).json({ error: 'Error interno' })
  } finally {
    client.release()
  }
})

router.get('/', async (req, res) => {
  try {
    const { date, userId, isInvoiced, page = 1, limit = 50 } = req.query
    const conditions = []
    const params = []
    let idx = 1

    if (date) {
      conditions.push(`(pos_sales.created_at AT TIME ZONE '${TZ}')::date = $${idx++}::date`)
      params.push(date)
    }
    if (userId) {
      conditions.push(`pos_sales.user_id = $${idx++}`)
      params.push(userId)
    }
    if (isInvoiced === 'true' || isInvoiced === 'false') {
      conditions.push(`pos_sales.is_invoiced = $${idx++}`)
      params.push(isInvoiced === 'true')
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const cappedLimit = Math.min(Number(limit) || 50, 200)
    const currentPage = Math.max(1, Number(page) || 1)
    const offset = (currentPage - 1) * cappedLimit

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(
        `SELECT pos_sales.*, pos_users.name AS user_name
         FROM pos_sales
         JOIN pos_users ON pos_users.id = pos_sales.user_id
         ${where}
         ORDER BY pos_sales.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, cappedLimit, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM pos_sales ${where}`, params),
    ])

    res.json({
      sales: rows.map(row => ({
        id: row.id,
        saleNumber: row.sale_number,
        userName: row.user_name,
        subtotal: Number(row.subtotal),
        discountAmount: Number(row.discount_amount),
        surchargeAmount: Number(row.surcharge_amount || 0),
        installments: row.installments,
        total: Number(row.total),
        isInvoiced: row.is_invoiced,
        createdAt: row.created_at,
      })),
      total: Number(countRows[0].count),
      page: currentPage,
      limit: cappedLimit,
    })
  } catch (err) {
    console.error('[GET /api/pos/sales]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const [{ rows: saleRows }, { rows: itemRows }, { rows: paymentRows }, { rows: invoiceRows }] = await Promise.all([
      pool.query(
        `SELECT pos_sales.*, pos_users.name AS user_name
         FROM pos_sales JOIN pos_users ON pos_users.id = pos_sales.user_id
         WHERE pos_sales.id = $1`,
        [req.params.id]
      ),
      pool.query(`SELECT * FROM pos_sale_items WHERE sale_id = $1 ORDER BY id`, [req.params.id]),
      pool.query(`SELECT * FROM pos_sale_payments WHERE sale_id = $1 ORDER BY id`, [req.params.id]),
      pool.query(`SELECT * FROM invoices WHERE pos_sale_id = $1`, [req.params.id]),
    ])
    if (!saleRows.length) return res.status(404).json({ error: 'Venta no encontrada' })
    const sale = saleRows[0]

    res.json({
      sale: {
        id: sale.id,
        saleNumber: sale.sale_number,
        userName: sale.user_name,
        subtotal: Number(sale.subtotal),
        discountAmount: Number(sale.discount_amount),
        discountPercent: sale.discount_percent != null ? Number(sale.discount_percent) : null,
        surchargeAmount: Number(sale.surcharge_amount || 0),
        surchargePercent: sale.surcharge_percent != null ? Number(sale.surcharge_percent) : null,
        installments: sale.installments,
        total: Number(sale.total),
        isInvoiced: sale.is_invoiced,
        notes: sale.notes,
        createdAt: sale.created_at,
        items: itemRows.map(item => ({
          id: item.id,
          productId: item.product_id,
          variantId: item.variant_id,
          productName: item.product_name,
          productCode: item.product_code,
          unitPrice: Number(item.unit_price),
          quantity: item.quantity,
          lineTotal: Number(item.line_total),
        })),
        payments: paymentRows.map(payment => ({
          id: payment.id,
          method: payment.method,
          amount: Number(payment.amount),
        })),
        invoice: publicPosInvoice(invoiceRows[0] || null),
      },
    })
  } catch (err) {
    console.error('[GET /api/pos/sales/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
