import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { trackPageView } from './utils/analytics'
import { CartProvider } from './context/CartContext'
import { AdminProvider, useAdmin } from './context/AdminContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { FavoritesProvider } from './context/FavoritesContext'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import WhatsAppFAB from './components/WhatsAppFAB'
import AnnouncementBar from './components/AnnouncementBar'
import { PAGE_CONTENT_OFFSET } from './config/layout'
import Home from './pages/Home'
import Products from './pages/Products'
import EntregaInmediata from './pages/EntregaInmediata'
import ProductDetail from './pages/ProductDetail'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import OrderConfirmation from './pages/OrderConfirmation'
import OrderTracking from './pages/OrderTracking'
import AdminLogin from './pages/admin/AdminLogin'
import AdminDashboard from './pages/admin/AdminDashboard'
import Nosotros from './pages/Nosotros'
import FAQ from './pages/FAQ'
import Guias from './pages/Guias'
import Profesionales from './pages/Profesionales'
import Login from './pages/Login'
import Register from './pages/Register'
import Account from './pages/Account'
import Favorites from './pages/Favorites'
import Orders from './pages/Orders'
import VerifyEmail from './pages/VerifyEmail'
import Policy from './pages/Policy'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import OrderDetail from './pages/OrderDetail'

function MpReturnGuard() {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()

  useEffect(() => {
    const pendingId = sessionStorage.getItem('fenix_pending_order_id')
    if (!pendingId) return
    const params = new URLSearchParams(search)
    if (pathname === '/checkout' && params.get('payment') === 'failure') {
      // El retorno rechazado de MP pertenece al checkout. Evitamos que el
      // guard lo mande nuevamente a la pantalla de confirmación.
      sessionStorage.removeItem('fenix_pending_order_id')
      return
    }
    if (pathname === '/order-confirmation') return
    // El usuario volvió al sitio sin completar el pago (botón atrás del
    // navegador, cerró la pestaña de MP…). Con binary_mode un pago real nunca
    // queda "pendiente": si el pago hubiera resuelto, MP lo habría traído por
    // su propia back_url a /order-confirmation. Que esté acá significa intento
    // abandonado, así que lo mandamos al checkout con los datos precargados
    // para reintentar, en vez de dejarlo en una confirmación sin salida.
    navigate(`/checkout?payment=failure&orderId=${pendingId}`, { replace: true })
  }, [navigate, pathname, search])

  return null
}

function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}

// Registra cada visita de página de la tienda. Vive dentro de Layout, que no
// envuelve las rutas del panel, así que /admin nunca llega acá.
function TrackPageView() {
  const { pathname } = useLocation()

  useEffect(() => {
    trackPageView(pathname)
  }, [pathname])

  return null
}

function Layout() {
  const { pathname } = useLocation()
  // La ficha de producto ya tiene su propio botón "Consultar por WhatsApp" en el CTA;
  // el FAB flotante es redundante ahí y en mobile puede terminar tapando el título o
  // los botones apenas carga la página (es fixed, no scrollea con el contenido).
  const isProductDetail = /^\/products\/[^/]+$/.test(pathname)
  return (
    <>
      <ScrollToTop />
      <TrackPageView />
      <MpReturnGuard />
      <AnnouncementBar />
      <Navbar />
      <main style={pathname !== '/' ? { paddingTop: PAGE_CONTENT_OFFSET } : undefined}>
        <Outlet />
      </main>
      {pathname !== '/login' && <Footer />}
      {!isProductDetail && <WhatsAppFAB />}
    </>
  )
}

function PrivateRoute({ children }) {
  const { isAdmin, adminAuthLoading } = useAdmin()
  if (adminAuthLoading) return null
  return isAdmin ? children : <Navigate to="/admin/login" replace />
}

function PrivateCustomerRoute({ children }) {
  const { isAuthenticated, authLoading } = useAuth()
  if (authLoading) return null
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <AdminProvider>
      <AuthProvider>
        <FavoritesProvider>
          <CartProvider>
            <BrowserRouter>
              <Routes>
                {/* Admin routes (no Layout wrapper) */}
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route
                  path="/admin"
                  element={
                    <PrivateRoute>
                      <AdminDashboard />
                    </PrivateRoute>
                  }
                />

                {/* Public store routes */}
                <Route element={<Layout />}>
                  <Route path="/" element={<Home />} />
                  <Route path="/products" element={<Products />} />
                  <Route path="/entrega-inmediata" element={<EntregaInmediata />} />
                  {/* La ruta vieja quedó indexada aunque nunca se linkeó desde
                      el sitio. Redirige en vez de tirar 404. */}
                  <Route path="/productos-a-pedido" element={<Navigate to="/entrega-inmediata" replace />} />
                  <Route path="/products/:id" element={<ProductDetail />} />
                  <Route path="/cart" element={<Cart />} />
                  <Route path="/checkout" element={<Checkout />} />
                  <Route path="/order-confirmation" element={<OrderConfirmation />} />
                  <Route path="/track-order" element={<OrderTracking />} />
                  <Route path="/nosotros" element={<Nosotros />} />
                  <Route path="/faq" element={<FAQ />} />
                  <Route path="/guias" element={<Guias />} />
                  <Route path="/profesionales" element={<Profesionales />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/verify-email" element={<VerifyEmail />} />
                  <Route path="/policies/:slug" element={<Policy />} />
                  <Route
                    path="/account"
                    element={
                      <PrivateCustomerRoute>
                        <Account />
                      </PrivateCustomerRoute>
                    }
                  />
                  <Route
                    path="/favorites"
                    element={
                      <PrivateCustomerRoute>
                        <Favorites />
                      </PrivateCustomerRoute>
                    }
                  />
                  <Route
                    path="/orders"
                    element={
                      <PrivateCustomerRoute>
                        <Orders />
                      </PrivateCustomerRoute>
                    }
                  />
                  <Route
                    path="/orders/:id"
                    element={
                      <PrivateCustomerRoute>
                        <OrderDetail />
                      </PrivateCustomerRoute>
                    }
                  />
                </Route>
              </Routes>
            </BrowserRouter>
          </CartProvider>
        </FavoritesProvider>
      </AuthProvider>
    </AdminProvider>
  )
}

export { PrivateCustomerRoute }
