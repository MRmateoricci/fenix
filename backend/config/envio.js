// Copia backend-local de src/config/envio.js — el backend se despliega por
// separado del frontend (paquete propio, sin wiring de monorepo) y no puede
// importar directamente desde src/. Si cambiás zonas/precios acá, replicá
// el cambio también en src/config/envio.js (y viceversa).
//
// Se usa para recalcular el costo de envío server-side (nunca confiar en lo
// que manda el cliente) al crear una orden.
//
// TODO(integración MiCorreo): ver el comentario completo en
// src/config/envio.js — acá va a enchufarse la misma llamada real a la API
// de MiCorreo (POST /rates, CP origen/destino + peso en gramos + dimensiones
// en cm) el día que esté disponible, manteniendo la firma de calcularEnvio().

export const ORIGEN_CP     = '1896' // Depósito City Bell, Buenos Aires
export const PESO_MAXIMO_KG = 25    // Tope de Correo Argentino

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

// Ver el TODO equivalente en src/config/envio.js: mismo placeholder hasta que
// el catálogo tenga un campo `weight` real por producto.
const PESO_PLACEHOLDER_KG_POR_UNIDAD = 1 // COMPLETAR: peso promedio real por unidad

export function calcularPesoTotalKg(items) {
  const unidades = (items || []).reduce((sum, item) => sum + (item.quantity || 0), 0)
  return unidades * PESO_PLACEHOLDER_KG_POR_UNIDAD
}

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
