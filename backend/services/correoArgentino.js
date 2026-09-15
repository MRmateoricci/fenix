// ─────────────────────────────────────────────────────────────────────────────
// Estimación de tiempo de entrega para envíos.
//
// Devuelve un RANGO, no una fecha. El tránsito del correo varía según la
// localidad exacta dentro de cada zona (una capital de provincia no tarda lo
// mismo que un pueblo del interior) y esa granularidad no se conoce desde el
// CP. Prometer un día exacto sería inventar precisión que el correo no da —
// y la fecha inventada es la que después genera el reclamo.
//
// El tránsito sale de dos lados. Cuando la cotización vino de la API de Correo
// Argentino trae `deliveryTimeMin/Max` reales y esos mandan; cuando se cotizó
// con el tarifario propio se usan las bandas de CP de config/shipping.js. Por
// eso el tránsito se recibe como parámetro en vez de consultarse acá: quien
// cotiza (services/shippingQuotes.js) ya hizo la llamada de red y repetirla
// sería pagar dos veces el mismo viaje.
// ─────────────────────────────────────────────────────────────────────────────

import { getTransitBusinessDays } from '../config/shipping.js'
import { addBusinessDays } from './businessDays.js'

// Último recurso: sólo se usa si el CP no matchea ninguna banda, cosa que
// quoteShipping ya descarta antes de llegar acá.
const FALLBACK_TRANSIT = { min: 3, max: 7 }

// Margen de preparación por defecto, en días hábiles. Sólo se usa cuando el
// caller no sabe qué hay en el carrito (una vista previa sin items). El número
// real sale de products.stock_inmediato + los plazos de store_settings y lo
// pasa el caller: un producto que está en el local no debe arrastrar el margen
// de reposición del proveedor.
const DEFAULT_HANDLING_BUSINESS_DAYS = 3

// Normaliza el tránsito que informó la API. Se descarta si viene incompleto o
// con un mínimo mayor al máximo: un rango dado vuelta se mostraría como
// "entre 7 y 3 días" y es preferible la banda propia, que siempre es coherente.
function normalizeTransit(transit) {
  const min = Math.round(Number(transit?.min))
  const max = Math.round(Number(transit?.max))
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  if (min < 0 || max < min) return null
  return { min, max }
}

function resolveTransit(postalCode, transit) {
  return normalizeTransit(transit) || getTransitBusinessDays(postalCode) || FALLBACK_TRANSIT
}

// ── estimateDeliveryDate — ventana de entrega, preparación incluida ─────────
// `handlingBusinessDays` es el mayor plazo de preparación del pedido (días
// hasta que la mercadería está lista para despachar). Se recibe como parámetro
// porque depende de qué se compró, no del código postal, y se suma a los DOS
// extremos: la preparación ocurre antes del envío en cualquier escenario.
//
// `transit` es el `{ min, max }` que devolvió la cotización (quote.transit).
// Cuando no viene, se cae a las bandas de CP del tarifario propio.
export async function estimateDeliveryDate(postalCode, handlingBusinessDays, { transit } = {}) {
  const handling = Number.isFinite(Number(handlingBusinessDays))
    ? Math.max(0, Math.round(Number(handlingBusinessDays)))
    : DEFAULT_HANDLING_BUSINESS_DAYS

  const carrierTransit = resolveTransit(postalCode, transit)
  const minBusinessDays = handling + carrierTransit.min
  const maxBusinessDays = handling + carrierTransit.max
  const today = new Date()

  return {
    handlingBusinessDays: handling,
    carrierMinBusinessDays: carrierTransit.min,
    carrierMaxBusinessDays: carrierTransit.max,
    minBusinessDays,
    maxBusinessDays,
    minDate: addBusinessDays(today, minBusinessDays),
    maxDate: addBusinessDays(today, maxBusinessDays),
  }
}
