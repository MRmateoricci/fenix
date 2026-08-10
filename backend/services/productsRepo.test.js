import test from 'node:test'
import assert from 'node:assert/strict'
import { createSupplierPriceDrafts } from './productsRepo.js'

test('crea borradores, convierte USD y no pisa códigos existentes o repetidos', async () => {
  const insertParams = []
  const client = {
    async query(sql, params) {
      if (/SELECT source_code_key, product_id/.test(sql)) return { rows: [] }
      assert.match(sql, /published/)
      assert.match(sql, /ON CONFLICT \(codigo\) DO NOTHING/)
      insertParams.push(params)
      const inserted = []
      for (let index = 0; index < params.length; index += 11) {
        if (params[index] !== 'EXISTENTE') inserted.push({ codigo: params[index] })
      }
      return { rows: inserted }
    },
  }

  const result = await createSupplierPriceDrafts(client, [
    {
      fileName: 'CELUZ EN DOLARES.xlsx', supplier: 'CELUZ EN DOLARES', currency: 'USD', totalRows: 2, skipped: 0,
      rows: [
        { codigo: 'USD-1', descripcion: 'En dólares', precio_costo: 2, precio_venta: 3, precio_iva: 3.63 },
        { codigo: 'EXISTENTE', descripcion: 'Ya cargado', precio_costo: 1, precio_venta: 2, precio_iva: 2.42 },
      ],
    },
    {
      fileName: 'CABRERA.xlsx', supplier: 'CABRERA', currency: 'ARS', totalRows: 2, skipped: 0,
      rows: [
        { codigo: 'USD-1', descripcion: 'Repetido', precio_costo: 10, precio_venta: 20, precio_iva: 24.2 },
        { codigo: 'ARS-1', descripcion: 'En pesos', precio_costo: 1510, precio_venta: 2000, precio_iva: 2420 },
      ],
    },
  ], 1510)

  assert.equal(result.created, 2)
  assert.equal(result.updated, 0)
  assert.equal(result.skipped, 2)
  assert.equal(result.files[0].existingCount, 1)
  assert.equal(result.files[1].duplicateRows, 1)
  assert.deepEqual(insertParams[0].slice(0, 11), [
    'USD-1', 'En dólares', 3020, 4530, 5481.3, 2, 3, 3.63, 'USD', 1510, 'CELUZ EN DOLARES',
  ])
  assert.deepEqual(insertParams[1].slice(0, 11), [
    'ARS-1', 'En pesos', 1510, 2000, 2420, 1, 1.32, 1.6, 'ARS', 1510, 'CABRERA',
  ])
})

test('una lista masiva actualiza el precio de una variante unida sin recrear su codigo', async () => {
  const productId = '11111111-1111-4111-8111-111111111111'
  let colorUpdateParams = null
  let productInsertAttempted = false
  const client = {
    async query(sql, params) {
      if (/SELECT source_code_key, product_id/.test(sql)) {
        return { rows: [{ source_code_key: 'FE-AP-121N/T', product_id: productId }] }
      }
      if (/SELECT source_code_key, color_name, color_hex, size_label/.test(sql)) {
        return { rows: [{ source_code_key: 'FE-AP-121N/T', color_name: 'Negro', color_hex: '#111111', size_label: null }] }
      }
      if (/SELECT color_options, precio_costo/.test(sql)) {
        return {
          rows: [{
            color_options: [
              { name: 'Negro', hex: '#111111', supplierCode: 'FE-AP-121N/T', price: 100 },
              { name: 'Blanco', hex: '#FFFFFF', supplierCode: 'FE-AP-121B/T', price: 120 },
            ],
            precio_costo: 70, precio_venta: 100, precio_iva: 121,
            precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null,
          }],
        }
      }
      if (/UPDATE products\s+SET color_options/.test(sql)) {
        colorUpdateParams = params
        return { rows: [], rowCount: 1 }
      }
      if (/INSERT INTO supplier_product_mappings/.test(sql)) return { rows: [], rowCount: 1 }
      if (/INSERT INTO products/.test(sql)) productInsertAttempted = true
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }

  const result = await createSupplierPriceDrafts(client, [{
    fileName: 'FERROLUX.xlsx', supplier: 'FERROLUX', currency: 'ARS', totalRows: 1, skipped: 0,
    rows: [{ codigo: 'FE-AP-121N/T', descripcion: 'Negro', precio_costo: 140, precio_venta: 250, precio_iva: 302.5 }],
  }], 1510)

  const colors = JSON.parse(colorUpdateParams[0])
  assert.equal(result.created, 0)
  assert.equal(result.updated, 1)
  assert.equal(productInsertAttempted, false)
  assert.equal(colors.find(color => color.name === 'Negro').price, 250)
  assert.equal(colors.find(color => color.name === 'Blanco').price, 120)
})
