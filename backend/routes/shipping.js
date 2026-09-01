import { Router } from 'express'
import {
  SHIPPING_SERVICES,
  FREE_SHIPPING_THRESHOLD,
  FREE_SHIPPING_LOCALITIES,
  qualifiesForFreeShipping,
  isFreeShippingPostalCode,
} from '../config/shipping.js'
import { quoteShipping } from '../services/shippingQuotes.js'
import { estimateDeliveryDate } from '../services/correoArgentino.js'

const router = Router()

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/shipping/config
// Público — única fuente de verdad del umbral y las localidades de envío gratis
// para que el frontend nunca los tenga hardcodeados (carrito, checkout, banner).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/config', (_req, res) => {
  res.json({
    freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
    freeShippingLocalities: FREE_SHIPPING_LOCALITIES,
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/shipping/estimate?postalCode=1900&subtotal=85000&weight=3.2
// Público — le da al Checkout el costo (zona + peso + seguro + IVA) y la fecha
// estimada de entrega. `subtotal` y `weight` son solo para la vista previa: la
// creación real de la orden (POST /api/orders) vuelve a resolver zona, peso y
// envío gratis contra la DB, nunca contra estos valores. `subtotal` es además
// el valor declarado con el que se calcula el seguro (2 %).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/estimate', async (req, res) => {
  try {
    const { postalCode } = req.query
    const service = String(req.query.service || 'clasico').toLowerCase()
    const subtotal = Number(req.query.subtotal) || 0
    const weightKg = Number(req.query.weight) || 0
    if (!SHIPPING_SERVICES.includes(service)) {
      return res.status(400).json({ error: 'Servicio de envío inválido' })
    }

    const quote = await quoteShipping({ postalCode, service, weightKg, declaredValue: subtotal })
    if (!quote) {
      return res.status(404).json({
        error: 'No pudimos calcular el envío automáticamente — escribinos por WhatsApp y lo coordinamos',
      })
    }

    const freeShipping =
      qualifiesForFreeShipping({ subtotal }) || isFreeShippingPostalCode(postalCode)

    // El margen de preparación lo manda el Checkout con el mayor plazo del
    // carrito. Es sólo para la vista previa: POST /api/orders lo vuelve a
    // calcular contra products.stock_inmediato y nunca contra este valor.
    const handlingDays = req.query.handlingDays == null ? undefined : Number(req.query.handlingDays)
    const estimate = await estimateDeliveryDate(postalCode, handlingDays)

    res.json({
      zone: {
        id: quote.id,
        label: quote.label,
        description: quote.description,
        cost: freeShipping ? 0 : quote.cost,
      },
      freeShipping,
      postalCode: quote.postalCode,
      service: quote.service,
      source: quote.source,
      // Ventana de entrega, no una fecha: el tránsito varía según la localidad
      // dentro de la zona del CP (ver config/shipping.js).
      handlingBusinessDays: estimate.handlingBusinessDays,
      minBusinessDays: estimate.minBusinessDays,
      maxBusinessDays: estimate.maxBusinessDays,
      estimatedDeliveryMinDate: estimate.minDate,
      estimatedDeliveryMaxDate: estimate.maxDate,
    })
  } catch (err) {
    console.error('[GET /api/shipping/estimate]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
