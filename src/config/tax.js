// Espejo de backend/config/tax.js, que es la autoridad. La tienda publica
// siempre importes finales con IVA incluido: acá solo se hace el camino
// inverso, para poder mostrar el neto discriminado en la tarjeta y la ficha.
// Si cambia la alícuota, cambiala en los dos archivos.
export const DEFAULT_VAT_RATE = 21
export const IVA_MULTIPLIER = 1 + (DEFAULT_VAT_RATE / 100)

// Sacar el IVA es dividir por el multiplicador, no restarle el 21% al final:
// restar da el 79% del precio, que es un número más bajo que el neto real
// (con $12.760 la resta da $10.080 y el neto es $10.545).
export function precioSinIva(precioFinal) {
  const value = Number(precioFinal)
  return Number.isFinite(value) ? value / IVA_MULTIPLIER : 0
}
