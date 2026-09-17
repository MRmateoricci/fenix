import { Router } from 'express'
import compression from 'compression'
import { pool } from '../../db/pool.js'
import { requirePosAuth, requirePosRole } from '../../middleware/posAuth.js'
import { resolvePublicPrice, roundPublicPrice, IVA_MULTIPLIER } from '../../services/publicPricing.js'

const router = Router()
router.use(requirePosAuth)

// El catálogo completo (~40.000 productos) se pide una sola vez al loguearse
// y pesa varios MB en JSON — gzip lo baja a 1-2MB. Se aplica solo acá, no
// global, para no comprimir de más respuestas chicas del resto de la API.
const gzip = compression()

// medida/descripcion de cada variante salen de product_data, el snapshot que
// guarda cada regla de variante de los datos propios del producto individual
// que la originó (ver normalizeVariantProductData en services/productVariants.js)
// — es lo que le permite al vendedor distinguir, ej., "6A" de "10A" dentro de
// un mismo producto agrupado sin tener que adivinar por el nombre.
const VARIANT_FIELDS = `
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', vr.id, 'color', vr.color_name, 'size', vr.size_label, 'tone', vr.tone_name,
      'stock', vr.stock,
      'precioVenta', vr.precio_venta, 'precioVentaUsd', vr.precio_venta_usd,
      'precioIva', vr.precio_iva, 'precioIvaUsd', vr.precio_iva_usd,
      'priceCurrency', vr.price_currency,
      'medida', NULLIF(vr.product_data->>'medida', ''),
      'descripcion', COALESCE(NULLIF(vr.product_data->>'description', ''), NULLIF(vr.product_data->>'inventoryDescription', ''))
    ) ORDER BY vr.created_at)
    FROM product_variant_rules vr WHERE vr.product_id = products.id
  ), '[]'::jsonb) AS variantes
`

const SELECT_FIELDS = `
  id, codigo,
  COALESCE(NULLIF(name, ''), NULLIF(descripcion, ''), codigo) AS nombre,
  precio_venta, precio_venta_usd, precio_iva, precio_iva_usd, price_currency,
  COALESCE((SELECT usd_ars_rate FROM store_settings WHERE id = 1), 1510) AS usd_ars_rate,
  stock, updated_at, supplier, grupo,
  medida, watts, amperes, ip_rating, material, cable_type, description_larga,
  ${VARIANT_FIELDS}
`

function variantLabel(v) {
  return [v.color, v.size, v.tone].filter(Boolean).join(' / ') || 'Variante'
}

// Neto = precio final / IVA_MULTIPLIER, no precio_venta crudo: así el modal de
// detalle del POS muestra siempre un desglose consistente con el importe que
// realmente se cobra, aunque precio_venta y precio_iva hayan divergido por
// redondeos o una carga manual (ver services/publicPricing.js).
function withoutTax(precio) {
  return precio == null ? null : roundPublicPrice(precio / IVA_MULTIPLIER)
}

function mapPosProduct(row) {
  const usdArsRate = Number(row.usd_ars_rate) || 1510
  const precio = resolvePublicPrice({
    priceWithTax: row.precio_iva,
    priceWithTaxUsd: row.precio_iva_usd,
    price: row.precio_venta,
    priceUsd: row.precio_venta_usd,
    currency: row.price_currency,
    usdArsRate,
  })
  const variantes = (row.variantes || []).map(v => {
    const precioVariante = resolvePublicPrice({
      priceWithTax: v.precioIva,
      priceWithTaxUsd: v.precioIvaUsd,
      price: v.precioVenta,
      priceUsd: v.precioVentaUsd,
      currency: v.priceCurrency,
      usdArsRate,
    })
    return {
      id: v.id,
      nombre: variantLabel(v),
      stock: v.stock != null ? Number(v.stock) : null,
      precio: precioVariante,
      precioSinIva: withoutTax(precioVariante),
      medida: v.medida || null,
      descripcion: v.descripcion || null,
    }
  })
  return {
    id: row.id,
    codigo: row.codigo,
    nombre: row.nombre,
    proveedor: row.supplier || null,
    marca: row.grupo || null,
    precio,
    precioSinIva: withoutTax(precio),
    stock: Number(row.stock) || 0,
    variantes,
    caracteristicas: {
      medida: row.medida || null,
      watts: row.watts != null ? Number(row.watts) : null,
      amperes: row.amperes != null ? Number(row.amperes) : null,
      ipRating: row.ip_rating || null,
      material: row.material || null,
      cableType: row.cable_type || null,
      descripcion: row.description_larga || null,
    },
  }
}

