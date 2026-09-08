// Días hábiles = lunes a viernes. No se contemplan feriados: no hay calendario
// cargado y el margen de los plazos de la tienda (config/shipping.js +
// store_settings) absorbe ese desfasaje. Compartido por la estimación de
// entrega del correo y la validación de la fecha de retiro en el local, para
// que ambos cuenten los días igual.

export function isBusinessDay(date) {
  const day = date.getDay()
  return day !== 0 && day !== 6
}

export function addBusinessDays(from, days) {
  const result = new Date(from)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    if (isBusinessDay(result)) added++
  }
  return result
}
