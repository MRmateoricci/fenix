import { Router } from 'express'
import multer from 'multer'
import XLSX from 'xlsx'
import { pool } from '../../db/pool.js'
import { requirePosAuth, requirePosRole } from '../../middleware/posAuth.js'
import { normalizeCodigo, toNumber, readPriceWorkbook } from '../../services/excelImport.js'
import { IVA_MULTIPLIER } from '../../config/tax.js'

const router = Router()
router.use(requirePosAuth, requirePosRole('admin'))

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /\.(xlsx|xls|csv)$/i.test(file.originalname)),
})

const roundMoney = value => Math.round(Number(value) * 100) / 100
const displayName = row => [row.name, row.descripcion, row.codigo].map(v => String(v || '').trim()).find(Boolean) || null
const hasContent = row => Array.isArray(row) && row.some(cell => cell != null && String(cell).trim() !== '')

function readRows(buffer) {
  const workbook = readPriceWorkbook(buffer)
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null })
}

// Nombre de columna estilo planilla (A, B, ..., Z, AA...) para cuando la fila
// de encabezado viene vacía o repetida — siempre hay algo mostrable.
function columnLabel(index) {
  let s = ''
  let n = index
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

function buildColumns(headerRow) {
  return headerRow.map((cell, index) => {
    const text = cell != null ? String(cell).trim() : ''
    return { index, label: text || columnLabel(index) }
  })
}

// La fila 0 siempre se toma como encabezado — no hay selector de fila de
// encabezado como en el import del admin; alcance más chico a propósito.
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Subí un archivo Excel o CSV' })
  try {
    const rows = readRows(req.file.buffer)
    const headerRow = rows[0] || []
    const dataRows = rows.slice(1).filter(hasContent)
    res.json({
      columns: buildColumns(headerRow),
      sampleRows: dataRows.slice(0, 5).map(row => headerRow.map((_, i) => row[i] ?? null)),
      totalRows: dataRows.length,
    })
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo leer el archivo' })
  }
})

// Arma el detalle COMPLETO (no solo una muestra) a partir del archivo y el
// mapeo de columnas elegido. priceIncludesTax decide si lo que vino en el
// Excel es precio_iva o precio_venta; a partir de acá todo queda normalizado
// a precio_venta (neto) + precio_iva derivado, sea cual sea el origen —
// aplicar nunca necesita volver a mirar el mapeo original.
async function buildFileImportDetails(client, buffer, { codeColumnIndex, priceColumnIndex, nameColumnIndex, priceIncludesTax }) {
  const rows = readRows(buffer)
  const dataRows = rows.slice(1).filter(hasContent)

  const parsedRows = []
  let invalidCount = 0
  for (const row of dataRows) {
    const code = normalizeCodigo(row[codeColumnIndex])
    const rawPrice = toNumber(row[priceColumnIndex])
    const price = rawPrice != null ? roundMoney(priceIncludesTax ? rawPrice / IVA_MULTIPLIER : rawPrice) : null
    const name = nameColumnIndex != null && nameColumnIndex >= 0 && row[nameColumnIndex] != null
      ? String(row[nameColumnIndex]).trim() || null
      : null
    if (!code || price == null || price < 0) { invalidCount++; continue }
    parsedRows.push({ code, price, name })
  }

  const codes = [...new Set(parsedRows.map(r => r.code))]
  const { rows: products } = codes.length
    ? await client.query(
        `SELECT id, codigo, name, descripcion, precio_venta, price_currency
         FROM products WHERE UPPER(TRIM(codigo)) = ANY($1::text[])`,
        [codes]
      )
    : { rows: [] }
  const productByCode = new Map(products.map(p => [normalizeCodigo(p.codigo), p]))

  const details = parsedRows.map(row => {
    const product = productByCode.get(row.code)
    if (!product) {
      return { productId: null, productCode: row.code, productName: row.name, oldPrice: null, newPrice: row.price, status: 'not_found' }
    }
    const name = row.name || displayName(product)
    if (product.price_currency === 'USD') {
      return { productId: product.id, productCode: row.code, productName: name, oldPrice: Number(product.precio_venta), newPrice: row.price, status: 'skipped_currency' }
    }
    const oldPrice = product.precio_venta != null ? Number(product.precio_venta) : null
    const changed = oldPrice == null || Math.abs(oldPrice - row.price) >= 0.005
    return { productId: product.id, productCode: row.code, productName: name, oldPrice, newPrice: row.price, status: changed ? 'matched' : 'no_change' }
  })

  return { details, totalRows: dataRows.length, invalidCount }
}

