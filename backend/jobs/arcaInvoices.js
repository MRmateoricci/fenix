import { pool } from '../db/pool.js';
import { getArcaAutomationConfig } from '../config/arca.js';
import {
  BILLABLE_ORDER_STATUSES,
  createInvoiceForOrder,
} from '../services/invoiceService.js';
import { safeArcaErrorMessage } from '../services/arcaSafeLog.js';

const POLL_INTERVAL_MS = 15_000;
const STALE_PROCESSING_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = Object.freeze({
  1: 60_000,
  2: 5 * 60_000,
  3: 15 * 60_000,
  4: 60 * 60_000,
});
const RECOVERABLE_CODE_LIST = Object.freeze([
  'ARCA_COMMUNICATION_UNCERTAIN',
  'ARCA_LAST_VOUCHER_ERROR',
  'ARCA_WSFE_CONNECTION_ERROR',
  'ARCA_WSFE_REQUEST_ERROR',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'WORKER_INTERRUPTED',
]);
const RECOVERABLE_CODES = new Set(RECOVERABLE_CODE_LIST);
const NEEDS_DATA_CODES = new Set([
  'INVOICE_RECIPIENT_NOT_CONFIRMED',
  'INVOICE_RECIPIENT_INVALID',
  'INVOICE_CONCEPT_INVALID',
  'INVOICE_SERVICE_DATES_REQUIRED',
  'INVOICE_DATE_INVALID',
  'ARCA_DOCUMENT_TYPE_INVALID',
  'ARCA_VAT_CONDITION_INVALID',
]);

let workerTimer = null;
let sweepRunning = false;

function errorChain(error, limit = 6) {
  const chain = [];
  let current = error;
  while (current && chain.length < limit) {
    chain.push(current);
    current = current.cause;
  }
  return chain;
}

export function retryDelayForAttempt(attemptCount) {
  return RETRY_DELAYS_MS[Number(attemptCount)] ?? null;
}

export function isRecoverableInvoiceError(error) {
  return errorChain(error).some((current) => {
    const status = Number(current?.httpStatus ?? current?.statusCode ?? current?.status);
    return current?.transportError === true
      || RECOVERABLE_CODES.has(String(current?.code || '').toUpperCase())
      || [502, 503, 504].includes(status)
      || /\b(?:timeout|timed out|socket hang up|temporar(?:y|ily))\b/i.test(String(current?.message || ''));
  });
}

function jobDecision(status, code, message, extra = {}) {
  return { status, code, message, ...extra };
}

export function hasRequiredInvoiceData(order) {
  const concept = Number(order?.invoice_concept);
  const docType = Number(order?.invoice_doc_type);
  const vatConditionId = Number(order?.invoice_vat_condition_id);
  const basicDataComplete = Boolean(
    order?.invoice_data_confirmed_at
    && String(order?.invoice_recipient_name || '').trim()
    && String(order?.invoice_doc_number ?? '').trim()
    && Number.isInteger(docType)
    && Number.isInteger(vatConditionId)
    && vatConditionId > 0
    && [1, 2, 3].includes(concept)
  );
  if (!basicDataComplete) return false;
  return concept === 1 || Boolean(
    order?.invoice_service_from
    && order?.invoice_service_to
    && order?.invoice_payment_due
  );
}

/**
 * Ejecuta la decisión de un intento sin escribir la cola. Esta separación
 * permite probar reintentos y rechazos sin invocar WSFE ni PostgreSQL.
 */
