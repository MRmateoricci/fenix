import {
  access,
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import soap from 'soap';
import { parseStringPromise } from 'xml2js';
import { backendRoot, getArcaConfig } from '../config/arca.js';
import { redactArcaSecrets } from './arcaSafeLog.js';

const SOAP_TIMEOUT_MS = 30_000;
const TRA_CLOCK_TOLERANCE_MS = 10 * 60 * 1_000;
const CACHE_RENEWAL_MARGIN_MS = 5 * 60 * 1_000;
const PERSISTENT_CACHE_REUSE_MARGIN_MS = 30_000;
const PERSISTENT_CACHE_VERSION = 1;
const PERSISTENT_CACHE_FILENAME = 'wsaa-homologation-wsfe.json';
const CACHE_LOCK_FILENAME = 'wsaa-homologation-wsfe.lock';
const CACHE_LOCK_RETRY_MS = 150;
const CACHE_LOCK_TIMEOUT_MS = 45_000;
const CACHE_LOCK_STALE_MS = 90_000;

let cachedAccessTicket = null;
let cachedAccessTicketContext = null;
let accessTicketRequest = null;
let accessTicketRequestContext = null;
let wsaaClientRequest = null;
let wsaaClientWsdl = null;

export class ArcaAuthError extends Error {
  constructor(message, { code = 'ARCA_AUTH_ERROR', cause } = {}) {
    super(message, { cause });
    this.name = 'ArcaAuthError';
    this.code = code;
  }
}

function cacheDirectory() {
  const configured = String(process.env.ARCA_CACHE_DIR || '').trim();
  if (!configured) return path.resolve(backendRoot, '..', '.cache', 'arca');
  return path.isAbsolute(configured)
    ? path.normalize(configured)
    : path.resolve(backendRoot, '..', configured);
}

function persistentCachePaths() {
  const directory = cacheDirectory();
  return {
    directory,
    ticket: path.join(directory, PERSISTENT_CACHE_FILENAME),
    lock: path.join(directory, CACHE_LOCK_FILENAME),
  };
}

export function getPersistentAccessTicketCachePath() {
  return persistentCachePaths().ticket;
}

function accessTicketContext(config) {
  return [
    config.environment,
    config.service,
    config.cuit,
    path.normalize(config.certificatePath),
  ].join('|');
}

async function certificateFingerprint(certificatePath) {
  try {
    const certificate = await readFile(certificatePath);
    return createHash('sha256').update(certificate).digest('hex');
  } catch (cause) {
    throw new ArcaAuthError(
      `No se puede leer el archivo configurado en ARCA_CERT_PATH: ${certificatePath}`,
      { code: 'ARCA_FILE_NOT_READABLE', cause },
    );
  }
}

async function ensureCacheDirectory(directory) {
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
  } catch (cause) {
    throw new ArcaAuthError('No se pudo preparar el directorio local del caché WSAA.', {
      code: 'ARCA_CACHE_WRITE_ERROR',
      cause,
    });
  }
}

async function removeCacheFile(filePath) {
  try {
    await unlink(filePath);
  } catch (cause) {
    if (cause?.code !== 'ENOENT') {
      throw new ArcaAuthError('No se pudo eliminar un Ticket de Acceso WSAA vencido o inválido.', {
        code: 'ARCA_CACHE_DELETE_ERROR',
        cause,
      });
    }
  }
}

async function readPersistentAccessTicket(config, fingerprint) {
  if (config.environment !== 'homologation') return null;
  const { ticket: ticketPath } = persistentCachePaths();
  let serialized;
  try {
    serialized = await readFile(ticketPath, 'utf8');
  } catch (cause) {
    if (cause?.code === 'ENOENT') return null;
    throw new ArcaAuthError('No se pudo leer el caché local del Ticket de Acceso WSAA.', {
      code: 'ARCA_CACHE_READ_ERROR',
      cause,
    });
  }

  let stored;
  try {
    stored = JSON.parse(serialized);
  } catch {
    await removeCacheFile(ticketPath);
    return null;
  }

  const matchesContext = stored?.version === PERSISTENT_CACHE_VERSION
    && stored?.environment === config.environment
    && stored?.service === config.service
    && stored?.cuit === config.cuit
    && stored?.certificateFingerprint === fingerprint;
  const ticket = {
    token: stored?.token,
    sign: stored?.sign,
    expirationTime: stored?.expirationTime,
  };

  if (!matchesContext || !ticket.token || !ticket.sign || !isTicketUsable(ticket, Date.now(), 0)) {
    await removeCacheFile(ticketPath);
    return null;
  }

  return ticket;
}

