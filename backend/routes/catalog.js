import { Router } from 'express'
import { pool } from '../db/pool.js'
import { resolvePublicOptionPrice, resolvePublicPrice } from '../services/publicPricing.js'

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo público — sin auth, solo lectura. Expone los productos de la tabla
// `products` (Inventario) que están marcados published = true, con la misma
// forma que usaba el catálogo estático del frontend (src/data/products.js)
// para no tener que tocar los componentes que ya consumen `product.name`,
// `product.image`, etc.
// ─────────────────────────────────────────────────────────────────────────────
const router = Router()

const SELECT_FIELDS = `
  id, name, codigo, descripcion, category, subcategory, precio_venta, precio_venta_usd, precio_iva, precio_iva_usd,
  original_price, original_price_usd, price_currency,
  COALESCE((SELECT usd_ars_rate FROM store_settings WHERE id = 1), 1510) AS usd_ars_rate,
  description_larga,
  image_url, hover_image_url, gallery_images, watts, amperes, ip_rating, color_temp, material, cable_type, product_type,
  color_options, size_options, tone_options, length_cm, width_cm, height_cm, weight_kg,
  is_new, best_seller, stock_inmediato,
  -- Plazo de preparación ya resuelto acá para que ningún componente tenga que
  -- combinar bandera + settings + override por su cuenta (y se desincronice).
  CASE WHEN stock_inmediato
    THEN COALESCE((SELECT dias_despacho_inmediato FROM store_settings WHERE id = 1), 1)
    ELSE COALESCE(dias_entrega_pedido, (SELECT dias_entrega_pedido_default FROM store_settings WHERE id = 1), 3)
  END AS dias_entrega_efectivo,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', vr.id, 'color', vr.color_name, 'colorHex', vr.color_hex, 'size', vr.size_label, 'tone', vr.tone_name, 'toneHex', vr.tone_hex,
      'image', vr.image_url, 'productData', vr.product_data,
      'price', vr.precio_venta, 'priceUsd', vr.precio_venta_usd,
      'priceWithTax', vr.precio_iva, 'priceWithTaxUsd', vr.precio_iva_usd,
      'currency', vr.price_currency
    ) ORDER BY vr.created_at)
    FROM product_variant_rules vr WHERE vr.product_id=products.id
  ), '[]'::jsonb) AS variant_rules
`

