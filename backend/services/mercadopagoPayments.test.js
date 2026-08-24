import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mapMpStatus,
  reconcileMercadoPagoReturn,
  selectMerchantOrderPayment,
  shouldCountCouponUsage,
} from './mercadopagoPayments.js'

test('un pago rechazado vuelve a estado de pago fallido', () => {
  assert.equal(mapMpStatus('rejected'), 'payment_failed')
  assert.equal(mapMpStatus('cancelled'), 'payment_failed')
})

test('un intento rechazado no consume el cupón', () => {
  assert.equal(shouldCountCouponUsage({ coupon_code: 'FENIX10' }, 'payment_failed'), false)
})

test('el cupón se contabiliza una sola vez cuando el pago queda aprobado', () => {
  assert.equal(shouldCountCouponUsage({ coupon_code: 'FENIX10', coupon_usage_counted_at: null }, 'paid'), true)
  assert.equal(shouldCountCouponUsage({ coupon_code: 'FENIX10', coupon_usage_counted_at: new Date() }, 'paid'), false)
  assert.equal(shouldCountCouponUsage({ coupon_code: null, coupon_usage_counted_at: null }, 'paid'), false)
})

test('el retorno sin payment_id usa la orden de Mercado Pago y concilia el rechazo', async () => {
  let reconciled = null
  const result = await reconcileMercadoPagoReturn({
    paymentId: 'null', merchantOrderId: '123456', expectedOrderId: 'order-1', expectedPreferenceId: 'pref-1',
  }, {
    getMerchantOrder: async () => ({
      external_reference: 'order-1', preference_id: 'pref-1',
      payments: [{ id: 987654, status: 'rejected' }],
    }),
    reconcilePayment: async (args) => { reconciled = args; return { order: { status: 'payment_failed' } } },
  })

  assert.deepEqual(reconciled, { paymentId: '987654', expectedOrderId: 'order-1' })
  assert.equal(result.order.status, 'payment_failed')
})

test('la conciliación prioriza un pago aprobado frente a intentos rechazados anteriores', () => {
  const payment = selectMerchantOrderPayment({
    external_reference: 'order-1', preference_id: 'pref-1',
    payments: [
      { id: 111111, status: 'rejected', last_modified: '2026-08-24T10:00:00Z' },
      { id: 222222, status: 'approved', last_modified: '2026-08-24T09:00:00Z' },
    ],
  }, { expectedOrderId: 'order-1', expectedPreferenceId: 'pref-1' })

  assert.equal(String(payment.id), '222222')
})
