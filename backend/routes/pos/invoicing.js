import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { requirePosAuth } from '../../middleware/posAuth.js';
import { ArcaConfigError } from '../../config/arca.js';
import { POS_POINT_OF_SALE_ENV_VAR } from '../../services/invoicePosFiscal.js';
import { testConnection } from '../../services/arcaWsfe.js';
import { ArcaParameterError, getInvoiceOptions } from '../../services/arcaParameters.js';
import {
  ArcaTaxpayerRegistryError,
  lookupTaxpayer,
  profileForInvoiceRecipient,
} from '../../services/arcaTaxpayerRegistry.js';
import { generateInvoicePdf } from '../../services/invoicePdf.js';
import { InvoiceValidationError } from '../../services/invoiceFiscal.js';
import {
  createInvoiceForPosSale,
  getInvoiceForPosSale,
  publicPosInvoice,
} from '../../services/invoicePosFiscal.js';

const router = Router();
router.use(requirePosAuth);

// Mismo limitador que routes/arca.js (in-memory, por IP) — se copia en vez de
// compartirse porque son dos dominios de auth distintos (JWT del POS vs.
// cookie del e-commerce) y es un bloque de 20 líneas, no vale la pena una
// dependencia cruzada entre routers para esto.
const LOOKUP_WINDOW_MS = 60_000;
const LOOKUP_LIMIT = 30;
const lookupAttempts = new Map();

function allowTaxpayerLookup(req, res, next) {
  const key = req.posUser?.id || req.ip || 'unknown';
  const now = Date.now();
  if (lookupAttempts.size >= 5_000) {
    for (const [storedKey, attempt] of lookupAttempts) {
      if (attempt.expiresAt <= now) lookupAttempts.delete(storedKey);
    }
    if (lookupAttempts.size >= 5_000) lookupAttempts.delete(lookupAttempts.keys().next().value);
  }
  const current = lookupAttempts.get(key);
  if (!current || current.expiresAt <= now) {
    lookupAttempts.set(key, { count: 1, expiresAt: now + LOOKUP_WINDOW_MS });
    next();
    return;
  }
  current.count += 1;
  if (current.count > LOOKUP_LIMIT) {
    res.set('Retry-After', String(Math.ceil((current.expiresAt - now) / 1_000)));
    return res.status(429).json({ error: 'Hiciste demasiadas consultas. Esperá un momento.', code: 'ARCA_TAXPAYER_RATE_LIMITED' });
  }
  next();
}

// GET /options — tipos de comprobante/condiciones IVA que puede emitir el
// negocio según su condición fiscal (Responsable Inscripto → A/B, Monotributo
// → C). Mismo catálogo que ya usa el checkout de la web (arcaParameters.js).
router.get('/options', async (_req, res) => {
  try {
    res.json(await getInvoiceOptions());
  } catch (error) {
    if (error instanceof ArcaConfigError) {
      return res.status(409).json({ error: error.message, code: error.code, notConfigured: true });
    }
    console.error('[GET /api/pos/invoicing/options]', error.code || error.name, error.message);
    res.status(503).json({ error: error.message, code: error.code || 'ARCA_PARAMETER_ERROR' });
  }
});

router.post('/cuit-lookup', allowTaxpayerLookup, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const [profile, options] = await Promise.all([lookupTaxpayer(req.body?.cuit), getInvoiceOptions()]);
    res.json(profileForInvoiceRecipient(profile, options));
  } catch (error) {
    const expected = error instanceof ArcaTaxpayerRegistryError;
    const invalid = error.code === 'ARCA_TAXPAYER_CUIT_INVALID';
    const businessRejection = expected && error.recoverable === false;
    const consumerFinalAllowed = error.code === 'ARCA_TAXPAYER_NOT_FOUND';
    const status = invalid ? 400 : businessRejection ? 422 : 503;
    console.error('[POST /api/pos/invoicing/cuit-lookup]', error.code || error.name);
    res.status(status).json({
      error: status === 503 ? 'No pudimos consultar AFIP en este momento. Completá los datos a mano.' : error.message,
      code: error.code || 'ARCA_TAXPAYER_REGISTRY_ERROR',
      manualFallbackAllowed: status === 503,
      consumerFinalAllowed,
    });
  }
});

