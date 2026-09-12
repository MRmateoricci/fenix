import { Router } from 'express'
import { pool } from '../db/pool.js'
import { SELECT_FIELDS, mapRow } from './catalog.js'
import { buildMetaFeed, resolveFeedBaseUrl } from '../services/metaCatalogFeed.js'

// ─────────────────────────────────────────────────────────────────────────────
// Feed de catálogo para Meta Commerce Manager — sin auth, solo lectura.
//
// Meta lo consulta por URL en el horario que se configure en el panel (cada
// hora como mínimo) y actualiza precios, disponibilidad e imágenes solo. Los
// datos son los mismos que ya expone /api/catalog públicamente, así que no hay
// nada que proteger; sí se fija un Cache-Control corto para que un refresco
// manual desde el panel de Meta no dispare la consulta completa dos veces.
//
// URL a pegar en Commerce Manager → Orígenes de datos → Programar:
//   https://<dominio>/api/meta-catalog/products.csv
// ─────────────────────────────────────────────────────────────────────────────
const router = Router()

router.get('/products.csv', async (_req, res) => {
  try {
    // `grupo` es la marca/fabricante del inventario; el catálogo público no la
    // expone, pero Meta la exige.
    const { rows } = await pool.query(
      `SELECT ${SELECT_FIELDS}, grupo FROM products WHERE published = TRUE ORDER BY updated_at DESC`
    )
    const products = rows.map(row => ({ ...mapRow(row), brand: row.grupo }))
    const { csv, count, skipped } = buildMetaFeed(products, { baseUrl: resolveFeedBaseUrl() })

    const skippedTotal = Object.values(skipped).reduce((sum, n) => sum + n, 0)
    if (skippedTotal) {
      console.log(`[meta-catalog] ${count} filas, ${skippedTotal} omitidas: ${JSON.stringify(skipped)}`)
    }

    res.set('Content-Type', 'text/csv; charset=utf-8')
    res.set('Content-Disposition', 'inline; filename="fenix-meta-catalog.csv"')
    res.set('Cache-Control', 'public, max-age=900')
    res.send(csv)
  } catch (err) {
    console.error('[GET /api/meta-catalog/products.csv]', err)
    res.status(500).json({ error: 'No se pudo generar el catálogo' })
  }
})

export default router
