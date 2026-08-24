import soap from 'soap';
import { getArcaConfig } from '../config/arca.js';
import { getAccessTicketForService } from './arcaAuth.js';
import { isValidCuit } from './invoiceFiscal.js';
import { redactArcaSecrets } from './arcaSafeLog.js';
import { createArcaSoapTransport } from './arcaTls.js';

const REGISTRY_SERVICE = 'ws_sr_constancia_inscripcion';
const SOAP_TIMEOUT_MS = 30_000;
const PROFILE_CACHE_TTL_MS = 10 * 60_000;
const PROFILE_CACHE_LIMIT = 500;

let registryClientRequest = null;
let registryClientWsdl = null;
let registryTransport = null;
let soapClientFactory = soap.createClientAsync;
let accessTicketProvider = getAccessTicketForService;
const profileCache = new Map();

export class ArcaTaxpayerRegistryError extends Error {
  constructor(message, {
    code = 'ARCA_TAXPAYER_REGISTRY_ERROR',
    cause,
    recoverable = true,
  } = {}) {
    super(message, { cause });
    this.name = 'ArcaTaxpayerRegistryError';
    this.code = code;
    this.recoverable = recoverable;
  }
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizedCuit(value) {
  const cuit = String(value ?? '').replace(/\D/g, '');
  if (!isValidCuit(cuit)) {
    throw new ArcaTaxpayerRegistryError('Ingresá un CUIT válido de 11 dígitos.', {
      code: 'ARCA_TAXPAYER_CUIT_INVALID',
      recoverable: false,
    });
  }
  return cuit;
}

function activeStatus(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  return !normalized || ['AC', 'ACTIVO', 'ACTIVE'].includes(normalized);
}

function taxpayerName(data) {
  const legalName = String(data?.razonSocial || '').trim();
  if (legalName) return legalName;
  return [data?.apellido, data?.nombre]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');
}

function registryErrors(personaReturn) {
  const container = personaReturn?.errorConstancia;
  if (!container) return [];
  const entries = [
    ...asArray(container?.error),
    ...asArray(container?.Error),
    ...(typeof container === 'string' ? [container] : []),
  ];
  return entries.map((entry) => String(
    entry?.mensaje ?? entry?.descripcion ?? entry?.message ?? entry?.Msg ?? entry,
  ).trim()).filter(Boolean);
}

export function normalizeTaxpayerProfile(personaReturn, expectedCuit = null) {
  const errors = registryErrors(personaReturn);
  if (errors.length) {
    throw new ArcaTaxpayerRegistryError('ARCA no encontró una constancia vigente para este CUIT.', {
      code: 'ARCA_TAXPAYER_NOT_FOUND',
      recoverable: false,
    });
  }

  const data = personaReturn?.datosGenerales;
  const cuit = String(data?.idPersona ?? expectedCuit ?? '').replace(/\D/g, '');
  const name = taxpayerName(data);
  if (!data || !/^\d{11}$/.test(cuit) || !name) {
    throw new ArcaTaxpayerRegistryError('ARCA devolvió datos incompletos para ese CUIT.', {
      code: 'ARCA_TAXPAYER_INVALID_RESPONSE',
    });
  }
  if (!activeStatus(data.estadoClave)) {
    throw new ArcaTaxpayerRegistryError('El CUIT no figura activo en ARCA.', {
      code: 'ARCA_TAXPAYER_INACTIVE',
      recoverable: false,
    });
  }

  const taxContainer = personaReturn?.datosRegimenGeneral?.impuesto;
  const taxes = asArray(taxContainer?.impuesto ?? taxContainer);
  const registered = taxes.some((tax) => (
    Number(tax?.idImpuesto) === 30
    && activeStatus(tax?.estadoImpuesto)
  ));
  const monotributoData = personaReturn?.datosMonotributo;
  const monotributo = Boolean(
    monotributoData?.categoriaMonotributo
    || asArray(monotributoData?.impuesto).length
    || asArray(monotributoData?.actividad).length
    || monotributoData?.actividadMonotributista,
  );

  return Object.freeze({
    cuit,
    name,
    // Una constancia activa que no registra IVA ni Monotributo corresponde a
    // un receptor exento para las clases que admite este comercio. La clase
    // final se resuelve contra las condiciones vigentes informadas por WSFE.
    category: registered ? 'registered' : (monotributo ? 'monotributo' : 'exempt'),
  });
}

export function profileForInvoiceRecipient(profile, invoiceOptions) {
  const expectedClasses = ['registered', 'monotributo'].includes(profile?.category)
    ? ['A', 'ALEY']
    : profile?.category === 'exempt' ? ['B'] : [];
  const condition = invoiceOptions?.vatConditions?.find((option) => (
    option.category === profile?.category
    && expectedClasses.includes(option.invoiceClass)
  ));
  if (!condition) {
    throw new ArcaTaxpayerRegistryError(
      'La condición fiscal del CUIT no es compatible con la facturación de la tienda.',
      { code: 'ARCA_TAXPAYER_CONDITION_UNAVAILABLE', recoverable: false },
    );
  }
  return Object.freeze({
    ...profile,
    vatConditionId: condition.id,
    vatConditionDescription: condition.description,
    invoiceClass: condition.invoiceClass,
  });
}

export function profileForInvoiceA(profile, invoiceOptions) {
  if (!['registered', 'monotributo'].includes(profile?.category)) {
    throw new ArcaTaxpayerRegistryError(
      'El CUIT no figura en una condición habilitada para Factura A.',
      { code: 'ARCA_TAXPAYER_NOT_ELIGIBLE_FOR_A', recoverable: false },
    );
  }
  return profileForInvoiceRecipient(profile, invoiceOptions);
}

async function getRegistryClient(wsdl) {
  if (!registryClientRequest || registryClientWsdl !== wsdl) {
    registryTransport?.httpsAgent.destroy();
    registryTransport = createArcaSoapTransport(wsdl, { timeout: SOAP_TIMEOUT_MS });
    registryClientWsdl = wsdl;
    registryClientRequest = soapClientFactory(wsdl, registryTransport.soapOptions).catch((cause) => {
      registryTransport?.httpsAgent.destroy();
      registryTransport = null;
      registryClientRequest = null;
      registryClientWsdl = null;
      throw new ArcaTaxpayerRegistryError(
        `No se pudo conectar al padrón de ARCA: ${redactArcaSecrets(cause.message)}`,
        { code: 'ARCA_TAXPAYER_CONNECTION_ERROR', cause },
      );
    });
  }
  return registryClientRequest;
}

function readCachedProfile(cuit) {
  const cached = profileCache.get(cuit);
  if (!cached || cached.expiresAt <= Date.now()) {
    profileCache.delete(cuit);
    return null;
  }
  return cached.profile;
}

function cacheProfile(cuit, profile) {
  if (profileCache.size >= PROFILE_CACHE_LIMIT) {
    profileCache.delete(profileCache.keys().next().value);
  }
  profileCache.set(cuit, { profile, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS });
}

export async function lookupTaxpayer(value) {
  const cuit = normalizedCuit(value);
  const cached = readCachedProfile(cuit);
  if (cached) return cached;

  const config = getArcaConfig();
  const [{ token, sign }, client] = await Promise.all([
    accessTicketProvider(REGISTRY_SERVICE),
    getRegistryClient(config.taxpayerRegistryWsdl),
  ]);
  const method = client.getPersona_v2Async;
  if (typeof method !== 'function') {
    throw new ArcaTaxpayerRegistryError('El padrón de ARCA no expone la consulta esperada.', {
      code: 'ARCA_TAXPAYER_METHOD_UNAVAILABLE',
    });
  }

  let response;
  try {
    [response] = await method.call(client, {
      token,
      sign,
      cuitRepresentada: config.cuit,
      idPersona: cuit,
    }, registryTransport?.operationOptions || { timeout: SOAP_TIMEOUT_MS });
  } catch (cause) {
    throw new ArcaTaxpayerRegistryError(
      `La consulta al padrón de ARCA falló: ${redactArcaSecrets(cause.message)}`,
      { code: 'ARCA_TAXPAYER_REQUEST_ERROR', cause },
    );
  }

  const personaReturn = response?.personaReturn ?? response?.return;
  if (!personaReturn) {
    throw new ArcaTaxpayerRegistryError('ARCA devolvió una respuesta vacía para el CUIT.', {
      code: 'ARCA_TAXPAYER_INVALID_RESPONSE',
    });
  }
  const profile = normalizeTaxpayerProfile(personaReturn, cuit);
  cacheProfile(cuit, profile);
  return profile;
}

export function __setArcaTaxpayerRegistryDependenciesForTests({
  createClient,
  getTicket,
} = {}) {
  soapClientFactory = createClient || soap.createClientAsync;
  accessTicketProvider = getTicket || getAccessTicketForService;
  registryClientRequest = null;
  registryClientWsdl = null;
  registryTransport?.httpsAgent.destroy();
  registryTransport = null;
  profileCache.clear();
}

export { REGISTRY_SERVICE };
