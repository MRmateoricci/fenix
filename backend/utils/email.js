export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function isValidEmail(value) {
  const email = normalizeEmail(value)
  if (!email || email.length > 200) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}
