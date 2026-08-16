import { pool } from '../db/pool.js';
import { getArcaConfig } from '../config/arca.js';
import {
  createCAE,
  getLastAuthorized,
  getVoucher,
  isVoucherNotFound,
} from './arcaWsfe.js';
import {
  argentinaDate,
  buildInvoiceAmounts,
  buildInvoiceRequest,
  buildReceiverData,
} from './invoiceFiscal.js';
import { validateInvoiceParameters } from './arcaParameters.js';

const BILLABLE_ORDER_STATUSES = new Set(['paid', 'preparing', 'shipped', 'delivered']);

export class InvoiceServiceError extends Error {
  constructor(message, {
    code = 'INVOICE_SERVICE_ERROR',
    httpStatus = 500,
    invoice = null,
    cause,
  } = {}) {
    super(message, { cause });
    this.name = 'InvoiceServiceError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.invoice = invoice;
  }
}

function json(value) {
  return JSON.stringify(value ?? null);
}

function isoArcaDate(value) {
  const normalized = String(value ?? '').replace(/\D/g, '');
  if (!/^\d{8}$/.test(normalized)) return null;
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`;
}

function safeArcaResponse(response) {
  if (!response) return null;
  return {
    header: response.header || null,
    details: response.details || [],
    errors: response.errors || [],
    events: response.events || [],
  };
}

export function publicInvoice(invoice) {
  if (!invoice) return null;
  return {
    id: invoice.id,
    orderId: invoice.order_id,
    status: invoice.status,
    pointOfSale: invoice.pto_vta,
    voucherType: invoice.cbte_tipo,
    voucherNumber: invoice.cbte_numero == null ? null : Number(invoice.cbte_numero),
    voucherDate: invoice.fecha_comprobante,
    total: Number(invoice.imp_total),
    currency: invoice.currency,
    cae: invoice.cae,
    caeExpirationDate: invoice.cae_expiration_date,
    observations: invoice.observations || [],
    errors: invoice.errors || [],
    createdAt: invoice.created_at,
    authorizedAt: invoice.authorized_at,
  };
}

async function advisoryLock(client, key) {
  await client.query('SELECT pg_advisory_lock(hashtext($1))', [key]);
}

async function advisoryUnlock(client, key) {
  await client.query('SELECT pg_advisory_unlock(hashtext($1))', [key]);
}

async function findOrder(client, orderId) {
  const { rows } = await client.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  return rows[0] || null;
}

async function findInvoice(client, orderId) {
  const { rows } = await client.query('SELECT * FROM invoices WHERE order_id = $1', [orderId]);
  return rows[0] || null;
}

function snapshots(order, receiver, config) {
  return {
    issuer: {
      cuit: config.cuit,
      legalName: config.issuer.legalName,
      taxAddress: config.issuer.taxAddress,
      taxCondition: config.issuer.taxCondition,
      grossIncome: config.issuer.grossIncome,
      activityStartDate: config.issuer.activityStartDate,
    },
    receiver: {
      ...receiver,
      address: order.billing_address || order.address || '',
    },
    items: {
      items: Array.isArray(order.items) ? order.items : [],
      discountAmount: Number(order.discount_amount || 0),
      couponCode: order.coupon_code || null,
      shippingCost: Number(order.shipping_cost || 0),
      total: Number(order.total_amount),
    },
  };
}

async function ensureInvoiceRow(client, order, receiver, config) {
  const amounts = buildInvoiceAmounts(order);
  const frozen = snapshots(order, receiver, config);
  const { rows } = await client.query(
    `INSERT INTO invoices (
       order_id, status, issuer_cuit, pto_vta, cbte_tipo, concepto,
       receiver_doc_type, receiver_doc_number, receiver_vat_condition_id,
       imp_total, imp_neto, imp_iva, imp_trib, imp_tot_conc, imp_op_ex,
       issuer_snapshot, receiver_snapshot, items_snapshot
     ) VALUES (
       $1, 'pending', $2, $3, $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17::jsonb
     )
     ON CONFLICT (order_id) DO NOTHING
     RETURNING *`,
    [
      order.id,
      config.cuit,
      config.pointOfSale,
      config.defaultVoucherType,
      Number(order.invoice_concept || config.defaultConcept),
      receiver.docType,
      receiver.docNumber,
      receiver.vatConditionId,
      amounts.total,
      amounts.net,
      amounts.vat,
      amounts.tributes,
      amounts.nonTaxable,
      amounts.exempt,
      json(frozen.issuer),
      json(frozen.receiver),
      json(frozen.items),
    ],
  );
  return rows[0] || findInvoice(client, order.id);
}

async function persistProcessing(client, invoice, built, voucherNumber) {
  const { rows } = await client.query(
    `UPDATE invoices SET
       status = 'processing', cbte_numero = $2, fecha_comprobante = $3,
       fecha_servicio_desde = $4, fecha_servicio_hasta = $5,
       fecha_vencimiento_pago = $6, arca_request = $7::jsonb,
       attempt_count = attempt_count + 1, last_attempt_at = NOW(),
       errors = '[]'::jsonb
     WHERE id = $1
     RETURNING *`,
    [
      invoice.id,
      voucherNumber,
      built.voucherDate,
      built.concept === 1 ? null : isoArcaDate(built.request.FeDetReq.FECAEDetRequest[0].FchServDesde),
      built.concept === 1 ? null : isoArcaDate(built.request.FeDetReq.FECAEDetRequest[0].FchServHasta),
      built.concept === 1 ? null : isoArcaDate(built.request.FeDetReq.FECAEDetRequest[0].FchVtoPago),
      json(built.request),
    ],
  );
  return rows[0];
}

async function persistAuthorized(client, invoice, {
  cae,
  caeExpirationDate,
  result = 'A',
  observations = [],
  errors = [],
  events = [],
  arcaResponse = null,
}) {
  const { rows } = await client.query(
    `UPDATE invoices SET
       status = 'authorized', cae = $2, cae_expiration_date = $3,
       arca_result = $4, observations = $5::jsonb, errors = $6::jsonb,
       arca_events = $7::jsonb, arca_response = $8::jsonb,
       authorized_at = COALESCE(authorized_at, NOW())
     WHERE id = $1
     RETURNING *`,
    [
      invoice.id,
      String(cae),
      caeExpirationDate,
      result,
      json(observations),
      json(errors),
      json(events),
      json(arcaResponse),
    ],
  );
  return rows[0];
}

async function persistRejected(client, invoice, response) {
  const detail = response.details?.[0] || {};
  const observations = detail.observations || [];
  const errors = [...(response.errors || [])];
  if (!errors.length && !observations.length) {
    errors.push({ code: 'ARCA_REJECTED', message: 'ARCA rechazó el comprobante sin detalle.', type: 'error' });
  }
  const { rows } = await client.query(
    `UPDATE invoices SET
       status = 'rejected', arca_result = 'R', observations = $2::jsonb,
       errors = $3::jsonb, arca_events = $4::jsonb, arca_response = $5::jsonb
     WHERE id = $1
     RETURNING *`,
    [invoice.id, json(observations), json(errors), json(response.events), json(safeArcaResponse(response))],
  );
  return rows[0];
}

async function persistUncertain(client, invoice, cause) {
  const error = {
    code: cause?.code || 'ARCA_COMMUNICATION_UNCERTAIN',
    message: cause?.message || 'No se pudo confirmar la respuesta de ARCA.',
    type: 'error',
  };
  const { rows } = await client.query(
    `UPDATE invoices SET status = 'uncertain', errors = $2::jsonb WHERE id = $1 RETURNING *`,
    [invoice.id, json([error])],
  );
  return rows[0];
}

async function authorizeFromConsult(client, invoice, consultation) {
  const voucher = consultation.voucher;
  const cae = voucher?.CodAutorizacion ?? voucher?.CAE;
  const expiration = isoArcaDate(voucher?.FchVto ?? voucher?.CAEFchVto);
  if (!cae || !expiration || String(voucher?.Resultado || 'A').toUpperCase() !== 'A') return null;
  return persistAuthorized(client, invoice, {
    cae,
    caeExpirationDate: expiration,
    observations: consultation.observations || [],
    errors: consultation.errors,
    events: consultation.events,
    arcaResponse: { recoveredBy: 'FECompConsultar', voucher },
  });
}

async function consultUncertain(client, invoice) {
  try {
    const consultation = await getVoucher(invoice.pto_vta, invoice.cbte_tipo, Number(invoice.cbte_numero));
    if (consultation.found) {
      const authorized = await authorizeFromConsult(client, invoice, consultation);
      if (authorized) return { invoice: authorized, recovered: true, canRetrySameNumber: false };
      const updated = await persistUncertain(client, invoice, new InvoiceServiceError(
        'ARCA encontró el comprobante, pero no devolvió una autorización válida.',
        { code: 'ARCA_RECOVERY_AMBIGUOUS' },
      ));
      return { invoice: updated, recovered: false, canRetrySameNumber: false };
    }
    if (!isVoucherNotFound(consultation)) {
      const updated = await persistUncertain(client, invoice, new InvoiceServiceError(
        'FECompConsultar no confirmó el código 602; el estado continúa incierto.',
        { code: 'ARCA_RECOVERY_AMBIGUOUS' },
      ));
      return { invoice: updated, recovered: false, canRetrySameNumber: false };
    }

    const last = await getLastAuthorized(invoice.pto_vta, invoice.cbte_tipo);
    const canRetrySameNumber = Number(last.voucherNumber) === Number(invoice.cbte_numero) - 1;
    if (!canRetrySameNumber) {
      const updated = await persistUncertain(client, invoice, new InvoiceServiceError(
        'ARCA avanzó la numeración y no confirmó el comprobante consultado.',
        { code: 'ARCA_NUMBERING_AMBIGUOUS' },
      ));
      return { invoice: updated, recovered: false, canRetrySameNumber: false };
    }
    return { invoice, recovered: false, canRetrySameNumber: true };
  } catch (cause) {
    return {
      invoice: await persistUncertain(client, invoice, cause),
      recovered: false,
      canRetrySameNumber: false,
    };
  }
}

async function sendRequest(client, invoice, request) {
  let response;
  try {
    response = await createCAE(request);
  } catch (cause) {
    let uncertain = await persistUncertain(client, invoice, cause);
    const recovery = await consultUncertain(client, uncertain);
    uncertain = recovery.invoice;
    if (recovery.recovered) return { invoice: uncertain, created: true, recovered: true };
    throw new InvoiceServiceError(
      'La comunicación con ARCA quedó incierta. No se reenviará el comprobante en este request.',
      { code: 'ARCA_COMMUNICATION_UNCERTAIN', httpStatus: 503, invoice: uncertain, cause },
    );
  }

  const detail = response.details?.[0] || {};
  const result = String(detail.Resultado ?? response.header?.Resultado ?? '').toUpperCase();
  const cae = String(detail.CAE ?? '').trim();
  const caeExpirationDate = isoArcaDate(detail.CAEFchVto);
  if (result === 'A' && cae && caeExpirationDate) {
    const authorized = await persistAuthorized(client, invoice, {
      cae,
      caeExpirationDate,
      result,
      observations: detail.observations || [],
      errors: response.errors || [],
      events: response.events || [],
      arcaResponse: safeArcaResponse(response),
    });
    console.info(`ARCA authorized invoice=${authorized.id} voucher=${authorized.pto_vta}-${authorized.cbte_numero} result=A`);
    return { invoice: authorized, created: true, recovered: false };
  }

  const rejected = await persistRejected(client, invoice, response);
  console.warn(`ARCA rejected invoice=${rejected.id} voucher=${rejected.pto_vta}-${rejected.cbte_numero} result=R`);
  return { invoice: rejected, created: true, recovered: false };
}

export async function createInvoiceForOrder(orderId) {
  const client = await pool.connect();
  const orderLock = `arca:order:${orderId}`;
  let orderLocked = false;
  let sequenceLock = null;

  try {
    await advisoryLock(client, orderLock);
    orderLocked = true;
    const order = await findOrder(client, orderId);
    if (!order) {
      throw new InvoiceServiceError('El pedido no existe.', { code: 'ORDER_NOT_FOUND', httpStatus: 404 });
    }
    if (!BILLABLE_ORDER_STATUSES.has(order.status)) {
      throw new InvoiceServiceError('El pedido todavía no está pagado o no es facturable.', {
        code: 'ORDER_NOT_BILLABLE',
        httpStatus: 409,
      });
    }
    if (!order.invoice_data_confirmed_at) {
      throw new InvoiceServiceError('Primero deben confirmarse los datos fiscales del receptor.', {
        code: 'INVOICE_RECIPIENT_NOT_CONFIRMED',
        httpStatus: 409,
      });
    }

    const config = getArcaConfig({ requirePointOfSale: true, requireIssuerData: true });
    if (config.defaultVoucherType !== 11) {
      throw new InvoiceServiceError('Esta etapa solo permite emitir Factura C (tipo 11).', {
        code: 'INVOICE_TYPE_NOT_SUPPORTED',
        httpStatus: 409,
      });
    }
    const receiver = buildReceiverData({}, order);
    await validateInvoiceParameters({
      pointOfSale: config.pointOfSale,
      voucherType: config.defaultVoucherType,
      receiver,
      environment: config.environment,
    });

    let invoice = await findInvoice(client, order.id);
    if (invoice?.status === 'authorized') return { invoice, created: false, recovered: false };
    if (invoice?.status === 'rejected') return { invoice, created: false, recovered: false };
    invoice ||= await ensureInvoiceRow(client, order, receiver, config);

    sequenceLock = `arca:sequence:${config.cuit}:${config.pointOfSale}:${config.defaultVoucherType}`;
    await advisoryLock(client, sequenceLock);

    let candidateNumber;
    if (['uncertain', 'processing'].includes(invoice.status) && invoice.cbte_numero) {
      const recovery = await consultUncertain(client, invoice);
      invoice = recovery.invoice;
      if (recovery.recovered) return { invoice, created: false, recovered: true };
      if (!recovery.canRetrySameNumber) {
        throw new InvoiceServiceError('No se pudo resolver el estado fiscal del comprobante.', {
          code: 'ARCA_COMMUNICATION_UNCERTAIN',
          httpStatus: 503,
          invoice,
        });
      }
      candidateNumber = Number(invoice.cbte_numero);
    } else {
      const last = await getLastAuthorized(config.pointOfSale, config.defaultVoucherType);
      if (last.errors.length) {
        throw new InvoiceServiceError('ARCA no pudo informar el último comprobante autorizado.', {
          code: 'ARCA_LAST_VOUCHER_ERROR',
          httpStatus: 503,
        });
      }
      candidateNumber = Number(last.voucherNumber) + 1;
    }

    const built = buildInvoiceRequest({
      order,
      receiver,
      pointOfSale: config.pointOfSale,
      voucherType: config.defaultVoucherType,
      voucherNumber: candidateNumber,
      configuredConcept: config.defaultConcept,
      voucherDate: argentinaDate(),
    });
    invoice = await persistProcessing(client, invoice, built, candidateNumber);
    return await sendRequest(client, invoice, built.request);
  } finally {
    if (sequenceLock) await advisoryUnlock(client, sequenceLock).catch(() => {});
    if (orderLocked) await advisoryUnlock(client, orderLock).catch(() => {});
    client.release();
  }
}

export async function getInvoiceForOrder(orderId, client = pool) {
  const { rows } = await client.query('SELECT * FROM invoices WHERE order_id = $1', [orderId]);
  return rows[0] || null;
}

export { BILLABLE_ORDER_STATUSES };
