import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeText, tokenize, searchProducts } from './productSearch.js'

const products = [
  { id: 1, name: 'Lámpara grande cálida 22W', category: 'Lámparas' },
  { id: 2, name: 'Lámpara Dicroica Fría Ledvance Osram', category: 'Lámparas', description: 'GU10 7W' },
  { id: 3, name: 'Lámpara LED A60 E27 -6W/9W/12W', category: 'Lámparas' },
  { id: 4, name: 'Cable unipolar 2.5mm', category: 'Cables', productType: 'Unipolar' },
  { id: 5, name: 'Tira LED 5m RGB', category: 'Tiras LED' },
]
const ids = (query) => searchProducts(products, query).map(p => p.id)

test('normaliza tildes, mayúsculas y signos', () => {
  assert.equal(normalizeText('Lámpara LED A60 E27 -6W/9W/12W'), 'lampara led a60 e27 6w 9w 12w')
  assert.deepEqual(tokenize('  Dicroica  Fría '), ['dicroica', 'fria'])
})

test('busca sin tilde', () => {
  assert.deepEqual(ids('lampara dicroica'), [2])
  assert.deepEqual(ids('fria'), [2])
})

test('las palabras no tienen que estar juntas ni en orden', () => {
  assert.deepEqual(ids('lampara 22w'), [1])
  assert.deepEqual(ids('22w lampara'), [1])
  assert.deepEqual(ids('osram dicroica'), [2])
})

test('acepta plurales', () => {
  assert.deepEqual(ids('lamparas dicroicas'), [2])
  assert.deepEqual(ids('cables'), [4])
})

test('busca en descripción, categoría y tipo', () => {
  assert.deepEqual(ids('gu10'), [2])
  assert.deepEqual(ids('unipolar'), [4])
  assert.deepEqual(ids('tiras'), [5])
})

test('con coincidencias completas no mezcla las parciales', () => {
  assert.deepEqual(ids('lampara 9w'), [3])
})

test('sin coincidencia completa devuelve las parciales, la más completa primero', () => {
  // Nadie tiene "lampara" + "unipolar" + "rgb", pero 5 cumple 2 palabras y 3 sólo una.
  const result = ids('led rgb 22w')
  assert.equal(result[0], 5)
  assert.ok(result.includes(3))
  assert.ok(result.includes(1))
  assert.ok(!result.includes(4))
})

test('la coincidencia en el nombre pesa más que en descripción', () => {
  const list = [
    { id: 'a', name: 'Portalámpara', description: 'para lámpara dicroica' },
    { id: 'b', name: 'Lámpara dicroica' },
  ]
  assert.deepEqual(searchProducts(list, 'lampara dicroica').map(p => p.id), ['b', 'a'])
})

test('consulta vacía devuelve todo sin tocar el orden', () => {
  assert.equal(searchProducts(products, '   '), products)
})

test('ignora productos sin campos cargados', () => {
  assert.deepEqual(searchProducts([{ id: 9, name: null, description: null }], 'lampara'), [])
})
