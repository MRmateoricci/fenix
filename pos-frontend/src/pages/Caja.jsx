import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCashRegister } from '../context/CashRegisterContext'
import OpenCashRegisterForm from '../components/OpenCashRegisterForm'
import CashSummaryPanel from '../components/CashSummaryPanel'
import CashMovementModal from '../components/CashMovementModal'
import CloseCashRegisterModal from '../components/CloseCashRegisterModal'

export default function Caja() {
  const { cashRegister, loading, isOpen, refresh } = useCashRegister()
  const [movementType, setMovementType] = useState(null)
  const [closing, setClosing] = useState(false)
  const navigate = useNavigate()

  // El contexto solo se actualiza a sí mismo al abrir/cerrar/cargar un
  // movimiento — una venta hecha desde "Vender" no pasa por él. Sin este
  // refresh, entrar acá después de vender mostraba el resumen viejo (el de
  // la última acción de caja) en vez del real.
  useEffect(() => {
    refresh()
  }, [refresh])

  if (loading) return <p className="p-6 text-slate-400">Cargando...</p>
  // Igual que "/": si no hay caja abierta, esta pantalla tampoco es un
  // callejón sin salida — muestra el mismo formulario de apertura.
  if (!isOpen) return <OpenCashRegisterForm />

  return (
    <div className="mx-auto max-w-2xl overflow-y-auto p-6">
      <h1 className="mb-4 text-xl font-bold text-slate-800">Caja</h1>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setMovementType('ingreso')}
          className="rounded-md border border-emerald-600 px-4 py-2 font-medium text-emerald-700 hover:bg-emerald-50"
        >
          Registrar ingreso
        </button>
        <button
          onClick={() => setMovementType('egreso')}
          className="rounded-md border border-red-600 px-4 py-2 font-medium text-red-700 hover:bg-red-50"
        >
          Registrar egreso
        </button>
        <button
          onClick={() => setClosing(true)}
          className="ml-auto rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800"
        >
          Cerrar caja
        </button>
      </div>

      <CashSummaryPanel cashRegister={cashRegister} />

      {movementType && <CashMovementModal type={movementType} onClose={() => setMovementType(null)} />}
      {closing && (
        <CloseCashRegisterModal
          cashRegister={cashRegister}
          onClose={() => setClosing(false)}
          onClosed={() => {
            setClosing(false)
            // Vuelve a "/", que va a mostrar el formulario de apertura para
            // el turno/día siguiente apenas el contexto note la caja cerrada.
            navigate('/')
          }}
        />
      )}
    </div>
  )
}
