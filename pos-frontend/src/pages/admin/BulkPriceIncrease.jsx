import { useEffect, useState } from 'react'
import { useProductCatalog } from '../../hooks/useProductCatalog'
import { api } from '../../services/api'

const money = value => Number(value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })

function DiffCell({ oldPrice, newPrice }) {
  const diff = newPrice - oldPrice
  const pct = oldPrice !== 0 ? (diff / oldPrice) * 100 : null
  const cls = diff > 0 ? 'text-red-600' : diff < 0 ? 'text-emerald-600' : 'text-slate-400'
  return <span className={cls}>{diff > 0 ? '+' : ''}{money(diff)} {pct != null && `(${diff > 0 ? '+' : ''}${pct.toFixed(1)}%)`}</span>
}

export default function BulkPriceIncrease() {
  const { searchLocal } = useProductCatalog()
  const [filterMode, setFilterMode] = useState('supplier') // supplier | category | manual
  const [filterOptions, setFilterOptions] = useState({ suppliers: [], categories: [] })
  const [supplier, setSupplier] = useState('')
  const [category, setCategory] = useState('')
  const [manualQuery, setManualQuery] = useState('')
  const [manualProducts, setManualProducts] = useState([])
  const [percent, setPercent] = useState('')

  const [preview, setPreview] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.getBulkIncreaseFilters().then(setFilterOptions).catch(() => {})
  }, [])

  const manualResults = manualQuery.trim() ? searchLocal(manualQuery, 10) : []

  function addManualProduct(product) {
    if (manualProducts.some(p => p.id === product.id)) return
    setManualProducts(prev => [...prev, product])
    setManualQuery('')
  }
  function removeManualProduct(id) {
    setManualProducts(prev => prev.filter(p => p.id !== id))
  }

  async function handlePreview() {
    setError('')
    const percentNumber = Number(percent)
    if (!Number.isFinite(percentNumber) || percentNumber === 0) {
      setError('Ingresá un porcentaje distinto de cero')
      return
    }
    const filters = {}
    if (filterMode === 'supplier') {
      if (!supplier) { setError('Elegí un proveedor'); return }
      filters.supplier = supplier
    } else if (filterMode === 'category') {
      if (!category) { setError('Elegí una categoría'); return }
      filters.category = category
    } else {
      if (!manualProducts.length) { setError('Elegí al menos un producto'); return }
      filters.productIds = manualProducts.map(p => p.id)
    }

    setLoading(true)
    try {
      const result = await api.previewBulkIncrease({ percent: percentNumber, filters })
      setPreview(result)
    } catch (err) {
      setError(err.message || 'No se pudo generar la vista previa')
    } finally {
      setLoading(false)
    }
  }

  async function handleApply() {
    setApplying(true)
    setError('')
    try {
      const result = await api.applyPriceImport(preview.importId)
      setApplyResult(result)
      setConfirming(false)
    } catch (err) {
      setError(err.message || 'No se pudo aplicar el aumento')
      setConfirming(false)
    } finally {
      setApplying(false)
    }
  }

  async function handleCancelPreview() {
    if (preview) await api.cancelPriceImport(preview.importId).catch(() => {})
    setPreview(null)
  }

  function resetAll() {
    setPreview(null)
    setApplyResult(null)
    setPercent('')
    setManualProducts([])
    setError('')
  }

  return (
    <div className="mx-auto max-w-4xl overflow-y-auto p-6">
      <h1 className="mb-4 text-xl font-bold text-slate-800">Aumento de precios</h1>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {applyResult ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
          <p className="mb-4 text-lg font-bold text-emerald-700">✓ Se actualizaron {applyResult.updatedRows} precios correctamente</p>
          <button onClick={resetAll} className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800">
            Nuevo aumento
          </button>
        </div>
      ) : !preview ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <label className="mb-4 block text-sm font-medium text-slate-700">
            Porcentaje de aumento
            <input
              type="number" step="0.1" value={percent}
              onChange={e => setPercent(e.target.value)}
              placeholder="ej: 15"
              className="mt-1 w-40 rounded-md border border-slate-300 px-3 py-2 text-lg"
            />
          </label>

          <div className="mb-3 flex gap-1">
            {[['supplier', 'Por proveedor'], ['category', 'Por categoría'], ['manual', 'Selección manual']].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilterMode(key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${filterMode === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {filterMode === 'supplier' && (
            <select value={supplier} onChange={e => setSupplier(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2">
              <option value="">Elegir proveedor...</option>
              {filterOptions.suppliers.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {filterMode === 'category' && (
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2">
              <option value="">Elegir categoría...</option>
              {filterOptions.categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {filterMode === 'manual' && (
            <div>
              <input
                value={manualQuery}
                onChange={e => setManualQuery(e.target.value)}
                placeholder="Buscar producto..."
                className="mb-2 w-full rounded-md border border-slate-300 px-3 py-2"
              />
              {manualResults.length > 0 && (
                <div className="mb-2 max-h-40 overflow-y-auto rounded-md border border-slate-200">
                  {manualResults.map(p => (
                    <button key={p.id} onClick={() => addManualProduct(p)} className="flex w-full justify-between border-b border-slate-100 px-2 py-1.5 text-left text-sm last:border-b-0 hover:bg-slate-50">
                      <span>{p.nombre}</span><span className="text-xs text-slate-400">{p.codigo}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {manualProducts.map(p => (
                  <span key={p.id} className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs">
                    {p.codigo}
                    <button onClick={() => removeManualProduct(p.id)} className="text-slate-400 hover:text-red-500">✕</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handlePreview}
            disabled={loading}
            className="mt-4 w-full rounded-md bg-slate-900 py-2 font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? 'Procesando...' : 'Vista previa'}
          </button>
        </div>
      ) : (
        <div>
          <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-slate-700">
              Se van a afectar <strong>{preview.updatedRows}</strong> de <strong>{preview.totalRows}</strong> productos.{' '}
              {preview.skippedRows > 0 && <><strong>{preview.skippedRows}</strong> quedan afuera (en USD o sin cambio real).</>}
            </p>
          </div>

          <div className="mb-4 max-h-96 overflow-y-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2 text-right">Precio actual</th>
                  <th className="px-3 py-2 text-right">Precio nuevo</th>
                  <th className="px-3 py-2 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {preview.changed.map(row => (
                  <tr key={row.productCode} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{row.productCode}</td>
                    <td className="px-3 py-2 text-slate-500">{row.productName || '—'}</td>
                    <td className="px-3 py-2 text-right">{money(row.oldPrice)}</td>
                    <td className="px-3 py-2 text-right">{money(row.newPrice)}</td>
                    <td className="px-3 py-2 text-right"><DiffCell oldPrice={row.oldPrice} newPrice={row.newPrice} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <button onClick={handleCancelPreview} className="flex-1 rounded-md border border-slate-300 py-2 text-slate-600 hover:bg-slate-100">
              Cancelar
            </button>
            <button
              onClick={() => setConfirming(true)}
              disabled={preview.updatedRows === 0}
              className="flex-1 rounded-lg bg-emerald-600 py-3 text-lg font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !applying && setConfirming(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="mb-2 text-lg font-bold text-slate-800">¿Estás seguro?</h2>
            <p className="mb-4 text-sm text-slate-600">
              Se van a actualizar <strong>{preview.updatedRows}</strong> precios. Esta acción se aplica inmediatamente
              en el POS y en la web.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirming(false)} disabled={applying} className="flex-1 rounded-md border border-slate-300 py-2 text-slate-600 hover:bg-slate-100">
                Cancelar
              </button>
              <button onClick={handleApply} disabled={applying} className="flex-1 rounded-md bg-emerald-600 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                {applying ? 'Aplicando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
