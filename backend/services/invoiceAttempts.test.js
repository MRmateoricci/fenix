import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attemptAutomaticInvoiceForApprovedPayment,
  attemptInvoiceForOrder,
  classifyInvoiceAttemptResult,
  hasRequiredInvoiceData,
  invoiceAttemptEligibility,
  isInvoiceOverdue,
} from './invoiceAttempts.js';

const approvedOrder = Object.freeze({
  id: '11111111-1111-4111-8111-111111111111',
  status: 'paid',
  payment_method: 'mercadopago',
  mp_status: 'approved',
  invoice_data_confirmed_at: new Date().toISOString(),
  invoice_recipient_name: 'Cliente Prueba',
  invoice_doc_type: 96,
  invoice_doc_number: '12345678',
  invoice_vat_condition_id: 5,
  invoice_concept: 1,
});

function automationEnvironment(enabled = true) {
  return {
    ARCA_ENV: 'homologation',
    ARCA_AUTO_INVOICE_ENABLED: enabled ? 'true' : 'false',
    ARCA_PRODUCTION_ENABLED: 'false',
  };
}

function fakeAuditClient(order = approvedOrder) {
  let attempts = 0;
  const queries = [];
  return {
    queries,
    async query(sql) {
      queries.push(sql);
      if (sql.startsWith('SELECT * FROM orders')) return { rows: order ? [order] : [] };
      if (sql.includes("INSERT INTO invoice_jobs") && sql.includes("'processing'")) {
        attempts += 1;
        return { rows: [{ id: 'audit-1', order_id: order.id, status: 'processing', attempt_count: attempts, last_attempt_origin: 'customer' }] };
      }
      if (sql.includes('INSERT INTO invoice_jobs')) {
        return { rows: [{ id: 'audit-1', order_id: order.id, status: 'needs_data', attempt_count: attempts, last_error_code: 'INVOICE_RECIPIENT_NOT_CONFIRMED' }] };
      }
      if (sql.startsWith('UPDATE invoice_jobs')) {
        return { rows: [{ id: 'audit-1', order_id: order.id, status: 'completed', attempt_count: attempts }] };
      }
      if (sql.startsWith('SELECT * FROM invoice_jobs')) return { rows: [] };
      throw new Error(`SQL inesperado: ${sql}`);
    },
  };
}

test('la elegibilidad exige approved para Mercado Pago y ese medio para webhook/admin', () => {
  assert.equal(invoiceAttemptEligibility(approvedOrder, { requireMercadoPagoApproval: true }).allowed, true);
  const notApproved = { ...approvedOrder, mp_status: 'pending' };
  assert.equal(invoiceAttemptEligibility(notApproved).code, 'PAYMENT_NOT_APPROVED');
  assert.equal(invoiceAttemptEligibility(notApproved, { requireMercadoPagoApproval: true }).code, 'PAYMENT_NOT_APPROVED');
  assert.equal(invoiceAttemptEligibility({ ...approvedOrder, payment_method: 'pay_in_store', mp_status: null }).allowed, true);
  assert.equal(invoiceAttemptEligibility({ ...approvedOrder, payment_method: 'pay_in_store', mp_status: null }, { requireMercadoPagoApproval: true }).code, 'PAYMENT_NOT_APPROVED');
});

test('un pedido sin datos fiscales no está listo y no debe llegar a ARCA', () => {
  const order = { ...approvedOrder, invoice_data_confirmed_at: null };
  assert.equal(hasRequiredInvoiceData(order), false);
  assert.equal(invoiceAttemptEligibility(order).status, 'needs_data');
});

test('clasifica autorizado, rechazo e incertidumbre sin programar reintentos', () => {
  assert.equal(classifyInvoiceAttemptResult({ invoice: { status: 'authorized' } }).status, 'completed');
  assert.equal(classifyInvoiceAttemptResult({ invoice: { status: 'rejected' } }).code, 'ARCA_REJECTED');
  const uncertain = classifyInvoiceAttemptResult({ invoice: { status: 'uncertain' } });
  assert.equal(uncertain.status, 'failed');
  assert.equal(uncertain.code, 'ARCA_COMMUNICATION_UNCERTAIN');
  assert.equal('retryDelayMs' in uncertain, false);
});

test('marca alerta sólo para pagos approved con más de 24 h sin autorización', () => {
  const now = new Date('2026-08-15T15:00:00Z');
  const oldOrder = { ...approvedOrder, paid_at: '2026-08-14T14:59:59Z' };
  assert.equal(isInvoiceOverdue(oldOrder, null, now), true);
  assert.equal(isInvoiceOverdue(oldOrder, 'authorized', now), false);
  assert.equal(isInvoiceOverdue({ ...oldOrder, mp_status: 'pending' }, null, now), false);
  assert.equal(isInvoiceOverdue({ ...oldOrder, paid_at: '2026-08-15T14:00:00Z' }, null, now), false);
});

test('ARCA_AUTO_INVOICE_ENABLED=false no intenta la factura', async () => {
  let called = false;
  const result = await attemptAutomaticInvoiceForApprovedPayment({
    order: approvedOrder,
    payment: { status: 'approved' },
  }, {
    environmentVariables: automationEnvironment(false),
    attempt: async () => { called = true; },
  });
  assert.equal(result.attempted, false);
  assert.equal(result.reason, 'auto_invoice_disabled');
  assert.equal(called, false);
});