export async function executeInvoiceJobAttempt({ job, order }, {
  createInvoice = createInvoiceForOrder,
} = {}) {
  if (!order) return jobDecision('failed', 'ORDER_NOT_FOUND', 'El pedido ya no existe.');
  if (order.payment_method !== 'mercadopago' || order.mp_status !== 'approved') {
    return jobDecision('failed', 'PAYMENT_NOT_APPROVED', 'El pago no está aprobado.');
  }
  if (!BILLABLE_ORDER_STATUSES.has(order.status)) {
    return jobDecision('failed', 'ORDER_NOT_BILLABLE', 'El pedido no está en un estado facturable.');
  }
  if (!hasRequiredInvoiceData(order)) {
    return jobDecision(
      'needs_data',
      'INVOICE_RECIPIENT_NOT_CONFIRMED',
      'Faltan confirmar los datos fiscales del receptor.',
    );
  }

  try {
    const result = await createInvoice(order.id);
    if (result?.invoice?.status === 'authorized') {
      return jobDecision('completed', null, null, { result });
    }
    if (result?.invoice?.status === 'rejected') {
      return jobDecision('failed', 'ARCA_REJECTED', 'ARCA rechazó el comprobante.', { result });
    }
    if (['processing', 'uncertain'].includes(result?.invoice?.status)) {
      const retryDelayMs = retryDelayForAttempt(job.attempt_count);
      return retryDelayMs == null
        ? jobDecision('failed', 'ARCA_COMMUNICATION_UNCERTAIN', 'No se pudo confirmar el comprobante.', { result })
        : jobDecision('retry_wait', 'ARCA_COMMUNICATION_UNCERTAIN', 'No se pudo confirmar el comprobante.', { retryDelayMs, result });
    }
    return jobDecision('failed', 'INVOICE_RESULT_INVALID', 'La emisión terminó con un resultado inesperado.', { result });
  } catch (error) {
    const code = String(error?.code || error?.name || 'INVOICE_JOB_ERROR');
    const message = safeArcaErrorMessage(error).slice(0, 500);
    if (NEEDS_DATA_CODES.has(code)) return jobDecision('needs_data', code, message, { error });
    if (isRecoverableInvoiceError(error)) {
      const retryDelayMs = retryDelayForAttempt(job.attempt_count);
      return retryDelayMs == null
        ? jobDecision('failed', code, message, { error })
        : jobDecision('retry_wait', code, message, { retryDelayMs, error });
    }
    return jobDecision('failed', code, message, { error });
  }
}

export function publicInvoiceJob(job) {
  if (!job) return null;
  return {
    status: job.status,
    attemptCount: Number(job.attempt_count || 0),
    nextAttemptAt: job.status === 'retry_wait' ? job.run_at : null,
    requiresRecipientData: job.status === 'needs_data'
      || job.last_error_code === 'INVOICE_RECIPIENT_NOT_CONFIRMED',
    canRetryManually: job.status === 'failed',
    createdAt: job.created_at,
    completedAt: job.completed_at,
  };
}

export async function getInvoiceJobForOrder(orderId, client = pool) {
  const { rows } = await client.query(
    'SELECT * FROM invoice_jobs WHERE order_id = $1',
    [orderId],
  );
  return rows[0] || null;
}

export async function enqueueInvoiceJob(orderId, { force = false, client = pool } = {}) {
  const { rows } = await client.query(
    `INSERT INTO invoice_jobs (order_id, status, run_at)
     SELECT id, 'queued', NOW()
     FROM orders
     WHERE id = $1
       AND payment_method = 'mercadopago'
       AND mp_status = 'approved'
       AND status IN ('paid', 'preparing', 'shipped', 'delivered')
     ON CONFLICT (order_id) DO UPDATE SET
       status = 'queued', run_at = NOW(), locked_at = NULL,
       attempt_count = 0,
       last_error_code = NULL, last_error_message = NULL, completed_at = NULL
     WHERE $2::boolean
       AND invoice_jobs.status IN ('needs_data', 'failed')
     RETURNING invoice_jobs.*`,
    [orderId, force],
  );

  if (rows[0]) return { scheduled: true, job: rows[0] };
  const existing = await getInvoiceJobForOrder(orderId, client);
  return { scheduled: false, job: existing };
}

export async function scheduleInvoiceForApprovedPayment({ order, payment }, {
  enqueue = enqueueInvoiceJob,
  environmentVariables = process.env,
} = {}) {
  const automation = getArcaAutomationConfig(environmentVariables);
  if (!automation.enabled) {
    return { scheduled: false, reason: automation.disabledReason, job: null };
  }
  if (String(payment?.status || '') !== 'approved'
    || order?.payment_method !== 'mercadopago'
    || order?.mp_status !== 'approved'
    || !BILLABLE_ORDER_STATUSES.has(order?.status)) {
    return { scheduled: false, reason: 'payment_not_approved', job: null };
  }
  return enqueue(order.id);
}

export async function rescheduleInvoiceAfterFiscalUpdate(orderId) {
  const automation = getArcaAutomationConfig();
  if (!automation.enabled) return { scheduled: false, reason: automation.disabledReason, job: null };
  return enqueueInvoiceJob(orderId, { force: true });
}

