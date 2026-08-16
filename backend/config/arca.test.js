import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  ArcaConfigError,
  backendRoot,
  getArcaAutomationConfig,
  getArcaConfig,
} from './arca.js';

const KEYS = [
  'ARCA_ENV', 'ARCA_PRODUCTION_ENABLED', 'ARCA_CUIT', 'ARCA_PTO_VTA',
  'ARCA_CERT_PATH', 'ARCA_KEY_PATH', 'ARCA_DEFAULT_CBTE_TIPO', 'ARCA_DEFAULT_CONCEPTO',
  'ARCA_AUTO_INVOICE_ENABLED',
];

function withEnvironment(values, callback) {
  const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { return callback(); } finally {
    for (const key of KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('ARCA usa homologación y resuelve archivos desde backend', () => withEnvironment({
  ARCA_ENV: 'homologation', ARCA_CUIT: '20-12345678-6', ARCA_PTO_VTA: '3',
  ARCA_CERT_PATH: './config/arca/cert.crt', ARCA_KEY_PATH: './config/arca/key.key',
}, () => {
  const config = getArcaConfig({ requirePointOfSale: true });
  assert.match(config.wsaaWsdl, /wsaahomo/);
  assert.match(config.wsfeWsdl, /wswhomo/);
  assert.equal(config.cuit, '20123456786');
  assert.equal(config.pointOfSale, 3);
  assert.equal(config.certificatePath, path.join(backendRoot, 'config', 'arca', 'cert.crt'));
}));

test('ARCA bloquea producción sin habilitación explícita', () => withEnvironment({
  ARCA_ENV: 'production', ARCA_PRODUCTION_ENABLED: 'false', ARCA_CUIT: '20123456786',
}, () => {
  assert.throws(() => getArcaConfig(), (error) => (
    error instanceof ArcaConfigError && error.code === 'ARCA_PRODUCTION_DISABLED'
  ));
}));

test('la facturación automática nace desactivada y homologación exige opt-in', () => {
  assert.equal(getArcaAutomationConfig({ ARCA_ENV: 'homologation' }).enabled, false);
  assert.deepEqual(
    getArcaAutomationConfig({
      ARCA_ENV: 'homologation',
      ARCA_AUTO_INVOICE_ENABLED: 'true',
      ARCA_PRODUCTION_ENABLED: 'false',
    }),
    {
      environment: 'homologation',
      isProduction: false,
      autoInvoiceRequested: true,
      productionEnabled: false,
      enabled: true,
      disabledReason: null,
    },
  );
});

test('producción automática requiere ambas habilitaciones explícitas', () => {
  const blocked = getArcaAutomationConfig({
    ARCA_ENV: 'production',
    ARCA_AUTO_INVOICE_ENABLED: 'true',
    ARCA_PRODUCTION_ENABLED: 'false',
  });
  assert.equal(blocked.enabled, false);
  assert.equal(blocked.disabledReason, 'production_disabled');

  const enabled = getArcaAutomationConfig({
    ARCA_ENV: 'production',
    ARCA_AUTO_INVOICE_ENABLED: 'true',
    ARCA_PRODUCTION_ENABLED: 'true',
  });
  assert.equal(enabled.enabled, true);
});
