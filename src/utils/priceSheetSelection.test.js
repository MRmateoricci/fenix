import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSheetSelection, excelColumnLabel, sheetSelectionError } from './priceSheetSelection.js'

const sheet = { fileIndex: 0, sheetName: 'Precios', selected: true, rowCount: 20, columnCount: 4, headerRow: 3, currency: 'USD',
  columns: { codeIndex: 0, descriptionIndex: 1, costIndex: 3, saleIndex: -1, taxIndex: -1 } }

test('envía solo hojas elegidas con la misma asignación y moneda de la revisión', () => {
  const result = buildSheetSelection([sheet, { ...sheet, sheetName: 'Excluir', selected: false }])
  assert.deepEqual(result, [{ fileIndex: 0, sheetName: 'Precios', headerRow: 3, currency: 'USD', columns: sheet.columns }])
  assert.equal(sheetSelectionError(sheet), '')
})

test('bloquea asignaciones duplicadas, campos obligatorios faltantes y filas fuera de rango', () => {
  for (const invalid of [
    { ...sheet, headerRow: 0 }, { ...sheet, headerRow: 21 }, { ...sheet, currency: '' },
    { ...sheet, columns: { ...sheet.columns, codeIndex: -1 } },
    { ...sheet, columns: { ...sheet.columns, costIndex: -1 } },
    { ...sheet, columns: { ...sheet.columns, costIndex: 0 } },
    { ...sheet, columns: { ...sheet.columns, costIndex: 4 } },
  ]) assert.ok(sheetSelectionError(invalid))
  assert.equal(excelColumnLabel(0), 'A')
  assert.equal(excelColumnLabel(26), 'AA')
})
