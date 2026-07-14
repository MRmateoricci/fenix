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
    return
  }
  try {
    await t.sendMail({ from: `"Fénix Iluminación" <${process.env.GMAIL_USER}>`, to, subject, html })
  } catch (err) {
    console.error('[mailer] Error al enviar mail:', err.message)
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
    return `Retiro en local — 473 entre 14C y 15, City Bell${when ? ` el ${when}` : ''}. ${pago}.`
  }
  const when = fmtDate(order.estimated_delivery_date)
  return `Envío a ${order.address}, ${order.city}${order.postal_code ? ` (CP ${order.postal_code})` : ''}${when ? ` — llega aprox. el ${when}` : ''}.`
}

function itemsRows(order) {
  return (order.items || [])
    .map((i) => `<tr><td style="padding:4px 8px">${i.name}</td><td style="padding:4px 8px">${i.quantity}</td><td style="padding:4px 8px">${fmt(i.subtotal)}</td></tr>`)
    .join('')
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
      <table style="border-collapse: collapse; margin: 12px 0;">${itemsRows(order)}</table>
      <p><strong>Total: ${fmt(order.total_amount)}</strong></p>
      ${order.delivery_type === 'delivery'
        ? '<p><strong>Importante:</strong> confirmá que hay stock o conseguilo antes del próximo despacho de Correo Argentino.</p>'
        : '<p><strong>Importante:</strong> este stock ya está reservado — no lo vendas en el local.</p>'}
    </div>
  `
  return { subject, html }
}
