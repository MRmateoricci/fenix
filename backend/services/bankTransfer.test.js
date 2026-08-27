import assert from 'node:assert/strict'
import test from 'node:test'
import {
  accessTokenMatches,
  calculateTransferSubtotal,
  createCustomerAccessToken,
  detectProofMime,
  hashCustomerAccessToken,
  isValidCbu,
  normalizeBankTransferSettings,
  validateBankTransferSettings,
} from './bankTransfer.js'
import { invoiceAttemptEligibility } from './invoiceAttempts.js'
import { evaluateCoupon } from './coupons.js'

function verifier(digits, weights) {
  const sum = digits.split('').reduce((total, digit, index) => total + Number(digit) * weights[index], 0)
  return String((10 - (sum % 10)) % 10)
}

function validCbu() {
  const first = '2850590'
  const second = '4009041813520'
  return `${first}${verifier(first, [7, 1, 3, 9, 7, 1, 3])}${second}${verifier(second, [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3])}`
}

test('calcula el descuento bancario antes del cupon y redondea a centavos', () => {
  assert.deepEqual(calculateTransferSubtotal(199.99, 10), {
    transferDiscountAmount: 20,
    couponBase: 179.99,
  })
})

test('aplica cupon porcentual o fijo sobre el subtotal ya rebajado y no descuenta el envio', () => {
  const { transferDiscountAmount, couponBase } = calculateTransferSubtotal(1000, 10)
  assert.equal(transferDiscountAmount, 100)
  const percentage = evaluateCoupon({ active: true, type: 'percentage', value: 20 }, couponBase)
  const fixed = evaluateCoupon({ active: true, type: 'fixed', value: 100 }, couponBase)
  assert.equal(couponBase - percentage.amount + 50, 770)
  assert.equal(couponBase - fixed.amount + 50, 850)
})

test('valida checksum de CBU y exige datos completos al habilitar', () => {
  const cbu = validCbu()
  assert.equal(cbu.length, 22)
  assert.equal(isValidCbu(cbu), true)
  assert.equal(isValidCbu(`${cbu.slice(0, -1)}${cbu.endsWith('9') ? '0' : '9'}`), false)
  const settings = normalizeBankTransferSettings({
    bank_transfer_enabled: true,
    bank_transfer_discount_percent: 10,
    bank_transfer_expiry_hours: 72,
    bank_transfer_cbu: cbu,
    bank_transfer_alias: 'fenix.iluminacion',
    bank_transfer_account_holder: 'Fenix Iluminacion',
  })
  assert.equal(validateBankTransferSettings(settings), null)
  assert.match(validateBankTransferSettings({ ...settings, cbu: '' }), /CBU/)
})

test('el acceso de invitados conserva solo un hash verificable', () => {
  const token = createCustomerAccessToken()
  const hash = hashCustomerAccessToken(token)
  assert.equal(token.length, 64)
  assert.equal(hash.length, 64)
  assert.notEqual(token, hash)
  assert.equal(accessTokenMatches(token, hash), true)
  assert.equal(accessTokenMatches(`${token}x`, hash), false)
})

test('detecta la firma real de JPG, PNG y PDF y rechaza contenido disfrazado', () => {
  assert.equal(detectProofMime(Buffer.from('%PDF-1.7\n')), 'application/pdf')
  assert.equal(detectProofMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png')
  assert.equal(detectProofMime(Buffer.from([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9])), 'image/jpeg')
  assert.equal(detectProofMime(Buffer.from('archivo.exe')), null)
})

test('la facturacion de transferencia exige aprobacion manual', () => {
  const base = {
    status: 'paid', payment_method: 'bank_transfer', bank_transfer_approved: false,
    invoice_data_confirmed_at: new Date(), invoice_recipient_name: 'Cliente',
    invoice_doc_number: '12345678', invoice_doc_type: 96,
    invoice_vat_condition_id: 5, invoice_concept: 1,
  }
  assert.equal(invoiceAttemptEligibility(base).code, 'PAYMENT_NOT_APPROVED')
  assert.deepEqual(invoiceAttemptEligibility({ ...base, bank_transfer_approved: true }), { allowed: true })
})
