import { getArcaConfig } from '../config/arca.js';
import { getPuntosVenta } from '../services/arcaWsfe.js';
import { safeArcaErrorMessage } from '../services/arcaSafeLog.js';
import { printSafeQueryBanner } from './arcaScriptSafety.js';

async function main() {
  const config = getArcaConfig();
  printSafeQueryBanner(config);
  console.log('Consultando puntos de venta...');
  const response = await getPuntosVenta();
  if (response.errors.length) throw new Error(JSON.stringify(response.errors));
  for (const point of response.items) {
    console.log(`Punto ${point.Nro} | Emisión: ${point.EmisionTipo || '-'} | Bloqueado: ${point.Bloqueado || '-'} | Baja: ${point.FchBaja || '-'}`);
  }
}

main().catch((error) => {
  console.error(`❌ Error ARCA: ${safeArcaErrorMessage(error)}`);
  process.exitCode = 1;
});
