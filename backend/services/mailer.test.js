import test from 'node:test'
import assert from 'node:assert/strict'
import { adminNewOrderEmail, customerConfirmationEmail } from './mailer.js'

const pickupOrder = {
  status: 'paid',
  order_number: 'FX-RETIRO',
  customer_name: 'Mateo Ricci',
  customer_email: 'mateo@example.com',
  customer_phone: '2210000000',
  delivery_type: 'pickup',
  payment_method: 'mercadopago',
  pickup_date: '2026-08-26',
  pickup_person_name: 'Lucía',
  pickup_person_last_name: 'Pérez',
  total_amount: 100,
  shipping_cost: 0,
  items: [],
}

test('los correos de retiro identifican a la persona autorizada', () => {
  assert.match(customerConfirmationEmail(pickupOrder).html, /Persona autorizada: Lucía Pérez/)
  assert.match(adminNewOrderEmail(pickupOrder).html, /Persona autorizada: Lucía Pérez/)
})

test('el correo al cliente muestra la ventana final y oculta plazos internos', () => {
  const deliveryOrder = {
    ...pickupOrder,
    order_number: 'FX-ENVIO',
    delivery_type: 'delivery',
    address: 'Calle 42 123',
    city: 'La Plata',
    postal_code: '1900',
    shipping_service: 'Clásico',
    estimated_delivery_date: '2026-09-03',
    estimated_delivery_max_date: '2026-09-08',
    items: [{ name: 'Aplique', quantity: 1, subtotal: 100, aPedido: true, diasEntregaPedido: 7 }],
  }

  const customerHtml = customerConfirmationEmail(deliveryOrder).html
  assert.match(customerHtml, /Tu pedido llega entre el 3 y el 8 de septiembre\./)
  assert.doesNotMatch(customerHtml, /prepara|reposición|días hábiles/i)
  assert.match(adminNewOrderEmail(deliveryOrder).html, /Plazo interno de reposición/)
})
