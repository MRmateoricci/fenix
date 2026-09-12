import { access } from 'fs/promises'
import path from 'path'
import { uploadsDir } from '../config/uploads.js'

// ─────────────────────────────────────────────────────────────────────────────
// Detección de fotos rotas — `products.image_url` puede quedar apuntando a un
// archivo que ya no existe (subidas anteriores al volumen persistente de
// Railway, catálogos de proveedor que dieron de baja la imagen). Para el panel
// esos productos cuentan como "con imagen", el feed de Meta los manda con un
// `image_link` que devuelve 404 y la tienda muestra el placeholder. Nada en la
// base distingue "URL cargada" de "URL que responde", así que hay que
// verificarlo una por una.
// ─────────────────────────────────────────────────────────────────────────────

export const UPLOADS_URL_PREFIX = '/uploads/'
const DEFAULT_TIMEOUT_MS = 8000
const DEFAULT_CONCURRENCY = 8

// Decide cómo se verifica una URL. Las fotos subidas desde el panel se guardan
// absolutas con el host del momento (`req.get('host')`), que puede ser el
// dominio propio o el interno de Railway; da igual, el archivo vive en
// `uploadsDir`, así que cualquier path `/uploads/...` se mira en disco y no por
// HTTP: es más rápido y no depende de que el host viejo siga resolviendo.
export function classifyImageUrl(url) {
  const raw = String(url || '').trim()
  if (!raw) return { kind: 'empty' }
  if (/^data:/i.test(raw)) return { kind: 'inline' }

  let pathname = raw
  let absolute = false
  if (/^https?:\/\//i.test(raw)) {
    try {
      pathname = new URL(raw).pathname
      absolute = true
    } catch {
      return { kind: 'invalid' }
    }
  } else if (!raw.startsWith('/')) {
    return { kind: 'invalid' }
  }

  if (pathname.startsWith(UPLOADS_URL_PREFIX)) {
    let relative
    try {
      relative = decodeURIComponent(pathname.slice(UPLOADS_URL_PREFIX.length))
    } catch {
      return { kind: 'invalid' }
    }
    const file = path.resolve(uploadsDir, relative)
    // Un `..` dentro de la URL no debe permitir consultar la existencia de
    // archivos fuera de la carpeta de subidas.
    if (file !== uploadsDir && !file.startsWith(uploadsDir + path.sep)) return { kind: 'invalid' }
    return { kind: 'local', file }
  }

  if (absolute) return { kind: 'external', url: raw }
  // Path relativo que no es de subidas (p. ej. `/images/x.jpg` del frontend):
  // sólo se puede verificar por HTTP contra el propio sitio.
  return { kind: 'relative', pathname }
}

async function fileExists(file) {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

// HEAD es suficiente para casi todos los CDN; algunos servidores de proveedor
// lo rechazan (405/501) aunque sirvan la imagen por GET, así que se reintenta
// una vez para no marcar como rota una foto que en el navegador se ve bien.
async function urlResponds(url, { fetchImpl, timeoutMs }) {
  const request = method => fetchImpl(url, { method, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) })
  try {
    let response = await request('HEAD')
    if (response.status === 405 || response.status === 501) response = await request('GET')
    return response.ok ? null : `respondió ${response.status}`
  } catch (err) {
    return err?.name === 'TimeoutError' ? 'no respondió a tiempo' : 'no se pudo conectar'
  }
}

// Devuelve `null` si la imagen sirve, o el motivo (texto para el panel) si no.
export async function checkImageUrl(url, { baseUrl = '', fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const target = classifyImageUrl(url)
  switch (target.kind) {
    case 'empty':
    case 'inline':
      return null
    case 'invalid':
      return 'URL inválida'
    case 'local':
      return (await fileExists(target.file)) ? null : 'el archivo ya no está en el servidor'
    case 'relative':
      if (!baseUrl) return null // sin dominio conocido no se puede verificar; no se marca
      return urlResponds(`${baseUrl.replace(/\/+$/, '')}${target.pathname}`, { fetchImpl, timeoutMs })
    default:
      return urlResponds(target.url, { fetchImpl, timeoutMs })
  }
}

// Verifica las filas de a `concurrency` a la vez (cientos de HEAD en paralelo
// contra un mismo proveedor terminan en rate limit y en falsos positivos).
// Devuelve sólo las rotas, con `motivo_imagen` explicando por qué, en el mismo
// orden en que llegaron.
export async function findBrokenImages(rows, { check = checkImageUrl, concurrency = DEFAULT_CONCURRENCY, ...options } = {}) {
  const results = new Array(rows.length).fill(null)
  let next = 0
  async function worker() {
    while (next < rows.length) {
      const index = next++
      const motivo = await check(rows[index].image_url, options)
      if (motivo) results[index] = { ...rows[index], motivo_imagen: motivo }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, rows.length)) }, worker))
  return results.filter(Boolean)
}
