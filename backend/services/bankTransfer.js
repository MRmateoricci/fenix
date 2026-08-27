import crypto from 'crypto'

export const BANK_TRANSFER_METHOD = 'bank_transfer'
export const MAX_TRANSFER_PROOF_BYTES = 10 * 1024 * 1024

export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

export function calculateTransferSubtotal(productsTotal, discountPercent = 10) {
  const subtotal = roundMoney(productsTotal)
  const discount = roundMoney(subtotal * (Number(discountPercent) / 100))
  return {
    transferDiscountAmount: discount,
    couponBase: roundMoney(subtotal - discount),
  }
}

export function normalizeCbu(value) {
  return String(value || '').replace(/\D/g, '')
}

function validCbuBlock(block, weights) {
  const digits = block.split('').map(Number)
  const verifier = digits.pop()
  const sum = digits.reduce((total, digit, index) => total + digit * weights[index], 0)
  return verifier === ((10 - (sum % 10)) % 10)
}

export function isValidCbu(value) {
  const cbu = normalizeCbu(value)
  return /^\d{22}$/.test(cbu)
    && validCbuBlock(cbu.slice(0, 8), [7, 1, 3, 9, 7, 1, 3])
    && validCbuBlock(cbu.slice(8), [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3])
}

export function normalizeBankTransferSettings(row = {}) {
  return {
    enabled: row.bank_transfer_enabled === true || row.bank_transfer_enabled === 'true',
    discountPercent: Number(row.bank_transfer_discount_percent ?? 10),
    expiryHours: Number(row.bank_transfer_expiry_hours ?? 72),
    cbu: normalizeCbu(row.bank_transfer_cbu),
    alias: String(row.bank_transfer_alias || '').trim(),
    accountHolder: String(row.bank_transfer_account_holder || '').trim(),
  }
}

export function validateBankTransferSettings(settings) {
  if (!Number.isFinite(settings.discountPercent) || settings.discountPercent < 0 || settings.discountPercent >= 100) {
    return 'El descuento debe estar entre 0 y 99,99%'
  }
  if (!Number.isInteger(settings.expiryHours) || settings.expiryHours < 1 || settings.expiryHours > 720) {
    return 'La vigencia debe estar entre 1 y 720 horas'
  }
  if (settings.enabled && !isValidCbu(settings.cbu)) return 'Ingresá un CBU válido de 22 dígitos'
  if (settings.enabled && !/^[a-zA-Z0-9.-]{6,80}$/.test(settings.alias)) return 'Ingresá un alias bancario válido'
  if (settings.enabled && (settings.accountHolder.length < 2 || settings.accountHolder.length > 160)) {
    return 'Ingresá el titular de la cuenta bancaria'
  }
  return null
}

export function createCustomerAccessToken() {
  return crypto.randomBytes(32).toString('hex')
}

export function hashCustomerAccessToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

export function accessTokenMatches(token, expectedHash) {
  if (!token || !/^[a-f0-9]{64}$/i.test(String(expectedHash || ''))) return false
  const actual = Buffer.from(hashCustomerAccessToken(token), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  return crypto.timingSafeEqual(actual, expected)
}

export function detectProofMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null
  if (buffer.subarray(0, 4).equals(Buffer.from([0x25, 0x50, 0x44, 0x46]))) return 'application/pdf'
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9) {
    return 'image/jpeg'
  }
  return null
}

export function transferDisplayStatus(order, latestSubmission) {
  if (order?.status === 'paid' || latestSubmission?.status === 'approved') return 'approved'
  if (order?.status === 'expired') return 'expired'
  if (latestSubmission?.status === 'pending_review') return 'pending_review'
  if (latestSubmission?.status === 'rejected') return 'rejected'
  return 'awaiting_proof'
}
