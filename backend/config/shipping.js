// Tarifario temporal. El backend usa este módulo como fallback seguro mientras
// no esté habilitado un proveedor externo de cotizaciones.

// Servicios ofrecidos hoy. `expreso` quedó fuera de circulación: sin una API de
// envíos real no había forma de justificar que llegara antes que el clásico —
// mostraba la misma ventana de entrega por más plata. Los precios `expreso`
// siguen en las zonas de abajo para poder reactivarlo agregándolo acá, pero
// mientras no esté en esta lista no se cotiza, no se valida ni se ofrece.
export const SHIPPING_SERVICES = ['clasico']

// Servicio por defecto y red de contención: un pedido viejo puede tener guardado
// un servicio que ya no se ofrece (ej. 'expreso'), y al reintentar la compra
// llenaría el formulario con un valor que el backend después rechaza.
export const DEFAULT_SHIPPING_SERVICE = 'clasico'

export function normalizeShippingService(value) {
  const service = String(value || '').trim().toLowerCase()
  return SHIPPING_SERVICES.includes(service) ? service : DEFAULT_SHIPPING_SERVICE
}

// Zonas por rango de CP — cubren todo el país (1000-9999) sin huecos, así
// que cualquier CP argentino válido cotiza. Precios estimados por costo
// logístico relativo (distancia desde el depósito en City Bell), a ajustar
// cuando esté disponible la cotización real de Correo Argentino.
export const SHIPPING_ZONES = {
  gran_la_plata: {
    label: 'Envío local · Gran La Plata',
    description: 'La Plata y alrededores',
    postalCodeRanges: [[1884, 1936]],
    prices: { expreso: 13219, clasico: 12020 },
  },
  caba: {
    label: 'Envío CABA',
    description: 'Ciudad Autónoma de Buenos Aires',
    postalCodeRanges: [[1000, 1499]],
    prices: { expreso: 18600, clasico: 13500 },
  },
  gba: {
    label: 'Envío GBA',
    description: 'Gran Buenos Aires',
    postalCodeRanges: [[1500, 1883], [1937, 1999]],
    prices: { expreso: 19700, clasico: 14300 },
  },
  centro_litoral_cuyo: {
    label: 'Envío Centro, Litoral y Cuyo',
    description: 'Córdoba, Santa Fe, Entre Ríos, Mendoza, San Juan, San Luis',
    postalCodeRanges: [[2000, 3399], [5000, 5999]],
    prices: { expreso: 21941, clasico: 15957 },
  },
  interior_ba_pampa: {
    label: 'Envío Interior de Buenos Aires y La Pampa',
    description: 'Interior de la provincia de Buenos Aires y La Pampa',
    postalCodeRanges: [[6000, 8199]],
    prices: { expreso: 23000, clasico: 16700 },
  },
  norte: {
    label: 'Envío Norte (NOA y NEA)',
    description: 'Salta, Jujuy, Tucumán, Catamarca, Santiago del Estero, Chaco, Formosa, Corrientes, Misiones',
    postalCodeRanges: [[3400, 4999]],
    prices: { expreso: 27400, clasico: 19900 },
  },
  patagonia: {
    label: 'Envío Patagonia',
    description: 'La Pampa sur, Neuquén, Río Negro, Chubut, Santa Cruz, Tierra del Fuego',
    postalCodeRanges: [[8200, 9999]],
    prices: { expreso: 35100, clasico: 25500 },
  },
}

// Paquete grande: tarifa plana, no varía por zona (a diferencia del resto).
export const LARGE_PACKAGE_RATE = {
  id: 'nacional_grande',
  label: 'Envío nacional grande',
  description: 'Paquete de hasta 60 × 40 × 30 cm',
  dimensions: { height: 60, width: 40, length: 30 },
  prices: { expreso: 46546, clasico: 33069 },
}

export function normalizePostalCode(value) {
  return String(value || '').trim().replace(/\s/g, '').toUpperCase()
}

function isValidArgentinePostalCode(normalized) {
  const num = Number(normalized)
  return !Number.isNaN(num) && num >= 1000 && num <= 9999
}

function findShippingZone(normalized) {
  const num = Number(normalized)
  for (const [id, zone] of Object.entries(SHIPPING_ZONES)) {
    if (zone.postalCodeRanges.some(([from, to]) => num >= from && num <= to)) {
      return { id, ...zone }
    }
  }
  return null
}

