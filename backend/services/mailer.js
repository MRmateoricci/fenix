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
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }) : null

const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('es-AR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null

// Ventana de entrega. Los pedidos anteriores al cambio de modelo tienen sólo
// `estimated_delivery_date` y siguen mostrándose con esa fecha única.
function parseDeliveryDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day)
  }
  return new Date(value)
}

const fmtDiaMes = (d) =>
  parseDeliveryDate(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })

function ventanaEntrega(order) {
  const desde = order.estimated_delivery_date
  const hasta = order.estimated_delivery_max_date
  if (!desde && !hasta) return null
  if (!desde || !hasta) return `el ${fmtDiaMes(desde || hasta)}`
  const a = parseDeliveryDate(desde)
  const b = parseDeliveryDate(hasta)
  if (a.getTime() === b.getTime()) return `el ${fmtDiaMes(a)}`
  const mismoMes = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
  return mismoMes
    ? `entre el ${a.getDate()} y el ${fmtDiaMes(b)}`
    : `entre el ${fmtDiaMes(a)} y el ${fmtDiaMes(b)}`
}

function deliveryLine(order) {
  if (order.delivery_type === 'pickup') {
    const when = fmtDate(order.pickup_date)
    const pago = order.payment_method === 'pay_in_store' ? 'Pago en el local al retirar' : 'Pago ya realizado online'
    const pickupPerson = [order.pickup_person_name, order.pickup_person_last_name].filter(Boolean).join(' ')
    return `Retiro en local — 473 entre 14C y 15, City Bell${when ? ` el ${when}` : ''}. ${pago}.${pickupPerson ? ` Persona autorizada: ${pickupPerson}.` : ''}`
  }
  const when = ventanaEntrega(order)
  const service = order.shipping_service ? ` ${order.shipping_service}` : ''
  return `Envío${service} a ${order.address}, ${order.city}${order.postal_code ? ` (CP ${order.postal_code})` : ''}.${when ? ` Tu pedido llega ${when}.` : ''}`
}

// `flagRepuestos` marca item por item cuáles hay que traer del proveedor. Sólo
// se usa en el mail del admin, que es quien tiene que salir a conseguirlos; al
// cliente esa distinción no le sirve de nada — a él le importa una sola fecha.
function itemsRows(order, { flagRepuestos = false } = {}) {
  return (order.items || [])
    .map((i) => {
      const aviso = flagRepuestos && i.aPedido
        ? `<br><span style="font-size:11px;color:#8A5A00">Hay que pedirlo al proveedor (~${i.diasEntregaPedido} días hábiles)</span>`
        : ''
      return `<tr><td style="padding:4px 8px">${i.name}${aviso}</td><td style="padding:4px 8px">${i.quantity}</td><td style="padding:4px 8px">${fmt(i.subtotal)}</td></tr>`
    })
    .join('')
}

