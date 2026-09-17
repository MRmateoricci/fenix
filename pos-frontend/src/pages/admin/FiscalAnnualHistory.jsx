import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../services/api'

const money = value => Number(value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const STATUS_BADGE = {
  filed: { label: 'Presentado', className: 'bg-emerald-100 text-emerald-700' },
  overdue: { label: 'Vencido', className: 'bg-red-100 text-red-700' },
  pending: { label: 'Pendiente', className: 'bg-slate-100 text-slate-500' },
}

export default function FiscalAnnualHistory() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    api.getFiscalMonthlyHistory(year)
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [year])

  const maxAmount = data ? Math.max(1, ...data.months.flatMap(m => [m.debit, m.credit])) : 1

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/admin/panel-iva" className="text-sm text-slate-500 underline">‹ Volver al panel</Link>
          <h1 className="text-xl font-bold text-slate-800">Historial anual de IVA</h1>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1">
          <button onClick={() => setYear(y => y - 1)} className="px-1 text-slate-500 hover:text-slate-800">‹</button>
          <span className="min-w-[4rem] text-center text-sm font-medium text-slate-700">{year}</span>
          <button onClick={() => setYear(y => y + 1)} className="px-1 text-slate-500 hover:text-slate-800">›</button>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {loading || !data ? (
        <p className="text-slate-400">Cargando...</p>
      ) : (
        <div className="flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Mes</th>
                <th className="px-3 py-2">Débito / Crédito</th>
                <th className="px-3 py-2 text-right">Débito fiscal</th>
                <th className="px-3 py-2 text-right">Crédito fiscal</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2">Vencimiento</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map(m => {
                const badge = STATUS_BADGE[m.status] || STATUS_BADGE.pending
                return (
                  <tr key={m.month} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-700">{MONTH_NAMES[m.month - 1]}</td>
                    <td className="w-40 px-3 py-2">
                      <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className="h-2 bg-red-400" style={{ width: `${(m.debit / maxAmount) * 50}%` }} />
                        <div className="h-2 bg-emerald-400" style={{ width: `${(m.credit / maxAmount) * 50}%` }} />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">{money(m.debit)}</td>
                    <td className="px-3 py-2 text-right">{money(m.credit)}</td>
                    <td className={`px-3 py-2 text-right font-medium ${m.balance > 0.01 ? 'text-red-600' : m.balance < -0.01 ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {money(Math.abs(m.balance))}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {m.deadlineDate ? m.deadlineDate.split('-').reverse().join('/') : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-700">
                <td className="px-3 py-2" colSpan={2}>Total {year}</td>
                <td className="px-3 py-2 text-right">{money(data.totals.debit)}</td>
                <td className="px-3 py-2 text-right">{money(data.totals.credit)}</td>
                <td className={`px-3 py-2 text-right ${data.totals.balance > 0.01 ? 'text-red-600' : data.totals.balance < -0.01 ? 'text-emerald-600' : ''}`}>
                  {money(Math.abs(data.totals.balance))}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
