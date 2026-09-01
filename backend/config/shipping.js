// Tarifario Andreani. El backend usa este módulo como autoridad del costo de
// envío mientras no haya integración con la API de Andreani.
//
// El costo se arma con dos ejes:
//   1. Zona de destino (rosa / salmón / bordó), resuelta por código postal.
//   2. Peso total del pedido, que elige un tramo de la tabla de tarifas base.
// Sobre la tarifa base se suma el seguro (2 % del valor declarado) y recién
// entonces el IVA (21 %): el tarifario de Andreani se informa sin IVA ni seguro.

// Un solo servicio. El id 'clasico' se mantiene por compatibilidad con los
// pedidos ya guardados (orders.shipping_service) y con el formulario de
// reintento; la etiqueta no se muestra mientras haya un único servicio.
export const SHIPPING_SERVICES = ['clasico']

// Servicio por defecto y red de contención: un pedido viejo puede tener guardado
// un servicio que ya no se ofrece (ej. 'expreso'), y al reintentar la compra
// llenaría el formulario con un valor que el backend después rechaza.
export const DEFAULT_SHIPPING_SERVICE = 'clasico'

export function normalizeShippingService(value) {
  const service = String(value || '').trim().toLowerCase()
  return SHIPPING_SERVICES.includes(service) ? service : DEFAULT_SHIPPING_SERVICE
}

// El tarifario de Andreani viene sin IVA ni seguro. Ambos se agregan acá para
// que la tienda muestre, como en el resto del sitio, un importe final.
export const SHIPPING_INSURANCE_RATE = 0.02 // 2 % del valor declarado del pedido
export const SHIPPING_IVA_RATE = 0.21

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

// ─────────────────────────────────────────────────────────────────────────────
// Zonas de tarifa Andreani. No hay zona "local": todo destino que podría contar
// como misma localidad entra igual que la zona rosa.
// ─────────────────────────────────────────────────────────────────────────────
export const SHIPPING_ZONES = {
  rosa: {
    label: 'Envío a domicilio',
    description:
      'Buenos Aires, CABA, Córdoba, Santa Fe, Entre Ríos, Santiago del Estero, San Luis y La Pampa',
  },
  salmon: {
    label: 'Envío a domicilio',
    description:
      'Formosa, Chaco, Corrientes, Misiones, Tucumán, Catamarca, La Rioja, San Juan, Mendoza, Neuquén y Río Negro',
  },
  bordo: {
    label: 'Envío a domicilio',
    description: 'Jujuy, Salta, Chubut, Santa Cruz y Tierra del Fuego',
  },
}

