// Copia para la vista previa del checkout. backend/config/shipping.js es la
// autoridad y vuelve a cotizar siempre antes de crear la orden. Si tocás
// tarifas, zonas o la fórmula acá, replicá EXACTAMENTE el cambio en el backend.

// `expreso` está fuera de circulación. Con un solo servicio el checkout no
// muestra selector: elegir entre una opción no es elegir.
export const SHIPPING_SERVICES = [{ id: 'clasico', label: 'Clásico' }]

// El tarifario de Andreani viene sin IVA ni seguro. Ambos se agregan acá para
// mostrar, como en el resto del sitio, un importe final.
export const SHIPPING_INSURANCE_RATE = 0.02 // seguro: 2 % del valor declarado
export const SHIPPING_IVA_RATE = 0.21

// Peso que se asume cuando el carrito no trae pesos cargados: tramo más barato.
const FALLBACK_WEIGHT_KG = 0.5

// Zonas de tarifa Andreani. No hay zona local: todo destino que podría contar
// como misma localidad entra igual que la zona rosa.
export const SHIPPING_ZONES = {
  rosa: {
    id: 'rosa',
    label: 'Envío a domicilio',
    description:
      'Buenos Aires, CABA, Córdoba, Santa Fe, Entre Ríos, Santiago del Estero, San Luis y La Pampa',
  },
  salmon: {
    id: 'salmon',
    label: 'Envío a domicilio',
    description:
      'Formosa, Chaco, Corrientes, Misiones, Tucumán, Catamarca, La Rioja, San Juan, Mendoza, Neuquén y Río Negro',
  },
  bordo: {
    id: 'bordo',
    label: 'Envío a domicilio',
    description: 'Jujuy, Salta, Chubut, Santa Cruz y Tierra del Fuego',
  },
}

// CP → zona. Espejo de PRICING_ZONE_RANGES del backend. Cubre 1000–9999.
const ZONE_RANGES = [
  { from: 1000, to: 3299, zona: 'rosa' },
  { from: 3300, to: 3999, zona: 'salmon' },
  { from: 4000, to: 4199, zona: 'salmon' },
  { from: 4200, to: 4399, zona: 'rosa' },
  { from: 4400, to: 4699, zona: 'bordo' },
  { from: 4700, to: 4999, zona: 'salmon' },
  { from: 5000, to: 5299, zona: 'rosa' },
  { from: 5300, to: 5699, zona: 'salmon' },
  { from: 5700, to: 5999, zona: 'rosa' },
  { from: 6000, to: 8299, zona: 'rosa' },
  { from: 8300, to: 8999, zona: 'salmon' },
  { from: 9000, to: 9999, zona: 'bordo' },
]

// Tarifas base por tramo de peso, SIN IVA ni seguro. `maxKg` es el límite
// superior (inclusive). 20–25 kg y más de 50 kg no cotizan (se coordina a mano).
const WEIGHT_TIERS = [
  { maxKg: 1, rosa: 9147.01, salmon: 9992.54, bordo: 10488.06 },
  { maxKg: 2, rosa: 9147.01, salmon: 9992.54, bordo: 10549.61 },
  { maxKg: 3, rosa: 9819.28, salmon: 11074.37, bordo: 11814.71 },
  { maxKg: 5, rosa: 14388.75, salmon: 16121.35, bordo: 17758.06 },
  { maxKg: 10, rosa: 19607.98, salmon: 23357.18, bordo: 28041.35 },
  { maxKg: 15, rosa: 28464.85, salmon: 34496.37, bordo: 41472.96 },
  { maxKg: 20, rosa: 36046.27, salmon: 44511.54, bordo: 54312.92 },
  { minKg: 25, maxKg: 35, rosa: 58207.0, salmon: 72747.02, bordo: 89582.17 },
  { maxKg: 50, rosa: 75467.4, salmon: 96219.34, bordo: 120281.93 },
]

export const SHIPPING_FALLBACK = {
  id: 'unavailable',
  label: 'Zona no disponible',
  description: 'Para tu zona coordinamos el envío por WhatsApp',
  price: null,
}

export function normalizePostalCode(value) {
  return String(value || '').trim().replace(/\s/g, '').toUpperCase()
}

const roundMoney = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

function findZone(num) {
  const range = ZONE_RANGES.find((r) => num >= r.from && num <= r.to)
  return range ? SHIPPING_ZONES[range.zona] : null
}

function findTier(weightKg) {
  const w = weightKg > 0 ? weightKg : FALLBACK_WEIGHT_KG
  for (const tier of WEIGHT_TIERS) {
    if (w <= tier.maxKg) {
      if (tier.minKg && w < tier.minKg) return null
      return tier
    }
  }
  return null
}

// Devuelve { id, label, description, service, price } con el importe final
// (base + seguro + IVA), o SHIPPING_FALLBACK si el CP no resuelve, o `price:
// null` si el peso cae en un rango que Andreani no tarifó.
export function getShippingForCP(postalCode, service = 'clasico', { weightKg = 0, declaredValue = 0 } = {}) {
  const normalized = normalizePostalCode(postalCode)
  if (normalized.length < 4) return null
  const num = Number(normalized)
  if (Number.isNaN(num) || num < 1000 || num > 9999) return SHIPPING_FALLBACK

  const zone = findZone(num)
  if (!zone) return SHIPPING_FALLBACK

  const tier = findTier(Number(weightKg) || 0)
  if (!tier) return { ...zone, service, price: null }

  const base = tier[zone.id]
  const insurance = roundMoney(Math.max(0, Number(declaredValue) || 0) * SHIPPING_INSURANCE_RATE)
  const subtotal = roundMoney(base + insurance)
  const iva = roundMoney(subtotal * SHIPPING_IVA_RATE)
  const price = roundMoney(subtotal + iva)

  return { ...zone, service, price }
}
