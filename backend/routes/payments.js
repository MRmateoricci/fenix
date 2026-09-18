import { Router } from 'express'
import { pool } from '../db/pool.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { normalizeBankTransferSettings, validateBankTransferSettings } from '../services/bankTransfer.js'
import {
  DEFAULT_BASE_INSTALLMENTS,
  DEFAULT_MAX_INSTALLMENTS,
  buildCuotas,
  validateInstallmentTiers,
} from '../services/paymentsSettings.js'

const router = Router()

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payments/config
// Público — única fuente de verdad de los tramos de cuotas sin interés para
// que el frontend nunca los tenga hardcodeados (barra de anuncios, tarjetas
// de producto).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/config', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT bank_transfer_enabled, bank_transfer_discount_percent,
              bank_transfer_expiry_hours, bank_transfer_cbu,
              bank_transfer_alias, bank_transfer_account_holder,
              base_installments, max_installments
       FROM store_settings WHERE id = 1`,
    )
    const settings = normalizeBankTransferSettings(rows[0])
    const usable = settings.enabled && !validateBankTransferSettings(settings)
    const baseInstallments = rows[0]?.base_installments != null ? Number(rows[0].base_installments) : DEFAULT_BASE_INSTALLMENTS
    const maxInstallments = rows[0]?.max_installments != null ? Number(rows[0].max_installments) : DEFAULT_MAX_INSTALLMENTS
    res.json({
      cuotas: buildCuotas(baseInstallments, maxInstallments),
      bankTransfer: {
        enabled: usable,
        discountPercent: settings.discountPercent,
      },
    })
  } catch (error) {
    console.error('Error consultando medios de pago:', error.message)
    res.status(500).json({ error: 'No se pudo consultar los medios de pago' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/payments/installments
// Admin-only — antes sólo se podía cambiar editando CUOTAS en
// config/payments.js y redeployando. Los dos tramos se guardan juntos: validar
// uno sin el otro no alcanza, porque el "premium" nunca puede ofrecer menos
// cuotas que el tramo base.
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/installments', requireAdmin, async (req, res) => {
  const baseInstallments = Math.trunc(Number(req.body?.baseInstallments))
  const maxInstallments = Math.trunc(Number(req.body?.maxInstallments))
  const validationError = validateInstallmentTiers({ baseInstallments, maxInstallments })
  if (validationError) return res.status(400).json({ error: validationError })
  try {
    await pool.query(
      `INSERT INTO store_settings (id, base_installments, max_installments, updated_at)
       VALUES (1, $1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET base_installments = EXCLUDED.base_installments,
                                       max_installments = EXCLUDED.max_installments,
                                       updated_at = NOW()`,
      [baseInstallments, maxInstallments],
    )
    res.json({ baseInstallments, maxInstallments, cuotas: buildCuotas(baseInstallments, maxInstallments) })
  } catch (error) {
    console.error('Error guardando las cuotas:', error.message)
    res.status(500).json({ error: 'No se pudieron guardar las cuotas' })
  }
})

export default router
