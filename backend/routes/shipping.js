import { Router } from 'express'
import {
  SHIPPING_SERVICES,
  FREE_SHIPPING_LOCALITIES,
  qualifiesForFreeShipping,
  isFreeShippingPostalCode,
} from '../config/shipping.js'
import { getProvinceCode, isCorreoArgentinoConfigured } from '../config/correoArgentino.js'
import { quoteShipping, normalizeDeliveryOption } from '../services/shippingQuotes.js'
import { fetchAgencies } from '../services/correoArgentinoApi.js'
import { localitiesForProvince, lookupPostalCode } from '../services/correoArgentinoLocalities.js'
import { estimateDeliveryDate } from '../services/correoArgentino.js'
import { getFreeShippingThreshold, validateFreeShippingThreshold } from '../services/shippingSettings.js'
import { pool } from '../db/pool.js'
import { requireAdmin } from '../middleware/requireAdmin.js'

const router = Router()

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/shipping/config
// Público — única fuente de verdad del umbral y las localidades de envío gratis
// para que el frontend nunca los tenga hardcodeados (carrito, checkout, banner).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/config', async (_req, res) => {
  try {
    res.json({
      freeShippingThreshold: await getFreeShippingThreshold(),
      freeShippingLocalities: FREE_SHIPPING_LOCALITIES,
      // Le dice al checkout si tiene sentido ofrecer envío a sucursal. Sin la API
      // de Correo no hay lista de sucursales ni tarifa propia para esa modalidad.
      branchDeliveryEnabled: isCorreoArgentinoConfigured(),
    })
  } catch (error) {
    console.error('Error consultando la configuración de envíos:', error.message)
    res.status(500).json({ error: 'No se pudo consultar la configuración de envíos' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/shipping/free-shipping-threshold
// Admin-only — antes sólo se podía cambiar por env var (ENVIO_GRATIS_MINIMO) y
// redeploy.
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/free-shipping-threshold', requireAdmin, async (req, res) => {
  const value = Number(req.body?.freeShippingThreshold)
  const validationError = validateFreeShippingThreshold(value)
  if (validationError) return res.status(400).json({ error: validationError })
  try {
    await pool.query(
      `INSERT INTO store_settings (id, free_shipping_threshold, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET free_shipping_threshold = EXCLUDED.free_shipping_threshold, updated_at = NOW()`,
      [value],
    )
    res.json({ freeShippingThreshold: value })
  } catch (error) {
    console.error('Error guardando el umbral de envío gratis:', error.message)
    res.status(500).json({ error: 'No se pudo guardar el umbral de envío gratis' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/shipping/agencies?province=Buenos%20Aires
// Público — sucursales de Correo Argentino donde el cliente puede retirar.
//
// Se cachea en memoria: la lista de sucursales de una provincia no cambia entre
// dos checkouts, y cada consulta sin caché es un viaje a la API de Correo con
// el cliente esperando en el formulario.
// ─────────────────────────────────────────────────────────────────────────────
const AGENCIES_CACHE_TTL_MS = 6 * 60 * 60 * 1000
const agenciesCache = new Map() // provinceCode → { at, agencies }

router.get('/agencies', async (req, res) => {
  try {
    const provinceCode = getProvinceCode(req.query.provinceCode || req.query.province)
    if (!provinceCode) {
      return res.status(400).json({ error: 'Provincia inválida' })
    }

    // Sin API configurada no hay sucursales que ofrecer. Se responde una lista
    // vacía y no un error: para el checkout esto no es una falla, es que la
    // modalidad no está disponible.
    if (!isCorreoArgentinoConfigured()) {
      return res.json({ provinceCode, agencies: [] })
    }

    const cached = agenciesCache.get(provinceCode)
    if (cached && Date.now() - cached.at < AGENCIES_CACHE_TTL_MS) {
      return res.json({ provinceCode, agencies: cached.agencies })
    }

    const agencies = await fetchAgencies(provinceCode)
    agenciesCache.set(provinceCode, { at: Date.now(), agencies })
    res.json({ provinceCode, agencies })
  } catch (err) {
    // Que Correo no conteste no puede romper el checkout: se ofrece el envío a
    // domicilio, que siempre tiene precio por el tarifario propio.
    console.error('[GET /api/shipping/agencies]', err.message)
    res.json({ provinceCode: null, agencies: [] })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/shipping/locality?postalCode=2000
// Público — sugiere provincia y localidad a partir del código postal, para no
// hacerle escribir al cliente lo que Correo ya sabe.
//
// Devuelve `{ province: null, localities: [] }` cuando todavía no se puede
// sugerir nada (índice frío, CP sin sucursal, API sin configurar). El
// formulario sigue siendo texto libre: esto ayuda, no condiciona.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/locality', (req, res) => {
  const encontrado = lookupPostalCode(req.query.postalCode)
  if (!encontrado) {
    return res.json({ province: null, provinceCode: null, localities: [] })
  }
  res.json({
    province: encontrado.province,
    provinceCode: encontrado.provinceCode,
    localities: encontrado.localities,
    // Todas las de la provincia, por si el cliente vive en una localidad sin
    // sucursal propia y su CP resuelve al pueblo de al lado.
    provinceLocalities: localitiesForProvince(encontrado.provinceCode),
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/shipping/estimate?postalCode=1900&subtotal=85000&weight=3.2
// Público — le da al Checkout el costo del envío y la fecha estimada de
// entrega. `subtotal`, `weight` y las medidas del bulto son solo para la vista
// previa: la creación real de la orden (POST /api/orders) vuelve a resolver
// destino, bulto y envío gratis contra la DB, nunca contra estos valores.
//
// `length`, `width` y `height` son las medidas del bulto en centímetros. La API
// de Correo cotiza por volumen además de por peso, así que si el checkout no
// las manda la vista previa puede no coincidir con lo que termina cobrando el
// pedido.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/estimate', async (req, res) => {
  try {
    const { postalCode } = req.query
    const service = String(req.query.service || 'clasico').toLowerCase()
    const subtotal = Number(req.query.subtotal) || 0
    const weightKg = Number(req.query.weight) || 0
    const deliveryOption = normalizeDeliveryOption(req.query.deliveryOption)
    if (!SHIPPING_SERVICES.includes(service)) {
      return res.status(400).json({ error: 'Servicio de envío inválido' })
    }

    // Bulto de la vista previa: un único paquete con las medidas que mandó el
    // carrito. Si no vinieron, quoteShipping usa la caja por defecto.
    const lengthCm = Number(req.query.length) || 0
    const heightCm = Number(req.query.height) || 0
    const widthCm = Number(req.query.width) || 0
    const items = lengthCm || widthCm || heightCm || weightKg
      ? [{ quantity: 1, weightKg, lengthCm, widthCm, heightCm }]
      : null

    const quote = await quoteShipping({
      postalCode,
      service,
      weightKg,
      declaredValue: subtotal,
      deliveryOption,
      items,
    })
    if (!quote) {
      return res.status(404).json({
        error: 'No pudimos calcular el envío automáticamente — escribinos por WhatsApp y lo coordinamos',
      })
    }

    const freeShipping =
      qualifiesForFreeShipping({ subtotal, threshold: await getFreeShippingThreshold() })
      || isFreeShippingPostalCode(postalCode)

    // El margen de preparación lo manda el Checkout con el mayor plazo del
    // carrito. Es sólo para la vista previa: POST /api/orders lo vuelve a
    // calcular contra products.stock_inmediato y nunca contra este valor.
    const handlingDays = req.query.handlingDays == null ? undefined : Number(req.query.handlingDays)
    const estimate = await estimateDeliveryDate(postalCode, handlingDays, { transit: quote.transit })

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
      serviceLabel: quote.serviceLabel,
      deliveryOption: quote.deliveryOption,
      // Todas las combinaciones cotizadas (domicilio/sucursal × clásico/expreso)
      // con su precio y su plazo, para que el checkout las muestre sin volver a
      // pedir cotización cada vez que el cliente cambia de opción.
      deliveryOptions: (quote.options || []).map((option) => ({
        ...option,
        cost: freeShipping ? 0 : option.cost,
      })),
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
