// Facturación fiscal para ventas del POS de mostrador — Fase 5.
//
// Reusa la infraestructura ARCA que ya factura los pedidos online
// (services/invoiceService.js, invoiceFiscal.js, arcaWsfe.js, arcaParameters.js):
// mismo CUIT, mismo certificado, misma tabla `invoices`. Lo único que cambia
// es de dónde sale el dato a facturar (`pos_sales` en vez de `orders`) y el
// punto de venta (ARCA_POS_PTO_VTA, separado del de la web).
//
// La orquestación (candidato de número → lock de secuencia → armar request →
// mandar a ARCA → persistir resultado) es la MISMA que createInvoiceForOrder:
// se reusan sus funciones ya probadas (persistProcessing, persistAuthorized,
// persistRejected, persistUncertain, consultUncertain, sendRequest,
// advisoryLock/Unlock) en vez de copiarlas. Lo que sí es distinto — armar la
// fila desde una venta de mostrador — se escribe acá.
import { pool } from '../db/pool.js';
import { assertArcaEmissionAllowed, getArcaConfig } from '../config/arca.js';
import { DEFAULT_VAT_RATE } from '../config/tax.js';
import { getLastAuthorized } from './arcaWsfe.js';
import {
  argentinaDate,
  buildInvoiceAmounts,
  buildInvoiceRequest,
  buildReceiverData,
  validateReceiverForVoucher,
  voucherPresentation,
} from './invoiceFiscal.js';
import {
  resolveReceiverInvoiceProfile,
  validateInvoiceParameters,
} from './arcaParameters.js';
import {
  InvoiceServiceError,
  advisoryLock,
  advisoryUnlock,
  consultUncertain,
  json,
  persistProcessing,
  sendRequest,
} from './invoiceService.js';

const POS_POINT_OF_SALE_ENV_VAR = 'ARCA_POS_PTO_VTA';

async function findPosSale(client, saleId) {
  const [{ rows: saleRows }, { rows: itemRows }] = await Promise.all([
    client.query('SELECT * FROM pos_sales WHERE id = $1', [saleId]),
    client.query('SELECT * FROM pos_sale_items WHERE sale_id = $1 ORDER BY id', [saleId]),
  ]);
  const sale = saleRows[0];
  if (!sale) return null;
  return { ...sale, items: itemRows };
}

async function findInvoiceByPosSale(client, saleId) {
  const { rows } = await client.query('SELECT * FROM invoices WHERE pos_sale_id = $1', [saleId]);
  return rows[0] || null;
}

// invoiceFiscal.js solo necesita estos campos de "order" (total, ítems para
// el snapshot, y `invoice_concept`=1 porque un ticket de mostrador siempre es
// "productos", nunca "servicios" — así se evita pedir fechas de servicio que
// no tienen sentido acá). No es una fila real de `orders`, solo tiene la
// forma que esas funciones esperan.
export function buildPseudoOrder(sale) {
  return {
    total_amount: sale.total,
    invoice_concept: 1,
    billing_address: '',
    address: '',
    items: sale.items.map((item) => ({
      name: item.product_name,
      code: item.product_code,
      quantity: item.quantity,
      price: Number(item.unit_price),
      subtotal: Number(item.line_total),
    })),
    discount_amount: Number(sale.discount_amount || 0),
    transfer_discount_amount: 0,
    coupon_code: null,
    shipping_cost: 0,
  };
}

function snapshotsForPosSale(sale, receiver, config, fiscal, pseudoOrder) {
  return {
    issuer: {
      cuit: config.cuit,
      legalName: config.issuer.legalName,
      taxAddress: config.issuer.taxAddress,
      taxCondition: config.issuer.taxCondition,
      taxCategory: config.issuer.taxCategory,
      aAuthorizationMode: config.issuer.aAuthorizationMode,
      grossIncome: config.issuer.grossIncome,
      activityStartDate: config.issuer.activityStartDate,
    },
    receiver: {
      ...receiver,
      vatConditionDescription: fiscal.condition.description,
      vatCategory: fiscal.condition.category,
      address: '',
    },
    items: {
      items: pseudoOrder.items,
      discountAmount: pseudoOrder.discount_amount,
      transferDiscountAmount: 0,
      couponCode: null,
      shippingCost: 0,
      total: Number(sale.total),
      vatRate: fiscal.vatRate,
      vatBreakdown: fiscal.amounts.ivaBreakdown,
    },
  };
}

