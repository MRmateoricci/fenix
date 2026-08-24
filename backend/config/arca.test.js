import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ArcaConfigError,
  arcaAAuthorizationModes,
  assertArcaEmissionAllowed,
  backendRoot,
  getArcaAutomationConfig,
  getArcaConfig,
  initializeArcaCredentials,
  resolveArcaCredentialPaths,
} from './arca.js';

const KEYS = [
  'ARCA_ENV', 'ARCA_PRODUCTION_ENABLED', 'ARCA_CUIT', 'ARCA_PTO_VTA',
  'ARCA_CERT_PATH', 'ARCA_KEY_PATH', 'ARCA_CERT_BASE64', 'ARCA_KEY_BASE64',
  'ARCA_DEFAULT_CONCEPTO',
  'ARCA_AUTO_INVOICE_ENABLED', 'ARCA_TAX_CONDITION', 'ARCA_A_AUTHORIZATION_MODE',
  'ARCA_ACTIVITY_START_DATE', 'ARCA_LEGAL_NAME', 'ARCA_TAX_ADDRESS',
];

function withEnvironment(values, callback) {
  const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  // Las pruebas de configuración local no deben consumir secretos reales que
  // puedan estar presentes en el entorno del proceso que ejecuta la suite.
  for (const key of ['ARCA_CERT_BASE64', 'ARCA_KEY_BASE64']) delete process.env[key];
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

test('materializa credenciales Base64 fuera del repositorio con permisos restringidos', () => {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'fenix-arca-test-'));
  const certificate = '-----BEGIN CERTIFICATE-----\ndGVzdA==\n-----END CERTIFICATE-----\n';
  const privateKey = '-----BEGIN PRIVATE KEY-----\ndGVzdA==\n-----END PRIVATE KEY-----\n';

  try {
    const credentials = resolveArcaCredentialPaths({
      ARCA_CERT_BASE64: Buffer.from(certificate).toString('base64'),
      ARCA_KEY_BASE64: Buffer.from(privateKey).toString('base64'),
      ARCA_CERT_PATH: './debe-ignorarse.crt',
      ARCA_KEY_PATH: './debe-ignorarse.key',
    }, temporaryRoot);

    assert.equal(credentials.source, 'base64');
    assert.equal(readFileSync(credentials.certificatePath, 'utf8'), certificate);
    assert.equal(readFileSync(credentials.privateKeyPath, 'utf8'), privateKey);
    assert.equal(credentials.certificatePath.startsWith(temporaryRoot), true);
    assert.equal(credentials.privateKeyPath.startsWith(temporaryRoot), true);
    if (process.platform !== 'win32') {
      assert.equal(statSync(credentials.certificatePath).mode & 0o777, 0o600);
      assert.equal(statSync(credentials.privateKeyPath).mode & 0o777, 0o600);
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('la inicialización usada por startup materializa una vez y reutiliza las credenciales', () => {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'fenix-arca-startup-test-'));
  const certificate = '-----BEGIN CERTIFICATE-----\nc3RhcnR1cA==\n-----END CERTIFICATE-----\n';
  const privateKey = '-----BEGIN RSA PRIVATE KEY-----\nc3RhcnR1cA==\n-----END RSA PRIVATE KEY-----\n';
  const environment = {
    ARCA_CERT_BASE64: Buffer.from(certificate).toString('base64'),
    ARCA_KEY_BASE64: Buffer.from(privateKey).toString('base64'),
  };

  try {
    const initialized = initializeArcaCredentials(environment, temporaryRoot);
    const reused = initializeArcaCredentials(environment, temporaryRoot);

    assert.strictEqual(reused, initialized);
    assert.equal(initialized.source, 'base64');
    assert.equal(readFileSync(initialized.certificatePath, 'utf8'), certificate);
    assert.equal(readFileSync(initialized.privateKeyPath, 'utf8'), privateKey);
    if (process.platform !== 'win32') {
      assert.equal(statSync(initialized.certificatePath).mode & 0o777, 0o600);
      assert.equal(statSync(initialized.privateKeyPath).mode & 0o777, 0o600);
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('el startup normal del backend materializa las credenciales antes de escuchar', {
  timeout: 10_000,
}, async () => {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'fenix-backend-startup-test-'));
  const certificate = '-----BEGIN CERTIFICATE-----\ncHJvY2Vzby1zdGFydHVw\n-----END CERTIFICATE-----\n';
  const privateKey = '-----BEGIN PRIVATE KEY-----\ncHJvY2Vzby1zdGFydHVw\n-----END PRIVATE KEY-----\n';
  const child = spawn(process.execPath, ['index.js'], {
    cwd: backendRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: '0',
      DATABASE_URL: '',
      ARCA_CERT_BASE64: Buffer.from(certificate).toString('base64'),
      ARCA_KEY_BASE64: Buffer.from(privateKey).toString('base64'),
      ARCA_PRODUCTION_ENABLED: 'false',
      ARCA_AUTO_INVOICE_ENABLED: 'false',
      TMPDIR: temporaryRoot,
      TMP: temporaryRoot,
      TEMP: temporaryRoot,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';

  const started = new Promise((resolve, reject) => {
    const inspect = (chunk) => {
      output += chunk.toString();
      if (output.includes('backend corriendo')) resolve();
    };
    child.stdout.on('data', inspect);
    child.stderr.on('data', inspect);
    child.once('exit', (code) => reject(new Error(
      `El backend terminó antes de iniciar (code=${code}). ${output}`,
    )));
  });

  try {
    await started;
    const credentialsDirectory = path.join(temporaryRoot, 'fenix-arca');
    const certificatePath = path.join(credentialsDirectory, 'certificate.crt');
    const privateKeyPath = path.join(credentialsDirectory, 'private.key');

    assert.equal(readFileSync(certificatePath, 'utf8'), certificate);
    assert.equal(readFileSync(privateKeyPath, 'utf8'), privateKey);
    if (process.platform !== 'win32') {
      assert.equal(statSync(certificatePath).mode & 0o777, 0o600);
      assert.equal(statSync(privateKeyPath).mode & 0o777, 0o600);
    }
  } finally {
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('el startup falla sin escuchar si falta una credencial Base64', () => {
  const encodedCertificate = Buffer.from('certificado-ficticio-de-startup').toString('base64');
  const result = spawnSync(process.execPath, ['index.js'], {
    cwd: backendRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: '0',
      ARCA_CERT_BASE64: encodedCertificate,
      ARCA_KEY_BASE64: '',
      ARCA_PRODUCTION_ENABLED: 'false',
      ARCA_AUTO_INVOICE_ENABLED: 'false',
    },
    encoding: 'utf8',
    timeout: 5_000,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;

  assert.notEqual(result.status, 0);
  assert.match(output, /ARCA_CERT_BASE64 y ARCA_KEY_BASE64 deben configurarse juntas/);
  assert.doesNotMatch(output, /backend corriendo/);
  assert.equal(output.includes(encodedCertificate), false);
});

test('rechaza credenciales Base64 incompletas sin exponer su contenido', () => {
  const encodedCertificate = Buffer.from('certificado-sensible').toString('base64');
  assert.throws(
    () => initializeArcaCredentials({ ARCA_CERT_BASE64: encodedCertificate }),
    (error) => error instanceof ArcaConfigError
      && error.code === 'ARCA_BASE64_CREDENTIALS_INCOMPLETE'
      && !error.message.includes(encodedCertificate),
  );
});

test('rechaza durante startup dos variables Base64 presentes pero vacías', () => {
  assert.throws(
    () => initializeArcaCredentials({ ARCA_CERT_BASE64: '', ARCA_KEY_BASE64: '' }),
    (error) => error instanceof ArcaConfigError
      && error.code === 'ARCA_BASE64_CREDENTIALS_INCOMPLETE',
  );
});

test('rechaza Base64 inválido y contenido que no sea PEM', () => {
  const privateKey = Buffer.from(
    '-----BEGIN PRIVATE KEY-----\ndGVzdA==\n-----END PRIVATE KEY-----\n',
  ).toString('base64');

  assert.throws(
    () => resolveArcaCredentialPaths({
      ARCA_CERT_BASE64: 'contenido-no-base64!',
      ARCA_KEY_BASE64: privateKey,
    }),
    (error) => error.code === 'ARCA_CERT_BASE64_INVALID',
  );

  assert.throws(
    () => resolveArcaCredentialPaths({
      ARCA_CERT_BASE64: Buffer.from('no es un certificado PEM').toString('base64'),
      ARCA_KEY_BASE64: privateKey,
    }),
    (error) => error.code === 'ARCA_CERT_BASE64_INVALID',
  );
});

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
