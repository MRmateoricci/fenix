import { Router } from 'express'
import { pool } from '../db/pool.js'
import { requireAdmin } from '../middleware/requireAdmin.js'

const router = Router()

// Pública: el mega-menú del header y los filtros de /products necesitan
// leer las subcategorías agregadas a mano sin que el visitante esté logueado.
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, category, name, created_at FROM subcategories ORDER BY category, name'
    )
    res.json(rows)
  } catch (err) {
    console.error('[GET /api/subcategories]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.post('/', requireAdmin, async (req, res) => {
  try {
    const category = String(req.body?.category || '').trim()
    const name = String(req.body?.name || '').trim()
    if (!category || !name) return res.status(400).json({ error: 'Categoría y nombre son requeridos' })
    if (category.length > 100 || name.length > 150) return res.status(400).json({ error: 'Nombre demasiado largo' })

    const { rows } = await pool.query(
      'INSERT INTO subcategories (category, name) VALUES ($1, $2) RETURNING id, category, name, created_at',
      [category, name]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Esa subcategoría ya existe en esta categoría' })
    console.error('[POST /api/subcategories]', err)
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
    const { rows: current } = await client.query('SELECT category, name FROM subcategories WHERE id = $1 FOR UPDATE', [req.params.id])
    if (!current.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Subcategoria no encontrada' })
    }
    const previous = current[0]
    const { rows } = await client.query(
      'UPDATE subcategories SET name = $1 WHERE id = $2 RETURNING id, category, name, created_at',
      [name, req.params.id]
    )
    await client.query(
      'UPDATE products SET subcategory = $1 WHERE category = $2 AND subcategory = $3',
      [name, previous.category, previous.name]
    )
    await client.query(
      'UPDATE product_types SET subcategory = $1 WHERE category = $2 AND subcategory = $3',
      [name, previous.category, previous.name]
    )
    await client.query('COMMIT')
    res.json(rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === '23505') return res.status(409).json({ error: 'Esa subcategoria ya existe en esta categoria' })
    console.error('[PATCH /api/subcategories/:id]', err)
    res.status(500).json({ error: 'No se pudo editar la subcategoria' })
  } finally {
    client.release()
  }
})

router.delete('/:id', requireAdmin, async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query('DELETE FROM subcategories WHERE id = $1 RETURNING category, name', [req.params.id])
    if (rows.length) {
      await client.query('DELETE FROM product_types WHERE category = $1 AND subcategory = $2', [rows[0].category, rows[0].name])
    }
    await client.query('COMMIT')
    res.status(204).end()
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[DELETE /api/subcategories/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  } finally {
    client.release()
  }
})

export default router
