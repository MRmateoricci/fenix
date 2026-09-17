import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCashRegister } from '../context/CashRegisterContext'
import AfipStatusIndicator from './AfipStatusIndicator'
import VatDeadlineBanner from './VatDeadlineBanner'

const linkClass = ({ isActive }) =>
  `px-3 py-2 rounded-md text-sm font-medium ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
  }`

export default function Layout() {
  const { user, isAdmin, logout } = useAuth()
  const { loading: cashLoading, isOpen: cashOpen } = useCashRegister()

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-slate-800">POS Fénix</span>
          <nav className="ml-6 flex gap-1">
            <NavLink to="/" end className={linkClass}>Vender</NavLink>
            <NavLink to="/caja" className={linkClass}>
              <span className="inline-flex items-center gap-1.5">
                Caja
                {!cashLoading && (
                  <span
                    title={cashOpen ? 'Caja abierta' : 'Caja cerrada'}
                    className={`h-2 w-2 rounded-full ${cashOpen ? 'bg-emerald-500' : 'bg-red-400'}`}
                  />
                )}
              </span>
            </NavLink>
            <NavLink to="/ventas" className={linkClass}>Ventas</NavLink>
            {isAdmin && (
              <>
                <NavLink to="/caja/historial" className={linkClass}>Historial de caja</NavLink>
                <NavLink to="/proveedores" className={linkClass}>Proveedores</NavLink>
                <NavLink to="/admin/importar-precios" className={linkClass}>Importar precios</NavLink>
                <NavLink to="/admin/aumento-precios" className={linkClass}>Aumento de precios</NavLink>
                <NavLink to="/admin/usuarios" className={linkClass}>Usuarios</NavLink>
                <NavLink to="/admin/config" className={linkClass}>Configuración</NavLink>
                <NavLink to="/admin/panel-iva" className={linkClass}>Panel IVA</NavLink>
                <NavLink to="/admin/fiscal" className={linkClass}>AFIP</NavLink>
              </>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <AfipStatusIndicator />
          <span>{user?.name}</span>
          <button
            onClick={logout}
            className="rounded-md border border-slate-300 px-3 py-1 text-slate-600 hover:bg-slate-200"
          >
            Cerrar sesión
          </button>
        </div>
      </header>
      <VatDeadlineBanner isAdmin={isAdmin} />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
