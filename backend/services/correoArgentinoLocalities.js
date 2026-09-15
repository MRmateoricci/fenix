// Índice código postal → provincia y localidades, para autocompletar el
// formulario de envío.
//
// Los datos salen de las sucursales de Correo (`/agencies`), que informan
// `postalCode`, `locality` y `province` de cada una. Es deliberado no escribir
// a mano una tabla de rangos de CP por provincia: los bordes provinciales no
// siguen los bloques numéricos, y una tabla adivinada le completaría al cliente
// una provincia equivocada — peor que dejarle el campo vacío.
//
// El índice se arma una vez y se guarda en memoria. Mientras no está listo, la
// búsqueda devuelve null y el formulario queda como texto libre: es una ayuda,
// nunca un requisito para comprar.

import { PROVINCE_CODES, isCorreoArgentinoConfigured } from '../config/correoArgentino.js'
import { fetchAgencies } from './correoArgentinoApi.js'

// Un día: las sucursales de Correo no se mudan de un checkout al otro.
const INDEX_TTL_MS = 24 * 60 * 60 * 1000

// Cuántas provincias se piden en paralelo. Son 24 llamadas; de a tres no
// castiga a la API de Correo ni tarda una eternidad.
const CONCURRENCY = 3

let index = null // Map<cp4, { provinceCode, province, localities: string[] }>
let indexedAt = 0
let building = null

function postalCodeDigits(value) {
  // Los CP de las sucursales vienen en formato CPA ("B1842ZAB"). El tramo de
  // cuatro dígitos es lo que escribe el cliente en el formulario.
  const match = String(value || '').match(/\d{4}/)
  return match ? match[0] : null
}

// Partículas que en español van en minúscula dentro de un nombre propio, salvo
// que abran el nombre ("Tierra del Fuego", pero "Del Viso").
const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e'])

function titleCase(value) {
  // La API devuelve todo en mayúsculas ("GENERAL SAN MARTIN", "SANTA FE").
  // Gritarle al cliente en un campo de formulario queda mal.
  return String(value || '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((palabra, i) => (i > 0 && MINUSCULAS.has(palabra)
      ? palabra
      : palabra.replace(/(^|[’'-])([a-záéíóúñ])/g, (_, sep, letra) => sep + letra.toUpperCase())))
    .join(' ')
}

async function buildIndex() {
  const nuevo = new Map()

  const pendientes = [...PROVINCE_CODES]
  async function worker() {
    while (pendientes.length > 0) {
      const provinceCode = pendientes.shift()
      let agencies = []
      try {
        agencies = await fetchAgencies(provinceCode)
      } catch (err) {
        // Una provincia que falla no invalida el resto del índice: se pierde el
        // autocompletado de esa provincia y nada más.
        console.error(`[localidades] No se pudieron leer las sucursales de ${provinceCode}: ${err.message}`)
        continue
      }
      for (const agency of agencies) {
        const cp = postalCodeDigits(agency.postalCode)
        const locality = titleCase(agency.locality)
        if (!cp || !locality) continue
        const entrada = nuevo.get(cp) || {
          provinceCode: agency.provinceCode || provinceCode,
          province: agency.province ? titleCase(agency.province) : null,
          localities: [],
        }
        if (!entrada.localities.includes(locality)) entrada.localities.push(locality)
        nuevo.set(cp, entrada)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  index = nuevo
  indexedAt = Date.now()
  console.log(`[localidades] Índice de códigos postales armado: ${nuevo.size} CP`)
  return nuevo
}

function isFresh() {
  return index && Date.now() - indexedAt < INDEX_TTL_MS
}

// Dispara el armado del índice sin esperarlo. Se llama en cada búsqueda que
// llega con el índice frío, para que la siguiente ya tenga respuesta.
function ensureIndex() {
  if (isFresh() || building) return
  if (!isCorreoArgentinoConfigured()) return
  building = buildIndex()
    .catch((err) => { console.error('[localidades] Falló el armado del índice:', err.message) })
    .finally(() => { building = null })
}

// Devuelve { provinceCode, province, localities } o null si todavía no se sabe.
// Nunca espera al índice: un formulario que se traba esperando a Correo es peor
// que uno sin autocompletado.
export function lookupPostalCode(postalCode) {
  ensureIndex()
  const cp = postalCodeDigits(postalCode)
  if (!cp || !isFresh()) return null
  return index.get(cp) || null
}

// Localidades de una provincia, para sugerir cuando el CP exacto no tiene
// sucursal. Devuelve array vacío si el índice no está listo.
export function localitiesForProvince(provinceCode) {
  ensureIndex()
  if (!isFresh() || !provinceCode) return []
  const nombres = new Set()
  for (const entrada of index.values()) {
    if (entrada.provinceCode === provinceCode) {
      for (const locality of entrada.localities) nombres.add(locality)
    }
  }
  return [...nombres].sort((a, b) => a.localeCompare(b, 'es-AR'))
}

// Sólo para tests: descarta el índice armado.
export function resetLocalityIndex() {
  index = null
  indexedAt = 0
  building = null
}
