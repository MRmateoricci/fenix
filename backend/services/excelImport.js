import XLSX from 'xlsx'

// ── Helpers compartidos ──────────────────────────────────────────────────────

export function normalizeCodigo(raw) {
  const s = String(raw ?? '').trim().toUpperCase()
  return s || null
}

export function toNumber(cell) {
  if (cell === null || cell === undefined || cell === '') return null
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null
  let s = String(cell).trim()
  if (!s) return null
  s = s.replace(/[^\d.,-]/g, '')
  if (!s) return null
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (s.includes(',')) {
    s = s.replace(',', '.')
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

export function toPercent(cell) {
  if (cell === null || cell === undefined || cell === '') return null
  if (typeof cell === 'string' && cell.trim().endsWith('%')) {
    const n = toNumber(cell.replace('%', ''))
    return n === null ? null : n / 100
  }
  const n = toNumber(cell)
  if (n === null) return null
  return n > 1 ? n / 100 : n
}

function readRows(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null })
}

function normalizedHeader(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9$]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function findPriceHeader(rows) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 100); rowIndex++) {
    const headers = (rows[rowIndex] || []).map(normalizedHeader)
    const codeIndex = headers.findIndex(header => /^(ITEM|CODIGO|COD|SKU|ARTICULO|COD ARTICULO|CODIGO ARTICULO|CODIGO PRODUCTO)$/.test(header))
    const descriptionIndex = headers.findIndex((header, index) => index !== codeIndex && /DESCRIP|DETALLE|^(PRODUCTO|ARTICULO|NOMBRE)$/.test(header))
    if (codeIndex >= 0 && descriptionIndex >= 0) return { rowIndex, headers, codeIndex, descriptionIndex }
  }
  return null
}

function firstHeaderIndex(headers, predicate, excluded = new Set()) {
  for (let index = 0; index < headers.length; index++) {
    if (!excluded.has(index) && predicate(headers[index])) return index
  }
  return -1
}

// Lee por nombre de columna para soportar las listas actuales de los proveedores,
// que intercalan "Costo c/IVA" y también pueden agregar columnas equivalentes en
// pesos. Un precio genérico de proveedor se interpreta como costo y se avisa.
export function readPriceWorkbook(buffer) {
  try {
    return XLSX.read(buffer, { type: 'buffer', cellNF: true })
  } catch {
    throw new Error('No se pudo abrir el Excel. Verificá que sea un archivo XLS o XLSX válido y que no esté protegido con contraseña.')
  }
}

function priceCellCurrency(cell) {
  // Excel puede guardar USD solamente en el formato numérico, no en el valor.
  // Un símbolo $ aislado es ambiguo: en ese caso se usa la moneda de la hoja.
  const label = `${cell?.w || cell?.v || ''} ${cell?.z || ''}`.toUpperCase()
  const usd = /\b(USD|DOLAR|DOLARES)\b|U\$S|US\$/.test(label)
  const ars = /\b(ARS|PESOS)\b|ARG\$/.test(label)
  return usd !== ars ? (usd ? 'USD' : 'ARS') : null
}

export function parseSupplierPrices(buffer, options = {}) {
  return parseSupplierPriceSheet(readPriceWorkbook(buffer), options)
}

