import { Router } from 'express'
import { pool } from '../db/pool.js'
import { requireAdmin } from '../middleware/requireAdmin.js'

const router = Router()
const LEVELS = new Set(['category', 'subcategory', 'type'])

function values(body = {}) {
  return {
    level: String(body.level || '').trim(),
    category: String(body.category || '').trim(),
    subcategory: String(body.subcategory || '').trim(),
    name: String(body.name || '').trim(),
    label: body.label == null ? null : String(body.label).trim(),
    hidden: Boolean(body.hidden),
    showInHeader: typeof body.showInHeader === 'boolean' ? body.showInHeader : null,
  }
}

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, level, category, subcategory, name, label, hidden, show_in_header, created_at, updated_at
       FROM category_tree_customizations ORDER BY level, category, subcategory, name`
    )
    res.json(rows)
  } catch (err) {
    console.error('[GET /api/category-customizations]', err)
    res.status(500).json({ error: 'No se pudieron cargar los cambios de categorias' })
  }
})

router.put('/', requireAdmin, async (req, res) => {
  const input = values(req.body)
  if (!LEVELS.has(input.level) || !input.category) {
    return res.status(400).json({ error: 'El nivel y la categoria son requeridos' })
  }
  if (input.level === 'subcategory' && !input.name) {
    return res.status(400).json({ error: 'La subcategoria es requerida' })
  }
  if (input.level === 'type' && (!input.subcategory || !input.name)) {
    return res.status(400).json({ error: 'La subcategoria y el tipo son requeridos' })
  }
  if (input.label !== null && !input.label) return res.status(400).json({ error: 'El nombre no puede quedar vacio' })
  if ([input.category, input.subcategory, input.name, input.label || ''].some(value => value.length > 150)) {
    return res.status(400).json({ error: 'Nombre demasiado largo' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: currentRows } = await client.query(
      `SELECT label FROM category_tree_customizations
       WHERE level = $1 AND category = $2 AND subcategory = $3 AND name = $4`,
      [input.level, input.category, input.subcategory, input.name]
    )
    const { rows: categoryRows } = await client.query(
      `SELECT label FROM category_tree_customizations
       WHERE level = 'category' AND category = $1 AND subcategory = '' AND name = ''`,
      [input.category]
    )
    const currentCategory = categoryRows[0]?.label || input.category
    let currentSubcategory = input.subcategory
    if (input.level === 'subcategory') currentSubcategory = currentRows[0]?.label || input.name
    if (input.level === 'type') {
      const { rows: subRows } = await client.query(
        `SELECT label FROM category_tree_customizations
         WHERE level = 'subcategory' AND category = $1 AND name = $2`,
        [input.category, input.subcategory]
      )
      currentSubcategory = subRows[0]?.label || input.subcategory
    }

    if (input.label !== null && input.level === 'category') {
      const previous = currentRows[0]?.label || input.category
      await client.query('UPDATE products SET category = $1 WHERE category = $2', [input.label, previous])
      await client.query('UPDATE subcategories SET category = $1 WHERE category = $2', [input.label, previous])
      await client.query('UPDATE product_types SET category = $1 WHERE category = $2', [input.label, previous])
    } else if (input.label !== null && input.level === 'subcategory') {
      const previous = currentRows[0]?.label || input.name
      await client.query(
        'UPDATE products SET subcategory = $1 WHERE category = $2 AND subcategory = $3',
        [input.label, currentCategory, previous]
      )
      await client.query(
        'UPDATE product_types SET subcategory = $1 WHERE category = $2 AND subcategory = $3',
        [input.label, currentCategory, previous]
      )
    } else if (input.label !== null && input.level === 'type') {
      const previous = currentRows[0]?.label || input.name
      await client.query(
        'UPDATE products SET product_type = $1 WHERE category = $2 AND subcategory = $3 AND product_type = $4',
        [input.label, currentCategory, currentSubcategory, previous]
      )
    }

    const { rows } = await client.query(
      `INSERT INTO category_tree_customizations (level, category, subcategory, name, label, hidden, show_in_header)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (level, category, subcategory, name) DO UPDATE SET
         label = COALESCE(EXCLUDED.label, category_tree_customizations.label),
         hidden = EXCLUDED.hidden,
         show_in_header = COALESCE(EXCLUDED.show_in_header, category_tree_customizations.show_in_header),
         updated_at = NOW()
       RETURNING id, level, category, subcategory, name, label, hidden, show_in_header, created_at, updated_at`,
      [input.level, input.category, input.subcategory, input.name, input.label, input.hidden, input.showInHeader]
    )
    await client.query('COMMIT')
    res.json(rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe otro elemento con ese nombre' })
    console.error('[PUT /api/category-customizations]', err)
    res.status(500).json({ error: 'No se pudo guardar el cambio de categoria' })
  } finally {
    client.release()
  }
})

export default router
