import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { buildReceiverData, InvoiceValidationError } from '../services/invoiceFiscal.js';
import { getInvoiceOptions } from '../services/arcaParameters.js';
import {
  getInvoiceForOrder,
  InvoiceServiceError,
  publicInvoice,
} from '../services/invoiceService.js';
import { generateInvoicePdf } from '../services/invoicePdf.js';
import {
  attemptInvoiceForOrder,
  getInvoiceAttemptForOrder,
  publicInvoiceAttempt,
} from '../services/invoiceAttempts.js';

const router = Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clientInvoice = (invoice) => publicInvoice(invoice, { includeTechnicalMessages: false });
const adminInvoice = (invoice) => publicInvoice(invoice, { includeTechnicalMessages: true });

async function ownedOrder(orderId, userId, client = pool) {
  if (!UUID_PATTERN.test(orderId)) return null;
  const { rows } = await client.query(
    'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
    [orderId, userId],
  );
  return rows[0] || null;
}

async function adminOrder(orderId, client = pool) {
  if (!UUID_PATTERN.test(orderId)) return null;
  const { rows } = await client.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  return rows[0] || null;
}

function sendInvoicePdf(res, order, pdf, disposition = 'attachment') {
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `${disposition}; filename="factura-${order.order_number}.pdf"`,
    'Cache-Control': 'private, no-store',
    'Content-Length': String(pdf.length),
  });
  res.send(pdf);
}

function serviceErrorResponse(res, error) {
  const status = error.httpStatus || 500;
  const publicMessage = error.code === 'ARCA_COMMUNICATION_UNCERTAIN'
    ? 'No pudimos confirmar la factura. Un nuevo intento la consultará sin duplicarla.'
    : (status >= 500 ? 'No pudimos generar la factura en este momento.' : error.message);
  return res.status(status).json({
    error: publicMessage,
    code: error.code || 'INVOICE_ERROR',
    invoice: clientInvoice(error.invoice),
  });
}

function attemptHttpResponse(res, attempt, { admin = false } = {}) {
  const invoice = (admin ? adminInvoice : clientInvoice)(attempt.invoice);
  const invoiceAttempt = publicInvoiceAttempt(attempt.audit, { includeTechnicalMessages: admin });
  const payload = { invoice, invoiceAttempt };

  if (attempt.code === 'ORDER_NOT_FOUND') return res.status(404).json({ error: attempt.message, ...payload });
  if (['ORDER_NOT_BILLABLE', 'PAYMENT_NOT_APPROVED', 'INVOICE_RECIPIENT_NOT_CONFIRMED'].includes(attempt.code)) {
    return res.status(409).json({ error: attempt.message, code: attempt.code, ...payload });
  }
  if (invoice?.status === 'rejected' || attempt.code === 'ARCA_REJECTED') {
    return res.status(422).json({ error: 'ARCA rechazó el comprobante.', code: 'ARCA_REJECTED', ...payload });
  }
  if (['processing', 'uncertain'].includes(invoice?.status)) {
    return res.status(invoice.status === 'uncertain' ? 503 : 202).json(payload);
  }
  if (attempt.error instanceof InvoiceServiceError) return serviceErrorResponse(res, attempt.error);
  if (attempt.status === 'failed') {
    return res.status(503).json({
      error: admin ? attempt.message : 'No pudimos generar la factura en este momento.',
      code: attempt.code,
      ...payload,
    });
  }
  return res.status(attempt.result?.created ? 201 : 200).json({
    ...payload,
    recovered: attempt.result?.recovered || false,
  });
}

