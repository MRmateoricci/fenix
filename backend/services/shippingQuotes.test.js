import test from 'node:test'
import assert from 'node:assert/strict'
import { quoteShipping, normalizeDeliveryOption } from './shippingQuotes.js'
import { resetCorreoArgentinoTokenCache } from './correoArgentinoApi.js'

function fakeToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')
  return `header.${payload}.firma`
}

function withCredentials() {
  process.env.CORREO_ARGENTINO_API_URL = 'https://apitest.correoargentino.test/micorreo/v1'
  process.env.CORREO_ARGENTINO_USER = 'usuario'
  process.env.CORREO_ARGENTINO_PASSWORD = 'secreto'
  process.env.CORREO_ARGENTINO_CUSTOMER_ID = '0090000025'
  delete process.env.SHIPPING_PROVIDER
}

function clearCredentials() {
  delete process.env.CORREO_ARGENTINO_API_URL
  delete process.env.CORREO_ARGENTINO_USER
  delete process.env.CORREO_ARGENTINO_PASSWORD
  delete process.env.CORREO_ARGENTINO_CUSTOMER_ID
  delete process.env.SHIPPING_PROVIDER
}

// `rates` puede ser un array de tarifas o un Error para simular la caída.
function mockCorreo(rates) {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url)
    calls.push(href)
    if (href.includes('/token')) {
      return { ok: true, status: 200, json: async () => ({ token: fakeToken(), expires: '2999-01-01 10:00:00' }) }
    }
    if (rates instanceof Error) throw rates
    return { ok: true, status: 200, json: async () => ({ rates }) }
  }
  return { calls, restore: () => { globalThis.fetch = original } }
}

const TARIFAS_OK = [
  { deliveredType: 'D', productType: 'CP', productName: 'Correo Argentino Clasico', price: 12345.67, deliveryTimeMin: '2', deliveryTimeMax: '5' },
  { deliveredType: 'S', productType: 'CP', productName: 'Correo Argentino Clasico', price: 9876.54, deliveryTimeMin: '2', deliveryTimeMax: '5' },
]

// Lo que devuelve la API real: dos productos por modalidad, con el Expreso
// primero para que tomar "la primera del array" quede en evidencia.
const TARIFAS_CON_EXPRESO = [
  { deliveredType: 'S', productType: 'EP', productName: 'Correo Argentino Expreso', price: 6754.41, deliveryTimeMin: '1', deliveryTimeMax: '3' },
  { deliveredType: 'S', productType: 'CP', productName: 'Correo Argentino Clasico', price: 6140.56, deliveryTimeMin: '2', deliveryTimeMax: '5' },
  { deliveredType: 'D', productType: 'EP', productName: 'Correo Argentino Expreso', price: 10253.07, deliveryTimeMin: '1', deliveryTimeMax: '3' },
  { deliveredType: 'D', productType: 'CP', productName: 'Correo Argentino Clasico', price: 9320.5, deliveryTimeMin: '2', deliveryTimeMax: '5' },
]

const UN_ITEM = [{ quantity: 1, weightKg: 2, lengthCm: 30, widthCm: 20, heightCm: 10 }]

test.beforeEach(() => {
  resetCorreoArgentinoTokenCache()
  withCredentials()
})

test.after(() => { clearCredentials() })

// ── La API manda cuando puede cotizar ────────────────────────────────────────
test('la tarifa de la API se cobra tal cual, sin sumarle seguro ni IVA', async () => {
  const fetchMock = mockCorreo(TARIFAS_OK)
  try {
    const quote = await quoteShipping({ postalCode: '1704', weightKg: 2, declaredValue: 500000, items: UN_ITEM })
    assert.equal(quote.source, 'correo_argentino')
    assert.equal(quote.cost, 12345.67)
    // El valor declarado es alto a propósito: si se estuviera aplicando el
    // seguro del 2 % el costo sería otro.
    assert.equal(quote.breakdown.insurance, 0)
    assert.equal(quote.breakdown.iva, 0)
    assert.equal(quote.breakdown.surcharge, 0)
    assert.equal(quote.breakdown.total, 12345.67)
  } finally {
    fetchMock.restore()
  }
})

test('se cobra el Clásico aunque el Expreso venga primero en la respuesta', async () => {
  const fetchMock = mockCorreo(TARIFAS_CON_EXPRESO)
  try {
    const domicilio = await quoteShipping({ postalCode: '1900', weightKg: 2, items: UN_ITEM })
    // La tienda vende un solo servicio, 'clasico'. Tomar la primera tarifa de
    // cada modalidad le cobraría Expreso al cliente sin que lo haya pedido.
    assert.equal(domicilio.cost, 9320.5)
    assert.deepEqual(domicilio.transit, { min: 2, max: 5 })

    const sucursal = await quoteShipping({ postalCode: '1900', weightKg: 2, deliveryOption: 'branch', items: UN_ITEM })
    assert.equal(sucursal.cost, 6140.56)
  } finally {
    fetchMock.restore()
  }
})

