import { MercadoPagoConfig, Preference } from 'mercadopago'
import { roundMoney } from './bankTransfer.js'
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

export function buildBackUrls(returnBaseUrl, orderId) {
  return {
    success: `${returnBaseUrl}/order-confirmation?orderId=${orderId}&status=success`,
    failure: `${returnBaseUrl}/checkout?payment=failure&orderId=${orderId}`,
    pending: `${returnBaseUrl}/order-confirmation?orderId=${orderId}&status=pending`,
  }
}

// Líneas de producto de la preferencia. El cupón de descuento se guarda en el
// pedido pero se aplica sólo sobre los productos (nunca sobre el envío), así que
// hay que prorratearlo acá: si no, Checkout Pro cobra el precio de lista y el
// importe pagado deja de coincidir con orders.total_amount — y la conciliación
// del pago (mercadopagoPayments.js) rechaza ese pago por diferencia de monto,
// dejando el pedido sin marcar como pagado.
//
// El bloque de productos tiene que sumar exactamente `total_amount − envío`. Se
// prorratea en proporción al subtotal de cada línea, la última absorbe el
// redondeo, y cada línea va con quantity 1 (la cantidad viaja al título): el
// precio unitario prorrateado no siempre cae en centavos exactos, el total sí.
export function buildPreferenceItems(order) {
  const lines = (order.items || []).map((item) => ({
    id:        String(item.id),
    name:      item.name,
    quantity:  Number(item.quantity) || 1,
    unitPrice: Number(item.price) || 0,
  }))

  const discount = Math.max(0, Number(order.discount_amount) || 0)
  const gross = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)

  if (!discount || gross <= 0) {
    return lines.map((line) => ({
      id:          line.id,
      title:       line.name,
      quantity:    line.quantity,
      unit_price:  line.unitPrice,
      currency_id: 'ARS',
    }))
  }

  const shippingCost = Number(order.shipping_cost) || 0
  const netTarget = roundMoney((Number(order.total_amount) || 0) - shippingCost)
  if (netTarget <= 0) {
    throw new Error(
      'El pedido con el cupón aplicado no se puede cobrar por Mercado Pago: el total de productos quedó en cero',
    )
  }

  let allocated = 0
  return lines.map((line, index) => {
    const isLast = index === lines.length - 1
    const lineNet = isLast
      ? roundMoney(netTarget - allocated)
      : roundMoney((line.unitPrice * line.quantity / gross) * netTarget)
    if (!isLast) allocated = roundMoney(allocated + lineNet)
    return {
      id:          line.id,
      title:       line.quantity > 1 ? `${line.name} (x${line.quantity})` : line.name,
      quantity:    1,
      unit_price:  lineNet,
      currency_id: 'ARS',
    }
  })
}

export function buildPreferenceBody(order, { returnBaseUrl, webhookBaseUrl }, now = new Date()) {
  const nameParts = order.customer_name.split(' ')
  const firstName = nameParts[0]
  const lastName  = nameParts.slice(1).join(' ') || ''

  const items = buildPreferenceItems(order)

  // El envío se cobra como línea aparte — nunca metido dentro del precio de
  // los items, para no ensuciar el desglose que ve el cliente en MP y el
  // admin en el detalle del pedido. Se omite si es gratis o es retiro en local.
  if (order.shipping_cost) {
    items.push({
      id:          'shipping',
      title:       'Envío',
      quantity:    1,
      unit_price:  Number(order.shipping_cost),
      currency_id: 'ARS',
    })
  }

  const body = {
    external_reference: order.id,
    items,
    payer: {
      name: firstName,
      surname: lastName,
      email: order.customer_email,
      phone: { number: order.customer_phone },
      identification: order.customer_dni ? { type: 'DNI', number: order.customer_dni } : undefined,
    },
    // Un rechazo vuelve al paso de pago: el intento sigue siendo un dato
    // técnico, pero para el cliente no se transforma en un pedido fallido.
    back_urls: buildBackUrls(returnBaseUrl, order.id),
    auto_return: 'approved',
    // El negocio no acepta pedidos cuyo pago quede pendiente o en revisión:
    // Checkout Pro debe resolver cada intento inmediatamente como aprobado o
    // rechazado. Así un rechazo puede liberar la reserva en el mismo retorno.
    binary_mode: true,
    notification_url: `${webhookBaseUrl}/api/webhooks/mercadopago`,
    statement_descriptor: 'Fenix Electricidad',
  }

  // El link de pago deja de funcionar exactamente cuando el stock se libera
  // (misma fecha que reservation_expires_at), así nadie paga por stock que ya
  // volvió a estar disponible para otro cliente.
  if (order.reservation_expires_at) {
    body.expires = true
    body.expiration_date_from = now.toISOString()
    body.expiration_date_to   = new Date(order.reservation_expires_at).toISOString()
  }

  return body
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
  const urls = getMercadoPagoUrls()
  const body = buildPreferenceBody(order, urls)

  const result = await preference.create({ body })

  return {
    preferenceId:     result.id,
    initPoint:        result.init_point,
    sandboxInitPoint: result.sandbox_init_point,
  }
}
