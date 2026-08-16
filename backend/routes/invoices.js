import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { buildReceiverData, InvoiceValidationError } from '../services/invoiceFiscal.js';
import { getInvoiceOptions } from '../services/arcaParameters.js';
import {
  createInvoiceForOrder,
  getInvoiceForOrder,
  InvoiceServiceError,
  publicInvoice,
} from '../services/invoiceService.js';
import { generateInvoicePdf } from '../services/invoicePdf.js';

const router = Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function ownedOrder(orderId, userId, client = pool) {
  if (!UUID_PATTERN.test(orderId)) return null;
  const { rows } = await client.query(
    'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
    [orderId, userId],
  );
  return rows[0] || null;
}

function serviceErrorResponse(res, error) {
  const status = error.httpStatus || 500;
  return res.status(status).json({
    error: error.message,
    code: error.code || 'INVOICE_ERROR',
    invoice: publicInvoice(error.invoice),
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
    res.json({
      invoiceRecipient: receiver,
      confirmedAt: rows[0].invoice_data_confirmed_at,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    const expected = error instanceof InvoiceValidationError;
    if (!expected) console.error('[PUT /api/orders/:orderId/invoice-recipient]', error.code || error.name, error.message);
    res.status(expected ? 400 : 503).json({ error: error.message, code: error.code });
  } finally {
    client.release();
  }
});

router.get('/:orderId/invoice', requireAuth, async (req, res) => {
  try {
    const order = await ownedOrder(req.params.orderId, req.userId);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    const invoice = await getInvoiceForOrder(order.id);
    res.json({
      invoice: publicInvoice(invoice),
      recipientConfirmed: Boolean(order.invoice_data_confirmed_at),
      invoiceRecipient: order.invoice_data_confirmed_at ? {
        name: order.invoice_recipient_name,
        docType: order.invoice_doc_type,
        docNumber: order.invoice_doc_number,
        vatConditionId: order.invoice_vat_condition_id,
      } : null,
    });
  } catch (error) {
    console.error('[GET /api/orders/:orderId/invoice]', error.code || error.name, error.message);
    res.status(500).json({ error: 'No se pudo consultar la factura.' });
  }
});

router.post('/:orderId/invoice', requireAuth, async (req, res) => {
  try {
    const order = await ownedOrder(req.params.orderId, req.userId);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    const result = await createInvoiceForOrder(order.id);
    const invoice = publicInvoice(result.invoice);
    if (result.invoice.status === 'rejected') {
      return res.status(422).json({ error: 'ARCA rechazó el comprobante.', invoice });
    }
    if (['processing', 'uncertain'].includes(result.invoice.status)) {
      return res.status(202).json({ invoice });
    }
    res.status(result.created ? 201 : 200).json({ invoice, recovered: result.recovered });
  } catch (error) {
    if (error instanceof InvoiceServiceError) return serviceErrorResponse(res, error);
    console.error('[POST /api/orders/:orderId/invoice]', error.code || error.name, error.message);
    res.status(500).json({ error: error.message, code: error.code || 'INVOICE_ERROR' });
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
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="factura-${order.order_number}.pdf"`,
      'Cache-Control': 'private, no-store',
      'Content-Length': String(pdf.length),
    });
    res.send(pdf);
  } catch (error) {
    console.error('[GET /api/orders/:orderId/invoice/pdf]', error.code || error.name, error.message);
    res.status(500).json({ error: 'No se pudo generar el PDF de la factura.' });
  }
});

export default router;