test('si Correo no cotizó el Clásico, la cotización dice Expreso y cobra Expreso', async () => {
  const fetchMock = mockCorreo([
    { deliveredType: 'D', productType: 'EP', productName: 'Expreso', price: 20000, deliveryTimeMin: '1', deliveryTimeMax: '3' },
  ])
  try {
    const quote = await quoteShipping({ postalCode: '1900', weightKg: 2, items: UN_ITEM })
    // Lo peligroso sería cobrar $20.000 y registrar el pedido como Clásico: el
    // cliente pagaría Expreso y esperaría el plazo del Clásico, o al revés.
    assert.equal(quote.service, 'expreso')
    assert.equal(quote.cost, 20000)
    assert.deepEqual(quote.transit, { min: 1, max: 3 })
  } finally {
    fetchMock.restore()
  }
})

test('un producto que la API no nombra se descarta en vez de venderse sin nombre', async () => {
  const fetchMock = mockCorreo([
    { deliveredType: 'D', productType: 'CP', productName: 'Clasico', price: 20000, deliveryTimeMin: '2', deliveryTimeMax: '5' },
    { deliveredType: 'D', productType: 'XX', productName: 'Vaya a saber', price: 1, deliveryTimeMin: '1', deliveryTimeMax: '1' },
  ])
  try {
    const quote = await quoteShipping({ postalCode: '1900', weightKg: 2, items: UN_ITEM })
    assert.equal(quote.cost, 20000)
    assert.equal(quote.options.length, 1)
  } finally {
    fetchMock.restore()
  }
})

test('se puede pedir Expreso explícitamente y se cobra Expreso', async () => {
  const fetchMock = mockCorreo(TARIFAS_CON_EXPRESO)
  try {
    const quote = await quoteShipping({ postalCode: '1900', weightKg: 2, service: 'expreso', items: UN_ITEM })
    assert.equal(quote.service, 'expreso')
    assert.equal(quote.cost, 10253.07)
    assert.deepEqual(quote.transit, { min: 1, max: 3 })
    // Las cuatro combinaciones vuelven juntas: dos modalidades × dos servicios.
    assert.equal(quote.options.length, 4)
  } finally {
    fetchMock.restore()
  }
})

test('con el tarifario no se ofrece Expreso: sólo se sabe tarifar el Clásico', async () => {
  const fetchMock = mockCorreo(new Error('ECONNRESET'))
  try {
    const quote = await quoteShipping({ postalCode: '1900', weightKg: 2, service: 'expreso', declaredValue: 50000, items: UN_ITEM })
    // Cobrar la tarifa del Clásico por un Expreso sería vender más caro de lo
    // que se cobra. El pedido queda registrado como Clásico, que es lo que se
    // cobró y lo que se va a despachar.
    assert.equal(quote.service, 'clasico')
    assert.equal(quote.options.length, 1)
    assert.equal(quote.options[0].service, 'clasico')
  } finally {
    fetchMock.restore()
  }
})

test('la cotización trae el tránsito real que informó la API', async () => {
  const fetchMock = mockCorreo(TARIFAS_OK)
  try {
    const quote = await quoteShipping({ postalCode: '1704', weightKg: 2, items: UN_ITEM })
    assert.deepEqual(quote.transit, { min: 2, max: 5 })
  } finally {
    fetchMock.restore()
  }
})

test('domicilio y sucursal se cotizan juntos y la sucursal sale más barata', async () => {
  const fetchMock = mockCorreo(TARIFAS_OK)
  try {
    const sucursal = await quoteShipping({ postalCode: '1704', weightKg: 2, deliveryOption: 'branch', items: UN_ITEM })
    assert.equal(sucursal.deliveryOption, 'branch')
    assert.equal(sucursal.cost, 9876.54)
    assert.equal(sucursal.id, 'correo_sucursal')
    // Las dos modalidades vuelven en la misma respuesta: el checkout no vuelve
    // a cotizar cuando el cliente cambia de opción.
    assert.deepEqual(
      sucursal.options.map((o) => [o.deliveryOption, o.cost]).sort(),
      [['branch', 9876.54], ['home', 12345.67]],
    )
  } finally {
    fetchMock.restore()
  }
})

// ── El fallback sostiene el checkout ─────────────────────────────────────────
test('si la API se cae se cotiza con el tarifario y la compra sigue', async () => {
  const fetchMock = mockCorreo(new Error('ECONNRESET'))
  try {
    const quote = await quoteShipping({ postalCode: '1900', weightKg: 2, declaredValue: 50000, items: UN_ITEM })
    assert.ok(quote, 'la caída de Correo no puede dejar al checkout sin cotización')
    assert.equal(quote.source, 'andreani')
    assert.ok(quote.cost > 0)
    // Sin dato de la API, el tránsito lo resuelve la banda de CP.
    assert.equal(quote.transit, null)
  } finally {
    fetchMock.restore()
  }
})

