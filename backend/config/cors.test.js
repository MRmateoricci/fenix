import test from 'node:test'
import assert from 'node:assert/strict'
import { createCorsOptionsDelegate, normalizeOrigin, requestOrigin } from './cors.js'

function fakeRequest(headers = {}, protocol = 'http') {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  )

  return {
    protocol,
    get(name) {
      return normalizedHeaders[name.toLowerCase()]
    },
  }
}

function corsDecision(req, origin, config = {}) {
  return new Promise((resolve) => {
    createCorsOptionsDelegate(config)(req, (_error, options) => {
      options.origin(origin, (error, allowed) => resolve({ error, allowed }))
    })
  })
}

test('normaliza espacios, rutas y barras finales en los orígenes configurados', () => {
  assert.equal(
    normalizeOrigin(' https://fenixelectricidadiluminacion.com/tienda/ '),
    'https://fenixelectricidadiluminacion.com'
  )
  assert.equal(normalizeOrigin('file:///archivo-local'), null)
  assert.equal(normalizeOrigin('origen-invalido'), null)
})

test('obtiene el origen público desde los encabezados del proxy', () => {
  const req = fakeRequest({
    host: 'fenix-web.internal:3001',
    'x-forwarded-host': 'fenixelectricidadiluminacion.com',
    'x-forwarded-proto': 'https',
  })

  assert.equal(requestOrigin(req), 'https://fenixelectricidadiluminacion.com')
})

test('permite el dominio personalizado cuando coincide con el request público', async () => {
  const req = fakeRequest({
    host: 'fenix-web.internal:3001',
    'x-forwarded-host': 'fenixelectricidadiluminacion.com',
    'x-forwarded-proto': 'https',
  })

  const result = await corsDecision(req, 'https://fenixelectricidadiluminacion.com', {
    appBaseUrl: 'https://fenix-web.up.railway.app',
    frontendBaseUrl: 'https://fenix-web.up.railway.app/',
  })

  assert.equal(result.error, null)
  assert.equal(result.allowed, true)
})

test('rechaza un origen externo aunque llegue al mismo backend', async () => {
  const req = fakeRequest({
    host: 'fenixelectricidadiluminacion.com',
    'x-forwarded-proto': 'https',
  })

  const result = await corsDecision(req, 'https://sitio-malicioso.example')

  assert.match(result.error.message, /CORS: origen no permitido/)
  assert.equal(result.error.status, 403)
  assert.equal(result.allowed, undefined)
})
