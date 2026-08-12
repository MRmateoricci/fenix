import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveProductVariantPrice } from './orders.js'

test('el pedido usa el precio con IVA del producto', () => {
  const result = resolveProductVariantPrice({
    precio_venta: 100,
    precio_iva: 125,
    price_currency: 'ARS',
  })

  assert.equal(result.price, 125)
})

test('el pedido calcula el 21 % cuando falta IVA', () => {
  const result = resolveProductVariantPrice({
    precio_venta: 100,
    precio_iva: null,
    price_currency: 'ARS',
  })

  assert.equal(result.price, 121)
})

test('el pedido usa IVA explícito y fallback en reglas de variantes', () => {
  const product = {
    precio_venta: 100,
    precio_iva: 121,
    price_currency: 'ARS',
    variant_rules: [
      { id: '10', size_label: '10 mm', precio_venta: 200, precio_iva: 250, price_currency: 'ARS' },
      { id: '20', size_label: '20 mm', precio_venta: 300, precio_iva: null, price_currency: 'ARS' },
    ],
  }

  assert.equal(resolveProductVariantPrice(product, null, '10 mm', null).price, 250)
  assert.equal(resolveProductVariantPrice(product, null, '20 mm', null).price, 363)
})

test('el pedido aplica la misma regla a variantes heredadas', () => {
  const result = resolveProductVariantPrice({
    precio_venta: 100,
    precio_iva: 121,
    price_currency: 'ARS',
    size_options: [{ label: '10 mm', price: 200 }],
  }, null, '10 mm', null)

  assert.equal(result.price, 242)
})
