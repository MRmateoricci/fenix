import { Router } from 'express'
import { pool } from '../../db/pool.js'
import { requirePosAuth, requirePosRole } from '../../middleware/posAuth.js'

const router = Router()
router.use(requirePosAuth, requirePosRole('admin'))

const INVOICE_TYPES = ['A', 'B', 'C']
const roundMoney = value => Math.round(Number(value) * 100) / 100

function toPublicPurchase(row) {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    userName: row.user_name,
    hasInvoice: row.has_invoice,
    invoiceType: row.invoice_type,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    netAmount: row.net_amount != null ? Number(row.net_amount) : null,
    vat21: row.vat_21 != null ? Number(row.vat_21) : null,
    vat105: row.vat_10_5 != null ? Number(row.vat_10_5) : null,
    perceptions: row.perceptions != null ? Number(row.perceptions) : null,
    total: Number(row.total),
    notes: row.notes,
    createdAt: row.created_at,
  }
}

// POST /api/pos/purchases — registra la compra y, si trae ítems con
// product_id, suma stock. El UPDATE toca `stock` y por lo tanto `updated_at`
// (vía el trigger existente), así que el cache del POS lo levanta solo en el
// próximo ciclo de /catalog/updated — no hace falta nada especial acá.
router.post('/', async (req, res) => {
  const supplierId = req.body?.supplierId
  const hasInvoice = Boolean(req.body?.hasInvoice)
  const total = Number(req.body?.total)
  const rawItems = Array.isArray(req.body?.items) ? req.body.items : []

  if (!supplierId) return res.status(400).json({ error: 'Falta el proveedor' })
  if (!Number.isFinite(total) || total < 0) return res.status(400).json({ error: 'El total tiene que ser un monto válido' })

  let invoiceType = null
  if (hasInvoice) {
    invoiceType = req.body?.invoiceType || null
    if (invoiceType && !INVOICE_TYPES.includes(invoiceType)) {
      return res.status(400).json({ error: 'Tipo de factura inválido' })
    }
  } else if (req.body?.invoiceType) {
    return res.status(400).json({ error: 'No puede haber tipo de factura sin factura' })
  }

  for (const item of rawItems) {
    if (!item?.productName || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      return res.status(400).json({ error: 'Hay un ítem de la compra inválido' })
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: supplierRows } = await client.query(
      `SELECT id FROM pos_suppliers WHERE id = $1 AND active = TRUE`,
      [supplierId]
    )
    if (!supplierRows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Proveedor no encontrado' })
    }

    const productIds = [...new Set(rawItems.map(i => i.productId).filter(Boolean))]
    let productMap = new Map()
    if (productIds.length) {
      const { rows: products } = await client.query(`SELECT id FROM products WHERE id = ANY($1::uuid[])`, [productIds])
      productMap = new Map(products.map(p => [p.id, p]))
      for (const id of productIds) {
        if (!productMap.has(id)) {
          await client.query('ROLLBACK')
          return res.status(409).json({ error: `Un producto de la compra ya no existe en el catálogo (${id})` })
        }
      }
    }

    const { rows: purchaseRows } = await client.query(
      `INSERT INTO pos_purchases
         (supplier_id, user_id, has_invoice, invoice_type, invoice_number, invoice_date,
          net_amount, vat_21, vat_10_5, perceptions, total, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, created_at`,
      [
        supplierId, req.posUser.id, hasInvoice, invoiceType,
        hasInvoice ? req.body?.invoiceNumber?.trim() || null : null,
        hasInvoice ? req.body?.invoiceDate || null : null,
        hasInvoice && req.body?.netAmount != null ? roundMoney(req.body.netAmount) : null,
        hasInvoice && req.body?.vat21 != null ? roundMoney(req.body.vat21) : null,
        hasInvoice && req.body?.vat105 != null ? roundMoney(req.body.vat105) : null,
        hasInvoice && req.body?.perceptions != null ? roundMoney(req.body.perceptions) : null,
        roundMoney(total),
        req.body?.notes?.trim() || null,
      ]
    )
    const purchase = purchaseRows[0]

    for (const item of rawItems) {
      await client.query(
        `INSERT INTO pos_purchase_items (purchase_id, product_id, product_name, quantity, unit_cost, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          purchase.id, item.productId || null, String(item.productName).trim(), item.quantity,
          item.unitCost != null ? roundMoney(item.unitCost) : null,
          item.lineTotal != null ? roundMoney(item.lineTotal) : null,
        ]
      )
      if (item.productId) {
        await client.query(
          `UPDATE products SET stock = stock + $1, stock_updated_at = NOW() WHERE id = $2`,
          [item.quantity, item.productId]
        )
      }
    }

    await client.query('COMMIT')
    res.status(201).json({ purchase: { id: purchase.id, createdAt: purchase.created_at, total: roundMoney(total) } })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[POST /api/pos/purchases]', err)
    res.status(500).json({ error: 'Error interno' })
  } finally {
    client.release()
  }
})

router.get('/', async (req, res) => {
  try {
    const { supplierId, date, hasInvoice, page = 1, limit = 50 } = req.query
    const conditions = []
    const params = []
    let idx = 1

    if (supplierId) { conditions.push(`pp.supplier_id = $${idx++}`); params.push(supplierId) }
    if (date) { conditions.push(`pp.created_at::date = $${idx++}::date`); params.push(date) }
    if (hasInvoice === 'true' || hasInvoice === 'false') {
      conditions.push(`pp.has_invoice = $${idx++}`)
      params.push(hasInvoice === 'true')
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const cappedLimit = Math.min(Number(limit) || 50, 200)
    const currentPage = Math.max(1, Number(page) || 1)
    const offset = (currentPage - 1) * cappedLimit

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(
        `SELECT pp.*, ps.name AS supplier_name, pu.name AS user_name
         FROM pos_purchases pp
         JOIN pos_suppliers ps ON ps.id = pp.supplier_id
         JOIN pos_users pu ON pu.id = pp.user_id
         ${where}
         ORDER BY pp.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, cappedLimit, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM pos_purchases pp ${where}`, params),
    ])

    res.json({
      purchases: rows.map(toPublicPurchase),
      total: Number(countRows[0].count),
      page: currentPage,
      limit: cappedLimit,
    })
  } catch (err) {
    console.error('[GET /api/pos/purchases]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const [{ rows: purchaseRows }, { rows: itemRows }] = await Promise.all([
      pool.query(
        `SELECT pp.*, ps.name AS supplier_name, pu.name AS user_name
         FROM pos_purchases pp
         JOIN pos_suppliers ps ON ps.id = pp.supplier_id
         JOIN pos_users pu ON pu.id = pp.user_id
         WHERE pp.id = $1`,
        [req.params.id]
      ),
      pool.query(`SELECT * FROM pos_purchase_items WHERE purchase_id = $1 ORDER BY id`, [req.params.id]),
    ])
    if (!purchaseRows.length) return res.status(404).json({ error: 'Compra no encontrada' })

    res.json({
      purchase: {
        ...toPublicPurchase(purchaseRows[0]),
        items: itemRows.map(item => ({
          id: item.id,
          productId: item.product_id,
          productName: item.product_name,
          quantity: item.quantity,
          unitCost: item.unit_cost != null ? Number(item.unit_cost) : null,
          lineTotal: item.line_total != null ? Number(item.line_total) : null,
        })),
      },
    })
  } catch (err) {
    console.error('[GET /api/pos/purchases/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
