import test from 'node:test'
import assert from 'node:assert/strict'
import {
  findRuleAmbiguity,
  mergeRuleValues,
  normalizeVariantProductData,
  resolveVariantRule,
  ruleMatches,
  ruleSpecificity,
} from './productVariants.js'

test('conserva la ficha individual completa al crear una variante', () => {
  const data = normalizeVariantProductData({}, {
    codigo: 'CAB-4', name: 'Cable 4 mm', descripcion: 'Descripción original', medida: '4 mm²',
    category: 'Electricidad', watts: 20, amperes: 1.25, length_cm: 30, weight_kg: 1.5,
  })
  assert.equal(data.codigo, 'CAB-4')
  assert.equal(data.name, 'Cable 4 mm')
  assert.equal(data.inventoryDescription, 'Descripción original')
  assert.equal(data.medida, '4 mm²')
  assert.equal(data.category, 'Electricidad')
  assert.equal(data.watts, 20)
  assert.equal(data.amperes, 1.25)
  assert.equal(data.lengthCm, 30)
  assert.equal(data.weightKg, 1.5)
})

test('la unión usa los precios y el stock editados para cada código', () => {
  const values = mergeRuleValues({
    codigo: 'CABLE-10', precio_venta: 100, precio_iva: 121, stock: 2,
    price_currency: 'ARS',
  }, { precioVenta: '150', precioIva: '181.5', stock: '7' })

  assert.deepEqual(values, {
    saleArs: 150, taxArs: 181.5, stock: 7,
    saleUsd: undefined, taxUsd: undefined,
  })
})

test('la unión actualiza también el equivalente USD de un precio editado', () => {
  const values = mergeRuleValues({
    codigo: 'USD-1', precio_venta: 15100, precio_iva: 18271,
    precio_venta_usd: 10, precio_iva_usd: 12.1,
    stock: 1, price_currency: 'USD', price_exchange_rate: 1510,
  }, { precioVenta: '30200', precioIva: '36542', stock: '3' })

  assert.equal(values.saleUsd, 20)
  assert.equal(values.taxUsd, 24.2)
  assert.equal(values.stock, 3)
})

test('la unión rechaza precios negativos o stock fraccionado', () => {
  const product = { codigo: 'CABLE-1', precio_venta: 100, precio_iva: 121, stock: 1 }
  assert.throws(() => mergeRuleValues(product, { precioVenta: -1, precioIva: 121, stock: 1 }), /inválidos/)
  assert.throws(() => mergeRuleValues(product, { precioVenta: 100, precioIva: 121, stock: 1.5 }), /inválidos/)
})

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
