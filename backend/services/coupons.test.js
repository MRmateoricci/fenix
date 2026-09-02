import test from 'node:test'
import assert from 'node:assert/strict'
import { countCustomerCouponUses, evaluateCoupon } from './coupons.js'

const baseCoupon = {
  active: true,
  type: 'percentage',
  value: 10,
  expires_at: null,
  usage_limit: null,
  times_used: 0,
  min_purchase: null,
  per_customer_limit: null,
}

test('sin per_customer_limit el cupón se puede reusar sin importar usos previos', () => {
  const result = evaluateCoupon({ ...baseCoupon }, 10000, { customerPriorUses: 5 })
  assert.equal(result.error, null)
  assert.equal(result.amount, 1000)
})

test('per_customer_limit 1: el primer uso pasa, el segundo se rechaza', () => {
  const coupon = { ...baseCoupon, per_customer_limit: 1 }
  assert.equal(evaluateCoupon(coupon, 10000, { customerPriorUses: 0 }).error, null)
  assert.equal(
    evaluateCoupon(coupon, 10000, { customerPriorUses: 1 }).error,
    'Ya usaste este código de descuento',
  )
})

test('per_customer_limit 2: se permite hasta el segundo uso', () => {
  const coupon = { ...baseCoupon, per_customer_limit: 2 }
  assert.equal(evaluateCoupon(coupon, 10000, { customerPriorUses: 1 }).error, null)
  assert.equal(
    evaluateCoupon(coupon, 10000, { customerPriorUses: 2 }).error,
    'Alcanzaste el máximo de usos de este código',
  )
})

test('sin identidad del comprador el tope no se evalúa (customerPriorUses por defecto 0)', () => {
  const coupon = { ...baseCoupon, per_customer_limit: 1 }
  assert.equal(evaluateCoupon(coupon, 10000).error, null)
})

test('countCustomerCouponUses normaliza email y DNI y consulta solo pagos confirmados', async () => {
  const calls = []
  const queryable = {
    async query(sql, params) {
      calls.push({ sql, params })
      return { rows: [{ uses: 2 }] }
    },
  }
  const uses = await countCustomerCouponUses(
    ' bienvenida10 ',
    { email: '  Cliente@Mail.COM ', dni: '30.111.222' },
    queryable,
  )
  assert.equal(uses, 2)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].params, ['bienvenida10', 'cliente@mail.com', '30111222'])
  assert.match(calls[0].sql, /coupon_usage_counted_at IS NOT NULL/)
})

test('countCustomerCouponUses devuelve 0 sin tocar la base si no hay email ni DNI', async () => {
  let called = false
  const queryable = { async query() { called = true; return { rows: [] } } }
  assert.equal(await countCustomerCouponUses('BIENVENIDA10', {}, queryable), 0)
  assert.equal(await countCustomerCouponUses('BIENVENIDA10', { email: '', dni: '  ' }, queryable), 0)
  assert.equal(called, false)
})

test('countCustomerCouponUses tolera una respuesta vacía', async () => {
  const queryable = { async query() { return { rows: [] } } }
  assert.equal(await countCustomerCouponUses('X', { email: 'a@b.com' }, queryable), 0)
})
