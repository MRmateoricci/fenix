import { Router } from 'express'
import {
  SHIPPING_SERVICES,
  FREE_SHIPPING_THRESHOLD,
  qualifiesForFreeShipping,
} from '../config/shipping.js'
import { quoteShipping } from '../services/shippingQuotes.js'
import { estimateDeliveryDate } from '../services/correoArgentino.js'

const router = Router()

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/shipping/config
// Público — única fuente de verdad del umbral y las zonas de envío gratis
// para que el frontend nunca los tenga hardcodeados (carrito, checkout).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/config', (_req, res) => {
  res.json({
    freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/shipping/estimate?postalCode=1900&subtotal=85000
// Público — le da al Checkout el costo de zona + la fecha estimada de entrega
// sin exponerle al cliente las credenciales de Correo Argentino. `subtotal` es
// solo para la vista previa: la creación real de la orden (POST /api/orders)
// vuelve a evaluar el envío gratis contra el subtotal recalculado en el
// servidor, nunca contra este valor.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/estimate', async (req, res) => {
  try {
    const { postalCode } = req.query
    const service = String(req.query.service || 'clasico').toLowerCase()
    const packageType = String(req.query.packageType || 'standard').toLowerCase()
    const subtotal = Number(req.query.subtotal) || 0
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

    const freeShipping = qualifiesForFreeShipping({ subtotal })

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
