import { getArcaConfig } from '../config/arca.js'
import { getAccessTicket } from '../services/arcaAuth.js'
import { testConnection } from '../services/arcaWsfe.js'
import { safeArcaErrorMessage } from '../services/arcaSafeLog.js'
import { printSafeQueryBanner } from './arcaScriptSafety.js'

function formatError(error) {
  return safeArcaErrorMessage(error)
}

async function main() {
  const config = getArcaConfig()
  printSafeQueryBanner(config)
  console.log('Conectando con WSAA...')
  const { token, sign } = await getAccessTicket()

  console.log('✅ Autenticación WSAA correcta')
  console.log(`Token recibido: ${token ? 'SI' : 'NO'}`)
  console.log(`Sign recibido: ${sign ? 'SI' : 'NO'}`)
  console.log('')
  console.log('Probando WSFEv1...')

  const result = await testConnection()
  if (![result.appServer, result.dbServer, result.authServer]
    .every((status) => String(status).toUpperCase() === 'OK')) {
    throw new Error(`FEDummy devolvió un estado inesperado: ${JSON.stringify(result)}`)
  }
  console.log('✅ FEDummy correcto')
  console.log(`AppServer: ${result.appServer}`)
  console.log(`DbServer: ${result.dbServer}`)
  console.log(`AuthServer: ${result.authServer}`)
}

main().catch((error) => {
  console.error(`❌ Error ARCA: ${formatError(error)}`)
  process.exitCode = 1
})
