import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../services/api'

const money = value => Number(value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
const dateShort = iso => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
const dateTime = value => new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })

function todayYearMonth() {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

const TABS = [
  { key: 'sales-invoiced', label: 'Ventas facturadas' },
  { key: 'sales-not-invoiced', label: 'Ventas sin facturar' },
  { key: 'purchases-with', label: 'Compras con factura' },
  { key: 'purchases-without', label: 'Compras sin factura' },
]

export default function FiscalPanel() {
  const [{ year, month }, setPeriod] = useState(todayYearMonth())
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('sales-invoiced')

  useEffect(() => {
    setLoading(true)
    setError('')
    api.getFiscalSummary(year, month)
      .then(setSummary)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [year, month])

  function changeMonth(offset) {
    setPeriod(({ year, month }) => {
      let m = month + offset
      let y = year
      while (m < 1) { m += 12; y -= 1 }
      while (m > 12) { m -= 12; y += 1 }
      return { year: y, month: m }
    })
  }

  const rawMonthLabel = new Date(year, month - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  const monthLabel = rawMonthLabel.charAt(0).toUpperCase() + rawMonthLabel.slice(1)

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Panel fiscal</h1>
        <div className="flex items-center gap-2">
          <Link to="/admin/panel-iva/anual" className="text-sm text-slate-500 underline">
            Ver historial anual
          </Link>
          <div className="ml-4 flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1">
            <button onClick={() => changeMonth(-1)} className="px-1 text-slate-500 hover:text-slate-800">‹</button>
            <span className="min-w-[9rem] text-center text-sm font-medium text-slate-700">{monthLabel}</span>
            <button onClick={() => changeMonth(1)} className="px-1 text-slate-500 hover:text-slate-800">›</button>
          </div>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {loading || !summary ? (
        <p className="text-slate-400">Cargando...</p>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          {!summary.cuitConfigured && (
            <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
              ARCA_CUIT no está configurado — no se puede calcular el vencimiento estimado.
            </p>
          )}

          <div className="mb-4 grid grid-cols-4 gap-3">
            <SummaryCard title="Ventas">
              <Row label="Facturadas" value={money(summary.sales.invoicedTotal)} sub={`${summary.sales.invoicedCount} · ${summary.sales.invoicedPercent}%`} />
              <Row label="Sin facturar" value={money(summary.sales.notInvoicedTotal)} sub={`${summary.sales.notInvoicedCount} · ${summary.sales.notInvoicedPercent}%`} />
            </SummaryCard>

            <SummaryCard title="Compras">
              <Row label="Con factura" value={money(summary.purchases.withInvoiceTotal)} sub={`${summary.purchases.withInvoiceCount} · ${summary.purchases.withInvoicePercent}%`} />
              <Row label="Sin factura" value={money(summary.purchases.withoutInvoiceTotal)} sub={`${summary.purchases.withoutInvoiceCount} · ${summary.purchases.withoutInvoicePercent}%`} />
            </SummaryCard>

            <SummaryCard title="IVA del período">
              <Row label="Débito fiscal" value={money(summary.vat.debitTotal)} />
              <Row label="Crédito fiscal" value={money(summary.vat.creditTotal)} />
              <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-1">
                <span className="text-xs font-medium text-slate-500">Saldo</span>
                <span className={`text-sm font-bold ${
                  summary.vat.balanceDirection === 'payable' ? 'text-red-600' :
                  summary.vat.balanceDirection === 'favor' ? 'text-emerald-600' : 'text-slate-600'
                }`}>
                  {money(Math.abs(summary.vat.balance))}
                  {summary.vat.balanceDirection === 'payable' && ' a pagar'}
                  {summary.vat.balanceDirection === 'favor' && ' a favor'}
                </span>
              </div>
            </SummaryCard>

            <SummaryCard title="Vencimiento">
              {summary.deadline ? (
                <>
                  <p className="text-lg font-bold text-slate-800">{dateShort(summary.deadline.deadlineDate)}</p>
                  <p className={`text-sm font-medium ${
                    summary.deadline.filedAt ? 'text-emerald-600' :
                    summary.deadline.overdue ? 'text-red-600' : 'text-slate-500'
                  }`}>
                    {summary.deadline.filedAt ? 'Presentado' : summary.deadline.overdue ? 'Vencido, sin presentar' : `En ${summary.deadline.daysRemaining} días`}
                  </p>
                  {summary.deadline.computed && (
                    <p className="mt-1 text-xs text-slate-400">Fecha estimada, no oficial</p>
                  )}
                  <DeadlineActions summary={summary} onUpdated={() => api.getFiscalSummary(year, month).then(setSummary)} />
                </>
              ) : (
                <p className="text-sm text-slate-400">Sin datos</p>
              )}
            </SummaryCard>
          </div>

          <div className="mb-3 flex gap-1 border-b border-slate-200">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-2 text-sm font-medium ${
                  tab === t.key ? 'border-b-2 border-slate-900 text-slate-900' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden">
            {tab === 'sales-invoiced' && <SalesDetailTable year={year} month={month} type="invoiced" />}
            {tab === 'sales-not-invoiced' && <SalesDetailTable year={year} month={month} type="not_invoiced" />}
            {tab === 'purchases-with' && <PurchasesDetailTable year={year} month={month} type="with_invoice" />}
            {tab === 'purchases-without' && <PurchasesDetailTable year={year} month={month} type="without_invoice" />}
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ title, children }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      {children}
    </div>
  )
}

function Row({ label, value, sub }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs text-slate-500">{label}{sub && <span className="ml-1 text-slate-300">({sub})</span>}</span>
      <span className="text-sm font-semibold text-slate-800">{value}</span>
    </div>
  )
}

// Marcar presentado / editar la fecha es una corrección manual sobre la
// aproximación de approximateDeadline (ver backend/routes/pos/fiscal.js) —
// no hay calendario oficial de AFIP disponible desde acá.
function DeadlineActions({ summary, onUpdated }) {
  const [saving, setSaving] = useState(false)

  async function markFiled(filed) {
    setSaving(true)
    try {
      await api.updateVatDeadline({ year: summary.year, month: summary.month, filed })
      onUpdated()
    } catch {
      // el error queda visible si el usuario vuelve a intentar; no hace
      // falta un toast para una acción tan chica
    } finally {
      setSaving(false)
    }
  }

  if (!summary.cuitConfigured) return null

  return (
    <button
      onClick={() => markFiled(!summary.deadline.filedAt)}
      disabled={saving}
      className="mt-2 w-full rounded-md border border-slate-300 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
    >
      {summary.deadline.filedAt ? 'Marcar como no presentado' : 'Marcar como presentado'}
    </button>
  )
}

function usePaginatedDetail(fetcher, deps) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { setPage(1) }, deps)

  useEffect(() => {
    setLoading(true)
    fetcher(page)
      .then(setData)
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, ...deps])

  return { page, setPage, data, loading }
}

function SalesDetailTable({ year, month, type }) {
  const { page, setPage, data, loading } = usePaginatedDetail(
    p => api.getFiscalSalesDetail({ year, month, type, page: p, limit: 50 }),
    [year, month, type]
  )

  return (
    <DetailTableShell
      loading={loading}
      data={data}
      page={page}
      setPage={setPage}
      emptyText="Sin ventas en este período."
      head={
        <tr>
          <th className="px-3 py-2">Fecha</th>
          <th className="px-3 py-2">Vendedor</th>
          <th className="px-3 py-2">Medio de pago</th>
          {type === 'invoiced' && <th className="px-3 py-2">Comprobante</th>}
          <th className="px-3 py-2 text-right">Total</th>
        </tr>
      }
      renderRow={sale => (
        <tr key={sale.id} className="border-t border-slate-100">
          <td className="px-3 py-2">{dateTime(sale.createdAt)}</td>
          <td className="px-3 py-2">{sale.userName}</td>
          <td className="px-3 py-2">{sale.method || '—'}</td>
          {type === 'invoiced' && (
            <td className="px-3 py-2">
              {sale.invoice ? `${sale.invoice.pointOfSale}-${String(sale.invoice.voucherNumber).padStart(8, '0')}` : '—'}
            </td>
          )}
          <td className="px-3 py-2 text-right font-medium">{money(sale.total)}</td>
        </tr>
      )}
      rows={data?.sales}
    />
  )
}

function PurchasesDetailTable({ year, month, type }) {
  const { page, setPage, data, loading } = usePaginatedDetail(
    p => api.getFiscalPurchasesDetail({ year, month, type, page: p, limit: 50 }),
    [year, month, type]
  )

  return (
    <DetailTableShell
      loading={loading}
      data={data}
      page={page}
      setPage={setPage}
      emptyText="Sin compras en este período."
      head={
        <tr>
          <th className="px-3 py-2">Fecha</th>
          <th className="px-3 py-2">Proveedor</th>
          {type === 'with_invoice' && <th className="px-3 py-2">Factura</th>}
          {type === 'with_invoice' && <th className="px-3 py-2 text-right">IVA</th>}
          <th className="px-3 py-2 text-right">Total</th>
        </tr>
      }
      renderRow={purchase => (
        <tr key={purchase.id} className="border-t border-slate-100">
          <td className="px-3 py-2">{dateShort(String(purchase.date).slice(0, 10))}</td>
          <td className="px-3 py-2">{purchase.supplierName}</td>
          {type === 'with_invoice' && (
            <td className="px-3 py-2">{purchase.invoiceType ? `${purchase.invoiceType} ${purchase.invoiceNumber || ''}` : '—'}</td>
          )}
          {type === 'with_invoice' && (
            <td className="px-3 py-2 text-right">{money((purchase.vat21 || 0) + (purchase.vat105 || 0))}</td>
          )}
          <td className="px-3 py-2 text-right font-medium">{money(purchase.total)}</td>
        </tr>
      )}
      rows={data?.purchases}
    />
  )
}

function DetailTableShell({ loading, data, page, setPage, head, renderRow, rows, emptyText }) {
  if (loading && !data) return <p className="text-slate-400">Cargando...</p>

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">{head}</thead>
          <tbody>
            {rows?.map(renderRow)}
            {rows && !rows.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-400">{emptyText}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data && data.total > data.limit && (
        <div className="mt-2 flex items-center justify-between text-sm text-slate-500">
          <span>{data.total} resultado{data.total === 1 ? '' : 's'} · total {money(data.totalAmount)}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-40">‹</button>
            <span>{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-40">›</button>
          </div>
        </div>
      )}
      {data && data.total <= data.limit && data.total > 0 && (
        <div className="mt-2 text-sm text-slate-500">{data.total} resultado{data.total === 1 ? '' : 's'} · total {money(data.totalAmount)}</div>
      )}
    </div>
  )
}
