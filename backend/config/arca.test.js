import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ArcaConfigError, backendRoot, getArcaConfig } from './arca.js';

const KEYS = [
  'ARCA_ENV', 'ARCA_PRODUCTION_ENABLED', 'ARCA_CUIT', 'ARCA_PTO_VTA',
  'ARCA_CERT_PATH', 'ARCA_KEY_PATH', 'ARCA_DEFAULT_CBTE_TIPO', 'ARCA_DEFAULT_CONCEPTO',
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
