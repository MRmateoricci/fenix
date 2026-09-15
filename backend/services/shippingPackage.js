// Arma el bulto que se manda a cotizar: un pedido son varios productos, la API
// de Correo cotiza UN paquete.
//
// El tarifario Andreani nunca necesitó esto (cotiza sólo por peso real), pero
// /rates exige alto, ancho y largo. La regla es la de embalar apilando: el
// bulto queda tan largo y tan ancho como el producto más grande, y tan alto
// como la suma de los altos. No es exacto —nadie embala perfecto— pero es
// reproducible y no subestima el volumen como lo haría tomar sólo el máximo.

import { CARRIER_LIMITS, DEFAULT_PACKAGE } from '../config/correoArgentino.js'

// Mismo criterio que el tarifario manual: sin peso cargado se asume el mínimo
// para no frenar la compra online (ver config/shipping.js). Cargar `weight_kg`
// real en los productos sigue siendo tarea pendiente de datos.
const FALLBACK_WEIGHT_KG = 0.5

function positiveNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : null
}

// Medidas de una unidad. Un producto puede tener cargadas algunas y otras no,
// así que se completa dimensión por dimensión con la caja por defecto en vez de
// descartar el producto entero por un dato faltante.
function unitDimensions(item) {
  return {
    lengthCm: positiveNumber(item?.lengthCm) || DEFAULT_PACKAGE.lengthCm,
    widthCm: positiveNumber(item?.widthCm) || DEFAULT_PACKAGE.widthCm,
    heightCm: positiveNumber(item?.heightCm) || DEFAULT_PACKAGE.heightCm,
  }
}

// Devuelve { weightKg, weightGrams, lengthCm, widthCm, heightCm, hasRealDimensions }.
//
// `hasRealDimensions` es sólo para diagnóstico: dice si alguna medida salió de
// los productos o si todo el bulto es la caja por defecto. No se le muestra al
// cliente; sirve para saber, mirando un pedido viejo, si la cotización se hizo
// con datos o con supuestos.
export function buildShippingPackage(items = []) {
  let lengthCm = 0
  let widthCm = 0
  let heightCm = 0
  let weightKg = 0
  let hasRealDimensions = false

  for (const item of items) {
    const quantity = Math.max(1, Math.round(Number(item?.quantity) || 1))
    const unit = unitDimensions(item)

    if (positiveNumber(item?.lengthCm) || positiveNumber(item?.widthCm) || positiveNumber(item?.heightCm)) {
      hasRealDimensions = true
    }

    // Base del bulto: el producto más grande manda. Alto: se apila, por eso
    // multiplica por la cantidad.
    lengthCm = Math.max(lengthCm, unit.lengthCm)
    widthCm = Math.max(widthCm, unit.widthCm)
    heightCm += unit.heightCm * quantity

    weightKg += (positiveNumber(item?.weightKg) || 0) * quantity
  }

  if (items.length === 0) {
    lengthCm = DEFAULT_PACKAGE.lengthCm
    widthCm = DEFAULT_PACKAGE.widthCm
    heightCm = DEFAULT_PACKAGE.heightCm
  }

  if (weightKg <= 0) weightKg = FALLBACK_WEIGHT_KG

  // Tope de 150 cm por lado. Un pedido de muchas unidades apiladas se pasa
  // enseguida y la API rechazaría el bulto con 400. Se recorta en vez de no
  // cotizar: misma decisión de siempre —no frenar la compra— y el envío real se
  // despacha en varios bultos, que es lo que pasa en el mostrador de todos modos.
  const clamp = (value) => Math.min(Math.max(1, Math.round(value)), CARRIER_LIMITS.maxSideCm)

  return {
    weightKg,
    weightGrams: Math.max(CARRIER_LIMITS.minWeightGrams, Math.round(weightKg * 1000)),
    lengthCm: clamp(lengthCm),
    widthCm: clamp(widthCm),
    heightCm: clamp(heightCm),
    hasRealDimensions,
  }
}
