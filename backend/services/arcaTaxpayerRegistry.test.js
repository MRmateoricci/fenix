import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ArcaTaxpayerRegistryError,
  lookupTaxpayer,
  normalizeTaxpayerProfile,
  profileForInvoiceA,
} from './arcaTaxpayerRegistry.js';

test('rechaza el dígito verificador inválido antes de consultar servicios externos', async () => {
  await assert.rejects(
    lookupTaxpayer('20-12345678-0'),
    (error) => error.code === 'ARCA_TAXPAYER_CUIT_INVALID',
  );
});

test('normaliza Responsable Inscripto desde el impuesto IVA activo', () => {
  const profile = normalizeTaxpayerProfile({
    datosGenerales: {
      idPersona: '30712345678',
      estadoClave: 'ACTIVO',
      razonSocial: 'EJEMPLO INDUSTRIAL SA',
    },
    datosRegimenGeneral: {
      impuesto: [
        { idImpuesto: 30, descripcionImpuesto: 'IVA', estadoImpuesto: 'AC' },
      ],
    },
  });

  assert.deepEqual(profile, {
    cuit: '30712345678',
    name: 'EJEMPLO INDUSTRIAL SA',
    category: 'registered',
  });
});

test('normaliza persona humana monotributista con apellido y nombre', () => {
  const profile = normalizeTaxpayerProfile({
    datosGenerales: {
      idPersona: '20123456786',
      estadoClave: 'ACTIVO',
      apellido: 'PÉREZ',
      nombre: 'ANA',
    },
    datosMonotributo: { categoriaMonotributo: { idCategoria: 'A' } },
  });

  assert.equal(profile.name, 'PÉREZ ANA');
  assert.equal(profile.category, 'monotributo');
});

test('rechaza CUIT sin constancia o sin condición válida para Factura A', () => {
  assert.throws(
    () => normalizeTaxpayerProfile({ errorConstancia: { error: 'Persona inexistente' } }),
    (error) => error instanceof ArcaTaxpayerRegistryError
      && error.code === 'ARCA_TAXPAYER_NOT_FOUND'
      && error.recoverable === false,
  );

  assert.throws(
    () => profileForInvoiceA(
      { cuit: '20123456786', name: 'ANA', category: null },
      { vatConditions: [] },
    ),
    (error) => error.code === 'ARCA_TAXPAYER_NOT_ELIGIBLE_FOR_A',
  );
});

test('traduce la categoría fiscal al identificador vigente informado por ARCA', () => {
  const result = profileForInvoiceA(
    { cuit: '20123456786', name: 'ANA', category: 'monotributo' },
    {
      vatConditions: [
        { id: 1, category: 'registered', invoiceClass: 'A', description: 'IVA Responsable Inscripto' },
        { id: 6, category: 'monotributo', invoiceClass: 'A', description: 'Responsable Monotributo' },
      ],
    },
  );

  assert.equal(result.vatConditionId, 6);
  assert.equal(result.vatConditionDescription, 'Responsable Monotributo');
});
