import test from 'node:test'
import assert from 'node:assert/strict'
import XLSX from 'xlsx'
import { parseSupplierPrices } from './excelImport.js'

function workbookBuffer(rows) {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Precios')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}

test('lee las columnas de venta sin confundir costo con IVA', () => {
  const parsed = parseSupplierPrices(workbookBuffer([
    ['Item', 'Descripción', 'Precio Costo', 'Costo c/IVA', 'Precio Venta', 'Precio c/IVA', 'Precio Venta $', 'Precio c/IVA $'],
    ['CABR-SL-102', 'AISLADOR CON TUERCA', 236.96, 286.72, 343.59, 415.75, 343.59, 415.75],
  ]))

  assert.equal(parsed.rows.length, 1)
  assert.deepEqual(parsed.rows[0], {
    codigo: 'CABR-SL-102',
    descripcion: 'AISLADOR CON TUERCA',
    precio_costo: 236.96,
    precio_venta: 343.59,
    precio_iva: 415.75,
  })
  assert.deepEqual(parsed.columns, {
    codeIndex: 0,
    descriptionIndex: 1,
    costIndex: 2,
    saleIndex: 4,
    taxIndex: 5,
  })
})

test('encuentra la cabecera aunque la planilla tenga filas previas', () => {
  const parsed = parseSupplierPrices(workbookBuffer([
    ['Lista vigente'],
    [null],
    ['Código', 'Descripción', 'Costo', 'Venta', 'Precio con IVA'],
    ['ABC-1', 'Producto de prueba', '1,25', '2,50', '3,025'],
  ]))

  assert.equal(parsed.totalRows, 1)
  assert.deepEqual(parsed.rows[0], {
    codigo: 'ABC-1',
    descripcion: 'Producto de prueba',
    precio_costo: 1.25,
    precio_venta: 2.5,
    precio_iva: 3.025,
  })
})
