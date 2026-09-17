import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../services/api'

const dateTime = value => new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })

const STATUS_LABELS = { preview: 'En preview', applied: 'Aplicada', cancelled: 'Cancelada' }
const STATUS_CLASS = { preview: 'text-amber-600', applied: 'text-emerald-600', cancelled: 'text-slate-400' }

export default function PriceImportHistory() {
  const [imports, setImports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.listPriceImports()
      .then(res => setImports(res.imports))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-4xl overflow-y-auto p-6">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-bold text-slate-800">Historial de importaciones</h1>
        <Link to="/admin/importar-precios" className="text-sm text-slate-500 underline">← Nueva importación</Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-slate-400">Cargando...</p>
      ) : (
        <table className="w-full rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Quién</th>
              <th className="px-3 py-2">Origen</th>
              <th className="px-3 py-2">Proveedor</th>
              <th className="px-3 py-2 text-right">Actualizados</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {imports.map(imp => (
              <tr key={imp.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{dateTime(imp.createdAt)}</td>
                <td className="px-3 py-2">{imp.userName}</td>
                <td className="px-3 py-2">{imp.kind === 'bulk_increase' ? 'Aumento %' : imp.filename}</td>
                <td className="px-3 py-2">{imp.supplierName || '—'}</td>
                <td className="px-3 py-2 text-right font-medium">{imp.updatedRows} / {imp.totalRows}</td>
                <td className={`px-3 py-2 font-medium ${STATUS_CLASS[imp.status]}`}>{STATUS_LABELS[imp.status]}</td>
              </tr>
            ))}
            {!imports.length && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Todavía no hay importaciones.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}
