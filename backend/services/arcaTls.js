import https from 'node:https';
import axios from 'axios';

const ARCA_WSFE_PRODUCTION_HOST = 'servicios1.afip.gov.ar';
const ARCA_WSFE_PATH_PREFIX = '/wsfev1/';

// WSFE producción ofrece actualmente DHE de 1024 bits. Se conserva TLS 1.2+
// y se limitan las suites legacy a intercambio efímero con AES-GCM. SECLEVEL=1
// se aplica únicamente al https.Agent privado de WSFE; no cambia OpenSSL global.
const ARCA_WSFE_LEGACY_CIPHERS = 'ECDHE+AESGCM:DHE+AESGCM:@SECLEVEL=1';

export function requiresArcaLegacyTls(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname.toLowerCase() === ARCA_WSFE_PRODUCTION_HOST
      && url.pathname.toLowerCase().startsWith(ARCA_WSFE_PATH_PREFIX);
  } catch {
    return false;
  }
}

export function createArcaHttpsAgent(wsfeUrl) {
  const legacyCompatibility = requiresArcaLegacyTls(wsfeUrl);
  return new https.Agent({
    keepAlive: true,
    minVersion: 'TLSv1.2',
    ...(legacyCompatibility ? { ciphers: ARCA_WSFE_LEGACY_CIPHERS } : {}),
  });
}

export function createArcaSoapTransport(serviceUrl, { timeout = 30_000 } = {}) {
  const httpsAgent = createArcaHttpsAgent(serviceUrl);
  const request = axios.create({ httpsAgent });
  const operationOptions = { timeout, httpsAgent };
  return {
    httpsAgent,
    legacyCompatibility: requiresArcaLegacyTls(serviceUrl),
    operationOptions,
    soapOptions: {
      request,
      wsdl_options: operationOptions,
    },
  };
}

// Alias conservado para no cambiar los consumidores existentes de WSFE.
export const createArcaWsfeTransport = createArcaSoapTransport;

export {
  ARCA_WSFE_LEGACY_CIPHERS,
  ARCA_WSFE_PRODUCTION_HOST,
};
