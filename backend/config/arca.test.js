import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  ArcaConfigError,
  arcaAAuthorizationModes,
  assertArcaEmissionAllowed,
  backendRoot,
  getArcaAutomationConfig,
  getArcaConfig,
} from './arca.js';

const KEYS = [
  'ARCA_ENV', 'ARCA_PRODUCTION_ENABLED', 'ARCA_CUIT', 'ARCA_PTO_VTA',
  'ARCA_CERT_PATH', 'ARCA_KEY_PATH', 'ARCA_DEFAULT_CONCEPTO',
  'ARCA_AUTO_INVOICE_ENABLED', 'ARCA_TAX_CONDITION', 'ARCA_A_AUTHORIZATION_MODE',
  'ARCA_ACTIVITY_START_DATE', 'ARCA_LEGAL_NAME', 'ARCA_TAX_ADDRESS',
];

function withEnvironment(values, callback) {
  const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) delete process.env[key];
    else process.env[key] = value;
  }
  try { return callback(); } finally {
    for (const key of KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('ARCA usa homologación y resuelve archivos desde backend', () => withEnvironment({
  ARCA_ENV: 'homologation', ARCA_CUIT: '20-12345678-6', ARCA_PTO_VTA: '3',
  ARCA_TAX_CONDITION: 'Monotributo', ARCA_A_AUTHORIZATION_MODE: undefined,
  ARCA_CERT_PATH: './config/arca/cert.crt', ARCA_KEY_PATH: './config/arca/key.key',
}, () => {
  const config = getArcaConfig({ requirePointOfSale: true });
  assert.match(config.wsaaWsdl, /wsaahomo/);
  assert.match(config.wsfeWsdl, /wswhomo/);
  assert.equal(config.cuit, '20123456786');
  assert.equal(config.pointOfSale, 3);
  assert.equal(config.certificatePath, path.join(backendRoot, 'config', 'arca', 'cert.crt'));
}));

test('producción permite configuración para consultas pero bloquea emisión por defecto', () => withEnvironment({
  ARCA_ENV: 'production', ARCA_PRODUCTION_ENABLED: 'false', ARCA_CUIT: '20123456786',
  ARCA_TAX_CONDITION: 'Responsable Inscripto', ARCA_A_AUTHORIZATION_MODE: 'standard',
  ARCA_ACTIVITY_START_DATE: '2024-01-15',
}, () => {
  const config = getArcaConfig();
  assert.equal(config.isProduction, true);
  assert.match(config.wsfeWsdl, /servicios1\.afip\.gov\.ar/);
  assert.throws(() => assertArcaEmissionAllowed(config), (error) => (
    error instanceof ArcaConfigError && error.code === 'ARCA_PRODUCTION_EMISSION_DISABLED'
  ));
}));

test('Responsable Inscripto falla de forma segura sin modo A explícito', () => withEnvironment({
  ARCA_ENV: 'production', ARCA_CUIT: '20123456786',
  ARCA_TAX_CONDITION: 'Responsable Inscripto', ARCA_A_AUTHORIZATION_MODE: undefined,
}, () => {
  assert.throws(() => getArcaConfig(), (error) => (
    error instanceof ArcaConfigError && error.code === 'ARCA_A_AUTHORIZATION_MODE_REQUIRED'
  ));
}));

test('la condición IVA del emisor tampoco tiene un default implícito', () => withEnvironment({
  ARCA_ENV: 'homologation', ARCA_CUIT: '20123456786',
  ARCA_TAX_CONDITION: undefined, ARCA_A_AUTHORIZATION_MODE: undefined,
}, () => {
  assert.throws(() => getArcaConfig(), (error) => (
    error instanceof ArcaConfigError && error.code === 'ARCA_TAX_CONDITION_REQUIRED'
  ));
}));

test('acepta únicamente los tres modos A documentados y nunca asume standard', () => {
  for (const mode of arcaAAuthorizationModes) {
    withEnvironment({
      ARCA_ENV: 'homologation', ARCA_CUIT: '20123456786',
      ARCA_TAX_CONDITION: 'Responsable Inscripto', ARCA_A_AUTHORIZATION_MODE: mode,
    }, () => assert.equal(getArcaConfig().issuer.aAuthorizationMode, mode));
  }
  withEnvironment({
    ARCA_ENV: 'homologation', ARCA_CUIT: '20123456786',
    ARCA_TAX_CONDITION: 'Responsable Inscripto', ARCA_A_AUTHORIZATION_MODE: 'unknown',
  }, () => assert.throws(() => getArcaConfig(), (error) => error.code === 'ARCA_A_AUTHORIZATION_MODE_INVALID'));
});

test('mes/año registral es válido también para una emisión productiva habilitada', () => withEnvironment({
  ARCA_ENV: 'production', ARCA_PRODUCTION_ENABLED: 'true', ARCA_CUIT: '20123456786',
  ARCA_TAX_CONDITION: 'Responsable Inscripto', ARCA_A_AUTHORIZATION_MODE: 'cbu_informed',
  ARCA_ACTIVITY_START_DATE: '2024-01', ARCA_LEGAL_NAME: 'Fenix',
  ARCA_TAX_ADDRESS: 'Cantilo 745, City Bell',
}, () => {
  const config = getArcaConfig({ requireIssuerData: true });
  assert.equal(config.issuer.activityStartDate, '2024-01');
  assert.equal(assertArcaEmissionAllowed(config), config);
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
      productionEmissionEnabled: false,
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