// Dato operativo exclusivo del mail interno: no se incluye en comunicaciones
// al cliente, que recibe únicamente la ventana final de llegada.
function adminPreparationNotice(order) {
  const dias = (order.items || []).filter((i) => i.aPedido).map((i) => Number(i.diasEntregaPedido) || 0)
  if (!dias.length) return ''
  const maxDias = Math.max(...dias)
  return `<p style="background:#FDF0DC;color:#8A5A00;padding:10px 14px;border-radius:6px;">Plazo interno de reposición: hasta ${maxDias} días hábiles.</p>`
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
      <table style="border-collapse: collapse; margin: 12px 0;">${itemsRows(order)}</table>
      ${Number(order.transfer_discount_amount || 0) > 0 ? `<p>Descuento por transferencia: -${fmt(order.transfer_discount_amount)}</p>` : ''}
      ${Number(order.discount_amount || 0) > 0 ? `<p>Descuento${order.coupon_code ? ` (${escapeHtml(order.coupon_code)})` : ''}: -${fmt(order.discount_amount)}</p>` : ''}
      <p><strong>Total: ${fmt(order.total_amount)}</strong>${order.shipping_cost ? ` (incluye envío ${fmt(order.shipping_cost)})` : ''}</p>
      <p>Ante cualquier consulta, escribinos por WhatsApp mencionando el número de pedido.</p>
    </div>
  `
  return { subject, html }
}

export function bankTransferInstructionsEmail(order, accessToken) {
  const bank = order.bank_transfer_snapshot || {}
  const accountUrl = order.user_id
    ? `${appBaseUrl()}/orders/${encodeURIComponent(order.id)}`
    : `${appBaseUrl()}/order-confirmation?orderId=${encodeURIComponent(order.id)}&status=transfer#${encodeURIComponent(accessToken)}`
  return {
    subject: `Datos para transferir — pedido ${order.order_number}`,
    html: `<div style="font-family:Arial,sans-serif;color:#16110B;line-height:1.6;max-width:600px">
      <h2>Tu pedido fue recibido</h2>
      <p>Transferí el importe exacto y luego cargá un comprobante. El pedido quedará pendiente hasta que verifiquemos el ingreso.</p>
      <p><strong>CBU:</strong> ${escapeHtml(bank.cbu)}<br>
      <strong>Alias:</strong> ${escapeHtml(bank.alias)}<br>
      <strong>Titular:</strong> ${escapeHtml(bank.accountHolder)}<br>
      <strong>Importe:</strong> ${fmt(order.total_amount)}<br>
      <strong>Pedido:</strong> ${escapeHtml(order.order_number)}<br>
      <strong>Vencimiento:</strong> ${escapeHtml(fmtDateTime(order.reservation_expires_at))}</p>
      <p>La cuenta de origen puede estar a nombre de cualquier persona; al cargar el comprobante informá su titular real.</p>
      <p><a href="${accountUrl}" style="display:inline-block;background:#CC0000;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Cargar comprobante</a></p>
    </div>`,
  }
}

export function bankTransferSubmittedAdminEmail(order, submission) {
  return {
    subject: `Transferencia por revisar — ${order.order_number}`,
    html: `<div style="font-family:Arial,sans-serif;color:#16110B;line-height:1.6">
      <h2>Nuevo comprobante bancario</h2>
      <p>Pedido <strong>${escapeHtml(order.order_number)}</strong> de ${escapeHtml(order.customer_name)}.</p>
      <p>Importe esperado: <strong>${fmt(order.total_amount)}</strong><br>Titular de origen informado: <strong>${escapeHtml(submission.payer_account_holder)}</strong></p>
      <p>Ingresá al panel administrativo para descargar el archivo y verificar el ingreso bancario.</p>
    </div>`,
  }
}

export function bankTransferRejectedEmail(order, reason, accessToken) {
  const resubmitUrl = order.user_id
    ? `${appBaseUrl()}/orders/${encodeURIComponent(order.id)}`
    : accessToken
      ? `${appBaseUrl()}/order-confirmation?orderId=${encodeURIComponent(order.id)}&status=transfer#${encodeURIComponent(accessToken)}`
      : null
  return {
    subject: `Revisá tu comprobante — pedido ${order.order_number}`,
    html: `<div style="font-family:Arial,sans-serif;color:#16110B;line-height:1.6">
      <h2>No pudimos validar la transferencia</h2>
      <p>Pedido <strong>${escapeHtml(order.order_number)}</strong>.</p>
      <p>Motivo: <strong>${escapeHtml(reason)}</strong></p>
      <p>Si el plazo todavía está vigente, podés enviar otro comprobante.</p>
      ${resubmitUrl ? `<p><a href="${resubmitUrl}" style="display:inline-block;background:#CC0000;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Enviar otro comprobante</a></p>` : ''}
    </div>`,
  }
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
      ${adminPreparationNotice(order)}
      <table style="border-collapse: collapse; margin: 12px 0;">${itemsRows(order, { flagRepuestos: true })}</table>
      ${Number(order.transfer_discount_amount || 0) > 0 ? `<p>Descuento por transferencia: -${fmt(order.transfer_discount_amount)}</p>` : ''}
      <p><strong>Total: ${fmt(order.total_amount)}</strong></p>
      ${order.delivery_type === 'delivery'
        ? '<p><strong>Importante:</strong> separá la mercadería o pedila al proveedor antes del próximo despacho de Correo Argentino.</p>'
        : '<p><strong>Importante:</strong> separá esta mercadería para el retiro — no la vendas en el local.</p>'}
    </div>
  `
  return { subject, html }
}
