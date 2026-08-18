import test from 'node:test';
import assert from 'node:assert/strict';
import { arcaEnvironments } from '../config/arca.js';
import {
  createCAE,
  getCondicionesIvaReceptor,
  getLastAuthorized,
  getTiposDocumento,
  getTiposIva,
  isVoucherNotFound,
  normalizeMessages,
  setWsfeDependenciesForTests,
  testConnection,
} from './arcaWsfe.js';

function configure(client) {
  process.env.ARCA_ENV = 'homologation';
  process.env.ARCA_CUIT = '20123456786';
  process.env.ARCA_TAX_CONDITION = 'Monotributo';
  delete process.env.ARCA_A_AUTHORIZATION_MODE;
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

test('el cliente SOAP aplica el mismo agente ARCA al WSDL y a FEDummy', async () => {
  process.env.ARCA_ENV = 'production';
  process.env.ARCA_PRODUCTION_ENABLED = 'false';
  process.env.ARCA_CUIT = '20123456786';
  process.env.ARCA_TAX_CONDITION = 'Responsable Inscripto';
  process.env.ARCA_A_AUTHORIZATION_MODE = 'standard';
  let factoryOptions;
  let operationOptions;
  setWsfeDependenciesForTests({
    clientFactory: async (wsdl, options) => {
      assert.equal(wsdl, arcaEnvironments.production.wsfeWsdl);
      factoryOptions = options;
      return {
        FEDummyAsync: async (args, requestOptions) => {
          operationOptions = requestOptions;
          return [{ FEDummyResult: { AppServer: 'OK', DbServer: 'OK', AuthServer: 'OK' } }];
        },
      };
    },
    ticketProvider: async () => ({ token: 'test-token', sign: 'test-sign' }),
  });

  assert.equal((await testConnection()).appServer, 'OK');
  const agent = factoryOptions.wsdl_options.httpsAgent;
  assert.strictEqual(factoryOptions.request.defaults.httpsAgent, agent);
  assert.strictEqual(operationOptions.httpsAgent, agent);
  assert.match(agent.options.ciphers, /@SECLEVEL=1/);
  assert.notEqual(agent.options.rejectUnauthorized, false);
});

test('métodos paramétricos y último autorizado inyectan credenciales', async () => {
  let lastArgs;
  configure({
    FEParamGetTiposDocAsync: async (args) => [{ FEParamGetTiposDocResult: { ResultGet: { DocTipo: [{ Id: 96, Desc: 'DNI' }] } } }],
    FEParamGetTiposIvaAsync: async () => [{ FEParamGetTiposIvaResult: { ResultGet: { IvaTipo: [{ Id: 5, Desc: '21%' }] } } }],
    FEParamGetCondicionIvaReceptorAsync: async (args) => [{ FEParamGetCondicionIvaReceptorResult: { ResultGet: { CondicionIvaReceptor: [{ Id: 5, Desc: 'Consumidor Final' }] } } }],
    FECompUltimoAutorizadoAsync: async (args) => { lastArgs = args; return [{ FECompUltimoAutorizadoResult: { PtoVta: 2, CbteTipo: 11, CbteNro: 7 } }]; },
  });
  assert.equal((await getTiposDocumento()).items[0].Id, 96);
  assert.equal((await getTiposIva()).items[0].Id, 5);
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
  const response = await createCAE({ FeCabReq: { CantReg: 1, CbteTipo: 11 }, FeDetReq: { FECAEDetRequest: [{}] } });
  assert.equal(response.details[0].Resultado, 'A');
  assert.deepEqual(response.details[0].observations, [{ code: '100', message: 'Aviso', type: 'observation' }]);
});

test('producción permite FEDummy pero bloquea FECAESolicitar sin habilitación', async () => {
  process.env.ARCA_ENV = 'production';
  process.env.ARCA_PRODUCTION_ENABLED = 'false';
  process.env.ARCA_CUIT = '20123456786';
  process.env.ARCA_TAX_CONDITION = 'Responsable Inscripto';
  process.env.ARCA_A_AUTHORIZATION_MODE = 'standard';
  process.env.ARCA_ACTIVITY_START_DATE = '2024-01-15';
  let issueCalls = 0;
  setWsfeDependenciesForTests({
    client: {
      FEDummyAsync: async () => [{ FEDummyResult: { AppServer: 'OK', DbServer: 'OK', AuthServer: 'OK' } }],
      FECAESolicitarAsync: async () => { issueCalls += 1; },
    },
    wsdl: arcaEnvironments.production.wsfeWsdl,
    ticketProvider: async () => ({ token: 'test-token', sign: 'test-sign' }),
  });

  assert.equal((await testConnection()).appServer, 'OK');
  await assert.rejects(
    createCAE({ FeCabReq: { CantReg: 1, CbteTipo: 1 }, FeDetReq: { FECAEDetRequest: [{}] } }),
    (error) => error.code === 'ARCA_PRODUCTION_EMISSION_DISABLED',
  );
  assert.equal(issueCalls, 0);
});

test('defensa final impide Factura C para Responsable Inscripto', async () => {
  process.env.ARCA_ENV = 'homologation';
  process.env.ARCA_CUIT = '20123456786';
  process.env.ARCA_TAX_CONDITION = 'Responsable Inscripto';
  process.env.ARCA_A_AUTHORIZATION_MODE = 'standard';
  let issueCalls = 0;
  setWsfeDependenciesForTests({
    client: { FECAESolicitarAsync: async () => { issueCalls += 1; } },
    wsdl: arcaEnvironments.homologation.wsfeWsdl,
    ticketProvider: async () => ({ token: 'test-token', sign: 'test-sign' }),
  });

  await assert.rejects(
    createCAE({ FeCabReq: { CantReg: 1, CbteTipo: 11 }, FeDetReq: { FECAEDetRequest: [{}] } }),
    (error) => error.code === 'ARCA_WSFE_VOUCHER_NOT_ALLOWED_FOR_ISSUER',
  );
  assert.equal(issueCalls, 0);
});
