import path from 'node:path'
import { parseSupplierPrices, parseSupplierPriceSheet, readPriceWorkbook } from './excelImport.js'

export function priceCurrencyFromFilename(filename) {
  const name = path.parse(path.basename(String(filename || ''))).name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  return /(^|[^A-Z])(DOLAR|DOLARES|USD)([^A-Z]|$)/.test(name) || /U\$S/.test(name) ? 'USD' : 'ARS'
}

export function supplierCurrencyDefaults(files) {
  const currencies = new Map()
  for (const file of files) {
    if (!currencies.has(file.supplier)) currencies.set(file.supplier, new Set())
    for (const row of file.rows || [{ currency: file.currency }]) currencies.get(file.supplier).add(row.currency || file.currency)
  }
  return [...currencies].filter(([, values]) => values.size === 1)
    .map(([supplier, values]) => ({ supplier, currency: [...values][0] }))
}

// Una selección explícita se valida completa antes de consultar o escribir productos.
export function parseBulkPriceUploads(files, supplier, rawSelection) {
  let selection
  if (rawSelection !== undefined) {
    try {
      selection = typeof rawSelection === 'string' ? JSON.parse(rawSelection) : rawSelection
    } catch {
      throw new Error('No se pudo leer la configuración de hojas y columnas. Volvé a revisarla.')
    }
    if (!Array.isArray(selection) || !selection.length || selection.length > 500) {
      throw new Error('Seleccioná al menos una hoja para importar (máximo 500).')
    }
    const keys = new Set()
    for (const entry of selection) {
      if (!entry || !Number.isInteger(entry.fileIndex) || !files[entry.fileIndex] || typeof entry.sheetName !== 'string'
        || !entry.columns || !['ARS', 'USD'].includes(entry.currency)) {
        throw new Error('Revisá el archivo, las columnas y la moneda de cada hoja seleccionada.')
      }
      const key = JSON.stringify([entry.fileIndex, entry.sheetName])
      if (keys.has(key)) throw new Error(`La hoja “${entry.sheetName}” está seleccionada más de una vez.`)
      keys.add(key)
    }
  }
  const parsedFiles = []
  const failedFiles = []
  for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
    const file = files[fileIndex]
    const selected = selection?.filter(entry => entry.fileIndex === fileIndex)
    if (selected && !selected.length) continue
    const sourceFileName = path.basename(file.originalname)
    try {
      if (!selection) {
        parsedFiles.push({ fileName: sourceFileName, fileIndex, supplier,
          currency: priceCurrencyFromFilename(sourceFileName), ...parseSupplierPrices(file.buffer) })
        continue
      }
      const workbook = readPriceWorkbook(file.buffer)
      for (const entry of selected) {
        const fileName = `${sourceFileName} — ${entry.sheetName}`
        try {
          const parsed = parseSupplierPriceSheet(workbook, entry)
          parsedFiles.push({ ...parsed, fileName, sourceFileName, fileIndex, supplier,
            currency: entry.currency, explicitCurrency: true })
        } catch (err) {
          failedFiles.push({ fileName, error: err.message })
        }
      }
    } catch (err) {
      failedFiles.push({ fileName: sourceFileName, error: err.message })
    }
  }
  return { parsedFiles, failedFiles, configured: !!selection }
}
