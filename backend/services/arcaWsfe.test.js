import test from 'node:test';
import assert from 'node:assert/strict';
import { arcaEnvironments } from '../config/arca.js';
import {
  createCAE,
  getCondicionesIvaReceptor,
  getLastAuthorized,
  getTiposDocumento,
  isVoucherNotFound,
  normalizeMessages,
  setWsfeDependenciesForTests,
  testConnection,
} from './arcaWsfe.js';

function configure(client) {
  process.env.ARCA_ENV = 'homologation';
  process.env.ARCA_CUIT = '20123456786';
  setWsfeDependenciesForTests({
    client,
    wsdl: arcaEnvironments.homologation.wsfeWsdl,
    ticketProvider: async () => ({ token: 'test-token', sign: 'test-sign' }),
  });
}

test.afterEach(() => setWsfeDependenciesForTests());

test('normaliza errores, eventos y observaciones SOAP', () => {
  assert.deepEqual(normalizeMessages({ Err: [{ Code: 602, Msg: 'Sin datos' }] }, 'Err', 'error'), [
    { code: '602', message: 'Sin datos', type: 'error' },
  ]);
  assert.equal(isVoucherNotFound({ found: false, errors: [{ code: '602' }] }), true);
});

test('FEDummy no inyecta Auth y normaliza servidores', async () => {
  let args;
  configure({ FEDummyAsync: async (request) => { args = request; return [{ FEDummyResult: { AppServer: 'OK', DbServer: 'OK', AuthServer: 'OK' } }]; } });
  assert.deepEqual(await testConnection(), { appServer: 'OK', dbServer: 'OK', authServer: 'OK' });
  assert.deepEqual(args, {});
});

test('métodos paramétricos y último autorizado inyectan credenciales', async () => {
  let lastArgs;
  configure({
    FEParamGetTiposDocAsync: async (args) => [{ FEParamGetTiposDocResult: { ResultGet: { DocTipo: [{ Id: 96, Desc: 'DNI' }] } } }],
    FEParamGetCondicionIvaReceptorAsync: async (args) => [{ FEParamGetCondicionIvaReceptorResult: { ResultGet: { CondicionIvaReceptor: [{ Id: 5, Desc: 'Consumidor Final' }] } } }],
    FECompUltimoAutorizadoAsync: async (args) => { lastArgs = args; return [{ FECompUltimoAutorizadoResult: { PtoVta: 2, CbteTipo: 11, CbteNro: 7 } }]; },
  });
  assert.equal((await getTiposDocumento()).items[0].Id, 96);
  assert.equal((await getCondicionesIvaReceptor('C')).items[0].Id, 5);
  assert.equal((await getLastAuthorized(2, 11)).voucherNumber, 7);
  assert.equal(lastArgs.Auth.Cuit, '20123456786');
  assert.equal(lastArgs.Auth.Token, 'test-token');
});

test('createCAE conserva observaciones aunque el resultado sea autorizado', async () => {
  configure({ FECAESolicitarAsync: async () => [{ FECAESolicitarResult: {
    FeCabResp: { Resultado: 'A' },
    FeDetResp: { FECAEDetResponse: [{ Resultado: 'A', CAE: '123', CAEFchVto: '20260825', Observaciones: { Obs: { Code: 100, Msg: 'Aviso' } } }] },
  } }] });
  const response = await createCAE({ FeCabReq: { CantReg: 1 }, FeDetReq: { FECAEDetRequest: [{}] } });
  assert.equal(response.details[0].Resultado, 'A');
  assert.deepEqual(response.details[0].observations, [{ code: '100', message: 'Aviso', type: 'observation' }]);
});
