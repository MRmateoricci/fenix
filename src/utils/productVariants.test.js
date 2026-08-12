import test from 'node:test'
import assert from 'node:assert/strict'
import { hasPublicAxisFallback, resolvePublicVariantRule } from './productVariants.js'

test('sin color usa la regla comodín de la medida', () => {
  const rules = [
    { id: '10-default', color: null, tone: null, size: '10 MM2', price: 17153.96 },
    { id: '10-blue', color: 'Azul', tone: null, size: '10 MM2', price: 5000 },
  ]

  assert.equal(hasPublicAxisFallback(rules, 'color'), true)
  assert.equal(resolvePublicVariantRule(rules, { color: null, tone: null, size: '10 MM2' }, 'price').id, '10-default')
})

test('color y medida seleccionados reemplazan al fallback', () => {
  const rules = [
    { id: '10-default', color: null, tone: null, size: '10 MM2', price: 17153.96 },
    { id: '10-blue', color: 'Azul', tone: null, size: '10 MM2', price: 5000 },
  ]

  assert.equal(resolvePublicVariantRule(rules, { color: 'Azul', tone: null, size: '10 MM2' }, 'price').id, '10-blue')
})