// INSERT masivo vía UNNEST — un import puede traer miles de filas y no tiene
// sentido hacer un INSERT por fila.
async function insertDetails(client, importId, details) {
  if (!details.length) return
  await client.query(
    `INSERT INTO pos_price_import_details (import_id, product_id, product_code, product_name, old_price, new_price, status)
     SELECT $1, * FROM UNNEST($2::uuid[], $3::text[], $4::text[], $5::numeric[], $6::numeric[], $7::text[])`,
    [
      importId,
      details.map(d => d.productId),
      details.map(d => d.productCode),
      details.map(d => d.productName),
      details.map(d => d.oldPrice),
      details.map(d => d.newPrice),
      details.map(d => d.status),
    ]
  )
}

function summaryCounts(details, invalidCount = 0) {
  const matchedRows = details.filter(d => d.status === 'matched' || d.status === 'no_change').length
  const updatedRows = details.filter(d => d.status === 'matched').length
  const skippedRows = details.filter(d => d.status === 'not_found' || d.status === 'skipped_currency').length + invalidCount
  return { matchedRows, updatedRows, skippedRows }
}

function previewResponse(importRow, details) {
  return {
    importId: importRow.id,
    createdAt: importRow.created_at,
    totalRows: importRow.total_rows,
    matchedRows: importRow.matched_rows,
    updatedRows: importRow.updated_rows,
    skippedRows: importRow.skipped_rows,
    changed: details.filter(d => d.status === 'matched').slice(0, 50),
    unchanged: details.filter(d => d.status === 'no_change').slice(0, 50),
    notFound: details.filter(d => d.status === 'not_found').slice(0, 50),
    skippedCurrency: details.filter(d => d.status === 'skipped_currency').slice(0, 50),
  }
}

router.post('/preview', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Subí un archivo Excel o CSV' })
  const codeColumnIndex = Number(req.body?.codeColumnIndex)
  const priceColumnIndex = Number(req.body?.priceColumnIndex)
  const nameColumnIndex = req.body?.nameColumnIndex !== undefined && req.body.nameColumnIndex !== ''
    ? Number(req.body.nameColumnIndex) : null
  const priceIncludesTax = req.body?.priceIncludesTax === 'true' || req.body?.priceIncludesTax === true
  const supplierId = req.body?.supplierId || null

  if (!Number.isInteger(codeColumnIndex) || codeColumnIndex < 0) return res.status(400).json({ error: 'Elegí la columna del código' })
  if (!Number.isInteger(priceColumnIndex) || priceColumnIndex < 0) return res.status(400).json({ error: 'Elegí la columna del precio' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    if (supplierId) {
      const { rows } = await client.query(`SELECT id FROM pos_suppliers WHERE id = $1`, [supplierId])
      if (!rows.length) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Proveedor no encontrado' })
      }
    }

    const { details, totalRows, invalidCount } = await buildFileImportDetails(client, req.file.buffer, {
      codeColumnIndex, priceColumnIndex, nameColumnIndex, priceIncludesTax,
    })
    const { matchedRows, updatedRows, skippedRows } = summaryCounts(details, invalidCount)

    const { rows: importRows } = await client.query(
      `INSERT INTO pos_price_imports
         (user_id, supplier_id, kind, filename, total_rows, matched_rows, updated_rows, skipped_rows, status, column_mapping)
       VALUES ($1, $2, 'file', $3, $4, $5, $6, $7, 'preview', $8)
       RETURNING *`,
      [
        req.posUser.id, supplierId, req.file.originalname, totalRows, matchedRows, updatedRows, skippedRows,
        JSON.stringify({ codeColumnIndex, priceColumnIndex, nameColumnIndex, priceIncludesTax }),
      ]
    )
    const importRow = importRows[0]
    await insertDetails(client, importRow.id, details)

    await client.query('COMMIT')
    res.status(201).json(previewResponse(importRow, details))
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[POST /api/pos/price-imports/preview]', err)
    res.status(500).json({ error: 'Error interno' })
  } finally {
    client.release()
  }
})

