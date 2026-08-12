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
