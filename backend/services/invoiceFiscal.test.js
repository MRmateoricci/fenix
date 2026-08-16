import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInvoiceAmounts,
  buildInvoiceRequest,
  buildReceiverData,
  isValidCuit,
  InvoiceValidationError,
} from './invoiceFiscal.js';

test('valida y normaliza receptores DNI, CUIT y Consumidor Final', () => {
  assert.deepEqual(buildReceiverData({ name: 'Ana', docType: 96, docNumber: '12.345.678', vatConditionId: 5 }), {
    name: 'Ana', docType: 96, docNumber: '12345678', vatConditionId: 5,
  });
  assert.equal(isValidCuit('20-12345678-6'), true);
  assert.equal(buildReceiverData({ name: 'Empresa', docType: 80, docNumber: '20-12345678-6', vatConditionId: 6 }).docNumber, '20123456786');
  assert.equal(buildReceiverData({ name: 'Consumidor Final', docType: 99, docNumber: '', vatConditionId: 5 }).docNumber, '0');
  assert.throws(() => buildReceiverData({ name: 'X', docType: 96, docNumber: '12', vatConditionId: 5 }), InvoiceValidationError);
});

test('Factura C usa centavos y no discrimina IVA', () => {
  const amounts = buildInvoiceAmounts({ total_amount: '1234.56' });
  assert.equal(amounts.totalCents, 123456);
  assert.equal(amounts.total, 1234.56);
  assert.equal(amounts.net, 1234.56);
  assert.equal(amounts.vat, 0);
});

test('payload Factura C contiene condición IVA y omite array Iva', () => {
  const built = buildInvoiceRequest({
    order: { total_amount: '100.00', invoice_concept: 1 },
    receiver: { docType: 96, docNumber: '12345678', vatConditionId: 5 },
    pointOfSale: 2, voucherType: 11, voucherNumber: 8, voucherDate: '2026-08-15',
  });
  const detail = built.request.FeDetReq.FECAEDetRequest[0];
  assert.equal(built.request.FeCabReq.CbteTipo, 11);
  assert.equal(detail.ImpIVA, 0);
  assert.equal(detail.ImpTotal, detail.ImpNeto + detail.ImpTrib);
  assert.equal(detail.CondicionIVAReceptorId, 5);
  assert.equal(Object.hasOwn(detail, 'Iva'), false);
});

test('servicios requieren y formatean las tres fechas fiscales', () => {
  assert.throws(() => buildInvoiceRequest({
    order: { total_amount: '100', invoice_concept: 2 },
    receiver: { docType: 96, docNumber: '12345678', vatConditionId: 5 },
    pointOfSale: 1, voucherNumber: 1,
  }), (error) => error.code === 'INVOICE_SERVICE_DATES_REQUIRED');

  const built = buildInvoiceRequest({
    order: {
      total_amount: '100', invoice_concept: 2,
      invoice_service_from: '2026-08-01', invoice_service_to: '2026-08-31',
      invoice_payment_due: '2026-09-10',
    },
    receiver: { docType: 96, docNumber: '12345678', vatConditionId: 5 },
    pointOfSale: 1, voucherNumber: 1, voucherDate: '2026-08-15',
  });
  assert.equal(built.request.FeDetReq.FECAEDetRequest[0].FchServDesde, '20260801');
  assert.equal(built.request.FeDetReq.FECAEDetRequest[0].FchVtoPago, '20260910');
});
