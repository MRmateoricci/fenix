import test from 'node:test'
import assert from 'node:assert/strict'
import XLSX from 'xlsx'
import { inspectSupplierPrices, parseSupplierPrices } from './excelImport.js'

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

test('ignora filas completamente vacías aunque la hoja esté formateada hasta la fila 1000', () => {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Código', 'Descripción', 'Costo', 'Venta', 'Precio con IVA'],
    ['ABC-1', 'Producto', 10, 20, 24.2],
  ])
  worksheet['!ref'] = 'A1:E1000'
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Precios')
  const parsed = parseSupplierPrices(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))

  assert.equal(parsed.totalRows, 1)
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.skipped, 0)
  assert.deepEqual(parsed.invalidRows, [])
})

test('lee el formato Diluz con columna inicial vacía y PRECIO como costo, y avisa sobre las demás hojas', () => {
  const workbook = XLSX.utils.book_new()
  const rows = Array.from({ length: 9 }, () => [])
  rows[0] = [null, 'LISTA DE PRECIOS B']
  rows.push([null, 'CÓDIGO', 'DESCRIPCIÓN', 'PRECIO'], [],
    [null, null, 'PORTALÁMPARAS', 'PRECIO'],
    [null, 'D-0006', 'FLORÓN NEGRO (8021)', 955.6785])
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'LISTA CUENTA B')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Código', 'Descripción', 'Precio'], ['USD-1', 'Producto en dólares', 20],
  ]), 'SCHNEIDER')
  const parsed = parseSupplierPrices(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rows[0].precio_costo, 955.6785)
  assert.equal(parsed.rows[0].precio_venta, null)
  assert.equal(parsed.sheetName, 'LISTA CUENTA B')
  assert.ok(parsed.warnings.some(message => message.includes('SCHNEIDER') && message.includes('No se importan')))
  assert.ok(parsed.warnings.some(message => message.includes('se interpreta como costo')))
})

test('acepta COD. / ARTICULO, encabezados tardíos y alias de precio', () => {
  for (const priceHeader of ['Precio $', 'Precio de lista', 'Importe', 'Precio unitario', 'Precio en ARG$']) {
    const parsed = parseSupplierPrices(workbookBuffer([
      ...Array.from({ length: 30 }, () => ['Título']),
      ['COD.', 'ARTICULO', 'UxB', priceHeader],
      [6516, 'LÁMPARA A60', 50, 875.7822],
    ]))
    assert.equal(parsed.rows[0].codigo, '6516')
    assert.equal(parsed.rows[0].precio_costo, 875.7822)
  }
})

test('no confunde columnas genéricas con los precios explícitos ni el costo con IVA', () => {
  const parsed = parseSupplierPrices(workbookBuffer([
    ['Código', 'Descripción', 'Precio', 'Precio Costo', 'Costo c/IVA', 'Precio Venta', 'Precio c/IVA'],
    ['A', 'Producto', 999, 10, 12.1, 20, 24.2],
  ]))
  assert.equal(parsed.rows[0].precio_costo, 10)
  assert.equal(parsed.rows[0].precio_venta, 20)
  assert.equal(parsed.rows[0].precio_iva, 24.2)
  assert.deepEqual(parsed.warnings, [])
  assert.throws(() => parseSupplierPrices(workbookBuffer([
    ['Código', 'Descripción', 'Costo c/IVA'], ['A', 'Producto', 12.1],
  ])), /ninguna columna de precio reconocida/)
})

test('rechaza precios ambiguos y describe las columnas no reconocidas', () => {
  assert.throws(() => parseSupplierPrices(workbookBuffer([
    ['Código', 'Descripción', 'Precio ARS', 'Precio USD'], ['A', 'Producto', 1000, 1],
  ])), /varias columnas de precio posibles/)
  assert.throws(() => parseSupplierPrices(workbookBuffer([
    ['Código', 'Descripción', 'Tarifa especial'], ['A', 'Producto', 10],
  ])), /fila 1 \(Código, Descripción, Tarifa especial\)/)
})

