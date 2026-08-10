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
  parseSupplierPrices,
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
  applyCatalogImages,
  parseCatalogImagesPdf,
} from '../services/catalogImageImport.js'
import {
  upsertCatalogRows,
  matchPriceRows,
  applyPriceUpdates,
  createSupplierPriceDrafts,
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
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /\.pdf$/i.test(file.originalname)),
})

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizePriceSupplier(value) {
  const supplier = String(value || '').trim().toUpperCase()
  return supplier && supplier.length <= 80 ? supplier : null
}

function supplierFromPriceFilename(filename) {
  const supplier = path.parse(path.basename(String(filename || ''))).name
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
  return supplier ? supplier.slice(0, 80) : null
}

function priceCurrencyFromFilename(filename) {
  const name = path.parse(path.basename(String(filename || ''))).name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
  return /(^|[^A-Z])(DOLAR|DOLARES|USD)([^A-Z]|$)/.test(name) || /U\$S/.test(name)
    ? 'USD'
    : 'ARS'
}

function convertedVariantOptions(products, currency, usdArsRate) {
  return products.map(product => {
    const wasUsd = product.price_currency === 'USD'
    const previousRate = Number(product.price_exchange_rate) || usdArsRate
    const convert = (color, arsKey, usdKey) => {
      const arsValue = color?.[arsKey] == null ? null : Number(color[arsKey])
      const usdValue = color?.[usdKey] == null ? null : Number(color[usdKey])
      if (currency === 'USD') {
        const sourceUsd = wasUsd ? (usdValue ?? (arsValue == null ? null : arsValue / previousRate)) : arsValue
        return { ars: sourceUsd == null ? null : Math.round(sourceUsd * usdArsRate * 100) / 100, usd: sourceUsd }
      }
      const sourceArs = wasUsd ? (usdValue ?? (arsValue == null ? null : arsValue / previousRate)) : arsValue
      return { ars: sourceArs, usd: sourceArs == null ? null : Math.round(sourceArs / usdArsRate * 100) / 100 }
    }
    return {
      id: product.id,
      colors: (product.color_options || []).map(color => {
        const sale = convert(color, 'price', 'priceUsd')
        const cost = convert(color, 'priceCost', 'priceCostUsd')
        const tax = convert(color, 'priceWithTax', 'priceWithTaxUsd')
        return {
          ...color,
          price: sale.ars,
          priceUsd: sale.usd,
          priceCost: cost.ars,
          priceCostUsd: cost.usd,
          priceWithTax: tax.ars,
          priceWithTaxUsd: tax.usd,
        }
      }),
      sizes: (product.size_options || []).map(size => {
        const sale = convert(size, 'price', 'priceUsd')
        const cost = convert(size, 'priceCost', 'priceCostUsd')
        const tax = convert(size, 'priceWithTax', 'priceWithTaxUsd')
        return {
          ...size,
          price: sale.ars,
          priceUsd: sale.usd,
          priceCost: cost.ars,
          priceCostUsd: cost.usd,
          priceWithTax: tax.ars,
          priceWithTaxUsd: tax.usd,
        }
      }),
    }
  })
}

function serializeNewProductCodeConflict(product) {
  return {
    productId: product.id,
    codigo: product.codigo,
    nombre: product.nombre || 'Sin nombre',
    supplier: product.supplier || null,
  }
}

