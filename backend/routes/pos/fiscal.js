import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { requirePosAuth, requirePosRole } from '../../middleware/posAuth.js';

const router = Router();
// Todo el panel es admin-only: es el saldo de IVA real del negocio, mismo
// criterio que proveedores/compras (Fase 3) e importación de precios (Fase 4).
router.use(requirePosAuth, requirePosRole('admin'));

const TZ = 'America/Argentina/Buenos_Aires';
const roundMoney = value => Math.round(Number(value) * 100) / 100;

export function getCuitEnding() {
  const cuit = String(process.env.ARCA_CUIT || '').trim();
  if (!/^\d{11}$/.test(cuit)) return null;
  return Number(cuit[10]);
}

export function periodRange(year, month) {
  const y = Number(year);
  const m = Number(month);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

// Aproximación documentada, NO el calendario oficial de AFIP (que no puedo
// consultar desde acá): 3ra semana hábil del mes siguiente al período,
// corrida `cuitEnding` días hábiles. Sirve como punto de partida editable —
// PUT /deadlines existe específicamente para corregirla con el calendario real.
export function approximateDeadline(year, month, cuitEnding) {
  let targetYear = Number(year);
  let targetMonth = Number(month) + 1;
  if (targetMonth > 12) { targetMonth = 1; targetYear += 1; }

  const firstOfMonth = new Date(Date.UTC(targetYear, targetMonth - 1, 1));
  const dow = firstOfMonth.getUTCDay(); // 0=domingo..6=sábado
  const daysToMonday = (8 - dow) % 7;
  const thirdMonday = new Date(Date.UTC(targetYear, targetMonth - 1, 1 + daysToMonday + 14));

  const date = new Date(thirdMonday);
  let steps = cuitEnding;
  while (steps > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const d = date.getUTCDay();
    if (d !== 0 && d !== 6) steps -= 1;
  }
  return date.toISOString().slice(0, 10);
}

// node-postgres devuelve las columnas DATE como objeto Date de JS armado con
// `new Date(year, month-1, day)` (medianoche en el huso LOCAL del proceso de
// Node, no UTC — un DATE de Postgres no tiene huso). Comparar ese objeto con
// `<` contra un string 'YYYY-MM-DD' (para "¿venció?"), o interpolarlo en un
// template literal (`daysBetween`), rompía. Para deshacerlo hay que leer los
// componentes con los getters LOCALES (no UTC): son el mismo huso que usó pg
// para construirlo, así el 'YYYY-MM-DD' vuelve exacto sin importar en qué
// huso corra el proceso (dev en Windows, Railway en producción, etc).
function normalizeDeadlineRow(row) {
  if (!row) return row;
  const raw = row.deadline_date;
  if (!(raw instanceof Date)) return row;
  const y = raw.getFullYear();
  const m = String(raw.getMonth() + 1).padStart(2, '0');
  const d = String(raw.getDate()).padStart(2, '0');
  return { ...row, deadline_date: `${y}-${m}-${d}` };
}

async function ensureDeadlineRow(client, year, month, cuitEnding) {
  const { rows } = await client.query(
    `SELECT * FROM pos_vat_deadlines WHERE year = $1 AND month = $2 AND cuit_ending = $3`,
    [year, month, cuitEnding]
  );
  if (rows.length) return normalizeDeadlineRow(rows[0]);

  const computed = approximateDeadline(year, month, cuitEnding);
  const { rows: inserted } = await client.query(
    `INSERT INTO pos_vat_deadlines (year, month, cuit_ending, deadline_date)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (year, month, cuit_ending) DO UPDATE SET year = EXCLUDED.year
     RETURNING *`,
    [year, month, cuitEnding, computed]
  );
  return normalizeDeadlineRow(inserted[0]);
}

function publicDeadline(row, { computed = false } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    year: row.year,
    month: row.month,
    deadlineDate: row.deadline_date,
    filedAt: row.filed_at,
    computed,
  };
}

// ── Agregaciones compartidas por summary y monthly-history ──────────────────

