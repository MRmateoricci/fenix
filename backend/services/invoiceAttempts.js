import { pool } from '../db/pool.js';
import { getArcaAutomationConfig } from '../config/arca.js';
import {
  BILLABLE_ORDER_STATUSES,
  createInvoiceForOrder,
} from './invoiceService.js';
import { safeArcaErrorMessage } from './arcaSafeLog.js';

const ATTEMPT_ORIGINS = new Set(['webhook', 'customer', 'admin', 'manual_script']);
const NEEDS_DATA_CODES = new Set([
  'INVOICE_RECIPIENT_NOT_CONFIRMED',
  'INVOICE_RECIPIENT_INVALID',
  'INVOICE_CONCEPT_INVALID',
  'INVOICE_SERVICE_DATES_REQUIRED',
  'INVOICE_DATE_INVALID',
  'ARCA_DOCUMENT_TYPE_INVALID',
  'ARCA_VAT_CONDITION_INVALID',
]);
const activeAttempts = new Map();

function normalizedOrigin(origin) {
  const value = String(origin || '').trim().toLowerCase();
  if (!ATTEMPT_ORIGINS.has(value)) throw new TypeError(`Origen de factura invalido: ${value || '-'}`);
  return value;
}

export function hasRequiredInvoiceData(order) {
  const concept = Number(order?.invoice_concept);
  const docType = Number(order?.invoice_doc_type);
  const vatConditionId = Number(order?.invoice_vat_condition_id);
  const complete = Boolean(
    order?.invoice_data_confirmed_at
    && String(order?.invoice_recipient_name || '').trim()
    && String(order?.invoice_doc_number ?? '').trim()
    && Number.isInteger(docType)
    && Number.isInteger(vatConditionId)
    && vatConditionId > 0
    && [1, 2, 3].includes(concept)
  );
  if (!complete) return false;
  return concept === 1 || Boolean(
    order?.invoice_service_from
    && order?.invoice_service_to
    && order?.invoice_payment_due
  );
}

export function invoiceAttemptEligibility(order, { requireMercadoPagoApproval = false } = {}) {
  if (!order) return { allowed: false, status: 'failed', code: 'ORDER_NOT_FOUND', message: 'El pedido no existe.' };
  if (!BILLABLE_ORDER_STATUSES.has(order.status)) {
    return { allowed: false, status: 'failed', code: 'ORDER_NOT_BILLABLE', message: 'El pedido no esta pagado o no es facturable.' };
  }
  if ((order.payment_method === 'mercadopago' && order.mp_status !== 'approved')
    || (requireMercadoPagoApproval && order.payment_method !== 'mercadopago')) {
    return { allowed: false, status: 'failed', code: 'PAYMENT_NOT_APPROVED', message: 'Mercado Pago no confirmo el pago como approved.' };
  }
  if (!hasRequiredInvoiceData(order)) {
    return { allowed: false, status: 'needs_data', code: 'INVOICE_RECIPIENT_NOT_CONFIRMED', message: 'Faltan confirmar los datos fiscales del receptor.' };
  }
  return { allowed: true };
}

export function classifyInvoiceAttemptResult(result) {
  const status = result?.invoice?.status;
  if (status === 'authorized') return { status: 'completed', code: null, message: null };
  if (status === 'rejected') return { status: 'failed', code: 'ARCA_REJECTED', message: 'ARCA rechazo el comprobante.' };
  if (['processing', 'uncertain'].includes(status)) {
    return { status: 'failed', code: 'ARCA_COMMUNICATION_UNCERTAIN', message: 'No se pudo confirmar el comprobante.' };
  }
  return { status: 'failed', code: 'INVOICE_RESULT_INVALID', message: 'La emision termino con un resultado inesperado.' };
}

export function isInvoiceOverdue(order, invoiceStatus, now = new Date()) {
  if (order?.payment_method !== 'mercadopago'
    || order?.mp_status !== 'approved'
    || !BILLABLE_ORDER_STATUSES.has(order?.status)
    || invoiceStatus === 'authorized') return false;
  const paidAt = new Date(order?.paid_at).getTime();
  const current = new Date(now).getTime();
  return Number.isFinite(paidAt) && Number.isFinite(current)
    && current - paidAt > 24 * 60 * 60 * 1000;
}

