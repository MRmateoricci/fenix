import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { unlink } from 'fs/promises'
import { pool } from '../db/pool.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { uploadsDir } from '../config/uploads.js'
import {
  normalizeCodigo,
  toNumber,
  parseHuerguiCatalog,
  parseAlcidesPrices,
  parseSaleVoucher,
  parseKianPurchaseOrder,
} from '../services/excelImport.js'
import { parseInvoicePdf } from '../services/pdfInvoiceImport.js'
import {
  applyCleosCatalogProducts,
  discardCleosPreview,
  parseCleosCatalogPdf,
  saveCleosPreviewImage,
} from '../services/cleosCatalogImport.js'
import {
  upsertCatalogRows,
  upsertPriceRows,
  applySaleDecrement,
  applyPurchaseIncrement,
  matchInvoiceLines,
  applyInvoiceLines,
} from '../services/productsRepo.js'

const router = Router()
router.use(requireAdmin)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /\.(xlsx|xls)$/i.test(file.originalname)),
})

const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /\.pdf$/i.test(file.originalname)),
})

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function buildProductFilters(query) {
  const {
    search, supplier, lowStock, stockStatus, published,
    stockMin, stockMax, costMin, costMax, saleMin, saleMax,
  } = query
  const conditions = []
  const params = []
  let idx = 1

  if (search) {
    conditions.push(`(codigo ILIKE $${idx} OR descripcion ILIKE $${idx} OR name ILIKE $${idx})`)
    params.push(`%${search}%`)
    idx++
  }
  if (supplier) {
    conditions.push(`supplier = $${idx++}`)
    params.push(supplier)
  }
  if (lowStock === 'true') conditions.push('stock <= 5')
  if (stockStatus === 'out') conditions.push('stock <= 0')
  if (stockStatus === 'low') conditions.push('stock BETWEEN 1 AND 5')
  if (stockStatus === 'available') conditions.push('stock > 0')
  if (published != null) {
    conditions.push(`published = $${idx++}`)
    params.push(published === 'true')
  }

  const addNumericFilter = (value, expression, operator) => {
    if (value === '' || value == null) return
    const numericValue = Number(value)
    if (!Number.isFinite(numericValue)) return
    conditions.push(`${expression} ${operator} $${idx++}`)
    params.push(numericValue)
  }

  addNumericFilter(stockMin, 'stock', '>=')
  addNumericFilter(stockMax, 'stock', '<=')
  addNumericFilter(costMin, 'COALESCE(precio_costo, precio_costo_usd)', '>=')
  addNumericFilter(costMax, 'COALESCE(precio_costo, precio_costo_usd)', '<=')
  addNumericFilter(saleMin, 'precio_venta', '>=')
  addNumericFilter(saleMax, 'precio_venta', '<=')

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
    nextIndex: idx,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/products
// Query params: ?search=&supplier=ALCIDES&lowStock=true&published=true&page=1&limit=50
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const {
      search, supplier, lowStock, stockStatus, published,
      stockMin, stockMax, costMin, costMax, saleMin, saleMax,
      sortBy = 'updated', sortDir = 'desc', page = 1, limit = 50,
    } = req.query
    const cappedLimit = Math.min(Number(limit) || 50, 200)
    const currentPage = Math.max(1, Number(page) || 1)
    const offset = (currentPage - 1) * cappedLimit

    const { where, params, nextIndex: idx } = buildProductFilters({
      search, supplier, lowStock, stockStatus, published,
      stockMin, stockMax, costMin, costMax, saleMin, saleMax,
    })

    const sortColumns = {
      product: `COALESCE(NULLIF(name, ''), NULLIF(descripcion, ''), codigo)`,
      supplier: 'supplier',
      cost: 'COALESCE(precio_costo, precio_costo_usd)',
      sale: 'precio_venta',
      stock: 'stock',
      published: 'published',
      updated: 'updated_at',
    }
    const orderColumn = sortColumns[sortBy] || sortColumns.updated
    const orderDirection = String(sortDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC'

    const [data, countResult, suppliersResult] = await Promise.all([
      pool.query(
        `SELECT * FROM products ${where}
         ORDER BY ${orderColumn} ${orderDirection} NULLS LAST, updated_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, cappedLimit, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM products ${where}`, params),
      pool.query(
        `SELECT DISTINCT supplier
         FROM products
         WHERE supplier IS NOT NULL AND TRIM(supplier) <> ''
         ORDER BY supplier`
      ),
    ])

    res.json({
      products: data.rows,
      total: Number(countResult.rows[0].count),
      suppliers: suppliersResult.rows.map(row => row.supplier),
      page: currentPage,
      limit: cappedLimit,
    })
  } catch (err) {
    console.error('[GET /api/products]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// GET /api/products/selection/ids — IDs de todos los resultados filtrados.
// Permite seleccionar más de una página sin descargar productos completos.
router.get('/selection/ids', async (req, res) => {
  try {
    const { where, params } = buildProductFilters(req.query)
    const { rows } = await pool.query(
      `SELECT id FROM products ${where} ORDER BY updated_at DESC`,
      params
    )
    res.json({ ids: rows.map(row => row.id) })
  } catch (err) {
    console.error('[GET /api/products/selection/ids]', err)
    res.status(500).json({ error: 'No se pudieron seleccionar los productos' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/products/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' })
    res.json(rows[0])
  } catch (err) {
    console.error('[GET /api/products/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Campos editables por PATCH/POST — mezcla los del Inventario (proveedores)
// con los del catálogo público (ver columnas agregadas en db/schema.sql:
// "Catálogo público" para el detalle de cada una).
// ─────────────────────────────────────────────────────────────────────────────
const FIELD_TRANSFORMS = {
  codigo:            (v) => normalizeCodigo(v),
  descripcion:       (v) => v,
  grupo:             (v) => v,
  subgrupo:          (v) => v,
  medida:            (v) => v,
  supplier:          (v) => String(v || 'OTRO').trim().toUpperCase(),
  precio_costo:      (v) => toNumber(v),
  precio_venta:      (v) => toNumber(v),
  precio_iva:        (v) => toNumber(v),
  stock:             (v) => Number(v),
  name:              (v) => v,
  category:          (v) => v,
  subcategory:       (v) => v,
  description_larga: (v) => v,
  original_price:    (v) => toNumber(v),
  image_url:         (v) => v,
  hover_image_url:   (v) => v,
  color_options:     (v) => JSON.stringify(v ?? []),
  size_options:      (v) => JSON.stringify(v ?? []),
  color_temp:        (v) => toNumber(v),
  ip_rating:         (v) => v,
  material:          (v) => v,
  cable_type:        (v) => v,
  product_type:      (v) => v,
  published:         (v) => Boolean(v),
}
const EDITABLE_FIELDS = Object.keys(FIELD_TRANSFORMS)

// POST /api/products/batch — actualiza o elimina una selección en una única
// transacción. Los campos admitidos son intencionalmente acotados a las
// acciones disponibles en la tabla del administrador.
router.post('/batch', async (req, res) => {
  const ids = [...new Set(Array.isArray(req.body.ids) ? req.body.ids.map(String) : [])]
  if (!ids.length || ids.length > 5000 || ids.some(id => !UUID_PATTERN.test(id))) {
    return res.status(400).json({ error: 'La selección de productos no es válida' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existing = await client.query(
      'SELECT id FROM products WHERE id = ANY($1::uuid[]) FOR UPDATE',
      [ids]
    )
    if (existing.rows.length !== ids.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Uno o más productos ya no existen' })
    }

    if (req.body.action === 'delete') {
      await client.query('DELETE FROM products WHERE id = ANY($1::uuid[])', [ids])
      await client.query('COMMIT')
      return res.json({ deleted: ids.length })
    }

    if (req.body.action !== 'update') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Acción masiva no válida' })
    }

    const allowedFields = ['precio_venta', 'precio_costo', 'published']
    const changes = req.body.changes && typeof req.body.changes === 'object' ? req.body.changes : {}
    const fields = allowedFields.filter(field => field in changes)
    if (fields.length !== 1) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Elegí un único cambio para aplicar' })
    }

    const field = fields[0]
    const value = FIELD_TRANSFORMS[field](changes[field])
    if ((field === 'precio_venta' || field === 'precio_costo') && (!Number.isFinite(value) || value < 0)) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'El precio debe ser un número mayor o igual a cero' })
    }

    const { rows } = await client.query(
      `UPDATE products SET ${field} = $1 WHERE id = ANY($2::uuid[]) RETURNING *`,
      [value, ids]
    )
    await client.query('COMMIT')
    res.json({ products: rows, updated: rows.length })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[POST /api/products/batch]', err)
    res.status(500).json({ error: 'No se pudo completar la acción masiva' })
  } finally {
    client.release()
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/products — creación manual. Si no viene `codigo` (caso típico de
// un producto nuevo cargado directo desde el catálogo público, sin pasar por
// el Inventario), se genera uno automático para no bloquear el alta.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const codigo = normalizeCodigo(req.body.codigo) || `AUTO-${Date.now()}`

    const fields = ['codigo']
    const placeholders = ['$1']
    const params = [codigo]
    let idx = 2

    for (const field of EDITABLE_FIELDS) {
      if (field === 'codigo' || !(field in req.body)) continue
      fields.push(field)
      placeholders.push(`$${idx++}`)
      params.push(FIELD_TRANSFORMS[field](req.body[field]))
    }

    const { rows } = await pool.query(
      `INSERT INTO products (${fields.join(', ')}, source)
       VALUES (${placeholders.join(', ')}, 'manual')
       RETURNING *`,
      params
    )
    res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un producto con ese código' })
    console.error('[POST /api/products]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/products/:id — edición manual (Inventario y/o campos de tienda)
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const sets = []
    const params = []
    let idx = 1

    for (const field of EDITABLE_FIELDS) {
      if (!(field in req.body)) continue
      sets.push(`${field} = $${idx++}`)
      params.push(FIELD_TRANSFORMS[field](req.body[field]))
    }
    if (!sets.length) return res.status(400).json({ error: 'Sin cambios para aplicar' })

    params.push(req.params.id)
    const { rows } = await pool.query(
      `UPDATE products SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    )
    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' })
    res.json(rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un producto con ese código' })
    console.error('[PATCH /api/products/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/products/stock/batch — aplica todos los cambios manuales pendientes
// en una sola consulta. Se reciben deltas para no pisar ventas o compras que
// hayan modificado el stock mientras el administrador tenía abierta la tabla.
router.post('/stock/batch', async (req, res) => {
  try {
    const rawChanges = Array.isArray(req.body.changes) ? req.body.changes : []
    if (!rawChanges.length || rawChanges.length > 200) {
      return res.status(400).json({ error: 'Enviá entre 1 y 200 cambios de stock' })
    }

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    const accumulated = new Map()
    for (const change of rawChanges) {
      const id = String(change?.id || '')
      const delta = Number(change?.delta)
      if (!uuidPattern.test(id) || !Number.isInteger(delta)) {
        return res.status(400).json({ error: 'Hay un cambio de stock inválido' })
      }
      accumulated.set(id, (accumulated.get(id) || 0) + delta)
    }

    const changes = [...accumulated.entries()].filter(([, delta]) => delta !== 0)
    if (!changes.length) return res.json({ products: [] })

    const ids = changes.map(([id]) => id)
    const deltas = changes.map(([, delta]) => delta)
    const { rows } = await pool.query(
      `WITH pending_change AS (
         SELECT * FROM UNNEST($1::uuid[], $2::integer[]) AS item(id, delta)
       ), validation AS (
         SELECT COUNT(*)::integer AS found
         FROM products product
         INNER JOIN pending_change ON pending_change.id = product.id
       )
       UPDATE products AS product
       SET stock = product.stock + change.delta,
           stock_updated_at = NOW()
       FROM pending_change AS change, validation
       WHERE product.id = change.id
         AND validation.found = CARDINALITY($1::uuid[])
       RETURNING product.*`,
      [ids, deltas]
    )

    if (rows.length !== changes.length) {
      return res.status(404).json({ error: 'Uno o más productos ya no existen' })
    }
    res.json({ products: rows })
  } catch (err) {
    console.error('[POST /api/products/stock/batch]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

const uploadCleosImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)),
})

// POST /api/products/:id/adjust-stock — ajuste manual +/- individual
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/adjust-stock', async (req, res) => {
  try {
    const delta = Number(req.body.delta)
    if (!Number.isFinite(delta) || !Number.isInteger(delta)) {
      return res.status(400).json({ error: 'delta debe ser un número entero' })
    }

    const { rows } = await pool.query(
      `UPDATE products SET stock = stock + $1, stock_updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [delta, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' })
    res.json(rows[0])
  } catch (err) {
    console.error('[POST /api/products/:id/adjust-stock]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/products/:id/image — sube la foto de un producto ya guardado y
// devuelve la URL pública (servida en index.js vía /uploads). El producto
// tiene que existir de antes: para uno nuevo, primero se guarda con
// image_url = link pegado a mano (ej. foto de catálogo del proveedor), y
// recién en modo "editar" se puede reemplazar por un archivo subido acá.
// ─────────────────────────────────────────────────────────────────────────────
const uploadImage = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg'
      cb(null, `${req.params.id}-${Date.now()}${ext}`)
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)),
})

router.post('/:id/image', uploadImage.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo de imagen' })
    const { rows } = await pool.query('SELECT id FROM products WHERE id = $1', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' })
    res.json({ url: `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}` })
  } catch (err) {
    console.error('[POST /api/products/:id/image]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/products/:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' })
    res.status(204).end()
  } catch (err) {
    console.error('[DELETE /api/products/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Importaciones desde Excel — cada una parsea + upsertea dentro de una
// transacción y devuelve un resumen para mostrar en el panel.
// ─────────────────────────────────────────────────────────────────────────────
async function runImport(res, fileType, parseFn, applyFn, buildSummary) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const parsed = parseFn()
    const result = await applyFn(client, parsed)
    await client.query('COMMIT')
    res.json({ fileType, ...buildSummary(parsed, result) })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(`[POST /api/products/import/${fileType}]`, err)
    res.status(500).json({ error: 'Error al importar el archivo' })
  } finally {
    client.release()
  }
}

router.post('/import/catalog', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo' })
  await runImport(
    res, 'catalog',
    () => parseHuerguiCatalog(req.file.buffer),
    (client, parsed) => upsertCatalogRows(client, parsed.rows),
    (parsed, result) => ({ totalRows: parsed.totalRows, skipped: parsed.skipped, ...result })
  )
})

router.post('/import/prices', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo' })
  await runImport(
    res, 'prices',
    () => parseAlcidesPrices(req.file.buffer),
    (client, parsed) => upsertPriceRows(client, parsed.rows),
    (parsed, result) => ({ totalRows: parsed.totalRows, skipped: parsed.skipped, ...result })
  )
})

router.post('/import/sale', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo' })
  await runImport(
    res, 'sale',
    () => parseSaleVoucher(req.file.buffer),
    (client, parsed) => applySaleDecrement(client, parsed.lines),
    (parsed, result) => ({ totalRows: parsed.totalRows, updated: result.updated, unmatched: result.unmatched })
  )
})

router.post('/import/purchase', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo' })
  await runImport(
    res, 'purchase',
    () => parseKianPurchaseOrder(req.file.buffer),
    (client, parsed) => applyPurchaseIncrement(client, parsed.lines),
    (parsed, result) => ({
      totalRows: parsed.lines.length + parsed.skippedRows.length,
      skipped: parsed.skippedRows.length,
      header: parsed.header,
      ...result,
    })
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Importación desde factura/remito en PDF — se sube el PDF, se parsea y se
// intenta emparejar cada línea con un producto existente, pero no se escribe
// nada todavía: el admin revisa/corrige el emparejamiento en el frontend y
// recién ahí confirma con /import/invoice/apply.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/import/invoice/parse', uploadPdf.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo' })
  const client = await pool.connect()
  try {
    const { items, skippedLines } = await parseInvoicePdf(req.file.buffer)
    const matched = await matchInvoiceLines(client, items)
    res.json({
      lines: matched.map((m) => ({
        cantidad: m.cantidad,
        descripcion: m.descripcion,
        precioUsd: m.precioUsd,
        codigoCandidato: m.codigoCandidato,
        match: m.match
          ? { id: m.match.id, codigo: m.match.codigo, descripcion: m.match.descripcion, stock: m.match.stock }
          : null,
      })),
      skipped: skippedLines.length,
    })
  } catch (err) {
    console.error('[POST /api/products/import/invoice/parse]', err)
    res.status(500).json({ error: 'No se pudo leer el PDF' })
  } finally {
    client.release()
  }
})

router.post('/import/invoice/apply', async (req, res) => {
  const { actions } = req.body
  if (!Array.isArray(actions) || !actions.length) {
    return res.status(400).json({ error: 'No hay líneas para aplicar' })
  }

  const normalized = []
  for (const a of actions) {
    const cantidad = Number(a.cantidad)
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      return res.status(400).json({ error: 'Cada línea necesita una cantidad entera mayor a 0' })
    }
    if (a.type === 'update') {
      if (!a.productId) return res.status(400).json({ error: 'Falta el producto a actualizar' })
      normalized.push({ type: 'update', productId: a.productId, cantidad, precioUsd: toNumber(a.precioUsd) })
    } else if (a.type === 'create') {
      const codigo = normalizeCodigo(a.codigo)
      if (!codigo) return res.status(400).json({ error: 'Falta el código del producto nuevo' })
      normalized.push({
        type: 'create', codigo, cantidad,
        descripcion: a.descripcion ? String(a.descripcion).trim() : null,
        precioUsd: toNumber(a.precioUsd),
      })
    } else {
      return res.status(400).json({ error: 'Tipo de línea inválido' })
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await applyInvoiceLines(client, normalized)
    await client.query('COMMIT')
    res.json({ fileType: 'invoice', ...result })
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === '23505') return res.status(409).json({ error: 'Código de producto duplicado en la factura' })
    console.error('[POST /api/products/import/invoice/apply]', err)
    res.status(500).json({ error: 'No se pudo aplicar la factura' })
  } finally {
    client.release()
  }
})

// Importación del catálogo visual de CLEOS. El primer paso extrae texto e
// imágenes a una carpeta temporal y devuelve una vista previa; el segundo
// crea/actualiza únicamente los productos aceptados por el administrador.
router.post('/import/cleos/parse', uploadPdf.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el PDF de CLEOS' })
  try {
    const parsed = await parseCleosCatalogPdf(req.file.buffer)
    const codes = parsed.products.map((product) => product.code)
    const { rows } = await pool.query(
      `SELECT id, codigo, name, descripcion, image_url, published, category, subcategory
       FROM products
       WHERE codigo = ANY($1::varchar[])`,
      [codes]
    )
    const matches = new Map(rows.map((product) => [product.codigo, product]))
    res.json({
      ...parsed,
      products: parsed.products.map((product) => ({
        ...product,
        match: matches.get(product.code) || null,
      })),
    })
  } catch (err) {
    console.error('[POST /api/products/import/cleos/parse]', err)
    res.status(422).json({ error: err.message || 'No se pudo leer el catálogo CLEOS' })
  }
})

router.post('/import/cleos/image', uploadCleosImage.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta la imagen del producto' })
  try {
    const image = await saveCleosPreviewImage(req.body.importId, req.file)
    res.json(image)
  } catch (err) {
    console.error('[POST /api/products/import/cleos/image]', err)
    res.status(400).json({ error: err.message || 'No se pudo subir la imagen' })
  }
})

router.post('/import/cleos/apply', async (req, res) => {
  const { importId, actions } = req.body
  const client = await pool.connect()
  let applied = null
  try {
    await client.query('BEGIN')
    applied = await applyCleosCatalogProducts(client, importId, actions)
    await client.query('COMMIT')
    await discardCleosPreview(applied.previewDir).catch((cleanupError) => {
      console.warn('[CLEOS preview cleanup]', cleanupError.message)
    })
    res.json({
      fileType: 'cleos',
      created: applied.created,
      updated: applied.updated,
      imagesSaved: applied.imagesSaved,
      imagesRemoved: applied.imagesRemoved,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    if (applied?.writtenFiles?.length) {
      await Promise.all(applied.writtenFiles.map((file) => unlink(file).catch(() => {})))
    }
    console.error('[POST /api/products/import/cleos/apply]', err)
    const status = err.code === '23505' ? 409 : 400
    res.status(status).json({ error: err.message || 'No se pudo importar el catálogo CLEOS' })
  } finally {
    client.release()
  }
})

export default router