async function writePersistentAccessTicket(config, fingerprint, ticket) {
  if (config.environment !== 'homologation') return;
  const paths = persistentCachePaths();
  await ensureCacheDirectory(paths.directory);
  const temporaryPath = path.join(
    paths.directory,
    `${PERSISTENT_CACHE_FILENAME}.${process.pid}.${randomUUID()}.tmp`,
  );
  const payload = JSON.stringify({
    version: PERSISTENT_CACHE_VERSION,
    environment: config.environment,
    service: config.service,
    cuit: config.cuit,
    certificateFingerprint: fingerprint,
    token: ticket.token,
    sign: ticket.sign,
    expirationTime: ticket.expirationTime,
  });

  try {
    await writeFile(temporaryPath, payload, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await chmod(temporaryPath, 0o600);
    await unlink(paths.ticket).catch((cause) => {
      if (cause?.code !== 'ENOENT') throw cause;
    });
    await rename(temporaryPath, paths.ticket);
    await chmod(paths.ticket, 0o600);
  } catch (cause) {
    await unlink(temporaryPath).catch(() => {});
    throw new ArcaAuthError('No se pudo guardar el caché local del Ticket de Acceso WSAA.', {
      code: 'ARCA_CACHE_WRITE_ERROR',
      cause,
    });
  }
}

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return cause?.code === 'EPERM';
  }
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function acquirePersistentCacheLock() {
  const paths = persistentCachePaths();
  await ensureCacheDirectory(paths.directory);
  const startedAt = Date.now();

  while (Date.now() - startedAt < CACHE_LOCK_TIMEOUT_MS) {
    try {
      const handle = await open(paths.lock, 'wx', 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      return { handle, path: paths.lock };
    } catch (cause) {
      if (cause?.code !== 'EEXIST') {
        throw new ArcaAuthError('No se pudo crear el lock local del caché WSAA.', {
          code: 'ARCA_CACHE_LOCK_ERROR',
          cause,
        });
      }

      let ownerPid = null;
      let lockAge = 0;
      try {
        const [metadata, fileStats] = await Promise.all([
          readFile(paths.lock, 'utf8').then((value) => JSON.parse(value)).catch(() => null),
          stat(paths.lock),
        ]);
        ownerPid = Number(metadata?.pid) || null;
        lockAge = Date.now() - fileStats.mtimeMs;
      } catch (readCause) {
        if (readCause?.code === 'ENOENT') continue;
      }

      if ((ownerPid && !processIsRunning(ownerPid)) || (!ownerPid && lockAge > CACHE_LOCK_STALE_MS)) {
        await unlink(paths.lock).catch(() => {});
        continue;
      }
      await wait(CACHE_LOCK_RETRY_MS);
    }
  }

  throw new ArcaAuthError('Otro proceso está renovando el Ticket de Acceso WSAA y excedió el tiempo de espera.', {
    code: 'ARCA_CACHE_LOCK_TIMEOUT',
  });
}

async function releasePersistentCacheLock(lock) {
  if (!lock) return;
  await lock.handle.close().catch(() => {});
  await unlink(lock.path).catch(() => {});
}

async function assertReadable(filePath, variableName) {
  try {
    await access(filePath);
  } catch (cause) {
    throw new ArcaAuthError(
      `No se puede leer el archivo configurado en ${variableName}: ${filePath}`,
      { code: 'ARCA_FILE_NOT_READABLE', cause },
    );
  }
}

export function buildLoginTicketRequest(service = 'wsfe', now = Date.now()) {
  const uniqueId = Math.floor(now / 1_000);
  const generationTime = new Date(now - TRA_CLOCK_TOLERANCE_MS).toISOString();
  const expirationTime = new Date(now + TRA_CLOCK_TOLERANCE_MS).toISOString();

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<loginTicketRequest version="1.0">',
    '  <header>',
    `    <uniqueId>${uniqueId}</uniqueId>`,
    `    <generationTime>${generationTime}</generationTime>`,
    `    <expirationTime>${expirationTime}</expirationTime>`,
    '  </header>',
    `  <service>${service}</service>`,
    '</loginTicketRequest>',
  ].join('\n');
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveOpenSslCommand(configuredCommand) {
  if (configuredCommand && configuredCommand !== 'openssl') {
    return path.isAbsolute(configuredCommand)
      ? path.normalize(configuredCommand)
      : path.resolve(backendRoot, configuredCommand);
  }

  if (process.platform !== 'win32') return 'openssl';

  const pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const candidates = [];

  for (const entry of pathEntries) {
    candidates.push(
      path.join(entry, 'openssl.exe'),
      path.resolve(entry, '..', 'usr', 'bin', 'openssl.exe'),
      path.resolve(entry, '..', 'mingw64', 'bin', 'openssl.exe'),
    );
  }

  for (const candidate of [...new Set(candidates)]) {
    if (await fileExists(candidate)) return candidate;
  }

  return 'openssl';
}

function runOpenSsl(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];

    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));

    child.on('error', (cause) => {
      reject(new ArcaAuthError(
        'No se pudo ejecutar OpenSSL. Instalalo o configurá ARCA_OPENSSL_PATH con la ruta al ejecutable.',
        { code: 'ARCA_OPENSSL_NOT_FOUND', cause },
      ));
    });

    child.on('close', (exitCode) => {
      if (exitCode === 0) {
        resolve(Buffer.concat(stdout));
        return;
      }

      const detail = Buffer.concat(stderr).toString('utf8').trim();
      reject(new ArcaAuthError(
        `OpenSSL no pudo generar la firma CMS (código ${exitCode})${detail ? `: ${detail}` : '.'}`,
        { code: 'ARCA_OPENSSL_ERROR' },
      ));
    });

    child.stdin.on('error', () => {});
    child.stdin.end(input, 'utf8');
  });
}