test('sin credenciales se usa el tarifario sin intentar la llamada', async () => {
  clearCredentials()
  const fetchMock = mockCorreo(TARIFAS_OK)
  try {
    const quote = await quoteShipping({ postalCode: '1900', weightKg: 2, declaredValue: 50000, items: UN_ITEM })
    assert.equal(quote.source, 'andreani')
    assert.equal(fetchMock.calls.length, 0)
  } finally {
    fetchMock.restore()
    withCredentials()
  }
})

test('SHIPPING_PROVIDER=manual apaga la API por completo', async () => {
  process.env.SHIPPING_PROVIDER = 'manual'
  const fetchMock = mockCorreo(TARIFAS_OK)
  try {
    const quote = await quoteShipping({ postalCode: '1900', weightKg: 2, declaredValue: 50000, items: UN_ITEM })
    assert.equal(quote.source, 'andreani')
    assert.equal(fetchMock.calls.length, 0)
  } finally {
    fetchMock.restore()
    delete process.env.SHIPPING_PROVIDER
  }
})

test('un pedido de más de 25 kg no se le pregunta a la API: lo cotiza el tarifario', async () => {
  const fetchMock = mockCorreo(TARIFAS_OK)
  try {
    // 30 kg entra en el tramo 25–35 del tarifario Andreani, pero excede el
    // máximo de la API (25 kg).
    const quote = await quoteShipping({
      postalCode: '1900',
      weightKg: 30,
      declaredValue: 50000,
      items: [{ quantity: 1, weightKg: 30, lengthCm: 30, widthCm: 20, heightCm: 10 }],
    })
    assert.equal(quote.source, 'andreani')
    assert.equal(fetchMock.calls.length, 0)
  } finally {
    fetchMock.restore()
  }
})

test('la API cotiza el hueco de 20–25 kg que el tarifario no tarifa', async () => {
  const fetchMock = mockCorreo(TARIFAS_OK)
  try {
    // 22 kg cae en el hueco que Andreani nunca informó y que hasta ahora
    // derivaba a WhatsApp. La API sí lo cotiza (su máximo son 25 kg): con la
    // integración andando, esa venta deja de frenarse.
    const quote = await quoteShipping({
      postalCode: '1900',
      weightKg: 22,
      items: [{ quantity: 1, weightKg: 22 }],
    })
    assert.equal(quote.source, 'correo_argentino')
    assert.equal(quote.cost, 12345.67)
  } finally {
    fetchMock.restore()
  }
})

test('un peso que ninguna de las dos fuentes tarifa deriva a WhatsApp', async () => {
  const fetchMock = mockCorreo(TARIFAS_OK)
  try {
    // 60 kg: excede el máximo de la API (25 kg) y el del tarifario (50 kg).
    const quote = await quoteShipping({
      postalCode: '1900',
      weightKg: 60,
      items: [{ quantity: 1, weightKg: 60 }],
    })
    assert.equal(quote, null)
  } finally {
    fetchMock.restore()
  }
})

// ── Envío sin cargo por localidad ────────────────────────────────────────────
test('City Bell, Gonnet y Villa Elisa no se le cotizan a Correo', async () => {
  const fetchMock = mockCorreo(TARIFAS_OK)
  try {
    const quote = await quoteShipping({ postalCode: '1896', weightKg: 2, declaredValue: 500000, items: UN_ITEM })
    assert.equal(quote.cost, 0)
    assert.equal(quote.source, 'local_gratis')
    // La entrega la hace el local: gastar una llamada de red en un envío que
    // vale cero sería demorar el checkout para nada.
    assert.equal(fetchMock.calls.length, 0)
  } finally {
    fetchMock.restore()
  }
})

// ── Modalidad ────────────────────────────────────────────────────────────────
test('una modalidad desconocida cae en domicilio, no rompe el pedido', () => {
  assert.equal(normalizeDeliveryOption('branch'), 'branch')
  assert.equal(normalizeDeliveryOption('BRANCH'), 'branch')
  assert.equal(normalizeDeliveryOption('cualquiera'), 'home')
  assert.equal(normalizeDeliveryOption(undefined), 'home')
})

test('con la API caída, la sucursal se cobra a la tarifa de domicilio y no bloquea', async () => {
  const fetchMock = mockCorreo(new Error('timeout'))
  try {
    const quote = await quoteShipping({
      postalCode: '1900', weightKg: 2, declaredValue: 50000, deliveryOption: 'branch', items: UN_ITEM,
    })
    assert.ok(quote)
    assert.equal(quote.deliveryOption, 'branch')
    assert.equal(quote.source, 'andreani')
    // El tarifario no distingue modalidad: se cobra la de domicilio, que nunca
    // es más barata que la de sucursal, así que no se subcobra.
    assert.ok(quote.cost > 0)
  } finally {
    fetchMock.restore()
  }
})
