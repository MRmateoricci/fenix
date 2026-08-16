import { Router } from 'express'
import crypto from 'crypto'
import {
  PaymentReconciliationError,
  reconcileMercadoPagoPayment,
} from '../services/mercadopagoPayments.js'
import 'dotenv/config'

const router = Router()

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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/mercadopago
// MercadoPago envía: { action: "payment.updated", type: "payment", data: { id: "12345" } }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/mercadopago', async (req, res) => {
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

  if (type !== 'payment' || !paymentId) return res.status(200).send('OK')

  try {
    await reconcileMercadoPagoPayment({ paymentId })
    // La conciliación ya confirmó y persistió el pago. La emisión ARCA
    // quedó solamente encolada y se ejecuta fuera de este request.
    return res.status(200).send('OK')
  } catch (err) {
    console.error(`[webhook] payment=${paymentId} status=error code=${err.code || err.name}`)
    if (err instanceof PaymentReconciliationError) return res.status(200).send('IGNORED')
    return res.status(500).send('RETRY')
  }
})

export default router
