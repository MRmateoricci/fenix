import test from 'node:test'
import assert from 'node:assert/strict'
import {
  META_FEED_COLUMNS,
  DEFAULT_BRAND,
  buildMetaFeed,
  buildMetaFeedRow,
  csvEscape,
  formatMetaPrice,
  resolveFeedBaseUrl,
  rowsToCsv,
  toAbsoluteUrl,
} from './metaCatalogFeed.js'

const BASE = 'https://tienda.test'

function product(overrides = {}) {
  return {
    id: '3f6c2a1e-1111-4b5c-8d9e-000000000001',
    name: 'Lámpara LED 9W',
    description: 'Lámpara LED cálida\n\npara uso   interior.',
    category: 'Iluminación',
    price: 1234.5,
    originalPrice: null,
    image: 'https://cdn.test/lampara.jpg',
    brand: 'SILVERLIGHT',
    material: null,
    weightKg: null,
    stockInmediato: true,
    ...overrides,
  }
}

test('el id del feed es el UUID del producto en texto, igual que content_ids del Pixel', () => {
  const { row } = buildMetaFeedRow(product(), { baseUrl: BASE })
  assert.equal(row.id, '3f6c2a1e-1111-4b5c-8d9e-000000000001')
  assert.equal(row.link, `${BASE}/products/3f6c2a1e-1111-4b5c-8d9e-000000000001`)
})

test('el precio sale con dos decimales, punto y código ARS', () => {
  assert.equal(formatMetaPrice(1234.5), '1234.50 ARS')
  assert.equal(formatMetaPrice(1000000), '1000000.00 ARS')
  assert.equal(formatMetaPrice(0), null)
  assert.equal(formatMetaPrice('abc'), null)
})

test('la fila cumple los campos obligatorios de la plantilla de Meta', () => {
  const { row } = buildMetaFeedRow(product(), { baseUrl: BASE })
  assert.equal(row.title, 'Lámpara LED 9W')
  assert.equal(row.description, 'Lámpara LED cálida para uso interior.')
  assert.equal(row.availability, 'in stock')
  assert.equal(row.condition, 'new')
  assert.equal(row.price, '1234.50 ARS')
  assert.equal(row.image_link, 'https://cdn.test/lampara.jpg')
  assert.equal(row.brand, 'SILVERLIGHT')
  assert.equal(row.sale_price, '')
  assert.equal(row.quantity_to_sell_on_facebook, '')
  assert.deepEqual(Object.keys(row), META_FEED_COLUMNS)
})

test('sin stock inmediato el producto sigue comprable: in stock igual', () => {
  const { row } = buildMetaFeedRow(product({ stockInmediato: false }), { baseUrl: BASE })
  assert.equal(row.availability, 'in stock')
})

test('el encabezado es el de la plantilla catalog_products.csv de Meta', () => {
  assert.equal(
    META_FEED_COLUMNS.join(','),
    'id,title,description,availability,condition,link,image_link,brand,price,google_product_category,fb_product_category,quantity_to_sell_on_facebook,sale_price,sale_price_effective_date,item_group_id,gender,color,size,age_group,material,pattern,shipping,shipping_weight,offer_disclaimer,offer_disclaimer_url,video[0].url,video[0].tag[0],gtin,product_tags[0],product_tags[1],style[0]'
  )
})

test('con precio tachado, price es el de lista y sale_price el vigente', () => {
  const { row } = buildMetaFeedRow(product({ price: 900, originalPrice: 1200 }), { baseUrl: BASE })
  assert.equal(row.price, '1200.00 ARS')
  assert.equal(row.sale_price, '900.00 ARS')
})

test('un precio tachado menor al vigente no se toma como oferta', () => {
  const { row } = buildMetaFeedRow(product({ price: 900, originalPrice: 800 }), { baseUrl: BASE })
  assert.equal(row.price, '900.00 ARS')
  assert.equal(row.sale_price, '')
})

test('las imágenes relativas se vuelven absolutas con la base del sitio', () => {
  assert.equal(toAbsoluteUrl('/uploads/a.jpg', BASE), `${BASE}/uploads/a.jpg`)
  assert.equal(toAbsoluteUrl('uploads/a.jpg', BASE), `${BASE}/uploads/a.jpg`)
  assert.equal(toAbsoluteUrl('http://otro.test/a.jpg', BASE), 'http://otro.test/a.jpg')
  assert.equal(toAbsoluteUrl('  ', BASE), null)
})

test('sin marca cargada se usa la casa; sin descripción se arma con título y categoría', () => {
  const { row } = buildMetaFeedRow(product({ brand: null, description: '' }), { baseUrl: BASE })
  assert.equal(row.brand, DEFAULT_BRAND)
  assert.equal(row.description, 'Lámpara LED 9W · Iluminación')
})

test('material y peso se informan sólo cuando existen', () => {
  const { row } = buildMetaFeedRow(product({ material: 'Aluminio', weightKg: 0.35 }), { baseUrl: BASE })
  assert.equal(row.material, 'Aluminio')
  assert.equal(row.shipping_weight, '0.35 kg')
})

test('se omiten las filas que Meta rechazaría, con el motivo', () => {
  assert.equal(buildMetaFeedRow(product({ image: null }), { baseUrl: BASE }).skipped, 'sin imagen')
  assert.equal(buildMetaFeedRow(product({ price: null }), { baseUrl: BASE }).skipped, 'sin precio')
  assert.equal(buildMetaFeedRow(product({ id: null }), { baseUrl: BASE }).skipped, 'sin id')
})

test('el CSV escapa comas, comillas y saltos de línea', () => {
  assert.equal(csvEscape('simple'), 'simple')
  assert.equal(csvEscape('con, coma'), '"con, coma"')
  assert.equal(csvEscape('dice "hola"'), '"dice ""hola"""')
  assert.equal(csvEscape('dos\nlíneas'), '"dos\nlíneas"')
  assert.equal(csvEscape(null), '')
})

test('el CSV arranca con el encabezado de la plantilla y una fila por producto', () => {
  const { csv, count, skipped } = buildMetaFeed([
    product(),
    product({ id: 'segundo', name: 'Tira LED, 5 m' }),
    product({ id: 'sin-foto', image: '' }),
  ], { baseUrl: BASE })

  const lines = csv.trimEnd().split('\r\n')
  assert.equal(lines[0], META_FEED_COLUMNS.join(','))
  assert.equal(lines.length, 3)
  assert.equal(count, 2)
  assert.deepEqual(skipped, { 'sin imagen': 1 })
  assert.ok(lines[2].startsWith('segundo,"Tira LED, 5 m",'))
})

test('rowsToCsv respeta el orden de columnas aunque el objeto venga desordenado', () => {
  const csv = rowsToCsv([{ title: 'T', id: 'X' }], ['id', 'title'])
  assert.equal(csv, 'id,title\r\nX,T\r\n')
})

test('la base del feed prioriza FRONTEND_BASE_URL y cae al dominio productivo', () => {
  assert.equal(resolveFeedBaseUrl({ FRONTEND_BASE_URL: 'https://a.test/' }), 'https://a.test')
  assert.equal(resolveFeedBaseUrl({ APP_BASE_URL: 'https://b.test' }), 'https://b.test')
  assert.equal(resolveFeedBaseUrl({}), 'https://fenixelectricidadiluminacion.com')
})