function newProductCodeConflictMessage(conflicts) {
  const details = conflicts
    .slice(0, 5)
    .map(product => `${product.codigo} — ${product.nombre}`)
    .join('; ')
  const remaining = conflicts.length > 5 ? `; y ${conflicts.length - 5} más` : ''
  return `No se pueden crear productos porque estos códigos ya existen: ${details}${remaining}`
}

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
    conditions.push(`supplier ILIKE $${idx++}`)
    params.push(`%${supplier}%`)
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
  const costInArs = `COALESCE(precio_costo, precio_costo_usd * COALESCE((SELECT usd_ars_rate FROM store_settings WHERE id = 1), 1510))`
  addNumericFilter(costMin, costInArs, '>=')
  addNumericFilter(costMax, costInArs, '<=')
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
      cost: `COALESCE(precio_costo, precio_costo_usd * COALESCE((SELECT usd_ars_rate FROM store_settings WHERE id = 1), 1510))`,
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
// Cotizacion usada por el administrador para comparar e importar precios en
// ambas monedas. El catalogo y los cobros continuan expresados en ARS.
router.get('/currency-settings', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT usd_ars_rate, updated_at FROM store_settings WHERE id = 1')
    res.json({
      usdArsRate: Number(rows[0]?.usd_ars_rate || 1510),
      updatedAt: rows[0]?.updated_at || null,
    })
  } catch (err) {
    console.error('[GET /api/products/currency-settings]', err)
    res.status(500).json({ error: 'No se pudo cargar la cotizacion' })
  }
})

router.patch('/currency-settings', async (req, res) => {
  const usdArsRate = Number(req.body.usdArsRate)
  if (!Number.isFinite(usdArsRate) || usdArsRate <= 0) {
    return res.status(400).json({ error: 'La cotizacion debe ser mayor a cero' })
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const current = await client.query('SELECT usd_ars_rate FROM store_settings WHERE id = 1 FOR UPDATE')
    const previousRate = Number(current.rows[0]?.usd_ars_rate || 1510)
    const colorProducts = await client.query(
      `SELECT id, color_options, size_options, price_currency, price_exchange_rate
       FROM products
       WHERE price_currency = 'USD'
         AND (jsonb_array_length(color_options) > 0 OR jsonb_array_length(size_options) > 0)
       FOR UPDATE`
    )
    const convertedColors = convertedVariantOptions(colorProducts.rows, 'USD', usdArsRate)
    await client.query(
      `UPDATE products
       SET precio_costo_usd = COALESCE(precio_costo_usd, precio_costo / COALESCE(NULLIF(price_exchange_rate, 0), $2)),
           precio_venta_usd = COALESCE(precio_venta_usd, precio_venta / COALESCE(NULLIF(price_exchange_rate, 0), $2)),
           precio_iva_usd = COALESCE(precio_iva_usd, precio_iva / COALESCE(NULLIF(price_exchange_rate, 0), $2)),
           original_price_usd = COALESCE(original_price_usd, original_price / COALESCE(NULLIF(price_exchange_rate, 0), $2)),
           precio_costo = ROUND(COALESCE(precio_costo_usd, precio_costo / COALESCE(NULLIF(price_exchange_rate, 0), $2)) * $1, 2),
           precio_venta = ROUND(COALESCE(precio_venta_usd, precio_venta / COALESCE(NULLIF(price_exchange_rate, 0), $2)) * $1, 2),
           precio_iva = ROUND(COALESCE(precio_iva_usd, precio_iva / COALESCE(NULLIF(price_exchange_rate, 0), $2)) * $1, 2),
           original_price = ROUND(COALESCE(original_price_usd, original_price / COALESCE(NULLIF(price_exchange_rate, 0), $2)) * $1, 2),
           price_exchange_rate = $1,
           updated_at = NOW()
       WHERE price_currency = 'USD'`,
      [usdArsRate, previousRate]
    )
    for (const product of convertedColors) {
      await client.query(
        'UPDATE products SET color_options = $1::jsonb, size_options = $2::jsonb WHERE id = $3',
        [JSON.stringify(product.colors), JSON.stringify(product.sizes), product.id]
      )
    }
    const { rows } = await client.query(
      `INSERT INTO store_settings (id, usd_ars_rate, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET usd_ars_rate = EXCLUDED.usd_ars_rate, updated_at = NOW()
       RETURNING usd_ars_rate, updated_at`,
      [usdArsRate]
    )
    await client.query('COMMIT')
    res.json({ usdArsRate: Number(rows[0].usd_ars_rate), updatedAt: rows[0].updated_at })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[PATCH /api/products/currency-settings]', err)
    res.status(500).json({ error: 'No se pudo guardar la cotizacion' })
  } finally {
    client.release()
  }
})

