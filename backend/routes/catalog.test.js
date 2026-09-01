import test from 'node:test'
import assert from 'node:assert/strict'
import { mapRow, buildCatalogFilters } from './catalog.js'

function product(overrides = {}) {
  return {
    id: 'product-1', name: 'Producto', category: 'Electricidad', subcategory: null,
    precio_venta: 22, precio_venta_usd: null, precio_iva: null, precio_iva_usd: null,
    original_price: null, original_price_usd: null,
    price_currency: 'ARS', usd_ars_rate: 1510, description_larga: null,
    image_url: null, hover_image_url: null, stock: 1, watts: null, ip_rating: null,
    color_temp: null, material: null, cable_type: null, product_type: null,
    color_options: [], size_options: [], length_cm: null, width_cm: null, height_cm: null, weight_kg: null,
    ...overrides,
  }
}

test('el catálogo calcula 21 % de IVA cuando el precio final no está cargado', () => {
  assert.equal(mapRow(product()).price, 26.62)
})

test('el catálogo prioriza el precio con IVA cargado', () => {
  assert.equal(mapRow(product({ precio_iva: 30 })).price, 30)
})

test('el catálogo muestra IVA explícito o calculado en las variantes combinadas', () => {
  const mapped = mapRow(product({
    variant_rules: [
      { id: '10', size: '10 mm', price: 100, priceWithTax: 130, currency: 'ARS', image: '/10.jpg', isCover: true },
      { id: '20', size: '20 mm', price: 200, priceWithTax: null, currency: 'ARS' },
    ],
  }))

  assert.deepEqual(mapped.variantRules.map(rule => rule.price), [130, 242])
  assert.equal(mapped.variantRules[0].image, '/10.jpg')
  assert.equal(mapped.variantRules[0].isCover, true)
})

test('el catálogo convierte proveedores USD a ARS, incluidas sus variantes', () => {
  const mapped = mapRow(product({
    price_currency: 'USD',
    precio_venta: 33220,
    precio_venta_usd: 22,
    precio_iva_usd: 26.62,
    color_options: [{ name: 'Blanco', price: 15100, priceUsd: 10, priceWithTaxUsd: 12.1 }],
    size_options: [{ label: '20 cm', price: 18120, priceUsd: 12 }],
  }))

  assert.equal(mapped.price, 40196.2)
  assert.equal(mapped.colors[0].price, 18271)
  assert.equal(mapped.sizes[0].price, 21925.2)
})

test('el catalogo usa la descripcion o el codigo cuando name esta vacio', () => {
  assert.equal(mapRow(product({ name: '  ', descripcion: 'Nombre importado', codigo: 'ABC-1' })).name, 'Nombre importado')
  assert.equal(mapRow(product({ name: null, descripcion: '', codigo: 'ABC-1' })).name, 'ABC-1')
  assert.equal(mapRow(product({ name: null, descripcion: null, codigo: null })).name, 'Producto sin nombre')
})

test('buildCatalogFilters siempre filtra por published sin argumentos', () => {
  const { where, params } = buildCatalogFilters()
  assert.equal(where, 'WHERE published = TRUE')
  assert.deepEqual(params, [])
})

test('buildCatalogFilters arma búsqueda, categoría y presencia de imagen', () => {
  const { where, params, nextIndex } = buildCatalogFilters({
    search: ' led ', category: 'Iluminación', conImagen: 'false',
  })
  assert.match(where, /name ILIKE \$1/)
  assert.match(where, /category = \$2/)
  assert.match(where, /image_url IS NULL OR btrim\(image_url\) = ''/)
  assert.deepEqual(params, ['%led%', 'Iluminación'])
  assert.equal(nextIndex, 3)
})

test('buildCatalogFilters con conImagen=true exige imagen no vacía', () => {
  const { where, params } = buildCatalogFilters({ conImagen: 'true' })
  assert.match(where, /image_url IS NOT NULL AND btrim\(image_url\) <> ''/)
  assert.deepEqual(params, [])
})
