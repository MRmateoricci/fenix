import { spawn } from 'child_process'

const MAX_ERROR_LENGTH = 16 * 1024

const URI_PARAMETER_ENV = {
  application_name: 'PGAPPNAME',
  channel_binding: 'PGCHANNELBINDING',
  connect_timeout: 'PGCONNECT_TIMEOUT',
  gssencmode: 'PGGSSENCMODE',
  options: 'PGOPTIONS',
  sslcert: 'PGSSLCERT',
  sslcrl: 'PGSSLCRL',
  sslkey: 'PGSSLKEY',
  sslmode: 'PGSSLMODE',
  sslrootcert: 'PGSSLROOTCERT',
  target_session_attrs: 'PGTARGETSESSIONATTRS',
}

export function commandEnvironment(databaseUrl) {
  const env = { ...process.env }

  try {
    const url = new URL(databaseUrl)
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('protocolo no soportado')

    // En Windows, algunas versiones de libpq no extraen las credenciales de
    // una URI colocada en PGDATABASE y pg_dump queda esperando la contraseña.
    // Pasarlas como variables PG* evita el prompt sin exponerlas en argumentos.
    env.PGHOST = url.hostname
    env.PGPORT = url.port || '5432'
    env.PGUSER = decodeURIComponent(url.username)
    env.PGPASSWORD = decodeURIComponent(url.password)
    env.PGDATABASE = decodeURIComponent(url.pathname.replace(/^\/+/, ''))

    for (const [parameter, environmentName] of Object.entries(URI_PARAMETER_ENV)) {
      const value = url.searchParams.get(parameter)
      if (value !== null) env[environmentName] = value
    }
  } catch {
    // Compatibilidad con configuraciones libpq que no usan una URI.
    env.PGDATABASE = databaseUrl
  }

  return env
}

export function runDatabaseCommand(command, args, databaseUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: commandEnvironment(databaseUrl),
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    })
    let stderr = ''

    child.stderr.on('data', chunk => {
      stderr = (stderr + chunk.toString()).slice(-MAX_ERROR_LENGTH)
    })
    child.on('error', error => {
      reject(new Error(`No se pudo ejecutar ${command}: ${error.message}`))
    })
    child.on('close', code => {
      if (code === 0) return resolve()
      reject(new Error(`${command} finalizó con código ${code}${stderr.trim() ? `: ${stderr.trim()}` : ''}`))
    })
  })
}

export function readCommandVersion(command) {
  return new Promise(resolve => {
    const child = spawn(command, ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk.toString() })
    child.stderr.on('data', chunk => { output += chunk.toString() })
    child.on('error', () => resolve({ available: false, version: null }))
    child.on('close', code => resolve({
      available: code === 0,
      version: code === 0 ? output.trim() : null,
    }))
  })
}

export async function dumpDatabase({ databaseUrl, outputPath, pgDumpPath, runCommand = runDatabaseCommand }) {
  if (!databaseUrl) throw new Error('DATABASE_URL no está configurada')
  await runCommand(pgDumpPath, [
    '--format=plain',
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--encoding=UTF8',
    `--file=${outputPath}`,
  ], databaseUrl)
}

export async function restoreDatabase({ databaseUrl, inputPath, psqlPath, runCommand = runDatabaseCommand }) {
  if (!databaseUrl) throw new Error('DATABASE_URL no está configurada')
  await runCommand(psqlPath, [
    '--no-psqlrc',
    '--single-transaction',
    '--set=ON_ERROR_STOP=on',
    `--file=${inputPath}`,
  ], databaseUrl)
}
