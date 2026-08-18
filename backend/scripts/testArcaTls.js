import https from 'node:https';
import { arcaEnvironments } from '../config/arca.js';
import { createArcaHttpsAgent } from '../services/arcaTls.js';

const TIMEOUT_MS = 15_000;

function fullError(error) {
  return error?.stack || String(error);
}

function probeHttps(url, { label, agent } = {}) {
  return new Promise((resolve) => {
    console.log(`\n${label}`);
    const request = https.get(url, { agent, timeout: TIMEOUT_MS }, (response) => {
      const socket = response.socket;
      const result = {
        ok: response.statusCode >= 200 && response.statusCode < 400,
        statusCode: response.statusCode,
        protocol: socket.getProtocol(),
        cipher: socket.getCipher(),
        ephemeralKey: socket.getEphemeralKeyInfo(),
        certificateAuthorized: socket.authorized,
        authorizationError: socket.authorizationError || null,
        redirect: response.headers.location || null,
      };
      console.log(`HTTP status: ${result.statusCode}`);
      console.log(`TLS protocol: ${result.protocol}`);
      console.log(`Cipher: ${JSON.stringify(result.cipher)}`);
      console.log(`Ephemeral key: ${JSON.stringify(result.ephemeralKey)}`);
      console.log(`Certificate authorized: ${result.certificateAuthorized ? 'SI' : 'NO'}`);
      console.log(`Redirect: ${result.redirect || 'NO'}`);
      response.resume();
      response.on('end', () => resolve(result));
    });
    request.on('timeout', () => request.destroy(new Error(`Timeout después de ${TIMEOUT_MS} ms`)));
    request.on('error', (error) => {
      console.log(`Error completo:\n${fullError(error)}`);
      resolve({ ok: false, error });
    });
  });
}

async function main() {
  const url = arcaEnvironments.production.wsfeWsdl;
  console.log(`Node version: ${process.version}`);
  console.log(`OpenSSL version: ${process.versions.openssl}`);
  console.log(`URL probada: ${url}`);
  console.log('Este script no usa WSAA, SOAP ni FECAESolicitar.');

  await probeHttps(url, { label: 'HTTPS estándar' });
  const agent = createArcaHttpsAgent(url);
  try {
    const compatible = await probeHttps(url, { label: 'Agente TLS exclusivo de WSFE', agent });
    if (!compatible.ok || !compatible.certificateAuthorized) {
      throw compatible.error || new Error('El agente TLS de WSFE no completó una conexión HTTPS validada.');
    }
  } finally {
    agent.destroy();
  }
}

main().catch((error) => {
  console.error(fullError(error));
  process.exitCode = 1;
});
