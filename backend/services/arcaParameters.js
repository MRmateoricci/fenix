import { getArcaConfig } from '../config/arca.js';
import { DEFAULT_VAT_RATE } from '../config/tax.js';
import { pool } from '../db/pool.js';
import {
  classifyReceiverVatCondition,
  determineVoucherType,
  invoiceClassForVoucherType,
} from './invoiceFiscal.js';
import {
  getCondicionesIvaReceptor,
  getLastAuthorized,
  getPuntosVenta,
  getTiposComprobante,
  getTiposConcepto,
  getTiposDocumento,
  getTiposIva,
  getTiposMoneda,
} from './arcaWsfe.js';

const CACHE_TTL_MS = 12 * 60 * 60 * 1_000;

export class ArcaParameterError extends Error {
  constructor(message, { code = 'ARCA_PARAMETER_ERROR', messages = [], cause } = {}) {
    super(message, { cause });
    this.name = 'ArcaParameterError';
    this.code = code;
    this.messages = messages;
  }
}

function text(value) {
  return String(value ?? '').trim();
}

function normalizedText(value) {
  return text(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function nullableText(value) {
  const normalized = text(value);
  return !normalized || normalized.toUpperCase() === 'NULL' ? null : normalized;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeCatalogItem(item) {
  return {
    id: number(item?.Id ?? item?.Nro),
    description: text(item?.Desc),
    validFrom: nullableText(item?.FchDesde),
    validTo: nullableText(item?.FchHasta),
  };
}

function sanitizePointOfSale(item) {
  return {
    number: number(item?.Nro),
    emissionType: text(item?.EmisionTipo),
    blocked: text(item?.Bloqueado).toUpperCase() === 'S',
    validFrom: nullableText(item?.FchDesde),
    validTo: nullableText(item?.FchBaja),
  };
}

function normalizeLoadedResponse(response, sanitizer) {
  if (response.errors?.length) {
    throw new ArcaParameterError(
      response.errors.map((entry) => `${entry.code}: ${entry.message}`).join('; '),
      { code: 'ARCA_PARAMETER_REJECTED', messages: response.errors },
    );
  }
  const items = response.items.map(sanitizer).filter((item) => (
    Object.hasOwn(item, 'id') ? item.id !== null : item.number !== null
  ));
  if (!items.length) {
    throw new ArcaParameterError('ARCA devolvió un catálogo paramétrico vacío.', {
      code: 'ARCA_PARAMETER_EMPTY',
    });
  }
  return items;
}

async function readCache(cacheKey) {
  const { rows } = await pool.query(
    'SELECT payload, fetched_at FROM arca_parameter_cache WHERE cache_key = $1',
    [cacheKey],
  );
  if (!rows[0]) return null;
  return {
    payload: rows[0].payload,
    fetchedAt: new Date(rows[0].fetched_at),
  };
}

async function writeCache(cacheKey, payload) {
  await pool.query(
    `INSERT INTO arca_parameter_cache (cache_key, payload, fetched_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (cache_key) DO UPDATE
       SET payload = EXCLUDED.payload, fetched_at = NOW()`,
    [cacheKey, JSON.stringify(payload)],
  );
}

function scopedCacheKey(cacheKey) {
  const config = getArcaConfig();
  return `${config.environment}:${config.cuit}:${cacheKey}`;
}

async function cachedCatalog(
  cacheKey,
  loader,
  sanitizer,
  { force = false, allowStaleOnError = true } = {},
) {
  const scopedKey = scopedCacheKey(cacheKey);
  const cached = await readCache(scopedKey);
  const fresh = cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS;
  if (!force && fresh) return { items: cached.payload, stale: false, fetchedAt: cached.fetchedAt };

  try {
    const items = normalizeLoadedResponse(await loader(), sanitizer);
    await writeCache(scopedKey, items);
    return { items, stale: false, fetchedAt: new Date() };
  } catch (cause) {
    if (cached && allowStaleOnError) {
      return { items: cached.payload, stale: true, fetchedAt: cached.fetchedAt };
    }
    throw cause;
  }
}

export const getCachedPuntosVenta = (options) => cachedCatalog(
  'points-of-sale',
  getPuntosVenta,
  sanitizePointOfSale,
  options,
);

export const getCachedTiposComprobante = (options) => cachedCatalog(
  'voucher-types',
  getTiposComprobante,
  sanitizeCatalogItem,
  options,
);

export const getCachedTiposDocumento = (options) => cachedCatalog(
  'document-types',
  getTiposDocumento,
  sanitizeCatalogItem,
  options,
);

export const getCachedTiposConcepto = (options) => cachedCatalog(
  'concept-types',
  getTiposConcepto,
  sanitizeCatalogItem,
  options,
);

export const getCachedTiposMoneda = (options) => cachedCatalog(
  'currency-types',
  getTiposMoneda,
  sanitizeCatalogItem,
  options,
);

export const getCachedTiposIva = (options) => cachedCatalog(
  'vat-types',
  getTiposIva,
  sanitizeCatalogItem,
  options,
);

export const getCachedCondicionesIva = (invoiceClass = 'C', options) => {
  const normalizedClass = String(invoiceClass).trim().toUpperCase();
  if (!['A', 'ALEY', 'B', 'C'].includes(normalizedClass)) {
    throw new ArcaParameterError('La clase de comprobante no está soportada.', {
      code: 'INVOICE_CLASS_NOT_SUPPORTED',
    });
  }
  return cachedCatalog(
    `vat-conditions:${normalizedClass}`,
    () => getCondicionesIvaReceptor(normalizedClass),
    sanitizeCatalogItem,
    options,
  );
};

function issuerInvoiceClasses(config) {
  if (config.issuer.taxCategory !== 'registered') return ['C'];
  return [config.issuer.aAuthorizationMode === 'subject_to_withholding' ? 'ALEY' : 'A', 'B'];
}

export function documentKind(document) {
  const description = normalizedText(document.description);
  if (document.id === 80 && /cuit/.test(description)) return 'cuit';
  if (document.id === 96 && /(dni|documento nacional de identidad)/.test(description)) return 'dni';
  if (document.id === 99 && /(consumidor final|sin identificar|doc\.? \(otro\))/.test(description)) {
    return 'consumer_final';
  }
  return null;
}

function allowedDocumentKinds(vatCategory) {
  if (vatCategory === 'consumer_final') return new Set(['cuit', 'dni', 'consumer_final']);
  return new Set(['cuit']);
}

export async function getInvoiceOptions(config = getArcaConfig()) {
  const invoiceClasses = issuerInvoiceClasses(config);
  const [documentsResponse, ...conditionResponses] = await Promise.all([
    getCachedTiposDocumento(),
    ...invoiceClasses.map((invoiceClass) => getCachedCondicionesIva(invoiceClass)),
  ]);

  const documents = documentsResponse.items
    .map((document) => ({ ...document, kind: documentKind(document) }))
    .filter((document) => document.kind);
  const vatConditions = new Map();

  invoiceClasses.forEach((invoiceClass, index) => {
    for (const condition of conditionResponses[index].items) {
      const category = classifyReceiverVatCondition(condition.description);
      if (!category) continue;
      const voucherType = determineVoucherType({
        issuerVatCondition: config.issuer.taxCategory,
        receiverVatCondition: category,
        aAuthorizationMode: config.issuer.aAuthorizationMode,
      });
      if (invoiceClassForVoucherType(voucherType) !== invoiceClass) continue;
      const allowedKinds = allowedDocumentKinds(category);
      vatConditions.set(condition.id, {
        ...condition,
        category,
        invoiceClass,
        voucherType,
        allowedDocumentTypeIds: documents
          .filter((document) => allowedKinds.has(document.kind))
          .map((document) => document.id),
      });
    }
  });

  if (!vatConditions.size) {
    throw new ArcaParameterError(
      'ARCA no informó condiciones IVA compatibles con el emisor configurado.',
      { code: 'ARCA_VAT_CONDITION_EMPTY' },
    );
  }

  return {
    issuerVatCondition: config.issuer.taxCondition,
    invoiceClasses,
    documents,
    vatConditions: [...vatConditions.values()],
    stale: documentsResponse.stale || conditionResponses.some((response) => response.stale),
  };
}

export async function resolveReceiverInvoiceProfile(vatConditionId, config = getArcaConfig()) {
  const options = await getInvoiceOptions(config);
  const condition = options.vatConditions.find((item) => item.id === Number(vatConditionId));
  if (!condition) {
    throw new ArcaParameterError(
      `La condición IVA ${vatConditionId} no es válida para el emisor configurado.`,
      { code: 'ARCA_VAT_CONDITION_INVALID' },
    );
  }
  return { condition, options };
}

function vatRateFromDescription(description) {
  const match = normalizedText(description).replace(',', '.').match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) : null;
}

export function resolveVatRateType(vatRate, vatTypes) {
  const expected = Number(vatRate);
  const found = vatTypes.find((item) => vatRateFromDescription(item.description) === expected);
  if (!found) {
    throw new ArcaParameterError(
      `ARCA no informó una alícuota vigente de ${expected}%.`,
      { code: 'ARCA_VAT_RATE_INVALID' },
    );
  }
  return found;
}

function isOnlyNoResults602(error) {
  const messages = Array.isArray(error?.messages) ? error.messages : [];
  return error instanceof ArcaParameterError
    && error.code === 'ARCA_PARAMETER_REJECTED'
    && messages.length > 0
    && messages.every((message) => String(message?.code) === '602');
}

function pointDisabledByLastAuthorized(errors) {
  return errors.some((error) => (
    /punto\s+de\s+venta/i.test(String(error?.message || ''))
    && /(no\s+habilitad|inexistente|bloquead|dado\s+de\s+baja)/i.test(String(error?.message || ''))
  ));
}

export async function validateConfiguredPointOfSale(
  { pointOfSale, voucherType, environment },
  {
    loadPoints = (options) => getCachedPuntosVenta(options),
    loadLastAuthorized = getLastAuthorized,
    warn = console.warn,
  } = {},
) {
  const normalizedEnvironment = String(environment || '').trim().toLowerCase();
  let points;
  try {
    points = await loadPoints({ allowStaleOnError: false });
  } catch (cause) {
    if (normalizedEnvironment !== 'homologation' || !isOnlyNoResults602(cause)) throw cause;

    warn(
      `[ARCA][homologation] FEParamGetPtosVenta devolvió 602; `
      + `se valida ptoVta=${pointOfSale} cbteTipo=${voucherType} mediante FECompUltimoAutorizado.`,
    );

    let lastAuthorized;
    try {
      lastAuthorized = await loadLastAuthorized(pointOfSale, voucherType);
    } catch (lastAuthorizedCause) {
      throw new ArcaParameterError(
        `No se pudo validar el punto de venta ${pointOfSale} mediante FECompUltimoAutorizado.`,
        {
          code: 'ARCA_POINT_OF_SALE_VALIDATION_ERROR',
          cause: lastAuthorizedCause,
        },
      );
    }

    const errors = Array.isArray(lastAuthorized?.errors) ? lastAuthorized.errors : [];
    if (errors.length) {
      throw new ArcaParameterError(
        errors.map((error) => `${error.code}: ${error.message}`).join('; '),
        {
          code: pointDisabledByLastAuthorized(errors)
            ? 'ARCA_POINT_OF_SALE_DISABLED'
            : 'ARCA_POINT_OF_SALE_VALIDATION_ERROR',
          messages: errors,
        },
      );
    }

    const voucherNumber = Number(lastAuthorized?.voucherNumber);
    if (!Number.isInteger(voucherNumber) || voucherNumber < 0) {
      throw new ArcaParameterError(
        `FECompUltimoAutorizado no confirmó un número válido para el punto de venta ${pointOfSale}.`,
        { code: 'ARCA_POINT_OF_SALE_VALIDATION_ERROR' },
      );
    }

    return {
      number: Number(pointOfSale),
      emissionType: 'CAE',
      blocked: false,
      validFrom: null,
      validTo: null,
      validationSource: 'FECompUltimoAutorizado',
      lastAuthorizedVoucher: voucherNumber,
    };
  }

  const configuredPoint = points.items.find((item) => item.number === Number(pointOfSale));
  if (!configuredPoint) {
    throw new ArcaParameterError(`El punto de venta ${pointOfSale} no existe para el CUIT configurado.`, {
      code: 'ARCA_POINT_OF_SALE_NOT_FOUND',
    });
  }
  if (configuredPoint.blocked || configuredPoint.validTo) {
    throw new ArcaParameterError(`El punto de venta ${pointOfSale} está bloqueado o dado de baja.`, {
      code: 'ARCA_POINT_OF_SALE_DISABLED',
    });
  }
  return { ...configuredPoint, validationSource: 'FEParamGetPtosVenta' };
}

export async function validateInvoiceParameters({
  pointOfSale,
  voucherType,
  invoiceClass = invoiceClassForVoucherType(voucherType),
  receiver,
  environment,
  vatRate = DEFAULT_VAT_RATE,
}) {
  const taxed = invoiceClass !== 'C';
  const [configuredPoint, vouchers, documents, conditions, vatTypes] = await Promise.all([
    validateConfiguredPointOfSale({
      pointOfSale,
      voucherType,
      environment: environment || String(process.env.ARCA_ENV || 'homologation').trim().toLowerCase(),
    }),
    getCachedTiposComprobante(),
    getCachedTiposDocumento(),
    getCachedCondicionesIva(invoiceClass),
    taxed ? getCachedTiposIva() : Promise.resolve({ items: [] }),
  ]);
  if (!vouchers.items.some((item) => item.id === Number(voucherType))) {
    throw new ArcaParameterError(`ARCA no informó el tipo de comprobante ${voucherType}.`, {
      code: 'ARCA_VOUCHER_TYPE_INVALID',
    });
  }
  if (!documents.items.some((item) => item.id === Number(receiver.docType))) {
    throw new ArcaParameterError(`ARCA no informó el tipo de documento ${receiver.docType}.`, {
      code: 'ARCA_DOCUMENT_TYPE_INVALID',
    });
  }
  if (!conditions.items.some((item) => item.id === Number(receiver.vatConditionId))) {
    throw new ArcaParameterError(
      `La condición IVA ${receiver.vatConditionId} no es válida para la clase ${invoiceClass}.`,
      { code: 'ARCA_VAT_CONDITION_INVALID' },
    );
  }
  return {
    pointOfSale: configuredPoint,
    vatType: taxed ? resolveVatRateType(vatRate, vatTypes.items) : null,
  };
}

export { CACHE_TTL_MS };
