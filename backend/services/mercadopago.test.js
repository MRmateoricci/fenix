import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBackUrls, buildPreferenceBody, buildPreferenceItems } from './mercadopago.js'

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

test('sin cupón la preferencia mantiene cantidades y precios de lista', () => {
  const items = buildPreferenceItems({
    total_amount: 2000,
    shipping_cost: null,
    discount_amount: 0,
    items: [{ id: 'a', name: 'Foco LED', quantity: 2, price: 1000 }],
  })

  assert.equal(items.length, 1)
  assert.equal(items[0].quantity, 2)
  assert.equal(items[0].unit_price, 1000)
  assert.equal(items[0].title, 'Foco LED')
})

test('el cupón se prorratea y el total cobrado coincide con total_amount', () => {
  const order = {
    id: 'order-cup',
    customer_name: 'Ana Gómez',
    customer_email: 'ana@example.com',
    customer_phone: '2210000000',
    // 10% de descuento sobre 2333.33 de productos, + 500 de envío.
    total_amount: 2600,
    shipping_cost: 500,
    discount_amount: 233.33,
    items: [
      { id: 'a', name: 'Foco LED', quantity: 2, price: 1000 },
      { id: 'b', name: 'Cable', quantity: 1, price: 333.33 },
    ],
  }
  const body = buildPreferenceBody(order, {
    returnBaseUrl: 'https://fenix.example',
    webhookBaseUrl: 'https://api.fenix.example',
  })

  const grandTotal = body.items.reduce((sum, it) => sum + it.unit_price * it.quantity, 0)
  assert.equal(Math.round(grandTotal * 100) / 100, 2600)

  const productTotal = body.items
    .filter((it) => it.id !== 'shipping')
    .reduce((sum, it) => sum + it.unit_price * it.quantity, 0)
  assert.equal(Math.round(productTotal * 100) / 100, 2100)

  const shipping = body.items.find((it) => it.id === 'shipping')
  assert.equal(shipping.unit_price, 500)

  // La cantidad viaja en el título porque la línea va con quantity 1.
  const foco = body.items.find((it) => it.id === 'a')
  assert.equal(foco.quantity, 1)
  assert.equal(foco.title, 'Foco LED (x2)')
})

test('el prorrateo del cupón cierra al centavo con montos que no dividen exacto', () => {
  const items = buildPreferenceItems({
    total_amount: 6666.67, // 9000 productos - 2333.33 cupón, sin envío
    shipping_cost: null,
    discount_amount: 2333.33,
    items: [
      { id: 'a', name: 'A', quantity: 3, price: 1000 },
      { id: 'b', name: 'B', quantity: 1, price: 3000 },
      { id: 'c', name: 'C', quantity: 1, price: 3000 },
    ],
  })

  const total = items.reduce((sum, it) => sum + it.unit_price * it.quantity, 0)
  assert.equal(Math.round(total * 100) / 100, 6666.67)
  assert.ok(items.every((it) => it.unit_price > 0))
})

test('rechaza la preferencia si el cupón deja el total de productos en cero', () => {
  assert.throws(() => buildPreferenceItems({
    total_amount: 0,
    shipping_cost: null,
    discount_amount: 5000,
    items: [{ id: 'a', name: 'A', quantity: 1, price: 5000 }],
  }), /no se puede cobrar por Mercado Pago/)
})
