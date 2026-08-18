import { assertArcaEmissionAllowed, getArcaConfig } from '../config/arca.js';
import { publicInvoice } from '../services/invoiceService.js';
import { attemptInvoiceForOrder } from '../services/invoiceAttempts.js';
import { pool } from '../db/pool.js';
import { safeArcaErrorMessage } from '../services/arcaSafeLog.js';
import { printEmissionBanner } from './arcaScriptSafety.js';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const orderId = argument('--order-id');
  if (!orderId) {
    throw new Error('Uso: node scripts/testArcaInvoice.js --order-id <uuid> --confirm-homologation|--confirm-production');
  }
  const config = getArcaConfig({ requirePointOfSale: true, requireIssuerData: true });
  if (config.isProduction) {
    if (!process.argv.includes('--confirm-production')) {
      throw new Error('Falta --confirm-production. No se solicitó ningún CAE.');
    }
    if (!config.productionEmissionEnabled) {
      throw new Error('ARCA_PRODUCTION_ENABLED no es true. No se solicitó ningún CAE.');
    }
  } else if (!process.argv.includes('--confirm-homologation')) {
    throw new Error('Falta --confirm-homologation. Este script puede solicitar un CAE de homologación.');
  }
  assertArcaEmissionAllowed(config);

  printEmissionBanner(config);
  console.log(`Pedido: ${orderId}`);
  const result = await attemptInvoiceForOrder({ orderId, origin: 'manual_script' });
  if (result.error) throw result.error;
  const invoice = publicInvoice(result.invoice);
  console.log(`Estado: ${invoice.status}`);
  console.log(`Comprobante: ${invoice.pointOfSale}-${invoice.voucherNumber || 'pendiente'}`);
  console.log(`CAE recibido: ${invoice.cae ? 'SÍ' : 'NO'}`);
  if (invoice.errors.length) console.log(`Errores: ${JSON.stringify(invoice.errors)}`);
  if (invoice.observations.length) console.log(`Observaciones: ${JSON.stringify(invoice.observations)}`);
}

main().catch((error) => {
  console.error(`❌ Error ARCA: ${safeArcaErrorMessage(error)}`);
  if (error.invoice?.errors?.length) console.error(JSON.stringify(error.invoice.errors));
  process.exitCode = 1;
}).finally(() => pool.end());
