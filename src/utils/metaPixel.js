// Meta Pixel (Facebook). Único lugar donde se habla con `fbq`: el resto del
// frontend llama a estos helpers y nunca toca `window.fbq` directo, así los
// nombres de evento y los parámetros salen siempre iguales.
//
// Convive con la analítica propia de `utils/analytics.js` (tabla page_views);
// son dos destinos distintos, no se reemplazan.
//
// El ID se puede sobreescribir con `VITE_META_PIXEL_ID`. Poniéndolo vacío
// (`VITE_META_PIXEL_ID=` en un `.env.local`) el pixel queda desactivado, que es
// lo que conviene en desarrollo para no ensuciar las métricas reales.
const PIXEL_ID = String(import.meta.env.VITE_META_PIXEL_ID ?? '711144551940445').trim()

// La tienda publica siempre en pesos (publicPricing.js ya convierte USD a ARS).
const CURRENCY = 'ARS'

let initialized = false

function isEnabled() {
  return Boolean(PIXEL_ID) && typeof window !== 'undefined'
}

// Snippet oficial de Meta, sin el `fbq('track', 'PageView')` final: en una SPA
// el PageView lo dispara el tracker de rutas (App.jsx) también para la primera
// pantalla. Dejarlo acá contaría esa primera vista dos veces.
function loadPixelScript(win, doc) {
  if (win.fbq) return
  const fbq = function () {
    fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments)
  }
  win.fbq = fbq
  if (!win._fbq) win._fbq = fbq
  fbq.push = fbq
  fbq.loaded = true
  fbq.version = '2.0'
  fbq.queue = []

  const script = doc.createElement('script')
  script.async = true
  script.src = 'https://connect.facebook.net/en_US/fbevents.js'
  const first = doc.getElementsByTagName('script')[0]
  first.parentNode.insertBefore(script, first)
}

// Se llama una sola vez, al arrancar la app (main.jsx).
export function initMetaPixel() {
  if (initialized || !isEnabled()) return
  initialized = true
  loadPixelScript(window, document)
  window.fbq('init', PIXEL_ID)
}

// ── Anti-duplicados ──────────────────────────────────────────────────────────
// Un mismo evento puede intentar dispararse dos veces por causas que no son una
// acción real del usuario: el doble render de React.StrictMode en desarrollo, un
// efecto que se re-ejecuta por un cambio de dependencia irrelevante, un doble
// click. La ventana corta descarta esos casos pero deja pasar la repetición
// legítima (volver a entrar a la misma ficha, agregar el mismo producto otra vez).
const recentEvents = new Map()
const DEFAULT_DEDUPE_MS = 2000

function isDuplicate(key, windowMs = DEFAULT_DEDUPE_MS) {
  const now = Date.now()
  for (const [stored, at] of recentEvents) {
    if (now - at > 60000) recentEvents.delete(stored)
  }
  const last = recentEvents.get(key)
  if (last != null && now - last < windowMs) return true
  recentEvents.set(key, now)
  return false
}

// `eventID` no es cosmético: si algún día se agrega la Conversions API del lado
// del servidor, Meta usa ese ID para unificar el evento del navegador con el del
// backend en lugar de contarlo dos veces.
function track(eventName, params = {}, { dedupeKey, dedupeMs, eventID } = {}) {
  if (!isEnabled()) return
  if (!initialized) initMetaPixel()
  if (dedupeKey && isDuplicate(`${eventName}:${dedupeKey}`, dedupeMs)) return
  if (typeof window.fbq !== 'function') return

  const clean = {}
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') clean[key] = value
  }
  window.fbq('track', eventName, clean, eventID ? { eventID } : undefined)
}

// ── Normalización de datos de producto ───────────────────────────────────────

const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

// Meta espera los IDs como string y que coincidan con los del catálogo.
const toContentId = (id) => (id == null ? null : String(id))

// `contents` es el formato detallado (id + cantidad + precio unitario) que Meta
// prefiere para carrito y compra; `content_ids` se manda igual porque hay
// herramientas del panel que sólo leen ese.
function contentsFromLines(lines) {
  return lines
    .map((line) => ({
      id: toContentId(line.id),
      quantity: Math.max(1, Math.round(toNumber(line.quantity) || 1)),
      item_price: toNumber(line.price),
    }))
    .filter((content) => content.id)
}

