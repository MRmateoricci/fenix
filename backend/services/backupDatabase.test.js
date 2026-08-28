import test from 'node:test'
import assert from 'node:assert/strict'
import { commandEnvironment, dumpDatabase, restoreDatabase } from './backupDatabase.js'

test('la conexión URI se convierte en variables libpq sin dejar la contraseña en PGDATABASE', () => {
  const env = commandEnvironment('postgresql://fenix:clave%20segura@localhost:5433/fenix_dev?sslmode=require')

  assert.equal(env.PGHOST, 'localhost')
  assert.equal(env.PGPORT, '5433')
  assert.equal(env.PGUSER, 'fenix')
  assert.equal(env.PGPASSWORD, 'clave segura')
  assert.equal(env.PGDATABASE, 'fenix_dev')
  assert.equal(env.PGSSLMODE, 'require')
  assert.equal(env.PGDATABASE.includes('clave'), false)
})

test('pg_dump recibe una salida SQL portable sin exponer DATABASE_URL en argumentos', async () => {
  let invocation
  await dumpDatabase({
    databaseUrl: 'postgresql://secret@example/database',
    outputPath: '/tmp/database.sql',
    pgDumpPath: 'pg_dump-custom',
    runCommand: async (...args) => { invocation = args },
  })

  assert.equal(invocation[0], 'pg_dump-custom')
  assert.equal(invocation[2], 'postgresql://secret@example/database')
  assert.equal(invocation[1].includes('postgresql://secret@example/database'), false)
  assert.equal(invocation[1].includes('--clean'), true)
  assert.equal(invocation[1].includes('--if-exists'), true)
})

test('psql restaura dentro de una sola transacción y corta ante errores', async () => {
  let invocation
  await restoreDatabase({
    databaseUrl: 'postgresql://secret@example/database',
    inputPath: '/tmp/database.sql',
    psqlPath: 'psql-custom',
    runCommand: async (...args) => { invocation = args },
  })

  assert.equal(invocation[0], 'psql-custom')
  assert.equal(invocation[1].includes('--single-transaction'), true)
  assert.equal(invocation[1].includes('--set=ON_ERROR_STOP=on'), true)
  assert.equal(invocation[1].includes('postgresql://secret@example/database'), false)
})
