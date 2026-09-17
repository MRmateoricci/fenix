import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPseudoOrder, publicPosInvoice, POS_POINT_OF_SALE_ENV_VAR } from './invoicePosFiscal.js'
import { buildInvoiceAmounts, buildReceiverData } from './invoiceFiscal.js'

// El punto de venta del POS tiene que ser una env var distinta de la del
// e-commerce (ver config/arca.js) — este test documenta esa decisión y
// rompe visiblemente si alguna vez alguien la renombra por error.
test('el punto de venta del POS usa su propia env var, no la de la web', () => {
  assert.equal(POS_POINT_OF_SALE_ENV_VAR, 'ARCA_POS_PTO_VTA')
})

test('buildPseudoOrder da la forma que invoiceFiscal.js necesita de un "order"', () => {
  const sale = {
    total: 1210,
    discount_amount: 100,
    items: [
      { product_name: 'Interruptor', product_code: 'ALC-1', quantity: 2, unit_price: '500', line_total: '1000' },
    ],
  }
  const pseudoOrder = buildPseudoOrder(sale)

  assert.equal(pseudoOrder.total_amount, 1210)
  assert.equal(pseudoOrder.invoice_concept, 1) // mostrador = siempre "productos", nunca "servicios"
  assert.equal(pseudoOrder.items.length, 1)
  assert.equal(pseudoOrder.items[0].quantity, 2)

  // Confirma que efectivamente sirve como "order" para las funciones reales
  // que ya factura la web — no solo que tenga forma de objeto parecido.
  const amounts = buildInvoiceAmounts(pseudoOrder, { voucherType: 11 }) // Factura C
  assert.equal(amounts.total, 1210)
})

test('buildReceiverData acepta el input del POS (name/docType/docNumber/vatConditionId)', () => {
  const receiver = buildReceiverData(
    { name: 'Consumidor Final', docType: 99, docNumber: '0', vatConditionId: 5 },
    buildPseudoOrder({ total: 100, discount_amount: 0, items: [] }),
  )
  assert.equal(receiver.docType, 99)
  assert.equal(receiver.docNumber, '0')
  assert.equal(receiver.vatConditionId, 5)
})

test('publicPosInvoice nunca expone datos técnicos si se pide sin ellos', () => {
  const invoice = {
    id: 'inv-1', pos_sale_id: 'sale-1', status: 'authorized', pto_vta: 3, cbte_tipo: 6,
    cbte_numero: 42, fecha_comprobante: '2026-01-01', imp_total: '121', imp_neto: '100', imp_iva: '21',
    cae: '123456', cae_expiration_date: '2026-01-15', created_at: null, authorized_at: null,
    observations: ['algo'], errors: [],
  }
  const publicView = publicPosInvoice(invoice, { includeTechnicalMessages: false })
  assert.equal(publicView.saleId, 'sale-1')
  assert.equal(publicView.voucherClass, 'B')
  assert.equal(publicView.cae, '123456')
  assert.equal('observations' in publicView, false)
})

test('publicPosInvoice devuelve null sin factura', () => {
  assert.equal(publicPosInvoice(null), null)
})
