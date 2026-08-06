import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { CartProvider } from './context/CartContext'
import { AdminProvider, useAdmin } from './context/AdminContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { FavoritesProvider } from './context/FavoritesContext'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import WhatsAppFAB from './components/WhatsAppFAB'
import Home from './pages/Home'
import Products from './pages/Products'
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
    if (pathname === '/order-confirmation') return
    // Si el usuario volvió al sitio sin pasar por la página de confirmación
    // (por ejemplo, cerró la pestaña de MP y abrió el sitio de nuevo),
    // lo redirigimos a la confirmación para que vea el estado real.
    navigate(`/order-confirmation?orderId=${pendingId}&status=pending`, { replace: true })
  }, [])

  return null
}

function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}

function Layout() {
  const { pathname } = useLocation()
  return (
    <>
      <ScrollToTop />
      <MpReturnGuard />
      <Navbar />
      <main style={pathname !== '/' ? { paddingTop: 68 } : undefined}>
        <Outlet />
      </main>
      {pathname !== '/login' && <Footer />}
      <WhatsAppFAB />
    </>
  )
}

function PrivateRoute({ children }) {
  const { isAdmin } = useAdmin()
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
