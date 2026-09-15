import test from 'node:test'
import assert from 'node:assert/strict'
import { buildShippingPackage } from './shippingPackage.js'
import { CARRIER_LIMITS, DEFAULT_PACKAGE } from '../config/correoArgentino.js'

test('sin medidas cargadas usa la caja por defecto', () => {
  const bulto = buildShippingPackage([{ quantity: 1, weightKg: 2 }])
  assert.equal(bulto.lengthCm, DEFAULT_PACKAGE.lengthCm)
  assert.equal(bulto.widthCm, DEFAULT_PACKAGE.widthCm)
  assert.equal(bulto.heightCm, DEFAULT_PACKAGE.heightCm)
  assert.equal(bulto.hasRealDimensions, false)
})

test('sin peso cargado cae al mínimo, igual que el tarifario manual', () => {
  const bulto = buildShippingPackage([{ quantity: 1 }])
  assert.equal(bulto.weightKg, 0.5)
  assert.equal(bulto.weightGrams, 500)
})

test('el bulto se apila: base del más grande, alto sumado', () => {
  const bulto = buildShippingPackage([
    { quantity: 1, lengthCm: 40, widthCm: 20, heightCm: 10, weightKg: 1 },
    { quantity: 2, lengthCm: 25, widthCm: 30, heightCm: 5, weightKg: 0.5 },
  ])
  assert.equal(bulto.lengthCm, 40)  // el más largo manda
  assert.equal(bulto.widthCm, 30)   // el más ancho manda
  assert.equal(bulto.heightCm, 20)  // 10 + 5×2
  assert.equal(bulto.weightKg, 2)   // 1 + 0,5×2
  assert.equal(bulto.weightGrams, 2000)
  assert.equal(bulto.hasRealDimensions, true)
})

test('una medida faltante se completa sin descartar las que sí están', () => {
  const bulto = buildShippingPackage([{ quantity: 1, lengthCm: 120, weightKg: 1 }])
  assert.equal(bulto.lengthCm, 120)
  assert.equal(bulto.widthCm, DEFAULT_PACKAGE.widthCm)
  assert.equal(bulto.heightCm, DEFAULT_PACKAGE.heightCm)
})

test('ningún lado supera el máximo que acepta la API', () => {
  // 60 unidades apiladas de 10 cm darían 600 cm: se recorta en vez de armar un
  // bulto que la API rechazaría con 400.
  const bulto = buildShippingPackage([{ quantity: 60, lengthCm: 10, widthCm: 10, heightCm: 10, weightKg: 0.1 }])
  assert.equal(bulto.heightCm, CARRIER_LIMITS.maxSideCm)
})

test('un carrito vacío devuelve la caja por defecto y no rompe', () => {
  const bulto = buildShippingPackage([])
  assert.equal(bulto.lengthCm, DEFAULT_PACKAGE.lengthCm)
  assert.equal(bulto.weightKg, 0.5)
})
