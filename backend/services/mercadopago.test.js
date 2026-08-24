import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBackUrls, buildPreferenceBody } from './mercadopago.js'

test('Mercado Pago devuelve los rechazos al paso de pago', () => {
  const urls = buildBackUrls('https://fenix.example', 'order-123')

  assert.equal(urls.failure, 'https://fenix.example/checkout?payment=failure&orderId=order-123')
  assert.equal(urls.success, 'https://fenix.example/order-confirmation?orderId=order-123&status=success')
  assert.equal(urls.pending, 'https://fenix.example/order-confirmation?orderId=order-123&status=pending')
})

test('las preferencias nuevas no permiten pagos pendientes', () => {
  const body = buildPreferenceBody({
    id: 'order-123',
    customer_name: 'Mateo Ricci',
    customer_email: 'mateo@example.com',
    customer_phone: '2210000000',
    customer_dni: '12345678',
    shipping_cost: 0,
    reservation_expires_at: '2026-08-24T16:00:00.000Z',
    items: [{ id: 'product-1', name: 'Producto', quantity: 1, price: 100 }],
  }, {
    returnBaseUrl: 'https://fenix.example',
    webhookBaseUrl: 'https://api.fenix.example',
  }, new Date('2026-08-24T15:00:00.000Z'))

  assert.equal(body.binary_mode, true)
  assert.equal(body.expires, true)
  assert.equal(body.expiration_date_to, '2026-08-24T16:00:00.000Z')
})