async function fetchVatDebit(client, start, end) {
  // Secuencial: un client de pg ejecuta una consulta por vez. Lanzarlas con
  // Promise.all solo las encolaba, y pg@9 va a rechazarlo.
  const { rows: byRate } = await client.query(
    `SELECT COALESCE(SUM((elem->>'amount')::numeric) FILTER (WHERE (elem->>'rate')::numeric = 21), 0) AS debit_21,
            COALESCE(SUM((elem->>'amount')::numeric) FILTER (WHERE (elem->>'rate')::numeric = 10.5), 0) AS debit_105
     FROM invoices, jsonb_array_elements(iva_breakdown) AS elem
     WHERE status = 'authorized' AND fecha_comprobante BETWEEN $1 AND $2`,
    [start, end]
  );
  const { rows: totalRows } = await client.query(
    `SELECT COALESCE(SUM(imp_iva), 0) AS total FROM invoices
     WHERE status = 'authorized' AND fecha_comprobante BETWEEN $1 AND $2`,
    [start, end]
  );
  return {
    debit21: Number(byRate[0].debit_21),
    debit105: Number(byRate[0].debit_105),
    debitTotal: Number(totalRows[0].total),
  };
}

async function fetchVatCredit(client, start, end) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(vat_21), 0) AS credit_21, COALESCE(SUM(vat_10_5), 0) AS credit_105
     FROM pos_purchases
     WHERE has_invoice = TRUE
       AND COALESCE(invoice_date, (created_at AT TIME ZONE '${TZ}')::date) BETWEEN $1 AND $2`,
    [start, end]
  );
  const credit21 = Number(rows[0].credit_21);
  const credit105 = Number(rows[0].credit_105);
  return { credit21, credit105, creditTotal: roundMoney(credit21 + credit105) };
}

async function fetchSalesCard(client, start, end) {
  const { rows } = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE is_invoiced)::int AS invoiced_count,
       COALESCE(SUM(total) FILTER (WHERE is_invoiced), 0) AS invoiced_total,
       COUNT(*) FILTER (WHERE NOT is_invoiced)::int AS not_invoiced_count,
       COALESCE(SUM(total) FILTER (WHERE NOT is_invoiced), 0) AS not_invoiced_total
     FROM pos_sales
     WHERE (created_at AT TIME ZONE '${TZ}')::date BETWEEN $1 AND $2`,
    [start, end]
  );
  const row = rows[0];
  const invoicedTotal = Number(row.invoiced_total);
  const notInvoicedTotal = Number(row.not_invoiced_total);
  const total = roundMoney(invoicedTotal + notInvoicedTotal);
  return {
    total,
    invoicedTotal,
    invoicedCount: row.invoiced_count,
    invoicedPercent: total > 0 ? roundMoney((invoicedTotal / total) * 100) : 0,
    notInvoicedTotal,
    notInvoicedCount: row.not_invoiced_count,
    notInvoicedPercent: total > 0 ? roundMoney((notInvoicedTotal / total) * 100) : 0,
  };
}

