import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import {
  buildLoginTicketRequest,
  clearAccessTicketCache,
  getAccessTicket,
  getPersistentAccessTicketCachePath,
  isTicketUsable,
} from './arcaAuth.js';

test('TRA contiene identificador, ventana horaria y servicio wsfe', () => {
  const now = Date.parse('2026-08-15T12:00:00.000Z');
  const tra = buildLoginTicketRequest('wsfe', now);
  assert.match(tra, /<uniqueId>1786795200<\/uniqueId>/);
  assert.match(tra, /<generationTime>2026-08-15T11:50:00.000Z<\/generationTime>/);
  assert.match(tra, /<expirationTime>2026-08-15T12:10:00.000Z<\/expirationTime>/);
  assert.match(tra, /<service>wsfe<\/service>/);
});

test('caché WSAA renueva tickets dentro del margen de cinco minutos', () => {
  const now = Date.parse('2026-08-15T12:00:00.000Z');
  assert.equal(isTicketUsable({ expirationTime: '2026-08-15T12:06:00.000Z' }, now), true);
  assert.equal(isTicketUsable({ expirationTime: '2026-08-15T12:04:59.000Z' }, now), false);
  assert.equal(isTicketUsable({ expirationTime: 'inválida' }, now), false);
});

test('reutiliza el TA persistente válido y elimina uno vencido', async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'fenix-arca-auth-'));
  const cacheDirectory = path.join(temporaryRoot, '.cache', 'arca');
  const certificatePath = path.join(temporaryRoot, 'certificate.crt');
  const missingKeyPath = path.join(temporaryRoot, 'missing-private.key');
  const certificate = 'certificado de prueba sin datos reales';
  const previousEnvironment = {
    ARCA_ENV: process.env.ARCA_ENV,
    ARCA_CUIT: process.env.ARCA_CUIT,
    ARCA_CERT_PATH: process.env.ARCA_CERT_PATH,
    ARCA_KEY_PATH: process.env.ARCA_KEY_PATH,
    ARCA_CACHE_DIR: process.env.ARCA_CACHE_DIR,
    ARCA_TAX_CONDITION: process.env.ARCA_TAX_CONDITION,
    ARCA_A_AUTHORIZATION_MODE: process.env.ARCA_A_AUTHORIZATION_MODE,
  };

  try {
    await mkdir(cacheDirectory, { recursive: true });
    await writeFile(certificatePath, certificate);
    process.env.ARCA_ENV = 'homologation';
    process.env.ARCA_CUIT = '20123456786';
    process.env.ARCA_CERT_PATH = certificatePath;
    process.env.ARCA_KEY_PATH = missingKeyPath;
    process.env.ARCA_CACHE_DIR = cacheDirectory;
    process.env.ARCA_TAX_CONDITION = 'Monotributo';
    delete process.env.ARCA_A_AUTHORIZATION_MODE;

    const cachePath = getPersistentAccessTicketCachePath();
    const certificateFingerprint = createHash('sha256').update(certificate).digest('hex');
    const payload = (expirationTime) => ({
      version: 1,
      environment: 'homologation',
      service: 'wsfe',
      cuit: '20123456786',
      certificateFingerprint,
      token: 'token-de-prueba',
      sign: 'sign-de-prueba',
      expirationTime,
    });

    const validExpiration = new Date(Date.now() + 30 * 60_000).toISOString();
    await writeFile(cachePath, JSON.stringify(payload(validExpiration)));
    clearAccessTicketCache();
    assert.deepEqual(await getAccessTicket(), {
      token: 'token-de-prueba',
      sign: 'sign-de-prueba',
      expirationTime: JSON.parse(await readFile(cachePath, 'utf8')).expirationTime,
    });

    clearAccessTicketCache();
    await writeFile(cachePath, JSON.stringify(payload(new Date(Date.now() - 60_000).toISOString())));
    await assert.rejects(getAccessTicket(), (error) => error.code === 'ARCA_FILE_NOT_READABLE');
    await assert.rejects(access(cachePath), (error) => error.code === 'ENOENT');
  } finally {
    clearAccessTicketCache();
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
