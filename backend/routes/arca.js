import { Router } from 'express';
import { getInvoiceOptions } from '../services/arcaParameters.js';

const router = Router();

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

export default router;