export function parseSupplierPriceSheet(workbook, options = {}) {
  const sheetName = options.sheetName ?? workbook.SheetNames[0]
  if (!workbook.SheetNames.includes(sheetName)) throw new Error(`No existe la hoja “${sheetName}” en este archivo.`)
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new Error('El archivo no contiene hojas para leer.')
  // range: 0 conserva los números reales de fila aunque el rango usado empiece más abajo.
  const rowsRaw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, range: 0 })
  const detected = options.columns ? null : findPriceHeader(rowsRaw)
  const warnings = []
  if (!options.sheetName && workbook.SheetNames.length > 1) {
    warnings.push(`Solo se lee la primera hoja, “${sheetName}”. No se importan: ${workbook.SheetNames.slice(1).join(', ')}. Para cargarlas, guardá cada lista en un archivo separado y revisá su formato y moneda.`)
  }
  const fail = message => {
    throw new Error(`Hoja “${sheetName}”: ${message}${warnings.length ? ` ${warnings.join(' ')}` : ''}`)
  }
  if (!rowsRaw.some(row => row.some(cell => cell != null && String(cell).trim() !== ''))) {
    fail('La hoja está vacía.')
  }
  if (!detected && !options.columns) {
    fail('No se encontraron encabezados de código y descripción en las primeras 100 filas. Usá una fila con “Código”, “Descripción” y “Precio Costo” (o “Precio”). Cada producto debe ocupar una fila.')
  }
  let headerRowIndex, headers, codeIndex, descriptionIndex, costIndex, saleIndex, taxIndex
  if (options.columns) {
    if (!Number.isInteger(options.headerRow) || options.headerRow < 1 || options.headerRow > rowsRaw.length) {
      fail('Elegí una fila de encabezados válida.')
    }
    headerRowIndex = options.headerRow - 1
    headers = (rowsRaw[headerRowIndex] || []).map(normalizedHeader)
    const maxColumn = XLSX.utils.decode_range(sheet['!ref'] || 'A1').e.c
    const fields = ['codeIndex', 'descriptionIndex', 'costIndex', 'saleIndex', 'taxIndex']
    const indexes = fields.map(field => options.columns[field])
    if (indexes.some(index => !Number.isInteger(index) || index < -1 || index > maxColumn)) {
      fail('La asignación contiene una columna que no existe en la hoja.')
    }
    ;[codeIndex, descriptionIndex, costIndex, saleIndex, taxIndex] = indexes
    if (codeIndex < 0 || [costIndex, saleIndex, taxIndex].every(index => index < 0)) {
      fail('Asigná una columna de código y al menos una columna de precio.')
    }
    const assigned = indexes.filter(index => index >= 0)
    if (new Set(assigned).size !== assigned.length) fail('Una misma columna no puede asignarse a dos campos distintos.')
  } else {
    ;({ rowIndex: headerRowIndex, headers, codeIndex, descriptionIndex } = detected)
    const used = new Set([codeIndex, descriptionIndex])

    costIndex = firstHeaderIndex(headers, header => /\b(COSTO|COSTE)\b/.test(header) && !/IVA/.test(header), used)
    if (costIndex >= 0) used.add(costIndex)
    saleIndex = firstHeaderIndex(headers, header => /VENTA/.test(header) && !/IVA/.test(header), used)
    if (saleIndex >= 0) used.add(saleIndex)
    taxIndex = firstHeaderIndex(headers, header => /PRECIO/.test(header) && /IVA/.test(header) && !/COSTO|COSTE/.test(header), used)
    // No mezclar una segunda lista/moneda con columnas de precio ya reconocidas.
    if ([costIndex, saleIndex, taxIndex].every(index => index < 0)) {
      const genericIndexes = headers.flatMap((header, index) =>
        !used.has(index) && /^(PRECIO(?: DE LISTA| LISTA| UNITARIO| POR MT| POR METRO)?|IMPORTE)(?: EN)?(?: ARS| ARG\$| USD| U\$S| U S| PESOS| DOLARES| \$)?$/.test(header) ? [index] : [])
      if (genericIndexes.length > 1) {
        fail(`Hay varias columnas de precio posibles en la fila ${headerRowIndex + 1}. Dejá una sola o identificá las columnas como “Precio Costo”, “Precio Venta” y “Precio c/IVA”, en una misma moneda.`)
      }
      if (genericIndexes.length === 1) {
        costIndex = genericIndexes[0]
        const label = String(rowsRaw[headerRowIndex][costIndex]).trim()
        warnings.push(`Hoja “${sheetName}”: la columna “${label}” se interpreta como costo del proveedor. Revisá que el importe y la moneda sean correctos antes de confirmar.`)
      }
    }
    if ([costIndex, saleIndex, taxIndex].every(index => index < 0)) {
      const labels = rowsRaw[headerRowIndex].filter(value => value != null && String(value).trim()).join(', ')
      fail(`Se encontraron encabezados en la fila ${headerRowIndex + 1} (${labels}), pero ninguna columna de precio reconocida. Usá “Precio Costo”, “Precio Venta”, “Precio c/IVA” o “Precio”. “Costo c/IVA” no se convierte automáticamente a costo sin IVA.`)
    }
  }

  // SheetJS respeta el rango usado de la hoja. Algunos proveedores aplican
  // formato hasta la fila 1000, aunque después del último producto no haya
  // ningún dato. Esas filas no forman parte de la lista ni son errores.
  const dataRows = rowsRaw.slice(headerRowIndex + 1)
    .map((row, dataIndex) => ({ row, rowNumber: headerRowIndex + dataIndex + 2 }))
    .filter(({ row }) => (row || []).some(cell => cell != null && String(cell).trim() !== ''))
  const rows = []
  let skipped = 0
  const invalidRows = []

  for (const { row, rowNumber } of dataRows) {
    const codigo = normalizeCodigo(row?.[codeIndex])
    const precioCosto = costIndex >= 0 ? toNumber(row?.[costIndex]) : null
    const precioVenta = saleIndex >= 0 ? toNumber(row?.[saleIndex]) : null
    const precioIva = taxIndex >= 0 ? toNumber(row?.[taxIndex]) : null
    if (!codigo || codigo.length > 64 || [precioCosto, precioVenta, precioIva].every(value => value == null)) {
      skipped++
      invalidRows.push({
        rowNumber,
        codigo: codigo || (row?.[codeIndex] == null ? '' : String(row[codeIndex]).trim()),
        descripcion: row?.[descriptionIndex] == null ? '' : String(row[descriptionIndex]).trim(),
        reason: !codigo
          ? 'Falta el código'
          : codigo.length > 64
            ? 'El código supera los 64 caracteres'
            : 'No contiene precios válidos',
      })
      continue
    }
    const currencies = new Set([costIndex, saleIndex, taxIndex]
      .filter(index => index >= 0 && toNumber(row?.[index]) != null)
      .map(index => priceCellCurrency(sheet[XLSX.utils.encode_cell({ r: rowNumber - 1, c: index })]))
      .filter(Boolean))
    if (currencies.size > 1) fail(`Fila ${rowNumber}: las columnas de precio elegidas mezclan pesos y dólares. Asigná columnas en una misma moneda para ese producto.`)
    const currency = [...currencies][0]
    rows.push({
      codigo,
      descripcion: row?.[descriptionIndex] != null ? String(row[descriptionIndex]).trim() : null,
      precio_costo: precioCosto,
      precio_venta: precioVenta,
      precio_iva: precioIva,
      ...(currency ? { currency, currencySource: 'cell' } : {}),
    })
  }

  if (!rows.length) {
    const examples = invalidRows.slice(0, 3).map(row => `Fila ${row.rowNumber}: ${row.reason}`).join('; ')
    fail(dataRows.length
      ? `No se encontraron productos válidos. ${examples}. Cada producto necesita un código de hasta 64 caracteres y al menos un precio numérico.`
      : `No hay productos debajo de los encabezados de la fila ${headerRowIndex + 1}.`)
  }

  const currencyRows = rows.filter(row => row.currency).length
  if (currencyRows) warnings.push(`Hoja “${sheetName}”: ${currencyRows} filas tienen moneda explícita en sus celdas (${[...new Set(rows.map(row => row.currency).filter(Boolean))].join(', ')}). Se respeta esa moneda; para las demás se usa la moneda elegida para la hoja. Las excepciones por código guardadas tienen prioridad.`)

  return {
    sheetName,
    headerRow: headerRowIndex + 1,
    warnings,
    rows,
    totalRows: dataRows.length,
    skipped,
    invalidRows,
    columns: { codeIndex, descriptionIndex, costIndex, saleIndex, taxIndex },
  }
}

