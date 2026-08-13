// Tarifario temporal. El backend usa este módulo como fallback seguro mientras
// no esté habilitado un proveedor externo de cotizaciones.

export const SHIPPING_SERVICES = ['clasico', 'expreso']

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
