import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import CashSummaryPanel from '../../components/CashSummaryPanel'

const money = value => Number(value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
const dateTime = value => new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })

export default function CashHistory() {
  const [date, setDate] = useState('')
  const [registers, setRegisters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError('')
    api.getCashHistory({ date })
      .then(res => setRegisters(res.registers))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [date])

  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    api.getCashDetail(selectedId).then(res => setDetail(res.cashRegister)).catch(() => setDetail(null))
  }, [selectedId])

  return (
    <div className="grid h-full grid-cols-[1fr_420px] gap-4 overflow-hidden p-4">
      <div className="flex flex-col overflow-hidden">
        <div className="mb-3 flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-800">Historial de caja</h1>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          {date && (
            <button onClick={() => setDate('')} className="text-xs text-slate-500 underline">
              limpiar filtro
            </button>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading ? (
          <p className="text-slate-400">Cargando...</p>
        ) : (
          <div className="flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2">Cerrada</th>
                  <th className="px-3 py-2">Abrió</th>
                  <th className="px-3 py-2">Cerró</th>
                  <th className="px-3 py-2 text-right">Total vendido</th>
                  <th className="px-3 py-2 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {registers.map(r => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${
                      selectedId === r.id ? 'bg-slate-100' : ''
                    }`}
                  >
                    <td className="px-3 py-2">{dateTime(r.closedAt)}</td>
                    <td className="px-3 py-2">{r.openedByName}</td>
                    <td className="px-3 py-2">{r.closedByName}</td>
                    <td className="px-3 py-2 text-right font-medium">{money(r.totalSalesAmount)}</td>
                    <td className={`px-3 py-2 text-right font-medium ${
                      Math.abs(r.cashDifference) < 0.01 ? 'text-emerald-600' : 'text-red-600'
                    }`}>
                      {money(r.cashDifference)}
                    </td>
                  </tr>
                ))}
                {!registers.length && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                      Sin cajas cerradas ese día.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="overflow-y-auto rounded-lg border border-slate-200 bg-white p-4">
        {!detail ? (
          <p className="text-sm text-slate-400">Elegí una caja para ver el detalle.</p>
        ) : (
          <CashSummaryPanel cashRegister={detail} />
        )}
      </div>
    </div>
  )
}
