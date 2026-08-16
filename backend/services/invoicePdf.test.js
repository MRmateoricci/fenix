import test from 'node:test';
import assert from 'node:assert/strict';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { buildArcaQrPayload, buildArcaQrUrl, generateInvoicePdf } from './invoicePdf.js';

const invoice = {
  status: 'authorized', issuer_cuit: '20123456786', pto_vta: 2, cbte_tipo: 11,
  cbte_numero: 17, fecha_comprobante: '2026-08-15', imp_total: '1234.56',
  currency: 'PES', currency_rate: '1', receiver_doc_type: 96,
  receiver_doc_number: '12345678', receiver_vat_condition_id: 5,
  cae: '74123456789012', cae_expiration_date: '2026-08-25',
  issuer_snapshot: { legalName: 'Fénix Iluminación', cuit: '20123456786', taxCondition: 'Monotributo', taxAddress: 'City Bell', activityStartDate: '2020-01-01' },
  receiver_snapshot: { name: 'Cliente Prueba', vatConditionId: 5, address: 'Calle 1' },
  items_snapshot: { items: [{ name: 'Lámpara', quantity: 1, price: 1234.56, subtotal: 1234.56 }], discountAmount: 0, shippingCost: 0 },
};

test('payload QR usa exactamente los campos fiscales oficiales', () => {
  assert.deepEqual(buildArcaQrPayload(invoice), {
    ver: 1, fecha: '2026-08-15', cuit: 20123456786, ptoVta: 2, tipoCmp: 11,
    nroCmp: 17, importe: 1234.56, moneda: 'PES', ctz: 1,
    tipoDocRec: 96, nroDocRec: 12345678, tipoCodAut: 'E', codAut: 74123456789012,
  });
  const encoded = buildArcaQrUrl(invoice).split('?p=')[1];
  assert.deepEqual(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')), buildArcaQrPayload(invoice));
});

test('PDF contiene comprobante, total, CAE y vencimiento', async () => {
  const buffer = await generateInvoicePdf(invoice);
  assert.equal(buffer.subarray(0, 4).toString(), '%PDF');
  const parsed = await pdfParse(buffer);
  assert.match(parsed.text, /00002-00000017/);
  assert.match(parsed.text, /74123456789012/);
  assert.match(parsed.text, /25\/08\/2026/);
});
