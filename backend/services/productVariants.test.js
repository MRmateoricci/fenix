import test from 'node:test'
import assert from 'node:assert/strict'
import {
  findRuleAmbiguity,
  resolveVariantRule,
  ruleMatches,
  ruleSpecificity,
} from './productVariants.js'

test('la regla más específica reemplaza al comodín', () => {
  const rules = [
    { id: 'size', size_label: '4 mm²', precio_venta: 100, stock: 8 },
    { id: 'size-color', size_label: '4 mm²', color_name: 'Negro', precio_venta: 120, stock: 3 },
  ]
  assert.equal(resolveVariantRule(rules, { size: '4 mm²', color: 'Negro' }, 'precio_venta').id, 'size-color')
  assert.equal(resolveVariantRule(rules, { size: '4 mm²', color: 'Blanco' }, 'precio_venta').id, 'size')
  assert.equal(resolveVariantRule(rules, { size: '4 mm²', color: 'Negro' }, 'stock').stock, 3)
})

test('una combinación exacta de tres ejes gana sobre el fallback por color', () => {
  const rules = [
    { id: 'negro-fallback', color_name: 'Negro', precio_venta: 4200 },
    { id: 'negro-oscuro-10', color_name: 'Negro', tone_name: 'Oscuro', size_label: '10 mm', precio_venta: 5000 },
  ]
  assert.equal(resolveVariantRule(rules, { color: 'Negro', tone: 'Oscuro', size: '10 mm' }, 'precio_venta').precio_venta, 5000)
  assert.equal(resolveVariantRule(rules, { color: 'Negro', tone: 'Claro', size: '6 mm' }, 'precio_venta').precio_venta, 4200)
})

test('una regla parcial comparte precio y stock con las combinaciones cubiertas', () => {
  const rule = { size_label: '6 mm²', precio_venta: 250, stock: 10 }
  assert.equal(ruleSpecificity(rule), 1)
  assert.equal(ruleMatches(rule, { size: '6 mm²', color: 'Rojo', tone: 'Cálido' }), true)
  assert.equal(ruleMatches(rule, { size: '4 mm²', color: 'Rojo', tone: 'Cálido' }), false)
})

test('detecta dos reglas superpuestas con igual precisión', () => {
  const left = { size_label: '4 mm²' }
  const right = { color_name: 'Negro' }
  assert.deepEqual(findRuleAmbiguity([left, right]), { left, right })
  assert.equal(findRuleAmbiguity([
    { size_label: '4 mm²' },
    { size_label: '6 mm²' },
  ]), null)
})
