import { useEffect, useState } from 'react'
import { api } from '../services/api'
import InvoiceFields from '../components/InvoiceFields'

const money = value => Number(value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
const todayISO = () => new Date().toLocaleDateString('en-CA')

const METHOD_LABELS = {
  efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito', transferencia: 'Transferencia', qr: 'QR',
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function Sales() {
  const [date, setDate] = useState(todayISO())
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [retryReceiver, setRetryReceiver] = useState({})
  const [retryError, setRetryError] = useState('')
  const [retrySubmitting, setRetrySubmitting] = useState(false)

  function loadDetail(id) {
    return api.getSale(id).then(res => setDetail(res.sale)).catch(() => setDetail(null))
  }

  useEffect(() => {
    setLoading(true)
    setError('')
    api.listSales({ date })
      .then(res => setSales(res.sales))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [date])

  useEffect(() => {
    setRetrying(false)
    setRetryError('')
    if (!selectedId) { setDetail(null); return }
    loadDetail(selectedId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  async function handleDownloadPdf() {
    setDownloading(true)
    try {
      const blob = await api.downloadInvoicePdf(detail.id)
      downloadBlob(blob, `factura-venta-${detail.saleNumber}.pdf`)
    } catch (err) {
      setError(err.message)
    } finally {
      setDownloading(false)
    }
  }

  async function handleRetryInvoice() {
    setRetrySubmitting(true)
    setRetryError('')
    try {
      await api.emitInvoice({
        saleId: detail.id,
        customerDocType: retryReceiver.docType,
        customerDocNumber: retryReceiver.docNumber,
        customerName: retryReceiver.customerName,
        vatConditionId: retryReceiver.vatConditionId,
      })
      setRetrying(false)
      await loadDetail(detail.id)
    } catch (err) {
      setRetryError(err.message || 'No se pudo emitir la factura')
    } finally {
      setRetrySubmitting(false)
    }
  }

  function whatsAppLink(invoice) {
    const text = `Hola! Te paso tu ${invoice.voucherName} ${String(invoice.pointOfSale).padStart(4, '0')}-${String(invoice.voucherNumber).padStart(8, '0')} — CAE ${invoice.cae}. Total: ${money(invoice.total)}.`
    return `https://wa.me/?text=${encodeURIComponent(text)}`
  }

  function mailLink(invoice) {
    const subject = `${invoice.voucherName} ${String(invoice.pointOfSale).padStart(4, '0')}-${String(invoice.voucherNumber).padStart(8, '0')}`
    const body = `Adjuntamos tu factura. CAE: ${invoice.cae} (vence ${invoice.caeExpirationDate}). Total: ${money(invoice.total)}.`
    return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  const dayTotal = sales.reduce((sum, s) => sum + s.total, 0)

  return (
    <div className="grid h-full grid-cols-[1fr_380px] gap-4 overflow-hidden p-4">
      <div className="flex flex-col overflow-hidden">
        <div className="mb-3 flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-800">Ventas</h1>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          <span className="text-sm text-slate-500">
            {sales.length} venta{sales.length !== 1 ? 's' : ''} · Total: {money(dayTotal)}
          </span>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading ? (
          <p className="text-slate-400">Cargando...</p>
        ) : (
          <div className="flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Hora</th>
                  <th className="px-3 py-2">Vendedor</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2">Facturada</th>
                </tr>
              </thead>
              <tbody>
                {sales.map(sale => (
                  <tr
                    key={sale.id}
                    onClick={() => setSelectedId(sale.id)}
                    className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${
                      selectedId === sale.id ? 'bg-slate-100' : ''
                    }`}
                  >
                    <td className="px-3 py-2 font-medium">#{sale.saleNumber}</td>
                    <td className="px-3 py-2 text-slate-500">
                      {new Date(sale.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-3 py-2">{sale.userName}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {money(sale.total)}
                      {sale.installments > 1 && <span className="ml-1 text-xs font-normal text-amber-600">({sale.installments}c)</span>}
                    </td>
                    <td className="px-3 py-2">{sale.isInvoiced ? 'Sí' : 'No'}</td>
                  </tr>
                ))}
                {!sales.length && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                      Sin ventas ese día.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="overflow-y-auto rounded-lg border border-slate-200 bg-white p-4">
        {!detail ? (
          <p className="text-sm text-slate-400">Elegí una venta para ver el detalle.</p>
        ) : (
          <div>
            <h2 className="mb-1 text-lg font-bold text-slate-800">Venta #{detail.saleNumber}</h2>
            <p className="mb-3 text-xs text-slate-400">
              {new Date(detail.createdAt).toLocaleString('es-AR')} · {detail.userName}
            </p>

            <div className="mb-3 flex flex-col gap-1">
              {detail.items.map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>{item.quantity}x {item.productName}</span>
                  <span>{money(item.lineTotal)}</span>
                </div>
              ))}
            </div>

            <div className="mb-3 border-t border-slate-200 pt-2 text-sm">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span><span>{money(detail.subtotal)}</span>
              </div>
              {detail.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Descuento{detail.discountPercent != null ? ` (${detail.discountPercent}%)` : ''}</span>
                  <span>- {money(detail.discountAmount)}</span>
                </div>
              )}
              {detail.surchargeAmount > 0 && (
                <div className="flex justify-between text-amber-700">
                  <span>Recargo{detail.installments ? ` (${detail.installments} cuotas)` : ''}</span>
                  <span>+ {money(detail.surchargeAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-slate-900">
                <span>Total</span><span>{money(detail.total)}</span>
              </div>
            </div>

            <div className="mb-3 text-sm">
              <p className="mb-1 font-medium text-slate-700">Pagos</p>
              {detail.payments.map(p => (
                <div key={p.id} className="flex justify-between text-slate-600">
                  <span>{METHOD_LABELS[p.method] || p.method}</span>
                  <span>{money(p.amount)}</span>
                </div>
              ))}
            </div>

            <div className="mb-3 border-t border-slate-200 pt-3">
              <p className="mb-1 font-medium text-slate-700">Factura</p>
              {detail.invoice?.status === 'authorized' ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
                  <p className="font-semibold text-emerald-800">
                    {detail.invoice.voucherName} {String(detail.invoice.pointOfSale).padStart(4, '0')}-{String(detail.invoice.voucherNumber).padStart(8, '0')}
                  </p>
                  <p className="text-emerald-700">CAE: {detail.invoice.cae} · vence {detail.invoice.caeExpirationDate}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button onClick={handleDownloadPdf} disabled={downloading} className="rounded-md border border-emerald-600 bg-white px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                      {downloading ? 'Descargando...' : 'Descargar PDF'}
                    </button>
                    <a href={whatsAppLink(detail.invoice)} target="_blank" rel="noreferrer" className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
                      WhatsApp
                    </a>
                    <a href={mailLink(detail.invoice)} className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
                      Email
                    </a>
                  </div>
                </div>
              ) : detail.isInvoiced ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
                  <p className="mb-2 text-red-700">
                    {detail.invoice?.status === 'rejected' ? 'AFIP rechazó el comprobante.' : 'No se pudo emitir la factura.'}
                  </p>
                  {!retrying ? (
                    <button onClick={() => setRetrying(true)} className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700">
                      Reintentar emisión
                    </button>
                  ) : (
                    <div>
                      <InvoiceFields value={retryReceiver} onChange={setRetryReceiver} />
                      {retryError && <p className="mt-2 text-sm text-red-600">{retryError}</p>}
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => setRetrying(false)} className="flex-1 rounded-md border border-slate-300 py-1 text-xs text-slate-600">
                          Cancelar
                        </button>
                        <button onClick={handleRetryInvoice} disabled={retrySubmitting} className="flex-1 rounded-md bg-slate-900 py-1 text-xs font-medium text-white disabled:opacity-50">
                          {retrySubmitting ? 'Emitiendo...' : 'Reintentar'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No facturada.</p>
              )}
            </div>
            {detail.notes && <p className="mt-2 text-sm italic text-slate-500">"{detail.notes}"</p>}
          </div>
        )}
      </div>
    </div>
  )
}
