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

test('mantiene los accesos historicos del header hasta que el admin los cambia', () => {
  const defaultTree = buildCategoryTree()
  assert.deepEqual(
    defaultTree.filter(node => node.showInHeader).map(getCategoryValue),
    ['Electricidad', 'Herramientas', 'Iluminación', 'Automatización Industrial']
  )

  const customizedTree = buildCategoryTree([], [], [{
    level: 'category', category: 'Electricidad', subcategory: '', name: '',
    label: null, hidden: false, show_in_header: false,
  }])
  assert.equal(customizedTree.find(node => getCategoryValue(node) === 'Electricidad')?.showInHeader, false)
})

test('las categorias personalizadas solo aparecen en el header al marcarlas', () => {
  const unmarked = buildCategoryTree([], [], [{
    level: 'category', category: 'Domótica', subcategory: '', name: '',
    label: 'Domótica', hidden: false, show_in_header: null,
  }])
  assert.equal(unmarked.find(node => getCategoryValue(node) === 'Domótica')?.showInHeader, false)

  const marked = buildCategoryTree([], [], [{
    level: 'category', category: 'Domótica', subcategory: '', name: '',
    label: 'Domótica', hidden: false, show_in_header: true,
  }])
  assert.equal(marked.find(node => getCategoryValue(node) === 'Domótica')?.showInHeader, true)
})
