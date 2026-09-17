import { Router } from 'express'
import { pool } from '../../db/pool.js'
import { requirePosAuth, requirePosRole } from '../../middleware/posAuth.js'

const router = Router()
router.use(requirePosAuth, requirePosRole('admin'))

const METHODS = ['efectivo', 'transferencia', 'cheque', 'otro']
const roundMoney = value => Math.round(Number(value) * 100) / 100

function toPublicPayment(row) {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    userName: row.user_name,
    amount: Number(row.amount),
    method: row.method,
    reference: row.reference,
    date: row.date,
    notes: row.notes,
    createdAt: row.created_at,
  }
}

router.post('/', async (req, res) => {
  try {
    const supplierId = req.body?.supplierId
    const amount = Number(req.body?.amount)
    const method = req.body?.method

    if (!supplierId) return res.status(400).json({ error: 'Falta el proveedor' })
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'El monto tiene que ser mayor a cero' })
    if (!METHODS.includes(method)) return res.status(400).json({ error: 'Medio de pago inválido' })

    const { rows: supplierRows } = await pool.query(
      `SELECT id FROM pos_suppliers WHERE id = $1 AND active = TRUE`,
      [supplierId]
    )
    if (!supplierRows.length) return res.status(404).json({ error: 'Proveedor no encontrado' })

    const { rows } = await pool.query(
      `INSERT INTO pos_supplier_payments (supplier_id, user_id, amount, method, reference, date, notes)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, CURRENT_DATE), $7)
       RETURNING id, created_at, date`,
      [
        supplierId, req.posUser.id, roundMoney(amount), method,
        req.body?.reference?.trim() || null,
        req.body?.date || null,
        req.body?.notes?.trim() || null,
      ]
    )
    res.status(201).json({ payment: { id: rows[0].id, createdAt: rows[0].created_at, date: rows[0].date, amount: roundMoney(amount) } })
  } catch (err) {
    console.error('[POST /api/pos/supplier-payments]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.get('/', async (req, res) => {
  try {
    const { supplierId, date, page = 1, limit = 50 } = req.query
    const conditions = []
    const params = []
    let idx = 1

    if (supplierId) { conditions.push(`psp.supplier_id = $${idx++}`); params.push(supplierId) }
    if (date) { conditions.push(`psp.date = $${idx++}::date`); params.push(date) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const cappedLimit = Math.min(Number(limit) || 50, 200)
    const currentPage = Math.max(1, Number(page) || 1)
    const offset = (currentPage - 1) * cappedLimit

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(
        `SELECT psp.*, ps.name AS supplier_name, pu.name AS user_name
         FROM pos_supplier_payments psp
         JOIN pos_suppliers ps ON ps.id = psp.supplier_id
         JOIN pos_users pu ON pu.id = psp.user_id
         ${where}
         ORDER BY psp.date DESC, psp.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, cappedLimit, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM pos_supplier_payments psp ${where}`, params),
    ])

    res.json({
      payments: rows.map(toPublicPayment),
      total: Number(countRows[0].count),
      page: currentPage,
      limit: cappedLimit,
    })
  } catch (err) {
    console.error('[GET /api/pos/supplier-payments]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