// GET /api/pos/products/catalog — TODO el catálogo (publicado o no: el POS
// vende lo que hay en el local, no solo lo que se muestra online) para el
// cache local del navegador. Se llama una vez al loguearse.
router.get('/catalog', gzip, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${SELECT_FIELDS} FROM products WHERE codigo IS NOT NULL ORDER BY codigo`
    )
    res.json({ products: rows.map(mapPosProduct), since: new Date().toISOString() })
  } catch (err) {
    console.error('[GET /api/pos/products/catalog]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// GET /api/pos/products/catalog/updated?since=ISO — deltas para refrescar el
// cache local sin volver a bajar todo. `since` se valida como fecha real: una
// fecha inválida devolvería `updated_at > NULL`, que no matchea nunca y el
// cache quedaría desactualizado en silencio.
router.get('/catalog/updated', gzip, async (req, res) => {
  try {
    const since = new Date(String(req.query.since || ''))
    if (Number.isNaN(since.getTime())) {
      return res.status(400).json({ error: 'Parámetro since inválido' })
    }
    const { rows } = await pool.query(
      `SELECT ${SELECT_FIELDS} FROM products
       WHERE codigo IS NOT NULL AND (
         updated_at > $1
         OR EXISTS (
           SELECT 1 FROM product_variant_rules vr
           WHERE vr.product_id = products.id AND vr.updated_at > $1
         )
       )
       ORDER BY updated_at DESC`,
      [since.toISOString()]
    )
    res.json({ products: rows.map(mapPosProduct), since: new Date().toISOString() })
  } catch (err) {
    console.error('[GET /api/pos/products/catalog/updated]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// Parte por CUALQUIER corrida de caracteres no alfanuméricos, igual que el
// regexp_replace del índice — no solo por espacios. "ALC-TE126" tiene que
// separarse en "alc" y "te126", si no el guion queda pegado a un solo token
// que no matchea los lexemas reales que arma to_tsvector para ese código.
export function buildPrefixTsQuery(term) {
  const words = term.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (!words.length) return null
  return words.map(word => `${word}:*`).join(' & ')
}

// GET /api/pos/products/search?q= — fallback de servidor mientras el cache
// local del navegador todavía no terminó de descargar. Búsqueda por prefijo
// de palabra (permite tipear parcial) usando el índice GIN de idx_products_search.
router.get('/search', async (req, res) => {
  try {
    const term = String(req.query.q || '').trim()
    const tsQuery = term ? buildPrefixTsQuery(term) : null
    if (!tsQuery) return res.json({ products: [] })

    const { rows } = await pool.query(
      `SELECT ${SELECT_FIELDS} FROM products
       WHERE codigo IS NOT NULL
         AND to_tsvector('spanish',
               regexp_replace(
                 coalesce(nullif(name, ''), nullif(descripcion, ''), '') || ' ' || coalesce(codigo, ''),
                 '[^[:alnum:]]+', ' ', 'g'
               )
             ) @@ to_tsquery('spanish', $1)
       ORDER BY codigo
       LIMIT 20`,
      [tsQuery]
    )
    res.json({ products: rows.map(mapPosProduct) })
  } catch (err) {
    console.error('[GET /api/pos/products/search]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

function resolveCost({ cost, costUsd, currency, usdArsRate }) {
  if (currency === 'USD' && costUsd != null) return roundPublicPrice(Number(costUsd) * usdArsRate)
  return roundPublicPrice(cost)
}

// GET /api/pos/products/:id/cost — precio de costo y margen, admin-only.
// Deliberadamente separado del catálogo (GET /catalog) que cachea los ~40.000
// productos en el navegador de CUALQUIER vendedor logueado: si el costo
// viajara ahí, alcanzaría con abrir las devtools para verlo aunque la UI lo
// ocultara. Se pide bajo demanda, solo cuando un admin abre el modal de
// detalle de un producto puntual.
router.get('/:id/cost', requirePosRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         precio_costo, precio_costo_usd, price_currency,
         COALESCE((SELECT usd_ars_rate FROM store_settings WHERE id = 1), 1510) AS usd_ars_rate,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'id', vr.id,
             'precioCosto', vr.precio_costo, 'precioCostoUsd', vr.precio_costo_usd,
             'priceCurrency', vr.price_currency
           ) ORDER BY vr.created_at)
           FROM product_variant_rules vr WHERE vr.product_id = products.id
         ), '[]'::jsonb) AS variantes
       FROM products WHERE id = $1`,
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' })
    const row = rows[0]
    const usdArsRate = Number(row.usd_ars_rate) || 1510
    res.json({
      precioCosto: resolveCost({ cost: row.precio_costo, costUsd: row.precio_costo_usd, currency: row.price_currency, usdArsRate }),
      variantes: (row.variantes || []).map(v => ({
        id: v.id,
        precioCosto: resolveCost({ cost: v.precioCosto, costUsd: v.precioCostoUsd, currency: v.priceCurrency, usdArsRate }),
      })),
    })
  } catch (err) {
    console.error('[GET /api/pos/products/:id/cost]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
