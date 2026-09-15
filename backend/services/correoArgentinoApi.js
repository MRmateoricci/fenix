// Cliente HTTP de la API MiCorreo (Correo Argentino).
//
// Sólo habla con la API y traduce sus respuestas: no decide precios, no aplica
// envío gratis y no sabe qué hay en el carrito. Esas decisiones son de
// services/shippingQuotes.js, que es también quien cae al tarifario manual
// cuando este módulo falla. Acá un error se tira; no se disfraza de cotización.

import {
  CARRIER_LIMITS,
  REQUEST_TIMEOUT_MS,
  TOKEN_RENEWAL_MARGIN_MS,
  TOKEN_TIMEOUT_MS,
  getCorreoArgentinoConfig,
  isCorreoArgentinoConfigured,
  missingCorreoArgentinoConfig,
} from '../config/correoArgentino.js'

// ─────────────────────────────────────────────────────────────────────────────
// Diagnóstico de fallas de red
//
// `fetch` de Node tira siempre el mismo `TypeError: fetch failed` y esconde el
// motivo real en `cause` (a veces anidado dos niveles). Loguear sólo el mensaje
// deja en el log "fetch failed" para un timeout, un DNS caído y una conexión
// cortada por igual — tres problemas distintos con tres soluciones distintas.
// ─────────────────────────────────────────────────────────────────────────────
function describeFetchError(err) {
  const causas = []
  for (let actual = err; actual; actual = actual.cause) {
    const detalle = actual.code || actual.name
    if (detalle && !causas.includes(detalle)) causas.push(detalle)
    if (actual === actual.cause) break
  }
  const cadena = causas.join(' → ')
  return cadena ? `${err.message} (${cadena})` : err.message
}

// Un timeout no se reintenta: ya se esperó lo que se podía esperar y repetir
// duplica la espera del cliente. Una conexión que ni se abrió (DNS, TLS, reset)
// falla en menos de un segundo, así que reintentarla una vez sale casi gratis.
function isTimeout(err) {
  for (let actual = err; actual; actual = actual.cause) {
    if (actual.name === 'TimeoutError' || actual.code === 'ABORT_ERR') return true
    if (actual === actual.cause) break
  }
  return false
}

export class CorreoArgentinoError extends Error {
  constructor(message, { code = 'CORREO_ARGENTINO_ERROR', status = null, cause } = {}) {
    super(message, { cause })
    this.name = 'CorreoArgentinoError'
    this.code = code
    this.status = status
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Token
//
// Se cachea en memoria del proceso. Es deliberado que no se persista: el token
// dura horas, un reinicio de Railway pide uno nuevo y eso cuesta una request,
// mientras que dejarlo en disco es una credencial más para custodiar.
//
// `inFlightToken` evita la estampida: si llegan tres checkouts juntos con el
// token vencido, se pide UN token y los tres esperan el mismo, en vez de
// disparar tres /token simultáneos contra Correo.
// ─────────────────────────────────────────────────────────────────────────────
let cachedToken = null // { token, expiresAt, context }
let inFlightToken = null

// Identidad de la credencial con la que se pidió el token cacheado. Si cambia
// el ambiente o el usuario (tests, o un redeploy con otras env vars), el token
// viejo no sirve y hay que pedir uno nuevo aunque no haya vencido.
function credentialContext(config) {
  return `${config.baseUrl}|${config.user}`
}

// El vencimiento sale del claim `exp` del propio JWT, en epoch UTC. El campo
// `expires` de la respuesta viene en hora argentina sin zona ("2022-04-26
// 21:16:20"): parsearlo en un servidor en UTC daría tres horas de más y el
// token se usaría vencido. Por eso el JWT manda y `expires` es sólo el respaldo.
function readTokenExpiry(token, expiresText) {
  const payload = String(token || '').split('.')[1]
  if (payload) {
    try {
      const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      if (Number.isFinite(Number(json?.exp))) return Number(json.exp) * 1000
    } catch {
      // Token con una forma que no esperábamos: se sigue con `expires`.
    }
  }

  const text = String(expiresText || '').trim()
  if (text) {
    // Se fuerza -03:00 porque la API informa en hora argentina.
    const parsed = Date.parse(`${text.replace(' ', 'T')}-03:00`)
    if (Number.isFinite(parsed)) return parsed
  }

  // Sin dato confiable: se asume corto y se renueva seguido. Perder una request
  // de más es barato al lado de mandar cotizaciones con un token vencido.
  return Date.now() + 10 * 60 * 1000
}

async function requestToken(config) {
  const credentials = Buffer.from(`${config.user}:${config.password}`).toString('base64')

  let response
  try {
    response = await fetch(`${config.baseUrl}/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}` },
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    })
  } catch (err) {
    throw new CorreoArgentinoError(
      `No se pudo contactar a Correo Argentino para autenticar: ${describeFetchError(err)}`,
      { code: 'CORREO_ARGENTINO_UNREACHABLE', cause: err },
    )
  }

