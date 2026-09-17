import { Router } from 'express'
import { pool } from '../../db/pool.js'
import { requirePosAuth, requirePosRole } from '../../middleware/posAuth.js'

const router = Router()

function toPublicSettings(row) {
  return {
    cashDiscountPercent: Number(row.cash_discount_percent),
    installmentTiers: (row.installment_tiers || []).map(t => ({
      installments: Number(t.installments),
      surchargePercent: Number(t.surchargePercent),
    })),
  }
}

function validateTiers(value) {
  if (!Array.isArray(value)) return 'Los tramos de cuotas tienen que ser una lista'
  if (value.length > 12) return 'Máximo 12 tramos de cuotas'
  const seen = new Set()
  for (const tier of value) {
    const installments = Number(tier?.installments)
    const surchargePercent = Number(tier?.surchargePercent)
    if (!Number.isInteger(installments) || installments < 1 || installments > 60) {
      return 'La cantidad de cuotas tiene que ser un entero entre 1 y 60'
    }
    if (!Number.isFinite(surchargePercent) || surchargePercent < 0 || surchargePercent >= 100) {
      return 'El recargo tiene que ser un porcentaje entre 0 y 100'
    }
    if (seen.has(installments)) return `Hay dos tramos con ${installments} cuotas`
    seen.add(installments)
  }
  return null
}

// GET es de lectura para cualquier usuario del POS logueado (no solo admin):
// la pantalla de venta necesita el porcentaje de descuento por efectivo para
// el botón "Descuento efectivo", y el modal de detalle de producto necesita
// los tramos de cuotas para mostrar y poder elegir el precio con tarjeta —
// ninguno de los dos es información sensible, a diferencia del costo/margen.
router.get('/', requirePosAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT cash_discount_percent, installment_tiers FROM pos_settings WHERE id = 1`
    )
    res.json(toPublicSettings(rows[0]))
  } catch (err) {
    console.error('[GET /api/pos/settings]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.put('/', requirePosAuth, requirePosRole('admin'), async (req, res) => {
  try {
    const cashDiscountPercent = Number(req.body?.cashDiscountPercent)
    if (!Number.isFinite(cashDiscountPercent) || cashDiscountPercent < 0 || cashDiscountPercent >= 100) {
      return res.status(400).json({ error: 'El descuento debe ser un porcentaje entre 0 y 100' })
    }
    const installmentTiers = req.body?.installmentTiers ?? []
    const tiersError = validateTiers(installmentTiers)
    if (tiersError) return res.status(400).json({ error: tiersError })

    const normalizedTiers = installmentTiers
      .map(t => ({ installments: Number(t.installments), surchargePercent: Number(t.surchargePercent) }))
      .sort((a, b) => a.installments - b.installments)

    const { rows } = await pool.query(
      `UPDATE pos_settings SET cash_discount_percent = $1, installment_tiers = $2::jsonb WHERE id = 1
       RETURNING cash_discount_percent, installment_tiers`,
      [cashDiscountPercent, JSON.stringify(normalizedTiers)]
    )
    res.json(toPublicSettings(rows[0]))
  } catch (err) {
    console.error('[PUT /api/pos/settings]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
