import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMercadoPagoWebhook } from './webhooks.js';

function request(paymentId = '123456789') {
  return {
    body: { type: 'payment', data: { id: paymentId } },
    headers: {},
    originalUrl: '/api/webhooks/mercadopago',
  };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
  };
}

test('el webhook responde 200 aunque el intento ARCA haya fallado', async () => {
  const res = response();
  await handleMercadoPagoWebhook(request(), res, {
    verifySignature: () => true,
    reconcile: async () => ({
      order: { id: 'order-1', status: 'paid' },
      invoiceAttempt: { attempted: true, status: 'failed', code: 'ARCA_WSFE_CONNECTION_ERROR' },
    }),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, 'OK');
});

test('una notificación que no es de pago responde 200 sin conciliar', async () => {
  const req = request();
  req.body.type = 'merchant_order';
  const res = response();
  let called = false;
  await handleMercadoPagoWebhook(req, res, {
    verifySignature: () => true,
    reconcile: async () => { called = true; },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(called, false);
});
