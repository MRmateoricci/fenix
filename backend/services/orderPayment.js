export const PAID_ORDER_STATUSES = new Set(['paid', 'preparing', 'shipped', 'delivered'])

export async function countCouponUsageOnce(client, order) {
  if (!order?.coupon_code || order.coupon_usage_counted_at) return order

  const claimed = await client.query(
    `UPDATE orders
     SET coupon_usage_counted_at = NOW()
     WHERE id = $1 AND coupon_usage_counted_at IS NULL
     RETURNING *`,
    [order.id],
  )
  if (!claimed.rows.length) return order

  await client.query(
    `UPDATE coupons
     SET times_used = times_used + 1
     WHERE UPPER(code) = UPPER($1)`,
    [order.coupon_code],
  )
  return claimed.rows[0]
}

export function paymentIsVerified(order, transferStatus = null) {
  if (!order || !PAID_ORDER_STATUSES.has(order.status)) return false
  if (order.payment_method === 'mercadopago') return order.mp_status === 'approved'
  if (order.payment_method === 'bank_transfer') return transferStatus === 'approved'
  return order.payment_method === 'pay_in_store'
}
