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

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM subcategories WHERE id = $1', [req.params.id])
    res.status(204).end()
  } catch (err) {
    console.error('[DELETE /api/subcategories/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