test('un pago approved intenta inmediatamente con origen webhook', async () => {
  let received;
  const result = await attemptAutomaticInvoiceForApprovedPayment({
    order: approvedOrder,
    payment: { status: 'approved' },
  }, {
    environmentVariables: automationEnvironment(true),
    timeoutMs: 100,
    attempt: async (options) => {
      received = options;
      return { attempted: true, status: 'completed' };
    },
  });
  assert.equal(result.status, 'completed');
  assert.deepEqual(received, {
    orderId: approvedOrder.id,
    origin: 'webhook',
    requireMercadoPagoApproval: true,
  });
});

test('estados de pago no aprobados no intentan una factura nueva', async () => {
  for (const status of ['pending', 'in_process', 'rejected', 'refunded', 'charged_back']) {
    let called = false;
    const result = await attemptAutomaticInvoiceForApprovedPayment({
      order: { ...approvedOrder, mp_status: status },
      payment: { status },
    }, {
      environmentVariables: automationEnvironment(true),
      attempt: async () => { called = true; },
    });
    assert.equal(result.attempted, false, status);
    assert.equal(result.reason, 'payment_not_approved', status);
    assert.equal(called, false, status);
  }
});

test('una falla del intento ARCA queda capturada para que el webhook pueda responder 200', async () => {
  const result = await attemptAutomaticInvoiceForApprovedPayment({
    order: approvedOrder,
    payment: { status: 'approved' },
  }, {
    environmentVariables: automationEnvironment(true),
    timeoutMs: 100,
    attempt: async () => { throw Object.assign(new Error('ARCA temporal'), { code: 'ARCA_WSFE_CONNECTION_ERROR' }); },
  });
  assert.equal(result.attempted, true);
  assert.equal(result.status, 'failed');
  assert.equal(result.code, 'ARCA_WSFE_CONNECTION_ERROR');
});

test('el deadline del webhook responde sin lanzar ni duplicar la operación activa', async () => {
  let resolveAttempt;
  const operation = new Promise((resolve) => { resolveAttempt = resolve; });
  const result = await attemptAutomaticInvoiceForApprovedPayment({
    order: approvedOrder,
    payment: { status: 'approved' },
  }, {
    environmentVariables: automationEnvironment(true),
    timeoutMs: 5,
    attempt: () => operation,
  });
  assert.equal(result.timedOut, true);
  assert.equal(result.code, 'WEBHOOK_INVOICE_DEADLINE');
  resolveAttempt({ attempted: true, status: 'completed' });
});

test('webhook, cliente y admin simultáneos coalescen en una sola emisión del proceso', async () => {
  const client = fakeAuditClient();
  let createCalls = 0;
  const createInvoice = async () => {
    createCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { invoice: { id: 'invoice-1', status: 'authorized', cbte_numero: 1 }, created: true };
  };
  const origins = ['webhook', 'customer', 'admin', 'customer', 'webhook', 'admin', 'customer', 'webhook', 'admin', 'customer'];
  const attempts = await Promise.all(origins.map((origin) => attemptInvoiceForOrder({
    orderId: approvedOrder.id,
    origin,
  }, { client, createInvoice })));
  assert.equal(createCalls, 1);
  assert.equal(attempts.every((item) => item.status === 'completed'), true);
  assert.equal(client.queries.filter((sql) => sql.includes("'processing'")).length, 1);
});

test('datos fiscales faltantes se registran sin invocar el emisor', async () => {
  const client = fakeAuditClient({ ...approvedOrder, invoice_data_confirmed_at: null });
  let called = false;
  const result = await attemptInvoiceForOrder({
    orderId: approvedOrder.id,
    origin: 'webhook',
    requireMercadoPagoApproval: true,
  }, {
    client,
    coalesce: false,
    createInvoice: async () => { called = true; },
  });
  assert.equal(result.status, 'needs_data');
  assert.equal(result.attempted, false);
  assert.equal(called, false);
});

test('rechazo ARCA se audita sin cambiar el pedido pagado', async () => {
  const order = { ...approvedOrder };
  const result = await attemptInvoiceForOrder({
    orderId: order.id,
    origin: 'admin',
    requireMercadoPagoApproval: true,
  }, {
    client: fakeAuditClient(order),
    coalesce: false,
    createInvoice: async () => ({ invoice: { id: 'invoice-r', status: 'rejected', cbte_numero: 3 } }),
  });
  assert.equal(result.code, 'ARCA_REJECTED');
  assert.equal(result.invoice.status, 'rejected');
  assert.equal(order.status, 'paid');
  assert.equal(order.mp_status, 'approved');
});

test('timeout ARCA se captura y el pedido continúa pagado', async () => {
  const order = { ...approvedOrder };
  const result = await attemptInvoiceForOrder({
    orderId: order.id,
    origin: 'webhook',
    requireMercadoPagoApproval: true,
  }, {
    client: fakeAuditClient(order),
    coalesce: false,
    createInvoice: async () => {
      throw Object.assign(new Error('timeout'), { code: 'ARCA_COMMUNICATION_UNCERTAIN' });
    },
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.code, 'ARCA_COMMUNICATION_UNCERTAIN');
  assert.equal(order.status, 'paid');
  assert.equal(order.mp_status, 'approved');
});
