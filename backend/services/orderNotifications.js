import { pool } from '../db/pool.js'
import {
  sendMail,
  customerConfirmationEmail,
  adminNewOrderEmail,
} from './mailer.js'

// Reclama el envío de confirmación de forma atómica. Los webhooks de Mercado
// Pago pueden repetirse, por lo que esta marca evita correos duplicados.
export async function sendOrderConfirmationNotifications(orderId) {
  const { rows } = await pool.query(
    `UPDATE orders
     SET confirmation_email_sent_at = NOW()
     WHERE id = $1
       AND status IN ('paid', 'reserved')
       AND confirmation_email_sent_at IS NULL
     RETURNING *`,
    [orderId]
  )

  const order = rows[0]
  if (!order) return false

  const customerMailSent = await sendMail({
    to: order.customer_email,
    ...customerConfirmationEmail(order),
  })

  if (!customerMailSent) {
    await pool.query(
      `UPDATE orders
       SET confirmation_email_sent_at = NULL
       WHERE id = $1
         AND confirmation_email_sent_at = $2`,
      [order.id, order.confirmation_email_sent_at]
    )
    return false
  }

  if (process.env.ADMIN_NOTIFICATION_EMAIL) {
    await sendMail({
      to: process.env.ADMIN_NOTIFICATION_EMAIL,
      ...adminNewOrderEmail(order),
    })
  }

  return true
}
