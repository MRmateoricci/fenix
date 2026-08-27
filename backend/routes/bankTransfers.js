import crypto from 'crypto'
import path from 'path'
import { unlink, writeFile } from 'fs/promises'
import { Router } from 'express'
import multer from 'multer'
import { pool } from '../db/pool.js'
import { attachUserIfPresent } from '../middleware/requireAuth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { transferProofsDir } from '../config/transferProofs.js'
import {
  MAX_TRANSFER_PROOF_BYTES,
  accessTokenMatches,
  createCustomerAccessToken,
  detectProofMime,
  hashCustomerAccessToken,
  normalizeBankTransferSettings,
  roundMoney,
  transferDisplayStatus,
  validateBankTransferSettings,
} from '../services/bankTransfer.js'
import { countCouponUsageOnce } from '../services/orderPayment.js'
import {
  sendBankTransferRejectedNotification,
  sendBankTransferSubmittedNotification,
  sendOrderConfirmationNotifications,
} from '../services/orderNotifications.js'
import { attemptAutomaticInvoiceForConfirmedBankTransfer } from '../services/invoiceAttempts.js'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_TRANSFER_PROOF_BYTES, files: 1 },
})

const SETTINGS_COLUMNS = `bank_transfer_enabled, bank_transfer_discount_percent,
  bank_transfer_expiry_hours, bank_transfer_cbu, bank_transfer_alias,
  bank_transfer_account_holder`

async function loadSettings(client = pool) {
  const { rows } = await client.query(`SELECT ${SETTINGS_COLUMNS} FROM store_settings WHERE id = 1`)
  return normalizeBankTransferSettings(rows[0])
}

function publicSubmission(row) {
  if (!row) return null
  return {
    id: row.id,
    attempt: row.attempt_number,
    payerAccountHolder: row.payer_account_holder,
    originalName: row.proof_original_name,
    mime: row.proof_mime_type,
    size: Number(row.proof_size_bytes),
    status: row.status,
    rejectionReason: row.rejection_reason,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
  }
}

async function customerCanAccess(req, order, client = pool) {
  if (req.userId && order.user_id && String(req.userId) === String(order.user_id)) return true
  const token = req.get('x-order-access-token')
  if (accessTokenMatches(token, order.customer_access_token_hash)) return true
  if (!token) return false
  const { rows } = await client.query(
    `SELECT 1 FROM bank_transfer_guest_tokens
     WHERE order_id = $1 AND token_hash = $2 AND expires_at > NOW()
     LIMIT 1`,
    [order.id, hashCustomerAccessToken(token)],
  )
  return Boolean(rows.length)
}

async function loadTransferOrder(orderId, client = pool, { lock = false } = {}) {
  const { rows } = await client.query(
    `SELECT o.*
     FROM orders o
     WHERE o.id = $1 AND o.payment_method = 'bank_transfer'
     ${lock ? 'FOR UPDATE' : ''}`,
    [orderId],
  )
  return rows[0] || null
}

async function loadSubmissions(orderId, client = pool) {
  const { rows } = await client.query(
    `SELECT * FROM bank_transfer_submissions
     WHERE order_id = $1
     ORDER BY attempt_number DESC`,
    [orderId],
  )
  return rows
}

router.get('/settings', requireAdmin, async (_req, res) => {
  try {
    res.set('Cache-Control', 'no-store')
    res.json(await loadSettings())
  } catch (error) {
    console.error('Error consultando configuracion de transferencia:', error.message)
    res.status(500).json({ error: 'No se pudo consultar la configuracion' })
  }
})

router.patch('/settings', requireAdmin, async (req, res) => {
  try {
    const current = await loadSettings()
    const settings = normalizeBankTransferSettings({
      bank_transfer_enabled: req.body?.enabled ?? current.enabled,
      bank_transfer_discount_percent: req.body?.discountPercent ?? current.discountPercent,
      bank_transfer_expiry_hours: req.body?.expiryHours ?? current.expiryHours,
      bank_transfer_cbu: req.body?.cbu ?? current.cbu,
      bank_transfer_alias: req.body?.alias ?? current.alias,
      bank_transfer_account_holder: req.body?.accountHolder ?? current.accountHolder,
    })
    const validationError = validateBankTransferSettings(settings)
    if (validationError) return res.status(400).json({ error: validationError })

    const { rows } = await pool.query(
      `UPDATE store_settings
       SET bank_transfer_enabled = $1,
           bank_transfer_discount_percent = $2,
           bank_transfer_expiry_hours = $3,
           bank_transfer_cbu = $4,
           bank_transfer_alias = $5,
           bank_transfer_account_holder = $6,
           updated_at = NOW()
       WHERE id = 1
       RETURNING ${SETTINGS_COLUMNS}`,
      [settings.enabled, settings.discountPercent, settings.expiryHours,
        settings.cbu || null, settings.alias || null, settings.accountHolder || null],
    )
    res.json(normalizeBankTransferSettings(rows[0]))
  } catch (error) {
    console.error('Error guardando configuracion de transferencia:', error.message)
    res.status(500).json({ error: 'No se pudo guardar la configuracion' })
  }
})

