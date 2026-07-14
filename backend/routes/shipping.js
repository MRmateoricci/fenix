import { Router } from 'express'
import { getShippingForCP } from '../config/shipping.js'
import { estimateDeliveryDate } from '../services/correoArgentino.js'

const router = Router()

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/shipping/estimate?postalCode=1900
// Público — le da al Checkout el costo de zona + la fecha estimada de entrega
// sin exponerle al cliente las credenciales de Correo Argentino.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/estimate', async (req, res) => {
  try {
    const { postalCode } = req.query
    const zone = getShippingForCP(postalCode)
    if (!zone) {
      return res.status(404).json({ error: 'No pudimos calcular el envío para ese código postal' })
    }

    const { carrierBusinessDays, bufferBusinessDays, totalBusinessDays, estimatedDate } =
      await estimateDeliveryDate(postalCode)

    res.json({
      zone: { id: zone.id, label: zone.label, description: zone.description, cost: zone.price },
      carrierBusinessDays,
      bufferBusinessDays,
      totalBusinessDays,
      estimatedDeliveryDate: estimatedDate,
    })
  } catch (err) {
    console.error('[GET /api/shipping/estimate]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
