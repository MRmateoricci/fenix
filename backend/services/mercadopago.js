import { MercadoPagoConfig, Preference } from 'mercadopago'
import 'dotenv/config'

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
})

function parseBaseUrl(value, variableName) {
  const raw = value?.trim().replace(/\/+$/, '')
  if (!raw) throw new Error(`${variableName} no está configurada`)

  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`${variableName} debe ser una URL absoluta válida`)
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${variableName} debe usar http o https`)
  }

  return { value: raw, url }
}

function isLocalUrl(url) {
  return ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
}

function getMercadoPagoUrls() {
  const appBase = parseBaseUrl(process.env.APP_BASE_URL, 'APP_BASE_URL')
  const frontendBase = parseBaseUrl(process.env.FRONTEND_BASE_URL, 'FRONTEND_BASE_URL')

  // Mercado Pago no acepta localhost/127.0.0.1 en back_urls. Durante el
  // desarrollo usamos el túnel público del backend como puente y Express
  // redirige luego al frontend local (ver backend/index.js).
  const returnBase = isLocalUrl(frontendBase.url) ? appBase : frontendBase

  if (isLocalUrl(returnBase.url)) {
    throw new Error(
      'Mercado Pago necesita una URL pública para regresar al sitio. Configurá APP_BASE_URL con HTTPS (por ejemplo, ngrok).'
    )
  }

  if (returnBase.url.protocol !== 'https:') {
    throw new Error('La URL pública de retorno de Mercado Pago debe usar HTTPS')
  }

  if (isLocalUrl(appBase.url)) {
    throw new Error(
      'Mercado Pago necesita una URL pública para el webhook. Configurá APP_BASE_URL con HTTPS (por ejemplo, ngrok).'
    )
  }
  if (appBase.url.protocol !== 'https:') {
    throw new Error('APP_BASE_URL debe usar HTTPS para recibir notificaciones de Mercado Pago')
  }

  return {
    returnBaseUrl: returnBase.value,
    webhookBaseUrl: appBase.value,
  }
}

/**
 * Crea una preferencia de Checkout Pro en MercadoPago.
 * @param {object} order - Fila de la tabla orders
 * @returns {{ preferenceId: string, initPoint: string, sandboxInitPoint: string }}
 */
export async function createPreference(order) {
  const preference = new Preference(client)
  const { returnBaseUrl, webhookBaseUrl } = getMercadoPagoUrls()

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
      identification: order.customer_dni ? { type: 'DNI', number: order.customer_dni } : undefined,
    },
    back_urls: {
      success: `${returnBaseUrl}/order-confirmation?orderId=${order.id}&status=success`,
      failure: `${returnBaseUrl}/order-confirmation?orderId=${order.id}&status=failure`,
      pending: `${returnBaseUrl}/order-confirmation?orderId=${order.id}&status=pending`,
    },
    auto_return: 'approved',
    notification_url: `${webhookBaseUrl}/api/webhooks/mercadopago`,
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