router.get('/orders/:orderId', attachUserIfPresent, async (req, res) => {
  try {
    const order = await loadTransferOrder(req.params.orderId)
    if (!order || !(await customerCanAccess(req, order))) return res.status(404).json({ error: 'Pedido no encontrado' })
    const submissions = await loadSubmissions(order.id)
    const latest = submissions[0] || null
    const snapshot = order.bank_transfer_snapshot || {}
    res.set('Cache-Control', 'no-store')
    res.json({
      orderId: order.id,
      orderNumber: order.order_number,
      orderStatus: order.status,
      transferStatus: transferDisplayStatus(order, latest),
      total: Number(order.total_amount),
      expiresAt: order.reservation_expires_at,
      bank: {
        cbu: snapshot.cbu,
        alias: snapshot.alias,
        accountHolder: snapshot.accountHolder,
      },
      submissions: submissions.map(publicSubmission),
    })
  } catch (error) {
    console.error('Error consultando transferencia:', error.message)
    res.status(500).json({ error: 'No se pudo consultar la transferencia' })
  }
})

router.post('/orders/:orderId/submissions', attachUserIfPresent, upload.single('proof'), async (req, res) => {
  const payerAccountHolder = String(req.body?.payerAccountHolder || '').trim()
  if (payerAccountHolder.length < 2 || payerAccountHolder.length > 160) {
    return res.status(400).json({ error: 'El titular de origen debe tener entre 2 y 160 caracteres' })
  }
  if (!req.file) return res.status(400).json({ error: 'Adjunta un comprobante' })

  const actualMime = detectProofMime(req.file.buffer)
  if (!actualMime) return res.status(400).json({ error: 'El comprobante debe ser un JPG, PNG o PDF valido' })

  const extension = { 'image/jpeg': '.jpg', 'image/png': '.png', 'application/pdf': '.pdf' }[actualMime]
  const storageKey = `${crypto.randomUUID()}${extension}`
  const storagePath = path.join(transferProofsDir, storageKey)
  const originalName = path.basename(req.file.originalname || `comprobante${extension}`).slice(0, 255)
  const client = await pool.connect()
  let stored = false
  let persisted = false
  try {
    await writeFile(storagePath, req.file.buffer, { flag: 'wx' })
    stored = true
    await client.query('BEGIN')
    const order = await loadTransferOrder(req.params.orderId, client, { lock: true })
    if (!order || !(await customerCanAccess(req, order, client))) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Pedido no encontrado' })
    }
    if (order.status !== 'pending_payment') {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Este pedido ya no admite comprobantes' })
    }
    if (new Date(order.reservation_expires_at).getTime() <= Date.now()) {
      await client.query(`UPDATE orders SET status = 'expired' WHERE id = $1`, [order.id])
      await client.query('COMMIT')
      return res.status(409).json({ error: 'Vencio el plazo para informar la transferencia' })
    }
    const submissions = await loadSubmissions(order.id, client)
    if (submissions.some((item) => ['pending_review', 'approved'].includes(item.status))) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Ya existe un comprobante en revision o aprobado' })
    }
    const attempt = submissions.reduce((max, item) => Math.max(max, Number(item.attempt_number)), 0) + 1
    const { rows } = await client.query(
      `INSERT INTO bank_transfer_submissions
        (order_id, attempt_number, payer_account_holder, proof_storage_key, proof_original_name,
         proof_mime_type, proof_size_bytes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending_review')
       RETURNING *`,
      [order.id, attempt, payerAccountHolder, storageKey, originalName, actualMime, req.file.size],
    )
    await client.query('COMMIT')
    persisted = true
    await sendBankTransferSubmittedNotification(order, rows[0]).catch((error) => {
      console.error('Error avisando comprobante al administrador:', error.message)
    })
    res.status(201).json({ transferStatus: 'pending_review', submission: publicSubmission(rows[0]) })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Error registrando comprobante:', error.message)
    res.status(500).json({ error: 'No se pudo registrar el comprobante' })
  } finally {
    client.release()
    if (stored && !persisted) await unlink(storagePath).catch(() => {})
  }
})

