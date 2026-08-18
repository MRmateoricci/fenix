import soap from 'soap';
import { assertArcaEmissionAllowed, getArcaConfig } from '../config/arca.js';
import { getAccessTicket } from './arcaAuth.js';
import { redactArcaSecrets } from './arcaSafeLog.js';
import { createArcaWsfeTransport } from './arcaTls.js';
import {
  FACTURA_A,
  FACTURA_A_SUJETA_RETENCION,
  FACTURA_B,
  FACTURA_C,
} from './invoiceFiscal.js';

const SOAP_TIMEOUT_MS = 30_000;

let wsfeClientRequest = null;
let wsfeClientWsdl = null;
let wsfeTransport = null;
let accessTicketProvider = getAccessTicket;
let soapClientFactory = soap.createClientAsync;

export class ArcaWsfeError extends Error {
  constructor(message, { code = 'ARCA_WSFE_ERROR', cause, transportError = false } = {}) {
    super(message, { cause });
    this.name = 'ArcaWsfeError';
    this.code = code;
    this.transportError = transportError;
  }
}

export function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function normalizeMessages(container, property, type) {
  return asArray(container?.[property]).map((entry) => ({
    code: String(entry?.Code ?? entry?.code ?? ''),
    message: String(entry?.Msg ?? entry?.message ?? '').trim(),
    type,
  })).filter((entry) => entry.code || entry.message);
}

function responseMessages(response) {
  return {
    errors: normalizeMessages(response?.Errors, 'Err', 'error'),
    events: normalizeMessages(response?.Events, 'Evt', 'event'),
  };
}

function positiveInteger(name, value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ArcaWsfeError(`${name} debe ser un entero positivo.`, {
      code: 'ARCA_WSFE_INVALID_ARGUMENT',
    });
  }
  return parsed;
}

async function getWsfeClient(wsfeWsdl) {
  if (!wsfeClientRequest || wsfeClientWsdl !== wsfeWsdl) {
    wsfeTransport?.httpsAgent.destroy();
    wsfeTransport = createArcaWsfeTransport(wsfeWsdl, { timeout: SOAP_TIMEOUT_MS });
    wsfeClientWsdl = wsfeWsdl;
    wsfeClientRequest = soapClientFactory(wsfeWsdl, wsfeTransport.soapOptions).catch((cause) => {
      wsfeTransport?.httpsAgent.destroy();
      wsfeTransport = null;
      wsfeClientRequest = null;
      wsfeClientWsdl = null;
      throw new ArcaWsfeError(`No se pudo conectar al WSDL de WSFEv1: ${redactArcaSecrets(cause.message)}`, {
        code: 'ARCA_WSFE_CONNECTION_ERROR',
        cause,
        transportError: true,
      });
    });
  }
  return wsfeClientRequest;
}

async function invoke(method, args, resultProperty, { authenticated = true } = {}) {
  const config = getArcaConfig();
  const client = await getWsfeClient(config.wsfeWsdl);
  let request = args;

  if (authenticated) {
    const { token, sign } = await accessTicketProvider();
    request = {
      Auth: { Token: token, Sign: sign, Cuit: config.cuit },
      ...args,
    };
  }

  try {
    const fn = client[`${method}Async`];
    if (typeof fn !== 'function') {
      throw new ArcaWsfeError(`El WSDL de WSFEv1 no expone ${method}.`, {
        code: 'ARCA_WSFE_METHOD_UNAVAILABLE',
      });
    }
    const [soapResponse] = await fn.call(
      client,
      request,
      wsfeTransport?.operationOptions || { timeout: SOAP_TIMEOUT_MS },
    );
    const result = soapResponse?.[resultProperty];
    if (!result) {
      throw new ArcaWsfeError(`${method} devolvió una respuesta vacía o inesperada.`, {
        code: 'ARCA_WSFE_INVALID_RESPONSE',
      });
    }
    return result;
  } catch (cause) {
    if (cause instanceof ArcaWsfeError) throw cause;
    throw new ArcaWsfeError(`${method} falló: ${redactArcaSecrets(cause.message)}`, {
      code: 'ARCA_WSFE_REQUEST_ERROR',
      cause,
      transportError: true,
    });
  }
}

function parameterResponse(result, property) {
  const collection = result?.ResultGet?.[property];
  return {
    items: asArray(collection?.[property] ?? collection),
    ...responseMessages(result),
  };
}

export async function testConnection() {
  const result = await invoke('FEDummy', {}, 'FEDummyResult', { authenticated: false });
  return {
    appServer: result.AppServer,
    dbServer: result.DbServer,
    authServer: result.AuthServer,
  };
}

export async function getPuntosVenta() {
  const result = await invoke('FEParamGetPtosVenta', {}, 'FEParamGetPtosVentaResult');
  return parameterResponse(result, 'PtoVenta');
}

export async function getTiposComprobante() {
  const result = await invoke('FEParamGetTiposCbte', {}, 'FEParamGetTiposCbteResult');
  return parameterResponse(result, 'CbteTipo');
}

