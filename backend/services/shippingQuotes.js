// Punto único de cotización de envío. Lo usan el checkout (vista previa) y la
// creación de la orden (autoridad), y ambos reciben siempre el mismo objeto sin
// importar de dónde salió el número.
//
// Hay dos fuentes y una sola regla: si la API de Correo Argentino puede
// cotizar, manda la API; si no —sin credenciales, caída, timeout, un bulto
// fuera de sus límites— se cotiza con el tarifario Andreani de
// config/shipping.js. El fallback NO es código muerto a la espera de borrarse:
// es lo que sostiene el checkout el día que la API no está, y lo que queda si
// algún día se deja de usar Correo.
//
// Por eso este módulo nunca deja de devolver una cotización por culpa de la
// API: un error del transportista se loguea y se sigue con la tabla.

import {
  DEFAULT_SHIPPING_SERVICE,
  SHIPPING_SERVICES,
  getManualShippingQuote,
  isFreeShippingPostalCode,
  normalizePostalCode,
} from '../config/shipping.js'
import { isCorreoArgentinoConfigured } from '../config/correoArgentino.js'
import { fetchRates, fitsCarrierLimits } from './correoArgentinoApi.js'
import { buildShippingPackage } from './shippingPackage.js'

const MANUAL_PROVIDER = 'manual'
const CORREO_ARGENTINO_PROVIDER = 'correo_argentino'
const AUTO_PROVIDER = 'auto'

// Envío a domicilio o a sucursal de Correo. Son los dos valores que entiende el
// resto del sistema; la API los llama "D" y "S".
export const DELIVERY_OPTIONS = ['home', 'branch']
export const DEFAULT_DELIVERY_OPTION = 'home'

const DELIVERED_TYPE_BY_OPTION = { home: 'D', branch: 'S' }
const OPTION_BY_DELIVERED_TYPE = { D: 'home', S: 'branch' }

// Correo cotiza DOS productos por modalidad: Clásico (CP) y Expreso (EP), y el
// Expreso puede costar el triple. Hay que elegir por `productType` y no por el
// orden en que vienen: si algún día Correo invierte el orden del array, tomar
// "el primero" pasaría a cobrarle Expreso a todo el mundo sin que nadie lo pida.
const PRODUCT_TYPE_BY_SERVICE = { clasico: 'CP', expreso: 'EP' }
const SERVICE_BY_PRODUCT_TYPE = { CP: 'clasico', EP: 'expreso' }

// Etiqueta de cada servicio para la tienda. El id crudo ('clasico') no se le
// muestra nunca al cliente.
const SERVICE_LABELS = { clasico: 'Clásico', expreso: 'Expreso' }

