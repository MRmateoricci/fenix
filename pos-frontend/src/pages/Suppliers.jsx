import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import SupplierForm from '../components/SupplierForm'

const money = value => Number(value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })

function balanceLabel(balance) {
  if (balance > 0.01) return { text: `Le debemos ${money(balance)}`, className: 'text-red-600' }
  if (balance < -0.01) return { text: `A favor ${money(-balance)}`, className: 'text-emerald-600' }
  return { text: 'Al día', className: 'text-slate-400' }
}

export default function Suppliers() {
  const [search, setSearch] = useState('')
  const [suppliers, setSuppliers] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  function load() {
    setLoading(true)
    setError('')
    Promise.all([api.listSuppliers({ search }), api.getSuppliersSummary()])
      .then(([listRes, summaryRes]) => {
        setSuppliers(listRes.suppliers)
        setSummary(summaryRes)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const id = setTimeout(load, 250)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  return (
    <div className="mx-auto max-w-4xl overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Proveedores</h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800"
        >
          Nuevo proveedor
        </button>
      </div>

      {summary && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">Total que debemos</p>
            <p className="text-lg font-bold text-red-600">{money(summary.totalDebt)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">Proveedores con deuda</p>
            <p className="text-lg font-bold text-slate-800">{summary.suppliersWithDebtCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="mb-1 text-xs text-slate-500">Mayor deuda</p>
            {summary.top5.length ? (
              <ul className="text-sm text-slate-700">
                {summary.top5.slice(0, 3).map(s => (
                  <li key={s.id} className="truncate">{s.name}: {money(s.balance)}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">Sin deudas</p>
            )}
          </div>
        </div>
      )}

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Buscar por nombre..."
        className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-slate-400">Cargando...</p>
      ) : (
        <table className="w-full rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Teléfono</th>
              <th className="px-3 py-2 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map(s => {
              const label = balanceLabel(s.balance)
              return (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Link to={`/proveedores/${s.id}`} className="font-medium text-slate-800 hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{s.phone || '—'}</td>
                  <td className={`px-3 py-2 text-right font-medium ${label.className}`}>{label.text}</td>
                </tr>
              )
            })}
            {!suppliers.length && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-slate-400">Sin proveedores.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showForm && (
        <SupplierForm
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
        />
      )}
    </div>
  )
}
