import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../services/api'

const money = value => Number(value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })

function DiffCell({ oldPrice, newPrice }) {
  if (oldPrice == null) return <span className="text-slate-400">—</span>
  const diff = newPrice - oldPrice
  const pct = oldPrice !== 0 ? (diff / oldPrice) * 100 : null
  const cls = diff > 0 ? 'text-red-600' : diff < 0 ? 'text-emerald-600' : 'text-slate-400'
  return (
    <span className={cls}>
      {diff > 0 ? '+' : ''}{money(diff)} {pct != null && `(${diff > 0 ? '+' : ''}${pct.toFixed(1)}%)`}
    </span>
  )
}

const TABS = [
  { key: 'changed', label: 'Cambios' },
  { key: 'notFound', label: 'No encontrados' },
  { key: 'unchanged', label: 'Sin cambio' },
  { key: 'skippedCurrency', label: 'En USD (omitidos)' },
]

export default function PriceImport() {
  const [step, setStep] = useState('upload') // upload | mapping | preview | done
  const [suppliers, setSuppliers] = useState([])
  const [supplierId, setSupplierId] = useState('')
  const [file, setFile] = useState(null)
  const [uploadInfo, setUploadInfo] = useState(null)

  const [codeColumnIndex, setCodeColumnIndex] = useState('')
  const [priceColumnIndex, setPriceColumnIndex] = useState('')
  const [nameColumnIndex, setNameColumnIndex] = useState('')
  const [priceIncludesTax, setPriceIncludesTax] = useState(false)

  const [preview, setPreview] = useState(null)
  const [activeTab, setActiveTab] = useState('changed')
  const [confirming, setConfirming] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState(null)

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.listSuppliers().then(res => setSuppliers(res.suppliers)).catch(() => {})
  }, [])

  async function handleFileChange(e) {
    const selected = e.target.files?.[0]
    if (!selected) return
    setError('')
    setLoading(true)
    try {
      const info = await api.uploadPriceList(selected)
      setFile(selected)
      setUploadInfo(info)
      setCodeColumnIndex('')
      setPriceColumnIndex('')
      setNameColumnIndex('')
      setStep('mapping')
    } catch (err) {
      setError(err.message || 'No se pudo leer el archivo')
    } finally {
      setLoading(false)
    }
  }

  async function handlePreview() {
    setError('')
    if (codeColumnIndex === '' || priceColumnIndex === '') {
      setError('Elegí la columna del código y la del precio')
      return
    }
    setLoading(true)
    try {
      const result = await api.previewPriceImport(file, {
        codeColumnIndex, priceColumnIndex,
        nameColumnIndex: nameColumnIndex !== '' ? nameColumnIndex : undefined,
        priceIncludesTax, supplierId: supplierId || undefined,
      })
      setPreview(result)
      setActiveTab('changed')
      setStep('preview')
    } catch (err) {
      setError(err.message || 'No se pudo generar la vista previa')
    } finally {
      setLoading(false)
    }
  }

  async function handleCancelPreview() {
    if (!preview) return
    try {
      await api.cancelPriceImport(preview.importId)
    } catch { /* ya se muestra el reset igual */ }
    resetWizard()
  }

  async function handleApply() {
    setApplying(true)
    setError('')
    try {
      const result = await api.applyPriceImport(preview.importId)
      setApplyResult(result)
      setConfirming(false)
      setStep('done')
    } catch (err) {
      setError(err.message || 'No se pudo aplicar la importación')
      setConfirming(false)
    } finally {
      setApplying(false)
    }
  }

  function resetWizard() {
    setStep('upload')
    setFile(null)
    setUploadInfo(null)
    setPreview(null)
    setApplyResult(null)
    setError('')
    setSupplierId('')
  }

  return (
    <div className="mx-auto max-w-4xl overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Importar lista de precios</h1>
        <Link to="/admin/importar-precios/historial" className="text-sm text-slate-500 underline">Ver historial</Link>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {step === 'upload' && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <label className="mb-1 block text-sm font-medium text-slate-700">Proveedor (opcional, para el historial)</label>
          <select
            value={supplierId}
            onChange={e => setSupplierId(e.target.value)}
            className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="">Sin especificar</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <label className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 p-10 text-center hover:border-slate-400">
            <span className="mb-1 font-medium text-slate-700">
              {loading ? 'Leyendo archivo...' : 'Hacé click para elegir un archivo'}
            </span>
            <span className="text-sm text-slate-400">.xlsx, .xls o .csv</span>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} disabled={loading} className="hidden" />
          </label>
        </div>
      )}

      {step === 'mapping' && uploadInfo && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="mb-3 text-sm text-slate-500">{file?.name} — {uploadInfo.totalRows} filas de datos</p>

          <div className="mb-4 overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>{uploadInfo.columns.map(c => <th key={c.index} className="px-2 py-1 text-left font-medium text-slate-500">{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {uploadInfo.sampleRows.map((row, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    {row.map((cell, j) => <td key={j} className="px-2 py-1 text-slate-600">{cell ?? ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium text-slate-700">
              ¿Cuál columna tiene el código?
              <select value={codeColumnIndex} onChange={e => setCodeColumnIndex(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
                <option value="">Elegir...</option>
                {uploadInfo.columns.map(c => <option key={c.index} value={c.index}>{c.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              ¿Cuál columna tiene el precio?
              <select value={priceColumnIndex} onChange={e => setPriceColumnIndex(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
                <option value="">Elegir...</option>
                {uploadInfo.columns.map(c => <option key={c.index} value={c.index}>{c.label}</option>)}
              </select>
            </label>
            <label className="col-span-2 text-sm font-medium text-slate-700">
              ¿Cuál tiene el nombre? (opcional, solo de referencia)
              <select value={nameColumnIndex} onChange={e => setNameColumnIndex(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
                <option value="">Ninguna</option>
                {uploadInfo.columns.map(c => <option key={c.index} value={c.index}>{c.label}</option>)}
              </select>
            </label>
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={priceIncludesTax} onChange={e => setPriceIncludesTax(e.target.checked)} />
            El precio de esta lista ya incluye IVA
          </label>

          <div className="mt-4 flex gap-2">
            <button onClick={resetWizard} className="flex-1 rounded-md border border-slate-300 py-2 text-slate-600 hover:bg-slate-100">
              Volver a empezar
            </button>
            <button
              onClick={handlePreview}
              disabled={loading}
              className="flex-1 rounded-md bg-slate-900 py-2 font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? 'Procesando...' : 'Vista previa'}
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && preview && (
        <div>
          <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-slate-700">
              Se encontraron <strong>{preview.matchedRows}</strong> de <strong>{preview.totalRows}</strong> productos.{' '}
              <strong className="text-red-600">{preview.updatedRows}</strong> tienen cambio de precio.{' '}
              <strong>{preview.skippedRows}</strong> no se pudieron actualizar (no encontrados, en USD, o filas inválidas).
            </p>
          </div>

          <div className="mb-2 flex gap-1">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  activeTab === tab.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label} ({preview[tab.key].length})
              </button>
            ))}
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
                {preview[activeTab].map(row => (
                  <tr key={row.productCode} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{row.productCode}</td>
                    <td className="px-3 py-2 text-slate-500">{row.productName || '—'}</td>
                    <td className="px-3 py-2 text-right">{row.oldPrice != null ? money(row.oldPrice) : '—'}</td>
                    <td className="px-3 py-2 text-right">{money(row.newPrice)}</td>
                    <td className="px-3 py-2 text-right"><DiffCell oldPrice={row.oldPrice} newPrice={row.newPrice} /></td>
                  </tr>
                ))}
                {!preview[activeTab].length && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">Sin filas en esta pestaña (se muestran hasta 50).</td></tr>
                )}
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
              Aplicar cambios
            </button>
          </div>
        </div>
      )}

      {step === 'done' && applyResult && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
          <p className="mb-4 text-lg font-bold text-emerald-700">
            ✓ Se actualizaron {applyResult.updatedRows} precios correctamente
          </p>
          <button onClick={resetWizard} className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800">
            Nueva importación
          </button>
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
