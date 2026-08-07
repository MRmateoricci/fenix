// ─────────────────────────────────────────────────────────────────────────────
// Calculador de costo de envío — TEMPORAL, basado en una tabla de tarifas
// fijas (zona × tramo de peso). No usa ninguna API externa.
//
// TODO(integración MiCorreo): acá va a enchufarse la llamada real a la API de
// MiCorreo (Correo Argentino) cuando esté disponible. Ese endpoint (POST
// /rates) recibe:
//   - CP de origen (ORIGEN_CP, más abajo)
//   - CP de destino (el que ingresa el comprador)
//   - peso en GRAMOS (pesoTotalKg * 1000)
//   - dimensiones del paquete en CM (largo x ancho x alto)
// y devuelve costo y plazo reales de cotización. El día que llegue, reemplazar
// el cuerpo de calcularEnvio() por esa llamada manteniendo la misma firma
// (recibe CP + peso total en kg, devuelve { zona, precio, plazoMin, plazoMax,
// aConfirmar } o null) — así no hay que tocar el resto del checkout.
//
// Backend: este mismo objeto/función está duplicado en
// backend/config/envio.js (el backend se despliega aparte y no puede
// importar directamente desde src/). Si cambiás zonas/precios acá, replicá
// el cambio ahí también.
// ─────────────────────────────────────────────────────────────────────────────

export const ORIGEN_CP     = '1896' // Depósito City Bell, Buenos Aires
export const PESO_MAXIMO_KG = 25    // Tope de Correo Argentino

export const LEYENDA_COSTO_ESTIMADO = 'Costo estimado. El valor final puede variar.'
export const MENSAJE_A_CONFIRMAR =
  'Para tu zona coordinamos el envío de forma personalizada. Escribinos por WhatsApp y te pasamos el costo exacto.'

export const RETIRO_LOCAL = {
  id:          'retiro_local',
  nombre:      'Retiro en el local (City Bell)',
  descripcion: '473 entre 14C y 15, City Bell, La Plata — sin cargo',
  precio:      0,
}

// Todos los precios en 0 — COMPLETAR con las tarifas reales.
export const ZONAS_ENVIO = {
  zona1: {
    nombre:   'Gran La Plata',
    rangosCP: [[1884, 1936]],
    plazoMin: 1,
    plazoMax: 2,
    precios:  { hasta5: 0, hasta15: 0, hasta25: 0 }, // COMPLETAR
    aConfirmar: false,
  },
  zona2: {
    nombre:   'CABA',
    rangosCP: [[1000, 1499]],
    plazoMin: 2,
    plazoMax: 4,
    precios:  { hasta5: 0, hasta15: 0, hasta25: 0 }, // COMPLETAR
    aConfirmar: false,
  },
  zona3: {
    nombre:   'GBA',
    rangosCP: [[1500, 1883], [1937, 1999]],
    plazoMin: 2,
    plazoMax: 4,
    precios:  { hasta5: 0, hasta15: 0, hasta25: 0 }, // COMPLETAR
    aConfirmar: false,
  },
  zona4: {
    nombre:   'Interior de Buenos Aires y La Pampa',
    rangosCP: [[6000, 8199]],
    plazoMin: 3,
    plazoMax: 6,
    precios:  { hasta5: 0, hasta15: 0, hasta25: 0 }, // COMPLETAR
    aConfirmar: false,
  },
  zona5: {
    nombre:   'Centro, Litoral y Cuyo',
    rangosCP: [[2000, 3399], [5000, 5999]],
    plazoMin: 3,
    plazoMax: 6,
    precios:  { hasta5: 0, hasta15: 0, hasta25: 0 }, // COMPLETAR
    aConfirmar: false,
  },
  zona6: {
    nombre:   'Norte (NOA y NEA)',
    rangosCP: [[3400, 4999]],
    plazoMin: 4,
    plazoMax: 8,
    precios:  { hasta5: 0, hasta15: 0, hasta25: 0 }, // COMPLETAR
    aConfirmar: false,
  },
  zona7: {
    nombre:   'Patagonia',
    rangosCP: [[8200, 9999]],
    plazoMin: null,
    plazoMax: null,
    precios:  { hasta5: null, hasta15: null, hasta25: null },
    aConfirmar: true, // Siempre a coordinar, cualquier peso.
  },
}

// ── Peso del carrito ──────────────────────────────────────────────────────
// El catálogo todavía no tiene un campo `weight` por producto, así que se usa
// un peso placeholder por unidad. TODO: cuando el catálogo tenga peso real
// por producto, reemplazar este cálculo por la suma de (item.weight *
// item.quantity) de cada ítem del carrito.
const PESO_PLACEHOLDER_KG_POR_UNIDAD = 1 // COMPLETAR: peso promedio real por unidad

export function calcularPesoTotalKg(items) {
  const unidades = (items || []).reduce((sum, item) => sum + (item.quantity || 0), 0)
  return unidades * PESO_PLACEHOLDER_KG_POR_UNIDAD
}

// ── Validación de CP ──────────────────────────────────────────────────────
export function validarCP(codigoPostal) {
  return /^\d{4}$/.test(String(codigoPostal || '').trim())
}

function tramoDePeso(pesoTotalKg) {
  if (pesoTotalKg <= 5)  return 'hasta5'
  if (pesoTotalKg <= 15) return 'hasta15'
  return 'hasta25'
}

function buscarZona(cpNum) {
  for (const zona of Object.values(ZONAS_ENVIO)) {
    if (zona.rangosCP.some(([desde, hasta]) => cpNum >= desde && cpNum <= hasta)) {
      return zona
    }
  }
  return null
}

// ── Función principal ─────────────────────────────────────────────────────
// Devuelve { zona, precio, plazoMin, plazoMax, aConfirmar } o null si el CP
// no es válido o no cae en ningún rango conocido.
export function calcularEnvio(codigoPostal, pesoTotalKg) {
  if (!validarCP(codigoPostal)) return null

  const zona = buscarZona(Number(codigoPostal))
  if (!zona) return null

  if (zona.aConfirmar || pesoTotalKg > PESO_MAXIMO_KG) {
    return { zona: zona.nombre, precio: null, plazoMin: null, plazoMax: null, aConfirmar: true }
  }

  const tramo = tramoDePeso(pesoTotalKg)
  return {
    zona:       zona.nombre,
    precio:     zona.precios[tramo],
    plazoMin:   zona.plazoMin,
    plazoMax:   zona.plazoMax,
    aConfirmar: false,
  }
}
