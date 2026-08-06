// Tarifario temporal. El backend usa este módulo como fallback seguro mientras
// no esté habilitado un proveedor externo de cotizaciones.

export const SHIPPING_SERVICES = ['clasico', 'expreso']

export const MANUAL_SHIPPING_RATES = {
  local: {
    postalCodes: ['1894'],
    prices: { expreso: 13219, clasico: 12020 },
  },
  nacional_estandar: {
    postalCodes: ['1000', '2000', '5000', '7600'],
    prices: { expreso: 21941, clasico: 15957 },
  },
  nacional_grande: {
    dimensions: { height: 60, width: 40, length: 30 },
    prices: { expreso: 46546, clasico: 33069 },
  },
}

const RATE_METADATA = {
  local: { label: 'Envío local', description: 'Código postal 1894' },
  nacional_estandar: {
    label: 'Envío nacional estándar',
    description: 'Tarifa nacional para paquete estándar',
  },
  nacional_grande: {
    label: 'Envío nacional grande',
    description: 'Paquete de hasta 60 × 40 × 30 cm',
  },
}

export function normalizePostalCode(value) {
  return String(value || '').trim().replace(/\s/g, '').toUpperCase()
}

export function getManualShippingQuote({ postalCode, service = 'clasico', packageType = 'standard' }) {
  if (!SHIPPING_SERVICES.includes(service)) return null

  const normalized = normalizePostalCode(postalCode)
  if (normalized.length < 4) return null

  let rateId
  if (packageType === 'large') {
    rateId = 'nacional_grande'
  } else if (MANUAL_SHIPPING_RATES.local.postalCodes.includes(normalized)) {
    rateId = 'local'
  } else if (MANUAL_SHIPPING_RATES.nacional_estandar.postalCodes.includes(normalized)) {
    rateId = 'nacional_estandar'
  } else {
    return null
  }

  const rate = MANUAL_SHIPPING_RATES[rateId]
  return {
    id: rateId,
    ...RATE_METADATA[rateId],
    postalCode: normalized,
    service,
    cost: rate.prices[service],
    dimensions: rate.dimensions || null,
    source: 'manual',
  }
}

export function getShippingForCP(postalCode, service = 'clasico') {
  const quote = getManualShippingQuote({ postalCode, service })
  return quote ? { ...quote, price: quote.cost } : null
}
