import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import express from 'express'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import router from './suppliers.js'
import { pool } from '../db/pool.js'

test('el resumen de proveedores exige sesión administrativa y valida filtros', async t => {
  const previousSecret = process.env.ADMIN_SESSION_SECRET
  process.env.ADMIN_SESSION_SECRET = 'suppliers-report-isolated-test'
  t.after(() => {
    if (previousSecret === undefined) delete process.env.ADMIN_SESSION_SECRET
    else process.env.ADMIN_SESSION_SECRET = previousSecret
  })
  const query = t.mock.method(pool, 'query', async () => ({ rows: [] }))
  const app = express()
  app.use(cookieParser())
  app.use('/suppliers', router)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => server.close(resolve)))
  const url = `http://127.0.0.1:${server.address().port}/suppliers`
  assert.equal((await fetch(url)).status, 401)
  const headers = { Cookie: `fenix_admin_session=${jwt.sign({ role: 'admin' }, process.env.ADMIN_SESSION_SECRET)}` }
  assert.equal((await fetch(`${url}?period=invalid`, { headers })).status, 400)
  assert.equal(query.mock.callCount(), 0)
  const response = await fetch(`${url}?period=all`, { headers })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual((await response.json()).suppliers, [])
  assert.deepEqual(query.mock.calls[0].arguments[1], [null])
})
