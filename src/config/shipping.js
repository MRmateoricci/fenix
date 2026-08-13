// Copia para la vista previa del checkout. El backend vuelve a cotizar siempre
// antes de crear la orden y es la autoridad final sobre el costo.

export const SHIPPING_SERVICES = [
  { id: 'clasico', label: 'Clásico' },
  { id: 'expreso', label: 'Expreso' },
]

// Zonas por rango de CP — misma tabla que backend/config/shipping.js. Si
// cambiás precios/zonas acá, replicá el cambio ahí también.
export const SHIPPING_ZONES = [
  {
    id: 'gran_la_plata',
    label: 'Envío local · Gran La Plata',
    description: 'La Plata y alrededores',
    prices: { expreso: 13219, clasico: 12020 },
    postalCodeRanges: [[1884, 1936]],
  },
  {
    id: 'caba',
    label: 'Envío CABA',
    description: 'Ciudad Autónoma de Buenos Aires',
    prices: { expreso: 18600, clasico: 13500 },
    postalCodeRanges: [[1000, 1499]],
  },
  {
    id: 'gba',
    label: 'Envío GBA',
    description: 'Gran Buenos Aires',
    prices: { expreso: 19700, clasico: 14300 },
    postalCodeRanges: [[1500, 1883], [1937, 1999]],
  },
  {
    id: 'centro_litoral_cuyo',
    label: 'Envío Centro, Litoral y Cuyo',
    description: 'Córdoba, Santa Fe, Entre Ríos, Mendoza, San Juan, San Luis',
    prices: { expreso: 21941, clasico: 15957 },
    postalCodeRanges: [[2000, 3399], [5000, 5999]],
  },
  {
    id: 'interior_ba_pampa',
    label: 'Envío Interior de Buenos Aires y La Pampa',
    description: 'Interior de la provincia de Buenos Aires y La Pampa',
    prices: { expreso: 23000, clasico: 16700 },
    postalCodeRanges: [[6000, 8199]],
  },
  {
    id: 'norte',
    label: 'Envío Norte (NOA y NEA)',
    description: 'Salta, Jujuy, Tucumán, Catamarca, Santiago del Estero, Chaco, Formosa, Corrientes, Misiones',
    prices: { expreso: 27400, clasico: 19900 },
    postalCodeRanges: [[3400, 4999]],
  },
  {
    id: 'patagonia',
    label: 'Envío Patagonia',
    description: 'La Pampa sur, Neuquén, Río Negro, Chubut, Santa Cruz, Tierra del Fuego',
    prices: { expreso: 35100, clasico: 25500 },
    postalCodeRanges: [[8200, 9999]],
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
  const num = Number(normalized)
  if (Number.isNaN(num)) return SHIPPING_FALLBACK

  const zone = SHIPPING_ZONES.find(({ postalCodeRanges }) =>
    postalCodeRanges.some(([from, to]) => num >= from && num <= to)
  )
  if (!zone || zone.prices[service] == null) return SHIPPING_FALLBACK

  return { ...zone, service, price: zone.prices[service] }
}
