import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import express from 'express'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import XLSX from 'xlsx'
import router from './products.js'
import { pool } from '../db/pool.js'

test('inspección, vista previa y confirmación mantienen hojas, columnas y monedas sin importar una selección inválida', async t => {
  const oldSecret = process.env.ADMIN_SESSION_SECRET
  process.env.ADMIN_SESSION_SECRET = 'price-import-isolated-test'
  t.after(() => {
    if (oldSecret === undefined) delete process.env.ADMIN_SESSION_SECRET
    else process.env.ADMIN_SESSION_SECRET = oldSecret
  })
  const queries = []
  let connections = 0
  const client = {
    release() {},
    async query(sql, params) {
      queries.push({ sql, params })
      if (/SELECT usd_ars_rate/.test(sql)) return { rows: [{ usd_ars_rate: 100 }] }
      if (/SELECT supplier, currency FROM supplier_price_settings/.test(sql)) return { rows: [{ supplier: 'TEST', currency: 'USD' }] }
      if (/INSERT INTO products \(/.test(sql)) return { rows: params.filter((_, i) => i % 11 === 0).map(codigo => ({ codigo })) }
      return { rows: [] }
    },
  }
  t.mock.method(pool, 'connect', async () => { connections++; return client })
  const app = express()
  app.use(cookieParser())
  app.use('/products', router)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => server.close(resolve)))
  const cookie = `fenix_admin_session=${jwt.sign({ role: 'admin' }, process.env.ADMIN_SESSION_SECRET)}`
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Código', 'Descripción', 'Precio'], ['A', 'En pesos', 100], ['A', 'Repetido', 200], ['C', 'USD dentro de hoja en pesos', 3],
  ]), 'Pesos')
  workbook.Sheets.Pesos.C4.z = '[$USD] #,##0.00'
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Código', 'Descripción', 'Precio U$S'], ['B', 'En dólares', 2], ['A', 'Repetido entre hojas', 5],
  ]), 'Dolares')
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const request = async (route, selection) => {
    const form = new FormData()
    form.append('files', new Blob([buffer]), 'Lista.xlsx')
    form.append('supplier', 'TEST')
    if (selection !== undefined) form.append('sheetSelection', JSON.stringify(selection))
    const response = await fetch(`http://127.0.0.1:${server.address().port}/products/import/prices/${route}`, { method: 'POST', headers: { Cookie: cookie }, body: form })
    return { status: response.status, body: await response.json() }
  }
  const inspect = await request('inspect')
  assert.equal(inspect.status, 200)
  assert.equal(connections, 0)
  assert.equal(inspect.body.files[0].sheets.length, 2)
  const selection = inspect.body.files[0].sheets.map(sheet => ({
    fileIndex: 0, sheetName: sheet.sheetName, headerRow: sheet.headerRow, columns: sheet.columns,
    currency: sheet.currency || 'ARS',
  }))
  for (const endpoint of ['bulk/preview', 'bulk']) {
    const invalid = await request(endpoint, [...selection, { ...selection[0], sheetName: 'No existe' }])
    assert.equal(invalid.status, 400)
    assert.equal(invalid.body.failedFiles.length, 1)
    assert.equal(connections, 0)
  }
  const preview = await request('bulk/preview', selection)
  assert.equal(preview.status, 200)
  assert.equal(preview.body.processedFiles, 1)
  assert.equal(preview.body.processedSheets, 2)
  assert.equal(preview.body.created, 3)
  assert.equal(preview.body.skipped, 2)
  assert.deepEqual(preview.body.files.map(file => file.currency), ['ARS', 'USD'])
  const mixedItem = preview.body.files[0].items.find(item => item.codigo === 'C')
  assert.equal(mixedItem.currency, 'USD')
  assert.equal(mixedItem.currencySource, 'cell')
  assert.ok(queries.every(({ sql }) => !/INSERT|UPDATE|DELETE/.test(sql)))
  const applied = await request('bulk', selection)
  assert.equal(applied.status, 200)
  assert.equal(applied.body.created, preview.body.created)
  assert.equal(applied.body.skipped, preview.body.skipped)
  const inserted = queries.filter(({ sql }) => /INSERT INTO products \(/.test(sql))
  assert.equal(inserted.length, 2)
  assert.equal(inserted[0].params[0], 'A')
  assert.equal(inserted[0].params[2], 100)
  assert.equal(inserted[0].params[8], 'ARS')
  assert.equal(inserted[0].params[11], 'C')
  assert.equal(inserted[0].params[13], 300)
  assert.equal(inserted[0].params[19], 'USD')
  assert.equal(inserted[1].params[0], 'B')
  assert.equal(inserted[1].params[2], 200)
  assert.equal(inserted[1].params[8], 'USD')
})
