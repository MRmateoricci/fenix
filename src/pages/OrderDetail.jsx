import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PageSEO from '../components/SEO'

const API_BASE = import.meta.env.VITE_API_URL || ''
const PAID_STATUSES = ['paid', 'preparing', 'shipped', 'delivered']
const fmt = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(value || 0))
const fmtDateTime = (value) => new Date(value).toLocaleString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const statusLabel = (status) => ({
  pending_payment: 'Pago pendiente', reserved: 'Reservado', paid: 'Pagada', preparing: 'En preparación',
  shipped: 'En camino', delivered: 'Concluida', cancelled: 'Cancelada', payment_failed: 'Pago rechazado', expired: 'Vencida',
}[status] || status)

function Address({ order, billing = false }) {
  const address = billing ? order.billing_address : order.address
  const extra = billing ? order.billing_address_extra : order.address_extra
  const city = billing ? order.billing_city : order.city
  const province = billing ? order.billing_province : order.province
  const postalCode = billing ? order.billing_postal_code : order.postal_code
  return (
    <div className="fnx-order-address">
      <strong>{order.customer_name}</strong>
      {address && <span>{address}{extra ? `, ${extra}` : ''}</span>}
      {city && <span>{city}</span>}
      {province && <span>{province}</span>}
      {postalCode && <span>{postalCode}</span>}
      <span>Argentina</span>
      {order.customer_phone && <span>{order.customer_phone}</span>}
    </div>
  )
}

function FiscalForm({ initial, onSaved, busy }) {
  const [options, setOptions] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: initial?.name || '',
    docType: initial?.docType || '',
    docNumber: initial?.docNumber || '',
    vatConditionId: initial?.vatConditionId || '',
  })

  useEffect(() => {
    fetch(`${API_BASE}/api/arca/invoice-options`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'No pudimos consultar los parámetros de ARCA.')
        setOptions(data)
      })
      .catch((reason) => setError(reason.message))
  }, [])

  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const vatCondition = options?.vatConditions
    ?.find((option) => option.id === Number(form.vatConditionId))
  const documents = vatCondition
    ? options.documents.filter((option) => vatCondition.allowedDocumentTypeIds.includes(option.id))
    : options?.documents || []
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    try {
      await onSaved({
        name: form.name,
        docType: Number(form.docType),
        docNumber: form.docNumber,
        vatConditionId: Number(form.vatConditionId),
      })
    } catch (reason) {
      setError(reason.message)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 12, marginTop: 14 }}>
      <label>Nombre / Razón social<input value={form.name} onChange={(event) => change('name', event.target.value)} required /></label>
      <label>Tipo de documento
        <select value={form.docType} onChange={(event) => {
          const type = Number(event.target.value)
          change('docType', event.target.value)
          change('docNumber', type === 99 ? '0' : '')
        }} required>
          <option value="">Seleccionar</option>
          {documents.map((option) => <option key={option.id} value={option.id}>{option.description}</option>)}
        </select>
      </label>
      <label>Número<input inputMode="numeric" value={form.docNumber} onChange={(event) => change('docNumber', event.target.value.replace(/\D/g, '').slice(0, 20))} readOnly={Number(form.docType) === 99} required /></label>
      <label>Condición frente al IVA
        <select value={form.vatConditionId} onChange={(event) => {
          const value = event.target.value
          const selected = options?.vatConditions?.find((option) => option.id === Number(value))
          setForm((current) => ({
            ...current,
            vatConditionId: value,
            ...(!selected || selected.allowedDocumentTypeIds.includes(Number(current.docType))
              ? {}
              : { docType: '', docNumber: '' }),
          }))
        }} required>
          <option value="">Seleccionar</option>
          {(options?.vatConditions || []).map((option) => <option key={option.id} value={option.id}>{option.description}</option>)}
        </select>
      </label>
      {error && <p style={{ color: 'var(--color-primary)' }}>{error}</p>}
      <button type="submit" className="fnx-pay-now" disabled={busy || !options}>{busy ? 'Guardando...' : 'Confirmar datos fiscales'}</button>
    </form>
  )
}

