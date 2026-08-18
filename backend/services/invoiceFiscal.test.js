import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInvoiceAmounts,
  buildInvoiceRequest,
  buildReceiverData,
  determineVoucherType,
  FACTURA_A,
  FACTURA_A_SUJETA_RETENCION,
  FACTURA_B,
  FACTURA_C,
  isValidCuit,
  InvoiceValidationError,
  validateReceiverForVoucher,
} from './invoiceFiscal.js';

const validCuitReceiver = {
  name: 'Empresa', docType: 80, docNumber: '20123456786', vatConditionId: 1,
};

test('valida y normaliza receptores DNI, CUIT y Consumidor Final', () => {
  assert.deepEqual(buildReceiverData({ name: 'Ana', docType: 96, docNumber: '12.345.678', vatConditionId: 5 }), {
    name: 'Ana', docType: 96, docNumber: '12345678', vatConditionId: 5,
  });
  assert.equal(isValidCuit('20-12345678-6'), true);
  assert.equal(buildReceiverData({ name: 'Empresa', docType: 80, docNumber: '20-12345678-6', vatConditionId: 6 }).docNumber, '20123456786');
  assert.equal(buildReceiverData({ name: 'Consumidor Final', docType: 99, docNumber: '', vatConditionId: 5 }).docNumber, '0');
  assert.throws(() => buildReceiverData({ name: 'X', docType: 96, docNumber: '12', vatConditionId: 5 }), InvoiceValidationError);
});

test('Responsable Inscripto determina A/B por condición del receptor', () => {
  const context = { issuerVatCondition: 'Responsable Inscripto', aAuthorizationMode: 'standard' };
  assert.equal(determineVoucherType({ ...context, receiverVatCondition: 'Responsable Inscripto' }), FACTURA_A);
  assert.equal(determineVoucherType({ ...context, receiverVatCondition: 'Monotributo' }), FACTURA_A);
  assert.equal(determineVoucherType({ ...context, receiverVatCondition: 'Consumidor Final' }), FACTURA_B);
  assert.equal(determineVoucherType({ ...context, receiverVatCondition: 'Exento' }), FACTURA_B);
});

test('modo A sujeto a retención usa tipo 51 y nunca se asume standard', () => {
  assert.equal(determineVoucherType({
    issuerVatCondition: 'registered', receiverVatCondition: 'registered',
    aAuthorizationMode: 'subject_to_withholding',
  }), FACTURA_A_SUJETA_RETENCION);
  assert.throws(() => determineVoucherType({
    issuerVatCondition: 'registered', receiverVatCondition: 'registered',
  }), (error) => error.code === 'ARCA_A_AUTHORIZATION_MODE_REQUIRED');
});

test('Factura C queda reservada a emisores Monotributo o Exentos', () => {
  assert.equal(determineVoucherType({
    issuerVatCondition: 'Monotributo', receiverVatCondition: 'Consumidor Final',
  }), FACTURA_C);
  for (const receiverVatCondition of ['Responsable Inscripto', 'Monotributo', 'Consumidor Final', 'Exento']) {
    assert.notEqual(determineVoucherType({
      issuerVatCondition: 'Responsable Inscripto',
      receiverVatCondition,
      aAuthorizationMode: 'standard',
    }), FACTURA_C);
  }
});

test('Factura C usa centavos y no discrimina IVA', () => {
  const amounts = buildInvoiceAmounts({ total_amount: '1234.56' });
  assert.equal(amounts.totalCents, 123456);
  assert.equal(amounts.total, 1234.56);
  assert.equal(amounts.net, 1234.56);
  assert.equal(amounts.vat, 0);
  assert.deepEqual(amounts.ivaBreakdown, []);
});

test('precio final 121 calcula neto 100, IVA 21 y conserva el total', () => {
  for (const voucherType of [FACTURA_A, FACTURA_B, FACTURA_A_SUJETA_RETENCION]) {
    const amounts = buildInvoiceAmounts({ total_amount: '121.00' }, { voucherType, vatRate: 21 });
    assert.equal(amounts.net, 100);
    assert.equal(amounts.vat, 21);
    assert.equal(amounts.total, 121);
    assert.equal(amounts.netCents + amounts.vatCents, amounts.totalCents);
    assert.deepEqual(amounts.ivaBreakdown, [{
      rate: 21, baseCents: 10000, vatCents: 2100, base: 100, amount: 21,
    }]);
  }
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

test('payloads A y B incluyen alícuota WSFE, base e IVA', () => {
  for (const [voucherType, receiver] of [
    [FACTURA_A, validCuitReceiver],
    [FACTURA_B, { name: 'Ana', docType: 96, docNumber: '12345678', vatConditionId: 5 }],
  ]) {
    const built = buildInvoiceRequest({
      order: { total_amount: '121.00', invoice_concept: 1 },
      receiver,
      pointOfSale: 3,
      voucherType,
      voucherNumber: 8,
      voucherDate: '2026-08-15',
      vatRate: 21,
      vatRateId: 5,
    });
    const detail = built.request.FeDetReq.FECAEDetRequest[0];
    assert.equal(built.request.FeCabReq.CbteTipo, voucherType);
    assert.equal(detail.ImpNeto, 100);
    assert.equal(detail.ImpIVA, 21);
    assert.equal(detail.ImpTotal, 121);
    assert.deepEqual(detail.Iva.AlicIva, [{ Id: 5, BaseImp: 100, Importe: 21 }]);
  }
});

test('documento y umbral se validan según receptor y clase', () => {
  assert.throws(() => validateReceiverForVoucher({
    receiver: { name: 'RI', docType: 96, docNumber: '12345678', vatConditionId: 1 },
    receiverVatCondition: 'Responsable Inscripto', voucherType: FACTURA_A, totalAmount: 100,
  }), (error) => error.code === 'INVOICE_DOCUMENT_VOUCHER_MISMATCH');

  assert.throws(() => validateReceiverForVoucher({
    receiver: { name: 'CF', docType: 99, docNumber: '0', vatConditionId: 5 },
    receiverVatCondition: 'Consumidor Final', voucherType: FACTURA_B,
    totalAmount: '10000000.00',
  }), (error) => error.code === 'INVOICE_CONSUMER_IDENTIFICATION_REQUIRED');
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
