import test from 'node:test'
import assert from 'node:assert/strict'
import { estimateDeliveryDate } from './correoArgentino.js'
import { getTransitBusinessDays } from '../config/shipping.js'

test('el tránsito que informó la API manda sobre la banda de CP', async () => {
  // La banda propia para el 9100 (Patagonia) es 3–7 días hábiles. Si la API
  // dice otra cosa, gana la API: es el dato del transportista que va a hacer
  // el viaje, no una estimación nuestra.
  assert.deepEqual(
    { min: getTransitBusinessDays('9100').min, max: getTransitBusinessDays('9100').max },
    { min: 3, max: 7 },
  )

  const estimate = await estimateDeliveryDate('9100', 0, { transit: { min: 2, max: 4 } })
  assert.equal(estimate.carrierMinBusinessDays, 2)
  assert.equal(estimate.carrierMaxBusinessDays, 4)
})

test('sin tránsito de la API se usa la banda de CP del tarifario propio', async () => {
  const estimate = await estimateDeliveryDate('9100', 0)
  assert.equal(estimate.carrierMinBusinessDays, 3)
  assert.equal(estimate.carrierMaxBusinessDays, 7)
})

test('un rango dado vuelta se descarta en favor de la banda propia', async () => {
  // "Entre 9 y 2 días" no se le puede mostrar a nadie.
  const estimate = await estimateDeliveryDate('9100', 0, { transit: { min: 9, max: 2 } })
  assert.equal(estimate.carrierMinBusinessDays, 3)
  assert.equal(estimate.carrierMaxBusinessDays, 7)
})

test('la preparación del pedido se suma a los dos extremos', async () => {
  const estimate = await estimateDeliveryDate('1900', 4, { transit: { min: 2, max: 5 } })
  assert.equal(estimate.minBusinessDays, 6)
  assert.equal(estimate.maxBusinessDays, 9)
  assert.ok(estimate.minDate instanceof Date)
  assert.ok(estimate.maxDate >= estimate.minDate)
})

test('Tierra del Fuego mantiene su excepción cuando no hay dato de la API', async () => {
  const estimate = await estimateDeliveryDate('9410', 0)
  assert.equal(estimate.carrierMinBusinessDays, 12)
  assert.equal(estimate.carrierMaxBusinessDays, 14)
})
