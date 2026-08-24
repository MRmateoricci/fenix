import nodemailer from 'nodemailer'
import 'dotenv/config'

let transporter = null
function getTransporter() {
  if (transporter) return transporter
  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return null
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  })
  return transporter
}

// ── sendMail — envío best-effort ─────────────────────────────────────────────
// Nunca tira: si no está configurado (o falla el envío), solo loguea. Un mail
// caído no debe tumbar la confirmación de una compra/reserva.
export async function sendMail({ to, subject, html }) {
  const t = getTransporter()
  if (!t) {
    console.warn('[mailer] GMAIL_USER/GMAIL_APP_PASSWORD no configurados — mail no enviado:', subject)
    return false
  }
  try {
    await t.sendMail({ from: `"Fénix Iluminación" <${process.env.GMAIL_USER}>`, to, subject, html })
    return true
  } catch (err) {
    console.error('[mailer] Error al enviar mail:', err.message)
    return false
  }
}

const fmt = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }) : null

function deliveryLine(order) {
  if (order.delivery_type === 'pickup') {
    const when = fmtDate(order.pickup_date)
    const pago = order.payment_method === 'pay_in_store' ? 'Pago en el local al retirar' : 'Pago ya realizado online'
    const pickupPerson = [order.pickup_person_name, order.pickup_person_last_name].filter(Boolean).join(' ')
    return `Retiro en local — 473 entre 14C y 15, City Bell${when ? ` el ${when}` : ''}. ${pago}.${pickupPerson ? ` Persona autorizada: ${pickupPerson}.` : ''}`
  }
  const when = fmtDate(order.estimated_delivery_date)
  const service = order.shipping_service ? ` ${order.shipping_service}` : ''
  return `Envío${service} a ${order.address}, ${order.city}${order.postal_code ? ` (CP ${order.postal_code})` : ''}${when ? ` — llega aprox. el ${when}` : ''}.`
}

function itemsRows(order) {
  return (order.items || [])
    .map((i) => `<tr><td style="padding:4px 8px">${i.name}${i.aPedido ? `<br><span style="font-size:11px;color:#8A5A00">A pedido · llega en ~${i.diasEntregaPedido} días hábiles</span>` : ''}</td><td style="padding:4px 8px">${i.quantity}</td><td style="padding:4px 8px">${fmt(i.subtotal)}</td></tr>`)
    .join('')
}

// Aviso agregado cuando el pedido incluye items a pedido — el plazo mostrado
// es el mayor entre esos items, no una suma (cada uno llega por su cuenta).
function aPedidoNotice(order) {
  const dias = (order.items || []).filter((i) => i.aPedido).map((i) => Number(i.diasEntregaPedido) || 0)
  if (!dias.length) return ''
  const maxDias = Math.max(...dias)
  return `<p style="background:#FDF0DC;color:#8A5A00;padding:10px 14px;border-radius:6px;">Este pedido incluye productos a pedido. El plazo de entrega es de hasta ${maxDias} días hábiles.</p>`
}

const appBaseUrl = () =>
  (process.env.FRONTEND_BASE_URL || process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, '')

const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

export function emailVerificationEmail({ firstName, token }) {
  const verifyUrl = `${appBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`
  return {
    subject: 'Confirmá tu email en Fénix Iluminación',
    html: `
      <div style="font-family:Arial,sans-serif;color:#16110B;line-height:1.6;max-width:560px">
        <h2>Confirmá tu dirección de email</h2>
        <p>Hola ${escapeHtml(firstName)}. Para comprobar que esta casilla es tuya, confirmala desde el siguiente botón.</p>
        <p style="margin:24px 0">
          <a href="${verifyUrl}" style="display:inline-block;background:#CC0000;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">
            Confirmar mi email
          </a>
        </p>
        <p style="font-size:13px;color:#6B6257">El enlace vence en 24 horas. Si no creaste esta cuenta, podés ignorar este mensaje.</p>
      </div>
    `,
  }
}

