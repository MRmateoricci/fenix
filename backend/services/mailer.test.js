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
