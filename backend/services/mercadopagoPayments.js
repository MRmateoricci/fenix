import { MercadoPagoConfig, Payment } from 'mercadopago'
import { pool } from '../db/pool.js'
import { releaseOrderStock } from './stockReservation.js'
import { sendOrderConfirmationNotifications } from './orderNotifications.js'
import { scheduleInvoiceForApprovedPayment } from '../jobs/arcaInvoices.js'
import 'dotenv/config'

const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN })
const PAID_ORDER_STATUSES = ['paid', 'preparing', 'shipped', 'delivered']

export class PaymentReconciliationError extends Error {
  constructor(message, statusCode = 400) {
    super(message)
    this.name = 'PaymentReconciliationError'
    this.statusCode = statusCode
  }
}

export function mapMpStatus(mpStatus) {
  if (mpStatus === 'approved') return 'paid'
  if (['rejected', 'cancelled'].includes(mpStatus)) return 'payment_failed'
  if (['refunded', 'charged_back'].includes(mpStatus)) return 'cancelled'
  if (['pending', 'in_process', 'authorized'].includes(mpStatus)) return 'pending_payment'
  return null
}

function amountsMatch(left, right) {
  const leftCents = Math.round(Number(left) * 100)
  const rightCents = Math.round(Number(right) * 100)
  return Number.isFinite(leftCents) && Number.isFinite(rightCents) && leftCents === rightCents
}

/**
 * Consulta el pago con las credenciales privadas del comercio y sincroniza la
 * orden. Nunca confia en el estado recibido por la URL de retorno o el webhook.
 */
export async function reconcileMercadoPagoPayment({ paymentId, expectedOrderId = null }) {
  if (!/^\d{6,30}$/.test(String(paymentId || ''))) {
    throw new PaymentReconciliationError('Identificador de pago invalido')
  }

  const paymentApi = new Payment(mpClient)
  const mpPayment = await paymentApi.get({ id: String(paymentId) })
  const externalReference = String(mpPayment.external_reference || '')
  const mpStatus = String(mpPayment.status || '')
  const newStatus = mapMpStatus(mpStatus)

  if (!externalReference || !newStatus) {
    throw new PaymentReconciliationError('El pago no tiene una orden o estado reconocible', 409)
  }
  if (expectedOrderId && externalReference !== String(expectedOrderId)) {
    throw new PaymentReconciliationError('El pago no corresponde a esta orden', 409)
  }

  const client = await pool.connect()
  let order
  try {
    await client.query('BEGIN')

    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
      [externalReference]
    )
    order = orderResult.rows[0]
    if (!order) {
      throw new PaymentReconciliationError('Pedido no encontrado', 404)
    }
    if (order.payment_method !== 'mercadopago') {
      throw new PaymentReconciliationError('El pedido no usa Mercado Pago', 409)
    }
    if (String(mpPayment.currency_id || '').toUpperCase() !== 'ARS') {
      throw new PaymentReconciliationError('La moneda del pago no coincide con la orden', 409)
    }
    if (!amountsMatch(mpPayment.transaction_amount, order.total_amount)) {
      throw new PaymentReconciliationError('El importe del pago no coincide con la orden', 409)
    }

    const duplicatePayment = await client.query(
      `SELECT id FROM orders
       WHERE mp_payment_id = $1 AND id <> $2
       LIMIT 1`,
      [String(mpPayment.id), externalReference]
    )
    if (duplicatePayment.rows.length) {
      throw new PaymentReconciliationError('El pago ya esta asociado a otro pedido', 409)
    }

    // Una notificacion atrasada de pendiente/rechazado nunca debe degradar una
    // orden cuyo pago ya fue confirmado o que ya avanzo en la preparacion.
    const effectiveStatus = PAID_ORDER_STATUSES.includes(order.status) && newStatus !== 'paid'
      ? order.status
      : (newStatus === 'paid' && PAID_ORDER_STATUSES.includes(order.status)
          ? order.status
          : newStatus)

    const updated = await client.query(
      `UPDATE orders
       SET status = $1,
           mp_payment_id = $2,
           mp_status = $3,
           paid_at = CASE WHEN $4 = 'paid' AND paid_at IS NULL THEN NOW() ELSE paid_at END
       WHERE id = $5
       RETURNING *`,
      [effectiveStatus, String(mpPayment.id), mpStatus, newStatus, externalReference]
    )
    order = updated.rows[0]

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  // La cola es una escritura local, deduplicada por order_id. Cualquier falla
  // al programarla se registra pero nunca revierte el pago ni hace fallar el
  // webhook. El worker es quien se conecta con ARCA fuera de este request.
  try {
    const scheduled = await scheduleInvoiceForApprovedPayment({ order, payment: mpPayment })
    if (scheduled.scheduled) {
      console.info(`[mercadopago] Factura programada order=${order.id} payment=${mpPayment.id}`)
    }
  } catch (error) {
    console.error(`[mercadopago] No se pudo programar la factura order=${order.id} code=${error.code || error.name}`)
  }

  if (order.status === 'payment_failed') {
    await releaseOrderStock(order.id).catch((error) => {
      console.error(`[mercadopago] No se pudo liberar stock order=${order.id} code=${error.code || error.name}`)
    })
  }
  if (PAID_ORDER_STATUSES.includes(order.status)) {
    await sendOrderConfirmationNotifications(order.id).catch((error) => {
      console.error(`[mercadopago] No se pudo enviar notificación order=${order.id} code=${error.code || error.name}`)
    })
  }

  console.log(`[mercadopago] Orden ${order.id} -> ${order.status} (MP: ${mpStatus})`)
  return { order, payment: mpPayment }
}
