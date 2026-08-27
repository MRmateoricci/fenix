import { Router } from 'express'
import { CUOTAS } from '../config/payments.js'
import { pool } from '../db/pool.js'
import { normalizeBankTransferSettings, validateBankTransferSettings } from '../services/bankTransfer.js'

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
              bank_transfer_alias, bank_transfer_account_holder
       FROM store_settings WHERE id = 1`,
    )
    const settings = normalizeBankTransferSettings(rows[0])
    const usable = settings.enabled && !validateBankTransferSettings(settings)
    res.json({
      cuotas: CUOTAS,
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

export default router
