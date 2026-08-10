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
    const { rows } = item.colorKey != null && item.sizeKey != null
      ? await client.query(
          `UPDATE products
           SET variant_stock = jsonb_set(variant_stock, $3::text[], to_jsonb((variant_stock #>> $3::text[])::int - $1)),
               stock = stock - $1,
               stock_updated_at = NOW()
           WHERE id = $2
             AND (variant_stock #>> $3::text[])::int >= $1
           RETURNING stock`,
          [item.quantity, item.id, [item.colorKey, item.sizeKey]]
        )
      : await client.query(
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
        // Si la orden reservó una celda puntual de variant_stock, tratamos de
        // reponerla ahí (solo si esa celda todavía existe hoy — el producto
        // pudo haber sido editado desde la compra). Si no aplica o ya no
        // existe, reponemos solo el total, igual que siempre.
        let released = false
        if (item.colorKey != null && item.sizeKey != null) {
          const { rowCount } = await client.query(
            `UPDATE products
             SET variant_stock = jsonb_set(variant_stock, $3::text[], to_jsonb((variant_stock #>> $3::text[])::int + $1)),
                 stock = stock + $1,
                 stock_updated_at = NOW()
             WHERE id = $2
               AND (variant_stock #> $3::text[]) IS NOT NULL`,
            [item.quantity, item.id, [item.colorKey, item.sizeKey]]
          )
          released = rowCount > 0
        }
        if (!released) {
          await client.query(
            `UPDATE products SET stock = stock + $1, stock_updated_at = NOW() WHERE id = $2`,
            [item.quantity, item.id]
          )
        }
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
