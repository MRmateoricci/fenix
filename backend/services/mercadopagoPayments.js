import { MercadoPagoConfig, MerchantOrder, Payment } from 'mercadopago'
import { pool } from '../db/pool.js'
import { releaseOrderStock } from './stockReservation.js'
import { sendOrderConfirmationNotifications } from './orderNotifications.js'
import { attemptAutomaticInvoiceForApprovedPayment } from './invoiceAttempts.js'
import 'dotenv/config'

const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN })
const PAID_ORDER_STATUSES = ['paid', 'preparing', 'shipped', 'delivered']
const merchantOrderApi = new MerchantOrder(mpClient)
const paymentApi = new Payment(mpClient)

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

export function shouldCountCouponUsage(order, newStatus) {
  return newStatus === 'paid' && Boolean(order?.coupon_code) && !order?.coupon_usage_counted_at
}

function validPaymentId(value) {
  return /^\d{6,30}$/.test(String(value || ''))
}

export function selectMerchantOrderPayment(merchantOrder, { expectedOrderId, expectedPreferenceId = null }) {
  if (String(merchantOrder?.external_reference || '') !== String(expectedOrderId || '')) {
    throw new PaymentReconciliationError('La orden de Mercado Pago no corresponde a este pedido', 409)
  }
  if (expectedPreferenceId && String(merchantOrder?.preference_id || '') !== String(expectedPreferenceId)) {
    throw new PaymentReconciliationError('La preferencia de Mercado Pago no corresponde a este pedido', 409)
  }

  const statusPriority = {
    approved: 4,
    pending: 3,
    in_process: 3,
    authorized: 3,
    rejected: 2,
    cancelled: 2,
    refunded: 1,
    charged_back: 1,
  }
  return (Array.isArray(merchantOrder?.payments) ? merchantOrder.payments : [])
    .filter((payment) => validPaymentId(payment?.id) && statusPriority[payment?.status])
    .sort((left, right) => {
      const byStatus = statusPriority[right.status] - statusPriority[left.status]
      if (byStatus) return byStatus
      return String(right.last_modified || right.date_created || '')
        .localeCompare(String(left.last_modified || left.date_created || ''))
    })[0] || null
}

/**
 * El retorno failure de Checkout Pro a veces no trae payment_id, pero sí el
 * merchant_order_id. Consultamos esa orden con las credenciales privadas y
 * recién entonces conciliamos el pago real asociado.
 */
export async function reconcileMercadoPagoReturn({
  paymentId,
  merchantOrderId,
  expectedOrderId,
  expectedPreferenceId = null,
}, {
  getMerchantOrder = (id) => merchantOrderApi.get({ merchantOrderId: id }),
  searchPayments = (externalReference) => paymentApi.search({ options: { external_reference: externalReference, limit: 10 } }),
  reconcilePayment = reconcileMercadoPagoPayment,
} = {}) {
  if (validPaymentId(paymentId)) {
    return reconcilePayment({ paymentId: String(paymentId), expectedOrderId })
  }
  let payment = null
  if (/^\d{3,30}$/.test(String(merchantOrderId || ''))) {
    const merchantOrder = await getMerchantOrder(String(merchantOrderId))
    payment = selectMerchantOrderPayment(merchantOrder, { expectedOrderId, expectedPreferenceId })
  } else {
    const search = await searchPayments(String(expectedOrderId))
    payment = selectMerchantOrderPayment({
      external_reference: expectedOrderId,
      payments: search?.results,
    }, { expectedOrderId })
  }
  if (!payment) {
    throw new PaymentReconciliationError('Mercado Pago todavía no informó el resultado del pago', 409)
  }
  return reconcilePayment({ paymentId: String(payment.id), expectedOrderId })
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
  if (!validPaymentId(paymentId)) {
    throw new PaymentReconciliationError('Identificador de pago invalido')
  }

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

    // Un intento rechazado no consume el cupón. La contabilización ocurre una
    // sola vez, al confirmar el pago, dentro del mismo lock de la orden.
    if (shouldCountCouponUsage(order, newStatus)) {
      await client.query(
        `UPDATE coupons
         SET times_used = times_used + 1
         WHERE UPPER(code) = UPPER($1)`,
        [order.coupon_code]
      )
      const counted = await client.query(
        `UPDATE orders
         SET coupon_usage_counted_at = NOW()
         WHERE id = $1 AND coupon_usage_counted_at IS NULL
         RETURNING *`,
        [externalReference]
      )
      order = counted.rows[0] || order
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  // El pago ya quedó confirmado y persistido. La factura se intenta en este
  // mismo flujo, con un límite de espera. Cualquier falla ARCA queda registrada
  // y jamás revierte el pago, el pedido, el stock ni hace fallar el webhook.
  let invoiceAttempt = null
  try {
    invoiceAttempt = await attemptAutomaticInvoiceForApprovedPayment({ order, payment: mpPayment })
    if (invoiceAttempt.timedOut) {
      console.warn(`[mercadopago] Factura continúa en proceso order=${order.id} payment=${mpPayment.id} code=${invoiceAttempt.code}`)
    } else if (invoiceAttempt.attempted) {
      console.info(`[mercadopago] Intento de factura finalizado order=${order.id} payment=${mpPayment.id} status=${invoiceAttempt.status}`)
    }
  } catch (error) {
    console.error(`[mercadopago] Falló el intento de factura order=${order.id} code=${error.code || error.name}`)
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
  return { order, payment: mpPayment, invoiceAttempt }
}
