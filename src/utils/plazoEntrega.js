// Plazo de preparación en palabras.
//
// La tienda NO muestra plazos mientras el cliente navega: ni en la ficha, ni en
// la tarjeta, ni en el carrito. Antes de conocer el domicilio cualquier número
// es incompleto, y adelantarlo espanta compras que igual llegaban a tiempo.
// Sólo quedan dos lugares: el checkout con retiro en local (donde no hay fecha
// de envío que lo cubra) y el resumen del pedido ya hecho.
//
// El número siempre viene del backend (products.stock_inmediato + los plazos de
// store_settings). Acá no se decide ningún plazo, sólo cómo se escribe.

function normalizar(dias) {
  return Math.max(0, Math.round(Number(dias) || 0))
}

// "3 días hábiles" — para armar frases propias ("hasta X", "en X").
export function diasHabiles(dias) {
  const n = normalizar(dias)
  return n === 1 ? '1 día hábil' : `${n} días hábiles`
}

// Mayor plazo de preparación del carrito. Es el máximo y nunca la suma: los
// items se despachan juntos, así que manda el que más tarda en estar listo.
export function plazoMaximo(items = []) {
  if (!items.length) return 0
  return Math.max(0, ...items.map((item) => normalizar(item?.diasEntrega)))
}

// ── Ventana de entrega en palabras ──────────────────────────────────────────
// La tienda no promete un día exacto: el tránsito varía según la localidad
// dentro de cada zona de CP, y una fecha con esa precisión inventada es
// justamente la que después genera el reclamo. Ver backend/config/shipping.js.

const DIA_Y_MES = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' })

// Un DATE de Postgres llega como 'YYYY-MM-DD' y `new Date()` lo interpreta como
// medianoche UTC, que en Argentina (UTC-3) cae el día anterior. Se parsea a mano
// para que la fecha mostrada sea la guardada.
function parseFecha(value) {
  if (!value) return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [anio, mes, dia] = value.split('-').map(Number)
    return new Date(anio, mes - 1, dia)
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

// "entre el 3 y el 8 de septiembre" · "entre el 30 de agosto y el 4 de septiembre"
// Con un solo extremo (pedidos anteriores al cambio) cae a "el 8 de septiembre".
export function rangoEntregaTexto(desdeValor, hastaValor) {
  const desde = parseFecha(desdeValor)
  const hasta = parseFecha(hastaValor)
  if (!desde && !hasta) return null
  if (!desde) return `el ${DIA_Y_MES.format(hasta)}`
  if (!hasta || desde.getTime() === hasta.getTime()) return `el ${DIA_Y_MES.format(desde)}`

  const mismoMes = desde.getMonth() === hasta.getMonth() && desde.getFullYear() === hasta.getFullYear()
  return mismoMes
    ? `entre el ${desde.getDate()} y el ${DIA_Y_MES.format(hasta)}`
    : `entre el ${DIA_Y_MES.format(desde)} y el ${DIA_Y_MES.format(hasta)}`
}