router.put('/:orderId/invoice-recipient', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const order = await ownedOrder(req.params.orderId, req.userId, client);
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }
    const existingInvoice = await getInvoiceForOrder(order.id, client);
    if (existingInvoice?.status === 'authorized') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'La factura autorizada ya no puede modificarse.' });
    }
    if (['processing', 'uncertain'].includes(existingInvoice?.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Los datos no pueden cambiarse mientras la emisión está en proceso o incierta.' });
    }

    const receiver = buildReceiverData(req.body?.invoiceRecipient || req.body, order);
    const options = await getInvoiceOptions('C');
    if (!options.documents.some((item) => item.id === receiver.docType)) {
      throw new InvoiceValidationError('El tipo de documento no fue informado por ARCA.');
    }
    if (!options.vatConditions.some((item) => item.id === receiver.vatConditionId)) {
      throw new InvoiceValidationError('La condición IVA no es válida para Factura C.');
    }

    const concept = Number(req.body?.concept || 1);
    const serviceFrom = req.body?.serviceFrom || null;
    const serviceTo = req.body?.serviceTo || null;
    const paymentDue = req.body?.paymentDue || null;
    if (![1, 2, 3].includes(concept)) throw new InvoiceValidationError('El concepto fiscal no es válido.');
    if (concept !== 1 && (!serviceFrom || !serviceTo || !paymentDue)) {
      throw new InvoiceValidationError('Los servicios requieren período y vencimiento de pago.');
    }

    const { rows } = await client.query(
      `UPDATE orders SET
         invoice_recipient_name = $3, invoice_doc_type = $4,
         invoice_doc_number = $5, invoice_vat_condition_id = $6,
         invoice_data_confirmed_at = NOW(), invoice_concept = $7,
         invoice_service_from = $8, invoice_service_to = $9,
         invoice_payment_due = $10,
         customer_dni = CASE WHEN $4 = 96 THEN $5 ELSE customer_dni END
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        order.id,
        req.userId,
        receiver.name,
        receiver.docType,
        receiver.docNumber,
        receiver.vatConditionId,
        concept,
        concept === 1 ? null : serviceFrom,
        concept === 1 ? null : serviceTo,
        concept === 1 ? null : paymentDue,
      ],
    );

    if (existingInvoice) {
      await client.query(
        `UPDATE invoices SET
           status = 'pending', cbte_numero = NULL, receiver_doc_type = $2,
           receiver_doc_number = $3, receiver_vat_condition_id = $4,
           receiver_snapshot = $5::jsonb, arca_request = NULL, arca_response = NULL,
           arca_result = NULL, errors = '[]'::jsonb, observations = '[]'::jsonb,
           arca_events = '[]'::jsonb
         WHERE id = $1`,
        [
          existingInvoice.id,
          receiver.docType,
          receiver.docNumber,
          receiver.vatConditionId,
          JSON.stringify({
            ...receiver,
            address: rows[0].billing_address || rows[0].address || '',
          }),
        ],
      );
    }
    await client.query('COMMIT');
    let invoiceAttempt = null;
    try {
      const { rows: attempts } = await pool.query(
        `UPDATE invoice_jobs SET
           status = 'pending', locked_at = NULL, last_error_code = NULL,
           last_error_message = NULL, completed_at = NULL
         WHERE order_id = $1
         RETURNING *`,
        [order.id],
      );
      invoiceAttempt = attempts[0] || null;
    } catch (error) {
      console.error(`[invoice-recipient] No se pudo actualizar auditoría order=${order.id} code=${error.code || error.name}`);
    }
    res.json({
      invoiceRecipient: receiver,
      confirmedAt: rows[0].invoice_data_confirmed_at,
      invoiceAttempt: publicInvoiceAttempt(invoiceAttempt),
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    const expected = error instanceof InvoiceValidationError;
    if (!expected) console.error(`[invoice-recipient] order=${req.params.orderId} status=error code=${error.code || error.name}`);
    res.status(expected ? 400 : 503).json({
      error: expected ? error.message : 'No pudimos validar los datos fiscales en este momento.',
      code: expected ? error.code : 'INVOICE_RECIPIENT_VALIDATION_UNAVAILABLE',
    });
  } finally {
    client.release();
  }
});

router.get('/:orderId/invoice', requireAuth, async (req, res) => {
  try {
    const order = await ownedOrder(req.params.orderId, req.userId);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    const [invoice, invoiceAttempt] = await Promise.all([
      getInvoiceForOrder(order.id),
      getInvoiceAttemptForOrder(order.id),
    ]);
    res.json({
      invoice: clientInvoice(invoice),
      invoiceAttempt: publicInvoiceAttempt(invoiceAttempt),
      recipientConfirmed: Boolean(order.invoice_data_confirmed_at),
      invoiceRecipient: order.invoice_data_confirmed_at ? {
        name: order.invoice_recipient_name,
        docType: order.invoice_doc_type,
        docNumber: order.invoice_doc_number,
        vatConditionId: order.invoice_vat_condition_id,
      } : null,
    });
  } catch (error) {
    console.error(`[invoice-status] order=${req.params.orderId} status=error code=${error.code || error.name}`);
    res.status(500).json({ error: 'No se pudo consultar la factura.' });
  }
});

router.post('/:orderId/invoice', requireAuth, async (req, res) => {
  try {
    const order = await ownedOrder(req.params.orderId, req.userId);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    const attempt = await attemptInvoiceForOrder({ orderId: order.id, origin: 'customer' });
    return attemptHttpResponse(res, attempt);
  } catch (error) {
    if (error instanceof InvoiceServiceError) return serviceErrorResponse(res, error);
    console.error(`[invoice-manual] order=${req.params.orderId} status=error code=${error.code || error.name}`);
    res.status(500).json({ error: 'No pudimos generar la factura en este momento.', code: 'INVOICE_ERROR' });
  }
});

router.post('/:orderId/invoice/admin', requireAdmin, async (req, res) => {
  try {
    if (Object.keys(req.body || {}).length) {
      return res.status(400).json({ error: 'Este endpoint no acepta datos fiscales ni financieros.' });
    }
    const order = await adminOrder(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (order.payment_method !== 'mercadopago' || order.mp_status !== 'approved') {
      return res.status(409).json({
        error: 'Mercado Pago no confirmó este pago como approved.',
        code: 'PAYMENT_NOT_APPROVED',
      });
    }
    const attempt = await attemptInvoiceForOrder({
      orderId: order.id,
      origin: 'admin',
      requireMercadoPagoApproval: true,
    });
    return attemptHttpResponse(res, attempt, { admin: true });
  } catch (error) {
    console.error(`[invoice-admin] order=${req.params.orderId} status=error code=${error.code || error.name}`);
    return res.status(500).json({ error: 'No se pudo intentar la factura.', code: error.code || 'INVOICE_ERROR' });
  }
});

router.get('/:orderId/invoice/pdf', requireAuth, async (req, res) => {
  try {
    const order = await ownedOrder(req.params.orderId, req.userId);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    const invoice = await getInvoiceForOrder(order.id);
    if (!invoice || invoice.status !== 'authorized') {
      return res.status(409).json({ error: 'La factura todavía no está autorizada.' });
    }
    const pdf = await generateInvoicePdf(invoice);
    sendInvoicePdf(res, order, pdf);
  } catch (error) {
    console.error(`[invoice-pdf] order=${req.params.orderId} status=error code=${error.code || error.name}`);
    res.status(500).json({ error: 'No se pudo generar el PDF de la factura.' });
  }
});

router.get('/:orderId/invoice/pdf/admin', requireAdmin, async (req, res) => {
  try {
    const order = await adminOrder(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    const invoice = await getInvoiceForOrder(order.id);
    if (!invoice || invoice.status !== 'authorized') {
      return res.status(409).json({ error: 'La factura todavía no está autorizada.' });
    }
    const pdf = await generateInvoicePdf(invoice);
    sendInvoicePdf(res, order, pdf, req.query.disposition === 'inline' ? 'inline' : 'attachment');
  } catch (error) {
    console.error(`[invoice-pdf-admin] order=${req.params.orderId} status=error code=${error.code || error.name}`);
    res.status(500).json({ error: 'No se pudo generar el PDF de la factura.' });
  }
});

export default router;
