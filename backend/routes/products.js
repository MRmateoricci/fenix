import { Router } from 'express'
import multer from 'multer'
import path from 'path'
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/products
// Query params: ?search=&supplier=ALCIDES&lowStock=true&published=true&page=1&limit=50
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search, supplier, lowStock, published, page = 1, limit = 50 } = req.query
    const cappedLimit = Math.min(Number(limit) || 50, 200)
    const offset = (Number(page) - 1) * cappedLimit

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
    if (lowStock === 'true') {
      conditions.push(`stock <= 5`)
    }
    if (published != null) {
      conditions.push(`published = $${idx++}`)
      params.push(published === 'true')
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const [data, countResult] = await Promise.all([
      pool.query(
        `SELECT * FROM products ${where}
         ORDER BY updated_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, cappedLimit, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM products ${where}`, params),
    ])

    res.json({
      products: data.rows,
      total: Number(countResult.rows[0].count),
      page: Number(page),
      limit: cappedLimit,
    })
  } catch (err) {
    console.error('[GET /api/products]', err)
    res.status(500).json({ error: 'Error interno' })
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
  published:         (v) => Boolean(v),
}
const EDITABLE_FIELDS = Object.keys(FIELD_TRANSFORMS)

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
// POST /api/products/:id/adjust-stock — ajuste manual +/- (no clampea a 0)
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

export default router