export function inspectSupplierPrices(buffer) {
  const workbook = readPriceWorkbook(buffer)
  return workbook.SheetNames.map(sheetName => {
    const sheet = workbook.Sheets[sheetName]
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
    const sampleRows = XLSX.utils.sheet_to_json(sheet, {
      header: 1, raw: true, defval: null,
      range: { s: { r: 0, c: 0 }, e: { r: Math.min(range.e.r, 99), c: Math.min(range.e.c, 255) } },
    })
    const sampleDisplayRows = sampleRows.map((row, rowIndex) => row.map((value, column) => {
      const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: column })]
      return cell?.w?.trim() || value
    }))
    const detected = findPriceHeader(sampleRows)
    let parsed, error = ''
    try {
      parsed = parseSupplierPriceSheet(workbook, { sheetName })
    } catch (err) {
      error = err.message
    }
    const headerRow = parsed?.headerRow || (detected ? detected.rowIndex + 1 : 1)
    const title = normalizedHeader(sampleRows.slice(0, headerRow).flat().join(' '))
    const usd = /\b(USD|DOLAR|DOLARES)\b|U\$S/.test(title)
    const ars = /\b(ARS|PESOS)\b|ARG\$/.test(title)
    return {
      sheetName, headerRow, rowCount: range.e.r + 1,
      columnCount: Math.min(range.e.c + 1, 256), sampleRows, sampleDisplayRows,
      columns: parsed?.columns || {
        codeIndex: detected?.codeIndex ?? -1, descriptionIndex: detected?.descriptionIndex ?? -1,
        costIndex: -1, saleIndex: -1, taxIndex: -1,
      },
      currency: usd !== ars ? (usd ? 'USD' : 'ARS') : null,
      currencyHint: (usd && ars ? 'La hoja menciona pesos y dólares. Revisá las columnas elegidas.'
        : usd || ars ? 'Moneda sugerida por el encabezado de la hoja.' : 'No se pudo detectar una moneda general. Revisala antes de continuar.')
        + ' Las celdas que indican USD o ARS conservan esa moneda. La selección se usa para importes sin moneda explícita, incluido el símbolo $ solo.',
      selected: !!parsed, validRows: parsed?.rows.length || 0,
      warnings: parsed?.warnings || [], error,
    }
  })
}

