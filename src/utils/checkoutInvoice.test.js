import test from 'node:test'
import assert from 'node:assert/strict'
import { applyInvoiceMode, documentKindForNumber } from './checkoutInvoice.js'

const options = {
  documents: [
    { id: 80, kind: 'cuit' },
    { id: 96, kind: 'dni' },
  ],
  vatConditions: [
    { id: 1, category: 'registered', invoiceClass: 'A' },
    { id: 6, category: 'monotributo', invoiceClass: 'A' },
    { id: 5, category: 'consumer_final', invoiceClass: 'B' },
  ],
}

test('consumidor final resuelve DNI y condición IVA sin mostrar decisiones fiscales', () => {
  const result = applyInvoiceMode({ nombre: 'Mateo', apellido: 'Ricci', invoiceDocNumber: '' }, options, false)
  assert.equal(result.invoiceDocType, '96')
  assert.equal(result.invoiceVatConditionId, '5')
  assert.equal(result.invoiceName, 'Mateo Ricci')
})

test('Factura A exige elegir la condición cuando ARCA ofrece más de una', () => {
  const result = applyInvoiceMode({ invoiceDocNumber: '42172999', invoiceVatConditionId: '5' }, options, true)
  assert.equal(result.invoiceDocType, '80')
  assert.equal(result.invoiceDocNumber, '')
  assert.equal(result.invoiceVatConditionId, '')
})

test('DNI o CUIT se infiere por la cantidad de dígitos', () => {
  assert.equal(documentKindForNumber('42.172.999'), 'dni')
  assert.equal(documentKindForNumber('30-12345678-9'), 'cuit')
})