async function claimNextInvoiceJob(client = pool) {
  const connection = await client.connect();
  try {
    await connection.query('BEGIN');
    const { rows } = await connection.query(
      `SELECT * FROM invoice_jobs
       WHERE status IN ('queued', 'retry_wait') AND run_at <= NOW()
       ORDER BY run_at, created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
    );
    if (!rows[0]) {
      await connection.query('COMMIT');
      return null;
    }
    const updated = await connection.query(
      `UPDATE invoice_jobs SET
         status = 'processing', locked_at = NOW(), attempt_count = attempt_count + 1
       WHERE id = $1
       RETURNING *`,
      [rows[0].id],
    );
    await connection.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await connection.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function loadOrderForJob(orderId, client = pool) {
  const { rows } = await client.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  return rows[0] || null;
}

export async function runInvoiceJob({ orderId }, {
  client = pool,
  createInvoice = createInvoiceForOrder,
  attemptCount = 1,
} = {}) {
  if (!orderId) throw new TypeError('runInvoiceJob requiere orderId.');
  const order = await loadOrderForJob(orderId, client);
  return executeInvoiceJobAttempt({
    job: { order_id: orderId, attempt_count: attemptCount },
    order,
  }, { createInvoice });
}

async function persistJobDecision(job, decision, client = pool) {
  const runAt = decision.status === 'retry_wait'
    ? new Date(Date.now() + decision.retryDelayMs)
    : new Date();
  const completed = ['completed', 'failed'].includes(decision.status);
  const { rows } = await client.query(
    `UPDATE invoice_jobs SET
       status = $2, run_at = $3, locked_at = NULL,
       last_error_code = $4, last_error_message = $5,
       completed_at = CASE WHEN $6 THEN NOW() ELSE NULL END
     WHERE id = $1
       AND status = 'processing'
       AND attempt_count = $7
     RETURNING *`,
    [
      job.id,
      decision.status,
      runAt,
      decision.code,
      decision.message,
      completed,
      job.attempt_count,
    ],
  );
  if (rows[0]) return { job: rows[0], superseded: false };
  const current = await client.query('SELECT * FROM invoice_jobs WHERE id = $1', [job.id]);
  return { job: current.rows[0] || null, superseded: true };
}

export async function processNextInvoiceJob({
  client = pool,
  createInvoice = createInvoiceForOrder,
} = {}) {
  const job = await claimNextInvoiceJob(client);
  if (!job) return null;
  const decision = await runInvoiceJob({ orderId: job.order_id }, {
    client,
    createInvoice,
    attemptCount: job.attempt_count,
  });
  const persisted = await persistJobDecision(job, decision, client);
  const saved = persisted.job;

  if (persisted.superseded) {
    console.warn(`[arca-invoice-job] order=${job.order_id} status=superseded attempts=${job.attempt_count}`);
    return { job: saved, decision, superseded: true };
  }

  if (decision.status === 'completed') {
    console.info(`[arca-invoice-job] order=${job.order_id} invoice=${decision.result?.invoice?.id || '-'} status=completed attempts=${saved.attempt_count}`);
  } else {
    console.warn(`[arca-invoice-job] order=${job.order_id} status=${decision.status} code=${decision.code || '-'} attempts=${saved.attempt_count}`);
  }
  return { job: saved, decision };
}

export async function recoverStaleInvoiceJobs(client = pool) {
  const { rowCount } = await client.query(
    `UPDATE invoice_jobs SET
       status = CASE WHEN attempt_count >= $2 THEN 'failed' ELSE 'retry_wait' END,
       run_at = NOW(), locked_at = NULL,
       last_error_code = 'WORKER_INTERRUPTED',
       last_error_message = 'El proceso anterior se interrumpió antes de finalizar.',
       completed_at = CASE WHEN attempt_count >= $2 THEN NOW() ELSE NULL END
     WHERE status = 'processing'
       AND locked_at < NOW() - ($1::text || ' minutes')::interval`,
    [String(STALE_PROCESSING_MINUTES), MAX_ATTEMPTS],
  );
  return rowCount;
}

export async function runInvoiceJobSweep({
  limit = 10,
  client = pool,
  allowConcurrent = false,
} = {}) {
  if (sweepRunning && !allowConcurrent) return [];
  const ownsSweepGuard = !sweepRunning;
  if (ownsSweepGuard) sweepRunning = true;
  const processed = [];
  try {
    for (let index = 0; index < limit; index += 1) {
      const result = await processNextInvoiceJob({ client });
      if (!result) break;
      processed.push(result);
    }
    return processed;
  } finally {
    if (ownsSweepGuard) sweepRunning = false;
  }
}

export async function runInvoiceWorkerTick({
  client = pool,
  recoverStale = recoverStaleInvoiceJobs,
  runSweep = runInvoiceJobSweep,
} = {}) {
  const recovered = await recoverStale(client);
  const processed = await runSweep({
    client,
    allowConcurrent: recovered > 0,
  });
  return { recovered, processed };
}

export function startArcaInvoiceJob() {
  const automation = getArcaAutomationConfig();
  if (!automation.enabled) {
    console.info(`[arca-invoice-job] Automatización desactivada (${automation.disabledReason}).`);
    return { started: false, reason: automation.disabledReason };
  }
  if (workerTimer) return { started: true, alreadyRunning: true };

  const sweep = async () => {
    try {
      const { recovered } = await runInvoiceWorkerTick();
      if (recovered) {
        console.warn(`[arca-invoice-job] Recuperados ${recovered} trabajo(s) interrumpido(s).`);
      }
    } catch (error) {
      console.error(`[arca-invoice-job] status=error code=${error.code || error.name}`);
    }
  };

  sweep().catch((error) => {
    console.error(`[arca-invoice-job] status=start_error code=${error.code || error.name}`);
  });
  workerTimer = setInterval(sweep, POLL_INTERVAL_MS);
  workerTimer.unref?.();
  console.info(`[arca-invoice-job] Automatización activa en ${automation.environment}.`);
  return { started: true };
}

export function stopArcaInvoiceJobForTests() {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
}

export async function markInvoiceJobFromManualResult(orderId, invoice, client = pool) {
  if (!invoice || !['authorized', 'rejected'].includes(invoice.status)) return null;
  const status = invoice.status === 'authorized' ? 'completed' : 'failed';
  const code = invoice.status === 'authorized' ? null : 'ARCA_REJECTED';
  const { rows } = await client.query(
    `UPDATE invoice_jobs SET
       status = $2, locked_at = NULL, last_error_code = $3,
       last_error_message = $4, completed_at = NOW()
     WHERE order_id = $1
     RETURNING *`,
    [orderId, status, code, code ? 'ARCA rechazó el comprobante.' : null],
  );
  return rows[0] || null;
}

export async function requeueRecoverableInvoices(client = pool) {
  const { rows } = await client.query(
    `SELECT o.id
     FROM orders o
     LEFT JOIN invoices i ON i.order_id = o.id
     LEFT JOIN invoice_jobs j ON j.order_id = o.id
     WHERE o.payment_method = 'mercadopago'
       AND o.mp_status = 'approved'
       AND o.status IN ('paid', 'preparing', 'shipped', 'delivered')
       AND o.invoice_data_confirmed_at IS NOT NULL
       AND (i.id IS NULL OR i.status IN ('pending', 'uncertain', 'error'))
       AND (
         j.id IS NULL
         OR j.status <> 'failed'
         OR j.last_error_code = ANY($1::text[])
       )
     ORDER BY o.paid_at NULLS LAST, o.created_at`,
    [RECOVERABLE_CODE_LIST],
  );
  const scheduled = [];
  for (const row of rows) {
    const result = await enqueueInvoiceJob(row.id, { force: true, client });
    if (result.job) scheduled.push(result.job);
  }
  return scheduled;
}

export async function getInvoiceAutomationMetrics(client = pool) {
  const [jobs, invoices, billableWithoutAuthorized, latestFailure] = await Promise.all([
    client.query(
      `SELECT status, COUNT(*)::integer AS count, COALESCE(SUM(attempt_count), 0)::integer AS attempts
       FROM invoice_jobs GROUP BY status ORDER BY status`,
    ),
    client.query(
      `SELECT status, COUNT(*)::integer AS count
       FROM invoices
       WHERE status IN ('pending', 'processing', 'uncertain', 'rejected', 'error')
       GROUP BY status ORDER BY status`,
    ),
    client.query(
      `SELECT COUNT(*)::integer AS count
       FROM orders o
       LEFT JOIN invoices i ON i.order_id = o.id AND i.status = 'authorized'
       WHERE o.payment_method = 'mercadopago'
         AND o.mp_status = 'approved'
         AND o.status IN ('paid', 'preparing', 'shipped', 'delivered')
         AND i.id IS NULL`,
    ),
    client.query(
      `SELECT order_id, status, attempt_count, last_error_code, last_error_message, updated_at
       FROM invoice_jobs
       WHERE last_error_code IS NOT NULL
       ORDER BY updated_at DESC LIMIT 1`,
    ),
  ]);
  return {
    jobs: jobs.rows,
    invoices: invoices.rows,
    billableWithoutAuthorized: billableWithoutAuthorized.rows[0]?.count || 0,
    latestFailure: latestFailure.rows[0] || null,
  };
}

export { MAX_ATTEMPTS };
