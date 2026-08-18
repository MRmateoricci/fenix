// Tramos de cuotas sin interés. Única fuente de verdad — ni el frontend ni
// otros módulos del backend deben hardcodear el número de cuotas o el monto
// mínimo; lo reciben de acá o de GET /api/payments/config.
//
// Debe mantenerse sincronizado con lo configurado en el panel de comerciante
// de Mercado Pago (ver CLAUDE.md §4.3): si difieren, el checkout no cumple lo
// que la tienda promete.
export const CUOTAS = [
  { cantidad: 3, minimo: 0 },
  { cantidad: 6, minimo: 500000 },
]

export const MAX_INSTALLMENTS = Math.max(...CUOTAS.map((c) => c.cantidad))

// Tramo de mayor cantidad de cuotas al que califica un `subtotal` dado.
export function getApplicableInstallments(subtotal) {
  const sorted = [...CUOTAS].sort((a, b) => b.minimo - a.minimo)
  return sorted.find((c) => subtotal >= c.minimo) ?? CUOTAS[0]
}
