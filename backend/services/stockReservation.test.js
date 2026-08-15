import test from 'node:test'
import assert from 'node:assert/strict'
import { reserveStock } from './stockReservation.js'

test('reserva primero el depósito de la regla y después actualiza el total', async () => {
  const queries = []
  const client = {
    async query(sql, params) {
      queries.push({ sql, params })
      if (/UPDATE product_variant_rules/.test(sql)) return { rows: [{ product_id: 'product-1' }] }
      if (/UPDATE products SET stock=stock-/.test(sql)) return { rows: [{ stock: 7 }] }
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }
  await reserveStock(client, [{ id: 'product-1', name: 'Cable', quantity: 3, variantRuleId: 'rule-1' }])
  assert.equal(queries.length, 2)
  assert.deepEqual(queries[0].params, [3, 'rule-1', 'product-1'])
  assert.deepEqual(queries[1].params, [3, 'product-1'])
})

test('si la regla no tiene stock no modifica el total', async () => {
  const queries = []
  const client = {
    async query(sql, params) {
      queries.push({ sql, params })
      return { rows: [] }
    },
  }
  await assert.rejects(
    reserveStock(client, [{ id: 'product-1', name: 'Cable', quantity: 3, variantRuleId: 'rule-1' }]),
    /Sin stock suficiente/
  )
  assert.equal(queries.length, 1)
})

// ── Fake client que modela el comportamiento real de Postgres para las
// consultas de reserveStock (incluida la lectura de a_pedido dentro del mismo
// WHERE) — permite probar la excepción "a pedido" sin una base real.
function fakeClient(products) {
  const byId = new Map(products.map((p) => [p.id, p]))
  return {
    async query(sql, params) {
      if (/UPDATE product_variant_rules/.test(sql)) {
        const [qty, ruleId, productId] = params
        const product = byId.get(productId)
        const rule = product?.variantRules.find((r) => r.id === ruleId)
        if (!rule || !(rule.stock >= qty || product.aPedido)) return { rows: [] }
        rule.stock -= qty
        return { rows: [{ product_id: productId, stock: rule.stock }] }
      }
      if (/UPDATE products SET stock=stock-/.test(sql)) {
        const [qty, productId] = params
        const product = byId.get(productId)
        product.stock -= qty
        return { rows: [{ stock: product.stock }] }
      }
      if (/variant_stock = jsonb_set/.test(sql)) {
        const [qty, productId, [colorKey, sizeKey]] = params
        const product = byId.get(productId)
        const cell = product.variantStock[colorKey][sizeKey]
        if (!(cell >= qty || product.aPedido)) return { rows: [] }
        product.variantStock[colorKey][sizeKey] -= qty
        return { rows: [{ cell_stock: product.variantStock[colorKey][sizeKey] }] }
      }
      if (/UPDATE products SET stock = stock - \$1/.test(sql)) {
        const [qty, productId] = params
        const product = byId.get(productId)
        if (!(product.stock >= qty || product.aPedido)) return { rows: [] }
        product.stock -= qty
        return { rows: [{ stock: product.stock }] }
      }
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }
}

test('producto a_pedido con stock 0 permite reservar igual y marca el item', async () => {
  const client = fakeClient([{ id: 'product-2', stock: 0, aPedido: true, variantRules: [] }])
  const item = { id: 'product-2', name: 'Lámpara a pedido', quantity: 2 }
  await reserveStock(client, [item])
  assert.equal(item.aPedido, true)
})

test('producto sin a_pedido y sin stock sigue rechazando la reserva', async () => {
  const client = fakeClient([{ id: 'product-3', stock: 0, aPedido: false, variantRules: [] }])
  const item = { id: 'product-3', name: 'Cable sin stock', quantity: 1 }
  await assert.rejects(reserveStock(client, [item]), /Sin stock suficiente/)
})

test('producto a_pedido con variantes permite reservar una combinación sin stock', async () => {
  const client = fakeClient([{
    id: 'product-4', stock: 0, aPedido: true, variantRules: [],
    variantStock: { Blanco: { '10m': 0 } },
  }])
  const item = { id: 'product-4', name: 'Cable a pedido', quantity: 5, colorKey: 'Blanco', sizeKey: '10m' }
  await reserveStock(client, [item])
  assert.equal(item.aPedido, true)
})

test('pedido mixto: un item con stock y otro a pedido sin stock se acepta entero', async () => {
  const client = fakeClient([
    { id: 'product-5', stock: 10, aPedido: false, variantRules: [] },
    { id: 'product-6', stock: 0, aPedido: true, variantRules: [] },
  ])
  const items = [
    { id: 'product-5', name: 'Con stock', quantity: 3 },
    { id: 'product-6', name: 'A pedido', quantity: 1 },
  ]
  await reserveStock(client, items)
  assert.equal(items[0].aPedido, false)
  assert.equal(items[1].aPedido, true)
})
