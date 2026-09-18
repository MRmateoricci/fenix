import { CUOTAS } from '../config/payments.js'

// Los montos mínimos de cada tramo quedan fijos en código (desde $0, desde
// $500.000) — lo único editable desde el admin es la cantidad de cuotas de
// cada tramo.
const BASE_MINIMO = CUOTAS[0].minimo
const PREMIUM_MINIMO = CUOTAS[CUOTAS.length - 1].minimo

export const DEFAULT_BASE_INSTALLMENTS = CUOTAS[0].cantidad
export const DEFAULT_MAX_INSTALLMENTS = CUOTAS[CUOTAS.length - 1].cantidad

export function validateInstallmentTiers({ baseInstallments, maxInstallments }) {
  if (!Number.isInteger(baseInstallments) || baseInstallments < 1 || baseInstallments > 24) {
    return 'Las cuotas sin recargo (tramo base) deben ser un número entero entre 1 y 24'
  }
  if (!Number.isInteger(maxInstallments) || maxInstallments < 1 || maxInstallments > 24) {
    return 'Las cuotas máximas deben ser un número entero entre 1 y 24'
  }
  if (maxInstallments < baseInstallments) {
    return 'Las cuotas máximas no pueden ser menos que las cuotas del tramo base'
  }
  return null
}

// Arma los tramos de cuotas que consume GET /api/payments/config. Si los dos
// números quedaron iguales, no hay tramo "premium" que ofrecer aparte.
export function buildCuotas(baseInstallments, maxInstallments) {
  const base = { cantidad: baseInstallments, minimo: BASE_MINIMO }
  if (maxInstallments === baseInstallments) return [base]
  return [base, { cantidad: maxInstallments, minimo: PREMIUM_MINIMO }]
}
