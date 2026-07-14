import { pool } from '../db/pool.js'
import { releaseOrderStock } from '../services/stockReservation.js'

const SWEEP_INTERVAL_MS = 30 * 60 * 1000 // 30 minutos

// ── Barrido de reservas vencidas ─────────────────────────────────────────────
// Cubre tanto reservas de retiro a pagar en el local ('reserved', vencen a los
// pickupDate + 2 días) como pedidos de Mercado Pago abandonados sin pagar
// ('pending_payment', vencen a los 45 min) — ambos casos dejaron stock
// reservado en POST /api/orders y necesitan liberarlo si nadie los completó.
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
    for (const { id } of rows) {
      await releaseOrderStock(id)
    }
    if (rows.length) {
      console.log(`[expireReservations] ${rows.length} reserva(s) vencida(s), stock liberado`)
    }
  } catch (err) {
    console.error('[expireReservations] Error en el barrido:', err)
  }
}

export function startExpireReservationsJob() {
  sweepExpiredReservations()
  setInterval(sweepExpiredReservations, SWEEP_INTERVAL_MS)
}
