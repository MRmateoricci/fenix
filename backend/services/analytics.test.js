import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isBotUserAgent,
  visitorHash,
  referrerHost,
  normalizePath,
  clampDays,
} from './analytics.js'

// ── Detección de bots ────────────────────────────────────────────────────────
test('marca como bot el tráfico automático conocido', () => {
  assert.equal(isBotUserAgent('Googlebot/2.1 (+http://www.google.com/bot.html)'), true)
  assert.equal(isBotUserAgent('facebookexternalhit/1.1'), true)
  assert.equal(isBotUserAgent('WhatsApp/2.23'), true)
  assert.equal(isBotUserAgent('curl/8.4.0'), true)
  assert.equal(isBotUserAgent('Mozilla/5.0 (compatible; AhrefsBot/7.0)'), true)
})

test('no marca como bot un navegador real', () => {
  const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  assert.equal(isBotUserAgent(chrome), false)
  assert.equal(isBotUserAgent(iphone), false)
})

test('sin user-agent cuenta como bot', () => {
  assert.equal(isBotUserAgent(''), true)
  assert.equal(isBotUserAgent(null), true)
  assert.equal(isBotUserAgent(undefined), true)
})

// ── Hash del visitante ───────────────────────────────────────────────────────
test('el hash es estable dentro del día e independiente entre visitantes', () => {
  const day = new Date('2026-09-01T12:00:00Z')
  const a1 = visitorHash('200.1.2.3', 'Chrome', day)
  const a2 = visitorHash('200.1.2.3', 'Chrome', day)
  const b = visitorHash('200.9.9.9', 'Chrome', day)
  assert.equal(a1, a2)
  assert.notEqual(a1, b)
  assert.match(a1, /^[a-f0-9]{64}$/)
})

test('el hash del mismo visitante cambia de un día para otro', () => {
  const hoy = visitorHash('200.1.2.3', 'Chrome', new Date('2026-09-01T23:00:00Z'))
  const maniana = visitorHash('200.1.2.3', 'Chrome', new Date('2026-09-02T01:00:00Z'))
  assert.notEqual(hoy, maniana)
})

// ── Referrer ─────────────────────────────────────────────────────────────────
test('del referrer se queda solo con el host sin www', () => {
  assert.equal(referrerHost('https://www.google.com/search?q=luces'), 'google.com')
  assert.equal(referrerHost('https://instagram.com/fenix'), 'instagram.com')
  assert.equal(referrerHost('https://l.facebook.com/l.php?u=x'), 'l.facebook.com')
  assert.equal(referrerHost(''), null)
  assert.equal(referrerHost('no-es-una-url'), null)
  assert.equal(referrerHost(null), null)
})

// ── Normalización de ruta ────────────────────────────────────────────────────
test('la ruta se guarda sin query, sin hash y sin barra final', () => {
  assert.equal(normalizePath('/products?cat=luces#top'), '/products')
  assert.equal(normalizePath('/products/'), '/products')
  assert.equal(normalizePath('/'), '/')
  assert.equal(normalizePath('products'), '/products')
})

test('las rutas del panel no se registran', () => {
  assert.equal(normalizePath('/admin'), null)
  assert.equal(normalizePath('/admin/orders'), null)
  assert.equal(normalizePath('/ADMIN'), null)
})

test('rutas inválidas devuelven null', () => {
  assert.equal(normalizePath(''), null)
  assert.equal(normalizePath(null), null)
  assert.equal(normalizePath('   '), null)
})

// ── Rango de días ────────────────────────────────────────────────────────────
test('clampDays acota el rango a [1, 365] y cae al default si es inválido', () => {
  assert.equal(clampDays(7), 7)
  assert.equal(clampDays('30'), 30)
  assert.equal(clampDays(0), 1)
  assert.equal(clampDays(9999), 365)
  assert.equal(clampDays('abc'), 30)
  assert.equal(clampDays(undefined, 90), 90)
})