function payloadFromLines(lines) {
  const contents = contentsFromLines(lines)
  return {
    content_type: 'product',
    content_ids: contents.map((content) => content.id),
    contents,
    num_items: contents.reduce((sum, content) => sum + content.quantity, 0),
    value: Number(
      contents.reduce((sum, content) => sum + content.item_price * content.quantity, 0).toFixed(2)
    ),
    currency: CURRENCY,
  }
}

// ── Eventos ──────────────────────────────────────────────────────────────────

// Cada cambio de ruta de la tienda. El panel (/admin) no llega acá: TrackPageView
// vive dentro del Layout público.
export function trackMetaPageView(path) {
  track('PageView', {}, { dedupeKey: `path:${path ?? ''}` })
}

// Ficha de producto abierta. `name` y `price` son los de la variante elegida:
// color/medida/tono cambian precio e imagen, y es ese el producto que el
// visitante está mirando.
//
// El envío se posterga unos milisegundos y la última llamada pisa a la anterior.
// Al abrir la ficha, la selección de variante se acomoda en un segundo render
// (la portada configurada, o la primera combinación válida), así que sin esta
// espera saldrían dos ViewContent: uno con el precio provisorio y otro con el
// definitivo. También colapsa el manoteo del selector de color o medida.
const pendingViewContent = new Map()
const VIEW_CONTENT_DELAY_MS = 250

export function trackMetaViewContent({ id, name, price, category }) {
  const contentId = toContentId(id)
  if (!contentId) return

  clearTimeout(pendingViewContent.get(contentId))
  pendingViewContent.set(
    contentId,
    setTimeout(() => {
      pendingViewContent.delete(contentId)
      track(
        'ViewContent',
        {
          content_type: 'product',
          content_ids: [contentId],
          contents: [{ id: contentId, quantity: 1, item_price: toNumber(price) }],
          content_name: name,
          content_category: category,
          value: toNumber(price),
          currency: CURRENCY,
        },
        { dedupeKey: contentId }
      )
    }, VIEW_CONTENT_DELAY_MS)
  )
}

// Alta al carrito. Se dispara una sola vez por click aunque se agreguen varias
// unidades: la cantidad viaja dentro de `contents`, no como eventos repetidos.
export function trackMetaAddToCart({ id, name, price, category, quantity = 1 }) {
  const contentId = toContentId(id)
  if (!contentId) return
  const units = Math.max(1, Math.round(toNumber(quantity) || 1))
  track(
    'AddToCart',
    {
      content_type: 'product',
      content_ids: [contentId],
      contents: [{ id: contentId, quantity: units, item_price: toNumber(price) }],
      content_name: name,
      content_category: category,
      num_items: units,
      value: Number((toNumber(price) * units).toFixed(2)),
      currency: CURRENCY,
    },
    { dedupeKey: contentId }
  )
}

// Arranque del checkout. `value` es el subtotal de productos con IVA (sin envío
// ni cupón): en ese momento todavía no se conoce el domicilio ni la tarifa.
export function trackMetaInitiateCheckout(items = []) {
  if (!items.length) return
  const payload = payloadFromLines(items)
  track('InitiateCheckout', payload, {
    // Un carrito distinto es un checkout distinto; recargar la misma pantalla no.
    dedupeKey: payload.content_ids.join(',') || 'vacio',
    dedupeMs: 30000,
  })
}

// Compra confirmada. Sólo la llama OrderConfirmation cuando el backend ya
// devolvió un estado pagado — nunca por haber llegado a la pantalla de éxito.
// El `orderId` bloquea el reenvío de forma permanente (localStorage), así una
// recarga de la página o un segundo dispositivo no cuentan la venta dos veces.
export function trackMetaPurchase({ orderId, orderNumber, items = [], total }) {
  if (!orderId) return
  const storageKey = `fenix_fbq_purchase_${orderId}`
  try {
    if (localStorage.getItem(storageKey)) return
  } catch {
    // Modo privado sin storage: el `dedupeKey` de abajo igual atajará el doble
    // render; una recarga manual podría duplicar, es el mal menor.
  }

  const payload = payloadFromLines(items)
  // El total real de la orden lo calculó el backend (incluye envío y cupón):
  // es el importe que se cobró, y es el que Meta tiene que ver.
  const value = toNumber(total) || payload.value

  track(
    'Purchase',
    { ...payload, value: Number(value.toFixed(2)), currency: CURRENCY, order_id: orderNumber || orderId },
    { dedupeKey: String(orderId), dedupeMs: 60000, eventID: `purchase-${orderId}` }
  )

  try {
    localStorage.setItem(storageKey, String(Date.now()))
  } catch {
    // ignore storage quota
  }
}
