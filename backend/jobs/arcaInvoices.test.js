import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeInvoiceJobAttempt,
  isRecoverableInvoiceError,
  retryDelayForAttempt,
  runInvoiceWorkerTick,
  scheduleInvoiceForApprovedPayment,
} from './arcaInvoices.js';

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

function enabledEnvironment(environment = 'homologation') {
  return {
    ARCA_ENV: environment,
    ARCA_AUTO_INVOICE_ENABLED: 'true',
    ARCA_PRODUCTION_ENABLED: environment === 'production' ? 'true' : 'false',
  };
}

test('solo un pago approved programa la factura cuando el feature flag está activo', async () => {
  let calls = 0;
  const enqueue = async (orderId) => {
    calls += 1;
    return { scheduled: true, job: { id: 'job-1', order_id: orderId } };
  };

  const approved = await scheduleInvoiceForApprovedPayment({
    order: approvedOrder,
    payment: { status: 'approved' },
  }, { enqueue, environmentVariables: enabledEnvironment() });
  assert.equal(approved.scheduled, true);

  for (const status of ['pending', 'in_process', 'rejected', 'cancelled', 'refunded', 'charged_back']) {
    const result = await scheduleInvoiceForApprovedPayment({
      order: { ...approvedOrder, mp_status: status },
      payment: { status },
    }, { enqueue, environmentVariables: enabledEnvironment() });
    assert.equal(result.scheduled, false, status);
  }
  assert.equal(calls, 1);
});

test('el feature flag desactivado no escribe la cola', async () => {
  let called = false;
  const result = await scheduleInvoiceForApprovedPayment({
    order: approvedOrder,
    payment: { status: 'approved' },
  }, {
    enqueue: async () => { called = true; },
    environmentVariables: { ARCA_ENV: 'homologation', ARCA_AUTO_INVOICE_ENABLED: 'false' },
  });
  assert.equal(result.scheduled, false);
  assert.equal(result.reason, 'auto_invoice_disabled');
  assert.equal(called, false);
});

test('webhooks approved duplicados convergen en un solo trabajo', async () => {
  const queued = new Map();
  const enqueue = async (orderId) => {
    if (queued.has(orderId)) return { scheduled: false, job: queued.get(orderId) };
    const job = { id: `job-${queued.size + 1}`, order_id: orderId };
    queued.set(orderId, job);
    return { scheduled: true, job };
  };
  const results = await Promise.all(Array.from({ length: 10 }, () => (
    scheduleInvoiceForApprovedPayment({
      order: approvedOrder,
      payment: { status: 'approved' },
    }, { enqueue, environmentVariables: enabledEnvironment() })
  )));
  assert.equal(queued.size, 1);
  assert.equal(results.filter((result) => result.scheduled).length, 1);
});

test('un trabajo sin datos fiscales queda esperando al cliente y no invoca ARCA', async () => {
  let called = false;
  const decision = await executeInvoiceJobAttempt({
    job: { attempt_count: 1 },
    order: { ...approvedOrder, invoice_data_confirmed_at: null },
  }, { createInvoice: async () => { called = true; } });
  assert.equal(decision.status, 'needs_data');
  assert.equal(decision.code, 'INVOICE_RECIPIENT_NOT_CONFIRMED');
  assert.equal(called, false);
});

test('una factura ya autorizada completa el trabajo sin crear otra', async () => {
  let calls = 0;
  const invoice = { id: 'invoice-1', status: 'authorized' };
  const decision = await executeInvoiceJobAttempt({
    job: { attempt_count: 1 },
    order: approvedOrder,
  }, {
    createInvoice: async (orderId) => {
      calls += 1;
      assert.equal(orderId, approvedOrder.id);
      return { invoice, created: false };
    },
  });
  assert.equal(decision.status, 'completed');
  assert.equal(decision.result.invoice, invoice);
  assert.equal(calls, 1);
});

test('reintentar el mismo pedido devuelve la factura idempotente y un solo CAE', async () => {
  let caeCalls = 0;
  let persistedInvoice = null;
  const createInvoice = async () => {
    if (!persistedInvoice) {
      caeCalls += 1;
      persistedInvoice = { id: 'invoice-idempotent', status: 'authorized', cae: '74000000000001' };
    }
    return { invoice: persistedInvoice, created: caeCalls === 1 };
  };
  const [first, second] = await Promise.all([
    executeInvoiceJobAttempt({ job: { attempt_count: 1 }, order: approvedOrder }, { createInvoice }),
    executeInvoiceJobAttempt({ job: { attempt_count: 1 }, order: approvedOrder }, { createInvoice }),
  ]);
  assert.equal(first.status, 'completed');
  assert.equal(second.status, 'completed');
  assert.equal(first.result.invoice, second.result.invoice);
  assert.equal(caeCalls, 1);
});

