import { useState } from 'react'
import { useCashRegister } from '../context/CashRegisterContext'

export default function CashMovementModal({ type, onClose }) {
  const { addMovement } = useCashRegister()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isIngreso = type === 'ingreso'

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const numericAmount = Number(amount)
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Ingresá un monto mayor a cero')
      return
    }
    if (!reason.trim()) {
      setError('El motivo es obligatorio')
      return
    }
    setSubmitting(true)
    try {
      await addMovement(type, numericAmount, reason.trim())
      onClose()
    } catch (err) {
      setError(err.message || 'No se pudo registrar el movimiento')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
      >
        <h2 className="mb-4 text-lg font-bold text-slate-800">
          Registrar {isIngreso ? 'ingreso' : 'egreso'}
        </h2>

        <label className="mb-1 block text-sm font-medium text-slate-700">Monto</label>
        <input
          autoFocus
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-lg focus:border-slate-500 focus:outline-none"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">Motivo</label>
        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder={isIngreso ? 'ej: cambio para el día' : 'ej: retiro para pagar proveedor'}
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
            type="submit"
            disabled={submitting}
            className={`flex-1 rounded-md py-2 font-semibold text-white disabled:opacity-50 ${
              isIngreso ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {submitting ? 'Guardando...' : 'Confirmar'}
          </button>
        </div>
      </form>
    </div>
  )
}
