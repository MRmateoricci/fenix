import { Router } from 'express'
import { pool } from '../db/pool.js'
import { isValidEmail, normalizeEmail } from '../utils/email.js'

const router = Router()

router.post('/', async (req, res) => {
  try {
    if (!isValidEmail(req.body?.email)) return res.status(400).json({ error: 'Ingresá un email válido' })
    await pool.query(
      'INSERT INTO newsletter_subscribers (email) VALUES ($1) ON CONFLICT (email) DO NOTHING',
      [normalizeEmail(req.body.email)]
    )
    res.status(201).json({ ok: true })
  } catch (err) {
    console.error('[POST /api/newsletter]', err)
    res.status(500).json({ error: 'No pudimos completar la suscripción' })
  }
})

export default router
