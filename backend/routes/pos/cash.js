import { Router } from 'express'
import { pool } from '../../db/pool.js'
import { requirePosAuth, requirePosRole } from '../../middleware/posAuth.js'

const router = Router()
router.use(requirePosAuth)

const TZ = 'America/Argentina/Buenos_Aires'
const PAYMENT_METHODS = ['efectivo', 'debito', 'credito', 'transferencia', 'qr']
const roundMoney = value => Math.round(Number(value) * 100) / 100

// ── Resumen de una caja (abierta o cerrada) ─────────────────────────────────
// Reusado por GET /current, GET /:id y, tras cerrar, por la respuesta de
// POST /close — las cuatro pantallas del frontend (resumen en vivo, cierre,
// detalle histórico) muestran exactamente el mismo desglose.
async function buildCashRegisterSummary(registerId) {
  const [{ rows: registerRows }, { rows: methodRows }, { rows: salesRows }, { rows: movementRows }, { rows: timelineSales }, { rows: timelineMovements }] =
    await Promise.all([
      pool.query(
        `SELECT cr.*, opener.name AS opened_by_name, closer.name AS closed_by_name
         FROM pos_cash_registers cr
         JOIN pos_users opener ON opener.id = cr.opened_by
         LEFT JOIN pos_users closer ON closer.id = cr.closed_by
         WHERE cr.id = $1`,
        [registerId]
      ),
      pool.query(
        `SELECT psp.method, COALESCE(SUM(psp.amount), 0)::numeric AS total, COUNT(DISTINCT psp.sale_id)::int AS count
         FROM pos_sale_payments psp
         JOIN pos_sales ps ON ps.id = psp.sale_id
         WHERE ps.cash_register_id = $1
         GROUP BY psp.method`,
        [registerId]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total_count,
           COALESCE(SUM(total), 0)::numeric AS total_amount,
           COUNT(*) FILTER (WHERE is_invoiced)::int AS invoiced_count,
           COALESCE(SUM(total) FILTER (WHERE is_invoiced), 0)::numeric AS invoiced_amount,
           COUNT(*) FILTER (WHERE NOT is_invoiced)::int AS not_invoiced_count,
           COALESCE(SUM(total) FILTER (WHERE NOT is_invoiced), 0)::numeric AS not_invoiced_amount
         FROM pos_sales WHERE cash_register_id = $1`,
        [registerId]
      ),
      pool.query(
        `SELECT type, COALESCE(SUM(amount), 0)::numeric AS total, COUNT(*)::int AS count
         FROM pos_cash_movements WHERE cash_register_id = $1 GROUP BY type`,
        [registerId]
      ),
      pool.query(
        `SELECT ps.id, ps.sale_number, ps.total, ps.is_invoiced, ps.created_at, pu.name AS user_name
         FROM pos_sales ps JOIN pos_users pu ON pu.id = ps.user_id
         WHERE ps.cash_register_id = $1`,
        [registerId]
      ),
      pool.query(
        `SELECT pcm.id, pcm.type, pcm.amount, pcm.reason, pcm.created_at, pu.name AS user_name
         FROM pos_cash_movements pcm JOIN pos_users pu ON pu.id = pcm.user_id
         WHERE pcm.cash_register_id = $1`,
        [registerId]
      ),
    ])

  const register = registerRows[0]
  if (!register) return null

  const salesByMethod = Object.fromEntries(
    PAYMENT_METHODS.map(method => {
      const row = methodRows.find(r => r.method === method)
      return [method, { total: row ? Number(row.total) : 0, count: row ? row.count : 0 }]
    })
  )
  const cashSalesTotal = salesByMethod.efectivo.total

  const movementsByType = { ingreso: { total: 0, count: 0 }, egreso: { total: 0, count: 0 } }
  for (const row of movementRows) movementsByType[row.type] = { total: Number(row.total), count: row.count }

  const sales = salesRows[0]
  const expectedCash =
    register.status === 'open'
      ? roundMoney(
          Number(register.opening_amount) + cashSalesTotal + movementsByType.ingreso.total - movementsByType.egreso.total
        )
      : register.expected_cash != null
      ? Number(register.expected_cash)
      : null

  const timeline = [
    ...timelineSales.map(row => ({
      kind: 'sale',
      id: row.id,
      saleNumber: row.sale_number,
      amount: Number(row.total),
      isInvoiced: row.is_invoiced,
      userName: row.user_name,
      createdAt: row.created_at,
    })),
    ...timelineMovements.map(row => ({
      kind: 'movement',
      id: row.id,
      type: row.type,
      amount: Number(row.amount),
      reason: row.reason,
      userName: row.user_name,
      createdAt: row.created_at,
    })),
  ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

  return {
    id: register.id,
    status: register.status,
    openedBy: register.opened_by_name,
    closedBy: register.closed_by_name,
    openingAmount: Number(register.opening_amount),
    expectedCash,
    actualCash: register.actual_cash != null ? Number(register.actual_cash) : null,
    cashDifference: register.cash_difference != null ? Number(register.cash_difference) : null,
    openedAt: register.opened_at,
    closedAt: register.closed_at,
    notes: register.notes,
    salesByMethod,
    totalSalesCount: sales.total_count,
    totalSalesAmount: Number(sales.total_amount),
    invoiced: { total: Number(sales.invoiced_amount), count: sales.invoiced_count },
    notInvoiced: { total: Number(sales.not_invoiced_amount), count: sales.not_invoiced_count },
    movementsIn: movementsByType.ingreso,
    movementsOut: movementsByType.egreso,
    timeline,
  }
}

async function getOpenRegisterId() {
  const { rows } = await pool.query(`SELECT id FROM pos_cash_registers WHERE status = 'open' LIMIT 1`)
  return rows[0]?.id || null
}

// POST /api/pos/cash/open
router.post('/open', async (req, res) => {
  try {
    const openingAmount = Number(req.body?.openingAmount)
    if (!Number.isFinite(openingAmount) || openingAmount < 0) {
      return res.status(400).json({ error: 'El fondo de caja tiene que ser un monto válido' })
    }

    const { rows } = await pool.query(
      `INSERT INTO pos_cash_registers (opened_by, opening_amount) VALUES ($1, $2) RETURNING id`,
      [req.posUser.id, openingAmount]
    )
    const summary = await buildCashRegisterSummary(rows[0].id)
    res.status(201).json({ cashRegister: summary })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya hay una caja abierta' })
    }
    console.error('[POST /api/pos/cash/open]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// GET /api/pos/cash/current — null si no hay ninguna abierta (no es un error:
// es el estado normal antes de abrir el turno).
router.get('/current', async (_req, res) => {
  try {
    const openId = await getOpenRegisterId()
    if (!openId) return res.json({ cashRegister: null })
    res.json({ cashRegister: await buildCashRegisterSummary(openId) })
  } catch (err) {
    console.error('[GET /api/pos/cash/current]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// POST /api/pos/cash/close
router.post('/close', async (req, res) => {
  try {
    const openId = await getOpenRegisterId()
    if (!openId) return res.status(409).json({ error: 'No hay una caja abierta para cerrar' })

    const actualCash = Number(req.body?.actualCash)
    if (!Number.isFinite(actualCash) || actualCash < 0) {
      return res.status(400).json({ error: 'El efectivo contado tiene que ser un monto válido' })
    }
    const notes = req.body?.notes ? String(req.body.notes).slice(0, 2000) : null

    const summaryBeforeClose = await buildCashRegisterSummary(openId)
    const expectedCash = summaryBeforeClose.expectedCash
    const cashDifference = roundMoney(actualCash - expectedCash)

    await pool.query(
      `UPDATE pos_cash_registers
       SET status = 'closed', closed_by = $1, closed_at = NOW(),
           expected_cash = $2, actual_cash = $3, cash_difference = $4, notes = $5
       WHERE id = $6`,
      [req.posUser.id, expectedCash, actualCash, cashDifference, notes, openId]
    )

    res.json({ cashRegister: await buildCashRegisterSummary(openId) })
  } catch (err) {
    console.error('[POST /api/pos/cash/close]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// GET /api/pos/cash/history — solo admin: es el desglose de diferencias de
// efectivo de cada turno, información sensible del negocio.
router.get('/history', requirePosRole('admin'), async (req, res) => {
  try {
    const { date, page = 1, limit = 50 } = req.query
    const conditions = [`status = 'closed'`]
    const params = []
    let idx = 1

    if (date) {
      conditions.push(`(closed_at AT TIME ZONE '${TZ}')::date = $${idx++}::date`)
      params.push(date)
    }
    const where = `WHERE ${conditions.join(' AND ')}`

    const cappedLimit = Math.min(Number(limit) || 50, 200)
    const currentPage = Math.max(1, Number(page) || 1)
    const offset = (currentPage - 1) * cappedLimit

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(
        `SELECT cr.id, cr.opened_at, cr.closed_at, cr.opening_amount, cr.expected_cash,
                cr.actual_cash, cr.cash_difference,
                opener.name AS opened_by_name, closer.name AS closed_by_name,
                COALESCE((SELECT SUM(total) FROM pos_sales WHERE cash_register_id = cr.id), 0)::numeric AS total_sales_amount,
                COALESCE((SELECT COUNT(*) FROM pos_sales WHERE cash_register_id = cr.id), 0)::int AS total_sales_count
         FROM pos_cash_registers cr
         JOIN pos_users opener ON opener.id = cr.opened_by
         LEFT JOIN pos_users closer ON closer.id = cr.closed_by
         ${where}
         ORDER BY cr.closed_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, cappedLimit, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM pos_cash_registers ${where}`, params),
    ])

    res.json({
      registers: rows.map(row => ({
        id: row.id,
        openedAt: row.opened_at,
        closedAt: row.closed_at,
        openedByName: row.opened_by_name,
        closedByName: row.closed_by_name,
        openingAmount: Number(row.opening_amount),
        expectedCash: row.expected_cash != null ? Number(row.expected_cash) : null,
        actualCash: row.actual_cash != null ? Number(row.actual_cash) : null,
        cashDifference: row.cash_difference != null ? Number(row.cash_difference) : null,
        totalSalesAmount: Number(row.total_sales_amount),
        totalSalesCount: row.total_sales_count,
      })),
      total: Number(countRows[0].count),
      page: currentPage,
      limit: cappedLimit,
    })
  } catch (err) {
    console.error('[GET /api/pos/cash/history]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// Movimientos ANTES de '/:id': si no, Express lee 'movements' como un :id.
router.post('/movements', async (req, res) => {
  try {
    const openId = await getOpenRegisterId()
    if (!openId) return res.status(409).json({ error: 'No hay una caja abierta' })

    const type = req.body?.type
    const amount = Number(req.body?.amount)
    const reason = String(req.body?.reason || '').trim()
    if (!['ingreso', 'egreso'].includes(type)) return res.status(400).json({ error: 'Tipo de movimiento inválido' })
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'El monto tiene que ser mayor a cero' })
    if (!reason) return res.status(400).json({ error: 'El motivo es obligatorio' })

    await pool.query(
      `INSERT INTO pos_cash_movements (cash_register_id, user_id, type, amount, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [openId, req.posUser.id, type, roundMoney(amount), reason.slice(0, 500)]
    )
    res.status(201).json({ cashRegister: await buildCashRegisterSummary(openId) })
  } catch (err) {
    console.error('[POST /api/pos/cash/movements]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.get('/movements', async (_req, res) => {
  try {
    const openId = await getOpenRegisterId()
    if (!openId) return res.json({ movements: [] })

    const { rows } = await pool.query(
      `SELECT pcm.id, pcm.type, pcm.amount, pcm.reason, pcm.created_at, pu.name AS user_name
       FROM pos_cash_movements pcm JOIN pos_users pu ON pu.id = pcm.user_id
       WHERE pcm.cash_register_id = $1
       ORDER BY pcm.created_at DESC`,
      [openId]
    )
    res.json({
      movements: rows.map(row => ({
        id: row.id, type: row.type, amount: Number(row.amount), reason: row.reason,
        userName: row.user_name, createdAt: row.created_at,
      })),
    })
  } catch (err) {
    console.error('[GET /api/pos/cash/movements]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// GET /api/pos/cash/:id — detalle de una caja puntual (típicamente cerrada,
// desde el historial). Solo admin, mismo criterio que /history.
router.get('/:id', requirePosRole('admin'), async (req, res) => {
  try {
    const summary = await buildCashRegisterSummary(req.params.id)
    if (!summary) return res.status(404).json({ error: 'Caja no encontrada' })
    res.json({ cashRegister: summary })
  } catch (err) {
    console.error('[GET /api/pos/cash/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
