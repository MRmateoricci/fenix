import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getManualShippingQuote,
  getTransitBusinessDays,
  qualifiesForFreeShipping,
  isFreeShippingPostalCode,
  FREE_SHIPPING_THRESHOLD,
} from './shipping.js'

// ── Zona por código postal ───────────────────────────────────────────────────
test('el CP resuelve a la zona Andreani correcta', () => {
  const zonaDe = (cp) => getManualShippingQuote({ postalCode: cp, weightKg: 1 })?.id
  // rosa
  assert.equal(zonaDe('1900'), 'rosa') // La Plata
  assert.equal(zonaDe('1425'), 'rosa') // CABA
  assert.equal(zonaDe('5000'), 'rosa') // Córdoba
  assert.equal(zonaDe('4200'), 'rosa') // Santiago del Estero
  assert.equal(zonaDe('5700'), 'rosa') // San Luis
  assert.equal(zonaDe('7600'), 'rosa') // Mar del Plata
  // salmón
  assert.equal(zonaDe('3300'), 'salmon') // Posadas
  assert.equal(zonaDe('4000'), 'salmon') // Tucumán
  assert.equal(zonaDe('5500'), 'salmon') // Mendoza
  assert.equal(zonaDe('8300'), 'salmon') // Neuquén
  // bordó
  assert.equal(zonaDe('4400'), 'bordo') // Salta
  assert.equal(zonaDe('9100'), 'bordo') // Trelew
  assert.equal(zonaDe('9410'), 'bordo') // Ushuaia
})

// ── Tramo por peso ───────────────────────────────────────────────────────────
test('el peso total elige el tramo (sin seguro: total = base × 1,21 + recargo fijo $4.000)', () => {
  const totalRosa = (kg) => getManualShippingQuote({ postalCode: '1900', weightKg: kg }).cost
  assert.equal(totalRosa(0.4), 15067.88) // 0–1 kg → base 9147,01 + recargo
  assert.equal(totalRosa(1), 15067.88) //   límite inferior inclusive
  assert.equal(totalRosa(2), 15067.88) // 1–2 kg → misma base
  assert.equal(totalRosa(2.5), 15881.33) // 2–3 kg → base 9819,28
  assert.equal(totalRosa(20), 47615.99) // 15–20 kg → base 36046,27
  assert.equal(totalRosa(25), 74430.47) // 25–35 kg → base 58207,00
  assert.equal(totalRosa(50), 95315.55) // 35–50 kg → base 75467,40
})

test('20–25 kg y más de 50 kg no cotizan automáticamente', () => {
  assert.equal(getManualShippingQuote({ postalCode: '1900', weightKg: 22 }), null)
  assert.equal(getManualShippingQuote({ postalCode: '1900', weightKg: 24.9 }), null)
  assert.equal(getManualShippingQuote({ postalCode: '1900', weightKg: 60 }), null)
})

test('sin peso cargado se cotiza el tramo más barato (0–1 kg)', () => {
  const sinPeso = getManualShippingQuote({ postalCode: '1900', weightKg: 0 })
  assert.equal(sinPeso.cost, 15067.88)
})

// ── Envío sin cargo por localidad (City Bell / Gonnet / Villa Elisa) ─────────
test('City Bell, Gonnet y Villa Elisa tienen envío gratis sin importar peso ni monto', () => {
  assert.equal(getManualShippingQuote({ postalCode: '1896', weightKg: 1 }).cost, 0) // City Bell
  assert.equal(getManualShippingQuote({ postalCode: '1897', weightKg: 3 }).cost, 0) // Gonnet
  assert.equal(getManualShippingQuote({ postalCode: '1894', weightKg: 10 }).cost, 0) // Villa Elisa
  // Peso que en cualquier otra zona no cotizaría: acá igual va gratis.
  assert.equal(getManualShippingQuote({ postalCode: '1896', weightKg: 22 }).cost, 0)
  assert.equal(getManualShippingQuote({ postalCode: '1896', weightKg: 80 }).cost, 0)
  // El seguro tampoco se cobra.
  assert.equal(getManualShippingQuote({ postalCode: '1896', weightKg: 2, declaredValue: 500000 }).cost, 0)
})

test('isFreeShippingPostalCode reconoce sólo las localidades sin cargo', () => {
  assert.equal(isFreeShippingPostalCode('1894'), true)
  assert.equal(isFreeShippingPostalCode('1896'), true)
  assert.equal(isFreeShippingPostalCode(' 1897 '), true)
  assert.equal(isFreeShippingPostalCode('1900'), false) // La Plata
  assert.equal(isFreeShippingPostalCode('1895'), false)
  assert.equal(isFreeShippingPostalCode('abc'), false)
})

// ── Seguro + IVA ─────────────────────────────────────────────────────────────
test('el seguro es 2 % del valor declarado y el IVA se aplica sobre base + seguro', () => {
  const quote = getManualShippingQuote({ postalCode: '9100', weightKg: 4, declaredValue: 50000 })
  assert.equal(quote.id, 'bordo')
  assert.deepEqual(quote.breakdown, {
    base: 17758.06,
    insurance: 1000,
    subtotal: 18758.06,
    iva: 3939.19,
    surcharge: 4000,
    total: 26697.25,
  })
  assert.equal(quote.cost, 26697.25)
})

// ── Casos borde ──────────────────────────────────────────────────────────────
test('CP inválido o servicio desconocido devuelven null', () => {
  assert.equal(getManualShippingQuote({ postalCode: 'abc', weightKg: 1 }), null)
  assert.equal(getManualShippingQuote({ postalCode: '12345', weightKg: 1 }), null)
  assert.equal(getManualShippingQuote({ postalCode: '', weightKg: 1 }), null)
  assert.equal(getManualShippingQuote({ postalCode: '1900', weightKg: 1, service: 'expreso' }), null)
})

// ── Días de tránsito: siguen resolviéndose por banda fina de CP ───────────────
test('el tránsito no se colapsa a las 3 zonas de tarifa', () => {
  assert.deepEqual(getTransitBusinessDays('1900'), { min: 1, max: 3, source: 'gran_la_plata' })
  assert.deepEqual(getTransitBusinessDays('5000'), { min: 2, max: 6, source: 'centro_litoral_cuyo' })
  assert.deepEqual(getTransitBusinessDays('9410'), { min: 12, max: 14, source: 'Tierra del Fuego' })
  assert.equal(getTransitBusinessDays('abc'), null)
})

// ── Envío gratis por umbral: sin cambios ─────────────────────────────────────
test('el envío gratis por umbral sigue siendo independiente del tarifario', () => {
  assert.equal(qualifiesForFreeShipping({ subtotal: FREE_SHIPPING_THRESHOLD }), true)
  assert.equal(qualifiesForFreeShipping({ subtotal: FREE_SHIPPING_THRESHOLD - 1 }), false)
})
