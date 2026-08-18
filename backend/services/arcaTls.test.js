import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARCA_WSFE_LEGACY_CIPHERS,
  createArcaHttpsAgent,
  createArcaWsfeTransport,
  requiresArcaLegacyTls,
} from './arcaTls.js';

const productionWsdl = 'https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL';
const homologationWsdl = 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL';

test('la compatibilidad legacy se limita al endpoint WSFE productivo exacto', () => {
  assert.equal(requiresArcaLegacyTls(productionWsdl), true);
  assert.equal(requiresArcaLegacyTls(homologationWsdl), false);
  assert.equal(requiresArcaLegacyTls('https://servicios1.afip.gov.ar/otro-servicio'), false);
  assert.equal(requiresArcaLegacyTls('https://example.com/wsfev1/service.asmx'), false);
  assert.equal(requiresArcaLegacyTls('valor-invalido'), false);
});

test('el agente productivo conserva validación de certificado y limita las suites', () => {
  const agent = createArcaHttpsAgent(productionWsdl);
  try {
    assert.equal(agent.options.minVersion, 'TLSv1.2');
    assert.equal(agent.options.ciphers, ARCA_WSFE_LEGACY_CIPHERS);
    assert.notEqual(agent.options.rejectUnauthorized, false);
    assert.equal(agent.keepAlive, true);
  } finally {
    agent.destroy();
  }
});

test('WSDL y operaciones SOAP reutilizan el mismo agente privado', () => {
  const transport = createArcaWsfeTransport(productionWsdl, { timeout: 12_345 });
  try {
    assert.equal(transport.legacyCompatibility, true);
    assert.strictEqual(transport.soapOptions.request.defaults.httpsAgent, transport.httpsAgent);
    assert.strictEqual(transport.soapOptions.wsdl_options.httpsAgent, transport.httpsAgent);
    assert.strictEqual(transport.operationOptions.httpsAgent, transport.httpsAgent);
    assert.equal(transport.operationOptions.timeout, 12_345);
  } finally {
    transport.httpsAgent.destroy();
  }
});
