import { Router } from 'express'
import { CUOTAS } from '../config/payments.js'

const router = Router()

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payments/config
// Público — única fuente de verdad de los tramos de cuotas sin interés para
// que el frontend nunca los tenga hardcodeados (barra de anuncios, tarjetas
// de producto).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/config', (_req, res) => {
  res.json({ cuotas: CUOTAS })
})

export default router
