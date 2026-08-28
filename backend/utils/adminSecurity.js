import crypto from 'crypto'

export function passwordsMatch(received, expected) {
  const left = crypto.createHash('sha256').update(String(received || '')).digest()
  const right = crypto.createHash('sha256').update(String(expected || '')).digest()
  return crypto.timingSafeEqual(left, right)
}