async function ensureInvoiceRowForPosSale(client, sale, receiver, config, fiscal, pseudoOrder) {
  const { amounts } = fiscal;
  const frozen = snapshotsForPosSale(sale, receiver, config, fiscal, pseudoOrder);
  const { rows } = await client.query(
    `INSERT INTO invoices (
       pos_sale_id, status, issuer_cuit, pto_vta, cbte_tipo, concepto,
       receiver_doc_type, receiver_doc_number, receiver_vat_condition_id,
       imp_total, imp_neto, imp_iva, imp_trib, imp_tot_conc, imp_op_ex,
       issuer_snapshot, receiver_snapshot, items_snapshot, iva_breakdown
     ) VALUES (
       $1, 'pending', $2, $3, $4, 1, $5, $6, $7,
       $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb
     )
     ON CONFLICT (pos_sale_id) DO UPDATE SET
       issuer_cuit = EXCLUDED.issuer_cuit,
       pto_vta = EXCLUDED.pto_vta,
       cbte_tipo = EXCLUDED.cbte_tipo,
       receiver_doc_type = EXCLUDED.receiver_doc_type,
       receiver_doc_number = EXCLUDED.receiver_doc_number,
       receiver_vat_condition_id = EXCLUDED.receiver_vat_condition_id,
       imp_total = EXCLUDED.imp_total,
       imp_neto = EXCLUDED.imp_neto,
       imp_iva = EXCLUDED.imp_iva,
       imp_trib = EXCLUDED.imp_trib,
       imp_tot_conc = EXCLUDED.imp_tot_conc,
       imp_op_ex = EXCLUDED.imp_op_ex,
       issuer_snapshot = EXCLUDED.issuer_snapshot,
       receiver_snapshot = EXCLUDED.receiver_snapshot,
       items_snapshot = EXCLUDED.items_snapshot,
       iva_breakdown = EXCLUDED.iva_breakdown
     WHERE invoices.cbte_numero IS NULL AND invoices.status IN ('pending', 'error')
     RETURNING *`,
    [
      sale.id,
      config.cuit,
      config.pointOfSale,
      fiscal.voucherType,
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
      json(amounts.ivaBreakdown),
    ],
  );
  return rows[0] || findInvoiceByPosSale(client, sale.id);
}

