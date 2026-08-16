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

  if (environment === 'production' && process.env.ARCA_PRODUCTION_ENABLED !== 'true') {
    throw new ArcaConfigError(
      'Las conexiones ARCA de producción están bloqueadas. Configure ARCA_PRODUCTION_ENABLED=true de forma explícita para habilitarlas.',
      'ARCA_PRODUCTION_DISABLED',
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
  const productionEnabled = enabledFlag(environmentVariables.ARCA_PRODUCTION_ENABLED);
  const validEnvironment = Boolean(ENVIRONMENTS[environment]);
  const productionAllowed = environment !== 'production' || productionEnabled;
  const enabled = validEnvironment && autoInvoiceRequested && productionAllowed;

  let disabledReason = null;
  if (!validEnvironment) disabledReason = 'invalid_environment';
  else if (!autoInvoiceRequested) disabledReason = 'auto_invoice_disabled';
  else if (!productionAllowed) disabledReason = 'production_disabled';

  return Object.freeze({
    environment,
    isProduction: environment === 'production',
    autoInvoiceRequested,
    productionEnabled,
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

  const issuer = {
    legalName: String(process.env.ARCA_LEGAL_NAME || '').trim(),
    taxAddress: String(process.env.ARCA_TAX_ADDRESS || '').trim(),
    taxCondition: String(process.env.ARCA_TAX_CONDITION || 'Monotributo').trim(),
    grossIncome: String(process.env.ARCA_IIBB || '').trim(),
    activityStartDate: String(process.env.ARCA_ACTIVITY_START_DATE || '').trim(),
  };

  if (requireIssuerData) {
    issuer.legalName = required('LEGAL_NAME', issuer.legalName);
    issuer.taxAddress = required('TAX_ADDRESS', issuer.taxAddress);
    issuer.activityStartDate = required('ACTIVITY_START_DATE', issuer.activityStartDate);
  }

  return Object.freeze({
    environment,
    isProduction: environment === 'production',
    wsaaWsdl: endpoints.wsaaWsdl,
    wsfeWsdl: endpoints.wsfeWsdl,
    service: 'wsfe',
    cuit: normalizeCuit(process.env.ARCA_CUIT),
    pointOfSale,
    defaultVoucherType: integer('DEFAULT_CBTE_TIPO', process.env.ARCA_DEFAULT_CBTE_TIPO, {
      defaultValue: 11,
    }),
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

export const arcaEnvironments = ENVIRONMENTS;