  const body = await response.json().catch(() => null)

  if (!response.ok || !body?.token) {
    // El mensaje de la API se incluye tal cual: no trae datos sensibles (401
    // "Unauthorized", 402 con el detalle del rechazo) y sin él el diagnóstico
    // desde los logs de Railway es adivinanza.
    throw new CorreoArgentinoError(
      `Correo Argentino rechazó las credenciales (${response.status}): ${body?.message || 'sin detalle'}`,
      { code: 'CORREO_ARGENTINO_AUTH_FAILED', status: response.status },
    )
  }

  return {
    token: body.token,
    expiresAt: readTokenExpiry(body.token, body.expires),
    context: credentialContext(config),
  }
}

function isTokenUsable(entry, config) {
  return Boolean(
    entry
    && entry.context === credentialContext(config)
    && entry.expiresAt - TOKEN_RENEWAL_MARGIN_MS > Date.now(),
  )
}

async function getToken(config) {
  if (isTokenUsable(cachedToken, config)) return cachedToken.token
  if (inFlightToken) return inFlightToken

  inFlightToken = requestToken(config)
    .then((entry) => {
      cachedToken = entry
      return entry.token
    })
    .finally(() => {
      inFlightToken = null
    })

  return inFlightToken
}

// Sólo para los tests y el script de prueba: fuerza que la próxima llamada pida
// un token nuevo.
export function resetCorreoArgentinoTokenCache() {
  cachedToken = null
  inFlightToken = null
}

