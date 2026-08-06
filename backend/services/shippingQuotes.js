import { getManualShippingQuote } from '../config/shipping.js'

const MANUAL_PROVIDER = 'manual'
const CORREO_ARGENTINO_PROVIDER = 'correo_argentino'

// Punto único de integración para el costo. Al recibir las credenciales,
// implementar esta función y definir SHIPPING_PROVIDER=correo_argentino; las
// rutas, el checkout y la creación de órdenes no necesitan cambios.
async function quoteWithCorreoArgentino(_request) {
  const apiUrl = process.env.CORREO_ARGENTINO_API_URL
  const clientId = process.env.CORREO_ARGENTINO_CLIENT_ID
  const clientSecret = process.env.CORREO_ARGENTINO_CLIENT_SECRET

  if (!apiUrl || !clientId || !clientSecret) {
    throw new Error('Faltan credenciales de Correo Argentino')
  }

  // TODO(API): adaptar autenticación, payload y respuesta a la documentación
  // oficial. Debe devolver el mismo objeto que getManualShippingQuote.
  throw new Error('Cotización de Correo Argentino pendiente de documentación')
}

export async function quoteShipping(request) {
  const provider = (process.env.SHIPPING_PROVIDER || MANUAL_PROVIDER).trim().toLowerCase()

  if (provider === CORREO_ARGENTINO_PROVIDER) return quoteWithCorreoArgentino(request)
  if (provider !== MANUAL_PROVIDER) {
    throw new Error(`Proveedor de envío no soportado: ${provider}`)
  }

  return getManualShippingQuote(request)
}
