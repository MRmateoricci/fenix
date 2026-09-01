import test from 'node:test'
import assert from 'node:assert/strict'
import {
  plazoMaximo,
  sumarDiasHabiles,
  fechaRetiroMinima,
  fechaISOLocal,
  retiroDemasiadoTemprano,
  textoRetiroDisponible,
} from './plazoEntrega.js'

// 2026-09-01 es martes; 09-04 viernes, 09-05 sábado, 09-07 lunes.
const MARTES_1_SEP = new Date(2026, 8, 1)

test('plazoMaximo toma el mayor plazo del carrito, nunca la suma', () => {
  assert.equal(plazoMaximo([{ diasEntrega: 2 }, { diasEntrega: 8 }, { diasEntrega: 1 }]), 8)
  assert.equal(plazoMaximo([]), 0)
})

test('sumarDiasHabiles saltea el fin de semana', () => {
  assert.deepEqual(sumarDiasHabiles(new Date(2026, 8, 4), 1), new Date(2026, 8, 7))
  assert.deepEqual(sumarDiasHabiles(new Date(2026, 8, 1), 8), new Date(2026, 8, 11))
})

test('fechaRetiroMinima nunca es antes de un día hábil, aunque no haya plazo', () => {
  assert.deepEqual(fechaRetiroMinima(0, MARTES_1_SEP), new Date(2026, 8, 2))
})

test('fechaRetiroMinima suma los días hábiles de preparación', () => {
  assert.deepEqual(fechaRetiroMinima(2, MARTES_1_SEP), new Date(2026, 8, 3))
  assert.deepEqual(fechaRetiroMinima(8, MARTES_1_SEP), new Date(2026, 8, 11))
})

test('fechaISOLocal formatea en hora local sin desfasaje UTC', () => {
  assert.equal(fechaISOLocal(new Date(2026, 8, 11)), '2026-09-11')
  assert.equal(fechaISOLocal(new Date(2026, 0, 5)), '2026-01-05')
})

test('retiroDemasiadoTemprano detecta una fecha anterior al piso de preparación', () => {
  assert.equal(retiroDemasiadoTemprano('2026-09-03', 8, MARTES_1_SEP), true)
  assert.equal(retiroDemasiadoTemprano('2026-09-11', 8, MARTES_1_SEP), false)
  assert.equal(retiroDemasiadoTemprano('2026-09-15', 8, MARTES_1_SEP), false)
})

test('retiroDemasiadoTemprano ignora la fecha vacía — de eso se ocupa la validación de "requerido"', () => {
  assert.equal(retiroDemasiadoTemprano('', 8, MARTES_1_SEP), false)
})

test('textoRetiroDisponible usa la redacción compartida de plazos', () => {
  assert.equal(
    textoRetiroDisponible(8, MARTES_1_SEP),
    'Disponible para retirar a partir del 11 de septiembre',
  )
})
