import { getArcaConfig } from '../config/arca.js';
import {
  getCondicionesIvaReceptor,
  getTiposComprobante,
  getTiposConcepto,
  getTiposDocumento,
  getTiposIva,
  getTiposMoneda,
} from '../services/arcaWsfe.js';
import { safeArcaErrorMessage } from '../services/arcaSafeLog.js';
import { printSafeQueryBanner } from './arcaScriptSafety.js';

function invoiceClasses(config) {
  if (config.issuer.taxCategory !== 'registered') return ['C'];
  return [config.issuer.aAuthorizationMode === 'subject_to_withholding' ? 'ALEY' : 'A', 'B'];
}

async function main() {
  const config = getArcaConfig();
  printSafeQueryBanner(config);
  const classes = invoiceClasses(config);
  console.log('Consultando parámetros WSFEv1...');
  const [vouchers, documents, concepts, currencies, vatRates, ...vatConditions] = await Promise.all([
    getTiposComprobante(),
    getTiposDocumento(),
    getTiposConcepto(),
    getTiposMoneda(),
    getTiposIva(),
    ...classes.map((invoiceClass) => getCondicionesIvaReceptor(invoiceClass)),
  ]);
  const responses = {
    comprobantes: vouchers,
    documentos: documents,
    conceptos: concepts,
    monedas: currencies,
    alicuotasIva: vatRates,
  };
  classes.forEach((invoiceClass, index) => {
    responses[`condicionesIvaClase${invoiceClass}`] = vatConditions[index];
  });
  for (const [name, response] of Object.entries(responses)) {
    console.log(`\n${name}:`);
    if (response.errors.length) console.log(JSON.stringify(response.errors, null, 2));
    else console.log(JSON.stringify(response.items, null, 2));
  }
}

main().catch((error) => {
  console.error(`❌ Error ARCA: ${safeArcaErrorMessage(error)}`);
  process.exitCode = 1;
});
