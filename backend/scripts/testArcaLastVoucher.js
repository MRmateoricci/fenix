import { getArcaConfig } from '../config/arca.js';
import { getLastAuthorized } from '../services/arcaWsfe.js';
import { safeArcaErrorMessage } from '../services/arcaSafeLog.js';

async function main() {
  const config = getArcaConfig({ requirePointOfSale: true });
  const result = await getLastAuthorized(config.pointOfSale, config.defaultVoucherType);
  if (result.errors.length) throw new Error(JSON.stringify(result.errors));
  console.log(`Punto de venta: ${result.pointOfSale}`);
  console.log(`Tipo de comprobante: ${result.voucherType}`);
  console.log(`Último autorizado: ${result.voucherNumber}`);
}

main().catch((error) => {
  console.error(`❌ Error ARCA: ${safeArcaErrorMessage(error)}`);
  process.exitCode = 1;
});