router.get('/admin/submissions/:submissionId/proof', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT proof_storage_key, proof_original_name, proof_mime_type
       FROM bank_transfer_submissions WHERE id = $1`,
      [req.params.submissionId],
    )
    const proof = rows[0]
    if (!proof) return res.status(404).json({ error: 'Comprobante no encontrado' })
    const filePath = path.join(transferProofsDir, path.basename(proof.proof_storage_key))
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    res.download(filePath, proof.proof_original_name)
  } catch (error) {
    console.error('Error descargando comprobante:', error.message)
    res.status(500).json({ error: 'No se pudo descargar el comprobante' })
  }
})

router.post('/admin/submissions/:submissionId/approve', requireAdmin, async (req, res) => {
  const client = await pool.connect()
  let approvedOrder
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT s.*, o.status AS order_status, o.total_amount
       FROM bank_transfer_submissions s
       JOIN orders o ON o.id = s.order_id
       WHERE s.id = $1
       FOR UPDATE OF s, o`,
      [req.params.submissionId],
    )
    const submission = rows[0]
    if (!submission) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Comprobante no encontrado' })
    }
    if (submission.status === 'approved') {
      await client.query('ROLLBACK')
      return res.json({ approved: true, alreadyApproved: true })
    }
    if (submission.status !== 'pending_review' || submission.order_status !== 'pending_payment') {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'El comprobante ya no esta pendiente de revision' })
    }
    if (!Number.isFinite(Number(req.body?.expectedAmount))
        || roundMoney(req.body.expectedAmount) !== roundMoney(submission.total_amount)) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Confirmá el importe exacto del pedido antes de aprobar' })
    }
    await client.query(
      `UPDATE bank_transfer_submissions
       SET status = 'approved', reviewed_at = NOW(), rejection_reason = NULL
       WHERE id = $1`,
      [submission.id],
    )
    const orderResult = await client.query(
      `UPDATE orders
       SET status = 'paid', paid_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [submission.order_id],
    )
    approvedOrder = await countCouponUsageOnce(client, orderResult.rows[0])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Error aprobando transferencia:', error.message)
    return res.status(500).json({ error: 'No se pudo aprobar la transferencia' })
  } finally {
    client.release()
  }

  const invoiceOrder = { ...approvedOrder, bank_transfer_approved: true }
  await sendOrderConfirmationNotifications(approvedOrder.id).catch((error) => {
    console.error('Error enviando confirmacion de transferencia:', error.message)
  })
  await attemptAutomaticInvoiceForConfirmedBankTransfer({ order: invoiceOrder }).catch((error) => {
    console.error('Error iniciando factura de transferencia:', error.message)
  })
  return res.json({ approved: true, orderId: approvedOrder.id, status: approvedOrder.status })
})

router.post('/admin/submissions/:submissionId/reject', requireAdmin, async (req, res) => {
  const reason = String(req.body?.reason || '').trim()
  if (reason.length < 3 || reason.length > 500) {
    return res.status(400).json({ error: 'El motivo debe tener entre 3 y 500 caracteres' })
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT s.*, o.reservation_expires_at, o.status AS order_status, o.user_id
       FROM bank_transfer_submissions s
       JOIN orders o ON o.id = s.order_id
       WHERE s.id = $1
       FOR UPDATE OF s, o`,
      [req.params.submissionId],
    )
    const submission = rows[0]
    if (!submission) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Comprobante no encontrado' })
    }
    if (submission.status !== 'pending_review' || submission.order_status !== 'pending_payment') {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'El comprobante ya no esta pendiente de revision' })
    }
    await client.query(
      `UPDATE bank_transfer_submissions
       SET status = 'rejected', rejection_reason = $2, reviewed_at = NOW()
       WHERE id = $1`,
      [submission.id, reason],
    )
    const expired = new Date(submission.reservation_expires_at).getTime() <= Date.now()
    const renewedAccessToken = !submission.user_id && !expired ? createCustomerAccessToken() : null
    if (expired) await client.query(`UPDATE orders SET status = 'expired' WHERE id = $1`, [submission.order_id])
    if (renewedAccessToken) {
      await client.query(
        `INSERT INTO bank_transfer_guest_tokens (order_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [submission.order_id, hashCustomerAccessToken(renewedAccessToken), submission.reservation_expires_at],
      )
    }
    await client.query('COMMIT')
    const rejectedOrder = await client.query('SELECT * FROM orders WHERE id = $1', [submission.order_id])
    if (rejectedOrder.rows[0]) {
      await sendBankTransferRejectedNotification(rejectedOrder.rows[0], reason, renewedAccessToken).catch((error) => {
        console.error('Error avisando rechazo al cliente:', error.message)
      })
    }
    res.json({ rejected: true, orderStatus: expired ? 'expired' : 'pending_payment' })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Error rechazando transferencia:', error.message)
    res.status(500).json({ error: 'No se pudo rechazar la transferencia' })
  } finally {
    client.release()
  }
})

router.use((error, _req, res, next) => {
  if (!(error instanceof multer.MulterError)) return next(error)
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'El comprobante supera el limite de 10 MB' })
  return res.status(400).json({ error: 'No se pudo procesar el comprobante' })
})

export default router