// ── 1. Catálogo maestro (Huergui) ────────────────────────────────────────────
// A=Ítem B=Descripción C=Grupo D=SubGrupo E=Medida F=Orden G/H vacías
export function parseHuerguiCatalog(buffer) {
  const rowsRaw = readRows(buffer)
  const dataRows = rowsRaw.slice(1)
  const rows = []
  let skipped = 0

  for (const r of dataRows) {
    const codigo = normalizeCodigo(r[0])
    if (!codigo) { skipped++; continue }
    rows.push({
      codigo,
      descripcion: r[1] != null ? String(r[1]).trim() : null,
      grupo:       r[2] != null ? String(r[2]).trim() : null,
      subgrupo:    r[3] != null ? String(r[3]).trim() : null,
      medida:      r[4] != null ? String(r[4]).trim() : null,
    })
  }

  return { rows, totalRows: dataRows.length, skipped }
}

// ── 2. Lista de precios (ALCIDES) ────────────────────────────────────────────
// A=Ítem B=Descripción C=Precio Costo D=Precio Venta E=Precio c/IVA F=Fecha G=Días
export function parseAlcidesPrices(buffer) {
  return parseSupplierPrices(buffer)
}

// ── 3. Comprobante de venta (Presupuesto POS) ────────────────────────────────
// A=N° B=Ítem C=Descripción D=Cantidad E=Precio F=IVA% G=Subtotal
// Una fila es un renglón válido sii B tiene código y D es un número > 0 —
// esto la hace robusta a cualquier banner de encabezado o pie de página.
export function parseSaleVoucher(buffer) {
  const rowsRaw = readRows(buffer)
  const lines = []

  for (const r of rowsRaw) {
    const codigo   = normalizeCodigo(r[1])
    const cantidad = toNumber(r[3])
    if (!codigo || !cantidad || cantidad <= 0) continue
    lines.push({
      lineNumber:  r[0] != null ? String(r[0]).trim() : null,
      codigo,
      descripcion: r[2] != null ? String(r[2]).trim() : null,
      cantidad,
      precio:      toNumber(r[4]),
      ivaPct:      toNumber(r[5]),
      subtotal:    toNumber(r[6]),
    })
  }

  return { lines, totalRows: rowsRaw.length }
}

