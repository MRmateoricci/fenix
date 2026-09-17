import { useState } from 'react'
import { api } from '../services/api'

const money = value => Number(value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
const todayISO = () => new Date().toLocaleDateString('en-CA')

const METHODS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'otro', label: 'Otro' },
]

export default function SupplierPaymentModal({ supplierId, supplierName, balance, onClose, onSaved }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('efectivo')
  const [reference, setReference] = useState('')
  const [date, setDate] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const numericAmount = Number(amount)
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Ingresá un monto mayor a cero')
      return
    }
    setSubmitting(true)
    try {
      const { payment } = await api.createSupplierPayment({
        supplierId, amount: numericAmount, method,
        reference: reference.trim() || undefined,
        date, notes: notes.trim() || undefined,
      })
      onSaved(payment)
    } catch (err) {
      setError(err.message || 'No se pudo registrar el pago')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
      >
        <h2 className="mb-1 text-lg font-bold text-slate-800">Registrar pago</h2>
        <p className="mb-1 text-sm text-slate-500">{supplierName}</p>
        <p className={`mb-4 text-sm font-medium ${balance > 0.01 ? 'text-red-600' : balance < -0.01 ? 'text-emerald-600' : 'text-slate-500'}`}>
          Saldo actual: {balance > 0.01 ? `le debemos ${money(balance)}` : balance < -0.01 ? `a favor ${money(-balance)}` : 'al día'}
        </p>

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

        <label className="mb-1 block text-sm font-medium text-slate-700">Medio de pago</label>
        <div className="mb-3 grid grid-cols-4 gap-1">
          {METHODS.map(m => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMethod(m.value)}
              className={`rounded-md border px-1 py-2 text-xs font-medium ${
                method === m.value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <label className="mb-1 block text-sm font-medium text-slate-700">Referencia (opcional)</label>
        <input
          value={reference}
          onChange={e => setReference(e.target.value)}
          placeholder="ej: nro de transferencia o cheque"
          className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">Fecha del pago</label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">Notas (opcional)</label>
        <input
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
        />

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-md border border-slate-300 py-2 text-slate-600 hover:bg-slate-100">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-md bg-slate-900 py-2 font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? 'Guardando...' : 'Registrar pago'}
          </button>
        </div>
      </form>
    </div>
  )
}
