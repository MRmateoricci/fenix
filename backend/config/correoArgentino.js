// Configuración de la API MiCorreo (Correo Argentino). Única fuente de verdad
// de credenciales, ambiente y límites del transportista: el cliente HTTP
// (services/correoArgentinoApi.js) no lee env vars por su cuenta.
//
// La API no cotiza cualquier bulto. Sus límites son duros y, si se los pasa,
// responde 400 en vez de una tarifa — por eso están acá y no repartidos por el
// código: el cotizador necesita saber ANTES de llamar si el pedido entra, para
// caer al tarifario manual sin gastar un viaje de red.

// Ambientes exteriorizados del PDF de Correo. Los locales (`.correo.local`) no
// se contemplan: sólo son alcanzables desde la red de Correo.
const BASE_URLS = {
  test: 'https://apitest.correoargentino.com.ar/micorreo/v1',
  prod: 'https://api.correoargentino.com.ar/micorreo/v1',
}

const DEFAULT_ENVIRONMENT = 'test'

// Límites del bulto según /rates. `weight` va en gramos; alto, ancho y largo en
// centímetros. El máximo de 25 kg es el que parte aguas contra el tarifario
// Andreani, que llega a 50 kg: un pedido más pesado que esto no lo cotiza la
// API y tiene que resolverlo el fallback manual.
export const CARRIER_LIMITS = {
  minWeightGrams: 1,
  maxWeightGrams: 25000,
  maxSideCm: 150,
}

// Caja por defecto para los productos que todavía no tienen medidas cargadas.
// Un artefacto de iluminación embalado ronda esto; es deliberadamente chica
// para no encarecer la cotización por datos que faltan, misma decisión que ya
// toma el tarifario manual cuando no hay peso (config/shipping.js).
export const DEFAULT_PACKAGE = {
  lengthCm: Number(process.env.ENVIO_CAJA_LARGO_CM)  || 30,
  widthCm:  Number(process.env.ENVIO_CAJA_ANCHO_CM)  || 20,
  heightCm: Number(process.env.ENVIO_CAJA_ALTO_CM)   || 15,
}

// Desde dónde se despacha. City Bell, 1896. Va por env var porque es el único
// dato del origen que la API necesita para cotizar y puede cambiar sin tocar
// código si algún día se despacha desde otro lado.
export const ORIGIN_POSTAL_CODE = String(process.env.ENVIO_CP_ORIGEN || '1896').trim()

// El token de /token vence (el PDF muestra ~2,5 h). Se renueva con este margen
// para no mandar una request con un token que vence en el camino.
export const TOKEN_RENEWAL_MARGIN_MS = 5 * 60 * 1000

// Si la API no contesta en este tiempo, se corta y se cotiza con el tarifario
// manual. Un checkout que espera indefinidamente es peor que uno que cobra la
// tarifa de la tabla.
export const REQUEST_TIMEOUT_MS = Number(process.env.CORREO_ARGENTINO_TIMEOUT_MS) || 8000

// El token tiene su propio presupuesto, más generoso. La primera conexión de un
// proceso recién arrancado paga DNS y TLS en frío y se pasa de los 8 segundos —
// se vio contra el ambiente productivo. Como el token se pide una vez cada
// varias horas, esperar un poco más sale mucho más barato que mandar el primer
// checkout después de cada deploy al tarifario.
export const TOKEN_TIMEOUT_MS = Number(process.env.CORREO_ARGENTINO_TOKEN_TIMEOUT_MS) || 20000

