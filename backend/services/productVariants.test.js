import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyDerivedVariantPrices,
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

// ── Precio derivado de otra variante ─────────────────────────────────────────

function derivedClient(rules) {
  const updates = []
  return {
    updates,
    async query(sql, params) {
      if (/SELECT id, price_source_rule_id/.test(sql)) return { rows: rules }
      if (/UPDATE product_variant_rules/.test(sql)) {
        updates.push({ id: params[6], costo: params[0], venta: params[1], iva: params[2] })
        return { rowCount: 1 }
      }
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }
}

test('una variante que sigue a otra con 0% copia su precio exacto', async () => {
  const client = derivedClient([
    { id: 'origen', price_source_rule_id: null, price_source_percent: 0, precio_costo: 9339.17, precio_venta: 13234, precio_iva: 16013.14, precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null },
    { id: 'sigue', price_source_rule_id: 'origen', price_source_percent: 0, precio_costo: 1, precio_venta: 1, precio_iva: 1, precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null },
  ])
  const cambiadas = await applyDerivedVariantPrices(client, 'p-1')

  assert.equal(cambiadas, 1)
  assert.equal(client.updates.length, 1)
  assert.equal(client.updates[0].id, 'sigue')
  assert.equal(client.updates[0].venta, 13234)
  assert.equal(client.updates[0].iva, 16013.14)
  assert.equal(client.updates[0].costo, 9339.17)
})

test('el porcentaje se aplica a costo, venta e IVA por igual', async () => {
  const client = derivedClient([
    { id: 'origen', price_source_rule_id: null, price_source_percent: 0, precio_costo: 100, precio_venta: 200, precio_iva: 242, precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null },
    { id: 'sigue', price_source_rule_id: 'origen', price_source_percent: 15, precio_costo: null, precio_venta: null, precio_iva: null, precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null },
  ])
  await applyDerivedVariantPrices(client, 'p-1')

  assert.equal(client.updates[0].costo, 115)
  assert.equal(client.updates[0].venta, 230)
  assert.equal(client.updates[0].iva, 278.3)
})

test('un porcentaje negativo abarata la variante seguida', async () => {
  const client = derivedClient([
    { id: 'origen', price_source_rule_id: null, price_source_percent: 0, precio_costo: null, precio_venta: 1000, precio_iva: 1210, precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null },
    { id: 'sigue', price_source_rule_id: 'origen', price_source_percent: -10, precio_costo: null, precio_venta: 0, precio_iva: 0, precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null },
  ])
  await applyDerivedVariantPrices(client, 'p-1')

  assert.equal(client.updates[0].venta, 900)
  assert.equal(client.updates[0].iva, 1089)
  assert.equal(client.updates[0].costo, null)
})

test('si el precio derivado ya coincide no se escribe nada', async () => {
  const client = derivedClient([
    { id: 'origen', price_source_rule_id: null, price_source_percent: 0, precio_costo: 100, precio_venta: 200, precio_iva: 242, precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null },
    { id: 'sigue', price_source_rule_id: 'origen', price_source_percent: 0, precio_costo: 100, precio_venta: 200, precio_iva: 242, precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null },
  ])
  const cambiadas = await applyDerivedVariantPrices(client, 'p-1')

  assert.equal(cambiadas, 0)
  assert.equal(client.updates.length, 0)
})

test('una variante que sigue a otra que a su vez es derivada no se recalcula', async () => {
  const client = derivedClient([
    { id: 'raiz', price_source_rule_id: null, price_source_percent: 0, precio_costo: null, precio_venta: 100, precio_iva: 121, precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null },
    { id: 'media', price_source_rule_id: 'raiz', price_source_percent: 10, precio_costo: null, precio_venta: 0, precio_iva: 0, precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null },
    { id: 'hoja', price_source_rule_id: 'media', price_source_percent: 10, precio_costo: null, precio_venta: 0, precio_iva: 0, precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null },
  ])
  await applyDerivedVariantPrices(client, 'p-1')

  assert.deepEqual(client.updates.map(update => update.id), ['media'])
})

test('un origen que ya no está en el producto deja la variante como estaba', async () => {
  const client = derivedClient([
    { id: 'sigue', price_source_rule_id: 'borrada', price_source_percent: 0, precio_costo: null, precio_venta: 500, precio_iva: 605, precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null },
  ])
  const cambiadas = await applyDerivedVariantPrices(client, 'p-1')

  assert.equal(cambiadas, 0)
  assert.equal(client.updates.length, 0)
})

test('sin variantes derivadas no se consulta ni se escribe de más', async () => {
  const client = derivedClient([
    { id: 'a', price_source_rule_id: null, price_source_percent: 0, precio_costo: null, precio_venta: 100, precio_iva: 121, precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null },
  ])
  assert.equal(await applyDerivedVariantPrices(client, 'p-1'), 0)
  assert.equal(client.updates.length, 0)
})
