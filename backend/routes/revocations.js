import { Router } from 'express'
import { pool } from '../db/pool.js'
import { isValidEmail, normalizeEmail } from '../utils/email.js'
import { sendMail, revocationRequestCustomerEmail, revocationRequestAdminEmail } from '../services/mailer.js'

const router = Router()

// Mismo alfabeto que el número de orden (sin 0/O ni 1/I): el cliente lo va a
// dictar por teléfono o WhatsApp.
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let rand = ''
  for (let i = 0; i < 6; i++) rand += chars[Math.floor(Math.random() * chars.length)]
  return `ARR-${rand}`
}

const clean = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

// POST /api/revocations — botón de arrepentimiento (Res. 424/2020).
// Público y sin cuenta: la norma prohíbe ponerle trabas. El número de pedido
// es opcional por lo mismo; si viene, se intenta vincular al pedido, pero un
// número que no existe no invalida la solicitud — se avisa al negocio y listo.
router.post('/', async (req, res) => {
  try {
    const fullName = clean(req.body?.fullName, 200)
    const email = normalizeEmail(req.body?.email)
    const orderNumber = clean(req.body?.orderNumber, 20).toUpperCase()
    const reason = clean(req.body?.reason, 2000) || null

    if (!fullName) return res.status(400).json({ error: 'Ingresá tu nombre y apellido' })
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Ingresá un email válido' })

    let orderId = null
    if (orderNumber) {
      const { rows } = await pool.query('SELECT id FROM orders WHERE order_number = $1', [orderNumber])
      orderId = rows[0]?.id || null
    }

    // Reintento por si el código aleatorio choca con uno existente (UNIQUE).
    let request = null
    for (let attempt = 0; attempt < 5 && !request; attempt++) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO revocation_requests (code, order_number, order_id, email, full_name, reason)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [generateCode(), orderNumber || null, orderId, email, fullName, reason]
        )
        request = rows[0]
      } catch (err) {
        if (err.code !== '23505') throw err
      }
    }
    if (!request) throw new Error('No se pudo generar un código único')

    // Los mails son best-effort: la solicitud ya quedó registrada.
    sendMail({ to: request.email, ...revocationRequestCustomerEmail(request) })
    if (process.env.ADMIN_NOTIFICATION_EMAIL) {
      sendMail({ to: process.env.ADMIN_NOTIFICATION_EMAIL, ...revocationRequestAdminEmail(request) })
    }

    res.status(201).json({ code: request.code, createdAt: request.created_at })
  } catch (err) {
    console.error('[POST /api/revocations]', err)
    res.status(500).json({ error: 'No pudimos registrar la solicitud. Escribinos por WhatsApp o email.' })
  }
})

export default router