export function mapRow(r) {
  const usdArsRate = Number(r.usd_ars_rate) || 1510
  const sourceIsUsd = r.price_currency === 'USD'
  const publicPrice = resolvePublicPrice({
    priceWithTax: r.precio_iva,
    priceWithTaxUsd: r.precio_iva_usd,
    price: r.precio_venta,
    priceUsd: r.precio_venta_usd,
    currency: r.price_currency,
    usdArsRate,
  })
  const originalPrice = sourceIsUsd && r.original_price_usd != null
    ? Number(r.original_price_usd) * usdArsRate
    : r.original_price
  const variantRules = (r.variant_rules || []).map(rule => ({
    id: rule.id,
    color: rule.color || null,
    colorHex: rule.colorHex || null,
    size: rule.size || null,
    tone: rule.tone || null,
    toneHex: rule.toneHex || null,
    image: rule.image || null,
    productData: rule.productData && typeof rule.productData === 'object' ? rule.productData : {},
    price: resolvePublicPrice({
      priceWithTax: rule.priceWithTax,
      priceWithTaxUsd: rule.priceWithTaxUsd,
      price: rule.price,
      priceUsd: rule.priceUsd,
      currency: rule.currency,
      usdArsRate,
    }),
  }))
  return {
    id: r.id,
    // Los productos importados historicamente pueden tener el titulo en
    // `descripcion` y `name` nulo/vacio. El inventario ya usa este mismo
    // fallback; el catalogo publico debe hacerlo tambien para no renderizar
    // tarjetas sin titulo. El codigo garantiza un nombre incluso para datos
    // legados incompletos.
    name: [r.name, r.descripcion, r.codigo]
      .map(value => String(value || '').trim())
      .find(Boolean) || 'Producto sin nombre',
    category: r.category,
    subcategory: r.subcategory,
    price: publicPrice,
    originalPrice: originalPrice != null ? Math.round(Number(originalPrice) * 100) / 100 : null,
    description: r.description_larga,
    image: r.image_url,
    hoverImage: r.hover_image_url,
    galleryImages: Array.isArray(r.gallery_images) ? r.gallery_images : [],
    colorTemp: r.color_temp != null ? Number(r.color_temp) : null,
    ipRating: r.ip_rating,
    watts: r.watts != null ? Number(r.watts) : null,
    amperes: r.amperes != null ? Number(r.amperes) : null,
    material: r.material,
    cableType: r.cable_type,
    productType: r.product_type || r.cable_type,
    lengthCm: r.length_cm != null ? Number(r.length_cm) : null,
    widthCm: r.width_cm != null ? Number(r.width_cm) : null,
    heightCm: r.height_cm != null ? Number(r.height_cm) : null,
    weightKg: r.weight_kg != null ? Number(r.weight_kg) : null,
    colors: (r.color_options || []).map(color => ({
      ...color,
      price: resolvePublicOptionPrice(color, r.price_currency, usdArsRate),
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
      price: resolvePublicOptionPrice(size, r.price_currency, usdArsRate),
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
      price: resolvePublicOptionPrice(tone, r.price_currency, usdArsRate),
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
    variantRules,
    priceFrom: variantRules.filter(rule => rule.price != null).length > 1,
    isNew: Boolean(r.is_new),
    bestSeller: Boolean(r.best_seller),
    // Todo lo publicado es comprable: la tienda no consulta stock. Lo único
    // que distingue a un producto de otro es en cuántos días hábiles sale.
    stockInmediato: Boolean(r.stock_inmediato),
    diasEntrega: Number(r.dias_entrega_efectivo) || 3,
    published: true,
  }
}

// Arma el WHERE para el listado paginado del panel (sección Tienda). Siempre
// filtra por published = TRUE; los demás filtros son opcionales. `conImagen`
// separa lo que ya tiene foto cargada de lo que todavía no, para poder revisar
// el catálogo por ese eje sin bajarlo entero.
export function buildCatalogFilters({ search, category, conImagen } = {}) {
  const conditions = ['published = TRUE']
  const params = []
  let idx = 1

  const term = String(search || '').trim()
  if (term) {
    conditions.push(
      `(name ILIKE $${idx} OR descripcion ILIKE $${idx} OR codigo ILIKE $${idx} OR category ILIKE $${idx} OR subcategory ILIKE $${idx})`
    )
    params.push(`%${term}%`)
    idx++
  }

  const cat = String(category || '').trim()
  if (cat) {
    conditions.push(`category = $${idx++}`)
    params.push(cat)
  }

  if (conImagen === 'true') {
    conditions.push(`(image_url IS NOT NULL AND btrim(image_url) <> '')`)
  } else if (conImagen === 'false') {
    conditions.push(`(image_url IS NULL OR btrim(image_url) = '')`)
  }

  return { where: `WHERE ${conditions.join(' AND ')}`, params, nextIndex: idx }
}

router.get('/', async (req, res) => {
  try {
    // Sin `page` la respuesta sigue siendo el array completo que consume la
    // tienda pública. Con `page` responde paginado para el panel de admin.
    if (!('page' in req.query)) {
      const { rows } = await pool.query(
        `SELECT ${SELECT_FIELDS} FROM products WHERE published = TRUE ORDER BY updated_at DESC`
      )
      return res.json(rows.map(mapRow))
    }

    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 40))
    const page = Math.max(1, Number(req.query.page) || 1)
    const offset = (page - 1) * pageSize
    const { where, params, nextIndex: idx } = buildCatalogFilters(req.query)

    const [data, countResult, statsResult] = await Promise.all([
      pool.query(
        `SELECT ${SELECT_FIELDS} FROM products ${where}
         ORDER BY updated_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, pageSize, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM products ${where}`, params),
      // Las píldoras de arriba cuentan sobre todo lo publicado, no sobre el
      // filtro activo, para que sigan siendo una referencia global.
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE stock_inmediato) AS inmediatos,
           COUNT(*) FILTER (WHERE original_price IS NOT NULL OR original_price_usd IS NOT NULL) AS con_oferta
         FROM products WHERE published = TRUE`
      ),
    ])

    const total = Number(countResult.rows[0].count)
    res.json({
      items: data.rows.map(mapRow),
      total,
      page,
      pageSize,
      hasMore: offset + data.rows.length < total,
      inmediatos: Number(statsResult.rows[0].inmediatos),
      conOferta: Number(statsResult.rows[0].con_oferta),
    })
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
