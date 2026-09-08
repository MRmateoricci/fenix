import test from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { getSupplierReport, parseSupplierReportPeriod } from './supplierReport.js'

test('valida el período antes de consultar proveedores', () => {
  assert.equal(parseSupplierReportPeriod('30'), 30)
  assert.equal(parseSupplierReportPeriod('all'), null)
  for (const value of ['0', '-1', '31', '30; DROP TABLE orders', ['30']]) assert.throws(() => parseSupplierReportPeriod(value))
})

// Opt-in: tablas temporales de esta conexión; no modifica las tablas del negocio.
test('agrega inventario y ventas sin duplicarlas, conserva proveedores históricos y registra cargas sin aumentos', {
  skip: !process.env.SUPPLIER_REPORT_TEST_DATABASE_URL,
}, async () => {
  const pool = new pg.Pool({ connectionString: process.env.SUPPLIER_REPORT_TEST_DATABASE_URL,
    connectionTimeoutMillis: 5000, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SET LOCAL search_path = pg_temp')
    await client.query(`CREATE TEMP TABLE products (id uuid, supplier text, published boolean, stock int, price_currency text, price_updated_at timestamptz) ON COMMIT DROP`)
    await client.query(`CREATE TEMP TABLE supplier_price_settings (supplier text) ON COMMIT DROP`)
    await client.query(`CREATE TEMP TABLE supplier_price_imports (id int, supplier text, created_at timestamptz, created_count int, updated_count int, unchanged_count int, pending_variant_count int, file_names jsonb) ON COMMIT DROP`)
    await client.query(`CREATE TEMP TABLE orders (id int, status text, items jsonb, paid_at timestamptz, created_at timestamptz) ON COMMIT DROP`)
    const p1 = '00000000-0000-4000-8000-000000000001'
    const p2 = '00000000-0000-4000-8000-000000000002'
    const p3 = '00000000-0000-4000-8000-000000000003'
    await client.query(`INSERT INTO products VALUES ($1, 'ALFA', true, 10, 'ARS', NOW() - INTERVAL '15 days'),
      ($2, 'ALFA', false, 0, 'USD', NOW() - INTERVAL '16 days'), ($3, 'BETA', true, 3, 'ARS', NULL)`, [p1, p2, p3])
    await client.query(`INSERT INTO supplier_price_settings VALUES ('CONFIGURADO')`)
    await client.query(`INSERT INTO supplier_price_imports VALUES
      (1, 'ALFA', NOW() - INTERVAL '20 days', 2, 3, 0, 0, '[]'),
      (2, 'ALFA', NOW() - INTERVAL '5 days', 0, 0, 2, 0, '["lista-sin-aumentos.xlsx"]'),
      (3, 'SIN PRODUCTOS', NOW(), 1, 0, 0, 0, '[]')`)
    const addOrder = (id, status, items, days = 1, paid = true) => client.query(`INSERT INTO orders VALUES
      ($1, $2, $3, CASE WHEN $5 THEN NOW() - make_interval(days => $4) ELSE NULL END, NOW() - make_interval(days => $4))`, [id, status, JSON.stringify(items), days, paid])
    await addOrder(1, 'paid', [{ id: p1, quantity: 2, price: 10 }, { id: p2, quantity: 1, price: 5 }, { id: p3, quantity: 4, price: 2 }])
    await addOrder(2, 'shipped', [{ id: p1, supplier: 'ORIGINAL', quantity: 1, price: 10 }])
    await addOrder(3, 'paid', [{ id: p1, quantity: 10, price: 10 }], 60, false)
    await addOrder(4, 'cancelled', [{ id: p1, quantity: 100, price: 10 }])
    await addOrder(5, 'reserved', [{ id: p1, quantity: 100, price: 10 }])
    await addOrder(6, 'delivered', [{ id: 'eliminado', supplier: 'GAMMA', quantity: 2, price: 30 }])
    await addOrder(7, 'preparing', [{ id: 'no-disponible', quantity: 1, price: 7 }])
    await addOrder(8, 'paid', [{ id: p1, quantity: 'inválido', price: 99 }])
    const report = await getSupplierReport(client, '30')
    const byName = Object.fromEntries(report.suppliers.map(supplier => [supplier.supplier, supplier]))
    assert.equal(report.totals.products, 3)
    assert.equal(report.totals.orders, 4)
    assert.equal(report.totals.salesAmount, 110)
    assert.equal(byName.ALFA.productCount, 2)
    assert.equal(byName.ALFA.draftCount, 1)
    assert.equal(byName.ALFA.stockUnits, 10)
    assert.equal(byName.ALFA.outOfStockCount, 1)
    assert.equal(byName.ALFA.usdCount, 1)
    assert.equal(byName.ALFA.orderCount, 1)
    assert.equal(byName.ALFA.unitsSold, 3)
    assert.equal(byName.ALFA.salesAmount, 25)
    assert.equal(byName.ALFA.inferredLines, 2)
    assert.equal(byName.ALFA.lastImport.updated, 0)
    assert.equal(byName.ALFA.lastImport.unchanged, 2)
    assert.deepEqual(byName.ALFA.lastImport.fileNames, ['lista-sin-aumentos.xlsx'])
    assert.ok(new Date(byName.ALFA.lastImport.at) > new Date(byName.ALFA.lastPriceChangeAt))
    assert.equal(byName.ORIGINAL.salesAmount, 10)
    assert.equal(byName.GAMMA.salesAmount, 60)
    assert.equal(byName['SIN PROVEEDOR'].salesAmount, 7)
    assert.equal(byName.CONFIGURADO.productCount, 0)
    assert.ok(byName['SIN PRODUCTOS'].lastImport)
    const all = await getSupplierReport(client, 'all')
    assert.equal(all.totals.orders, 5)
    assert.equal(all.suppliers.find(supplier => supplier.supplier === 'ALFA').salesAmount, 125)
  } finally {
    await client.query('ROLLBACK')
    client.release()
    await pool.end()
  }
})
