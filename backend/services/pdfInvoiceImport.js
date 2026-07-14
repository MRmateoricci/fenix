import pdfParseLib from 'pdf-parse/lib/pdf-parse.js'
import { toNumber } from './excelImport.js'

const pdfParse = pdfParseLib.default ?? pdfParseLib

const UNIT_RE = /^C\/?U\.?$/i

// Token que mezcla letras y números (ej. "SH204L-C32", "FH202") — es el mejor
// indicio de un código de producto embebido en la descripción del proveedor.
// Se exige longitud >= 5 para descartar abreviaturas con typo como "BIP0".
const CODE_TOKEN_RE = /\b[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g

export function extractCodeCandidate(descripcion) {
  const tokens = descripcion.toUpperCase().match(CODE_TOKEN_RE) || []
  const scored = tokens
    .filter((t) => t.length >= 5 && /[A-Z]/.test(t) && /[0-9]/.test(t))
    .sort((a, b) => b.length - a.length)
  return scored[0] || null
}

// Los generadores de PDF de facturas/remitos ubican el texto en el orden en
// que se dibuja, no en el orden visual de las columnas — por eso no se puede
// confiar en el orden completo de una fila. Lo único estable observado es la
// vecindad inmediata alrededor de la columna de unidad ("C/U."): la línea
// justo antes es la descripción, dos líneas antes la cantidad, y la línea
// siguiente el precio unitario. Este parser es un "mejor esfuerzo" genérico;
// si un proveedor usa un layout distinto, las líneas simplemente quedan
// afuera y el admin las carga a mano en la revisión.
export function parseInvoiceText(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const items = []
  const skippedLines = []

  for (let i = 0; i < lines.length; i++) {
    if (!UNIT_RE.test(lines[i])) continue

    const descripcion = lines[i - 1]
    const cantidad = Number(lines[i - 2])
    const precioUsd = toNumber(lines[i + 1])

    if (!descripcion || !/[a-zA-Z]/.test(descripcion) || !Number.isInteger(cantidad) || cantidad <= 0) {
      skippedLines.push({ context: [lines[i - 2], descripcion, lines[i], lines[i + 1]].filter(Boolean).join(' / ') })
      continue
    }

    items.push({
      cantidad,
      descripcion,
      precioUsd,
      codigoCandidato: extractCodeCandidate(descripcion),
    })
  }

  return { items, skippedLines }
}

export async function parseInvoicePdf(buffer) {
  const data = await pdfParse(buffer)
  return parseInvoiceText(data.text)
}
