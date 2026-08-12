import test from 'node:test'
import assert from 'node:assert/strict'
import { resolvePublicOptionPrice, resolvePublicPrice } from './publicPricing.js'

test('prioriza el precio con IVA aunque también exista precio de venta', () => {
  assert.equal(resolvePublicPrice({ priceWithTax: 121, price: 100 }), 121)
})

test('agrega 21 % al precio de venta como fallback', () => {
  assert.equal(resolvePublicPrice({ price: 100 }), 121)
  assert.equal(resolvePublicPrice({ price: 2834.6 }), 3429.87)
})

test('convierte el precio con IVA en USD antes de publicarlo', () => {
  assert.equal(resolvePublicPrice({ priceWithTaxUsd: 12.1, priceUsd: 10, currency: 'USD', usdArsRate: 1510 }), 18271)
})

test('aplica el fallback también a opciones de variantes', () => {
  assert.equal(resolvePublicOptionPrice({ price: 200 }, 'ARS', 1510), 242)
})
