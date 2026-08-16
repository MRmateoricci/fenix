import { pool } from '../db/pool.js';
import {
  getCondicionesIvaReceptor,
  getLastAuthorized,
  getPuntosVenta,
  getTiposComprobante,
  getTiposConcepto,
  getTiposDocumento,
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

async function cachedCatalog(
  cacheKey,
  loader,
  sanitizer,
  { force = false, allowStaleOnError = true } = {},
) {
  const cached = await readCache(cacheKey);
  const fresh = cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS;
  if (!force && fresh) return { items: cached.payload, stale: false, fetchedAt: cached.fetchedAt };

  try {
    const items = normalizeLoadedResponse(await loader(), sanitizer);
    await writeCache(cacheKey, items);
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

export const getCachedCondicionesIva = (invoiceClass = 'C', options) => cachedCatalog(
  `vat-conditions:${String(invoiceClass).toUpperCase()}`,
  () => getCondicionesIvaReceptor(invoiceClass),
  sanitizeCatalogItem,
  options,
);

export async function getInvoiceOptions(invoiceClass = 'C') {
  const normalizedClass = String(invoiceClass).trim().toUpperCase();
  if (normalizedClass !== 'C') {
    throw new ArcaParameterError('Por ahora solo está habilitada la Factura C.', {
      code: 'INVOICE_CLASS_NOT_SUPPORTED',
    });
  }
  const [documents, vatConditions] = await Promise.all([
    getCachedTiposDocumento(),
    getCachedCondicionesIva(normalizedClass),
  ]);
  return {
    invoiceClass: normalizedClass,
    documents: documents.items,
    vatConditions: vatConditions.items,
    stale: documents.stale || vatConditions.stale,
  };
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

export async function validateInvoiceParameters({ pointOfSale, voucherType, receiver, environment }) {
  const [configuredPoint, vouchers, documents, conditions] = await Promise.all([
    validateConfiguredPointOfSale({
      pointOfSale,
      voucherType,
      environment: environment || String(process.env.ARCA_ENV || 'homologation').trim().toLowerCase(),
    }),
    getCachedTiposComprobante(),
    getCachedTiposDocumento(),
    getCachedCondicionesIva('C'),
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
      `La condición IVA ${receiver.vatConditionId} no es válida para Factura C.`,
      { code: 'ARCA_VAT_CONDITION_INVALID' },
    );
  }
  return { pointOfSale: configuredPoint };
}

export { CACHE_TTL_MS };