export function passwordResetEmail({ firstName, token }) {
  const resetUrl = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`
  return {
    subject: 'Restablecé tu contraseña de Fénix Iluminación',
    html: `
      <div style="font-family:Arial,sans-serif;color:#16110B;line-height:1.6;max-width:560px">
        <h2>Restablecer contraseña</h2>
        <p>Hola ${escapeHtml(firstName)}. Recibimos una solicitud para cambiar la contraseña de tu cuenta.</p>
        <p style="margin:24px 0">
          <a href="${resetUrl}" style="display:inline-block;background:#16110B;color:#fff;text-decoration:none;padding:12px 20px;border-radius:4px;font-weight:600">
            Crear una nueva contraseña
          </a>
        </p>
        <p style="font-size:13px;color:#6B6257">El enlace vence en una hora. Si no pediste este cambio, podés ignorar el mensaje.</p>
      </div>
    `,
  }
}

export function reviewInvitationEmail(order) {
  const uniqueItems = [...new Map(
    (order.items || []).filter((item) => item?.id).map((item) => [item.id, item])
  ).values()]

  const productLinks = uniqueItems.map((item) => {
    const reviewUrl = `${appBaseUrl()}/products/${encodeURIComponent(item.id)}#reviews`
    return `
      <div style="border-top:1px solid #E0DAD0;padding:14px 0">
        <strong>${escapeHtml(item.name || 'Producto')}</strong>
        <div style="margin-top:8px">
          <a href="${reviewUrl}" style="color:#CC0000;font-weight:600">Dejar una reseña</a>
        </div>
      </div>
    `
  }).join('')

  return {
    subject: `¿Qué te parecieron los productos de tu pedido ${order.order_number}?`,
    html: `
      <div style="font-family:Arial,sans-serif;color:#16110B;line-height:1.6;max-width:560px">
        <h2>Tu opinión nos ayuda mucho</h2>
        <p>Hola ${escapeHtml(order.customer_name)}. Como tu pedido <strong>${escapeHtml(order.order_number)}</strong> ya fue entregado, nos gustaría saber qué te parecieron los productos.</p>
        ${productLinks}
        <p style="font-size:13px;color:#6B6257">Para publicar la reseña, iniciá sesión con la cuenta que hizo el pedido.</p>
      </div>
    `,
  }
}

// ── Mail al cliente confirmando el pedido/reserva ────────────────────────────
export function customerConfirmationEmail(order) {
  const isReserved = order.status === 'reserved'
  const subject = isReserved
    ? `Reserva confirmada — pedido ${order.order_number}`
    : `Pedido confirmado — ${order.order_number}`

  const html = `
    <div style="font-family: sans-serif; color: #16110B;">
      <h2>${isReserved ? 'Tu reserva fue confirmada' : 'Gracias por tu compra'}</h2>
      <p>Pedido <strong>${order.order_number}</strong></p>
      <p>${deliveryLine(order)}</p>
      ${aPedidoNotice(order)}
      <table style="border-collapse: collapse; margin: 12px 0;">${itemsRows(order)}</table>
      <p><strong>Total: ${fmt(order.total_amount)}</strong>${order.shipping_cost ? ` (incluye envío ${fmt(order.shipping_cost)})` : ''}</p>
      <p>Ante cualquier consulta, escribinos por WhatsApp mencionando el número de pedido.</p>
    </div>
  `
  return { subject, html }
}

// ── Mail al admin avisando el pedido/reserva nueva ───────────────────────────
export function adminNewOrderEmail(order) {
  const subject = order.status === 'reserved'
    ? `Nueva reserva de retiro — ${order.order_number}`
    : `Nuevo pedido — ${order.order_number}`

  const html = `
    <div style="font-family: sans-serif; color: #16110B;">
      <h2>${order.status === 'reserved' ? 'Nueva reserva de retiro' : 'Nuevo pedido'}</h2>
      <p>Pedido <strong>${order.order_number}</strong> — ${order.customer_name} (${order.customer_email}, ${order.customer_phone})</p>
      <p>${deliveryLine(order)}</p>
      ${aPedidoNotice(order)}
      <table style="border-collapse: collapse; margin: 12px 0;">${itemsRows(order)}</table>
      <p><strong>Total: ${fmt(order.total_amount)}</strong></p>
      ${order.delivery_type === 'delivery'
        ? '<p><strong>Importante:</strong> confirmá que hay stock o conseguilo antes del próximo despacho de Correo Argentino.</p>'
        : '<p><strong>Importante:</strong> este stock ya está reservado — no lo vendas en el local.</p>'}
    </div>
  `
  return { subject, html }
}
