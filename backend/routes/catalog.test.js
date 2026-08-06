import test from 'node:test'
import assert from 'node:assert/strict'
import { mapRow } from './catalog.js'

function product(overrides = {}) {
  return {
    id: 'product-1', name: 'Producto', category: 'Electricidad', subcategory: null,
    precio_venta: 22, precio_venta_usd: null, original_price: null, original_price_usd: null,
    price_currency: 'ARS', usd_ars_rate: 1510, description_larga: null,
    image_url: null, hover_image_url: null, stock: 1, watts: null, ip_rating: null,
    color_temp: null, material: null, cable_type: null, product_type: null,
    color_options: [], size_options: [], length_cm: null, width_cm: null, height_cm: null, weight_kg: null,
    ...overrides,
  }
}

test('el catálogo mantiene los proveedores ARS sin conversión', () => {
  assert.equal(mapRow(product()).price, 22)
})

test('el catálogo convierte proveedores USD a ARS, incluidas sus variantes', () => {
  const mapped = mapRow(product({
    price_currency: 'USD',
    precio_venta: 33220,
    precio_venta_usd: 22,
    color_options: [{ name: 'Blanco', price: 15100, priceUsd: 10 }],
  }))

  assert.equal(mapped.price, 33220)
  assert.equal(mapped.colors[0].price, 15100)
})
