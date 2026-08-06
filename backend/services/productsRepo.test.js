import test from 'node:test'
import assert from 'node:assert/strict'
import { createSupplierPriceDrafts } from './productsRepo.js'

test('crea borradores, convierte USD y no pisa códigos existentes o repetidos', async () => {
  const insertParams = []
  const client = {
    async query(sql, params) {
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
