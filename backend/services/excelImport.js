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
  const rowsRaw = readRows(buffer)
  const dataRows = rowsRaw.slice(1)
  const rows = []
  let skipped = 0

  for (const r of dataRows) {
    const codigo = normalizeCodigo(r[0])
    if (!codigo) { skipped++; continue }
    rows.push({
      codigo,
      descripcion:  r[1] != null ? String(r[1]).trim() : null,
      precio_costo: toNumber(r[2]),
      precio_venta: toNumber(r[3]),
      precio_iva:   toNumber(r[4]),
    })
  }

  return { rows, totalRows: dataRows.length, skipped }
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
