import { pool } from '../db/pool.js'

const SWEEP_INTERVAL_MS = 30 * 60 * 1000 // 30 minutos

// ── Barrido de pedidos vencidos ──────────────────────────────────────────────
// Cubre tanto reservas de retiro a pagar en el local ('reserved', vencen a los
// pickupDate + 2 días) como pedidos de Mercado Pago abandonados sin pagar
// ('pending_payment', vencen a los 45 min). Ya no libera stock — la tienda dejó
// de llevarlo (ver products.stock_inmediato) — pero el barrido sigue haciendo
// falta para que esos pedidos no queden colgados en la lista del admin.
//
// El UPDATE ... WHERE status IN (...) AND reservation_expires_at < NOW() es
// atómico: si un webhook o el admin ya movieron el pedido a otro estado un
// instante antes, esa fila simplemente no matchea y no se toca — no hace
// falta ningún lock adicional entre el sweep y esos otros caminos.
async function sweepExpiredReservations() {
  try {
    const { rows } = await pool.query(
      `UPDATE orders SET status = 'expired'
       WHERE status IN ('reserved', 'pending_payment') AND reservation_expires_at < NOW()
       RETURNING id`
    )
    if (rows.length) {
      console.log(`[expireReservations] ${rows.length} pedido(s) vencido(s)`)
    }
  } catch (err) {
    console.error('[expireReservations] Error en el barrido:', err)
  }
}

export function startExpireReservationsJob() {
  sweepExpiredReservations()
  setInterval(sweepExpiredReservations, SWEEP_INTERVAL_MS)
}