function InvoicePanel({ order, invoiceData, setInvoiceData }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const invoice = invoiceData?.invoice
  const invoiceAttempt = invoiceData?.invoiceAttempt
  const canInvoice = PAID_STATUSES.includes(order.status)
  const authorized = invoice?.status === 'authorized'
  const attemptFailed = invoiceAttempt?.status === 'failed'
  const inProgress = !authorized && (invoiceAttempt?.status === 'processing' || invoice?.status === 'processing')
  const failed = !authorized && (attemptFailed || ['rejected', 'error', 'uncertain'].includes(invoice?.status))
  const mustConfirm = !authorized && (!invoiceData?.recipientConfirmed
    || invoiceAttempt?.requiresRecipientData
    || invoice?.status === 'rejected')

  const saveRecipient = async (invoiceRecipient) => {
    setBusy(true)
    try {
      const response = await fetch(`${API_BASE}/api/orders/${order.id}/invoice-recipient`, {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceRecipient }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'No pudimos confirmar los datos fiscales.')
      setInvoiceData((current) => ({
        ...current,
        invoice: null,
        invoiceAttempt: data.invoiceAttempt || current?.invoiceAttempt,
        recipientConfirmed: true,
        invoiceRecipient: data.invoiceRecipient,
      }))
      setError('')
    } finally {
      setBusy(false)
    }
  }

  const issueInvoice = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE}/api/orders/${order.id}/invoice`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}',
      })
      const data = await response.json().catch(() => ({}))
      if (data.invoice || data.invoiceAttempt) {
        setInvoiceData((current) => ({
          ...current,
          invoice: data.invoice || current?.invoice,
          invoiceAttempt: data.invoiceAttempt || current?.invoiceAttempt,
        }))
      }
      if (!response.ok) throw new Error(data.error || 'No pudimos emitir la factura.')
      const refreshed = await fetch(`${API_BASE}/api/orders/${order.id}/invoice`, { credentials: 'include' })
      if (refreshed.ok) setInvoiceData(await refreshed.json())
    } catch (reason) {
      setError(reason.message)
    } finally {
      setBusy(false)
    }
  }

  const downloadPdf = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE}/api/orders/${order.id}/invoice/pdf`, { credentials: 'include' })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'No pudimos descargar la factura.')
      }
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = `factura-${order.order_number}.pdf`
      link.click()
      URL.revokeObjectURL(url)
    } catch (reason) {
      setError(reason.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={{ marginTop: 28, padding: 22, border: '1px solid var(--color-border)', borderRadius: 12 }}>
      <h2 style={{ marginTop: 0 }}>Factura electrónica</h2>
      {!canInvoice && <p>La factura estará disponible cuando el pago quede acreditado.</p>}
      {canInvoice && mustConfirm && (
        <>
          <p>{invoice?.status === 'rejected'
            ? 'No pudimos generar la factura con esos datos. Revisalos antes de volver a intentar.'
            : 'Completá tus datos fiscales para recibir la factura.'}</p>
          <FiscalForm initial={invoiceData?.invoiceRecipient || {
            name: order.invoice_recipient_name || order.customer_name,
            docType: order.invoice_doc_type,
            docNumber: order.invoice_doc_number,
            vatConditionId: order.invoice_vat_condition_id,
          }} onSaved={saveRecipient} busy={busy} />
        </>
      )}
      {canInvoice && !mustConfirm && inProgress && <p>Estamos generando tu factura. Actualizá la página en unos instantes para consultar el resultado.</p>}
      {canInvoice && !mustConfirm && !inProgress && !failed && (!invoice || invoice.status === 'pending') && <button type="button" className="fnx-pay-now" onClick={issueInvoice} disabled={busy}>{busy ? 'Procesando...' : 'Obtener factura'}</button>}
      {canInvoice && !mustConfirm && failed && (
        <div>
          <p>No pudimos generar la factura automáticamente. Tu pago y tu pedido siguen confirmados.</p>
          <button type="button" className="fnx-pay-now" onClick={issueInvoice} disabled={busy}>{busy ? 'Procesando...' : 'Volver a intentar'}</button>
        </div>
      )}
      {invoice?.status === 'authorized' && (
        <div>
          <p>{invoice.voucherName || 'Factura'} disponible · N° {String(invoice.pointOfSale).padStart(5, '0')}-{String(invoice.voucherNumber).padStart(8, '0')}</p>
          <p>CAE: {invoice.cae} · Vencimiento: {String(invoice.caeExpirationDate).slice(0, 10)}</p>
          <button type="button" className="fnx-pay-now" onClick={downloadPdf} disabled={busy}>{busy ? 'Preparando PDF...' : 'Descargar factura'}</button>
        </div>
      )}
      {error && <p style={{ color: 'var(--color-primary)' }}>{error}</p>}
    </section>
  )
}

