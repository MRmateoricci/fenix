import { pool } from '../db/pool.js'

// Búsqueda case-insensitive del código (coupons.code no está normalizado a
// mayúsculas al guardarse, pero el índice único sí lo es — ver schema.sql).
export async function findCouponByCode(code, queryable = pool) {
  const normalized = String(code || '').trim()
  if (!normalized) return null
  const { rows } = await queryable.query(
    'SELECT * FROM coupons WHERE UPPER(code) = UPPER($1)',
    [normalized]
  )
  return rows[0] || null
}

// Cuántas veces este comprador ya consumió el cupón. Un "uso" es un pedido con
// el pago confirmado (coupon_usage_counted_at) — un checkout abandonado o un
// pago rechazado no cuenta, igual que para times_used. Se identifica al cliente
// por email normalizado o, si lo informó, por DNI: alcanza para que no repita
// el cupón cambiando solo el correo cuando igual pidió factura.
export async function countCustomerCouponUses(code, { email, dni } = {}, queryable = pool) {
  const normalizedCode = String(code || '').trim()
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const normalizedDni = String(dni || '').replace(/\D/g, '')
  if (!normalizedCode || (!normalizedEmail && !normalizedDni)) return 0
  const { rows } = await queryable.query(
    `SELECT COUNT(*)::int AS uses
       FROM orders
      WHERE UPPER(coupon_code) = UPPER($1)
        AND coupon_usage_counted_at IS NOT NULL
        AND (($2 <> '' AND LOWER(customer_email) = $2)
             OR ($3 <> '' AND customer_dni = $3))`,
    [normalizedCode, normalizedEmail, normalizedDni]
  )
  return rows[0]?.uses ?? 0
}

// Valida un cupón contra un subtotal y devuelve el monto a descontar. No
// muta el cupón — quien llama decide cuándo confirmar el uso (recién cuando
// el pedido efectivamente se crea, ver POST /api/orders).
//
// `customerPriorUses` es cuántas veces este mismo comprador ya consumió el
// cupón (ver countCustomerCouponUses). Solo lo pasa quien conoce la identidad
// del cliente; la comparación con per_customer_limit vive acá para quedar
// cubierta por los tests junto al resto de las reglas.
export function evaluateCoupon(coupon, subtotal, { customerPriorUses = 0 } = {}) {
  if (!coupon) return { error: 'Código de descuento inválido' }
  if (!coupon.active) return { error: 'Ese código ya no está disponible' }
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { error: 'Ese código de descuento venció' }
  }
  if (coupon.usage_limit != null && coupon.times_used >= coupon.usage_limit) {
    return { error: 'Ese código alcanzó su límite de usos' }
  }
  if (coupon.per_customer_limit != null && customerPriorUses >= coupon.per_customer_limit) {
    return {
      error: coupon.per_customer_limit === 1
        ? 'Ya usaste este código de descuento'
        : 'Alcanzaste el máximo de usos de este código',
    }
  }
  if (coupon.min_purchase != null && subtotal < Number(coupon.min_purchase)) {
    const minPurchase = Math.round(Number(coupon.min_purchase)).toLocaleString('es-AR')
    return { error: `Ese código requiere una compra mínima de $${minPurchase}` }
  }

  const rawAmount = coupon.type === 'percentage'
    ? subtotal * (Number(coupon.value) / 100)
    : Number(coupon.value)
  const amount = Math.min(Math.round(rawAmount * 100) / 100, subtotal)
  return { error: null, amount }
}