// POST /bulk-increase/preview — antes de '/:id' para que Express no lo lea
// como un id.
// GET /bulk-increase/filters — valores de proveedor/categoría para poblar los
// selects del aumento porcentual. Son texto libre en `products` (no hay tabla
// de categorías ni de proveedor con id, ver CLAUDE.md 4.7), y el catálogo que
// cachea el POS no trae esos dos campos — de ahí este endpoint chico aparte.
router.get('/bulk-increase/filters', async (_req, res) => {
  try {
    const [{ rows: suppliers }, { rows: categories }] = await Promise.all([
      pool.query(`SELECT DISTINCT supplier FROM products WHERE supplier IS NOT NULL AND TRIM(supplier) <> '' ORDER BY supplier`),
      pool.query(`SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND TRIM(category) <> '' ORDER BY category`),
    ])
    res.json({ suppliers: suppliers.map(r => r.supplier), categories: categories.map(r => r.category) })
  } catch (err) {
    console.error('[GET /api/pos/price-imports/bulk-increase/filters]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.post('/bulk-increase/preview', async (req, res) => {
  const percent = Number(req.body?.percent)
  if (!Number.isFinite(percent) || percent === 0) return res.status(400).json({ error: 'Ingresá un porcentaje distinto de cero' })
  if (percent <= -100) return res.status(400).json({ error: 'Ese porcentaje dejaría precios en cero o negativos' })

  const filters = req.body?.filters || {}
  const { supplier, category, productIds } = filters
  if (!supplier && !category && !(Array.isArray(productIds) && productIds.length)) {
    return res.status(400).json({ error: 'Elegí al menos un filtro: proveedor, categoría o productos puntuales' })
  }

  const conditions = ['precio_venta IS NOT NULL']
  const params = []
  let idx = 1
  if (supplier) { conditions.push(`supplier = $${idx++}`); params.push(supplier) }
  if (category) { conditions.push(`category = $${idx++}`); params.push(category) }
  if (Array.isArray(productIds) && productIds.length) { conditions.push(`id = ANY($${idx++}::uuid[])`); params.push(productIds) }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: products } = await client.query(
      `SELECT id, codigo, name, descripcion, precio_venta, price_currency FROM products WHERE ${conditions.join(' AND ')}`,
      params
    )

    const details = products.map(p => {
      const oldPrice = Number(p.precio_venta)
      const name = displayName(p)
      if (p.price_currency === 'USD') {
        return { productId: p.id, productCode: p.codigo, productName: name, oldPrice, newPrice: oldPrice, status: 'skipped_currency' }
      }
      const newPrice = roundMoney(oldPrice * (1 + percent / 100))
      const changed = Math.abs(newPrice - oldPrice) >= 0.005
      return { productId: p.id, productCode: p.codigo, productName: name, oldPrice, newPrice, status: changed ? 'matched' : 'no_change' }
    })
    const { matchedRows, updatedRows, skippedRows } = summaryCounts(details)

    const filterLabel = [
      supplier ? `proveedor: ${supplier}` : null,
      category ? `categoría: ${category}` : null,
      Array.isArray(productIds) && productIds.length ? `${productIds.length} producto(s) elegidos` : null,
    ].filter(Boolean).join(', ')

    const { rows: importRows } = await client.query(
      `INSERT INTO pos_price_imports
         (user_id, supplier_id, kind, filename, total_rows, matched_rows, updated_rows, skipped_rows, status, column_mapping)
       VALUES ($1, NULL, 'bulk_increase', $2, $3, $3, $4, $5, 'preview', $6)
       RETURNING *`,
      [
        req.posUser.id, `Aumento del ${percent}% (${filterLabel})`, details.length, updatedRows, skippedRows,
        JSON.stringify({ percent, filters }),
      ]
    )
    const importRow = importRows[0]
    await insertDetails(client, importRow.id, details)

    await client.query('COMMIT')
    res.status(201).json(previewResponse(importRow, details))
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[POST /api/pos/price-imports/bulk-increase/preview]', err)
    res.status(500).json({ error: 'Error interno' })
  } finally {
    client.release()
  }
})

// POST /:id/apply — funciona igual para 'file' y 'bulk_increase': después del
// preview, ambos son solo "un import con detalle pendiente de aplicar".
router.post('/:id/apply', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: importRows } = await client.query(
      `SELECT * FROM pos_price_imports WHERE id = $1 FOR UPDATE`,
      [req.params.id]
    )
    if (!importRows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Importación no encontrada' })
    }
    if (importRows[0].status !== 'preview') {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Esta importación ya fue aplicada o cancelada' })
    }

    const { rows: toApply } = await client.query(
      `SELECT id, product_id, new_price FROM pos_price_import_details WHERE import_id = $1 AND status = 'matched'`,
      [req.params.id]
    )
    for (const detail of toApply) {
      await client.query(
        `UPDATE products SET precio_venta = $1, precio_iva = $2, price_updated_at = NOW() WHERE id = $3`,
        [detail.new_price, roundMoney(detail.new_price * IVA_MULTIPLIER), detail.product_id]
      )
    }
    if (toApply.length) {
      await client.query(
        `UPDATE pos_price_import_details SET status = 'applied' WHERE id = ANY($1::uuid[])`,
        [toApply.map(d => d.id)]
      )
    }
    await client.query(
      `UPDATE pos_price_imports SET status = 'applied', updated_rows = $1 WHERE id = $2`,
      [toApply.length, req.params.id]
    )

    await client.query('COMMIT')
    res.json({ importId: req.params.id, updatedRows: toApply.length })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[POST /api/pos/price-imports/:id/apply]', err)
    res.status(500).json({ error: 'Error interno' })
  } finally {
    client.release()
  }
})

