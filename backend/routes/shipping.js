import { Router } from 'express'
import { SHIPPING_SERVICES } from '../config/shipping.js'
import { quoteShipping } from '../services/shippingQuotes.js'
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
    const service = String(req.query.service || 'clasico').toLowerCase()
    const packageType = String(req.query.packageType || 'standard').toLowerCase()
    if (!SHIPPING_SERVICES.includes(service)) {
      return res.status(400).json({ error: 'Servicio de envío inválido' })
    }
    if (!['standard', 'large'].includes(packageType)) {
      return res.status(400).json({ error: 'Tipo de paquete inválido' })
    }

    const quote = await quoteShipping({ postalCode, service, packageType })
    if (!quote) {
      return res.status(404).json({ error: 'No pudimos calcular el envío para ese código postal' })
    }

    const { carrierBusinessDays, bufferBusinessDays, totalBusinessDays, estimatedDate } =
      await estimateDeliveryDate(postalCode)

    res.json({
      zone: {
        id: quote.id,
        label: quote.label,
        description: quote.description,
        cost: quote.cost,
      },
      postalCode: quote.postalCode,
      service: quote.service,
      source: quote.source,
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
