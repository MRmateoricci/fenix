import { Router } from 'express'
import { pool } from '../db/pool.js'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import crypto from 'crypto'
import { releaseOrderStock } from '../services/stockReservation.js'
import { sendOrderConfirmationNotifications } from '../services/orderNotifications.js'
import { RELEASES_STOCK } from './orders.js'
import 'dotenv/config'

const router = Router()
const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN })

// ── Verifica la firma HMAC-SHA256 que envía MercadoPago ───────────────────────
// Docs: https://www.mercadopago.com.ar/developers/es/docs/notifications/webhooks
export function verifyMpSignature(req) {
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) return true // skip en dev si no está configurado

  const xSignature = req.headers['x-signature']
  const xRequestId = req.headers['x-request-id']
  if (!xSignature) return false

  const parts = {}
  xSignature.split(',').forEach((part) => {
    const [k, v] = part.trim().split('=')
    parts[k] = v
  })

  const ts     = parts['ts']
  const v1     = parts['v1']
  if (!ts || !v1) return false

  // Mercado Pago firma el `data.id` de la URL, no el que viene en el body.
  // Si un campo no está presente debe omitirse por completo del manifiesto.
  const requestUrl = new URL(req.originalUrl || req.url, 'http://localhost')
  const dataId = requestUrl.searchParams.get('data.id')
    || requestUrl.searchParams.get('data_id')

  const manifest = [
    dataId ? `id:${String(dataId).toLowerCase()};` : '',
    xRequestId ? `request-id:${xRequestId};` : '',
    `ts:${ts};`,
  ].join('')
  const expected = crypto
    .createHmac('sha256', secret)
    .update(manifest)
    .digest('hex')

  try {
    return crypto.timingSafeEqual(
      Buffer.from(v1   || '', 'hex'),
      Buffer.from(expected, 'hex')
    )
  } catch {
    return false
  }
}

// ── Mapea el estado de MP al estado interno de la orden ──────────────────────
function mapMpStatus(mpStatus) {
  if (mpStatus === 'approved')                          return 'paid'
  if (['rejected', 'cancelled'].includes(mpStatus))    return 'payment_failed'
  if (['pending', 'in_process', 'authorized'].includes(mpStatus)) return 'pending_payment'
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/mercadopago
// MercadoPago envía: { action: "payment.updated", type: "payment", data: { id: "12345" } }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/mercadopago', async (req, res) => {
  // Responder 200 rápido para que MP no reintente
  res.status(200).send('OK')

  const signatureValid = verifyMpSignature(req)
  if (!signatureValid) {
    // No confiamos en el contenido del webhook. De todos modos podemos usar
    // únicamente su ID como disparador y consultar el pago con nuestro access
    // token: la API de Mercado Pago será la fuente de verdad.
    console.warn('[webhook] Firma MP inválida — verificando el pago contra la API')
  }

  const requestUrl = new URL(req.originalUrl || req.url, 'http://localhost')
  const type = req.body?.type || requestUrl.searchParams.get('type')
  const paymentId = req.body?.data?.id
    || requestUrl.searchParams.get('data.id')
    || requestUrl.searchParams.get('data_id')

  if (type !== 'payment' || !paymentId) return

  try {
    const paymentApi = new Payment(mpClient)
    const mpPayment  = await paymentApi.get({ id: paymentId })

    const mpStatus      = mpPayment.status
    const externalRef   = mpPayment.external_reference  // UUID de la orden
    const mpPaymentId   = String(mpPayment.id)
    const newStatus     = mapMpStatus(mpStatus)

    if (!newStatus || !externalRef) return

    await pool.query(
      `UPDATE orders
       SET status        = $1,
           mp_payment_id = $2,
           mp_status     = $3,
           paid_at       = CASE WHEN $4 = 'paid' AND paid_at IS NULL THEN NOW() ELSE paid_at END
       WHERE id = $5`,
      [newStatus, mpPaymentId, mpStatus, newStatus, externalRef]
    )

    if (RELEASES_STOCK.includes(newStatus)) {
      await releaseOrderStock(externalRef)
    }
    if (newStatus === 'paid') {
      await sendOrderConfirmationNotifications(externalRef)
    }

    console.log(`[webhook] Orden ${externalRef} → ${newStatus} (MP: ${mpStatus})`)
  } catch (err) {
    console.error('[webhook] Error procesando notificación:', err)
  }
})

export default router
