import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProductFilters } from './products.js'

test('la búsqueda exige todas las palabras, en cualquier orden', () => {
  const { where, params } = buildProductFilters({ search: 'redondo 6,3' })
  const clauses = where.replace(/^WHERE /, '').split(' AND ')
  assert.equal(clauses.length, 2)
  assert.ok(clauses.every(clause => clause.includes('ILIKE')))
  assert.deepEqual(params, ['%redondo%', '%6,3%'])
})

test('cada palabra se busca sobre código, descripción y nombre a la vez', () => {
  const { where } = buildProductFilters({ search: 'ALC-TE251 negro' })
  assert.ok(where.includes(`concat_ws(' ', codigo, descripcion, name)`))
})

test('los comodines de ILIKE tipeados por el usuario se buscan como texto', () => {
  const { params } = buildProductFilters({ search: '50%_off' })
  assert.deepEqual(params, ['%50\\%\\_off%'])
})

test('espacios de sobra no agregan condiciones vacías', () => {
  assert.equal(buildProductFilters({ search: '   ' }).where, '')
  assert.equal(buildProductFilters({ search: '  led   dicroica ' }).params.length, 2)
})

test('los filtros que siguen a la búsqueda mantienen su numeración de parámetros', () => {
  const { where, params } = buildProductFilters({ search: 'led dicroica', supplier: 'ALCIDES', published: 'true' })
  assert.ok(where.includes('$1'))
  assert.ok(where.includes('$2'))
  assert.ok(where.includes('supplier ILIKE $3'))
  assert.ok(where.includes('published = $4'))
  assert.deepEqual(params, ['%led%', '%dicroica%', '%ALCIDES%', true])
})
