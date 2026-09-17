import { useState } from 'react'
import { useCashRegister } from '../context/CashRegisterContext'

export default function OpenCashRegisterForm() {
  const { open } = useCashRegister()
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const openingAmount = Number(amount)
    if (!Number.isFinite(openingAmount) || openingAmount < 0) {
      setError('Ingresá un monto válido')
      return
    }
    setSubmitting(true)
    try {
      await open(openingAmount)
    } catch (err) {
      setError(err.message || 'No se pudo abrir la caja')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-100">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-xl bg-white p-8 shadow-md">
        <h1 className="mb-1 text-center text-2xl font-bold text-slate-800">Caja cerrada</h1>
        <p className="mb-6 text-center text-sm text-slate-500">Abrí la caja para empezar a vender.</p>

        <label className="mb-1 block text-sm font-medium text-slate-700">Fondo de caja inicial</label>
        <input
          autoFocus
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="0"
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-lg focus:border-slate-500 focus:outline-none"
        />

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-slate-900 py-2 text-lg font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? 'Abriendo...' : 'Abrir caja'}
        </button>
      </form>
    </div>
  )
}