router.get('/supplier-settings', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT product.supplier,
              COUNT(*)::integer AS product_count,
              COALESCE(setting.currency,
                CASE WHEN COUNT(*) FILTER (WHERE product.price_currency = 'USD') > COUNT(*) / 2.0
                     THEN 'USD' ELSE 'ARS' END
              ) AS currency,
              (setting.currency IS NOT NULL) AS configured,
              setting.updated_at
       FROM products product
       LEFT JOIN supplier_price_settings setting ON setting.supplier = product.supplier
       WHERE product.supplier IS NOT NULL AND BTRIM(product.supplier) <> ''
       GROUP BY product.supplier, setting.currency, setting.updated_at
       ORDER BY product.supplier`
    )
    res.json({ suppliers: rows.map(row => ({
      supplier: row.supplier,
      currency: row.currency,
      configured: row.configured,
      productCount: Number(row.product_count),
      updatedAt: row.updated_at || null,
    })) })
  } catch (err) {
    console.error('[GET /api/products/supplier-settings]', err)
    res.status(500).json({ error: 'No se pudo cargar la moneda de los proveedores' })
  }
})

router.patch('/supplier-settings/:supplier', async (req, res) => {
  const supplier = normalizePriceSupplier(req.params.supplier)
  const currency = req.body.currency === 'USD' ? 'USD' : req.body.currency === 'ARS' ? 'ARS' : null
  if (!supplier || !currency) return res.status(400).json({ error: 'Proveedor o moneda inválidos' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const settings = await client.query('SELECT usd_ars_rate FROM store_settings WHERE id = 1')
    const usdArsRate = Number(settings.rows[0]?.usd_ars_rate || 1510)
    const colorProducts = await client.query(
      `SELECT id, color_options, size_options, price_currency, price_exchange_rate
       FROM products
       WHERE supplier = $1
         AND (jsonb_array_length(color_options) > 0 OR jsonb_array_length(size_options) > 0)
       FOR UPDATE`,
      [supplier]
    )

    const convertedColors = convertedVariantOptions(colorProducts.rows, currency, usdArsRate)
    const update = currency === 'USD'
      ? await client.query(
        `UPDATE products
         SET precio_costo_usd = CASE WHEN price_currency = 'USD' THEN COALESCE(precio_costo_usd, precio_costo / COALESCE(NULLIF(price_exchange_rate, 0), $2)) ELSE precio_costo END,
             precio_venta_usd = CASE WHEN price_currency = 'USD' THEN COALESCE(precio_venta_usd, precio_venta / COALESCE(NULLIF(price_exchange_rate, 0), $2)) ELSE precio_venta END,
             precio_iva_usd = CASE WHEN price_currency = 'USD' THEN COALESCE(precio_iva_usd, precio_iva / COALESCE(NULLIF(price_exchange_rate, 0), $2)) ELSE precio_iva END,
             original_price_usd = CASE WHEN price_currency = 'USD' THEN COALESCE(original_price_usd, original_price / COALESCE(NULLIF(price_exchange_rate, 0), $2)) ELSE original_price END,
             precio_costo = ROUND((CASE WHEN price_currency = 'USD' THEN COALESCE(precio_costo_usd, precio_costo / COALESCE(NULLIF(price_exchange_rate, 0), $2)) ELSE precio_costo END) * $2, 2),
             precio_venta = ROUND((CASE WHEN price_currency = 'USD' THEN COALESCE(precio_venta_usd, precio_venta / COALESCE(NULLIF(price_exchange_rate, 0), $2)) ELSE precio_venta END) * $2, 2),
             precio_iva = ROUND((CASE WHEN price_currency = 'USD' THEN COALESCE(precio_iva_usd, precio_iva / COALESCE(NULLIF(price_exchange_rate, 0), $2)) ELSE precio_iva END) * $2, 2),
             original_price = ROUND((CASE WHEN price_currency = 'USD' THEN COALESCE(original_price_usd, original_price / COALESCE(NULLIF(price_exchange_rate, 0), $2)) ELSE original_price END) * $2, 2),
             price_currency = 'USD', price_exchange_rate = $2, updated_at = NOW()
         WHERE supplier = $1`,
        [supplier, usdArsRate]
      )
      : await client.query(
        `UPDATE products
         SET precio_costo = CASE WHEN price_currency = 'USD' THEN COALESCE(precio_costo_usd, precio_costo / COALESCE(NULLIF(price_exchange_rate, 0), $2)) ELSE precio_costo END,
             precio_venta = CASE WHEN price_currency = 'USD' THEN COALESCE(precio_venta_usd, precio_venta / COALESCE(NULLIF(price_exchange_rate, 0), $2)) ELSE precio_venta END,
             precio_iva = CASE WHEN price_currency = 'USD' THEN COALESCE(precio_iva_usd, precio_iva / COALESCE(NULLIF(price_exchange_rate, 0), $2)) ELSE precio_iva END,
             original_price = CASE WHEN price_currency = 'USD' THEN COALESCE(original_price_usd, original_price / COALESCE(NULLIF(price_exchange_rate, 0), $2)) ELSE original_price END,
             price_currency = 'ARS', price_exchange_rate = $2, updated_at = NOW()
         WHERE supplier = $1`,
        [supplier, usdArsRate]
      )

    for (const product of convertedColors) {
      await client.query(
        'UPDATE products SET color_options = $1::jsonb, size_options = $2::jsonb WHERE id = $3',
        [JSON.stringify(product.colors), JSON.stringify(product.sizes), product.id]
      )
    }
    await client.query(
      `INSERT INTO supplier_price_settings (supplier, currency, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (supplier) DO UPDATE SET currency = EXCLUDED.currency, updated_at = NOW()`,
      [supplier, currency]
    )
    await client.query('COMMIT')
    res.json({ supplier, currency, productCount: update.rowCount, usdArsRate })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[PATCH /api/products/supplier-settings/:supplier]', err)
    res.status(500).json({ error: 'No se pudo actualizar la moneda del proveedor' })
  } finally {
    client.release()
  }
})

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
  variant_stock:     (v) => JSON.stringify(v ?? {}),
  color_temp:        (v) => toNumber(v),
  ip_rating:         (v) => v,
  material:          (v) => v,
  cable_type:        (v) => v,
  product_type:      (v) => v,
  length_cm:         (v) => toNumber(v),
  width_cm:          (v) => toNumber(v),
  height_cm:         (v) => toNumber(v),
  weight_kg:         (v) => toNumber(v),
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

    const usdField = field === 'precio_venta' ? 'precio_venta_usd' : field === 'precio_costo' ? 'precio_costo_usd' : null
    const usdSync = usdField
      ? `, ${usdField} = CASE WHEN price_currency = 'USD'
                              THEN $1 / COALESCE((SELECT usd_ars_rate FROM store_settings WHERE id = 1), 1510)
                              ELSE ${usdField} END`
      : ''
    const { rows } = await client.query(
      `UPDATE products SET ${field} = $1${usdSync} WHERE id = ANY($2::uuid[]) RETURNING *`,
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
    let { rows } = await pool.query(
      `UPDATE products SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    )
    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' })
    const usdSyncFields = [
      ['precio_costo', 'precio_costo_usd'],
      ['precio_venta', 'precio_venta_usd'],
      ['precio_iva', 'precio_iva_usd'],
      ['original_price', 'original_price_usd'],
    ].filter(([arsField]) => arsField in req.body)
    if (rows[0].price_currency === 'USD' && usdSyncFields.length) {
      const syncSets = usdSyncFields.map(([arsField, usdField]) => (
        `${usdField} = ${arsField} / COALESCE((SELECT usd_ars_rate FROM store_settings WHERE id = 1), 1510)`
      ))
      const synced = await pool.query(
        `UPDATE products SET ${syncSets.join(', ')} WHERE id = $1 RETURNING *`,
        [req.params.id]
      )
      rows = synced.rows
    }
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
// POST /api/products/image o /:id/image — permite subir una foto tanto durante
// el alta como al editar. La URL devuelta se guarda junto con el formulario.
// ─────────────────────────────────────────────────────────────────────────────
const uploadImage = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg'
      const owner = req.params.id || 'draft'
      cb(null, `${owner}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`)
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)),
})

