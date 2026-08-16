import { getArcaConfig } from '../config/arca.js';
import { createInvoiceForOrder, publicInvoice } from '../services/invoiceService.js';
import { pool } from '../db/pool.js';
import { safeArcaErrorMessage } from '../services/arcaSafeLog.js';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const orderId = argument('--order-id');
  if (!orderId) throw new Error('Uso: node scripts/testArcaInvoice.js --order-id <uuid> --confirm-homologation');
  if (!process.argv.includes('--confirm-homologation')) {
    throw new Error('Falta --confirm-homologation. Este script puede solicitar un CAE real de homologación.');
  }
  const config = getArcaConfig({ requirePointOfSale: true, requireIssuerData: true });
  if (config.environment !== 'homologation') {
    throw new Error('Este script rechaza producción y solo puede ejecutarse en homologación.');
  }

  console.log(`Emitiendo Factura C de homologación para pedido ${orderId}...`);
  const result = await createInvoiceForOrder(orderId);
  const invoice = publicInvoice(result.invoice);
  console.log(`Estado: ${invoice.status}`);
  console.log(`Comprobante: ${invoice.pointOfSale}-${invoice.voucherNumber || 'pendiente'}`);
  console.log(`CAE recibido: ${invoice.cae ? 'SI' : 'NO'}`);
  if (invoice.errors.length) console.log(`Errores: ${JSON.stringify(invoice.errors)}`);
  if (invoice.observations.length) console.log(`Observaciones: ${JSON.stringify(invoice.observations)}`);
}

main().catch((error) => {
  console.error(`❌ Error ARCA: ${safeArcaErrorMessage(error)}`);
  if (error.invoice?.errors?.length) console.error(JSON.stringify(error.invoice.errors));
  process.exitCode = 1;
}).finally(() => pool.end());
