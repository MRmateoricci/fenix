// Copia para la vista previa del checkout. El backend vuelve a cotizar siempre
// antes de crear la orden y es la autoridad final sobre el costo.

export const SHIPPING_SERVICES = [
  { id: 'clasico', label: 'Clásico' },
  { id: 'expreso', label: 'Expreso' },
]

export const SHIPPING_ZONES = [
  {
    id: 'local',
    label: 'Envío local',
    description: 'Código postal 1894',
    prices: { expreso: 13219, clasico: 12020 },
    postalCodes: ['1894'],
  },
  {
    id: 'nacional_estandar',
    label: 'Envío nacional estándar',
    description: 'Tarifa nacional para paquete estándar',
    prices: { expreso: 21941, clasico: 15957 },
    postalCodes: ['1000', '2000', '5000', '7600'],
  },
]

// Esta tarifa ya forma parte del contrato del cotizador. Se activará cuando el
// catálogo o la API informen las dimensiones reales del paquete.
export const LARGE_PACKAGE_RATE = {
  id: 'nacional_grande',
  label: 'Envío nacional grande',
  description: 'Paquete de hasta 60 × 40 × 30 cm',
  dimensions: { height: 60, width: 40, length: 30 },
  prices: { expreso: 46546, clasico: 33069 },
}

export const SHIPPING_FALLBACK = {
  id: 'unavailable',
  label: 'Zona no disponible',
  description: 'Para tu zona coordinamos el envío por WhatsApp',
  price: null,
}

export function normalizePostalCode(value) {
  return String(value || '').trim().replace(/\s/g, '').toUpperCase()
}

export function getShippingForCP(postalCode, service = 'clasico') {
  const normalized = normalizePostalCode(postalCode)
  if (normalized.length < 4) return null

  const zone = SHIPPING_ZONES.find(({ postalCodes }) => postalCodes.includes(normalized))
  if (!zone || zone.prices[service] == null) return SHIPPING_FALLBACK

  return { ...zone, service, price: zone.prices[service] }
}
