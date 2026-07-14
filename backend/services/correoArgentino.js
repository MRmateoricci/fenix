// ─────────────────────────────────────────────────────────────────────────────
// Estimación de tiempo de entrega para envíos vía Correo Argentino.
//
// TODO(integración real): falta la documentación del endpoint y las
// credenciales de Correo Argentino (CORREO_ARGENTINO_API_URL/CLIENT_ID/
// CLIENT_SECRET en .env). Cuando lleguen, reemplazar el cuerpo de
// fetchCarrierBusinessDays por la llamada real a su API de cotización,
// manteniendo la firma (recibe un código postal, devuelve días hábiles de
// tránsito estimados). Hasta entonces cae al fallback fijo de abajo para que
// el checkout de envío nunca se rompa por falta de credenciales.
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK_CARRIER_BUSINESS_DAYS = 5
const STOCK_BUFFER_BUSINESS_DAYS     = 3

function isBusinessDay(date) {
  const day = date.getDay()
  return day !== 0 && day !== 6
}

function addBusinessDays(from, days) {
  const result = new Date(from)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    if (isBusinessDay(result)) added++
  }
  return result
}

async function fetchCarrierBusinessDays(postalCode) {
  const apiUrl       = process.env.CORREO_ARGENTINO_API_URL
  const clientId      = process.env.CORREO_ARGENTINO_CLIENT_ID
  const clientSecret  = process.env.CORREO_ARGENTINO_CLIENT_SECRET

  if (!apiUrl || !clientId || !clientSecret) {
    return FALLBACK_CARRIER_BUSINESS_DAYS
  }

  try {
    // TODO: reemplazar por la llamada real a la API de Correo Argentino una
    // vez que tengamos su documentación (endpoint, auth, forma de la
    // respuesta) para el código postal `postalCode`.
    throw new Error('Integración real de Correo Argentino pendiente de credenciales/documentación')
  } catch (err) {
    console.error('[correoArgentino] Usando fallback por error de API:', err.message)
    return FALLBACK_CARRIER_BUSINESS_DAYS
  }
}

// ── estimateDeliveryDate — tiempo máximo del correo + margen propio de stock ─
// No debe llamarse dentro de una transacción de DB: es una llamada de red y no
// debe sostener locks de Postgres mientras espera respuesta.
export async function estimateDeliveryDate(postalCode) {
  const carrierBusinessDays = await fetchCarrierBusinessDays(postalCode)
  const totalBusinessDays   = carrierBusinessDays + STOCK_BUFFER_BUSINESS_DAYS
  const estimatedDate       = addBusinessDays(new Date(), totalBusinessDays)

  return {
    carrierBusinessDays,
    bufferBusinessDays: STOCK_BUFFER_BUSINESS_DAYS,
    totalBusinessDays,
    estimatedDate,
  }
}
