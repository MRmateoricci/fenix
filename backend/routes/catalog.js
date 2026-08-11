import { Router } from 'express'
import { pool } from '../db/pool.js'

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo público — sin auth, solo lectura. Expone los productos de la tabla
// `products` (Inventario) que están marcados published = true, con la misma
// forma que usaba el catálogo estático del frontend (src/data/products.js)
// para no tener que tocar los componentes que ya consumen `product.name`,
// `product.image`, etc.
// ─────────────────────────────────────────────────────────────────────────────
const router = Router()

const SELECT_FIELDS = `
  id, name, category, subcategory, precio_venta, precio_venta_usd,
  original_price, original_price_usd, price_currency,
  COALESCE((SELECT usd_ars_rate FROM store_settings WHERE id = 1), 1510) AS usd_ars_rate,
  description_larga,
  image_url, hover_image_url, stock, watts, ip_rating, color_temp, material, cable_type, product_type,
  color_options, size_options, tone_options, variant_stock, length_cm, width_cm, height_cm, weight_kg,
  is_new, best_seller
`

export function mapRow(r) {
  const usdArsRate = Number(r.usd_ars_rate) || 1510
  const sourceIsUsd = r.price_currency === 'USD'
  const salePrice = sourceIsUsd && r.precio_venta_usd != null
    ? Number(r.precio_venta_usd) * usdArsRate
    : r.precio_venta
  const originalPrice = sourceIsUsd && r.original_price_usd != null
    ? Number(r.original_price_usd) * usdArsRate
    : r.original_price
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    subcategory: r.subcategory,
    price: salePrice != null ? Math.round(Number(salePrice) * 100) / 100 : null,
    originalPrice: originalPrice != null ? Math.round(Number(originalPrice) * 100) / 100 : null,
    description: r.description_larga,
    image: r.image_url,
    hoverImage: r.hover_image_url,
    inStock: r.stock > 0,
    stock: r.stock,
    colorTemp: r.color_temp != null ? Number(r.color_temp) : null,
    ipRating: r.ip_rating,
    watts: r.watts != null ? Number(r.watts) : null,
    material: r.material,
    cableType: r.cable_type,
    productType: r.product_type || r.cable_type,
    lengthCm: r.length_cm != null ? Number(r.length_cm) : null,
    widthCm: r.width_cm != null ? Number(r.width_cm) : null,
    heightCm: r.height_cm != null ? Number(r.height_cm) : null,
    weightKg: r.weight_kg != null ? Number(r.weight_kg) : null,
    colors: (r.color_options || []).map(color => ({
      ...color,
      price: sourceIsUsd && color.priceUsd != null
        ? Math.round(Number(color.priceUsd) * usdArsRate * 100) / 100
        : color.price == null ? null : Number(color.price),
      priceCost: sourceIsUsd && color.priceCostUsd != null
        ? Math.round(Number(color.priceCostUsd) * usdArsRate * 100) / 100
        : color.priceCost == null ? null : Number(color.priceCost),
      priceWithTax: sourceIsUsd && color.priceWithTaxUsd != null
        ? Math.round(Number(color.priceWithTaxUsd) * usdArsRate * 100) / 100
        : color.priceWithTax == null ? null : Number(color.priceWithTax),
      priceUsd: color.priceUsd == null ? null : Number(color.priceUsd),
      priceCostUsd: color.priceCostUsd == null ? null : Number(color.priceCostUsd),
      priceWithTaxUsd: color.priceWithTaxUsd == null ? null : Number(color.priceWithTaxUsd),
    })),
    sizes: (r.size_options || []).map(size => ({
      ...size,
      price: sourceIsUsd && size.priceUsd != null
        ? Math.round(Number(size.priceUsd) * usdArsRate * 100) / 100
        : size.price == null || size.price === '' ? null : Number(size.price),
      priceCost: sourceIsUsd && size.priceCostUsd != null
        ? Math.round(Number(size.priceCostUsd) * usdArsRate * 100) / 100
        : size.priceCost == null ? null : Number(size.priceCost),
      priceWithTax: sourceIsUsd && size.priceWithTaxUsd != null
        ? Math.round(Number(size.priceWithTaxUsd) * usdArsRate * 100) / 100
        : size.priceWithTax == null ? null : Number(size.priceWithTax),
      priceUsd: size.priceUsd == null ? null : Number(size.priceUsd),
      priceCostUsd: size.priceCostUsd == null ? null : Number(size.priceCostUsd),
      priceWithTaxUsd: size.priceWithTaxUsd == null ? null : Number(size.priceWithTaxUsd),
    })),
    tones: (r.tone_options || []).map(tone => ({
      ...tone,
      price: sourceIsUsd && tone.priceUsd != null
        ? Math.round(Number(tone.priceUsd) * usdArsRate * 100) / 100
        : tone.price == null ? null : Number(tone.price),
      priceCost: sourceIsUsd && tone.priceCostUsd != null
        ? Math.round(Number(tone.priceCostUsd) * usdArsRate * 100) / 100
        : tone.priceCost == null ? null : Number(tone.priceCost),
      priceWithTax: sourceIsUsd && tone.priceWithTaxUsd != null
        ? Math.round(Number(tone.priceWithTaxUsd) * usdArsRate * 100) / 100
        : tone.priceWithTax == null ? null : Number(tone.priceWithTax),
      priceUsd: tone.priceUsd == null ? null : Number(tone.priceUsd),
      priceCostUsd: tone.priceCostUsd == null ? null : Number(tone.priceCostUsd),
      priceWithTaxUsd: tone.priceWithTaxUsd == null ? null : Number(tone.priceWithTaxUsd),
    })),
    variantStock: r.variant_stock || {},
    isNew: Boolean(r.is_new),
    bestSeller: Boolean(r.best_seller),
    published: true,
  }
}

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${SELECT_FIELDS} FROM products WHERE published = TRUE ORDER BY updated_at DESC`
    )
    res.json(rows.map(mapRow))
  } catch (err) {
    console.error('[GET /api/catalog]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// Productos más vendidos en una ventana reciente. Sólo expone el identificador
// y la cantidad agregada; no devuelve ningún dato de los pedidos o clientes.
router.get('/best-sellers', async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30))
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 15))
    const { rows } = await pool.query(
      `SELECT item->>'id' AS product_id,
              SUM(COALESCE((item->>'quantity')::integer, 0))::integer AS units_sold
       FROM orders o
       CROSS JOIN LATERAL jsonb_array_elements(o.items) AS item
       INNER JOIN products p ON p.id::text = item->>'id' AND p.published = TRUE
       WHERE o.paid_at >= NOW() - ($1 * INTERVAL '1 day')
       GROUP BY item->>'id'
       ORDER BY units_sold DESC, product_id
       LIMIT $2`,
      [days, limit]
    )

    res.json({
      periodDays: days,
      products: rows.map((row) => ({
        productId: row.product_id,
        unitsSold: Number(row.units_sold),
      })),
    })
  } catch (err) {
    console.error('[GET /api/catalog/best-sellers]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${SELECT_FIELDS} FROM products WHERE id = $1 AND published = TRUE`,
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' })
    res.json(mapRow(rows[0]))
  } catch (err) {
    console.error('[GET /api/catalog/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
