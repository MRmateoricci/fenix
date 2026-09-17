import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useProductCatalog } from '../hooks/useProductCatalog'
import { api } from '../services/api'

const money = value => Number(value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })

export default function NewPurchase() {
  const { id: supplierId } = useParams()
  const navigate = useNavigate()
  const { searchLocal } = useProductCatalog()

  const [supplierName, setSupplierName] = useState('')
  const [hasInvoice, setHasInvoice] = useState(false)
  const [invoiceType, setInvoiceType] = useState('A')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [netAmount, setNetAmount] = useState('')
  const [vat21, setVat21] = useState('')
  const [vat105, setVat105] = useState('0')
  const [perceptions, setPerceptions] = useState('0')
  const [total, setTotal] = useState('')
  const [totalTouched, setTotalTouched] = useState(false)
  const [notes, setNotes] = useState('')

  const [itemsOpen, setItemsOpen] = useState(false)
  const [items, setItems] = useState([])
  const [productQuery, setProductQuery] = useState('')

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api.getSupplier(supplierId).then(res => setSupplierName(res.supplier.name)).catch(() => {})
  }, [supplierId])

  // Se recalcula solo mientras el usuario no haya tocado el campo Total a
  // mano: la consigna pide que sea editable "por si no coincide" con el
  // remito, así que apenas lo edita dejamos de pisarlo.
  useEffect(() => {
    if (!hasInvoice || totalTouched) return
    const sum = [netAmount, vat21, vat105, perceptions].reduce((sum, v) => sum + (Number(v) || 0), 0)
    setTotal(sum ? String(Math.round(sum * 100) / 100) : '')
  }, [hasInvoice, netAmount, vat21, vat105, perceptions, totalTouched])

  const productResults = productQuery.trim() ? searchLocal(productQuery, 10) : []

  function addItem(product) {
    setItems(prev => [
      ...prev,
      { key: `${product.id}-${prev.length}`, productId: product.id, productName: product.nombre, quantity: 1, unitCost: '' },
    ])
    setProductQuery('')
  }
  function updateItem(key, patch) {
    setItems(prev => prev.map(i => (i.key === key ? { ...i, ...patch } : i)))
  }
  function removeItem(key) {
    setItems(prev => prev.filter(i => i.key !== key))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const totalNumber = Number(total)
    if (!Number.isFinite(totalNumber) || totalNumber <= 0) {
      setError('Ingresá un total válido')
      return
    }
    if (hasInvoice && !invoiceType) {
      setError('Elegí el tipo de factura')
      return
    }
    for (const item of items) {
      if (!Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0) {
        setError(`Cantidad inválida para ${item.productName}`)
        return
      }
    }

    setSubmitting(true)
    try {
      const payload = {
        supplierId,
        hasInvoice,
        total: totalNumber,
        notes: notes.trim() || undefined,
        items: items.map(item => ({
          productId: item.productId || undefined,
          productName: item.productName,
          quantity: Number(item.quantity),
          unitCost: item.unitCost !== '' ? Number(item.unitCost) : undefined,
          lineTotal: item.unitCost !== '' ? Math.round(Number(item.unitCost) * Number(item.quantity) * 100) / 100 : undefined,
        })),
      }
      if (hasInvoice) {
        payload.invoiceType = invoiceType
        if (invoiceNumber.trim()) payload.invoiceNumber = invoiceNumber.trim()
        if (invoiceDate) payload.invoiceDate = invoiceDate
        if (netAmount !== '') payload.netAmount = Number(netAmount)
        if (vat21 !== '') payload.vat21 = Number(vat21)
        if (vat105 !== '') payload.vat105 = Number(vat105)
        if (perceptions !== '') payload.perceptions = Number(perceptions)
      }
      await api.createPurchase(payload)
      navigate(`/proveedores/${supplierId}`)
    } catch (err) {
      setError(err.message || 'No se pudo registrar la compra')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl overflow-y-auto p-6">
      <Link to={`/proveedores/${supplierId}`} className="mb-3 inline-block text-sm text-slate-500 hover:underline">
        ← {supplierName || 'Proveedor'}
      </Link>
      <h1 className="mb-4 text-xl font-bold text-slate-800">Registrar compra — {supplierName}</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={hasInvoice} onChange={e => setHasInvoice(e.target.checked)} />
          ¿Viene con factura?
        </label>

        {hasInvoice ? (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-4">
            <label className="text-sm font-medium text-slate-700">
              Tipo
              <select
                value={invoiceType}
                onChange={e => setInvoiceType(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              >
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Número de factura
              <input
                value={invoiceNumber}
                onChange={e => setInvoiceNumber(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="col-span-2 text-sm font-medium text-slate-700">
              Fecha de factura
              <input
                type="date"
                value={invoiceDate}
                onChange={e => setInvoiceDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Neto gravado
              <input
                type="number" min="0" step="0.01"
                value={netAmount}
                onChange={e => setNetAmount(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              IVA 21%
              <input
                type="number" min="0" step="0.01"
                value={vat21}
                onChange={e => setVat21(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              IVA 10,5% (opcional)
              <input
                type="number" min="0" step="0.01"
                value={vat105}
                onChange={e => setVat105(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Percepciones (opcional)
              <input
                type="number" min="0" step="0.01"
                value={perceptions}
                onChange={e => setPerceptions(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
        ) : null}

        <label className="text-sm font-medium text-slate-700">
          Total
          <input
            type="number" min="0" step="0.01"
            value={total}
            onChange={e => { setTotal(e.target.value); setTotalTouched(true) }}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-lg"
          />
        </label>

        <div>
          <button
            type="button"
            onClick={() => setItemsOpen(o => !o)}
            className="text-sm font-medium text-slate-600 underline"
          >
            {itemsOpen ? 'Ocultar' : 'Agregar'} detalle de productos (opcional)
          </button>
          {itemsOpen && (
            <div className="mt-2 rounded-lg border border-slate-200 p-3">
              <input
                value={productQuery}
                onChange={e => setProductQuery(e.target.value)}
                placeholder="Buscar producto del sistema..."
                className="mb-2 w-full rounded-md border border-slate-300 px-3 py-2"
              />
              {productResults.length > 0 && (
                <div className="mb-2 max-h-40 overflow-y-auto rounded-md border border-slate-200">
                  {productResults.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addItem(p)}
                      className="flex w-full items-center justify-between border-b border-slate-100 px-2 py-1.5 text-left text-sm last:border-b-0 hover:bg-slate-50"
                    >
                      <span>{p.nombre}</span>
                      <span className="text-xs text-slate-400">{p.codigo}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-1">
                {items.map(item => (
                  <div key={item.key} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate">{item.productName}</span>
                    <input
                      type="number" min="1"
                      value={item.quantity}
                      onChange={e => updateItem(item.key, { quantity: e.target.value })}
                      className="w-16 rounded-md border border-slate-300 px-2 py-1 text-center"
                    />
                    <input
                      type="number" min="0" step="0.01"
                      value={item.unitCost}
                      onChange={e => updateItem(item.key, { unitCost: e.target.value })}
                      placeholder="costo unit."
                      className="w-24 rounded-md border border-slate-300 px-2 py-1"
                    />
                    <button type="button" onClick={() => removeItem(item.key)} className="text-slate-400 hover:text-red-500">✕</button>
                  </div>
                ))}
                {!items.length && <p className="text-xs text-slate-400">Sin productos agregados. El stock solo se actualiza para los que agregues acá.</p>}
              </div>
            </div>
          )}
        </div>

        <label className="text-sm font-medium text-slate-700">
          Notas (opcional)
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-slate-900 py-3 text-lg font-bold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? 'Registrando...' : `Registrar compra${total ? ` — ${money(total)}` : ''}`}
        </button>
      </form>
    </div>
  )
}
