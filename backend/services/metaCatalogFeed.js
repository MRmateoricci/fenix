// Feed de catálogo para Meta Commerce Manager (anuncios dinámicos).
//
// Convierte los productos publicados —ya mapeados por `routes/catalog.js`, así
// el precio es exactamente el que ve el cliente en la tienda— al CSV que Meta
// consume por URL programada. Las columnas son las de la plantilla oficial
// `Catalog_Products_Template.csv`, en ese orden; las que no aplican quedan
// vacías pero se mantienen para que la importación no se queje de columnas
// faltantes.
//
// El `id` de cada fila es `products.id` (UUID), el mismo valor que
// `src/utils/metaPixel.js` manda en `content_ids`. Si alguna vez cambia uno,
// tiene que cambiar el otro: sin ese match Meta no puede asociar un ViewContent
// o Purchase con el producto del catálogo, y los anuncios dinámicos no funcionan.

// Encabezado de la plantilla de Meta, tal cual la baja el Commerce Manager.
export const META_FEED_COLUMNS = [
  'id', 'title', 'description', 'availability', 'condition', 'price', 'link',
  'image_link', 'brand', 'google_product_category', 'fb_product_category',
  'quantity_to_sell_on_facebook', 'sale_price', 'sale_price_effective_date',
  'item_group_id', 'gender', 'color', 'size', 'age_group', 'material', 'pattern',
  'shipping', 'shipping_weight', 'gtin', 'video[0].url', 'video[0].tag[0]',
  'product_tags[0]', 'style[0]',
]

// La tienda publica siempre en pesos (publicPricing.js convierte USD antes).
export const META_FEED_CURRENCY = 'ARS'

// Límites de la plantilla de Meta. `title` acepta hasta 200 pero recomienda
// 150; `description` corta en 9999.
const TITLE_MAX = 150
const DESCRIPTION_MAX = 9999

// Si el producto no tiene marca cargada (`grupo`), va la casa: Meta exige
// `brand` y una fila sin marca se rechaza entera.
export const DEFAULT_BRAND = 'Fénix Electricidad e Iluminación'

// Meta acepta la URL pública del sitio; Railway sirve API y frontend juntos,
// así que cualquiera de las dos vars sirve. El fallback fijo evita que un feed
// generado sin env vars salga con links a localhost.
export function resolveFeedBaseUrl(env = process.env) {
  const configured = (env.FRONTEND_BASE_URL || env.APP_BASE_URL || '').trim()
  return (configured || 'https://fenixelectricidadiluminacion.com').replace(/\/+$/, '')
}

// Meta espera "1234.50 ARS": punto decimal, dos decimales, sin separador de
// miles, y el código ISO separado por un espacio.
export function formatMetaPrice(value, currency = META_FEED_CURRENCY) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return `${numeric.toFixed(2)} ${currency}`
}

// Las fotos subidas desde el panel se guardan absolutas, pero las importadas
// de catálogos viejos pueden venir como `/uploads/...`. Meta sólo acepta URLs
// absolutas.
export function toAbsoluteUrl(url, baseUrl) {
  const raw = String(url || '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return raw
  return `${baseUrl}${raw.startsWith('/') ? '' : '/'}${raw}`
}

// Sin saltos de línea ni espacios repetidos: el CSV se lee mejor en el panel de
// Meta y el texto de los anuncios no muestra huecos raros.
function cleanText(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

// Bandera de disponibilidad de la tienda → vocabulario de Meta. Todo lo
// publicado es comprable, así que nunca sale `out of stock`: lo que no está en
// el local se pide al proveedor, que es exactamente `available for order`.
export function toMetaAvailability(product) {
  return product.stockInmediato ? 'in stock' : 'available for order'
}

// Una fila del feed a partir de un producto ya mapeado por `mapRow` (más
// `grupo`, que el catálogo público no expone). Devuelve `null` con el motivo
// cuando a Meta le faltaría un campo obligatorio: se prefiere omitir la fila a
// que el Commerce Manager rechace el archivo entero.
export function buildMetaFeedRow(product, { baseUrl } = {}) {
  const base = baseUrl || resolveFeedBaseUrl()
  const id = product?.id == null ? '' : String(product.id)
  if (!id) return { row: null, skipped: 'sin id' }

  const imageLink = toAbsoluteUrl(product.image, base)
  if (!imageLink) return { row: null, skipped: 'sin imagen' }

  const currentPrice = Number(product.price)
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return { row: null, skipped: 'sin precio' }

  // Con precio tachado, Meta quiere el precio de lista en `price` y el vigente
  // en `sale_price`; es como lo muestra la tarjeta de la tienda.
  const originalPrice = Number(product.originalPrice)
  const hasSale = Number.isFinite(originalPrice) && originalPrice > currentPrice
  const listPrice = hasSale ? originalPrice : currentPrice

  const title = cleanText(product.name, TITLE_MAX)
  const description = cleanText(product.description, DESCRIPTION_MAX)
    || cleanText([title, product.category].filter(Boolean).join(' · '), DESCRIPTION_MAX)

  const weightKg = Number(product.weightKg)

  return {
    row: {
      id,
      title,
      description,
      availability: toMetaAvailability(product),
      condition: 'new',
      price: formatMetaPrice(listPrice),
      link: `${base}/products/${encodeURIComponent(id)}`,
      image_link: imageLink,
      brand: cleanText(product.brand, 100) || DEFAULT_BRAND,
      google_product_category: '',
      fb_product_category: '',
      // La tienda no lleva stock (CLAUDE.md §4.4): nunca se informa cantidad.
      quantity_to_sell_on_facebook: '',
      sale_price: hasSale ? formatMetaPrice(currentPrice) : '',
      sale_price_effective_date: '',
      // Las variantes (color/medida/tono) no son ítems separados del catálogo:
      // se venden desde la ficha del producto padre, con el mismo id.
      item_group_id: '',
      gender: '',
      color: '',
      size: '',
      age_group: '',
      material: cleanText(product.material, 200),
      pattern: '',
      shipping: '',
      shipping_weight: Number.isFinite(weightKg) && weightKg > 0 ? `${weightKg} kg` : '',
      gtin: '',
      'video[0].url': '',
      'video[0].tag[0]': '',
      'product_tags[0]': '',
      'style[0]': '',
    },
    skipped: null,
  }
}

// RFC 4180: se entrecomilla lo que tenga coma, comillas o salto de línea, y las
// comillas internas se duplican.
export function csvEscape(value) {
  const text = value == null ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function rowsToCsv(rows, columns = META_FEED_COLUMNS) {
  const lines = [columns.map(csvEscape).join(',')]
  for (const row of rows) {
    lines.push(columns.map(column => csvEscape(row[column])).join(','))
  }
  // Meta lee bien LF; el CRLF es sólo para que Excel no pegue las filas al abrirlo.
  return `${lines.join('\r\n')}\r\n`
}

// Genera el feed completo. Devuelve el CSV y el detalle de lo que se omitió,
// para que la ruta lo loguee y se pueda ver en Railway por qué faltan filas.
export function buildMetaFeed(products, options = {}) {
  const rows = []
  const skipped = {}
  for (const product of products) {
    const { row, skipped: reason } = buildMetaFeedRow(product, options)
    if (row) rows.push(row)
    else skipped[reason] = (skipped[reason] || 0) + 1
  }
  return { csv: rowsToCsv(rows), count: rows.length, skipped }
}