// Comprueba únicamente que usuario y contraseña sirvan. Se separa del resto
// porque el customerId no hace falta para autenticar: permite verificar las
// credenciales apenas llegan, sin esperar a tener el número de cliente.
// Devuelve la fecha de vencimiento del token para saber cada cuánto se renueva.
export async function verifyCorreoArgentinoCredentials() {
  const config = getCorreoArgentinoConfig()
  if (!config.baseUrl || !config.user || !config.password) {
    throw new CorreoArgentinoError('Faltan CORREO_ARGENTINO_USER / CORREO_ARGENTINO_PASSWORD', {
      code: 'CORREO_ARGENTINO_NOT_CONFIGURED',
    })
  }
  const entry = await requestToken(config)
  return { expiresAt: new Date(entry.expiresAt) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Request autenticada
// ─────────────────────────────────────────────────────────────────────────────
// `requiresCustomerId` existe por /users/validate: es el endpoint que sirve
// justamente para averiguar el customerId, así que exigirlo antes de llamarlo
// dejaría a la integración sin forma de arrancar.
async function authenticatedRequest(path, { method = 'GET', body, query, requiresCustomerId = true } = {}) {
  const config = getCorreoArgentinoConfig()
  const missing = missingCorreoArgentinoConfig(config)
    .filter((name) => requiresCustomerId || name !== 'CORREO_ARGENTINO_CUSTOMER_ID')
  if (missing.length > 0) {
    throw new CorreoArgentinoError(
      `Faltan credenciales de Correo Argentino: ${missing.join(', ')}`,
      { code: 'CORREO_ARGENTINO_NOT_CONFIGURED' },
    )
  }

  const token = await getToken(config)
  const url = new URL(`${config.baseUrl}${path}`)
  for (const [key, value] of Object.entries(query || {})) {
    if (value != null && value !== '') url.searchParams.set(key, String(value))
  }

  const enviar = () => fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  let response
  try {
    response = await enviar()
  } catch (err) {
    // La API de Correo corta conexiones de vez en cuando. Un reintento
    // convierte esa falla en una cotización real en vez de mandar al cliente al
    // tarifario por un tropiezo de un segundo. Los timeouts no se reintentan.
    if (isTimeout(err)) {
      throw new CorreoArgentinoError(
        `Correo Argentino no respondió a tiempo (${path}): ${describeFetchError(err)}`,
        { code: 'CORREO_ARGENTINO_TIMEOUT', cause: err },
      )
    }
    try {
      response = await enviar()
    } catch (err2) {
      throw new CorreoArgentinoError(
        `No se pudo contactar a Correo Argentino (${path}, 2 intentos): ${describeFetchError(err2)}`,
        { code: 'CORREO_ARGENTINO_UNREACHABLE', cause: err2 },
      )
    }
  }

  // Un 401 con token cacheado significa que el token murió antes de lo que
  // decía. Se descarta para que el próximo intento pida uno nuevo, en vez de
  // dejar la integración caída hasta que reinicie el proceso.
  if (response.status === 401) {
    resetCorreoArgentinoTokenCache()
  }

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new CorreoArgentinoError(
      `Correo Argentino respondió ${response.status} en ${path}: ${payload?.message || payload?.error || 'sin detalle'}`,
      { code: 'CORREO_ARGENTINO_REQUEST_FAILED', status: response.status },
    )
  }

  // La API contesta 200 con un objeto de error en algunos casos (el PDF lo
  // muestra en /shipping/tracking). Tratar eso como éxito sería devolver una
  // cotización vacía como si fuera buena.
  if (payload && !Array.isArray(payload) && payload.error) {
    throw new CorreoArgentinoError(
      `Correo Argentino devolvió un error en ${path}: ${payload.error}`,
      { code: 'CORREO_ARGENTINO_REQUEST_FAILED', status: 200 },
    )
  }

  return payload
}

// ─────────────────────────────────────────────────────────────────────────────
// /users/validate — averigua el customerId de una cuenta MiCorreo
//
// No lo usa la tienda: el customerId es un valor de configuración que se carga
// una vez en CORREO_ARGENTINO_CUSTOMER_ID. Existe para el script de prueba,
// porque sin él no hay forma de arrancar la integración salvo que Correo lo
// informe a mano.
// ─────────────────────────────────────────────────────────────────────────────
export async function fetchCustomerId({ email, password }) {
  const body = await authenticatedRequest('/users/validate', {
    method: 'POST',
    body: { email, password },
    requiresCustomerId: false,
  })

  if (!body?.customerId) {
    throw new CorreoArgentinoError('Correo Argentino no devolvió un customerId para esa cuenta', {
      code: 'CORREO_ARGENTINO_NO_CUSTOMER_ID',
    })
  }
  return String(body.customerId)
}

// ─────────────────────────────────────────────────────────────────────────────
// /rates — cotización
//
// `deliveredType` es "D" (domicilio) o "S" (sucursal). Si se omite, la API
// devuelve las dos y así se piden ambas en un solo viaje de red.
// ─────────────────────────────────────────────────────────────────────────────

// Si el bulto no entra en los límites de la API, no tiene sentido preguntarle:
// responde 400 y el checkout paga la espera de la red para nada. Se chequea
// antes de llamar y el cotizador cae al tarifario manual.
export function fitsCarrierLimits({ weightGrams, lengthCm, widthCm, heightCm }) {
  return (
    Number.isFinite(weightGrams)
    && weightGrams >= CARRIER_LIMITS.minWeightGrams
    && weightGrams <= CARRIER_LIMITS.maxWeightGrams
    && [lengthCm, widthCm, heightCm].every(
      (side) => Number.isFinite(side) && side > 0 && side <= CARRIER_LIMITS.maxSideCm,
    )
  )
}

export async function fetchRates({ postalCodeDestination, deliveredType, dimensions }) {
  const config = getCorreoArgentinoConfig()

  const payload = {
    customerId: config.customerId,
    postalCodeOrigin: config.originPostalCode,
    postalCodeDestination: String(postalCodeDestination || '').trim(),
    // Enteros: la API rechaza decimales en dimensions.
    dimensions: {
      weight: Math.round(dimensions.weightGrams),
      height: Math.round(dimensions.heightCm),
      width: Math.round(dimensions.widthCm),
      length: Math.round(dimensions.lengthCm),
    },
  }
  if (deliveredType) payload.deliveredType = deliveredType

  const body = await authenticatedRequest('/rates', { method: 'POST', body: payload })
  const rates = Array.isArray(body?.rates) ? body.rates : []

  if (rates.length === 0) {
    throw new CorreoArgentinoError('Correo Argentino no devolvió tarifas para ese destino', {
      code: 'CORREO_ARGENTINO_NO_RATES',
    })
  }

  return rates.map((rate) => ({
    deliveredType: rate.deliveredType,
    productType: rate.productType,
    productName: rate.productName,
    price: Number(rate.price),
    // La API los manda como string ("2", "5"). Se normalizan a número acá para
    // que nadie aguas abajo tenga que acordarse.
    deliveryTimeMin: Number(rate.deliveryTimeMin),
    deliveryTimeMax: Number(rate.deliveryTimeMax),
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// /agencies — sucursales de una provincia
//
// Se filtra por `packageReception`: una sucursal que no recibe paquetes no
// puede ser destino de un envío a sucursal, y ofrecerla sería mandar al cliente
// a retirar donde nunca va a llegar el bulto.
// ─────────────────────────────────────────────────────────────────────────────
export async function fetchAgencies(provinceCode) {
  const config = getCorreoArgentinoConfig()

  const body = await authenticatedRequest('/agencies', {
    query: { customerId: config.customerId, provinceCode },
  })

  const agencies = Array.isArray(body) ? body : []

  return agencies
    .filter((agency) => agency?.status === 'ACTIVE' && agency?.services?.packageReception)
    .map((agency) => {
      const address = agency.location?.address || {}
      return {
        code: agency.code,
        name: agency.name,
        phone: agency.phone || null,
        street: [address.streetName, address.streetNumber].filter(Boolean).join(' ') || null,
        locality: address.locality || address.city || null,
        province: address.province || null,
        provinceCode: address.provinceCode || provinceCode,
        postalCode: address.postalCode || null,
        hours: agency.hours || null,
      }
    })
}
