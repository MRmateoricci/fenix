import {
  getCondicionesIvaReceptor,
  getTiposComprobante,
  getTiposConcepto,
  getTiposDocumento,
  getTiposMoneda,
} from '../services/arcaWsfe.js';
import { safeArcaErrorMessage } from '../services/arcaSafeLog.js';

async function main() {
  console.log('Consultando parámetros WSFEv1 de homologación...');
  const [vouchers, documents, concepts, currencies, vatConditions] = await Promise.all([
    getTiposComprobante(),
    getTiposDocumento(),
    getTiposConcepto(),
    getTiposMoneda(),
    getCondicionesIvaReceptor('C'),
  ]);
  for (const [name, response] of Object.entries({
    comprobantes: vouchers,
    documentos: documents,
    conceptos: concepts,
    monedas: currencies,
    condicionesIvaFacturaC: vatConditions,
  })) {
    console.log(`\n${name}:`);
    if (response.errors.length) console.log(JSON.stringify(response.errors, null, 2));
    else console.log(JSON.stringify(response.items, null, 2));
  }
}

main().catch((error) => {
  console.error(`❌ Error ARCA: ${safeArcaErrorMessage(error)}`);
  process.exitCode = 1;
});
