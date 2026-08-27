export const PREPARATION_ALERT_HOURS = 12

const PREPARATION_ALERT_MS = PREPARATION_ALERT_HOURS * 60 * 60 * 1000

export function isPreparationOverdue(order, nowMs = Date.now()) {
  if (order?.status !== 'paid' || !order?.paid_at) return false
  const paidAtMs = new Date(order.paid_at).getTime()
  return Number.isFinite(paidAtMs) && nowMs - paidAtMs >= PREPARATION_ALERT_MS
}
