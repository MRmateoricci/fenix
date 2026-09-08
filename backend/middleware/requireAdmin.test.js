import assert from 'node:assert/strict'
import test from 'node:test'
import jwt from 'jsonwebtoken'
import { ADMIN_COOKIE_NAME, requireAdmin } from './requireAdmin.js'

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this },
    json(payload) { this.payload = payload; return this },
  }
}

test('acepta una cookie administrativa firmada y rechaza tokens de cliente', () => {
  const previous = process.env.ADMIN_SESSION_SECRET
  process.env.ADMIN_SESSION_SECRET = 'test-admin-session-secret'
  try {
    const valid = jwt.sign({ role: 'admin' }, process.env.ADMIN_SESSION_SECRET, { expiresIn: '1h' })
    let continued = false
    const req = { method: 'GET', cookies: { [ADMIN_COOKIE_NAME]: valid }, get: () => undefined }
    requireAdmin(req, responseRecorder(), () => { continued = true })
    assert.equal(continued, true)

    const invalid = jwt.sign({ userId: 'customer' }, process.env.ADMIN_SESSION_SECRET, { expiresIn: '1h' })
    const response = responseRecorder()
    requireAdmin({ ...req, cookies: { [ADMIN_COOKIE_NAME]: invalid } }, response, () => {})
    assert.equal(response.statusCode, 401)
  } finally {
    if (previous == null) delete process.env.ADMIN_SESSION_SECRET
    else process.env.ADMIN_SESSION_SECRET = previous
  }
})

test('rechaza una mutacion administrativa desde un origen externo', () => {
  const previousSecret = process.env.ADMIN_SESSION_SECRET
  const previousFrontend = process.env.FRONTEND_BASE_URL
  process.env.ADMIN_SESSION_SECRET = 'test-admin-session-secret'
  process.env.FRONTEND_BASE_URL = 'https://fenix.example'
  try {
    const token = jwt.sign({ role: 'admin' }, process.env.ADMIN_SESSION_SECRET)
    const response = responseRecorder()
    const headers = { origin: 'https://attacker.example', host: 'api.fenix.example' }
    requireAdmin({
      method: 'POST', protocol: 'https', cookies: { [ADMIN_COOKIE_NAME]: token },
      get: name => headers[String(name).toLowerCase()],
    }, response, () => {})
    assert.equal(response.statusCode, 403)
  } finally {
    if (previousSecret == null) delete process.env.ADMIN_SESSION_SECRET
    else process.env.ADMIN_SESSION_SECRET = previousSecret
    if (previousFrontend == null) delete process.env.FRONTEND_BASE_URL
    else process.env.FRONTEND_BASE_URL = previousFrontend
  }
})

test('acepta una mutacion administrativa desde localhost en desarrollo', () => {
  const previousSecret = process.env.ADMIN_SESSION_SECRET
  const previousEnv = process.env.NODE_ENV
  process.env.ADMIN_SESSION_SECRET = 'test-admin-session-secret'
  delete process.env.NODE_ENV
  try {
    const token = jwt.sign({ role: 'admin' }, process.env.ADMIN_SESSION_SECRET)
    const response = responseRecorder()
    let continued = false
    const headers = { origin: 'http://localhost:5174', host: 'localhost:3001' }
    requireAdmin({
      method: 'POST', protocol: 'http', cookies: { [ADMIN_COOKIE_NAME]: token },
      get: name => headers[String(name).toLowerCase()],
    }, response, () => { continued = true })
    assert.equal(continued, true)
    assert.equal(response.statusCode, 200)
  } finally {
    if (previousSecret == null) delete process.env.ADMIN_SESSION_SECRET
    else process.env.ADMIN_SESSION_SECRET = previousSecret
    if (previousEnv == null) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousEnv
  }
})