function classifyInvoiceAttemptError(error) {
  const code = String(error?.code || error?.name || 'INVOICE_ATTEMPT_ERROR');
  return {
    status: NEEDS_DATA_CODES.has(code) ? 'needs_data' : 'failed',
    code,
    message: safeArcaErrorMessage(error).slice(0, 500),
  };
}

async function loadOrder(orderId, client) {
  const { rows } = await client.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  return rows[0] || null;
}

async function recordSkippedAttempt(orderId, origin, decision, client) {
  const { rows } = await client.query(
    `INSERT INTO invoice_jobs (
       order_id, status, run_at, locked_at, last_error_code,
       last_error_message, last_attempt_origin, completed_at
     ) VALUES ($1, $2, NOW(), NULL, $3, $4, $5, NOW())
     ON CONFLICT (order_id) DO UPDATE SET
       status = EXCLUDED.status, run_at = NOW(), locked_at = NULL,
       last_error_code = EXCLUDED.last_error_code,
       last_error_message = EXCLUDED.last_error_message,
       last_attempt_origin = EXCLUDED.last_attempt_origin,
       completed_at = NOW()
     RETURNING *`,
    [orderId, decision.status, decision.code, decision.message, origin],
  );
  return rows[0];
}

async function recordAttemptStarted(orderId, origin, client) {
  const { rows } = await client.query(
    `INSERT INTO invoice_jobs (
       order_id, status, attempt_count, run_at, locked_at,
       last_error_code, last_error_message, last_attempt_origin, completed_at
     ) VALUES ($1, 'processing', 1, NOW(), NOW(), NULL, NULL, $2, NULL)
     ON CONFLICT (order_id) DO UPDATE SET
       status = 'processing', attempt_count = invoice_jobs.attempt_count + 1,
       run_at = NOW(), locked_at = NOW(), last_error_code = NULL,
       last_error_message = NULL, last_attempt_origin = EXCLUDED.last_attempt_origin,
       completed_at = NULL
     RETURNING *`,
    [orderId, origin],
  );
  return rows[0];
}

async function recordAttemptFinished(audit, decision, client) {
  const { rows } = await client.query(
    `UPDATE invoice_jobs SET
       status = $2, run_at = NOW(), locked_at = NULL,
       last_error_code = $3, last_error_message = $4, completed_at = NOW()
     WHERE id = $1 AND attempt_count = $5
     RETURNING *`,
    [audit.id, decision.status, decision.code, decision.message, audit.attempt_count],
  );
  if (rows[0]) return rows[0];
  const current = await client.query('SELECT * FROM invoice_jobs WHERE id = $1', [audit.id]);
  return current.rows[0] || null;
}

async function runInvoiceAttempt({ orderId, origin, requireMercadoPagoApproval }, {
  client,
  createInvoice,
}) {
  const order = await loadOrder(orderId, client);
  const eligibility = invoiceAttemptEligibility(order, { requireMercadoPagoApproval });
  if (!order) return { attempted: false, ...eligibility, order: null, invoice: null, audit: null };

  if (!eligibility.allowed) {
    const audit = await recordSkippedAttempt(order.id, origin, eligibility, client);
    console.warn(`[arca-invoice] origin=${origin} order=${order.id} status=${eligibility.status} code=${eligibility.code}`);
    return { attempted: false, ...eligibility, order, invoice: null, audit };
  }

  const audit = await recordAttemptStarted(order.id, origin, client);
  try {
    const result = await createInvoice(order.id);
    const decision = classifyInvoiceAttemptResult(result);
    const savedAudit = await recordAttemptFinished(audit, decision, client);
    const invoiceId = result?.invoice?.id || '-';
    const pointOfSale = result?.invoice?.pto_vta ?? '-';
    const voucherType = result?.invoice?.cbte_tipo ?? '-';
    const voucher = result?.invoice?.cbte_numero ?? '-';
    const arcaResult = result?.invoice?.arca_result ?? '-';
    console.info(`[arca-invoice] origin=${origin} order=${order.id} invoice=${invoiceId} status=${result?.invoice?.status || decision.status} pto=${pointOfSale} type=${voucherType} voucher=${voucher} result=${arcaResult} code=${decision.code || '-'}`);
    return { attempted: true, ...decision, order, invoice: result?.invoice || null, result, audit: savedAudit };
  } catch (error) {
    const decision = classifyInvoiceAttemptError(error);
    const savedAudit = await recordAttemptFinished(audit, decision, client);
    console.warn(`[arca-invoice] origin=${origin} order=${order.id} status=${decision.status} code=${decision.code}`);
    return { attempted: true, ...decision, order, invoice: error?.invoice || null, error, audit: savedAudit };
  }
}

