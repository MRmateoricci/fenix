import { Router } from 'express'
import { pool } from '../db/pool.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { getSupplierReport, parseSupplierReportPeriod } from '../services/supplierReport.js'

const router = Router()
router.use(requireAdmin)

router.get('/', async (req, res) => {
  const period = req.query.period ?? '30'
  try {
    parseSupplierReportPeriod(period)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
  try {
    res.set('Cache-Control', 'no-store')
    res.json(await getSupplierReport(pool, period))
  } catch (err) {
    console.error('[GET /api/suppliers]', err)
    res.status(500).json({ error: 'No se pudo cargar el resumen de proveedores.' })
  }
})

export default router
