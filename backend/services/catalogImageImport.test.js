import test from 'node:test'
import assert from 'node:assert/strict'
import { matchKnownProductsOnPage } from './catalogImageImport.js'

test('asocia códigos conocidos aunque el PDF cambie espacios y guiones', () => {
  const products = [
    { id: 'one', codigo: 'AT-204 C' },
    { id: 'two', codigo: 'V01-PINT' },
  ]
  const items = [
    { text: 'AT 204-C', x: 210, y: 600 },
    { text: 'V01 PINT', x: 100, y: 300 },
    { text: '59.400', x: 500, y: 600 },
  ]
  const placements = [
    { objectName: 'img-a', x0: 40, x1: 180, y0: 570, y1: 630 },
    { objectName: 'img-b', x0: 600, x1: 680, y0: 280, y1: 330 },
  ]

  const matches = matchKnownProductsOnPage(items, placements, products)
  assert.deepEqual(matches.map(match => match.product.id), ['one', 'two'])
  assert.equal(matches[0].ranked[0].placement.objectName, 'img-a')
  assert.equal(matches[1].ranked[0].placement.objectName, 'img-b')
})

test('no inventa asociaciones con números o textos que no son códigos cargados', () => {
  const matches = matchKnownProductsOnPage(
    [{ text: '13530', x: 400, y: 500 }, { text: 'APLIQUE PINZA', x: 200, y: 500 }],
    [{ objectName: 'img-a', x0: 20, x1: 100, y0: 480, y1: 520 }],
    [{ id: 'one', codigo: '403' }]
  )
  assert.equal(matches.length, 0)
})
