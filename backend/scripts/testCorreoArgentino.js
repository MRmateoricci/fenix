// Prueba de extremo a extremo contra la API real de Correo Argentino.
//
//   npm --prefix backend run correo:test -- 1704
//
// Pide un token, cotiza un envío al CP que se le pase (1704 por defecto) y
// lista las sucursales de una provincia. Sirve para saber si las credenciales
// y el customerId andan ANTES de que un cliente lo descubra en el checkout.
//
// No escribe nada: /rates y /agencies son de sólo lectura.

import 'dotenv/config'
import {
  getCorreoArgentinoConfig,
  isCorreoArgentinoConfigured,
  missingCorreoArgentinoConfig,
} from '../config/correoArgentino.js'
import {
  fetchAgencies,
  fetchCustomerId,
  fetchRates,
  verifyCorreoArgentinoCredentials,
} from '../services/correoArgentinoApi.js'

const postalCode = process.argv[2] || '1704'
const provinceCode = (process.argv[3] || 'B').toUpperCase()

const config = getCorreoArgentinoConfig()

console.log('Ambiente :', config.environment)
console.log('URL      :', config.baseUrl)
// Nunca se imprimen usuario ni contraseña: este script se corre en terminales
// que quedan en el historial y en logs de CI.
console.log('Usuario  :', config.user ? '(configurado)' : '(FALTA)')
console.log('Customer :', config.customerId || '(FALTA)')
console.log('CP origen:', config.originPostalCode)
console.log('')

// Primero el token: el customerId no hace falta para autenticar, así que esto
// se puede verificar apenas Correo entrega usuario y contraseña.
try {
  const { expiresAt } = await verifyCorreoArgentinoCredentials()
  console.log(`Token OK — vence ${expiresAt.toLocaleString('es-AR')}`)
} catch (err) {
  console.error('Token RECHAZADO:', err.message)
  process.exit(1)
}

// Si falta el customerId pero están los datos de la cuenta MiCorreo, se lo
// pregunta a la API en vez de dejar al usuario esperando que Correo lo informe.
if (!config.customerId && process.env.CORREO_ARGENTINO_ACCOUNT_EMAIL) {
  try {
    const customerId = await fetchCustomerId({
      email: process.env.CORREO_ARGENTINO_ACCOUNT_EMAIL,
      password: process.env.CORREO_ARGENTINO_ACCOUNT_PASSWORD,
    })
    console.log('')
    console.log(`customerId de esa cuenta: ${customerId}`)
    console.log('Cargalo en backend/.env como CORREO_ARGENTINO_CUSTOMER_ID y volvé a correr esto.')
  } catch (err) {
    console.error('No se pudo averiguar el customerId:', err.message)
  }
}

if (!isCorreoArgentinoConfigured(config)) {
  console.error('')
  console.error('Faltan variables de entorno:', missingCorreoArgentinoConfig(config).join(', '))
  console.error('Sin ellas la tienda cotiza con el tarifario Andreani y no llama a Correo.')
  process.exit(1)
}

console.log('')

const dimensions = { weightGrams: 2500, lengthCm: 30, widthCm: 20, heightCm: 10 }

try {
  console.log(`Cotizando ${config.originPostalCode} → ${postalCode} (2,5 kg, 30×20×10 cm)...`)
  const rates = await fetchRates({ postalCodeDestination: postalCode, dimensions })
  for (const rate of rates) {
    const modalidad = rate.deliveredType === 'S' ? 'sucursal ' : 'domicilio'
    console.log(
      `  ${modalidad}  $${rate.price}  ${rate.deliveryTimeMin}-${rate.deliveryTimeMax} días hábiles  (${rate.productName})`,
    )
  }
} catch (err) {
  console.error('Falló la cotización:', err.message)
  process.exitCode = 1
}

console.log('')

try {
  console.log(`Sucursales de la provincia ${provinceCode} que reciben paquetes...`)
  const agencies = await fetchAgencies(provinceCode)
  console.log(`  ${agencies.length} sucursales`)
  for (const agency of agencies.slice(0, 5)) {
    console.log(`  ${agency.code}  ${agency.name} — ${agency.street || 's/d'}, ${agency.locality || 's/d'}`)
  }
  if (agencies.length > 5) console.log(`  ... y ${agencies.length - 5} más`)
} catch (err) {
  console.error('Falló el listado de sucursales:', err.message)
  process.exitCode = 1
}
