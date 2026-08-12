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
}

function findPriceHeader(rows) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 25); rowIndex++) {
    const headers = (rows[rowIndex] || []).map(normalizedHeader)
    const codeIndex = headers.findIndex(header => /^(ITEM|CODIGO|COD|SKU|ARTICULO|COD ARTICULO|CODIGO ARTICULO|CODIGO PRODUCTO)$/.test(header))
    const descriptionIndex = headers.findIndex(header => /DESCRIP|DETALLE|^PRODUCTO$/.test(header))
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
// pesos. Si la cabecera no se reconoce, conserva el formato histórico A-E.
export function parseSupplierPrices(buffer) {
  const rowsRaw = readRows(buffer)
  const detected = findPriceHeader(rowsRaw)
  const headerRowIndex = detected?.rowIndex ?? 0
  const headers = detected?.headers || []
  const codeIndex = detected?.codeIndex ?? 0
  const descriptionIndex = detected?.descriptionIndex ?? 1
  const used = new Set([codeIndex, descriptionIndex])

  const costIndex = detected
    ? firstHeaderIndex(headers, header => /COSTO/.test(header) && !/IVA/.test(header), used)
    : 2
  if (costIndex >= 0) used.add(costIndex)
  const saleIndex = detected
    ? firstHeaderIndex(headers, header => /VENTA/.test(header) && !/IVA/.test(header), used)
    : 3
  if (saleIndex >= 0) used.add(saleIndex)
  const taxIndex = detected
    ? firstHeaderIndex(headers, header => /PRECIO/.test(header) && /IVA/.test(header) && !/COSTO/.test(header), used)
    : 4

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
    rows.push({
      codigo,
      descripcion: row?.[descriptionIndex] != null ? String(row[descriptionIndex]).trim() : null,
      precio_costo: precioCosto,
      precio_venta: precioVenta,
      precio_iva: precioIva,
    })
  }

  return {
    rows,
    totalRows: dataRows.length,
    skipped,
    invalidRows,
    columns: { codeIndex, descriptionIndex, costIndex, saleIndex, taxIndex },
  }
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