export async function getTiposDocumento() {
  const result = await invoke('FEParamGetTiposDoc', {}, 'FEParamGetTiposDocResult');
  return parameterResponse(result, 'DocTipo');
}

export async function getTiposConcepto() {
  const result = await invoke('FEParamGetTiposConcepto', {}, 'FEParamGetTiposConceptoResult');
  return parameterResponse(result, 'ConceptoTipo');
}

export async function getTiposMoneda() {
  const result = await invoke('FEParamGetTiposMonedas', {}, 'FEParamGetTiposMonedasResult');
  return parameterResponse(result, 'Moneda');
}

export async function getTiposIva() {
  const result = await invoke('FEParamGetTiposIva', {}, 'FEParamGetTiposIvaResult');
  return parameterResponse(result, 'IvaTipo');
}

export async function getCondicionesIvaReceptor(claseComprobante = 'C') {
  const invoiceClass = String(claseComprobante || '').trim().toUpperCase();
  if (!['A', 'ALEY', 'B', 'C', '49'].includes(invoiceClass)) {
    throw new ArcaWsfeError('La clase de comprobante debe ser A, ALEY, B, C o 49.', {
      code: 'ARCA_WSFE_INVALID_ARGUMENT',
    });
  }
  const result = await invoke(
    'FEParamGetCondicionIvaReceptor',
    { ClaseCmp: invoiceClass },
    'FEParamGetCondicionIvaReceptorResult',
  );
  return parameterResponse(result, 'CondicionIvaReceptor');
}

export async function getLastAuthorized(ptoVta, cbteTipo) {
  const pointOfSale = positiveInteger('ptoVta', ptoVta);
  const voucherType = positiveInteger('cbteTipo', cbteTipo);
  const result = await invoke('FECompUltimoAutorizado', {
    PtoVta: pointOfSale,
    CbteTipo: voucherType,
  }, 'FECompUltimoAutorizadoResult');
  return {
    pointOfSale: Number(result.PtoVta),
    voucherType: Number(result.CbteTipo),
    voucherNumber: Number(result.CbteNro),
    ...responseMessages(result),
  };
}

export async function getVoucher(ptoVta, cbteTipo, cbteNro) {
  const result = await invoke('FECompConsultar', {
    FeCompConsReq: {
      PtoVta: positiveInteger('ptoVta', ptoVta),
      CbteTipo: positiveInteger('cbteTipo', cbteTipo),
      CbteNro: positiveInteger('cbteNro', cbteNro),
    },
  }, 'FECompConsultarResult');
  const messages = responseMessages(result);
  return {
    found: Boolean(result.ResultGet),
    voucher: result.ResultGet || null,
    observations: normalizeMessages(result.ResultGet?.Observaciones, 'Obs', 'observation'),
    ...messages,
  };
}

export async function createCAE(request) {
  // Defensa final: aunque un caller omita las validaciones del servicio de
  // facturación, FECAESolicitar no puede salir a producción sin opt-in.
  const config = assertArcaEmissionAllowed(getArcaConfig());
  const header = request?.FeCabReq;
  const details = asArray(request?.FeDetReq?.FECAEDetRequest);
  if (!header || details.length === 0) {
    throw new ArcaWsfeError('createCAE requiere FeCabReq y al menos un FECAEDetRequest.', {
      code: 'ARCA_WSFE_INVALID_ARGUMENT',
    });
  }

  const voucherType = Number(header.CbteTipo);
  const allowedVoucherTypes = config.issuer.taxCategory === 'registered'
    ? new Set([
      config.issuer.aAuthorizationMode === 'subject_to_withholding'
        ? FACTURA_A_SUJETA_RETENCION
        : FACTURA_A,
      FACTURA_B,
    ])
    : new Set([FACTURA_C]);
  if (!allowedVoucherTypes.has(voucherType)) {
    throw new ArcaWsfeError(
      `El tipo de comprobante ${header.CbteTipo ?? '-'} no corresponde al emisor configurado.`,
      { code: 'ARCA_WSFE_VOUCHER_NOT_ALLOWED_FOR_ISSUER' },
    );
  }

  const result = await invoke('FECAESolicitar', { FeCAEReq: request }, 'FECAESolicitarResult');
  const normalizedDetails = asArray(result?.FeDetResp?.FECAEDetResponse).map((detail) => ({
    ...detail,
    observations: normalizeMessages(detail?.Observaciones, 'Obs', 'observation'),
  }));
  return {
    header: result.FeCabResp || null,
    details: normalizedDetails,
    ...responseMessages(result),
  };
}

export function isVoucherNotFound(response) {
  return response?.found === false
    && response?.errors?.some((error) => String(error.code) === '602');
}

export function setWsfeDependenciesForTests({
  client = null,
  wsdl = null,
  ticketProvider = getAccessTicket,
  clientFactory = soap.createClientAsync,
} = {}) {
  wsfeTransport?.httpsAgent.destroy();
  wsfeTransport = null;
  wsfeClientRequest = client ? Promise.resolve(client) : null;
  wsfeClientWsdl = client ? wsdl : null;
  accessTicketProvider = ticketProvider;
  soapClientFactory = clientFactory;
}
