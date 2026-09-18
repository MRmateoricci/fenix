import { pool } from '../db/pool.js'
import { FREE_SHIPPING_THRESHOLD } from '../config/shipping.js'

// NULL en la columna significa "todavía no lo tocó el admin, seguir usando el
// fallback de ENVIO_GRATIS_MINIMO" (ver comentario en db/schema.sql).
export async function getFreeShippingThreshold(client = pool) {
  const { rows } = await client.query('SELECT free_shipping_threshold FROM store_settings WHERE id = 1')
  const value = rows[0]?.free_shipping_threshold
  return value != null ? Number(value) : FREE_SHIPPING_THRESHOLD
}

export function validateFreeShippingThreshold(value) {
  if (!Number.isFinite(value) || value < 0) return 'El monto debe ser un número mayor o igual a 0'
  return null
}