test('timeout y respuesta incierta usan la secuencia 1m, 5m, 15m y 1h', async () => {
  assert.equal(retryDelayForAttempt(1), 60_000);
  assert.equal(retryDelayForAttempt(2), 300_000);
  assert.equal(retryDelayForAttempt(3), 900_000);
  assert.equal(retryDelayForAttempt(4), 3_600_000);
  assert.equal(retryDelayForAttempt(5), null);
  assert.equal(isRecoverableInvoiceError(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })), true);

  const first = await executeInvoiceJobAttempt({
    job: { attempt_count: 1 },
    order: approvedOrder,
  }, {
    createInvoice: async () => {
      const cause = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
      throw Object.assign(new Error('Comunicación incierta', { cause }), {
        code: 'ARCA_COMMUNICATION_UNCERTAIN',
        httpStatus: 503,
      });
    },
  });
  assert.equal(first.status, 'retry_wait');
  assert.equal(first.retryDelayMs, 60_000);

  const exhausted = await executeInvoiceJobAttempt({
    job: { attempt_count: 5 },
    order: approvedOrder,
  }, {
    createInvoice: async () => { throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }); },
  });
  assert.equal(exhausted.status, 'failed');
});

test('un resultado uncertain se posterga sin reenviar dentro del mismo intento', async () => {
  let calls = 0;
  const decision = await executeInvoiceJobAttempt({
    job: { attempt_count: 2 },
    order: approvedOrder,
  }, {
    createInvoice: async () => {
      calls += 1;
      return { invoice: { id: 'invoice-uncertain', status: 'uncertain' } };
    },
  });
  assert.equal(decision.status, 'retry_wait');
  assert.equal(decision.retryDelayMs, 300_000);
  assert.equal(calls, 1);
});

test('rechazos fiscales y errores de configuración no se reintentan', async () => {
  const rejected = await executeInvoiceJobAttempt({
    job: { attempt_count: 1 },
    order: approvedOrder,
  }, { createInvoice: async () => ({ invoice: { status: 'rejected' } }) });
  assert.equal(rejected.status, 'failed');
  assert.equal(rejected.code, 'ARCA_REJECTED');

  const configuration = await executeInvoiceJobAttempt({
    job: { attempt_count: 1 },
    order: approvedOrder,
  }, {
    createInvoice: async () => {
      throw Object.assign(new Error('Falta ARCA_PTO_VTA'), { code: 'ARCA_PTO_VTA_REQUIRED' });
    },
  });
  assert.equal(configuration.status, 'failed');
  assert.equal(configuration.code, 'ARCA_PTO_VTA_REQUIRED');
});

test('un pago deja de ser elegible antes del worker y no llega a ARCA', async () => {
  for (const status of ['refunded', 'charged_back', 'cancelled']) {
    let called = false;
    const decision = await executeInvoiceJobAttempt({
      job: { attempt_count: 1 },
      order: { ...approvedOrder, mp_status: status },
    }, { createInvoice: async () => { called = true; } });
    assert.equal(decision.status, 'failed');
    assert.equal(decision.code, 'PAYMENT_NOT_APPROVED');
    assert.equal(called, false);
  }
});

test('cada ciclo recupera trabajos processing vencidos y fuerza un barrido seguro', async () => {
  const calls = [];
  const fakeClient = { name: 'test-pool' };
  const recoveries = [0, 1];
  const recoverStale = async (client) => {
    assert.equal(client, fakeClient);
    calls.push('recover');
    return recoveries.shift();
  };
  const runSweep = async (options) => {
    assert.equal(options.client, fakeClient);
    calls.push(`sweep:${options.allowConcurrent}`);
    return [];
  };

  await runInvoiceWorkerTick({ client: fakeClient, recoverStale, runSweep });
  await runInvoiceWorkerTick({ client: fakeClient, recoverStale, runSweep });

  assert.deepEqual(calls, [
    'recover', 'sweep:false',
    'recover', 'sweep:true',
  ]);
});
