import { MercadoPagoConfig, Preference } from 'mercadopago'
import 'dotenv/config'

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
})

/**
 * Crea una preferencia de Checkout Pro en MercadoPago.
 * @param {object} order - Fila de la tabla orders
 * @returns {{ preferenceId: string, initPoint: string, sandboxInitPoint: string }}
 */
export async function createPreference(order) {
  const preference = new Preference(client)

  const nameParts = order.customer_name.split(' ')
  const firstName = nameParts[0]
  const lastName  = nameParts.slice(1).join(' ') || ''

  const items = order.items.map((item) => ({
    id:         String(item.id),
    title:      item.name,
    quantity:   item.quantity,
    unit_price: Number(item.price),
    currency_id: 'ARS',
  }))

  // El envío se cobra como línea aparte — nunca metido dentro del precio de
  // los items, para no ensuciar el desglose que ve el cliente en MP y el
  // admin en el detalle del pedido. Se omite si es gratis o es retiro en local.
  if (order.shipping_cost) {
    items.push({
      id:         'shipping',
      title:      'Envío',
      quantity:   1,
      unit_price: Number(order.shipping_cost),
      currency_id: 'ARS',
    })
  }

  const body = {
    external_reference: order.id,
    items,
    payer: {
      name:  firstName,
      surname: lastName,
      email: order.customer_email,
      phone: { number: order.customer_phone },
    },
    back_urls: {
      success: `${process.env.FRONTEND_BASE_URL}/order-confirmation?orderId=${order.id}&status=success`,
      failure: `${process.env.FRONTEND_BASE_URL}/order-confirmation?orderId=${order.id}&status=failure`,
      pending: `${process.env.FRONTEND_BASE_URL}/order-confirmation?orderId=${order.id}&status=pending`,
    },
    auto_return: 'approved',
    notification_url: `${process.env.APP_BASE_URL}/api/webhooks/mercadopago`,
    statement_descriptor: 'Fenix Electricidad',
  }

  // El link de pago deja de funcionar exactamente cuando el stock se libera
  // (misma fecha que reservation_expires_at), así nadie paga por stock que ya
  // volvió a estar disponible para otro cliente.
  if (order.reservation_expires_at) {
    body.expires = true
    body.expiration_date_from = new Date().toISOString()
    body.expiration_date_to   = new Date(order.reservation_expires_at).toISOString()
  }

  const result = await preference.create({ body })

  return {
    preferenceId:     result.id,
    initPoint:        result.init_point,
    sandboxInitPoint: result.sandbox_init_point,
  }
}
