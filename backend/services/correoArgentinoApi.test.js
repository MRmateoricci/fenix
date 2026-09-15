import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CorreoArgentinoError,
  fetchAgencies,
  fetchRates,
  fitsCarrierLimits,
  resetCorreoArgentinoTokenCache,
} from './correoArgentinoApi.js'

// Token de juguete con el claim `exp` bien lejos, para que el cliente lo
// considere vigente. Sólo importa la parte del medio (el payload).
function fakeToken(expSeconds) {
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString('base64url')
  return `header.${payload}.firma`
}

const TOKEN_VIGENTE = fakeToken(Math.floor(Date.now() / 1000) + 3600)

function withCredentials() {
  process.env.CORREO_ARGENTINO_API_URL = 'https://apitest.correoargentino.test/micorreo/v1'
  process.env.CORREO_ARGENTINO_USER = 'usuario'
  process.env.CORREO_ARGENTINO_PASSWORD = 'secreto'
  process.env.CORREO_ARGENTINO_CUSTOMER_ID = '0090000025'
}

function clearCredentials() {
  delete process.env.CORREO_ARGENTINO_API_URL
  delete process.env.CORREO_ARGENTINO_USER
  delete process.env.CORREO_ARGENTINO_PASSWORD
  delete process.env.CORREO_ARGENTINO_CUSTOMER_ID
}

// Reemplaza fetch por un doble que responde según la URL y registra las
// llamadas, para poder afirmar qué se le mandó a Correo.
function mockFetch(handlers) {
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url)
    calls.push({ href, options, body: options.body ? JSON.parse(options.body) : null })
    const handler = Object.entries(handlers).find(([path]) => href.includes(path))?.[1]
    if (!handler) throw new Error(`Sin respuesta simulada para ${href}`)
    const { status = 200, body } = handler
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }
  }
  return { calls, restore: () => { globalThis.fetch = original } }
}

const OK_TOKEN = { body: { token: TOKEN_VIGENTE, expires: '2999-01-01 10:00:00' } }

const UN_BULTO = { weightGrams: 2500, lengthCm: 30, widthCm: 20, heightCm: 10 }

test.beforeEach(() => {
  resetCorreoArgentinoTokenCache()
  withCredentials()
})

test.after(() => {
  clearCredentials()
})

// ── Límites del transportista ────────────────────────────────────────────────
test('el bulto que excede los límites de la API se detecta sin llamarla', () => {
  assert.equal(fitsCarrierLimits(UN_BULTO), true)
  assert.equal(fitsCarrierLimits({ ...UN_BULTO, weightGrams: 25001 }), false) // más de 25 kg
  assert.equal(fitsCarrierLimits({ ...UN_BULTO, weightGrams: 0 }), false)
  assert.equal(fitsCarrierLimits({ ...UN_BULTO, lengthCm: 151 }), false)      // más de 150 cm
  assert.equal(fitsCarrierLimits({ ...UN_BULTO, heightCm: 0 }), false)
})

// ── /rates ───────────────────────────────────────────────────────────────────
test('la cotización manda el CP de origen, el customerId y dimensiones enteras', async () => {
  const fetchMock = mockFetch({
    '/token': OK_TOKEN,
    '/rates': {
      body: {
        rates: [
          { deliveredType: 'D', productType: 'CP', productName: 'Correo Argentino Clasico', price: 498.06, deliveryTimeMin: '2', deliveryTimeMax: '5' },
        ],
      },
    },
  })

  try {
    const rates = await fetchRates({
      postalCodeDestination: '1704',
      dimensions: { weightGrams: 2500.7, lengthCm: 30.4, widthCm: 20.2, heightCm: 10.9 },
    })

    const ratesCall = fetchMock.calls.find((c) => c.href.includes('/rates'))
    assert.equal(ratesCall.body.customerId, '0090000025')
    assert.equal(ratesCall.body.postalCodeOrigin, '1896') // City Bell
    assert.equal(ratesCall.body.postalCodeDestination, '1704')
    assert.deepEqual(ratesCall.body.dimensions, { weight: 2501, height: 11, width: 20, length: 30 })

    assert.equal(rates.length, 1)
    assert.equal(rates[0].price, 498.06)
    // La API los manda como string; el cliente los devuelve numéricos.
    assert.equal(rates[0].deliveryTimeMin, 2)
    assert.equal(rates[0].deliveryTimeMax, 5)
  } finally {
    fetchMock.restore()
  }
})

test('sin deliveredType se piden domicilio y sucursal en un solo viaje', async () => {
  const fetchMock = mockFetch({
    '/token': OK_TOKEN,
    '/rates': {
      body: {
        rates: [
          { deliveredType: 'D', productName: 'Correo Argentino Clasico', price: 498.06, deliveryTimeMin: '2', deliveryTimeMax: '5' },
          { deliveredType: 'S', productName: 'Correo Argentino Clasico', price: 398.06, deliveryTimeMin: '2', deliveryTimeMax: '5' },
        ],
      },
    },
  })

  try {
    const rates = await fetchRates({ postalCodeDestination: '1704', dimensions: UN_BULTO })
    assert.deepEqual(rates.map((r) => r.deliveredType), ['D', 'S'])
    const ratesCall = fetchMock.calls.find((c) => c.href.includes('/rates'))
    assert.equal('deliveredType' in ratesCall.body, false)
  } finally {
    fetchMock.restore()
  }
})

