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

// Valida un cupón contra un subtotal y devuelve el monto a descontar. No
// muta el cupón — quien llama decide cuándo confirmar el uso (recién cuando
// el pedido efectivamente se crea, ver POST /api/orders).
export function evaluateCoupon(coupon, subtotal) {
  if (!coupon) return { error: 'Código de descuento inválido' }
  if (!coupon.active) return { error: 'Ese código ya no está disponible' }
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { error: 'Ese código de descuento venció' }
  }
  if (coupon.usage_limit != null && coupon.times_used >= coupon.usage_limit) {
    return { error: 'Ese código alcanzó su límite de usos' }
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