async function fetchPurchasesCard(client, start, end) {
  const { rows } = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE has_invoice)::int AS with_invoice_count,
       COALESCE(SUM(total) FILTER (WHERE has_invoice), 0) AS with_invoice_total,
       COUNT(*) FILTER (WHERE NOT has_invoice)::int AS without_invoice_count,
       COALESCE(SUM(total) FILTER (WHERE NOT has_invoice), 0) AS without_invoice_total
     FROM pos_purchases
     WHERE COALESCE(invoice_date, (created_at AT TIME ZONE '${TZ}')::date) BETWEEN $1 AND $2`,
    [start, end]
  );
  const row = rows[0];
  const withInvoiceTotal = Number(row.with_invoice_total);
  const withoutInvoiceTotal = Number(row.without_invoice_total);
  const total = roundMoney(withInvoiceTotal + withoutInvoiceTotal);
  return {
    total,
    withInvoiceTotal,
    withInvoiceCount: row.with_invoice_count,
    withInvoicePercent: total > 0 ? roundMoney((withInvoiceTotal / total) * 100) : 0,
    withoutInvoiceTotal,
    withoutInvoiceCount: row.without_invoice_count,
    withoutInvoicePercent: total > 0 ? roundMoney((withoutInvoiceTotal / total) * 100) : 0,
  };
}

export function daysBetween(fromISO, toISO) {
  const from = new Date(`${fromISO}T00:00:00Z`);
  const to = new Date(`${toISO}T00:00:00Z`);
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

// GET /summary?month=&year=
router.get('/summary', async (req, res) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'Indicá un mes y año válidos' });
  }

  const client = await pool.connect();
  try {
    const { start, end } = periodRange(year, month);
    const cuitEnding = getCuitEnding();

    // Secuencial: todas comparten el mismo client de pg.
    const sales = await fetchSalesCard(client, start, end);
    const purchases = await fetchPurchasesCard(client, start, end);
    const debit = await fetchVatDebit(client, start, end);
    const credit = await fetchVatCredit(client, start, end);
    const deadlineRow = cuitEnding != null ? await ensureDeadlineRow(client, year, month, cuitEnding) : null;

    const balance = roundMoney(debit.debitTotal - credit.creditTotal);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
    const deadline = deadlineRow
      ? { ...publicDeadline(deadlineRow), daysRemaining: daysBetween(today, deadlineRow.deadline_date), overdue: deadlineRow.deadline_date < today && !deadlineRow.filed_at }
      : null;

    res.json({
      year, month,
      sales,
      purchases,
      vat: {
        ...debit,
        ...credit,
        balance,
        balanceDirection: balance > 0.01 ? 'payable' : balance < -0.01 ? 'favor' : 'zero',
      },
      deadline,
      cuitConfigured: cuitEnding != null,
    });
  } catch (err) {
    console.error('[GET /api/pos/fiscal/summary]', err);
    res.status(500).json({ error: 'Error interno' });
  } finally {
    client.release();
  }
});

// GET /monthly-history?year=
router.get('/monthly-history', async (req, res) => {
  const year = Number(req.query.year);
  if (!Number.isInteger(year)) return res.status(400).json({ error: 'Indicá un año válido' });

  const client = await pool.connect();
  try {
    const { start } = periodRange(year, 1);
    const { end } = periodRange(year, 12);
    const cuitEnding = getCuitEnding();

    // Secuencial: todas comparten el mismo client de pg.
    const { rows: debitRows } = await client.query(
        `SELECT EXTRACT(MONTH FROM fecha_comprobante)::int AS month, COALESCE(SUM(imp_iva), 0) AS debit
         FROM invoices WHERE status = 'authorized' AND fecha_comprobante BETWEEN $1 AND $2
         GROUP BY month`,
        [start, end]
    );
    const { rows: creditRows } = await client.query(
        `SELECT EXTRACT(MONTH FROM COALESCE(invoice_date, (created_at AT TIME ZONE '${TZ}')::date))::int AS month,
                COALESCE(SUM(vat_21) + SUM(vat_10_5), 0) AS credit
         FROM pos_purchases
         WHERE has_invoice = TRUE
           AND COALESCE(invoice_date, (created_at AT TIME ZONE '${TZ}')::date) BETWEEN $1 AND $2
         GROUP BY month`,
        [start, end]
    );
    const { rows: deadlineRows } = cuitEnding != null
      ? await client.query(`SELECT * FROM pos_vat_deadlines WHERE year = $1 AND cuit_ending = $2`, [year, cuitEnding])
      : { rows: [] };

    const debitByMonth = new Map(debitRows.map(r => [r.month, Number(r.debit)]));
    const creditByMonth = new Map(creditRows.map(r => [r.month, Number(r.credit)]));
    const deadlineByMonth = new Map(deadlineRows.map(r => [r.month, normalizeDeadlineRow(r)]));
    const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });

    const months = [];
    let totalDebit = 0;
    let totalCredit = 0;
    for (let month = 1; month <= 12; month++) {
      const debit = roundMoney(debitByMonth.get(month) || 0);
      const credit = roundMoney(creditByMonth.get(month) || 0);
      const deadlineRow = deadlineByMonth.get(month);
      totalDebit += debit;
      totalCredit += credit;
      let status = 'pending';
      if (deadlineRow?.filed_at) status = 'filed';
      else if (deadlineRow && deadlineRow.deadline_date < today) status = 'overdue';
      months.push({
        month, debit, credit,
        balance: roundMoney(debit - credit),
        deadlineDate: deadlineRow?.deadline_date || null,
        status,
      });
    }

    res.json({
      year,
      months,
      totals: { debit: roundMoney(totalDebit), credit: roundMoney(totalCredit), balance: roundMoney(totalDebit - totalCredit) },
    });
  } catch (err) {
    console.error('[GET /api/pos/fiscal/monthly-history]', err);
    res.status(500).json({ error: 'Error interno' });
  } finally {
    client.release();
  }
});

router.get('/sales-detail', async (req, res) => {
  const { year, month, type = 'invoiced', page = 1, limit = 50 } = req.query;
  if (!Number.isInteger(Number(year)) || !Number.isInteger(Number(month))) {
    return res.status(400).json({ error: 'Indicá un mes y año válidos' });
  }
  if (!['invoiced', 'not_invoiced'].includes(type)) return res.status(400).json({ error: 'type inválido' });

  try {
    const { start, end } = periodRange(year, month);
    const cappedLimit = Math.min(Number(limit) || 50, 200);
    const currentPage = Math.max(1, Number(page) || 1);
    const offset = (currentPage - 1) * cappedLimit;
    const isInvoiced = type === 'invoiced';

    const [{ rows }, { rows: countRows }, { rows: totalRows }] = await Promise.all([
      pool.query(
        `SELECT ps.id, ps.sale_number, ps.total, ps.created_at, pu.name AS user_name,
                inv.cbte_tipo, inv.cbte_numero, inv.pto_vta, inv.receiver_doc_number, inv.imp_neto, inv.imp_iva,
                (SELECT method FROM pos_sale_payments WHERE sale_id = ps.id ORDER BY id LIMIT 1) AS method
         FROM pos_sales ps
         JOIN pos_users pu ON pu.id = ps.user_id
         LEFT JOIN invoices inv ON inv.pos_sale_id = ps.id AND inv.status = 'authorized'
         WHERE ps.is_invoiced = $1 AND (ps.created_at AT TIME ZONE '${TZ}')::date BETWEEN $2 AND $3
         ORDER BY ps.created_at DESC
         LIMIT $4 OFFSET $5`,
        [isInvoiced, start, end, cappedLimit, offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM pos_sales WHERE is_invoiced = $1 AND (created_at AT TIME ZONE '${TZ}')::date BETWEEN $2 AND $3`,
        [isInvoiced, start, end]
      ),
      pool.query(
        `SELECT COALESCE(SUM(total), 0) AS total FROM pos_sales WHERE is_invoiced = $1 AND (created_at AT TIME ZONE '${TZ}')::date BETWEEN $2 AND $3`,
        [isInvoiced, start, end]
      ),
    ]);

    res.json({
      sales: rows.map(row => ({
        id: row.id,
        saleNumber: row.sale_number,
        createdAt: row.created_at,
        userName: row.user_name,
        total: Number(row.total),
        method: row.method,
        invoice: row.cbte_numero != null ? {
          voucherType: row.cbte_tipo,
          voucherNumber: Number(row.cbte_numero),
          pointOfSale: row.pto_vta,
          docNumber: row.receiver_doc_number,
          net: Number(row.imp_neto),
          vat: Number(row.imp_iva),
        } : null,
      })),
      total: Number(countRows[0].count),
      totalAmount: Number(totalRows[0].total),
      page: currentPage,
      limit: cappedLimit,
    });
  } catch (err) {
    console.error('[GET /api/pos/fiscal/sales-detail]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.get('/purchases-detail', async (req, res) => {
  const { year, month, type = 'with_invoice', page = 1, limit = 50 } = req.query;
  if (!Number.isInteger(Number(year)) || !Number.isInteger(Number(month))) {
    return res.status(400).json({ error: 'Indicá un mes y año válidos' });
  }
  if (!['with_invoice', 'without_invoice'].includes(type)) return res.status(400).json({ error: 'type inválido' });

  try {
    const { start, end } = periodRange(year, month);
    const cappedLimit = Math.min(Number(limit) || 50, 200);
    const currentPage = Math.max(1, Number(page) || 1);
    const offset = (currentPage - 1) * cappedLimit;
    const hasInvoice = type === 'with_invoice';
    const dateExpr = `COALESCE(pp.invoice_date, (pp.created_at AT TIME ZONE '${TZ}')::date)`;

    const [{ rows }, { rows: countRows }, { rows: totalRows }] = await Promise.all([
      pool.query(
        `SELECT pp.id, pp.created_at, pp.invoice_type, pp.invoice_number, pp.invoice_date,
                pp.net_amount, pp.vat_21, pp.vat_10_5, pp.perceptions, pp.total, ps.name AS supplier_name,
                ${dateExpr} AS period_date
         FROM pos_purchases pp
         JOIN pos_suppliers ps ON ps.id = pp.supplier_id
         WHERE pp.has_invoice = $1 AND ${dateExpr} BETWEEN $2 AND $3
         ORDER BY period_date DESC
         LIMIT $4 OFFSET $5`,
        [hasInvoice, start, end, cappedLimit, offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM pos_purchases pp WHERE pp.has_invoice = $1 AND ${dateExpr} BETWEEN $2 AND $3`,
        [hasInvoice, start, end]
      ),
      pool.query(
        `SELECT COALESCE(SUM(pp.total), 0) AS total FROM pos_purchases pp WHERE pp.has_invoice = $1 AND ${dateExpr} BETWEEN $2 AND $3`,
        [hasInvoice, start, end]
      ),
    ]);

    res.json({
      purchases: rows.map(row => ({
        id: row.id,
        date: row.period_date,
        supplierName: row.supplier_name,
        invoiceType: row.invoice_type,
        invoiceNumber: row.invoice_number,
        netAmount: row.net_amount != null ? Number(row.net_amount) : null,
        vat21: row.vat_21 != null ? Number(row.vat_21) : null,
        vat105: row.vat_10_5 != null ? Number(row.vat_10_5) : null,
        perceptions: row.perceptions != null ? Number(row.perceptions) : null,
        total: Number(row.total),
      })),
      total: Number(countRows[0].count),
      totalAmount: Number(totalRows[0].total),
      page: currentPage,
      limit: cappedLimit,
    });
  } catch (err) {
    console.error('[GET /api/pos/fiscal/purchases-detail]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /upcoming-deadline — el vencimiento sin presentar más próximo (vencido
// o por vencer). Se asegura que existan filas para un par de períodos antes
// de buscar, así nunca devuelve "nada" solo porque no se consultó ese mes
// todavía desde /summary.
router.get('/upcoming-deadline', async (req, res) => {
  const cuitEnding = getCuitEnding();
  if (cuitEnding == null) {
    return res.json({ deadline: null, cuitConfigured: false });
  }

  const client = await pool.connect();
  try {
    const now = new Date();
    const currentYear = Number(now.toLocaleDateString('en-CA', { timeZone: TZ }).slice(0, 4));
    const currentMonth = Number(now.toLocaleDateString('en-CA', { timeZone: TZ }).slice(5, 7));

    // Asegura el período actual y los dos anteriores (por si alguno quedó
    // vencido sin presentar) y el siguiente (para que "próximo" no quede vacío
    // apenas se cruza de mes).
    const periodsToEnsure = [-2, -1, 0, 1].map(offset => {
      let month = currentMonth + offset;
      let year = currentYear;
      while (month < 1) { month += 12; year -= 1; }
      while (month > 12) { month -= 12; year += 1; }
      return { year, month };
    });
    for (const period of periodsToEnsure) {
      await ensureDeadlineRow(client, period.year, period.month, cuitEnding);
    }

    const { rows } = await client.query(
      `SELECT * FROM pos_vat_deadlines WHERE cuit_ending = $1 AND filed_at IS NULL ORDER BY deadline_date ASC LIMIT 1`,
      [cuitEnding]
    );
    if (!rows.length) return res.json({ deadline: null, cuitConfigured: true });

    const today = now.toLocaleDateString('en-CA', { timeZone: TZ });
    const row = normalizeDeadlineRow(rows[0]);
    const daysRemaining = daysBetween(today, row.deadline_date);
    res.json({
      deadline: { ...publicDeadline(row), daysRemaining, overdue: daysRemaining < 0, urgent: daysRemaining >= 0 && daysRemaining <= 5 },
      cuitConfigured: true,
    });
  } catch (err) {
    console.error('[GET /api/pos/fiscal/upcoming-deadline]', err);
    res.status(500).json({ error: 'Error interno' });
  } finally {
    client.release();
  }
});

// PUT /deadlines — corrige la fecha calculada, y/o marca un período como
// presentado. Upsert: puede no existir fila todavía si nunca se consultó ese
// período desde /summary o /upcoming-deadline.
router.put('/deadlines', async (req, res) => {
  const { year, month, deadlineDate, filed } = req.body || {};
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'Indicá un mes y año válidos' });
  }
  const cuitEnding = getCuitEnding();
  if (cuitEnding == null) return res.status(409).json({ error: 'ARCA_CUIT no está configurado' });

  const client = await pool.connect();
  try {
    const current = await ensureDeadlineRow(client, year, month, cuitEnding);
    const nextDate = deadlineDate || current.deadline_date;
    const nextFiledAt = filed === true ? (current.filed_at || new Date()) : filed === false ? null : current.filed_at;

    const { rows } = await client.query(
      `UPDATE pos_vat_deadlines SET deadline_date = $1, filed_at = $2 WHERE id = $3 RETURNING *`,
      [nextDate, nextFiledAt, current.id]
    );
    res.json({ deadline: publicDeadline(normalizeDeadlineRow(rows[0])) });
  } catch (err) {
    console.error('[PUT /api/pos/fiscal/deadlines]', err);
    res.status(500).json({ error: 'Error interno' });
  } finally {
    client.release();
  }
});

export default router;