async function signLoginTicketRequest(tra, certificatePath, privateKeyPath, configuredOpenSslPath) {
  const openSslCommand = await resolveOpenSslCommand(configuredOpenSslPath);
  const cms = await runOpenSsl(openSslCommand, [
    'smime',
    '-sign',
    '-binary',
    '-in',
    '-',
    '-signer',
    certificatePath,
    '-inkey',
    privateKeyPath,
    '-outform',
    'DER',
    '-nodetach',
    '-md',
    'sha256',
  ], tra);

  if (!cms.length) {
    throw new ArcaAuthError('OpenSSL generó una firma CMS vacía.', {
      code: 'ARCA_EMPTY_CMS',
    });
  }

  return cms.toString('base64');
}

async function getWsaaClient(wsaaWsdl) {
  if (!wsaaClientRequest || wsaaClientWsdl !== wsaaWsdl) {
    wsaaClientWsdl = wsaaWsdl;
    wsaaClientRequest = soap.createClientAsync(wsaaWsdl, {
      wsdl_options: { timeout: SOAP_TIMEOUT_MS },
    }).catch((cause) => {
      wsaaClientRequest = null;
      wsaaClientWsdl = null;
      throw new ArcaAuthError(`No se pudo conectar al WSDL de WSAA: ${redactArcaSecrets(cause.message)}`, {
        code: 'ARCA_WSAA_CONNECTION_ERROR',
        cause,
      });
    });
  }

  return wsaaClientRequest;
}

