import test from 'node:test'
import assert from 'node:assert/strict'
import { mapCustomerRow, buildCustomerSearch } from './customers.js'

function row(overrides = {}) {
  return {
    id: 'user-1',
    email: 'ana@example.com',
    first_name: 'Ana',
    last_name: 'García',
    phone: '221 555 0000',
    address: 'Calle 1 123',
    city: 'City Bell',
    postal_code: '1896',
    email_verified_at: null,
    created_at: '2026-01-10T12:00:00.000Z',
    updated_at: '2026-02-01T12:00:00.000Z',
    orders_count: '0',
    paid_orders_count: '0',
    total_spent: '0',
    last_order_at: null,
    favorites_count: '0',
    reviews_count: '0',
    newsletter_subscribed: false,
    ...overrides,
  }
}

test('mapCustomerRow no expone el hash de contraseña', () => {
  const mapped = mapCustomerRow({ ...row(), password_hash: 'secreto' })
  assert.equal('passwordHash' in mapped, false)
  assert.equal(Object.values(mapped).includes('secreto'), false)
})

test('mapCustomerRow convierte a camelCase y tipa los contadores', () => {
  const mapped = mapCustomerRow(row({
    orders_count: '3',
    paid_orders_count: '2',
    total_spent: '15400.50',
    favorites_count: '5',
    reviews_count: '1',
  }))
  assert.equal(mapped.firstName, 'Ana')
  assert.equal(mapped.postalCode, '1896')
  assert.equal(mapped.ordersCount, 3)
  assert.equal(mapped.paidOrdersCount, 2)
  assert.equal(mapped.totalSpent, 15400.5)
  assert.equal(mapped.favoritesCount, 5)
  assert.equal(mapped.reviewsCount, 1)
})

test('mapCustomerRow deriva emailVerified de la fecha de verificación', () => {
  assert.equal(mapCustomerRow(row()).emailVerified, false)
  assert.equal(mapCustomerRow(row({ email_verified_at: '2026-01-11T00:00:00.000Z' })).emailVerified, true)
})

test('mapCustomerRow refleja la suscripción al newsletter', () => {
  assert.equal(mapCustomerRow(row({ newsletter_subscribed: true })).newsletterSubscribed, true)
  assert.equal(mapCustomerRow(row({ newsletter_subscribed: null })).newsletterSubscribed, false)
})

test('buildCustomerSearch sin término no filtra', () => {
  assert.deepEqual(buildCustomerSearch(''), { where: '', params: [] })
  assert.deepEqual(buildCustomerSearch('   '), { where: '', params: [] })
  assert.deepEqual(buildCustomerSearch(undefined), { where: '', params: [] })
})

test('buildCustomerSearch arma un LIKE parametrizado sobre nombre y email', () => {
  const { where, params } = buildCustomerSearch('  Ana ')
  assert.match(where, /u\.email ILIKE \$1/)
  assert.match(where, /u\.first_name \|\| ' ' \|\| u\.last_name/)
  assert.deepEqual(params, ['%Ana%'])
})