router.post('/image', uploadImage.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo de imagen' })
  res.json({ url: `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}` })
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

function serializePriceProduct(product) {
  if (!product) return null
  return {
    id: product.id,
    codigo: product.codigo,
    nombre: product.nombre,
    descripcion: product.descripcion,
    imageUrl: product.image_url,
    precioCosto: product.precio_costo == null ? null : Number(product.precio_costo),
    precioVenta: product.precio_venta == null ? null : Number(product.precio_venta),
    precioIva: product.precio_iva == null ? null : Number(product.precio_iva),
    precioCostoUsd: product.precio_costo_usd == null ? null : Number(product.precio_costo_usd),
    similarity: product.similarity,
  }
}

function serializePriceMatchLine(line) {
  return {
    codigo: line.codigo,
    descripcion: line.descripcion,
    precioCosto: line.precio_costo,
    precioVenta: line.precio_venta,
    precioIva: line.precio_iva,
    match: serializePriceProduct(line.match),
    matchType: line.matchType,
    suggestions: (line.suggestions || []).map(serializePriceProduct),
    colorRecommendation: line.colorRecommendation ? {
      familyCode: line.colorRecommendation.familyCode,
      suffix: line.colorRecommendation.suffix,
      name: line.colorRecommendation.name,
      hex: line.colorRecommendation.hex,
      product: serializePriceProduct(line.colorRecommendation.product),
    } : null,
  }
}

router.post('/import/prices/parse', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo' })
  const supplier = normalizePriceSupplier(req.body.supplier)
  if (!supplier) return res.status(400).json({ error: 'Indicá el proveedor de la lista de precios' })
  const client = await pool.connect()
  try {
    const parsed = parseAlcidesPrices(req.file.buffer)
    const [lines, settings] = await Promise.all([
      matchPriceRows(client, parsed.rows, supplier),
      client.query('SELECT usd_ars_rate FROM store_settings WHERE id = 1'),
    ])
    res.json({
      lines: lines.map(serializePriceMatchLine),
      totalRows: parsed.totalRows,
      skipped: parsed.skipped,
      supplier,
      usdArsRate: Number(settings.rows[0]?.usd_ars_rate || 1510),
    })
  } catch (err) {
    console.error('[POST /api/products/import/prices/parse]', err)
    res.status(500).json({ error: 'No se pudo leer la lista de precios' })
  } finally {
    client.release()
  }
})

