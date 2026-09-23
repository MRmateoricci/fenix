const METHODS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'qr', label: 'QR' },
]

const money = value => Number(value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })

// Modo simple: un solo medio, el monto siempre es el total (no se guarda un
// importe propio así nunca queda desincronizado si el ticket cambia después
// de elegir el medio). Modo mixto: cada fila lleva su propio importe y el
// vendedor tiene que hacerlos coincidir con el total a mano.
export default function PaymentSelector({ total, singleMethod, onSingleMethodChange, mixedPayments, onMixedPaymentsChange }) {
  const mixed = mixedPayments != null

  function toggleMixed() {
    if (mixed) onMixedPaymentsChange(null)
    else onMixedPaymentsChange([{ method: singleMethod, amount: total }, { method: 'debito', amount: 0 }])
  }

  function updateRow(index, patch) {
    onMixedPaymentsChange(mixedPayments.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  function addRow() {
    onMixedPaymentsChange([...mixedPayments, { method: 'debito', amount: 0 }])
  }

  function removeRow(index) {
    onMixedPaymentsChange(mixedPayments.filter((_, i) => i !== index))
  }

  const paidTotal = mixed ? mixedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) : total
  const matches = Math.abs(paidTotal - total) < 0.01

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">Medio de pago</span>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          <input type="checkbox" checked={mixed} onChange={toggleMixed} />
          Pago mixto
        </label>
      </div>

      {!mixed ? (
        <div className="grid grid-cols-5 gap-1.5">
          {METHODS.map(m => (
            <button
              key={m.value}
              type="button"
              onClick={() => onSingleMethodChange(m.value)}
              className={`rounded-md border px-1 py-2.5 text-xs font-medium ${
                singleMethod === m.value
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {mixedPayments.map((p, index) => (
            <div key={index} className="flex items-center gap-2">
              <select
                value={p.method}
                onChange={e => updateRow(index, { method: e.target.value })}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                {METHODS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                value={p.amount}
                onChange={e => updateRow(index, { amount: Number(e.target.value) })}
                className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-right text-sm"
              />
              {mixedPayments.length > 1 && (
                <button type="button" onClick={() => removeRow(index)} className="text-slate-400 hover:text-red-500">
                  ✕
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addRow} className="self-start text-xs text-slate-500 underline">
            + agregar medio
          </button>
          <p className={`text-xs font-medium ${matches ? 'text-emerald-600' : 'text-red-600'}`}>
            Pagado: {money(paidTotal)} / Total: {money(total)}
          </p>
        </div>
      )}
    </div>
  )
}