// Códigos de provincia de la API (tabla "Province Codes" del PDF). Los necesita
// /agencies para listar sucursales. El checkout pide la provincia como texto
// libre, así que la clave se normaliza sin acentos ni mayúsculas y se aceptan
// las formas que realmente escribe la gente ("caba", "bs as", "capital federal").
const PROVINCE_CODES_BY_NAME = {
  'salta': 'A',
  'buenos aires': 'B',
  'provincia de buenos aires': 'B',
  'bs as': 'B',
  'bsas': 'B',
  'capital federal': 'C',
  'caba': 'C',
  'ciudad autonoma de buenos aires': 'C',
  'ciudad autonoma buenos aires': 'C',
  'ciudad de buenos aires': 'C',
  'san luis': 'D',
  'entre rios': 'E',
  'la rioja': 'F',
  'santiago del estero': 'G',
  'chaco': 'H',
  'san juan': 'J',
  'catamarca': 'K',
  'la pampa': 'L',
  'mendoza': 'M',
  'misiones': 'N',
  'formosa': 'P',
  'neuquen': 'Q',
  'rio negro': 'R',
  'santa fe': 'S',
  'tucuman': 'T',
  'chubut': 'U',
  'tierra del fuego': 'V',
  'corrientes': 'W',
  'cordoba': 'X',
  'jujuy': 'Y',
  'santa cruz': 'Z',
}

export const PROVINCE_CODES = Object.freeze([...new Set(Object.values(PROVINCE_CODES_BY_NAME))])

function normalizeProvinceName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Devuelve el código de provincia de la API, o null si el texto no matchea.
// Acepta tanto el nombre ("Buenos Aires") como el código ya resuelto ("B").
export function getProvinceCode(province) {
  const raw = String(province || '').trim()
  if (raw.length === 1 && PROVINCE_CODES.includes(raw.toUpperCase())) return raw.toUpperCase()
  return PROVINCE_CODES_BY_NAME[normalizeProvinceName(raw)] || null
}

// ─────────────────────────────────────────────────────────────────────────────
// Credenciales. `user`/`password` son el Basic Auth de /token; `customerId` es
// el identificador de la cuenta MiCorreo y viaja en el cuerpo de /rates y en la
// query de /agencies.
//
// CLIENT_ID/CLIENT_SECRET se siguen leyendo como alias: son los nombres que
// quedaron documentados en el README y cargados en Railway antes de conocer la
// documentación, donde se creía que la API era OAuth. Renombrarlos sin alias
// apagaría la integración en producción sin que nadie toque nada.
// ─────────────────────────────────────────────────────────────────────────────
export function getCorreoArgentinoConfig() {
  const environment = String(process.env.CORREO_ARGENTINO_ENV || DEFAULT_ENVIRONMENT)
    .trim()
    .toLowerCase()

  const baseUrl = String(
    process.env.CORREO_ARGENTINO_API_URL || BASE_URLS[environment] || BASE_URLS[DEFAULT_ENVIRONMENT],
  )
    .trim()
    .replace(/\/+$/, '')

  const user = String(
    process.env.CORREO_ARGENTINO_USER || process.env.CORREO_ARGENTINO_CLIENT_ID || '',
  ).trim()

  const password = String(
    process.env.CORREO_ARGENTINO_PASSWORD || process.env.CORREO_ARGENTINO_CLIENT_SECRET || '',
  ).trim()

  const customerId = String(process.env.CORREO_ARGENTINO_CUSTOMER_ID || '').trim()

  return {
    environment: environment === 'prod' ? 'prod' : environment,
    baseUrl,
    user,
    password,
    customerId,
    originPostalCode: ORIGIN_POSTAL_CODE,
  }
}

// La integración se considera configurada sólo con las tres cosas juntas. Sin
// customerId el token se obtiene igual pero /rates responde 402 "Cliente FAP no
// identificado", así que no alcanza con las credenciales.
export function isCorreoArgentinoConfigured(config = getCorreoArgentinoConfig()) {
  return Boolean(config.baseUrl && config.user && config.password && config.customerId)
}

// Qué falta, para el log de arranque y el script de prueba. Nunca incluye
// valores, sólo nombres de variables.
export function missingCorreoArgentinoConfig(config = getCorreoArgentinoConfig()) {
  const missing = []
  if (!config.baseUrl)    missing.push('CORREO_ARGENTINO_API_URL')
  if (!config.user)       missing.push('CORREO_ARGENTINO_USER')
  if (!config.password)   missing.push('CORREO_ARGENTINO_PASSWORD')
  if (!config.customerId) missing.push('CORREO_ARGENTINO_CUSTOMER_ID')
  return missing
}
