import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

dotenv.config({ path: path.join(backendRoot, '.env') });

const ENVIRONMENTS = Object.freeze({
  homologation: Object.freeze({
    wsaaWsdl: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms?WSDL',
    wsfeWsdl: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL',
  }),
  production: Object.freeze({
    wsaaWsdl: 'https://wsaa.afip.gov.ar/ws/services/LoginCms?WSDL',
    wsfeWsdl: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL',
  }),
});

const A_AUTHORIZATION_MODES = Object.freeze([
  'standard',
  'cbu_informed',
  'subject_to_withholding',
]);

export class ArcaConfigError extends Error {
  constructor(message, code = 'ARCA_CONFIG_ERROR') {
    super(message);
    this.name = 'ArcaConfigError';
    this.code = code;
  }
}

function required(name, value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new ArcaConfigError(`Falta configurar ${name}.`, `ARCA_${name}_REQUIRED`);
  }
  return normalized;
}

function integer(name, value, { requiredValue = false, defaultValue } = {}) {
  if ((value === undefined || value === null || value === '') && defaultValue !== undefined) {
    return defaultValue;
  }
  if ((value === undefined || value === null || value === '') && !requiredValue) return null;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ArcaConfigError(`${name} debe ser un entero positivo.`, `ARCA_${name}_INVALID`);
  }
  return parsed;
}

function normalizedLabel(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function issuerVatCategory(value) {
  const normalized = normalizedLabel(value);
  if (/responsable (?:inscripto|inscrito)/.test(normalized)) return 'registered';
  if (/monotribut/.test(normalized)) return 'monotributo';
  if (/\bexent[oa]\b/.test(normalized)) return 'exempt';
  throw new ArcaConfigError(
    'ARCA_TAX_CONDITION debe identificar al emisor como Responsable Inscripto, Monotributo o Exento.',
    'ARCA_TAX_CONDITION_INVALID',
  );
}

function readAAuthorizationMode(taxCategory) {
  const mode = String(process.env.ARCA_A_AUTHORIZATION_MODE || '').trim().toLowerCase();
  if (taxCategory === 'registered' && !mode) {
    throw new ArcaConfigError(
      'ARCA_A_AUTHORIZATION_MODE es obligatorio para un emisor Responsable Inscripto. No se asume habilitación A standard.',
      'ARCA_A_AUTHORIZATION_MODE_REQUIRED',
    );
  }
  if (mode && !A_AUTHORIZATION_MODES.includes(mode)) {
    throw new ArcaConfigError(
      `ARCA_A_AUTHORIZATION_MODE debe ser ${A_AUTHORIZATION_MODES.join(', ')}.`,
      'ARCA_A_AUTHORIZATION_MODE_INVALID',
    );
  }
  return mode || null;
}

function readActivityStartDate(value, { requiredValue = false } = {}) {
  const normalized = String(value ?? '').trim();
  if (!normalized && !requiredValue) return '';
  if (!normalized) return required('ACTIVITY_START_DATE', normalized);
  if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(normalized)) {
    throw new ArcaConfigError(
      'ARCA_ACTIVITY_START_DATE debe usar YYYY-MM o YYYY-MM-DD.',
      'ARCA_ACTIVITY_START_DATE_INVALID',
    );
  }
  const month = Number(normalized.slice(5, 7));
  if (month < 1 || month > 12) {
    throw new ArcaConfigError(
      'ARCA_ACTIVITY_START_DATE no contiene un mes válido.',
      'ARCA_ACTIVITY_START_DATE_INVALID',
    );
  }
  if (normalized.length === 10 && Number.isNaN(Date.parse(`${normalized}T12:00:00Z`))) {
    throw new ArcaConfigError(
      'ARCA_ACTIVITY_START_DATE no contiene una fecha válida.',
      'ARCA_ACTIVITY_START_DATE_INVALID',
    );
  }
  return normalized;
}

export function resolveBackendPath(filePath) {
  const configuredPath = required('PATH', filePath);
  return path.isAbsolute(configuredPath)
    ? path.normalize(configuredPath)
    : path.resolve(backendRoot, configuredPath);
}

export function normalizeCuit(value) {
  const cuit = String(value ?? '').replace(/\D/g, '');
  if (!/^\d{11}$/.test(cuit)) {
    throw new ArcaConfigError('ARCA_CUIT debe contener exactamente 11 dígitos.', 'ARCA_CUIT_INVALID');
  }
  return cuit;
}

