// La preparación se usa únicamente para calcular internamente la ventana final
// de entrega. Al cliente se le muestran fechas de llegada, no plazos internos.

function normalizar(dias) {
  return Math.max(0, Math.round(Number(dias) || 0))
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

// ── Fecha de retiro más temprana ────────────────────────────────────────────
// El retiro en el local no puede ofrecerse antes de que la mercadería esté
// lista: un producto que se repone del proveedor son varios días hábiles, no
// "mañana". `diasPreparacion` es el mayor plazo del carrito (plazoMaximo), ya
// resuelto contra stock_inmediato + los plazos de la tienda. El backend vuelve
// a validar esta misma cota en POST /api/orders — acá sólo se acota el picker.

// Días hábiles = lunes a viernes. No se contemplan feriados: no hay calendario
// cargado y el margen de los plazos de la tienda absorbe ese desfasaje.
function esDiaHabil(fecha) {
  const dia = fecha.getDay()
  return dia !== 0 && dia !== 6
}

export function sumarDiasHabiles(desde, dias) {
  const fecha = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate())
  let sumados = 0
  while (sumados < dias) {
    fecha.setDate(fecha.getDate() + 1)
    if (esDiaHabil(fecha)) sumados++
  }
  return fecha
}

// Nunca antes de mañana, aunque el carrito no tenga plazo (todo en el local con
// despacho 0): preparar el pedido y avisar que está lleva al menos un día.
export function fechaRetiroMinima(diasPreparacion = 0, hoy = new Date()) {
  return sumarDiasHabiles(hoy, Math.max(1, normalizar(diasPreparacion)))
}

// 'YYYY-MM-DD' en hora local, para el atributo `min` de un <input type="date">.
// No se usa toISOString(): de noche (UTC-3) adelantaría un día.
export function fechaISOLocal(fecha) {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${fecha.getFullYear()}-${mes}-${dia}`
}

// `valorPicker` llega como 'YYYY-MM-DD' del <input>. Compara sólo el día.
export function retiroDemasiadoTemprano(valorPicker, diasPreparacion, hoy = new Date()) {
  const elegida = parseFecha(valorPicker)
  if (!elegida) return false
  return elegida < fechaRetiroMinima(diasPreparacion, hoy)
}

export function textoRetiroDisponible(diasPreparacion, hoy = new Date()) {
  return `Disponible para retirar a partir del ${DIA_Y_MES.format(fechaRetiroMinima(diasPreparacion, hoy))}`
}
