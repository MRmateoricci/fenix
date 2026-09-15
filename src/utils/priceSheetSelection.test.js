import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSheetSelection, excelColumnLabel, previewCodeAffixes, sheetSelectionError } from './priceSheetSelection.js'

const sheet = { fileIndex: 0, sheetName: 'Precios', selected: true, rowCount: 20, columnCount: 4, headerRow: 3, currency: 'USD',
  columns: { codeIndex: 0, descriptionIndex: 1, costIndex: 3, saleIndex: -1, taxIndex: -1 } }

test('envía solo hojas elegidas con la misma asignación y moneda de la revisión', () => {
  const result = buildSheetSelection([sheet, { ...sheet, sheetName: 'Excluir', selected: false }])
  assert.deepEqual(result, [{ fileIndex: 0, sheetName: 'Precios', headerRow: 3, currency: 'USD', columns: sheet.columns, codeStripPrefix: '', codeAddPrefix: '' }])
  assert.equal(sheetSelectionError(sheet), '')
})

test('el ajuste de códigos viaja recortado y el ejemplo en vivo imita al backend', () => {
  const [result] = buildSheetSelection([{ ...sheet, codeStripPrefix: ' CA- ', codeAddPrefix: 'can-' }])
  assert.equal(result.codeStripPrefix, 'CA-')
  assert.equal(result.codeAddPrefix, 'can-')
  assert.equal(previewCodeAffixes('1790/ng', { codeAddPrefix: 'ca-' }), 'CA-1790/NG')
  assert.equal(previewCodeAffixes('CA-1790/NG', { codeAddPrefix: 'ca-' }), 'CA-1790/NG')
  assert.equal(previewCodeAffixes('CA-1790/NG', { codeStripPrefix: 'ca-' }), '1790/NG')
  assert.equal(previewCodeAffixes('CA-1790/NG', { codeStripPrefix: 'CA-', codeAddPrefix: 'CAN-' }), 'CAN-1790/NG')
  assert.equal(previewCodeAffixes('', { codeAddPrefix: 'CA-' }), '')
  assert.ok(sheetSelectionError({ ...sheet, codeAddPrefix: 'X'.repeat(41) }))
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