export function getManualShippingQuote({ postalCode, service = 'clasico', packageType = 'standard' }) {
  if (!SHIPPING_SERVICES.includes(service)) return null

  const normalized = normalizePostalCode(postalCode)
  if (!isValidArgentinePostalCode(normalized)) return null

  if (packageType === 'large') {
    return {
      id: LARGE_PACKAGE_RATE.id,
      label: LARGE_PACKAGE_RATE.label,
      description: LARGE_PACKAGE_RATE.description,
      postalCode: normalized,
      service,
      cost: LARGE_PACKAGE_RATE.prices[service],
      dimensions: LARGE_PACKAGE_RATE.dimensions,
      source: 'manual',
    }
  }

  const zone = findShippingZone(normalized)
  if (!zone) return null

  return {
    id: zone.id,
    label: zone.label,
    description: zone.description,
    postalCode: normalized,
    service,
    cost: zone.prices[service],
    dimensions: null,
    source: 'manual',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiempo de tránsito del correo, en días hábiles.
//
// Se resuelve por **código postal, no por la provincia del formulario**:
// `provincia` es un input de texto libre ("Bs As", "caba", "Buenos aires"),
// mientras que el CP ya está validado y es el mismo dato con el que se cotiza
// el precio. Un solo campo decide las dos cosas.
//
// Los números salen del tarifario de tránsito de Shipnow, que da un valor para
// la capital de cada provincia y otro para el resto. Como una zona de envío
// agrupa varias provincias, el `min` es la capital más rápida de la zona y el
// `max` la localidad más lenta. Por eso la tienda muestra un **rango** y no una
// fecha única: con estos datos, prometer un día exacto es inventar una precisión
// que el correo no da.
//
// Buenos Aires y CABA no figuran en ese tarifario — se despacha desde City Bell,
// así que van con valores propios.
//
// Los plazos no dependen del servicio: hoy se ofrece uno solo. Si vuelve el
// expreso con una API que confirme que llega antes, el número diferenciado va acá.
// ─────────────────────────────────────────────────────────────────────────────

export const TRANSIT_BUSINESS_DAYS = {
  gran_la_plata:       { min: 1, max: 3 }, // mismo partido, se despacha desde City Bell
  caba:                { min: 2, max: 3 },
  gba:                 { min: 2, max: 3 },
  centro_litoral_cuyo: { min: 2, max: 6 }, // Santa Fe/Córdoba capital → San Juan interior
  interior_ba_pampa:   { min: 3, max: 5 }, // interior de Buenos Aires → La Pampa interior
  norte:               { min: 4, max: 7 }, // Tucumán/Salta capital → Catamarca/Chaco interior
  patagonia:           { min: 3, max: 7 }, // Neuquén capital → Santa Cruz interior
}

// Excepciones por CP, para destinos que romperían el rango de su zona. Tierra
// del Fuego tarda 12-14 días hábiles: metida dentro de Patagonia dejaría a toda
// la región mostrando "entre 3 y 14 días", que no le sirve a nadie.
export const TRANSIT_OVERRIDES = [
  { label: 'Tierra del Fuego', postalCodeRanges: [[9400, 9499]], min: 12, max: 14 },
]

// Devuelve { min, max, source } en días hábiles, o null si el CP no es válido.
// `source` es sólo para diagnóstico: nunca se le muestra al cliente.
export function getTransitBusinessDays(postalCode) {
  const normalized = normalizePostalCode(postalCode)
  if (!isValidArgentinePostalCode(normalized)) return null

  const num = Number(normalized)
  const override = TRANSIT_OVERRIDES.find(item =>
    item.postalCodeRanges.some(([from, to]) => num >= from && num <= to)
  )
  if (override) return { min: override.min, max: override.max, source: override.label }

  const zone = findShippingZone(normalized)
  const transit = zone && TRANSIT_BUSINESS_DAYS[zone.id]
  if (!transit) return null
  return { min: transit.min, max: transit.max, source: zone.label }
}

export function getShippingForCP(postalCode, service = 'clasico') {
  const quote = getManualShippingQuote({ postalCode, service })
  return quote ? { ...quote, price: quote.cost } : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Envío gratis por umbral de compra, a todo el país. Única fuente de verdad —
// el frontend no tiene este valor hardcodeado, lo recibe de
// GET /api/shipping/config y de la respuesta de /api/shipping/estimate.
// Configurable sin tocar código vía variable de entorno.
// ─────────────────────────────────────────────────────────────────────────────

export const FREE_SHIPPING_THRESHOLD = Number(process.env.ENVIO_GRATIS_MINIMO) || 100000

// subtotal: total de productos ya recalculado server-side, sin envío, en el
// mismo valor con IVA incluido que se le muestra al comprador — nunca un
// monto mandado por el cliente.
export function qualifiesForFreeShipping({ subtotal }) {
  return subtotal >= FREE_SHIPPING_THRESHOLD
}
