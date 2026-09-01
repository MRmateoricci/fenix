import test from 'node:test'
import assert from 'node:assert/strict'
import { isBusinessDay, addBusinessDays } from './businessDays.js'

// 2026-09-01 es martes; 09-04 viernes, 09-05 sábado, 09-06 domingo, 09-07 lunes.

test('isBusinessDay excluye sábado y domingo', () => {
  assert.equal(isBusinessDay(new Date(2026, 8, 4)), true)   // viernes
  assert.equal(isBusinessDay(new Date(2026, 8, 5)), false)  // sábado
  assert.equal(isBusinessDay(new Date(2026, 8, 6)), false)  // domingo
  assert.equal(isBusinessDay(new Date(2026, 8, 7)), true)   // lunes
})

test('addBusinessDays suma un día hábil salteando el fin de semana', () => {
  assert.deepEqual(addBusinessDays(new Date(2026, 8, 1), 1), new Date(2026, 8, 2))
  assert.deepEqual(addBusinessDays(new Date(2026, 8, 4), 1), new Date(2026, 8, 7))
})

test('addBusinessDays cuenta 8 días hábiles', () => {
  assert.deepEqual(addBusinessDays(new Date(2026, 8, 1), 8), new Date(2026, 8, 11))
})

test('addBusinessDays no muta la fecha recibida', () => {
  const origen = new Date(2026, 8, 1)
  addBusinessDays(origen, 5)
  assert.deepEqual(origen, new Date(2026, 8, 1))
})