// POST /check-status — FEDummy. No existía ningún endpoint HTTP para esto
// (solo un script de línea de comandos) — es lo que alimenta el indicador
// verde/rojo/gris del header del POS.
router.post('/check-status', async (_req, res) => {
  // Config informativa aparte de la llamada real a ARCA: si el punto de venta
  // del POS no está cargado, se quiere igual poder mostrar el entorno
  // configurado (el de la web) en la pantalla de estado.
  const environment = String(process.env.ARCA_ENV || 'homologation').trim().toLowerCase();
  const autoInvoiceEnabled = String(process.env.ARCA_AUTO_INVOICE_ENABLED || '').trim().toLowerCase() === 'true';
  const pointOfSale = Number(process.env[POS_POINT_OF_SALE_ENV_VAR]) || null;

  try {
    const result = await testConnection();
    res.json({ status: 'ok', ...result, environment, pointOfSale, autoInvoiceEnabled });
  } catch (error) {
    if (error instanceof ArcaConfigError) {
      return res.json({ status: 'not_configured', error: error.message, code: error.code, environment, pointOfSale, autoInvoiceEnabled });
    }
    console.error('[POST /api/pos/invoicing/check-status]', error.code || error.name, error.message);
    res.json({ status: 'down', error: 'AFIP no está respondiendo.', code: error.code || 'ARCA_WSFE_ERROR', environment, pointOfSale, autoInvoiceEnabled });
  }
});

function invoiceErrorStatus(error) {
  if (typeof error.httpStatus === 'number') return error.httpStatus;
  if (error instanceof InvoiceValidationError) return 422;
  if (error instanceof ArcaConfigError || error instanceof ArcaParameterError) return 409;
  return 500;
}

// POST /emit — emite (o reintenta) la factura de una venta ya creada. La
// venta se registra igual si esto falla (ver routes/pos/sales.js): acá solo
// se marca is_invoiced una vez que se INTENTÓ, no que se autorizó, para que
// "reintentar" siga encontrando la venta marcada para facturar.
router.post('/emit', async (req, res) => {
  const { saleId, customerDocType, customerDocNumber, customerName, vatConditionId } = req.body || {};
  if (!saleId) return res.status(400).json({ error: 'Falta la venta a facturar' });

  try {
    const receiverInput = {
      name: customerName,
      docType: customerDocType,
      docNumber: customerDocNumber,
      vatConditionId,
    };
    const result = await createInvoiceForPosSale(saleId, receiverInput);
    await pool.query(`UPDATE pos_sales SET is_invoiced = TRUE WHERE id = $1`, [saleId]);
    res.status(result.created ? 201 : 200).json({ invoice: publicPosInvoice(result.invoice) });
  } catch (error) {
    console.error('[POST /api/pos/invoicing/emit]', error.code || error.name, error.message);
    res.status(invoiceErrorStatus(error)).json({
      error: error.message || 'No se pudo emitir la factura',
      code: error.code || 'INVOICE_ERROR',
      invoice: error.invoice ? publicPosInvoice(error.invoice) : null,
    });
  }
});

router.get('/:saleId', async (req, res) => {
  try {
    const invoice = await getInvoiceForPosSale(req.params.saleId);
    res.json({ invoice: publicPosInvoice(invoice) });
  } catch (error) {
    console.error('[GET /api/pos/invoicing/:saleId]', error.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.get('/:saleId/pdf', async (req, res) => {
  try {
    const invoice = await getInvoiceForPosSale(req.params.saleId);
    if (!invoice || invoice.status !== 'authorized') {
      return res.status(409).json({ error: 'La factura todavía no está autorizada.' });
    }
    const { rows } = await pool.query('SELECT sale_number FROM pos_sales WHERE id = $1', [req.params.saleId]);
    const pdf = await generateInvoicePdf(invoice);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="factura-venta-${rows[0]?.sale_number ?? req.params.saleId}.pdf"`,
      'Cache-Control': 'private, no-store',
      'Content-Length': String(pdf.length),
    });
    res.send(pdf);
  } catch (error) {
    console.error('[GET /api/pos/invoicing/:saleId/pdf]', error.message);
    res.status(500).json({ error: 'No se pudo generar el PDF de la factura.' });
  }
});

export default router;