export default function OrderDetail() {
  const { id } = useParams()
  const [order, setOrder] = useState(null)
  const [invoiceData, setInvoiceData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/orders/mine/${id}`, { credentials: 'include' }),
      fetch(`${API_BASE}/api/orders/${id}/invoice`, { credentials: 'include' }),
    ]).then(async ([orderResponse, invoiceResponse]) => {
      const orderResult = await orderResponse.json().catch(() => ({}))
      const invoiceResult = await invoiceResponse.json().catch(() => ({}))
      if (!orderResponse.ok) throw new Error(orderResult.error || 'No pudimos cargar el pedido')
      if (!invoiceResponse.ok) throw new Error(invoiceResult.error || 'No pudimos consultar la factura')
      setOrder(orderResult)
      setInvoiceData(invoiceResult)
    }).catch((reason) => setError(reason.message)).finally(() => setLoading(false))
  }, [id])

  const productsSubtotal = useMemo(() => (order?.items || []).reduce((sum, item) => sum + Number(item.subtotal ?? item.price * item.quantity), 0), [order])

  if (loading) return <main className="fnx-order-detail-page"><p>Cargando pedido…</p></main>
  if (error || !order) return <main className="fnx-order-detail-page"><p>{error || 'Pedido no encontrado'}</p><Link to="/account">← Volver a mi cuenta</Link></main>

  return (
    <>
      <PageSEO title={`Pedido ${order.order_number}`} description="Detalle de tu pedido en Fénix Iluminación." url={`/orders/${order.id}`} />
      <main className="fnx-order-detail-page">
        <header><h1>Mi cuenta</h1></header>
        <div className="fnx-order-detail-layout">
          <section className="fnx-order-main">
            <h2>Pedido #{order.order_number}</h2><i />
            <p className="date">{fmtDateTime(order.created_at)}</p>
            <div className="fnx-order-products">
              <div className="head"><b>Producto</b><b>Precio</b><b>Cantidad</b><b>Total</b></div>
              {order.items.map((item, index) => (
                <div className="row" key={`${item.id}-${index}`}>
                  <div>{item.image && <img src={item.image} alt="" />}<span><strong>{item.name}</strong><small>{item.color || item.category || ''}{item.size ? ` · ${item.size}` : ''}</small></span></div>
                  <span>{fmt(item.price)}</span><span>{item.quantity}</span><strong>{fmt(item.subtotal ?? item.price * item.quantity)}</strong>
                </div>
              ))}
            </div>
            <div className="fnx-order-totals">
              <div><span>Subtotal</span><strong>{fmt(productsSubtotal)}</strong></div>
              {Number(order.discount_amount) > 0 && <div><span>Descuento{order.coupon_code ? ` · ${order.coupon_code}` : ''}</span><strong>-{fmt(order.discount_amount)}</strong></div>}
              <div><span>{order.delivery_type === 'pickup' ? 'Retiro en el local' : `Envío${order.shipping_service ? ` · ${order.shipping_service}` : ''}`}</span><strong>{Number(order.shipping_cost) ? fmt(order.shipping_cost) : 'Gratis'}</strong></div>
              <div className="total"><span>Total</span><strong>{fmt(order.total_amount)}</strong></div>
            </div>
            <InvoicePanel order={order} invoiceData={invoiceData} setInvoiceData={setInvoiceData} />
            <Link className="fnx-order-back" to="/account">← Volver a detalles de la cuenta</Link>
          </section>
          <aside className="fnx-order-side">
            <section><h2>Dirección de facturación</h2><i /><Address order={order} billing /><p>Estado del pago: <b>{PAID_STATUSES.includes(order.status) ? 'Pagada' : statusLabel(order.status)}</b></p></section>
            <section><h2>{order.delivery_type === 'pickup' ? 'Retiro' : 'Dirección de envío'}</h2><i />{order.delivery_type === 'pickup' ? <div className="fnx-order-address"><strong>Fénix City Bell</strong><span>473 entre 14C y 15, City Bell</span>{order.pickup_date && <span>Retiro: {new Date(order.pickup_date).toLocaleDateString('es-AR')}</span>}{(order.pickup_person_name || order.pickup_person_last_name) && <span>Persona autorizada: {[order.pickup_person_name, order.pickup_person_last_name].filter(Boolean).join(' ')}</span>}</div> : <Address order={order} />}<p>Estado de finalización: <b>{statusLabel(order.status)}</b></p></section>
          </aside>
        </div>
      </main>
    </>
  )
}
