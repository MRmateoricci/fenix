import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCategoryTree, getCategoryValue } from './categoryTree.js'

test('agrega una categoría principal personalizada con sus descendientes', () => {
  const tree = buildCategoryTree(
    [{ id: 'sub-1', category: 'Domótica', name: 'Sensores' }],
    [{ id: 'type-1', category: 'Domótica', subcategory: 'Sensores', name: 'Movimiento' }],
    [{
      id: 'cat-1', level: 'category', category: 'Domótica',
      subcategory: '', name: '', label: 'Domótica', hidden: false,
    }]
  )

  const category = tree.find(node => getCategoryValue(node) === 'Domótica')
  assert.equal(category?.label, 'Domótica')
  assert.equal(category?._taxonomy.source, 'custom')
  assert.equal(category?.children?.[0]?.label, 'Sensores')
  assert.equal(category?.children?.[0]?.children?.[0]?.label, 'Movimiento')
})

test('respeta el renombre y ocultamiento de una categoría principal personalizada', () => {
  const renamed = buildCategoryTree([], [], [{
    level: 'category', category: 'Domótica', subcategory: '', name: '',
    label: 'Casa inteligente', hidden: false,
  }])
  assert.ok(renamed.some(node => getCategoryValue(node) === 'Casa inteligente'))

  const hidden = buildCategoryTree([], [], [{
    level: 'category', category: 'Domótica', subcategory: '', name: '',
    label: 'Casa inteligente', hidden: true,
  }])
  assert.ok(!hidden.some(node => getCategoryValue(node) === 'Casa inteligente'))
})
