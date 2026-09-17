import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { CatalogProvider } from './hooks/useProductCatalog'
import { CashRegisterProvider, useCashRegister } from './context/CashRegisterContext'
import OpenCashRegisterForm from './components/OpenCashRegisterForm'
import Layout from './components/Layout'
import Login from './pages/Login'
import POS from './pages/POS'
import Sales from './pages/Sales'
import Caja from './pages/Caja'
import Users from './pages/admin/Users'
import Settings from './pages/admin/Settings'
import CashHistory from './pages/admin/CashHistory'
import Suppliers from './pages/Suppliers'
import SupplierDetail from './pages/SupplierDetail'
import NewPurchase from './pages/NewPurchase'
import PriceImport from './pages/admin/PriceImport'
import BulkPriceIncrease from './pages/admin/BulkPriceIncrease'
import PriceImportHistory from './pages/admin/PriceImportHistory'
import FiscalStatus from './pages/admin/FiscalStatus'
import FiscalPanel from './pages/admin/FiscalPanel'
import FiscalAnnualHistory from './pages/admin/FiscalAnnualHistory'

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenMessage text="Cargando..." />
  if (!user) return <Navigate to="/login" replace />
  return children
}

function RequireAdmin({ children }) {
  const { isAdmin } = useAuth()
  if (!isAdmin) return <Navigate to="/" replace />
  return children
}

// Vender exige caja abierta (Fase 2): sin esto, cualquier venta quedaría sin
// asociar a un turno de caja y "efectivo esperado" nunca cerraría. El resto
// de las pantallas (Ventas, Caja, Admin) siguen accesibles igual para poder
// revisar historial o abrir la caja desde /caja.
function RequireOpenCashRegister({ children }) {
  const { loading, isOpen } = useCashRegister()
  if (loading) return <FullScreenMessage text="Cargando..." />
  if (!isOpen) return <OpenCashRegisterForm />
  return children
}

function FullScreenMessage({ text }) {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-100 text-slate-500 text-lg">
      {text}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <RequireAuth>
                <CashRegisterProvider>
                  <CatalogProvider>
                    <Layout />
                  </CatalogProvider>
                </CashRegisterProvider>
              </RequireAuth>
            }
          >
            <Route
              index
              element={
                <RequireOpenCashRegister>
                  <POS />
                </RequireOpenCashRegister>
              }
            />
            <Route path="ventas" element={<Sales />} />
            <Route path="caja" element={<Caja />} />
            <Route
              path="caja/historial"
              element={
                <RequireAdmin>
                  <CashHistory />
                </RequireAdmin>
              }
            />
            <Route
              path="admin/usuarios"
              element={
                <RequireAdmin>
                  <Users />
                </RequireAdmin>
              }
            />
            <Route
              path="admin/config"
              element={
                <RequireAdmin>
                  <Settings />
                </RequireAdmin>
              }
            />
            <Route
              path="proveedores"
              element={
                <RequireAdmin>
                  <Suppliers />
                </RequireAdmin>
              }
            />
            <Route
              path="proveedores/:id"
              element={
                <RequireAdmin>
                  <SupplierDetail />
                </RequireAdmin>
              }
            />
            <Route
              path="proveedores/:id/nueva-compra"
              element={
                <RequireAdmin>
                  <NewPurchase />
                </RequireAdmin>
              }
            />
            <Route
              path="admin/importar-precios"
              element={
                <RequireAdmin>
                  <PriceImport />
                </RequireAdmin>
              }
            />
            <Route
              path="admin/importar-precios/historial"
              element={
                <RequireAdmin>
                  <PriceImportHistory />
                </RequireAdmin>
              }
            />
            <Route
              path="admin/aumento-precios"
              element={
                <RequireAdmin>
                  <BulkPriceIncrease />
                </RequireAdmin>
              }
            />
            <Route
              path="admin/fiscal"
              element={
                <RequireAdmin>
                  <FiscalStatus />
                </RequireAdmin>
              }
            />
            <Route
              path="admin/panel-iva"
              element={
                <RequireAdmin>
                  <FiscalPanel />
                </RequireAdmin>
              }
            />
            <Route
              path="admin/panel-iva/anual"
              element={
                <RequireAdmin>
                  <FiscalAnnualHistory />
                </RequireAdmin>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
