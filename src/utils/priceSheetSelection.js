export const priceColumnFields = [
  ['codeIndex', 'Código'], ['descriptionIndex', 'Descripción'], ['costIndex', 'Costo (sin IVA)'],
  ['saleIndex', 'Venta (sin IVA)'], ['taxIndex', 'Venta con IVA'],
]

export function sheetSelectionError(sheet) {
  if (!Number.isInteger(sheet.headerRow) || sheet.headerRow < 1 || sheet.headerRow > sheet.rowCount) return 'Elegí una fila de encabezados válida.'
  if (!['ARS', 'USD'].includes(sheet.currency)) return 'Elegí la moneda de los precios.'
  const indexes = priceColumnFields.map(([field]) => sheet.columns[field])
  if (indexes.some(index => !Number.isInteger(index) || index < -1 || index >= sheet.columnCount)) return 'Revisá las columnas asignadas.'
  if (sheet.columns.codeIndex < 0) return 'Asigná la columna de código.'
  if ([sheet.columns.costIndex, sheet.columns.saleIndex, sheet.columns.taxIndex].every(index => index < 0)) return 'Asigná al menos una columna de precio.'
  const assigned = indexes.filter(index => index >= 0)
  if (new Set(assigned).size !== assigned.length) return 'Una columna no puede usarse para dos campos distintos.'
  return ''
}

export function buildSheetSelection(sheets) {
  return sheets.filter(sheet => sheet.selected).map(({ fileIndex, sheetName, headerRow, columns, currency }) => ({
    fileIndex, sheetName, headerRow, columns, currency,
  }))
}

export function excelColumnLabel(index) {
  let label = ''
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) label = String.fromCharCode(65 + (value - 1) % 26) + label
  return label
}
