import { useState } from 'react'
import { useCashRegister } from '../context/CashRegisterContext'
import CashSummaryPanel from './CashSummaryPanel'

const money = value => Number(value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })

export default function CloseCashRegisterModal({ cashRegister, onClose, onClosed }) {
  const { close } = useCashRegister()
  const [actualCash, setActualCash] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const numericActual = Number(actualCash)
  const hasValidAmount = actualCash !== '' && Number.isFinite(numericActual) && numericActual >= 0
  const difference = hasValidAmount ? Math.round((numericActual - cashRegister.expectedCash) * 100) / 100 : null

  async function handleConfirm() {
    setError('')
    if (!hasValidAmount) {
      setError('Ingresá el efectivo contado')
      return
    }
    setSubmitting(true)
    try {
      const closed = await close(numericActual, notes.trim() || undefined)
      onClosed(closed)
    } catch (err) {
      setError(err.message || 'No se pudo cerrar la caja')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-full w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-bold text-slate-800">Cerrar caja</h2>

        <CashSummaryPanel cashRegister={cashRegister} showTimeline={false} />

        <label className="mb-1 mt-4 block text-sm font-medium text-slate-700">Efectivo real contado</label>
        <input
          autoFocus
          type="number"
          min="0"
          step="0.01"
          value={actualCash}
          onChange={e => setActualCash(e.target.value)}
          className="mb-2 w-full rounded-md border border-slate-300 px-3 py-2 text-lg focus:border-slate-500 focus:outline-none"
        />

        {difference != null && (
          <p className={`mb-3 text-center text-lg font-bold ${
            Math.abs(difference) < 0.01 ? 'text-emerald-600' : difference > 0 ? 'text-blue-600' : 'text-red-600'
          }`}>
            {Math.abs(difference) < 0.01
              ? '✓ Caja cuadrada'
              : difference > 0
              ? `⚠ Diferencia: +${money(difference)} (sobra)`
              : `⚠ Diferencia: ${money(difference)} (falta)`}
          </p>
        )}

        <label className="mb-1 block text-sm font-medium text-slate-700">Nota (opcional)</label>
        <input
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="ej: faltaron $500, se cayeron atrás del mostrador"
          className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
        />

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-md border border-slate-300 py-2 text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="flex-1 rounded-md bg-slate-900 py-2 font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? 'Cerrando...' : 'Confirmar cierre'}
          </button>
        </div>
      </div>
    </div>
  )
}
