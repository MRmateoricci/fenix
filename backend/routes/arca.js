import { Router } from 'express';
import { getInvoiceOptions } from '../services/arcaParameters.js';
import {
  ArcaTaxpayerRegistryError,
  lookupTaxpayer,
  profileForInvoiceA,
} from '../services/arcaTaxpayerRegistry.js';

const router = Router();
const LOOKUP_WINDOW_MS = 60_000;
const LOOKUP_LIMIT = 30;
const lookupAttempts = new Map();

function allowTaxpayerLookup(req, res, next) {
  const key = req.ip || 'unknown';
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
    res.status(429).json({
      error: 'Hiciste demasiadas consultas. Esperá un momento antes de volver a intentar.',
      code: 'ARCA_TAXPAYER_RATE_LIMITED',
    });
    return;
  }
  next();
}

router.get('/invoice-options', async (req, res) => {
  try {
    const options = await getInvoiceOptions();
    res.json(options);
  } catch (error) {
    console.error('[GET /api/arca/invoice-options]', error.code || error.name, error.message);
    res.status(error.code === 'INVOICE_CLASS_NOT_SUPPORTED' ? 400 : 503).json({
      error: error.message,
      code: error.code || 'ARCA_PARAMETER_ERROR',
      details: error.messages || [],
    });
  }
});

router.post('/cuit-profile', allowTaxpayerLookup, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const [profile, options] = await Promise.all([
      lookupTaxpayer(req.body?.cuit),
      getInvoiceOptions(),
    ]);
    res.json(profileForInvoiceA(profile, options));
  } catch (error) {
    const expected = error instanceof ArcaTaxpayerRegistryError;
    const invalid = error.code === 'ARCA_TAXPAYER_CUIT_INVALID';
    const businessRejection = expected && error.recoverable === false;
    const status = invalid ? 400 : (businessRejection ? 422 : 503);
    console.error('[POST /api/arca/cuit-profile]', error.code || error.name);
    res.status(status).json({
      error: status === 503
        ? 'No pudimos consultar ARCA en este momento. Podés completar los datos manualmente.'
        : error.message,
      code: error.code || 'ARCA_TAXPAYER_REGISTRY_ERROR',
      manualFallbackAllowed: status === 503,
    });
  }
});

export default router;
