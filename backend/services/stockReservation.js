// ─────────────────────────────────────────────────────────────────────────────
// FUERA DE SERVICIO — nadie llama a este módulo.
//
// La tienda dejó de llevar stock: el mismo inventario físico se vende en el
// mostrador y online sin POS que los sincronice, así que los números quedaban
// viejos en días. Hoy la disponibilidad es una bandera por producto
// (products.stock_inmediato) y lo único que cambia para el cliente es el plazo
// de entrega. El módulo se conserva —junto con las columnas stock,
// variant_stock y product_variant_rules.stock— por si más adelante se vuelve a
// llevar stock de un subconjunto del catálogo.
//
// Si se reactiva: reserveStock y releaseOrderStock se prenden JUNTAS. Con sólo
// una de las dos, cada pedido cancelado descuadra el stock de forma permanente
// (o nunca se descuenta, o se repone algo que jamás se descontó).
// ─────────────────────────────────────────────────────────────────────────────
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
//
// Excepción "a pedido": el WHERE de cada UPDATE lee products.a_pedido en la
// misma sentencia (nunca un dato mandado por el cliente, ni una lectura previa
// separada que pueda quedar vieja) y, si es true, deja pasar el descuento aunque
// dejaría el stock en negativo. Cuando eso pasa, se marca `item.aPedido = true`
// mutando el item recibido (el mismo array que el caller serializa en la orden)
// para que se sepa qué items necesitaron la excepción — un producto a_pedido con
// stock suficiente no se marca, porque para ese item no cambió nada.
export async function reserveStock(client, items) {
  for (const item of items) {
    let rows
    if (item.variantRuleId) {
      const result = await client.query(
        `UPDATE product_variant_rules vr
         SET stock=stock-$1,updated_at=NOW()
         WHERE vr.id=$2 AND vr.product_id=$3
           AND (vr.stock >= $1 OR (SELECT a_pedido FROM products WHERE id = $3))
         RETURNING vr.product_id, vr.stock`,
        [item.quantity, item.variantRuleId, item.id]
      )
      rows = result.rows
      if (rows.length) {
        await client.query(
          `UPDATE products SET stock=stock-$1,stock_updated_at=NOW() WHERE id=$2`,
          [item.quantity, item.id]
        )
        item.aPedido = Number(rows[0].stock) < 0
      }
    } else {
      const result = item.colorKey != null && item.sizeKey != null
      ? await client.query(
          `UPDATE products
           SET variant_stock = jsonb_set(variant_stock, $3::text[], to_jsonb((variant_stock #>> $3::text[])::int - $1)),
               stock = stock - $1,
               stock_updated_at = NOW()
           WHERE id = $2
             AND ((variant_stock #>> $3::text[])::int >= $1 OR a_pedido = TRUE)
           RETURNING (variant_stock #>> $3::text[])::int AS cell_stock`,
          [item.quantity, item.id, [item.colorKey, item.sizeKey]]
        )
      : await client.query(
          `UPDATE products SET stock = stock - $1, stock_updated_at = NOW()
           WHERE id = $2 AND (stock >= $1 OR a_pedido = TRUE)
           RETURNING stock`,
          [item.quantity, item.id]
        )
      rows = result.rows
      if (rows.length) {
        const postStock = item.colorKey != null && item.sizeKey != null ? rows[0].cell_stock : rows[0].stock
        item.aPedido = Number(postStock) < 0
      }
    }
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
        if (item.variantRuleId) {
          const { rowCount } = await client.query(
            `UPDATE product_variant_rules SET stock=stock+$1,updated_at=NOW()
             WHERE id=$2 AND product_id=$3`,
            [item.quantity, item.variantRuleId, item.id]
          )
          if (rowCount) {
            await client.query('UPDATE products SET stock=stock+$1,stock_updated_at=NOW() WHERE id=$2', [item.quantity, item.id])
            released = true
          }
        } else if (item.colorKey != null && item.sizeKey != null) {
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
