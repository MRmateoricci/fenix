import { Router } from 'express'
import { pool } from '../../db/pool.js'
import { requirePosAuth, requirePosRole } from '../../middleware/posAuth.js'

const router = Router()
// Todo el módulo de proveedores es admin-only: es la cuenta corriente y la
// plata real que Fara le debe a cada uno, no una tarea de mostrador.
router.use(requirePosAuth, requirePosRole('admin'))

const roundMoney = value => Math.round(Number(value) * 100) / 100

function toPublicSupplier(row) {
  return {
    id: row.id,
    name: row.name,
    legalName: row.legal_name,
    cuit: row.cuit,
    phone: row.phone,
    email: row.email,
    contactName: row.contact_name,
    notes: row.notes,
    active: row.active,
    createdAt: row.created_at,
    totalPurchases: row.total_purchases != null ? Number(row.total_purchases) : undefined,
    totalPayments: row.total_payments != null ? Number(row.total_payments) : undefined,
    balance: row.balance != null ? Number(row.balance) : undefined,
  }
}

// GET /api/pos/suppliers — lista con saldo actual, búsqueda por nombre.
router.get('/', async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query
    const conditions = ['active = TRUE']
    const params = []
    let idx = 1

    const term = String(search || '').trim()
    if (term) {
      conditions.push(`name ILIKE $${idx++}`)
      params.push(`%${term}%`)
    }
    const where = `WHERE ${conditions.join(' AND ')}`

    const cappedLimit = Math.min(Number(limit) || 50, 200)
    const currentPage = Math.max(1, Number(page) || 1)
    const offset = (currentPage - 1) * cappedLimit

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(
        `SELECT s.*,
                COALESCE((SELECT SUM(total) FROM pos_purchases WHERE supplier_id = s.id), 0)::numeric AS total_purchases,
                COALESCE((SELECT SUM(amount) FROM pos_supplier_payments WHERE supplier_id = s.id), 0)::numeric AS total_payments
         FROM pos_suppliers s
         ${where}
         ORDER BY s.name
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, cappedLimit, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM pos_suppliers ${where}`, params),
    ])

    res.json({
      suppliers: rows.map(row => toPublicSupplier({ ...row, balance: Number(row.total_purchases) - Number(row.total_payments) })),
      total: Number(countRows[0].count),
      page: currentPage,
      limit: cappedLimit,
    })
  } catch (err) {
    console.error('[GET /api/pos/suppliers]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// GET /api/pos/suppliers/summary — para el panel de arriba de la lista.
router.get('/summary', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.name,
              COALESCE(p.total_purchases, 0) - COALESCE(pay.total_payments, 0) AS balance
       FROM pos_suppliers s
       LEFT JOIN (SELECT supplier_id, SUM(total) AS total_purchases FROM pos_purchases GROUP BY supplier_id) p
         ON p.supplier_id = s.id
       LEFT JOIN (SELECT supplier_id, SUM(amount) AS total_payments FROM pos_supplier_payments GROUP BY supplier_id) pay
         ON pay.supplier_id = s.id
       WHERE s.active = TRUE`
    )
    const withDebt = rows.filter(r => Number(r.balance) > 0.01)
    const totalDebt = roundMoney(withDebt.reduce((sum, r) => sum + Number(r.balance), 0))
    const top5 = [...withDebt]
      .sort((a, b) => Number(b.balance) - Number(a.balance))
      .slice(0, 5)
      .map(r => ({ id: r.id, name: r.name, balance: Number(r.balance) }))

    res.json({ totalDebt, suppliersWithDebtCount: withDebt.length, top5 })
  } catch (err) {
    console.error('[GET /api/pos/suppliers/summary]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.post('/', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim()
    if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' })

    const { rows } = await pool.query(
      `INSERT INTO pos_suppliers (name, legal_name, cuit, phone, email, contact_name, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        name,
        req.body?.legalName?.trim() || null,
        req.body?.cuit?.trim() || null,
        req.body?.phone?.trim() || null,
        req.body?.email?.trim() || null,
        req.body?.contactName?.trim() || null,
        req.body?.notes?.trim() || null,
      ]
    )
    res.status(201).json({ supplier: toPublicSupplier(rows[0]) })
  } catch (err) {
    console.error('[POST /api/pos/suppliers]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const fields = []
    const params = []
    let idx = 1
    const map = {
      name: 'name', legalName: 'legal_name', cuit: 'cuit', phone: 'phone',
      email: 'email', contactName: 'contact_name', notes: 'notes',
    }
    for (const [key, column] of Object.entries(map)) {
      if (key in (req.body || {})) {
        fields.push(`${column} = $${idx++}`)
        params.push(typeof req.body[key] === 'string' ? req.body[key].trim() || null : req.body[key])
      }
    }
    if ('active' in (req.body || {})) {
      fields.push(`active = $${idx++}`)
      params.push(Boolean(req.body.active))
    }
    if (!fields.length) return res.status(400).json({ error: 'No hay cambios para aplicar' })
    if ('name' in (req.body || {}) && !String(req.body.name || '').trim()) {
      return res.status(400).json({ error: 'El nombre es obligatorio' })
    }

    params.push(req.params.id)
    const { rows } = await pool.query(
      `UPDATE pos_suppliers SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    )
    if (!rows.length) return res.status(404).json({ error: 'Proveedor no encontrado' })
    res.json({ supplier: toPublicSupplier(rows[0]) })
  } catch (err) {
    console.error('[PUT /api/pos/suppliers/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE pos_suppliers SET active = FALSE WHERE id = $1 RETURNING *`,
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Proveedor no encontrado' })
    res.json({ supplier: toPublicSupplier(rows[0]) })
  } catch (err) {
    console.error('[DELETE /api/pos/suppliers/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// Balance textual de la consigna (A5), reusado por GET /:id y GET /:id/balance.
async function fetchBalance(supplierId) {
  const { rows } = await pool.query(
    `SELECT
       COALESCE((SELECT SUM(total) FROM pos_purchases WHERE supplier_id = $1), 0)::numeric AS total_purchases,
       COALESCE((SELECT SUM(amount) FROM pos_supplier_payments WHERE supplier_id = $1), 0)::numeric AS total_payments`,
    [supplierId]
  )
  const totalPurchases = Number(rows[0].total_purchases)
  const totalPayments = Number(rows[0].total_payments)
  return { totalPurchases, totalPayments, balance: roundMoney(totalPurchases - totalPayments) }
}

router.get('/:id/balance', async (req, res) => {
  try {
    res.json(await fetchBalance(req.params.id))
  } catch (err) {
    console.error('[GET /api/pos/suppliers/:id/balance]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM pos_suppliers WHERE id = $1`, [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Proveedor no encontrado' })
    const balance = await fetchBalance(req.params.id)
    res.json({ supplier: toPublicSupplier({ ...rows[0], total_purchases: balance.totalPurchases, total_payments: balance.totalPayments, balance: balance.balance }) })
  } catch (err) {
    console.error('[GET /api/pos/suppliers/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// GET /api/pos/suppliers/:id/movements — compras y pagos intercalados por
// fecha, con saldo acumulado. El saldo se calcula con una window function
// sobre TODO el historial (nunca solo la página pedida): si no, el saldo
// acumulado de la página 2 en adelante empezaría de cero y quedaría mal.
router.get('/:id/movements', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query
    const cappedLimit = Math.min(Number(limit) || 50, 200)
    const currentPage = Math.max(1, Number(page) || 1)
    const offset = (currentPage - 1) * cappedLimit

    const { rows: countRows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM pos_purchases WHERE supplier_id = $1) +
         (SELECT COUNT(*) FROM pos_supplier_payments WHERE supplier_id = $1) AS count`,
      [req.params.id]
    )

    const { rows } = await pool.query(
      `WITH movements AS (
         SELECT id, 'purchase' AS kind, created_at::date AS event_date, created_at AS event_at,
                total AS debe, 0::numeric AS haber,
                CASE WHEN has_invoice THEN 'Factura ' || COALESCE(invoice_type, '') || ' ' || COALESCE(invoice_number, '')
                     ELSE 'Sin factura' END AS detail
         FROM pos_purchases WHERE supplier_id = $1
         UNION ALL
         SELECT id, 'payment' AS kind, date AS event_date, created_at AS event_at,
                0::numeric AS debe, amount AS haber,
                INITCAP(method) || COALESCE(' — ' || NULLIF(reference, ''), '') AS detail
         FROM pos_supplier_payments WHERE supplier_id = $1
       )
       SELECT *, SUM(debe - haber) OVER (ORDER BY event_date, event_at, id) AS running_balance
       FROM movements
       ORDER BY event_date DESC, event_at DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [req.params.id, cappedLimit, offset]
    )

    res.json({
      movements: rows.map(row => ({
        id: row.id,
        kind: row.kind,
        date: row.event_date,
        detail: row.detail,
        debe: Number(row.debe),
        haber: Number(row.haber),
        runningBalance: Number(row.running_balance),
      })),
      total: Number(countRows[0].count),
      page: currentPage,
      limit: cappedLimit,
    })
  } catch (err) {
    console.error('[GET /api/pos/suppliers/:id/movements]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
