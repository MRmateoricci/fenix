const healthUrl = process.env.DEV_BACKEND_HEALTH_URL || 'http://localhost:3001/api/health'
const timeoutMs = 60_000
const retryDelayMs = 250
const startedAt = Date.now()

console.log(`Esperando al backend en ${healthUrl}...`)

while (Date.now() - startedAt < timeoutMs) {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(2_000) })
    if (response.ok) {
      console.log('Backend listo. Iniciando Vite...')
      process.exit(0)
    }
  } catch {
    // El backend todavía está cargando; volvemos a intentar sin ensuciar la consola.
  }

  await new Promise(resolve => setTimeout(resolve, retryDelayMs))
}

console.error(`El backend no respondió después de ${timeoutMs / 1000} segundos.`)
process.exit(1)
