import { pool } from '../db/pool.js'

export class InsufficientStockError extends Error {
  constructor(productName) {
    super(`Sin stock suficiente: ${productName}`)
    this.name = 'InsufficientStockError'
    this.productName = productName
  }
}

// ── reserveStock — descuenta stock de cada item dentro de una transacción ────
// Se llama con el `client` de una transacción ya abierta (BEGIN hecho por el
// caller). Si algún item no tiene stock suficiente, tira InsufficientStockError
// para que el caller haga ROLLBACK — ninguno de los descuentos previos de esta
// misma orden queda aplicado a medias.
export async function reserveStock(client, items) {
  for (const item of items) {
    const { rows } = await client.query(
      `UPDATE products SET stock = stock - $1, stock_updated_at = NOW()
       WHERE id = $2 AND stock >= $1
       RETURNING stock`,
      [item.quantity, item.id]
    )
    if (!rows.length) throw new InsufficientStockError(item.name)
  }
}

// ── releaseOrderStock — repone el stock de una orden ya reservada ───────────
// Idempotente vía el guard `stock_released_at IS NULL`: la llaman el webhook
// de MP (pago rechazado), el sweep de expiración y el cambio manual de estado
// del admin, sin coordinarse entre sí — solo una de esas llamadas gana la
// carrera y repone stock una sola vez.
export async function releaseOrderStock(orderId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows } = await client.query(
      `UPDATE orders SET stock_released_at = NOW()
       WHERE id = $1 AND stock_released_at IS NULL
       RETURNING items`,
      [orderId]
    )

    if (rows.length) {
      const items = rows[0].items || []
      for (const item of items) {
        await client.query(
          `UPDATE products SET stock = stock + $1, stock_updated_at = NOW() WHERE id = $2`,
          [item.quantity, item.id]
        )
      }
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
