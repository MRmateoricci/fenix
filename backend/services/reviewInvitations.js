import { pool } from '../db/pool.js'
import { reviewInvitationEmail, sendMail } from './mailer.js'

async function claimReviewInvitation(orderId) {
  const { rows } = await pool.query(
    `UPDATE orders o
     SET review_email_sent_at = NOW()
     FROM users u
     WHERE o.id = $1
       AND (o.user_id = u.id OR LOWER(o.customer_email) = u.email)
       AND o.status = 'delivered'
       AND o.review_email_sent_at IS NULL
       AND u.email_verified_at IS NOT NULL
     RETURNING o.*, u.email AS verified_email`,
    [orderId]
  )
  return rows[0] || null
}

export async function sendReviewInvitationForOrder(orderId) {
  const order = await claimReviewInvitation(orderId)
  if (!order) return false

  const sent = await sendMail({
    to: order.verified_email,
    ...reviewInvitationEmail(order),
  })

  if (!sent) {
    await pool.query(
      'UPDATE orders SET review_email_sent_at = NULL WHERE id = $1',
      [order.id]
    )
  }

  return sent
}

export async function sendPendingReviewInvitationsForUser(userId) {
  const { rows } = await pool.query(
    `SELECT o.id
     FROM orders o
     JOIN users u ON u.id = $1
     WHERE (o.user_id = u.id OR LOWER(o.customer_email) = u.email)
       AND o.status = 'delivered'
       AND o.review_email_sent_at IS NULL`,
    [userId]
  )

  for (const order of rows) {
    await sendReviewInvitationForOrder(order.id)
  }
}
