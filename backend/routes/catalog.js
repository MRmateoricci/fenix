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
  id, name, category, subcategory, precio_venta, original_price, description_larga,
  image_url, hover_image_url, stock, watts, ip_rating, color_temp, material, cable_type, product_type,
  color_options, size_options
`

function mapRow(r) {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    subcategory: r.subcategory,
    price: r.precio_venta != null ? Number(r.precio_venta) : null,
    originalPrice: r.original_price != null ? Number(r.original_price) : null,
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
    colors: (r.color_options || []).map(color => ({
      ...color,
      price: color.price == null ? null : Number(color.price),
      priceCost: color.priceCost == null ? null : Number(color.priceCost),
      priceWithTax: color.priceWithTax == null ? null : Number(color.priceWithTax),
      priceUsd: color.priceUsd == null ? null : Number(color.priceUsd),
      priceCostUsd: color.priceCostUsd == null ? null : Number(color.priceCostUsd),
    })),
    sizes: r.size_options || [],
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