// createInvoiceForPosSale — mismo esqueleto que createInvoiceForOrder
// (invoiceService.js): lock de la venta → resolver tipo de comprobante según
// la condición IVA del receptor → lock de secuencia del punto de venta →
// número candidato → armar y mandar el request → persistir. No usa
// consulta/reserva de "servicios" (fechas de período): un ticket de
// mostrador es siempre concepto=1 (productos).
export async function createInvoiceForPosSale(saleId, receiverInput = {}) {
  const client = await pool.connect();
  const saleLock = `arca:pos_sale:${saleId}`;
  let saleLocked = false;
  let sequenceLock = null;

  try {
    await advisoryLock(client, saleLock);
    saleLocked = true;

    const sale = await findPosSale(client, saleId);
    if (!sale) {
      throw new InvoiceServiceError('La venta no existe.', { code: 'SALE_NOT_FOUND', httpStatus: 404 });
    }

    let invoice = await findInvoiceByPosSale(client, sale.id);
    if (invoice?.status === 'authorized') return { invoice, created: false, recovered: false };
    if (invoice?.status === 'rejected') return { invoice, created: false, recovered: false };

    // Mismo control en dos pasos que createInvoiceForOrder: primero sin datos
    // del emisor (falla rápido y barato si la emisión está bloqueada),
    // después completo.
    let config = getArcaConfig({ requirePointOfSale: true, pointOfSaleEnvVar: POS_POINT_OF_SALE_ENV_VAR });
    assertArcaEmissionAllowed(config);
    config = getArcaConfig({
      requirePointOfSale: true,
      requireIssuerData: true,
      pointOfSaleEnvVar: POS_POINT_OF_SALE_ENV_VAR,
    });

    const pseudoOrder = buildPseudoOrder(sale);
    const receiverBase = buildReceiverData(receiverInput, pseudoOrder);
    const { condition } = await resolveReceiverInvoiceProfile(receiverBase.vatConditionId, config);
    const voucherType = condition.voucherType;
    const receiver = validateReceiverForVoucher({
      receiver: receiverBase,
      receiverVatCondition: condition.category,
      voucherType,
      totalAmount: sale.total,
    });
    const parameterValidation = await validateInvoiceParameters({
      pointOfSale: config.pointOfSale,
      voucherType,
      invoiceClass: condition.invoiceClass,
      receiver,
      environment: config.environment,
      vatRate: DEFAULT_VAT_RATE,
    });
    const fiscal = {
      voucherType,
      invoiceClass: condition.invoiceClass,
      condition,
      vatRate: DEFAULT_VAT_RATE,
      vatRateId: parameterValidation.vatType?.id || null,
      amounts: buildInvoiceAmounts(pseudoOrder, { voucherType, vatRate: DEFAULT_VAT_RATE }),
    };
    if (invoice?.cbte_numero && Number(invoice.cbte_tipo) !== voucherType) {
      throw new InvoiceServiceError(
        'La configuración fiscal cambió mientras existía un comprobante con numeración reservada.',
        { code: 'INVOICE_FISCAL_CONFIGURATION_CHANGED', httpStatus: 409, invoice },
      );
    }
    invoice = await ensureInvoiceRowForPosSale(client, sale, receiver, config, fiscal, pseudoOrder);

    sequenceLock = `arca:sequence:${config.cuit}:${config.pointOfSale}:${voucherType}`;
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
      const last = await getLastAuthorized(config.pointOfSale, voucherType);
      if (last.errors.length) {
        throw new InvoiceServiceError('ARCA no pudo informar el último comprobante autorizado.', {
          code: 'ARCA_LAST_VOUCHER_ERROR',
          httpStatus: 503,
        });
      }
      candidateNumber = Number(last.voucherNumber) + 1;
    }

    const built = buildInvoiceRequest({
      order: pseudoOrder,
      receiver,
      pointOfSale: config.pointOfSale,
      voucherType,
      voucherNumber: candidateNumber,
      configuredConcept: 1,
      voucherDate: argentinaDate(),
      vatRate: fiscal.vatRate,
      vatRateId: fiscal.vatRateId,
    });
    invoice = await persistProcessing(client, invoice, built, candidateNumber);
    return await sendRequest(client, invoice, built.request);
  } finally {
    if (sequenceLock) await advisoryUnlock(client, sequenceLock).catch(() => {});
    if (saleLocked) await advisoryUnlock(client, saleLock).catch(() => {});
    client.release();
  }
}

export async function getInvoiceForPosSale(saleId, client = pool) {
  const { rows } = await client.query('SELECT * FROM invoices WHERE pos_sale_id = $1', [saleId]);
  return rows[0] || null;
}

// Misma forma que publicInvoice() de invoiceService.js, adaptada a
// pos_sale_id — se separa en vez de tocar esa función para no arriesgar el
// endpoint de factura del e-commerce.
export function publicPosInvoice(invoice, { includeTechnicalMessages = true } = {}) {
  if (!invoice) return null;
  const presentation = voucherPresentation(invoice.cbte_tipo, invoice.issuer_snapshot?.aAuthorizationMode);
  const result = {
    id: invoice.id,
    saleId: invoice.pos_sale_id,
    status: invoice.status,
    pointOfSale: invoice.pto_vta,
    voucherType: invoice.cbte_tipo,
    voucherClass: presentation.letter,
    voucherName: presentation.name,
    voucherNumber: invoice.cbte_numero == null ? null : Number(invoice.cbte_numero),
    voucherDate: invoice.fecha_comprobante,
    total: Number(invoice.imp_total),
    net: Number(invoice.imp_neto),
    vat: Number(invoice.imp_iva),
    cae: invoice.cae,
    caeExpirationDate: invoice.cae_expiration_date,
    createdAt: invoice.created_at,
    authorizedAt: invoice.authorized_at,
  };
  if (includeTechnicalMessages) {
    result.observations = invoice.observations || [];
    result.errors = invoice.errors || [];
  }
  return result;
}

export { POS_POINT_OF_SALE_ENV_VAR };
