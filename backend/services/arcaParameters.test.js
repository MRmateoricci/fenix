import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ArcaParameterError,
  documentKind,
  resolveVatRateType,
  validateConfiguredPointOfSale,
} from './arcaParameters.js';

test('reconoce la descripción productiva de documento 99 sin aceptar otros códigos', () => {
  assert.equal(documentKind({ id: 99, description: 'Doc. (otro)' }), 'consumer_final');
  assert.equal(documentKind({ id: 98, description: 'Doc. (otro)' }), null);
});

test('resuelve la alícuota por descripción vigente y no hardcodea su ID', () => {
  assert.deepEqual(resolveVatRateType(21, [
    { id: 4, description: '10,5%' },
    { id: 900, description: 'IVA 21 %' },
  ]), { id: 900, description: 'IVA 21 %' });
  assert.throws(
    () => resolveVatRateType(21, [{ id: 4, description: '10,5%' }]),
    (error) => error.code === 'ARCA_VAT_RATE_INVALID',
  );
});

function noPoints602() {
  return new ArcaParameterError('602: Sin Resultados: Metodo FEParamGetPtosVenta', {
    code: 'ARCA_PARAMETER_REJECTED',
    messages: [{ code: '602', message: 'Sin Resultados: Metodo FEParamGetPtosVenta', type: 'error' }],
  });
}

test('valida normalmente un punto informado y habilitado por FEParamGetPtosVenta', async () => {
  let lastAuthorizedCalled = false;
  const point = await validateConfiguredPointOfSale(
    { pointOfSale: 2, voucherType: 11, environment: 'homologation' },
    {
      loadPoints: async (options) => {
        assert.equal(options.allowStaleOnError, false);
        return { items: [{ number: 2, blocked: false, validTo: null, emissionType: 'CAE' }] };
      },
      loadLastAuthorized: async () => { lastAuthorizedCalled = true; },
    },
  );
  assert.equal(point.number, 2);
  assert.equal(point.validationSource, 'FEParamGetPtosVenta');
  assert.equal(lastAuthorizedCalled, false);
});

test('homologación acepta 602 si FECompUltimoAutorizado confirma un número >= 0', async () => {
  const warnings = [];
  const point = await validateConfiguredPointOfSale(
    { pointOfSale: 2, voucherType: 11, environment: 'homologation' },
    {
      loadPoints: async () => { throw noPoints602(); },
      loadLastAuthorized: async (pointOfSale, voucherType) => {
        assert.equal(pointOfSale, 2);
        assert.equal(voucherType, 11);
        return { voucherNumber: 0, errors: [] };
      },
      warn: (message) => warnings.push(message),
    },
  );
  assert.equal(point.number, 2);
  assert.equal(point.lastAuthorizedVoucher, 0);
  assert.equal(point.validationSource, 'FECompUltimoAutorizado');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /FEParamGetPtosVenta devolvió 602/);
});

test('producción mantiene validación estricta ante el mismo error 602', async () => {
  let lastAuthorizedCalled = false;
  await assert.rejects(
    validateConfiguredPointOfSale(
      { pointOfSale: 2, voucherType: 11, environment: 'production' },
      {
        loadPoints: async () => { throw noPoints602(); },
        loadLastAuthorized: async () => { lastAuthorizedCalled = true; },
      },
    ),
    (error) => error.code === 'ARCA_PARAMETER_REJECTED' && error.messages[0].code === '602',
  );
  assert.equal(lastAuthorizedCalled, false);
});

test('homologación no aplica el fallback para errores distintos de 602', async () => {
  const error = new ArcaParameterError('Error paramétrico', {
    code: 'ARCA_PARAMETER_REJECTED',
    messages: [{ code: '1000', message: 'Error diferente', type: 'error' }],
  });
  await assert.rejects(
    validateConfiguredPointOfSale(
      { pointOfSale: 2, voucherType: 11, environment: 'homologation' },
      { loadPoints: async () => { throw error; } },
    ),
    (received) => received === error,
  );
});

test('el fallback detiene la emisión si el punto no está habilitado', async () => {
  await assert.rejects(
    validateConfiguredPointOfSale(
      { pointOfSale: 2, voucherType: 11, environment: 'homologation' },
      {
        loadPoints: async () => { throw noPoints602(); },
        loadLastAuthorized: async () => ({
          voucherNumber: Number.NaN,
          errors: [{ code: '11002', message: 'Punto de venta no habilitado', type: 'error' }],
        }),
        warn: () => {},
      },
    ),
    (error) => error.code === 'ARCA_POINT_OF_SALE_DISABLED',
  );
});

test('el fallback rechaza una numeración inválida', async () => {
  await assert.rejects(
    validateConfiguredPointOfSale(
      { pointOfSale: 2, voucherType: 11, environment: 'homologation' },
      {
        loadPoints: async () => { throw noPoints602(); },
        loadLastAuthorized: async () => ({ voucherNumber: -1, errors: [] }),
        warn: () => {},
      },
    ),
    (error) => error.code === 'ARCA_POINT_OF_SALE_VALIDATION_ERROR',
  );
});