export function normalizeDeliveryOption(value) {
  const option = String(value || '').trim().toLowerCase()
  return DELIVERY_OPTIONS.includes(option) ? option : DEFAULT_DELIVERY_OPTION
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

// `manual` apaga la API por completo. `auto` (el valor por defecto) la usa si
// está configurada. `correo_argentino` se mantiene como sinónimo de `auto`
// porque es el valor que ya está documentado en el README y puede estar cargado
// en Railway.
function resolveProvider() {
  const provider = (process.env.SHIPPING_PROVIDER || AUTO_PROVIDER).trim().toLowerCase()
  if (provider === MANUAL_PROVIDER) return MANUAL_PROVIDER
  if (provider === CORREO_ARGENTINO_PROVIDER || provider === AUTO_PROVIDER) return AUTO_PROVIDER
  // Un valor desconocido no debería tirar abajo el checkout: se avisa y se
  // cotiza con la tabla, que es la opción que siempre funciona.
  console.warn(`[shippingQuotes] Proveedor de envío desconocido: ${provider}. Se usa el tarifario manual.`)
  return MANUAL_PROVIDER
}

// Etiquetas de la cotización de Correo. `productName` viene de la API
// ("Correo Argentino Clasico") y se usa como descripción cuando está.
function describeRate(deliveryOption, rate) {
  const carrier = rate?.productName?.trim() || 'Correo Argentino'
  return deliveryOption === 'branch'
    ? { id: 'correo_sucursal', label: 'Envío a sucursal', description: `${carrier} — retirás en la sucursal que elijas` }
    : { id: 'correo_domicilio', label: 'Envío a domicilio', description: `${carrier} — entrega en tu domicilio` }
}

// Una opción cotizada = una combinación de modalidad (domicilio/sucursal) y
// servicio (clásico/expreso). El checkout las muestra todas con su precio y su
// plazo, así elegir no cuesta una cotización nueva.
function toOption(deliveryOption, service, rate) {
  return {
    deliveryOption,
    service,
    serviceLabel: SERVICE_LABELS[service] || service,
    ...describeRate(deliveryOption, rate),
    cost: roundMoney(rate.price),
    transitMin: Number.isFinite(rate.deliveryTimeMin) ? rate.deliveryTimeMin : null,
    transitMax: Number.isFinite(rate.deliveryTimeMax) ? rate.deliveryTimeMax : null,
  }
}

// La tarifa de la API se toma tal cual: es el importe final que cobra Correo.
// No se le suma seguro ni IVA — esa fórmula es del tarifario Andreani, que se
// informa sin impuestos (ver config/shipping.js) y no aplica acá.
function toQuote({ postalCode, service, deliveryOption, rate }) {
  const cost = roundMoney(rate.price)
  return {
    ...describeRate(deliveryOption, rate),
    postalCode,
    service,
    serviceLabel: SERVICE_LABELS[service] || service,
    deliveryOption,
    cost,
    breakdown: { base: cost, insurance: 0, subtotal: cost, iva: 0, surcharge: 0, total: cost },
    // Días hábiles de tránsito del correo, informados por la propia API. Le
    // ahorran a estimateDeliveryDate tener que adivinarlos con TRANSIT_BANDS.
    transit: Number.isFinite(rate.deliveryTimeMin) && Number.isFinite(rate.deliveryTimeMax)
      ? { min: rate.deliveryTimeMin, max: rate.deliveryTimeMax }
      : null,
    source: 'correo_argentino',
  }
}

async function quoteWithCorreoArgentino({ postalCode, service, deliveryOption, shippingPackage }) {
  // Un solo viaje trae las cuatro combinaciones: domicilio y sucursal, por
  // Clásico y Expreso (la API devuelve todo cuando no se manda `deliveredType`
  // ni se filtra por producto). El checkout las muestra todas con su precio.
  const rates = await fetchRates({
    postalCodeDestination: postalCode,
    dimensions: shippingPackage,
  })

  // Indexadas por modalidad + servicio. Si Correo repite una combinación, se
  // queda la más barata: nunca la más cara por orden de llegada.
  const porCombinacion = new Map()
  for (const rate of rates) {
    const option = OPTION_BY_DELIVERED_TYPE[rate.deliveredType]
    const servicio = SERVICE_BY_PRODUCT_TYPE[rate.productType]
    if (!option || !servicio) continue
    const clave = `${option}|${servicio}`
    const previo = porCombinacion.get(clave)
    if (!previo || rate.price < previo.price) porCombinacion.set(clave, rate)
  }

  const options = [...porCombinacion.entries()]
    .map(([clave, rate]) => {
      const [option, servicio] = clave.split('|')
      return toOption(option, servicio, rate)
    })
    .sort((a, b) => a.cost - b.cost)

  let elegida = porCombinacion.get(`${deliveryOption}|${service}`)

  // Si Correo no cotizó exactamente lo pedido, se toma la más barata de esa
  // modalidad antes que fallar: el cliente igual recibe un precio real y no la
  // tarifa de respaldo. Nunca la más cara por descarte.
  let servicioElegido = service
  if (!elegida) {
    const mismaModalidad = options.filter((o) => o.deliveryOption === deliveryOption)
    if (mismaModalidad.length === 0) {
      throw new Error(`Correo Argentino no cotizó la modalidad ${deliveryOption} para el CP ${postalCode}`)
    }
    servicioElegido = mismaModalidad[0].service
    elegida = porCombinacion.get(`${deliveryOption}|${servicioElegido}`)
  }

  const quote = toQuote({ postalCode, service: servicioElegido, deliveryOption, rate: elegida })
  quote.options = options
  return quote
}

// Cotización con el tarifario Andreani. Es la que se usa cuando la API no está.
//
// Dos cosas que el tarifario no sabe hacer, y cómo se resuelven:
//
//  - **No distingue domicilio de sucursal.** Tiene una sola tarifa, la de
//    domicilio. Si el cliente había elegido sucursal se le cobra esa: nunca es
//    más barata que la de sucursal, así que no se subcobra, y no se le frena la
//    compra por una caída del transportista.
//  - **No tarifa el Expreso.** Ahí sí se fuerza el Clásico, porque cobrar la
//    tarifa del Clásico por un Expreso sería vender un servicio más caro del que
//    se cobra. El pedido queda registrado como Clásico, que es lo que se cobró y
//    lo que se va a despachar — el cliente lo ve así en la confirmación.
function quoteWithTarifario({ postalCode, deliveryOption, weightKg, declaredValue }) {
  const service = DEFAULT_SHIPPING_SERVICE
  const quote = getManualShippingQuote({ postalCode, service, weightKg, declaredValue })
  if (!quote) return null
  return {
    ...quote,
    serviceLabel: SERVICE_LABELS[service],
    deliveryOption,
    transit: null,
    options: [{
      deliveryOption,
      service,
      serviceLabel: SERVICE_LABELS[service],
      id: quote.id,
      label: quote.label,
      description: quote.description,
      cost: quote.cost,
      transitMin: null,
      transitMax: null,
    }],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// quoteShipping
//
// `items` (opcional) son los productos del pedido con sus medidas, y sirven
// para armar el bulto que la API necesita. Sin `items` se cotiza con una caja
// por defecto: sirve para la vista previa, pero la creación de la orden siempre
// los manda (routes/orders.js los tiene de la DB).
//
// Devuelve null sólo si NINGUNA de las dos fuentes puede cotizar (CP inválido,
// o un peso que el tarifario no tarifa). Ese null es el que termina derivando
// al cliente a WhatsApp.
// ─────────────────────────────────────────────────────────────────────────────
export async function quoteShipping({
  postalCode,
  service = DEFAULT_SHIPPING_SERVICE,
  weightKg = 0,
  declaredValue = 0,
  deliveryOption = DEFAULT_DELIVERY_OPTION,
  items = null,
} = {}) {
  if (!SHIPPING_SERVICES.includes(service)) return null

  const normalizedPostalCode = normalizePostalCode(postalCode)
  const option = normalizeDeliveryOption(deliveryOption)

  // Envío sin cargo por localidad (City Bell / Gonnet / Villa Elisa): lo
  // entrega el local, así que no hay nada que cotizarle a Correo. Se resuelve
  // antes de elegir proveedor para no gastar una llamada de red en un envío
  // que vale cero.
  if (isFreeShippingPostalCode(normalizedPostalCode)) {
    return quoteWithTarifario({
      postalCode: normalizedPostalCode,
      deliveryOption: option,
      weightKg,
      declaredValue,
    })
  }

  const fallback = () =>
    quoteWithTarifario({ postalCode: normalizedPostalCode, deliveryOption: option, weightKg, declaredValue })

  if (resolveProvider() === MANUAL_PROVIDER) return fallback()
  if (!isCorreoArgentinoConfigured()) return fallback()

  // El bulto: medidas reales de los productos cuando están cargadas, caja por
  // defecto cuando no. Si `items` no vino, se usa el peso agregado que mandó el
  // caller para no perderlo.
  const shippingPackage = items?.length
    ? buildShippingPackage(items)
    : buildShippingPackage([{ quantity: 1, weightKg }])

  // Un bulto fuera de los límites de la API (más de 25 kg, o un lado de más de
  // 150 cm) devuelve 400. Se detecta sin llamar y se cotiza con el tarifario,
  // que llega hasta 50 kg.
  if (!fitsCarrierLimits(shippingPackage)) return fallback()

  try {
    return await quoteWithCorreoArgentino({
      postalCode: normalizedPostalCode,
      service,
      deliveryOption: option,
      shippingPackage,
    })
  } catch (err) {
    // Se loguea con el CP para poder reconstruir qué pasó, nunca con
    // credenciales: el error del cliente HTTP ya viene sin ellas.
    console.error(
      `[shippingQuotes] Cotización de Correo Argentino fallida para el CP ${normalizedPostalCode}, se usa el tarifario: ${err.message}`,
    )
    return fallback()
  }
}
