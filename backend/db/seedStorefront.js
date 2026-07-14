// Script puntual, se corre una sola vez a mano: `node backend/db/seedStorefront.js`
//
// Antes de este cambio el catálogo público vivía hardcodeado en
// src/data/products.js y se cargaba en el navegador (ver AdminContext.jsx).
// Ahora el catálogo público es la misma tabla `products` del Inventario,
// filtrada por published = true. Este script mete esos ~24 productos semilla
// en la base para no perderlos en el cutover — les inventa un código
// (SEED-<id>) porque no vienen de ningún proveedor real.
import { pool } from './pool.js'
import { products as seedProducts } from '../../src/data/products.js'

async function main() {
  let created = 0
  let skipped = 0

  for (const p of seedProducts) {
    const codigo = `SEED-${p.id}`
    const { rowCount } = await pool.query(
      `INSERT INTO products (
         codigo, name, category, subcategory, description_larga, descripcion,
         precio_venta, original_price, image_url, hover_image_url,
         stock, color_temp, ip_rating, watts, material, cable_type, color_options,
         published, source
       )
       VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,TRUE,'manual')
       ON CONFLICT (codigo) DO NOTHING`,
      [
        codigo, p.name, p.category, p.subcategory || null, p.description || null,
        p.price ?? null, p.originalPrice ?? null, p.image || null, p.hoverImage || null,
        p.inStock ? 1 : 0, p.colorTemp ?? null, p.ipRating || null, p.watts ?? null,
        p.material || null, p.cableType || null, JSON.stringify(p.colors || []),
      ]
    )
    if (rowCount > 0) created++
    else skipped++
  }

  console.log(`Semilla aplicada: ${created} productos creados, ${skipped} ya existían (código repetido, sin tocar).`)
  await pool.end()
}

main().catch((err) => {
  console.error('Error al aplicar la semilla:', err)
  process.exit(1)
})
