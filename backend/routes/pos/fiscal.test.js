import test from 'node:test'
import assert from 'node:assert/strict'
import { getCuitEnding, periodRange, approximateDeadline, daysBetween } from './fiscal.js'

test('getCuitEnding lee el último dígito de ARCA_CUIT', () => {
  const original = process.env.ARCA_CUIT
  try {
    process.env.ARCA_CUIT = '20111111112'
    assert.equal(getCuitEnding(), 2)
    process.env.ARCA_CUIT = ''
    assert.equal(getCuitEnding(), null)
    delete process.env.ARCA_CUIT
    assert.equal(getCuitEnding(), null)
    process.env.ARCA_CUIT = '123' // muy corto, inválido
    assert.equal(getCuitEnding(), null)
  } finally {
    if (original === undefined) delete process.env.ARCA_CUIT
    else process.env.ARCA_CUIT = original
  }
})

test('periodRange arma el primer y último día del mes, incluso en febrero bisiesto', () => {
  assert.deepEqual(periodRange(2026, 9), { start: '2026-09-01', end: '2026-09-30' })
  assert.deepEqual(periodRange(2024, 2), { start: '2024-02-01', end: '2024-02-29' }) // bisiesto
  assert.deepEqual(periodRange(2026, 2), { start: '2026-02-01', end: '2026-02-28' })
})

test('approximateDeadline cae en el mes SIGUIENTE al período, nunca en el mismo', () => {
  const date = approximateDeadline(2026, 9, 0)
  assert.ok(date.startsWith('2026-10'), `esperaba octubre, dio ${date}`)
})

test('approximateDeadline nunca cae en fin de semana', () => {
  for (let cuitEnding = 0; cuitEnding <= 9; cuitEnding++) {
    const date = approximateDeadline(2026, 6, cuitEnding)
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay()
    assert.notEqual(dow, 0, `terminación ${cuitEnding} cayó domingo: ${date}`)
    assert.notEqual(dow, 6, `terminación ${cuitEnding} cayó sábado: ${date}`)
  }
})

test('approximateDeadline cruza de año en diciembre', () => {
  const date = approximateDeadline(2026, 12, 5)
  assert.ok(date.startsWith('2027-01'), `esperaba enero 2027, dio ${date}`)
})

test('daysBetween cuenta días calendario, positivo hacia adelante y negativo si ya pasó', () => {
  assert.equal(daysBetween('2026-09-13', '2026-09-18'), 5)
  assert.equal(daysBetween('2026-09-13', '2026-09-08'), -5)
  assert.equal(daysBetween('2026-09-13', '2026-09-13'), 0)
})
