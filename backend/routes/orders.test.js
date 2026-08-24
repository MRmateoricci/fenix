import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRetryCheckoutData, CUSTOMER_ORDER_STATUSES, resolveProductVariantPrice } from './orders.js'

test('Mi cuenta solo considera pedidos confirmados', () => {
  assert.deepEqual(CUSTOMER_ORDER_STATUSES, ['reserved', 'paid', 'preparing', 'shipped', 'delivered'])
  assert.equal(CUSTOMER_ORDER_STATUSES.includes('pending_payment'), false)
  assert.equal(CUSTOMER_ORDER_STATUSES.includes('payment_failed'), false)
  assert.equal(CUSTOMER_ORDER_STATUSES.includes('expired'), false)
})

test('el reintento autenticado reconstruye facturación y dirección completas', () => {
  const data = buildRetryCheckoutData({
    customer_name: 'Mateo José Ricci', account_first_name: 'Mateo José', account_last_name: 'Ricci',
    customer_email: 'mateo@example.com', customer_phone: '2213628621',
    invoice_recipient_name: 'Mateo Ricci', invoice_doc_type: 96, invoice_doc_number: '42172999',
    invoice_vat_condition_id: 5, delivery_type: 'delivery', payment_method: 'mercadopago',
    shipping_service: 'expreso', address: 'Calle 10 123', address_extra: '2 B', city: 'La Plata',
    postal_code: '1900', province: 'Buenos Aires', billing_same_as_shipping: false,
    billing_address: 'Calle 20 456', billing_address_extra: 'PB', billing_city: 'City Bell',
    billing_postal_code: '1896', billing_province: 'Buenos Aires',
  })

  assert.deepEqual(data, {
    nombre: 'Mateo José', apellido: 'Ricci', email: 'mateo@example.com', telefono: '2213628621',
    invoiceName: 'Mateo Ricci', invoiceDocType: '96', invoiceDocNumber: '42172999', invoiceVatConditionId: '5',
    deliveryType: 'delivery', paymentMethod: 'mercadopago', shippingService: 'expreso', pickupDate: '',
    direccion: 'Calle 10 123', piso: '2 B', ciudad: 'La Plata', codigoPostal: '1900', provincia: 'Buenos Aires',
    billingSameAsShipping: false, billingAddress: 'Calle 20 456', billingAddressExtra: 'PB',
    billingCity: 'City Bell', billingPostalCode: '1896', billingProvince: 'Buenos Aires',
  })
})

test('el pedido usa el precio con IVA del producto', () => {
  const result = resolveProductVariantPrice({
    precio_venta: 100,
    precio_iva: 125,
    price_currency: 'ARS',
  })

  assert.equal(result.price, 125)
})

test('el pedido calcula el 21 % cuando falta IVA', () => {
  const result = resolveProductVariantPrice({
    precio_venta: 100,
    precio_iva: null,
    price_currency: 'ARS',
  })

  assert.equal(result.price, 121)
})

test('el pedido usa IVA explícito y fallback en reglas de variantes', () => {
  const product = {
    precio_venta: 100,
    precio_iva: 121,
    price_currency: 'ARS',
    variant_rules: [
      { id: '10', size_label: '10 mm', precio_venta: 200, precio_iva: 250, price_currency: 'ARS' },
      { id: '20', size_label: '20 mm', precio_venta: 300, precio_iva: null, price_currency: 'ARS' },
    ],
  }

  assert.equal(resolveProductVariantPrice(product, null, '10 mm', null).price, 250)
  assert.equal(resolveProductVariantPrice(product, null, '20 mm', null).price, 363)
})

test('el pedido aplica la misma regla a variantes heredadas', () => {
  const result = resolveProductVariantPrice({
    precio_venta: 100,
    precio_iva: 121,
    price_currency: 'ARS',
    size_options: [{ label: '10 mm', price: 200 }],
  }, null, '10 mm', null)

  assert.equal(result.price, 242)
})