test('explica hojas vacías, encabezados ausentes y listas sin productos', () => {
  assert.throws(() => parseSupplierPrices(workbookBuffer([])), /hoja está vacía/)
  assert.throws(() => parseSupplierPrices(workbookBuffer([
    ['Catálogo ilustrado'], ['COD. 504'], [1768.3],
  ])), /No se encontraron encabezados/)
  assert.throws(() => parseSupplierPrices(workbookBuffer([
    ['Código', 'Descripción', 'Precio'],
  ])), /No hay productos debajo/)
})

test('incluye motivos y números reales de fila cuando ningún producto es válido', () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Código', 'Descripción', 'Precio Costo'],
    [null, 'Sin código', 5], ['A', 'Sin precio', 'Consultar'],
  ], { origin: 'B5' })
  sheet['!ref'] = 'B5:D7'
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Precios')
  assert.throws(() => parseSupplierPrices(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })), error => {
    assert.match(error.message, /Hoja “Precios”/)
    assert.match(error.message, /Fila 6: Falta el código/)
    assert.match(error.message, /Fila 7: No contiene precios válidos/)
    return true
  })
})

test('continúa después de separadores, encabezados repetidos y saltos de página hasta el último producto', () => {
  const rows = [['Código', 'Descripción', 'Precio'], ['A', 'Primer bloque', 10], [],
    [null, 'FICHAS'], ['Código', 'Descripción', 'Precio'], ['B', 'Segundo bloque', 20],
    ...Array.from({ length: 130 }, () => []), ['Código', 'Descripción', 'Precio'], ['C', 'Último bloque', 30]]
  const parsed = parseSupplierPrices(workbookBuffer(rows))
  assert.deepEqual(parsed.rows.map(row => row.codigo), ['A', 'B', 'C'])
  assert.equal(parsed.rows.at(-1).precio_costo, 30)
})

test('respeta USD y ARS explícitos en formatos de celda dentro de una misma hoja y muestra el texto de Excel', () => {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Código', 'Descripción', 'Precio'], ['A', 'En pesos', 955.6785], [],
    ['Código', 'Descripción', 'Precio'], ['B', 'Guirnalda', 6.24], ['C', 'En pesos explícitos', 40],
  ])
  sheet.C2.z = '"$" #,##0.00'
  sheet.C5.z = '[$USD] #,##0.00'
  sheet.C6.z = '"ARS" #,##0.00'
  XLSX.utils.book_append_sheet(workbook, sheet, 'Mixta')
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const parsed = parseSupplierPrices(buffer, { sheetName: 'Mixta', headerRow: 1,
    columns: { codeIndex: 0, descriptionIndex: 1, costIndex: 2, saleIndex: -1, taxIndex: -1 } })
  assert.equal(parsed.rows[0].currency, undefined)
  assert.equal(parsed.rows[1].currency, 'USD')
  assert.equal(parsed.rows[1].currencySource, 'cell')
  assert.equal(parsed.rows[1].precio_costo, 6.24)
  assert.equal(parsed.rows[2].currency, 'ARS')
  assert.ok(parsed.warnings.some(warning => warning.includes('2 filas tienen moneda explícita')))
  const inspection = inspectSupplierPrices(buffer)[0]
  assert.match(inspection.sampleDisplayRows[4][2], /USD.*6.24/)
  assert.match(inspection.sampleDisplayRows[1][2], /955.68/)
  assert.equal(inspection.sampleRows[1][2], 955.6785)
})

test('rechaza una fila con varias columnas de precio en monedas explícitas distintas', () => {
  assert.throws(() => parseSupplierPrices(workbookBuffer([
    ['Código', 'Descripción', 'Costo', 'Venta'], ['A', 'Producto', 'USD 10', 'ARS 2000'],
  ])), /Fila 2: las columnas de precio elegidas mezclan pesos y dólares/)
})