test('el token se pide una sola vez y se reusa entre cotizaciones', async () => {
  const fetchMock = mockFetch({
    '/token': OK_TOKEN,
    '/rates': { body: { rates: [{ deliveredType: 'D', price: 100, deliveryTimeMin: '2', deliveryTimeMax: '5' }] } },
  })

  try {
    await fetchRates({ postalCodeDestination: '1704', dimensions: UN_BULTO })
    await fetchRates({ postalCodeDestination: '5000', dimensions: UN_BULTO })
    assert.equal(fetchMock.calls.filter((c) => c.href.includes('/token')).length, 1)
  } finally {
    fetchMock.restore()
  }
})

test('las credenciales viajan en Basic Auth y nunca en la URL', async () => {
  const fetchMock = mockFetch({
    '/token': OK_TOKEN,
    '/rates': { body: { rates: [{ deliveredType: 'D', price: 100, deliveryTimeMin: '2', deliveryTimeMax: '5' }] } },
  })

  try {
    await fetchRates({ postalCodeDestination: '1704', dimensions: UN_BULTO })
    const tokenCall = fetchMock.calls.find((c) => c.href.includes('/token'))
    assert.equal(tokenCall.options.headers.Authorization, `Basic ${Buffer.from('usuario:secreto').toString('base64')}`)
    assert.equal(tokenCall.href.includes('secreto'), false)
  } finally {
    fetchMock.restore()
  }
})

test('credenciales rechazadas dan un error identificable, no una cotización', async () => {
  const fetchMock = mockFetch({
    '/token': { status: 401, body: { code: '401', message: 'Unauthorized' } },
  })

  try {
    await assert.rejects(
      () => fetchRates({ postalCodeDestination: '1704', dimensions: UN_BULTO }),
      (err) => err instanceof CorreoArgentinoError && err.code === 'CORREO_ARGENTINO_AUTH_FAILED',
    )
  } finally {
    fetchMock.restore()
  }
})

test('sin credenciales no se llama a la API', async () => {
  clearCredentials()
  const fetchMock = mockFetch({})

  try {
    await assert.rejects(
      () => fetchRates({ postalCodeDestination: '1704', dimensions: UN_BULTO }),
      (err) => err.code === 'CORREO_ARGENTINO_NOT_CONFIGURED',
    )
    assert.equal(fetchMock.calls.length, 0)
  } finally {
    fetchMock.restore()
    withCredentials()
  }
})

test('una respuesta sin tarifas no se toma como cotización válida', async () => {
  const fetchMock = mockFetch({
    '/token': OK_TOKEN,
    '/rates': { body: { rates: [] } },
  })

  try {
    await assert.rejects(
      () => fetchRates({ postalCodeDestination: '1704', dimensions: UN_BULTO }),
      (err) => err.code === 'CORREO_ARGENTINO_NO_RATES',
    )
  } finally {
    fetchMock.restore()
  }
})

// ── /agencies ────────────────────────────────────────────────────────────────
test('sólo se ofrecen sucursales activas que reciben paquetes', async () => {
  const fetchMock = mockFetch({
    '/token': OK_TOKEN,
    '/agencies': {
      body: [
        {
          code: 'B0107',
          name: 'Monte Grande',
          phone: '(03401) 448396',
          status: 'ACTIVE',
          services: { packageReception: true, pickupAvailability: true },
          location: { address: { streetName: 'Vicente Lopez', streetNumber: '448', locality: 'Monte Grande', province: 'Buenos Aires', provinceCode: 'B', postalCode: 'B1842ZAB' } },
        },
        // No recibe paquetes: mandar al cliente ahí sería mandarlo a buscar algo
        // que nunca va a llegar.
        { code: 'B0200', name: 'Sin recepción', status: 'ACTIVE', services: { packageReception: false }, location: {} },
        { code: 'B0300', name: 'Cerrada', status: 'INACTIVE', services: { packageReception: true }, location: {} },
      ],
    },
  })

  try {
    const agencies = await fetchAgencies('B')
    assert.equal(agencies.length, 1)
    assert.equal(agencies[0].code, 'B0107')
    assert.equal(agencies[0].street, 'Vicente Lopez 448')
    assert.equal(agencies[0].locality, 'Monte Grande')

    const call = fetchMock.calls.find((c) => c.href.includes('/agencies'))
    assert.ok(call.href.includes('customerId=0090000025'))
    assert.ok(call.href.includes('provinceCode=B'))
  } finally {
    fetchMock.restore()
  }
})