/**
 * Unico punto de entrada para emisiones automaticas y reintentos manuales.
 * Los intentos simultaneos del mismo proceso comparten la misma promesa; los
 * locks de invoiceService conservan la idempotencia entre procesos Node.
 */
export function attemptInvoiceForOrder({
  orderId,
  origin,
  requireMercadoPagoApproval = false,
}, {
  client = pool,
  createInvoice = createInvoiceForOrder,
  coalesce = true,
} = {}) {
  const safeOrigin = normalizedOrigin(origin);
  const key = String(orderId || '');
  if (coalesce && activeAttempts.has(key)) return activeAttempts.get(key);

  const operation = runInvoiceAttempt({
    orderId: key,
    origin: safeOrigin,
    requireMercadoPagoApproval,
  }, { client, createInvoice });

  if (!coalesce) return operation;
  activeAttempts.set(key, operation);
  const clearActive = () => {
    if (activeAttempts.get(key) === operation) activeAttempts.delete(key);
  };
  operation.then(clearActive, clearActive);
  return operation;
}

export async function attemptAutomaticInvoiceForApprovedPayment({ order, payment }, {
  environmentVariables = process.env,
  attempt = attemptInvoiceForOrder,
  timeoutMs = 20_000,
} = {}) {
  const automation = getArcaAutomationConfig(environmentVariables);
  if (!automation.enabled) return { attempted: false, reason: automation.disabledReason };
  if (String(payment?.status || '') !== 'approved'
    || order?.payment_method !== 'mercadopago'
    || order?.mp_status !== 'approved'
    || !BILLABLE_ORDER_STATUSES.has(order?.status)) {
    return { attempted: false, reason: 'payment_not_approved' };
  }

  const operation = Promise.resolve(attempt({
    orderId: order.id,
    origin: 'webhook',
    requireMercadoPagoApproval: true,
  }));
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return operation;

  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve({
      attempted: true,
      timedOut: true,
      status: 'processing',
      code: 'WEBHOOK_INVOICE_DEADLINE',
    }), timeoutMs);
    timer.unref?.();
  });
  try {
    return await Promise.race([operation, deadline]);
  } catch (error) {
    return {
      attempted: true,
      status: 'failed',
      code: String(error?.code || error?.name || 'INVOICE_ATTEMPT_ERROR'),
      error,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function getInvoiceAttemptForOrder(orderId, client = pool) {
  const { rows } = await client.query('SELECT * FROM invoice_jobs WHERE order_id = $1', [orderId]);
  return rows[0] || null;
}

export function publicInvoiceAttempt(attempt, { includeTechnicalMessages = false } = {}) {
  if (!attempt) return null;
  const result = {
    status: attempt.status,
    attemptCount: Number(attempt.attempt_count || 0),
    origin: attempt.last_attempt_origin || null,
    requiresRecipientData: attempt.status === 'needs_data'
      || attempt.last_error_code === 'INVOICE_RECIPIENT_NOT_CONFIRMED',
    canRetryManually: attempt.status === 'failed',
    lastAttemptAt: attempt.updated_at,
    completedAt: attempt.completed_at,
  };
  if (includeTechnicalMessages) {
    result.errorCode = attempt.last_error_code || null;
    result.errorMessage = attempt.last_error_message || null;
  }
  return result;
}

export const invoiceAttemptOrigins = ATTEMPT_ORIGINS;
