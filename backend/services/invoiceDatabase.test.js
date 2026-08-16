import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

test('constraints e idempotencia concurrente con PostgreSQL', {
  skip: !TEST_DATABASE_URL && 'Definí TEST_DATABASE_URL para ejecutar la prueba PostgreSQL descartable.',
  timeout: 60_000,
}, async () => {
  const schemaName = `arca_test_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  assert.match(schemaName, /^arca_test_[a-z0-9_]+$/);
  const adminPool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  await adminPool.query(`CREATE SCHEMA ${schemaName}`);

  let appPool;
  try {
    const isolatedUrl = new URL(TEST_DATABASE_URL);
    isolatedUrl.searchParams.set('options', `-c search_path=${schemaName},public`);
    process.env.DATABASE_URL = isolatedUrl.toString();
    process.env.NODE_ENV = 'test';
    process.env.ARCA_ENV = 'homologation';
    process.env.ARCA_CUIT = '20123456786';
    process.env.ARCA_PTO_VTA = '1';
    process.env.ARCA_DEFAULT_CBTE_TIPO = '11';
    process.env.ARCA_DEFAULT_CONCEPTO = '1';
    process.env.ARCA_LEGAL_NAME = 'Fénix Test';
    process.env.ARCA_TAX_ADDRESS = 'City Bell';
    process.env.ARCA_ACTIVITY_START_DATE = '2020-01-01';

    const poolModule = await import('../db/pool.js');
    appPool = poolModule.pool;
    const schemaSql = await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'schema.sql'), 'utf8');
    await appPool.query(schemaSql);

    const { arcaEnvironments } = await import('../config/arca.js');
    const { setWsfeDependenciesForTests } = await import('./arcaWsfe.js');
    const { createInvoiceForOrder } = await import('./invoiceService.js');
    const { recoverStaleInvoiceJobs } = await import('../jobs/arcaInvoices.js');

    let lastAuthorized = 0;
    let caeCalls = 0;
    const fakeClient = {
      FEParamGetPtosVentaAsync: async () => [{ FEParamGetPtosVentaResult: { ResultGet: { PtoVenta: [{ Nro: 1, EmisionTipo: 'CAE', Bloqueado: 'N' }] } } }],
      FEParamGetTiposCbteAsync: async () => [{ FEParamGetTiposCbteResult: { ResultGet: { CbteTipo: [{ Id: 11, Desc: 'Factura C' }] } } }],
      FEParamGetTiposDocAsync: async () => [{ FEParamGetTiposDocResult: { ResultGet: { DocTipo: [{ Id: 96, Desc: 'DNI' }] } } }],
      FEParamGetCondicionIvaReceptorAsync: async () => [{ FEParamGetCondicionIvaReceptorResult: { ResultGet: { CondicionIvaReceptor: [{ Id: 5, Desc: 'Consumidor Final' }] } } }],
      FECompUltimoAutorizadoAsync: async (args) => [{ FECompUltimoAutorizadoResult: { PtoVta: args.PtoVta, CbteTipo: args.CbteTipo, CbteNro: lastAuthorized } }],
      FECAESolicitarAsync: async (args) => {
        caeCalls += 1;
        const number = Number(args.FeCAEReq.FeDetReq.FECAEDetRequest[0].CbteDesde);
        await new Promise((resolve) => setTimeout(resolve, 15));
        lastAuthorized = number;
        return [{ FECAESolicitarResult: {
          FeCabResp: { Resultado: 'A' },
          FeDetResp: { FECAEDetResponse: [{ Resultado: 'A', CAE: String(74000000000000 + number), CAEFchVto: '20260825' }] },
        } }];
      },
    };
    setWsfeDependenciesForTests({
      client: fakeClient,
      wsdl: arcaEnvironments.homologation.wsfeWsdl,
      ticketProvider: async () => ({ token: 'test', sign: 'test' }),
    });

    async function createOrder(suffix) {
      const { rows } = await appPool.query(
        `INSERT INTO orders (
           order_number, status, customer_name, customer_email, customer_phone,
           delivery_type, total_amount, items, invoice_recipient_name,
           invoice_doc_type, invoice_doc_number, invoice_vat_condition_id,
           invoice_data_confirmed_at, invoice_concept
         ) VALUES ($1, 'paid', 'Cliente Test', $2, '11111111', 'pickup', 100,
           '[{"name":"Lámpara","quantity":1,"price":100,"subtotal":100}]'::jsonb,
           'Cliente Test', 96, '12345678', 5, NOW(), 1)
         RETURNING id`,
        [`FX-T${suffix}`.slice(0, 12), `test-${suffix}@example.com`],
      );
      return rows[0].id;
    }

    const firstOrder = await createOrder('00001');
    const simultaneous = await Promise.all(
      Array.from({ length: 10 }, () => createInvoiceForOrder(firstOrder)),
    );
    assert.equal(caeCalls, 1);
    assert.equal(new Set(simultaneous.map((result) => result.invoice.id)).size, 1);
    assert.equal(simultaneous[0].invoice.status, 'authorized');

    const [secondOrder, thirdOrder] = await Promise.all([createOrder('00002'), createOrder('00003')]);
    const twoOrders = await Promise.all([
      createInvoiceForOrder(secondOrder),
      createInvoiceForOrder(thirdOrder),
    ]);
    assert.equal(caeCalls, 3);
    assert.deepEqual(twoOrders.map((result) => Number(result.invoice.cbte_numero)).sort(), [2, 3]);

    await assert.rejects(
      appPool.query(
        `INSERT INTO invoices (
           order_id, issuer_cuit, pto_vta, cbte_tipo, concepto,
           receiver_doc_type, receiver_doc_number, receiver_vat_condition_id,
           imp_total, imp_neto, issuer_snapshot, receiver_snapshot, items_snapshot
         ) SELECT order_id, issuer_cuit, pto_vta, cbte_tipo, concepto,
           receiver_doc_type, receiver_doc_number, receiver_vat_condition_id,
           imp_total, imp_neto, issuer_snapshot, receiver_snapshot, items_snapshot
         FROM invoices LIMIT 1`,
      ),
      (error) => error.code === '23505',
    );

    await appPool.query(
      `INSERT INTO invoice_jobs (order_id) VALUES ($1)`,
      [firstOrder],
    );
    await assert.rejects(
      appPool.query(`INSERT INTO invoice_jobs (order_id) VALUES ($1)`, [firstOrder]),
      (error) => error.code === '23505',
    );

    await appPool.query(
      `UPDATE invoice_jobs SET
         status = 'processing', attempt_count = 1,
         locked_at = NOW() - INTERVAL '11 minutes'
       WHERE order_id = $1`,
      [firstOrder],
    );
    assert.equal(await recoverStaleInvoiceJobs(appPool), 1);
    const recoveredJob = await appPool.query(
      'SELECT status, last_error_code FROM invoice_jobs WHERE order_id = $1',
      [firstOrder],
    );
    assert.equal(recoveredJob.rows[0].status, 'retry_wait');
    assert.equal(recoveredJob.rows[0].last_error_code, 'WORKER_INTERRUPTED');
  } finally {
    if (appPool) await appPool.end();
    await adminPool.query(`DROP SCHEMA ${schemaName} CASCADE`);
    await adminPool.end();
  }
});
