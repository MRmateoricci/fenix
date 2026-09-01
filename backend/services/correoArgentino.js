// ─────────────────────────────────────────────────────────────────────────────
// Estimación de tiempo de entrega para envíos.
//
// Devuelve un RANGO, no una fecha. El tránsito del correo varía según la
// localidad exacta dentro de cada zona (una capital de provincia no tarda lo
// mismo que un pueblo del interior) y esa granularidad no se conoce desde el
// CP. Prometer un día exacto sería inventar precisión que el correo no da —
// y la fecha inventada es la que después genera el reclamo.
//
// TODO(integración real): falta la documentación del endpoint y las
// credenciales de Correo Argentino (CORREO_ARGENTINO_API_URL/CLIENT_ID/
// CLIENT_SECRET en .env). Cuando lleguen, reemplazar el cuerpo de
// fetchCarrierTransit por la llamada real a su API de cotización, manteniendo
// la firma (recibe un código postal, devuelve { min, max } de días hábiles de
// tránsito). Hasta entonces usa el tarifario de config/shipping.js para que el
// checkout nunca se rompa por falta de credenciales.
// ─────────────────────────────────────────────────────────────────────────────

import { getTransitBusinessDays } from '../config/shipping.js'
import { addBusinessDays } from './businessDays.js'

// Último recurso: sólo se usa si el CP no matchea ninguna zona, cosa que
// getManualShippingQuote ya descarta antes de llegar acá.
const FALLBACK_TRANSIT = { min: 3, max: 7 }

// Margen de preparación por defecto, en días hábiles. Sólo se usa cuando el
// caller no sabe qué hay en el carrito (una vista previa sin items). El número
// real sale de products.stock_inmediato + los plazos de store_settings y lo
// pasa el caller: un producto que está en el local no debe arrastrar el margen
// de reposición del proveedor.
const DEFAULT_HANDLING_BUSINESS_DAYS = 3

async function fetchCarrierTransit(postalCode) {
  const apiUrl       = process.env.CORREO_ARGENTINO_API_URL
  const clientId     = process.env.CORREO_ARGENTINO_CLIENT_ID
  const clientSecret = process.env.CORREO_ARGENTINO_CLIENT_SECRET

  const tarifario = getTransitBusinessDays(postalCode) || FALLBACK_TRANSIT

  if (!apiUrl || !clientId || !clientSecret) {
    return tarifario
  }

  try {
    // TODO: reemplazar por la llamada real a la API de Correo Argentino una
    // vez que tengamos su documentación (endpoint, auth, forma de la
    // respuesta) para el código postal `postalCode`.
    throw new Error('Integración real de Correo Argentino pendiente de credenciales/documentación')
  } catch (err) {
    console.error('[correoArgentino] Usando tarifario propio por error de API:', err.message)
    return tarifario
  }
}

// ── estimateDeliveryDate — ventana de entrega, preparación incluida ─────────
// `handlingBusinessDays` es el mayor plazo de preparación del pedido (días
// hasta que la mercadería está lista para despachar). Se recibe como parámetro
// porque depende de qué se compró, no del código postal, y se suma a los DOS
// extremos: la preparación ocurre antes del envío en cualquier escenario.
//
// No debe llamarse dentro de una transacción de DB: es una llamada de red y no
// debe sostener locks de Postgres mientras espera respuesta.
export async function estimateDeliveryDate(postalCode, handlingBusinessDays) {
  const handling = Number.isFinite(Number(handlingBusinessDays))
    ? Math.max(0, Math.round(Number(handlingBusinessDays)))
    : DEFAULT_HANDLING_BUSINESS_DAYS

  const transit = await fetchCarrierTransit(postalCode)
  const minBusinessDays = handling + transit.min
  const maxBusinessDays = handling + transit.max
  const today = new Date()

  return {
    handlingBusinessDays: handling,
    carrierMinBusinessDays: transit.min,
    carrierMaxBusinessDays: transit.max,
    minBusinessDays,
    maxBusinessDays,
    minDate: addBusinessDays(today, minBusinessDays),
    maxDate: addBusinessDays(today, maxBusinessDays),
  }
}
