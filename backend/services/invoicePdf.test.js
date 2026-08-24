import test from 'node:test';
import assert from 'node:assert/strict';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { buildArcaQrPayload, buildArcaQrUrl, generateInvoicePdf } from './invoicePdf.js';

const invoice = {
  status: 'authorized', issuer_cuit: '20123456786', pto_vta: 2, cbte_tipo: 11,
  cbte_numero: 17, fecha_comprobante: '2026-08-15', imp_total: '1234.56',
  imp_neto: '1234.56', imp_iva: '0', iva_breakdown: [],
  currency: 'PES', currency_rate: '1', receiver_doc_type: 96,
  receiver_doc_number: '12345678', receiver_vat_condition_id: 5,
  cae: '74123456789012', cae_expiration_date: '2026-08-25',
  issuer_snapshot: { legalName: 'Fénix Iluminación', cuit: '20123456786', taxCondition: 'Monotributo', taxAddress: 'City Bell', activityStartDate: '2020-01-01' },
  receiver_snapshot: { name: 'Cliente Prueba', vatConditionId: 5, vatConditionDescription: 'Consumidor Final', address: 'Calle 1' },
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

test('PDF incorpora el logo de Fénix cuando el asset está disponible', async () => {
  const [withLogo, withoutLogo] = await Promise.all([
    generateInvoicePdf(invoice),
    generateInvoicePdf(invoice, { logoSource: false }),
  ]);
  const imageCount = (buffer) => (buffer.toString('latin1').match(/\/Subtype \/Image/g) || []).length;
  assert.ok(imageCount(withLogo) > imageCount(withoutLogo));
});

for (const [voucherType, label] of [[1, 'FACTURA A'], [6, 'FACTURA B']]) {
  test(`PDF ${label} muestra clase, neto, IVA, total y condiciones fiscales`, async () => {
    const fiscalInvoice = {
      ...invoice,
      cbte_tipo: voucherType,
      imp_total: '121.00',
      imp_neto: '100.00',
      imp_iva: '21.00',
      iva_breakdown: [{ rate: 21, base: 100, amount: 21 }],
      issuer_snapshot: {
        ...invoice.issuer_snapshot,
        taxCondition: 'Responsable Inscripto',
        aAuthorizationMode: 'standard',
        activityStartDate: '2024-01',
      },
      receiver_snapshot: {
        ...invoice.receiver_snapshot,
        vatConditionDescription: voucherType === 1 ? 'Responsable Inscripto' : 'Consumidor Final',
      },
    };
    const parsed = await pdfParse(await generateInvoicePdf(fiscalInvoice));
    assert.match(parsed.text, new RegExp(label));
    assert.match(parsed.text, /Neto gravado/);
    assert.match(parsed.text, /IVA 21%/);
    assert.match(parsed.text, /TOTAL/);
    assert.match(parsed.text, /Inicio de actividades: 01\/2024/);
    assert.match(parsed.text, /Responsable Inscripto|Consumidor Final/);
    if (voucherType === 6) {
      assert.match(parsed.text, /A CONSUMIDOR FINAL/);
      assert.match(parsed.text, /Régimen de Transparencia Fiscal al Consumidor \(Ley 27\.743\)/);
      assert.match(parsed.text, /IVA Contenido/);
      assert.match(parsed.text, /Otros Impuestos Nacionales Indirectos/);
    } else {
      assert.doesNotMatch(parsed.text, /Régimen de Transparencia Fiscal al Consumidor/);
    }
  });
}
