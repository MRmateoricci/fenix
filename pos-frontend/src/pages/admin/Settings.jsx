import { useEffect, useState } from 'react'
import { api } from '../../services/api'

export default function Settings() {
  const [cashDiscountPercent, setCashDiscountPercent] = useState(10)
  const [installmentTiers, setInstallmentTiers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.getSettings()
      .then(s => {
        setCashDiscountPercent(s.cashDiscountPercent)
        setInstallmentTiers(s.installmentTiers)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  function addTier() {
    setInstallmentTiers(prev => [...prev, { installments: 3, surchargePercent: 0 }])
  }

  function updateTier(index, patch) {
    setInstallmentTiers(prev => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)))
  }

  function removeTier(index) {
    setInstallmentTiers(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    setSaved(false)
    try {
      const updated = await api.updateSettings({
        cashDiscountPercent: Number(cashDiscountPercent),
        installmentTiers: installmentTiers.map(t => ({
          installments: Number(t.installments),
          surchargePercent: Number(t.surchargePercent),
        })),
      })
      setCashDiscountPercent(updated.cashDiscountPercent)
      setInstallmentTiers(updated.installmentTiers)
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="p-6 text-slate-400">Cargando...</p>

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="mb-4 text-xl font-bold text-slate-800">Configuración del POS</h1>
      <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-4">
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Descuento por pago en efectivo (%)
        </label>
        <p className="mb-2 text-xs text-slate-400">
          Porcentaje que aplica el botón "Descuento efectivo" en la pantalla de venta.
        </p>
        <input
          type="number"
          min="0"
          max="99"
          step="0.1"
          value={cashDiscountPercent}
          onChange={e => setCashDiscountPercent(e.target.value)}
          className="mb-4 w-32 rounded-md border border-slate-300 px-2 py-1"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">
          Recargo por cuotas con tarjeta
        </label>
        <p className="mb-2 text-xs text-slate-400">
          Un tramo por cada cantidad de cuotas (ej: 1 pago sin recargo, 3 cuotas +15%, 6 cuotas
          +25%). Se usan de verdad al armar la venta — el vendedor los ve como precios
          cliqueables en el detalle del producto.
        </p>
        <div className="mb-2 flex flex-col gap-2">
          {installmentTiers.map((tier, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="60"
                value={tier.installments}
                onChange={e => updateTier(index, { installments: e.target.value })}
                className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              <span className="text-xs text-slate-500">cuotas, recargo</span>
              <input
                type="number"
                min="0"
                max="99"
                step="0.1"
                value={tier.surchargePercent}
                onChange={e => updateTier(index, { surchargePercent: e.target.value })}
                className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              <span className="text-xs text-slate-500">%</span>
              <button
                type="button"
                onClick={() => removeTier(index)}
                className="ml-auto text-slate-400 hover:text-red-500"
              >
                ✕
              </button>
            </div>
          ))}
          {installmentTiers.length === 0 && (
            <p className="text-xs text-slate-400">Sin tramos configurados — el modal no va a mostrar precios con tarjeta.</p>
          )}
        </div>
        <button
          type="button"
          onClick={addTier}
          className="mb-4 self-start text-xs text-slate-500 underline"
        >
          + agregar tramo de cuotas
        </button>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        {saved && <p className="mb-3 text-sm text-emerald-600">Guardado.</p>}
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-slate-900 px-4 py-1.5 font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </form>
    </div>
  )
}
