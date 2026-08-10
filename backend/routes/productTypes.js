import { Router } from 'express'
import { pool } from '../db/pool.js'
import { requireAdmin } from '../middleware/requireAdmin.js'

const router = Router()

// Pública, por el mismo motivo que /api/subcategories: el mega-menú y los
// filtros de /products leen el tercer nivel del árbol sin estar logueados.
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, category, subcategory, name, created_at FROM product_types ORDER BY category, subcategory, name'
    )
    res.json(rows)
  } catch (err) {
    console.error('[GET /api/product-types]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.post('/', requireAdmin, async (req, res) => {
  try {
    const category = String(req.body?.category || '').trim()
    const subcategory = String(req.body?.subcategory || '').trim()
    const name = String(req.body?.name || '').trim()
    if (!category || !subcategory || !name) return res.status(400).json({ error: 'Categoría, subcategoría y nombre son requeridos' })
    if (category.length > 100 || subcategory.length > 150 || name.length > 150) return res.status(400).json({ error: 'Nombre demasiado largo' })

    const { rows } = await pool.query(
      'INSERT INTO product_types (category, subcategory, name) VALUES ($1, $2, $3) RETURNING id, category, subcategory, name, created_at',
      [category, subcategory, name]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ese tipo ya existe en esta subcategoría' })
    console.error('[POST /api/product-types]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.patch('/:id', requireAdmin, async (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'El nombre es requerido' })
  if (name.length > 150) return res.status(400).json({ error: 'Nombre demasiado largo' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: current } = await client.query(
      'SELECT category, subcategory, name FROM product_types WHERE id = $1 FOR UPDATE',
      [req.params.id]
    )
    if (!current.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Tipo no encontrado' })
    }
    const previous = current[0]
    const { rows } = await client.query(
      'UPDATE product_types SET name = $1 WHERE id = $2 RETURNING id, category, subcategory, name, created_at',
      [name, req.params.id]
    )
    await client.query(
      `UPDATE products SET product_type = $1
       WHERE category = $2 AND subcategory = $3 AND product_type = $4`,
      [name, previous.category, previous.subcategory, previous.name]
    )
    await client.query('COMMIT')
    res.json(rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === '23505') return res.status(409).json({ error: 'Ese tipo ya existe en esta subcategoria' })
    console.error('[PATCH /api/product-types/:id]', err)
    res.status(500).json({ error: 'No se pudo editar el tipo' })
  } finally {
    client.release()
  }
})

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM product_types WHERE id = $1', [req.params.id])
    res.status(204).end()
  } catch (err) {
    console.error('[DELETE /api/product-types/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