function readEnvironment() {
  const environment = String(process.env.ARCA_ENV || 'homologation').trim().toLowerCase();
  if (!ENVIRONMENTS[environment]) {
    throw new ArcaConfigError(
      'ARCA_ENV debe ser homologation o production.',
      'ARCA_ENV_INVALID',
    );
  }
  return environment;
}

function enabledFlag(value) {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

/**
 * La activación del intento automático se evalúa sin cargar CUIT, certificados
 * ni datos del emisor. Así el servidor puede iniciar con la automatización apagada y
 * ninguna configuración incompleta termina abriendo una conexión con ARCA.
 */
export function getArcaAutomationConfig(environmentVariables = process.env) {
  const environment = String(environmentVariables.ARCA_ENV || 'homologation').trim().toLowerCase();
  const autoInvoiceRequested = enabledFlag(environmentVariables.ARCA_AUTO_INVOICE_ENABLED);
  const productionEmissionEnabled = enabledFlag(environmentVariables.ARCA_PRODUCTION_ENABLED);
  const validEnvironment = Boolean(ENVIRONMENTS[environment]);
  const productionAllowed = environment !== 'production' || productionEmissionEnabled;
  const enabled = validEnvironment && autoInvoiceRequested && productionAllowed;

  let disabledReason = null;
  if (!validEnvironment) disabledReason = 'invalid_environment';
  else if (!autoInvoiceRequested) disabledReason = 'auto_invoice_disabled';
  else if (!productionAllowed) disabledReason = 'production_disabled';

  return Object.freeze({
    environment,
    isProduction: environment === 'production',
    autoInvoiceRequested,
    productionEmissionEnabled,
    enabled,
    disabledReason,
  });
}

export function getArcaConfig({ requirePointOfSale = false, requireIssuerData = false } = {}) {
  const environment = readEnvironment();
  const endpoints = ENVIRONMENTS[environment];
  const pointOfSale = integer('PTO_VTA', process.env.ARCA_PTO_VTA, {
    requiredValue: requirePointOfSale,
  });
  const taxCondition = required('TAX_CONDITION', process.env.ARCA_TAX_CONDITION);
  const taxCategory = issuerVatCategory(taxCondition);
  const aAuthorizationMode = readAAuthorizationMode(taxCategory);

  const issuer = {
    legalName: String(process.env.ARCA_LEGAL_NAME || '').trim(),
    taxAddress: String(process.env.ARCA_TAX_ADDRESS || '').trim(),
    taxCondition,
    taxCategory,
    aAuthorizationMode,
    grossIncome: String(process.env.ARCA_IIBB || '').trim(),
    activityStartDate: readActivityStartDate(process.env.ARCA_ACTIVITY_START_DATE, {
      requiredValue: requireIssuerData,
    }),
  };

  if (requireIssuerData) {
    issuer.legalName = required('LEGAL_NAME', issuer.legalName);
    issuer.taxAddress = required('TAX_ADDRESS', issuer.taxAddress);
  }

  return Object.freeze({
    environment,
    isProduction: environment === 'production',
    productionEmissionEnabled: enabledFlag(process.env.ARCA_PRODUCTION_ENABLED),
    wsaaWsdl: endpoints.wsaaWsdl,
    wsfeWsdl: endpoints.wsfeWsdl,
    service: 'wsfe',
    cuit: normalizeCuit(process.env.ARCA_CUIT),
    pointOfSale,
    defaultConcept: integer('DEFAULT_CONCEPTO', process.env.ARCA_DEFAULT_CONCEPTO, {
      defaultValue: 1,
    }),
    certificatePath: resolveBackendPath(
      process.env.ARCA_CERT_PATH || './config/arca/arca_certificate.crt',
    ),
    privateKeyPath: resolveBackendPath(
      process.env.ARCA_KEY_PATH || './config/arca/arca_private.key',
    ),
    openSslPath: String(process.env.ARCA_OPENSSL_PATH || 'openssl').trim(),
    issuer: Object.freeze(issuer),
  });
}

export function assertArcaEmissionAllowed(config = getArcaConfig()) {
  if (!config.isProduction) return config;
  if (!config.productionEmissionEnabled) {
    throw new ArcaConfigError(
      'FECAESolicitar está bloqueado en producción. ARCA_PRODUCTION_ENABLED debe ser true para emitir.',
      'ARCA_PRODUCTION_EMISSION_DISABLED',
    );
  }
  return config;
}

export const arcaEnvironments = ENVIRONMENTS;
export const arcaAAuthorizationModes = A_AUTHORIZATION_MODES;
