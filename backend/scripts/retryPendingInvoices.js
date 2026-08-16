import 'dotenv/config';
import { pool } from '../db/pool.js';
import { getArcaConfig } from '../config/arca.js';
import { safeArcaErrorMessage } from '../services/arcaSafeLog.js';
import { attemptInvoiceForOrder } from '../services/invoiceAttempts.js';

function hasArgument(name) {
  return process.argv.slice(2).includes(name);
}

function assertExplicitEnvironmentConfirmation() {
  const config = getArcaConfig({ requirePointOfSale: true, requireIssuerData: true });
  if (config.isProduction) throw new Error('Este script de emergencia no permite producción.');
  if (!hasArgument('--confirm-homologation')) throw new Error('Homologación requiere --confirm-homologation.');
  return config;
}

try {
  const config = assertExplicitEnvironmentConfirmation();
  console.log(`Recuperación manual de facturas ARCA (${config.environment})...`);
  const { rows } = await pool.query(
    `SELECT o.id, o.order_number
     FROM orders o
     LEFT JOIN invoices i ON i.order_id = o.id
     WHERE o.payment_method = 'mercadopago'
       AND o.mp_status = 'approved'
       AND o.status IN ('paid', 'preparing', 'shipped', 'delivered')
       AND o.invoice_data_confirmed_at IS NOT NULL
       AND (i.id IS NULL OR i.status IN ('pending', 'processing', 'uncertain', 'error'))
     ORDER BY o.paid_at NULLS LAST, o.created_at`,
  );
  console.log(`Pedidos a intentar: ${rows.length}`);
  for (const order of rows) {
    const result = await attemptInvoiceForOrder({
      orderId: order.id,
      origin: 'manual_script',
      requireMercadoPagoApproval: true,
    });
    console.log(`Pedido ${order.order_number}: ${result.invoice?.status || result.status} (${result.code || 'OK'})`);
  }
} catch (error) {
  console.error(`Error: ${safeArcaErrorMessage(error)}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