// Tarifas base por tramo de peso, SIN IVA ni seguro. `maxKg` es el límite
// superior del tramo (inclusive); el tramo aplica si el peso total del pedido
// es mayor que el `maxKg` del tramo anterior y menor o igual a este.
//
// Los tramos 0–0,5 kg y 0,5–1 kg tienen la misma tarifa: se unen en `maxKg: 1`.
// El tramo 20–25 kg NO existe: Andreani no informó tarifa para ese rango, así
// que un peso entre 20 y 25 kg no cotiza y se coordina a mano. Lo mismo por
// encima de 50 kg.
export const SHIPPING_WEIGHT_TIERS = [
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

// Peso que se usa cuando el pedido no tiene pesos cargados en sus productos.
// Decisión de negocio: sin dato se cotiza el tramo más barato (0–1 kg) para no
// frenar la compra online. Al cargar `weight_kg` en los productos el número
// pasa a ser real. No se calcula peso volumétrico.
const FALLBACK_WEIGHT_KG = 0.5

export function normalizePostalCode(value) {
  return String(value || '').trim().replace(/\s/g, '').toUpperCase()
}

function isValidArgentinePostalCode(normalized) {
  const num = Number(normalized)
  return !Number.isNaN(num) && num >= 1000 && num <= 9999
}

// Mapa código postal → zona de tarifa. Rangos del tramo numérico del CPA
// agrupados por provincia. Es best-effort en los bordes entre provincias:
// algunas localidades caen en el bloque numérico de la provincia vecina
// (ej. Añatuya, Santiago del Estero, tiene CP 3763 y acá cae en salmón).
// Cubre 1000–9999 sin huecos.
const PRICING_ZONE_RANGES = [
  { from: 1000, to: 3299, zona: 'rosa', provincias: 'CABA, Buenos Aires, Santa Fe, Entre Ríos' },
  { from: 3300, to: 3999, zona: 'salmon', provincias: 'Misiones, Corrientes, Chaco, Formosa' },
  { from: 4000, to: 4199, zona: 'salmon', provincias: 'Tucumán' },
  { from: 4200, to: 4399, zona: 'rosa', provincias: 'Santiago del Estero' },
  { from: 4400, to: 4699, zona: 'bordo', provincias: 'Salta, Jujuy' },
  { from: 4700, to: 4999, zona: 'salmon', provincias: 'Catamarca, La Rioja' },
  { from: 5000, to: 5299, zona: 'rosa', provincias: 'Córdoba' },
  { from: 5300, to: 5699, zona: 'salmon', provincias: 'La Rioja, San Juan, Mendoza' },
  { from: 5700, to: 5999, zona: 'rosa', provincias: 'San Luis, Córdoba' },
  { from: 6000, to: 8299, zona: 'rosa', provincias: 'Buenos Aires, La Pampa' },
  { from: 8300, to: 8999, zona: 'salmon', provincias: 'Neuquén, Río Negro' },
  { from: 9000, to: 9999, zona: 'bordo', provincias: 'Chubut, Santa Cruz, Tierra del Fuego' },
]

function findPricingZone(normalized) {
  const num = Number(normalized)
  const range = PRICING_ZONE_RANGES.find((r) => num >= r.from && num <= r.to)
  if (!range) return null
  return { id: range.zona, ...SHIPPING_ZONES[range.zona] }
}

// Devuelve el tramo de tarifa para un peso en kg, o null si el peso cae en un
// rango que Andreani no tarifó (20–25 kg) o por encima del máximo (50 kg).
function findWeightTier(weightKg) {
  const w = weightKg > 0 ? weightKg : FALLBACK_WEIGHT_KG
  for (const tier of SHIPPING_WEIGHT_TIERS) {
    if (w <= tier.maxKg) {
      // Tramo con hueco por debajo (25–35 kg): 20 < peso < 25 no cotiza.
      if (tier.minKg && w < tier.minKg) return null
      return tier
    }
  }
  return null // más de 50 kg
}

// Cotización de envío. Devuelve el mismo objeto para el manual de siempre y para
// una futura API, o null si no se puede cotizar automáticamente (CP inválido,
// peso en un rango sin tarifa, servicio desconocido).
export function getManualShippingQuote({
  postalCode,
  weightKg = 0,
  declaredValue = 0,
  service = DEFAULT_SHIPPING_SERVICE,
} = {}) {
  if (!SHIPPING_SERVICES.includes(service)) return null

  const normalized = normalizePostalCode(postalCode)
  if (!isValidArgentinePostalCode(normalized)) return null

  const zone = findPricingZone(normalized)
  if (!zone) return null

  const tier = findWeightTier(Number(weightKg) || 0)
  if (!tier) return null // 20–25 kg o más de 50 kg: se coordina por WhatsApp

  const base = tier[zone.id]
  const insurance = roundMoney(Math.max(0, Number(declaredValue) || 0) * SHIPPING_INSURANCE_RATE)
  const subtotal = roundMoney(base + insurance)
  const iva = roundMoney(subtotal * SHIPPING_IVA_RATE)
  const total = roundMoney(subtotal + iva)

  return {
    id: zone.id,
    label: zone.label,
    description: zone.description,
    postalCode: normalized,
    service,
    cost: total,
    breakdown: { base, insurance, subtotal, iva, total },
    source: 'andreani',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiempo de tránsito del correo, en días hábiles.
//
// Ojo: estas bandas NO son las zonas de tarifa. El precio va por zona Andreani
// (3 zonas grandes); el tránsito va por una banda de CP más fina, porque dentro
// de una misma zona de tarifa una capital de provincia no tarda lo mismo que un
// pueblo del interior. Son dos ejes distintos y se resuelven por separado.
//
// Se resuelve por **código postal, no por la provincia del formulario**:
// `provincia` es un input de texto libre ("Bs As", "caba", "Buenos aires"),
// mientras que el CP ya está validado y es el mismo dato con el que se cotiza
// el precio.
//
// Los números salen del tarifario de tránsito de Shipnow, que da un valor para
// la capital de cada provincia y otro para el resto. Como una banda agrupa
// varias provincias, el `min` es la capital más rápida y el `max` la localidad
// más lenta. Por eso la tienda muestra un **rango** y no una fecha única: con
// estos datos, prometer un día exacto es inventar una precisión que el correo
// no da. Buenos Aires y CABA no figuran en ese tarifario — se despacha desde
// City Bell, así que van con valores propios.
// ─────────────────────────────────────────────────────────────────────────────

const TRANSIT_BANDS = [
  { id: 'gran_la_plata', ranges: [[1884, 1936]], min: 1, max: 3 }, // mismo partido, sale de City Bell
  { id: 'caba', ranges: [[1000, 1499]], min: 2, max: 3 },
  { id: 'gba', ranges: [[1500, 1883], [1937, 1999]], min: 2, max: 3 },
  { id: 'centro_litoral_cuyo', ranges: [[2000, 3399], [5000, 5999]], min: 2, max: 6 }, // Santa Fe/Córdoba capital → San Juan interior
  { id: 'interior_ba_pampa', ranges: [[6000, 8199]], min: 3, max: 5 }, // interior de Buenos Aires → La Pampa interior
  { id: 'norte', ranges: [[3400, 4999]], min: 4, max: 7 }, // Tucumán/Salta capital → Catamarca/Chaco interior
  { id: 'patagonia', ranges: [[8200, 9999]], min: 3, max: 7 }, // Neuquén capital → Santa Cruz interior
]

// Excepciones por CP, para destinos que romperían el rango de su banda. Tierra
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
  const override = TRANSIT_OVERRIDES.find((item) =>
    item.postalCodeRanges.some(([from, to]) => num >= from && num <= to),
  )
  if (override) return { min: override.min, max: override.max, source: override.label }

  const band = TRANSIT_BANDS.find((b) => b.ranges.some(([from, to]) => num >= from && num <= to))
  if (!band) return null
  return { min: band.min, max: band.max, source: band.id }
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
