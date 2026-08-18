import { getArcaConfig } from '../config/arca.js';
import { getLastAuthorized } from '../services/arcaWsfe.js';
import { safeArcaErrorMessage } from '../services/arcaSafeLog.js';
import {
  FACTURA_A,
  FACTURA_A_SUJETA_RETENCION,
  FACTURA_B,
  FACTURA_C,
} from '../services/invoiceFiscal.js';
import { printSafeQueryBanner } from './arcaScriptSafety.js';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function voucherTypes(config) {
  const requested = argument('--voucher-type');
  if (requested !== null) {
    const type = Number(requested);
    if (!Number.isInteger(type) || type <= 0) {
      throw new Error('--voucher-type debe ser un entero positivo.');
    }
    return [type];
  }
  if (config.issuer.taxCategory !== 'registered') return [FACTURA_C];
  const aType = config.issuer.aAuthorizationMode === 'subject_to_withholding'
    ? FACTURA_A_SUJETA_RETENCION
    : FACTURA_A;
  return [aType, FACTURA_B];
}

async function main() {
  const config = getArcaConfig({ requirePointOfSale: true });
  printSafeQueryBanner(config);
  for (const voucherType of voucherTypes(config)) {
    const result = await getLastAuthorized(config.pointOfSale, voucherType);
    if (result.errors.length) throw new Error(JSON.stringify(result.errors));
    console.log(`Punto de venta: ${result.pointOfSale}`);
    console.log(`Tipo de comprobante: ${result.voucherType}`);
    console.log(`Último autorizado: ${result.voucherNumber}`);
    console.log('');
  }
}

main().catch((error) => {
  console.error(`❌ Error ARCA: ${safeArcaErrorMessage(error)}`);
  process.exitCode = 1;
});