async function requestAccessTicket(config) {
  const { certificatePath, privateKeyPath } = config;

  await Promise.all([
    assertReadable(certificatePath, 'ARCA_CERT_PATH'),
    assertReadable(privateKeyPath, 'ARCA_KEY_PATH'),
  ]);

  const tra = buildLoginTicketRequest(config.service);
  const cms = await signLoginTicketRequest(
    tra,
    certificatePath,
    privateKeyPath,
    config.openSslPath,
  );
  const client = await getWsaaClient(config.wsaaWsdl);

  let loginCmsReturn;
  try {
    const [response] = await client.loginCmsAsync(
      { in0: cms },
      { timeout: SOAP_TIMEOUT_MS },
    );
    loginCmsReturn = response?.loginCmsReturn;
  } catch (cause) {
    throw new ArcaAuthError(`WSAA rechazó o no pudo procesar loginCms: ${redactArcaSecrets(cause.message)}`, {
      code: 'ARCA_WSAA_LOGIN_ERROR',
      cause,
    });
  }

  if (!loginCmsReturn || typeof loginCmsReturn !== 'string') {
    throw new ArcaAuthError('WSAA devolvió una respuesta loginCms vacía o inesperada.', {
      code: 'ARCA_WSAA_INVALID_RESPONSE',
    });
  }

  let parsedResponse;
  try {
    parsedResponse = await parseStringPromise(loginCmsReturn, {
      explicitArray: false,
      trim: true,
    });
  } catch (cause) {
    throw new ArcaAuthError('No se pudo parsear el XML devuelto por WSAA.', {
      code: 'ARCA_WSAA_XML_ERROR',
      cause,
    });
  }

  const response = parsedResponse?.loginTicketResponse;
  const token = response?.credentials?.token;
  const sign = response?.credentials?.sign;
  const expirationTime = response?.header?.expirationTime;
  const expiresAt = Date.parse(expirationTime);

  if (!token || !sign || !expirationTime || Number.isNaN(expiresAt)) {
    throw new ArcaAuthError('La respuesta de WSAA no contiene Token, Sign y expirationTime válidos.', {
      code: 'ARCA_WSAA_MISSING_CREDENTIALS',
    });
  }

  return { token, sign, expirationTime };
}

export function isTicketUsable(ticket, now = Date.now(), margin = CACHE_RENEWAL_MARGIN_MS) {
  if (!ticket) return false;
  const expiresAt = Date.parse(ticket.expirationTime);
  return !Number.isNaN(expiresAt) && expiresAt - now > margin;
}

async function loadOrRequestAccessTicket(config) {
  if (config.environment !== 'homologation') return requestAccessTicket(config);

  const fingerprint = await certificateFingerprint(config.certificatePath);
  const persisted = await readPersistentAccessTicket(config, fingerprint);
  if (isTicketUsable(persisted, Date.now(), PERSISTENT_CACHE_REUSE_MARGIN_MS)) return persisted;

  const lock = await acquirePersistentCacheLock();
  try {
    // Otro proceso pudo renovar el TA mientras éste esperaba el lock.
    const refreshed = await readPersistentAccessTicket(config, fingerprint);
    if (isTicketUsable(refreshed, Date.now(), PERSISTENT_CACHE_REUSE_MARGIN_MS)) return refreshed;

    let ticket;
    try {
      ticket = await requestAccessTicket(config);
    } catch (cause) {
      // WSAA no entrega nuevamente un TA que todavía no venció. En la pequeña
      // ventana final del margen, el ticket persistido sigue siendo preferible
      // a fallar con coe.alreadyAuthenticated.
      const isAlreadyAuthenticated = /alreadyAuthenticated/i.test(String(cause?.message || ''));
      const fallback = refreshed || persisted;
      if (isAlreadyAuthenticated && isTicketUsable(fallback, Date.now(), 0)) return fallback;
      throw cause;
    }
    await writePersistentAccessTicket(config, fingerprint, ticket);
    return ticket;
  } finally {
    await releasePersistentCacheLock(lock);
  }
}

export async function getAccessTicket() {
  const config = getArcaConfig();
  const context = accessTicketContext(config);
  if (cachedAccessTicketContext === context && isTicketUsable(cachedAccessTicket)) {
    return { ...cachedAccessTicket };
  }
  if (accessTicketRequestContext === context && accessTicketRequest) return accessTicketRequest;

  accessTicketRequestContext = context;
  accessTicketRequest = loadOrRequestAccessTicket(config)
    .then((ticket) => {
      cachedAccessTicket = ticket;
      cachedAccessTicketContext = context;
      return { ...ticket };
    })
    .finally(() => {
      accessTicketRequest = null;
      accessTicketRequestContext = null;
    });

  return accessTicketRequest;
}

export function clearAccessTicketCache() {
  cachedAccessTicket = null;
  cachedAccessTicketContext = null;
}
