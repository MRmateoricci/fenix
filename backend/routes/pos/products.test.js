import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPrefixTsQuery } from './products.js'

test('separa por espacios, cada palabra queda como prefijo', () => {
  assert.equal(buildPrefixTsQuery('punto medio'), 'punto:* & medio:*')
})

test('separa también por puntuación pegada, no solo por espacios', () => {
  // Bug real: "ALC-TE126" con el guion adentro colapsaba a un solo token
  // "ALCTE126" que no matcheaba ningún lexema real de to_tsvector (que separa
  // "alc" y "te126"). Tiene que partir en dos términos de prefijo.
  assert.equal(buildPrefixTsQuery('ALC-TE126'), 'ALC:* & TE126:*')
})

test('ignora espacios repetidos y puntuación suelta', () => {
  assert.equal(buildPrefixTsQuery('  cable,  2.5mm  '), 'cable:* & 2:* & 5mm:*')
})

test('término vacío o solo puntuación no arma una consulta', () => {
  assert.equal(buildPrefixTsQuery(''), null)
  assert.equal(buildPrefixTsQuery('   '), null)
  assert.equal(buildPrefixTsQuery('---'), null)
})