// ── 4. Orden de compra a proveedor (KIAN) ────────────────────────────────────
// Encabezado en filas 0-9 (informativo, best-effort). Líneas de producto desde
// fila ~10: A=Código C=Descripción D=Watts E/F=Alícuota IVA H=Precio lista USD
// I=Precio oferta USD K=Desc.cond.pago L=Precio final USD N=Cant.por caja
// O=Unidades P=Cajas R=Total neto USD S=Total neto ARS.
// Filas de categoría (sin código) y de totales al final se descartan con la
// misma regla: el código debe matchear /^[0-9]+[A-Za-z]*$/.
const KIAN_CODE_RE = /^[0-9]+[A-Za-z]*$/

function parseKianHeader(rowsRaw) {
  const header = {
    fecha: null, vendedorNumero: null, clienteNumero: null, razonSocial: null,
    tipoCambio: null, descuentoPct: null, condicionPago: null,
  }

  const headerRows = rowsRaw.slice(0, 10)
  for (const row of headerRows) {
    if (!row) continue
    for (let i = 0; i < row.length; i++) {
      const cell = row[i]
      if (typeof cell !== 'string' || !cell.trim()) continue
      const label = cell.toLowerCase()
      const next  = row[i + 1]

      if (label.includes('tipo de cambio') || label.includes('cotiz')) {
        header.tipoCambio = toNumber(next)
      } else if (label.includes('descuento')) {
        header.descuentoPct = toPercent(next)
      } else if (label.includes('condici')) {
        header.condicionPago = next != null ? String(next).trim() : null
      } else if (label.includes('raz') && label.includes('social')) {
        header.razonSocial = next != null ? String(next).trim() : null
      } else if (label.includes('fecha')) {
        header.fecha = next != null ? String(next).trim() : null
      } else if (label.includes('vendedor')) {
        header.vendedorNumero = next != null ? String(next).trim() : null
      } else if (label.includes('cliente')) {
        header.clienteNumero = next != null ? String(next).trim() : null
      }
    }
  }

  return header
}

export function parseKianPurchaseOrder(buffer) {
  const rowsRaw = readRows(buffer)
  const header  = parseKianHeader(rowsRaw)
  const lines = []
  const skippedRows = []

  for (let idx = 0; idx < rowsRaw.length; idx++) {
    const r = rowsRaw[idx]
    if (!r) continue
    const rawCodigo = r[0]
    const codigoStr = rawCodigo != null ? String(rawCodigo).trim() : ''

    if (!codigoStr) {
      continue // filas vacías, sin ruido
    }
    if (!KIAN_CODE_RE.test(codigoStr)) {
      skippedRows.push({ rowIndex: idx, reason: 'no coincide con patrón de código' })
      continue
    }

    const unidades    = toNumber(r[14]) || 0 // O
    const cajas       = toNumber(r[15]) || 0 // P
    const cantPorCaja = toNumber(r[13]) || 0 // N
    const totalUnidades = unidades + cajas * cantPorCaja

    lines.push({
      codigo:          normalizeCodigo(codigoStr),
      descripcion:     r[2] != null ? String(r[2]).trim() : null, // C
      watts:           toNumber(r[3]),  // D
      ivaRate:         toNumber(r[4]) || toNumber(r[5]) || null, // E/F
      precioListaUsd:  toNumber(r[7]),  // H
      precioOfertaUsd: toNumber(r[8]),  // I
      descFactor:      toNumber(r[10]), // K
      precioFinalUsd:  toNumber(r[11]), // L
      cantPorCaja,
      unidades,
      cajas,
      totalUnidades,
      totalNetoUsd:    toNumber(r[17]), // R
      totalNetoArs:    toNumber(r[18]), // S
    })
  }

  return { header, lines, skippedRows }
}
