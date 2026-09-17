import { useEffect, useState } from 'react'
import { api } from '../services/api'

// Datos del receptor de la factura. El vendedor elige la CONDICIÓN del
// cliente (Consumidor Final, Responsable Inscripto, Monotributo...); el tipo
// de comprobante (A/B/C) lo deriva el backend a partir de eso — nunca se
// elige "Factura A/B/C" directamente, para no poder armar una combinación que
// ARCA rechazaría (ver invoiceFiscal.js#determineVoucherType, el mismo que
// ya usa el checkout de la web).
export default function InvoiceFields({ value, onChange }) {
  const [options, setOptions] = useState(null)
  const [error, setError] = useState('')
  const [looking, setLooking] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.getInvoicingOptions()
      .then(opts => {
        if (cancelled) return
        setOptions(opts)
        if (!value.vatConditionId) {
          const consumerFinal = opts.vatConditions.find(c => c.category === 'consumer_final')
          const initial = consumerFinal || opts.vatConditions[0]
          if (initial) {
            onChange({
              vatConditionId: initial.id,
              docType: initial.allowedDocumentTypeIds[0] ?? 99,
              docNumber: '0',
              customerName: '',
            })
          }
        }
      })
      .catch(err => setError(err.message))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) {
    return <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</p>
  }
  if (!options) return <p className="text-sm text-slate-400">Cargando datos fiscales...</p>

  const selectedCondition = options.vatConditions.find(c => c.id === Number(value.vatConditionId))
  const allowedDocs = options.documents.filter(d => selectedCondition?.allowedDocumentTypeIds.includes(d.id))
  const requiresCuit = selectedCondition?.category === 'registered' || selectedCondition?.category === 'monotributo'
  const noDocument = Number(value.docType) === 99

  function handleConditionChange(id) {
    const condition = options.vatConditions.find(c => c.id === Number(id))
    if (!condition) return
    onChange({
      ...value,
      vatConditionId: condition.id,
      docType: condition.allowedDocumentTypeIds[0] ?? 99,
      docNumber: (condition.allowedDocumentTypeIds[0] ?? 99) === 99 ? '0' : '',
    })
  }

  async function handleCuitLookup() {
    setLooking(true)
    setError('')
    try {
      const profile = await api.cuitLookup(value.docNumber)
      onChange({ ...value, customerName: profile.name || value.customerName })
    } catch (err) {
      setError(err.message)
    } finally {
      setLooking(false)
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <label className="mb-2 block text-sm font-medium text-slate-700">
        Condición del cliente
        <select
          value={value.vatConditionId || ''}
          onChange={e => handleConditionChange(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        >
          {options.vatConditions.map(c => (
            <option key={c.id} value={c.id}>{c.description}</option>
          ))}
        </select>
      </label>

      {selectedCondition && (
        <>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <label className="text-sm font-medium text-slate-700">
              Documento
              <select
                value={value.docType || ''}
                onChange={e => onChange({ ...value, docType: Number(e.target.value), docNumber: Number(e.target.value) === 99 ? '0' : '' })}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
              >
                {allowedDocs.map(d => (
                  <option key={d.id} value={d.id}>{d.description}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Número {requiresCuit && '(CUIT)'}
              <div className="mt-1 flex gap-1">
                <input
                  value={value.docNumber || ''}
                  onChange={e => onChange({ ...value, docNumber: e.target.value })}
                  disabled={noDocument}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 disabled:bg-slate-100"
                />
                {Number(value.docType) === 80 && (
                  <button
                    type="button"
                    onClick={handleCuitLookup}
                    disabled={looking || !value.docNumber}
                    className="whitespace-nowrap rounded-md border border-slate-300 px-2 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                  >
                    {looking ? '...' : 'Buscar'}
                  </button>
                )}
              </div>
            </label>
          </div>
          <label className="text-sm font-medium text-slate-700">
            Nombre / Razón social {requiresCuit && '(obligatorio)'}
            <input
              value={value.customerName || ''}
              onChange={e => onChange({ ...value, customerName: e.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
            />
          </label>
        </>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
