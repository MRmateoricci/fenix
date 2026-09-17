import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../services/api'
import SupplierForm from '../components/SupplierForm'
import SupplierPaymentModal from '../components/SupplierPaymentModal'

const money = value => Number(value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
const dateOnly = value => new Date(value).toLocaleDateString('es-AR')

export default function SupplierDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [supplier, setSupplier] = useState(null)
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState(false)

  function load() {
    setLoading(true)
    setError('')
    Promise.all([api.getSupplier(id), api.getSupplierMovements(id)])
      .then(([supplierRes, movementsRes]) => {
        setSupplier(supplierRes.supplier)
        setMovements(movementsRes.movements)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [id])

  if (loading) return <p className="p-6 text-slate-400">Cargando...</p>
  if (error) return <p className="p-6 text-red-600">{error}</p>
  if (!supplier) return null

  const balance = supplier.balance
  const balanceLabel =
    balance > 0.01 ? { text: `Le debemos ${money(balance)}`, className: 'text-red-600' }
    : balance < -0.01 ? { text: `A favor ${money(-balance)}`, className: 'text-emerald-600' }
    : { text: 'Al día', className: 'text-slate-500' }

  return (
    <div className="mx-auto max-w-3xl overflow-y-auto p-6">
      <Link to="/proveedores" className="mb-3 inline-block text-sm text-slate-500 hover:underline">← Proveedores</Link>

      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{supplier.name}</h1>
            {supplier.legalName && <p className="text-sm text-slate-500">{supplier.legalName}</p>}
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-600">
              {supplier.cuit && <p>CUIT: {supplier.cuit}</p>}
              {supplier.phone && <p>Tel: {supplier.phone}</p>}
              {supplier.email && <p>Email: {supplier.email}</p>}
              {supplier.contactName && <p>Contacto: {supplier.contactName}</p>}
            </div>
            {supplier.notes && <p className="mt-2 text-sm italic text-slate-500">"{supplier.notes}"</p>}
          </div>
          <button onClick={() => setEditing(true)} className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100">
            Editar
          </button>
        </div>

        <div className={`mt-4 rounded-lg border-2 border-slate-900 bg-slate-50 p-3 text-center text-xl font-bold ${balanceLabel.className}`}>
          {balanceLabel.text}
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={() => navigate(`/proveedores/${id}/nueva-compra`)}
            className="flex-1 rounded-md bg-slate-900 py-2 font-medium text-white hover:bg-slate-800"
          >
            Registrar compra
          </button>
          <button
            onClick={() => setPaying(true)}
            className="flex-1 rounded-md border border-slate-900 py-2 font-medium text-slate-900 hover:bg-slate-100"
          >
            Registrar pago
          </button>
        </div>
      </div>

      <h2 className="mb-2 text-lg font-bold text-slate-800">Movimientos</h2>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Detalle</th>
              <th className="px-3 py-2 text-right">Debe</th>
              <th className="px-3 py-2 text-right">Haber</th>
              <th className="px-3 py-2 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {movements.map(m => (
              <tr key={`${m.kind}-${m.id}`} className="border-t border-slate-100">
                <td className="px-3 py-2">{dateOnly(m.date)}</td>
                <td className="px-3 py-2">{m.kind === 'purchase' ? 'Compra' : 'Pago'}</td>
                <td className="px-3 py-2">{m.detail}</td>
                <td className="px-3 py-2 text-right">{m.debe > 0 ? money(m.debe) : ''}</td>
                <td className="px-3 py-2 text-right">{m.haber > 0 ? money(m.haber) : ''}</td>
                <td className="px-3 py-2 text-right font-medium">{money(m.runningBalance)}</td>
              </tr>
            ))}
            {!movements.length && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-400">Todavía no hay movimientos.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <SupplierForm
          supplier={supplier}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load() }}
        />
      )}
      {paying && (
        <SupplierPaymentModal
          supplierId={supplier.id}
          supplierName={supplier.name}
          balance={balance}
          onClose={() => setPaying(false)}
          onSaved={() => { setPaying(false); load() }}
        />
      )}
    </div>
  )
}
