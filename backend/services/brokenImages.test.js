import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'path'
import { rm, writeFile } from 'fs/promises'
import { uploadsDir } from '../config/uploads.js'
import { checkImageUrl, classifyImageUrl, findBrokenImages } from './brokenImages.js'

test('classifyImageUrl manda a disco cualquier host con path /uploads/', () => {
  const propio = classifyImageUrl('https://fenixelectricidadiluminacion.com/uploads/foto.jpg')
  const railway = classifyImageUrl('https://fenix.up.railway.app/uploads/foto.jpg')
  const relativo = classifyImageUrl('/uploads/foto.jpg')
  for (const target of [propio, railway, relativo]) {
    assert.equal(target.kind, 'local')
    assert.equal(target.file, path.join(uploadsDir, 'foto.jpg'))
  }
})

test('classifyImageUrl distingue externas, relativas, inline y vacías', () => {
  assert.equal(classifyImageUrl('https://cdn.proveedor.com/a.jpg').kind, 'external')
  assert.equal(classifyImageUrl('/images/a.jpg').kind, 'relative')
  assert.equal(classifyImageUrl('data:image/png;base64,AAAA').kind, 'inline')
  assert.equal(classifyImageUrl('   ').kind, 'empty')
  assert.equal(classifyImageUrl(null).kind, 'empty')
  assert.equal(classifyImageUrl('foto.jpg').kind, 'invalid')
})

test('classifyImageUrl no deja salir de la carpeta de subidas', () => {
  assert.equal(classifyImageUrl('/uploads/../.env').kind, 'invalid')
  assert.equal(classifyImageUrl('/uploads/%2e%2e/.env').kind, 'invalid')
})

test('checkImageUrl detecta archivo local ausente y presente', async () => {
  const name = `test-imagen-rota-${Date.now()}.jpg`
  assert.equal(await checkImageUrl(`/uploads/${name}`), 'el archivo ya no está en el servidor')

  const file = path.join(uploadsDir, name)
  await writeFile(file, 'x')
  try {
    assert.equal(await checkImageUrl(`https://cualquier.host/uploads/${name}`), null)
  } finally {
    await rm(file, { force: true })
  }
})

test('checkImageUrl usa HEAD y reintenta con GET si el servidor no lo acepta', async () => {
  const calls = []
  const fetchImpl = async (url, { method }) => {
    calls.push(method)
    if (method === 'HEAD') return { status: 405, ok: false }
    return { status: 200, ok: true }
  }
  assert.equal(await checkImageUrl('https://cdn.test/a.jpg', { fetchImpl }), null)
  assert.deepEqual(calls, ['HEAD', 'GET'])
})

test('checkImageUrl informa el estado HTTP, el timeout y el error de red', async () => {
  assert.equal(await checkImageUrl('https://cdn.test/a.jpg', { fetchImpl: async () => ({ status: 404, ok: false }) }), 'respondió 404')
  const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' })
  assert.equal(await checkImageUrl('https://cdn.test/a.jpg', { fetchImpl: async () => { throw timeout } }), 'no respondió a tiempo')
  assert.equal(await checkImageUrl('https://cdn.test/a.jpg', { fetchImpl: async () => { throw new Error('ECONNREFUSED') } }), 'no se pudo conectar')
})

test('checkImageUrl verifica paths relativos contra el sitio y no marca sin baseUrl', async () => {
  const seen = []
  const fetchImpl = async url => { seen.push(url); return { status: 200, ok: true } }
  assert.equal(await checkImageUrl('/images/a.jpg', { fetchImpl, baseUrl: 'https://tienda.test/' }), null)
  assert.deepEqual(seen, ['https://tienda.test/images/a.jpg'])
  assert.equal(await checkImageUrl('/images/a.jpg', { fetchImpl }), null)
  assert.equal(seen.length, 1)
})

test('findBrokenImages devuelve sólo las rotas, en orden y con motivo', async () => {
  const rows = [
    { id: 'a', image_url: 'ok' },
    { id: 'b', image_url: 'rota' },
    { id: 'c', image_url: 'ok' },
    { id: 'd', image_url: 'rota' },
  ]
  const check = async url => (url === 'rota' ? 'respondió 404' : null)
  const broken = await findBrokenImages(rows, { check, concurrency: 2 })
  assert.deepEqual(broken.map(row => row.id), ['b', 'd'])
  assert.equal(broken[0].motivo_imagen, 'respondió 404')
})

test('findBrokenImages respeta el límite de concurrencia', async () => {
  let running = 0
  let peak = 0
  const check = async () => {
    running++
    peak = Math.max(peak, running)
    await new Promise(resolve => setTimeout(resolve, 5))
    running--
    return null
  }
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: String(i), image_url: 'x' }))
  assert.deepEqual(await findBrokenImages(rows, { check, concurrency: 3 }), [])
  assert.equal(peak, 3)
})