router.post('/import/prices/bulk', upload.array('files', 100), async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : []
  if (!files.length) return res.status(400).json({ error: 'Elegí al menos un archivo XLS o XLSX' })

  const parsedFiles = []
  const failedFiles = []
  for (const file of files) {
    try {
      const supplier = supplierFromPriceFilename(file.originalname)
      if (!supplier) throw new Error('El nombre del archivo no permite identificar al proveedor')
      const parsed = parseSupplierPrices(file.buffer)
      if (!parsed.rows.length) throw new Error('No contiene filas de productos reconocibles')
      parsedFiles.push({
        fileName: path.basename(file.originalname),
        supplier,
        currency: priceCurrencyFromFilename(file.originalname),
        ...parsed,
      })
    } catch (err) {
      failedFiles.push({
        fileName: path.basename(file.originalname),
        error: err.message || 'No se pudo leer el archivo',
      })
    }
  }

  if (!parsedFiles.length) {
    return res.status(400).json({
      error: 'Ninguno de los archivos contiene una lista de precios válida',
      failedFiles,
    })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const settings = await client.query('SELECT usd_ars_rate FROM store_settings WHERE id = 1')
    const usdArsRate = Number(settings.rows[0]?.usd_ars_rate || 1510)
    const savedCurrencies = await client.query(
      'SELECT supplier, currency FROM supplier_price_settings WHERE supplier = ANY($1::text[])',
      [[...new Set(parsedFiles.map(file => file.supplier))]]
    )
    const currencyBySupplier = new Map(savedCurrencies.rows.map(row => [row.supplier, row.currency]))
    for (const file of parsedFiles) file.currency = currencyBySupplier.get(file.supplier) || file.currency
    await client.query(
      `INSERT INTO supplier_price_settings (supplier, currency)
       SELECT entry.supplier, entry.currency
       FROM jsonb_to_recordset($1::jsonb) AS entry(supplier text, currency text)
       ON CONFLICT (supplier) DO NOTHING`,
      [JSON.stringify([...new Map(parsedFiles.map(file => [file.supplier, {
        supplier: file.supplier,
        currency: file.currency,
      }])).values()])]
    )
    const result = await createSupplierPriceDrafts(client, parsedFiles, usdArsRate)
    await client.query('COMMIT')
    res.json({
      fileType: 'bulk-prices',
      totalFiles: files.length,
      processedFiles: parsedFiles.length,
      totalRows: parsedFiles.reduce((sum, file) => sum + file.totalRows, 0),
      exchangeRate: usdArsRate,
      failedFiles,
      ...result,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[POST /api/products/import/prices/bulk]', err)
    res.status(500).json({ error: 'No se pudieron crear los productos de las listas' })
  } finally {
    client.release()
  }
})

router.post('/import/prices/rematch', async (req, res) => {
  const input = Array.isArray(req.body.lines) ? req.body.lines : []
  const supplier = normalizePriceSupplier(req.body.supplier)
  if (!supplier) return res.status(400).json({ error: 'Indicá el proveedor de la lista de precios' })
  if (!input.length) return res.status(400).json({ error: 'No hay códigos para volver a asociar' })
  if (input.length > 5000) return res.status(400).json({ error: 'La lista de precios es demasiado grande' })

  const rows = []
  for (const line of input) {
    const codigo = normalizeCodigo(line.codigo)
    if (!codigo || codigo.length > 200) return res.status(400).json({ error: 'Hay un código de producto inválido' })
    rows.push({
      codigo,
      descripcion: line.descripcion ? String(line.descripcion).trim().slice(0, 5000) : null,
      precio_costo: toNumber(line.precioCosto),
      precio_venta: toNumber(line.precioVenta),
      precio_iva: toNumber(line.precioIva),
    })
  }

  const client = await pool.connect()
  try {
    const lines = await matchPriceRows(client, rows, supplier)
    res.json({ supplier, lines: lines.map(serializePriceMatchLine) })
  } catch (err) {
    console.error('[POST /api/products/import/prices/rematch]', err)
    res.status(500).json({ error: 'No se pudieron volver a asociar los códigos' })
  } finally {
    client.release()
  }
})

router.post('/import/prices/apply', async (req, res) => {
  const actions = Array.isArray(req.body.actions) ? req.body.actions : []
  const supplier = normalizePriceSupplier(req.body.supplier)
  if (!supplier) return res.status(400).json({ error: 'Indicá el proveedor de la lista de precios' })
  if (!actions.length) return res.status(400).json({ error: 'No hay precios para actualizar' })
  if (actions.length > 5000) return res.status(400).json({ error: 'La lista de precios es demasiado grande' })

  const normalized = []
  const productIds = new Set()
  const newCodes = new Set()
  for (const action of actions) {
    const values = [action.precioCosto, action.precioVenta, action.precioIva].map(toNumber)
    if (values.some((value) => value != null && value < 0) || values.every((value) => value == null)) {
      return res.status(400).json({ error: 'Cada linea necesita al menos un precio valido' })
    }
    const common = {
      currency: action.currency === 'USD' ? 'USD' : 'ARS',
      precioCosto: values[0],
      precioVenta: values[1],
      precioIva: values[2],
    }
    if (action.type === 'create') {
      const codigo = normalizeCodigo(action.codigo)
      if (!codigo) return res.status(400).json({ error: 'Falta el codigo del producto nuevo' })
      if (newCodes.has(codigo)) return res.status(400).json({ error: 'Hay dos productos nuevos con el mismo codigo' })
      newCodes.add(codigo)
      normalized.push({
        ...common,
        type: 'create',
        codigo,
        sourceCode: normalizeCodigo(action.sourceCode) || codigo,
        descripcion: action.descripcion ? String(action.descripcion).trim() : null,
        supplier,
      })
    } else {
      if (!UUID_PATTERN.test(String(action.productId || ''))) {
        return res.status(400).json({ error: 'Hay una linea sin producto asociado' })
      }
      productIds.add(action.productId)
      let colorVariant = null
      if (action.colorVariant) {
        const name = String(action.colorVariant.name || '').trim()
        if (!name) return res.status(400).json({ error: 'Cada variante necesita un nombre de color' })
        const rawHex = String(action.colorVariant.hex || '').trim()
        colorVariant = {
          name,
          hex: /^#[0-9a-f]{6}$/i.test(rawHex) ? rawHex.toUpperCase() : '#CCCCCC',
        }
      }
      normalized.push({
        ...common,
        type: 'update',
        productId: action.productId,
        sourceCode: normalizeCodigo(action.sourceCode),
        colorVariant,
      })
    }
  }

  const mappedSourceCodes = normalized
    .filter(action => action.type === 'update' && action.sourceCode)
    .map(action => String(action.sourceCode).trim().toUpperCase().replace(/\s+/g, ''))
  if (mappedSourceCodes.length) {
    const { rows: savedVariants } = await pool.query(
      `SELECT source_code_key, color_name, color_hex, size_label
       FROM supplier_product_mappings
       WHERE supplier = $1 AND source_code_key = ANY($2::text[])`,
      [supplier, mappedSourceCodes]
    )
    const bySourceCode = new Map(savedVariants.map(mapping => [mapping.source_code_key, mapping]))
    normalized.forEach(action => {
      if (action.type !== 'update' || action.colorVariant) return
      const key = String(action.sourceCode || '').trim().toUpperCase().replace(/\s+/g, '')
      const saved = bySourceCode.get(key)
      if (saved?.color_name) action.colorVariant = { name: saved.color_name, hex: saved.color_hex || '#CCCCCC' }
      if (saved?.size_label) action.sizeVariant = { label: saved.size_label }
    })
  }

  const assignmentsByProduct = new Map()
  for (const action of normalized.filter(item => item.type === 'update')) {
    if (!assignmentsByProduct.has(action.productId)) assignmentsByProduct.set(action.productId, [])
    assignmentsByProduct.get(action.productId).push(action)
  }
  for (const group of assignmentsByProduct.values()) {
    if (group.length <= 1) continue
    const variants = group.map(action => action.colorVariant
      ? `color:${action.colorVariant.name.toLocaleLowerCase('es-AR')}`
      : action.sizeVariant
        ? `size:${action.sizeVariant.label.toLocaleLowerCase('es-AR')}`
        : null)
    if (variants.some(value => !value) || new Set(variants).size !== group.length) {
      return res.status(400).json({ error: 'Las filas asignadas al mismo producto deben tener variantes diferentes' })
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (productIds.size) {
      const existing = await client.query(
        'SELECT id FROM products WHERE id = ANY($1::uuid[]) FOR UPDATE',
        [[...productIds]]
      )
      if (existing.rows.length !== productIds.size) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Uno o mas productos asociados ya no existen' })
      }
    }
    if (newCodes.size) {
      const existingCodes = await client.query(
        `SELECT id, codigo,
                COALESCE(NULLIF(name, ''), NULLIF(descripcion, ''), 'Sin nombre') AS nombre,
                supplier
         FROM products
         WHERE codigo = ANY($1::text[])
         ORDER BY codigo`,
        [[...newCodes]]
      )
      if (existingCodes.rows.length) {
        await client.query('ROLLBACK')
        const conflicts = existingCodes.rows.map(serializeNewProductCodeConflict)
        return res.status(409).json({
          error: newProductCodeConflictMessage(conflicts),
          code: 'PRODUCT_CODES_ALREADY_EXIST',
          conflicts,
        })
      }
    }
    const settings = await client.query('SELECT usd_ars_rate FROM store_settings WHERE id = 1')
    const usdArsRate = Number(settings.rows[0]?.usd_ars_rate || 1510)
    const result = await applyPriceUpdates(client, normalized, usdArsRate, supplier)
    await client.query('COMMIT')
    res.json({ fileType: 'prices', supplier, totalRows: normalized.length, exchangeRate: usdArsRate, ...result })
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === '23505') {
      const duplicatedCode = err.detail?.match(/\(codigo\)=\((.+)\)/)?.[1] || null
      let conflicts = []
      if (duplicatedCode) {
        const existingCode = await client.query(
          `SELECT id, codigo,
                  COALESCE(NULLIF(name, ''), NULLIF(descripcion, ''), 'Sin nombre') AS nombre,
                  supplier
           FROM products
           WHERE codigo = $1`,
          [duplicatedCode]
        )
        conflicts = existingCode.rows.map(serializeNewProductCodeConflict)
      }
      return res.status(409).json({
        error: conflicts.length
          ? newProductCodeConflictMessage(conflicts)
          : 'Ya existe un producto con uno de los códigos nuevos',
        code: 'PRODUCT_CODES_ALREADY_EXIST',
        conflicts,
      })
    }
    console.error('[POST /api/products/import/prices/apply]', err)
    res.status(500).json({ error: 'No se pudieron actualizar los precios' })
  } finally {
    client.release()
  }
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

// Catálogos visuales de proveedores. La lectura se limita a productos ya
// existentes del proveedor elegido y sólo propone asociaciones para revisar.
router.post('/import/catalog-images/parse', uploadPdf.single('file'), async (req, res) => {
  const supplier = normalizePriceSupplier(req.body.supplier)
  if (!req.file) return res.status(400).json({ error: 'Falta el PDF del catálogo' })
  if (!supplier) return res.status(400).json({ error: 'Elegí el proveedor del catálogo' })

  try {
    const { rows: products } = await pool.query(
      `SELECT id, codigo, name, descripcion, image_url, medida
       FROM products
       WHERE supplier = $1
       ORDER BY codigo`,
      [supplier]
    )
    if (!products.length) {
      return res.status(404).json({ error: `No hay productos cargados para el proveedor ${supplier}` })
    }
    const parsed = await parseCatalogImagesPdf(req.file.buffer, supplier, products)
    res.json({ ...parsed, supplierProductCount: products.length })
  } catch (err) {
    console.error('[POST /api/products/import/catalog-images/parse]', err)
    res.status(422).json({ error: err.message || 'No se pudo leer el catálogo con imágenes' })
  }
})

router.post('/import/catalog-images/image', uploadCleosImage.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta la imagen del producto' })
  try {
    res.json(await saveCleosPreviewImage(req.body.importId, req.file))
  } catch (err) {
    console.error('[POST /api/products/import/catalog-images/image]', err)
    res.status(400).json({ error: err.message || 'No se pudo subir la imagen' })
  }
})

router.post('/import/catalog-images/apply', async (req, res) => {
  const supplier = normalizePriceSupplier(req.body.supplier)
  const { importId, actions, merges, deletes } = req.body
  if (!supplier) return res.status(400).json({ error: 'El proveedor de la revisión no es válido' })

  const client = await pool.connect()
  let applied = null
  try {
    await client.query('BEGIN')
    applied = await applyCatalogImages(client, importId, supplier, actions, merges, deletes)
    await client.query('COMMIT')
    await discardCleosPreview(applied.previewDir).catch(cleanupError => {
      console.warn('[Catalog images preview cleanup]', cleanupError.message)
    })
    res.json({
      fileType: 'catalog-images',
      supplier,
      updated: applied.updated,
      imagesSaved: applied.imagesSaved,
      merged: applied.merged,
      deleted: applied.deleted,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    if (applied?.writtenFiles?.length) {
      await Promise.all(applied.writtenFiles.map(file => unlink(file).catch(() => {})))
    }
    console.error('[POST /api/products/import/catalog-images/apply]', err)
    res.status(400).json({ error: err.message || 'No se pudieron aplicar las imágenes del catálogo' })
  } finally {
    client.release()
  }
})

// Importación histórica del catálogo visual de CLEOS. Se conserva para
// compatibilidad; el panel nuevo usa el flujo genérico de imágenes de arriba.
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
