import 'dotenv/config';
import { pool } from '../db/pool.js';
import { getArcaAutomationConfig } from '../config/arca.js';
import { safeArcaErrorMessage } from '../services/arcaSafeLog.js';
import {
  getInvoiceAutomationMetrics,
  requeueRecoverableInvoices,
  runInvoiceJobSweep,
} from '../jobs/arcaInvoices.js';

function hasArgument(name) {
  return process.argv.slice(2).includes(name);
}

function assertExplicitEnvironmentConfirmation() {
  const automation = getArcaAutomationConfig();
  if (!automation.enabled) {
    throw new Error(`La automatización ARCA está desactivada (${automation.disabledReason}).`);
  }
  if (automation.isProduction && !hasArgument('--confirm-production')) {
    throw new Error('Producción requiere --confirm-production además de las dos variables de habilitación.');
  }
  if (!automation.isProduction && !hasArgument('--confirm-homologation')) {
    throw new Error('Homologación requiere --confirm-homologation.');
  }
  return automation;
}

try {
  const automation = assertExplicitEnvironmentConfirmation();
  console.log(`Recuperación de facturas ARCA (${automation.environment})...`);
  const jobs = await requeueRecoverableInvoices();
  console.log(`Trabajos preparados: ${jobs.length}`);
  const processed = await runInvoiceJobSweep({ limit: Math.max(jobs.length, 1) });
  console.log(`Trabajos procesados: ${processed.length}`);
  console.log(JSON.stringify(await getInvoiceAutomationMetrics(), null, 2));
} catch (error) {
  console.error(`Error: ${safeArcaErrorMessage(error)}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