router.post('/:id/cancel', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE pos_price_imports SET status = 'cancelled' WHERE id = $1 AND status = 'preview' RETURNING id`,
      [req.params.id]
    )
    if (!rows.length) return res.status(409).json({ error: 'Esta importación ya fue aplicada, cancelada, o no existe' })
    res.json({ importId: req.params.id, status: 'cancelled' })
  } catch (err) {
    console.error('[POST /api/pos/price-imports/:id/cancel]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query
    const cappedLimit = Math.min(Number(limit) || 50, 200)
    const currentPage = Math.max(1, Number(page) || 1)
    const offset = (currentPage - 1) * cappedLimit

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(
        `SELECT pi.*, pu.name AS user_name, ps.name AS supplier_name
         FROM pos_price_imports pi
         JOIN pos_users pu ON pu.id = pi.user_id
         LEFT JOIN pos_suppliers ps ON ps.id = pi.supplier_id
         ORDER BY pi.created_at DESC
         LIMIT $1 OFFSET $2`,
        [cappedLimit, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM pos_price_imports`),
    ])

    res.json({
      imports: rows.map(row => ({
        id: row.id,
        kind: row.kind,
        filename: row.filename,
        userName: row.user_name,
        supplierName: row.supplier_name,
        totalRows: row.total_rows,
        matchedRows: row.matched_rows,
        updatedRows: row.updated_rows,
        skippedRows: row.skipped_rows,
        status: row.status,
        createdAt: row.created_at,
      })),
      total: Number(countRows[0].count),
      page: currentPage,
      limit: cappedLimit,
    })
  } catch (err) {
    console.error('[GET /api/pos/price-imports]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query
    const { rows: importRows } = await pool.query(
      `SELECT pi.*, pu.name AS user_name, ps.name AS supplier_name
       FROM pos_price_imports pi
       JOIN pos_users pu ON pu.id = pi.user_id
       LEFT JOIN pos_suppliers ps ON ps.id = pi.supplier_id
       WHERE pi.id = $1`,
      [req.params.id]
    )
    if (!importRows.length) return res.status(404).json({ error: 'Importación no encontrada' })
    const importRow = importRows[0]

    const conditions = ['import_id = $1']
    const params = [req.params.id]
    let idx = 2
    if (status) { conditions.push(`status = $${idx++}`); params.push(status) }

    const cappedLimit = Math.min(Number(limit) || 50, 200)
    const currentPage = Math.max(1, Number(page) || 1)
    const offset = (currentPage - 1) * cappedLimit

    const [{ rows: details }, { rows: countRows }] = await Promise.all([
      pool.query(
        `SELECT * FROM pos_price_import_details WHERE ${conditions.join(' AND ')}
         ORDER BY product_code LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, cappedLimit, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM pos_price_import_details WHERE ${conditions.join(' AND ')}`, params),
    ])

    res.json({
      import: {
        id: importRow.id,
        kind: importRow.kind,
        filename: importRow.filename,
        userName: importRow.user_name,
        supplierName: importRow.supplier_name,
        totalRows: importRow.total_rows,
        matchedRows: importRow.matched_rows,
        updatedRows: importRow.updated_rows,
        skippedRows: importRow.skipped_rows,
        status: importRow.status,
        columnMapping: importRow.column_mapping,
        createdAt: importRow.created_at,
      },
      details: details.map(d => ({
        id: d.id, productId: d.product_id, productCode: d.product_code, productName: d.product_name,
        oldPrice: d.old_price != null ? Number(d.old_price) : null,
        newPrice: Number(d.new_price), status: d.status,
      })),
      total: Number(countRows[0].count),
      page: currentPage,
      limit: cappedLimit,
    })
  } catch (err) {
    console.error('[GET /api/pos/price-imports/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
