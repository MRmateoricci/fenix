import test from 'node:test'
import assert from 'node:assert/strict'
import XLSX from 'xlsx'
import { inspectSupplierPrices, parseSupplierPrices } from './excelImport.js'
import { parseBulkPriceUploads, supplierCurrencyDefaults } from './supplierPriceUpload.js'

function file(sheets, bookType = 'xlsx') {
  const workbook = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name)
  return { originalname: `Proveedor.${bookType}`, buffer: XLSX.write(workbook, { type: 'buffer', bookType }) }
}

const columns = { codeIndex: 0, descriptionIndex: 1, costIndex: 2, saleIndex: -1, taxIndex: -1 }
const option = (sheetName, extra = {}) => ({ fileIndex: 0, sheetName, headerRow: 1, columns, currency: 'ARS', ...extra })

test('inspecciona todas las hojas, sugiere moneda y deja las hojas no tabulares sin seleccionar', () => {
  const upload = file({
    Portada: [['Lista de precios']],
    Pesos: [['LISTA EN PESOS'], ['Código', 'Descripción', 'Precio'], ['A', 'Producto A', 100]],
    Dolares: [['LISTA EN DOLARES'], ['Código', 'Descripción', 'Precio U$S'], ['B', 'Producto B', 2]],
    Vacia: [],
  })
  const sheets = inspectSupplierPrices(upload.buffer)
  assert.deepEqual(sheets.map(sheet => sheet.selected), [false, true, true, false])
  assert.deepEqual(sheets.map(sheet => sheet.currency), [null, 'ARS', 'USD', null])
  assert.equal(sheets[1].headerRow, 2)
  assert.equal(sheets[2].columns.costIndex, 2)
  assert.equal(sheets[1].sampleRows[2][0], 'A')
  assert.match(sheets[3].error, /vacía/)
})

test('lee varias hojas elegidas del mismo archivo y conserva su moneda explícita', () => {
  const upload = file({
    Portada: [['Información']],
    Pesos: [['Código', 'Descripción', 'Precio'], ['ARS-1', 'En pesos', 100]],
    Dolares: [['Código', 'Descripción', 'Precio'], ['USD-1', 'En dólares', 2]],
  })
  const selection = [option('Pesos'), option('Dolares', { currency: 'USD' })]
  const preview = parseBulkPriceUploads([upload], 'PROVEEDOR', JSON.stringify(selection))
  const confirm = parseBulkPriceUploads([upload], 'PROVEEDOR', JSON.stringify(selection))
  assert.deepEqual(preview, confirm)
  assert.equal(preview.configured, true)
  assert.deepEqual(preview.failedFiles, [])
  assert.equal(preview.parsedFiles.length, 2)
  assert.deepEqual(preview.parsedFiles.map(sheet => sheet.currency), ['ARS', 'USD'])
  assert.ok(preview.parsedFiles.every(sheet => sheet.explicitCurrency))
  assert.match(preview.parsedFiles[1].fileName, /Dolares/)
  assert.equal(preview.parsedFiles[1].rows[0].precio_costo, 2)
  assert.equal(new Set(preview.parsedFiles.map(sheet => sheet.fileIndex)).size, 1)
})

test('la asignación manual permite nombres propios, columnas reordenadas y otra fila de encabezados en XLS', () => {
  const upload = file({ Lista: [['Notas'], ['Valor neto', 'Referencia interna', 'Texto'], [42, 'MANUAL-1', 'Producto']] }, 'xls')
  const manualColumns = { codeIndex: 1, descriptionIndex: 2, costIndex: -1, saleIndex: 0, taxIndex: -1 }
  const result = parseBulkPriceUploads([upload], 'PROVEEDOR', [option('Lista', { headerRow: 2, columns: manualColumns })])
  assert.deepEqual(result.failedFiles, [])
  assert.deepEqual(result.parsedFiles[0].rows[0], {
    codigo: 'MANUAL-1', descripcion: 'Producto', precio_costo: null, precio_venta: 42, precio_iva: null,
  })
})

test('separa archivos con hojas del mismo nombre y respeta las hojas excluidas', () => {
  const uploads = [file({ Lista: [['Código', 'Descripción', 'Precio'], ['A', 'Uno', 1]] }),
    file({ Lista: [['Código', 'Descripción', 'Precio'], ['B', 'Dos', 2]] })]
  const result = parseBulkPriceUploads(uploads, 'PROVEEDOR', [option('Lista', { fileIndex: 1 })])
  assert.equal(result.parsedFiles.length, 1)
  assert.equal(result.parsedFiles[0].rows[0].codigo, 'B')
})

test('valida selección, moneda y columnas antes de importar', () => {
  const upload = file({ Lista: [['Código', 'Descripción', 'Precio'], ['A', 'Uno', 1]] })
  for (const selection of ['{', [], [option('Lista'), option('Lista')], [option('Lista', { fileIndex: 4 })], [option('Lista', { currency: 'EUR' })]]) {
    assert.throws(() => parseBulkPriceUploads([upload], 'PROVEEDOR', selection))
  }
  for (const invalid of [
    option('No existe'), option('Lista', { headerRow: 0 }), option('Lista', { headerRow: 999 }),
    option('Lista', { columns: { ...columns, costIndex: 0 } }),
    option('Lista', { columns: { ...columns, costIndex: 9 } }),
    option('Lista', { columns: { ...columns, costIndex: -1 } }),
    option('Lista', { columns: { ...columns, codeIndex: -1 } }),
  ]) {
    const result = parseBulkPriceUploads([upload], 'PROVEEDOR', [invalid])
    assert.equal(result.configured, true)
    assert.equal(result.parsedFiles.length, 0)
    assert.equal(result.failedFiles.length, 1)
    assert.ok(result.failedFiles[0].error)
  }
})

test('detalla una hoja fallida aunque otra seleccionada sea válida', () => {
  const upload = file({ Buena: [['Código', 'Descripción', 'Precio'], ['A', 'Uno', 1]], Mala: [['Código', 'Descripción', 'Precio'], ['B', 'Dos', 'Consultar']] })
  const result = parseBulkPriceUploads([upload], 'PROVEEDOR', [option('Buena'), option('Mala')])
  assert.equal(result.configured, true)
  assert.equal(result.failedFiles.length, 1)
  assert.match(result.failedFiles[0].fileName, /Mala/)
  assert.match(result.failedFiles[0].error, /Fila 2: No contiene precios válidos/)
})

test('una carga en varias monedas no define una moneda global arbitraria para el proveedor', () => {
  assert.deepEqual(supplierCurrencyDefaults([
    { supplier: 'MIXTO', currency: 'ARS' }, { supplier: 'MIXTO', currency: 'USD' },
    { supplier: 'OTRO', currency: 'ARS' }, { supplier: 'OTRO', currency: 'ARS' },
  ]), [{ supplier: 'OTRO', currency: 'ARS' }])
  assert.deepEqual(supplierCurrencyDefaults([{ supplier: 'MIXTO', currency: 'ARS', rows: [{}, { currency: 'USD' }] }]), [])
})

test('permite omitir descripción al asignar columnas manualmente', () => {
  const parsed = parseSupplierPrices(file({ Lista: [['Referencia', 'Valor'], ['A', 15]] }).buffer, {
    sheetName: 'Lista', headerRow: 1, columns: { codeIndex: 0, descriptionIndex: -1, costIndex: 1, saleIndex: -1, taxIndex: -1 },
  })
  assert.equal(parsed.rows[0].descripcion, null)
  assert.equal(parsed.rows[0].precio_costo, 15)
})
