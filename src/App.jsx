import { BrowserRouter, Routes, Route, Outlet, useLocation } from 'react-router-dom'
import { CartProvider } from './context/CartContext'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import WhatsAppFAB from './components/WhatsAppFAB'
import Home from './pages/Home'
import Products from './pages/Products'
import ProductDetail from './pages/ProductDetail'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import OrderConfirmation from './pages/OrderConfirmation'

function PageShell({ name }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        color: 'var(--color-text-muted)',
        fontFamily: 'var(--font-sans)',
        fontSize: '14px',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}
    >
      {name}
    </div>
  )
}

function Layout() {
  const { pathname } = useLocation()
  return (
    <>
      <Navbar />
      <main style={pathname !== '/' ? { paddingTop: 68 } : undefined}>
        <Outlet />
      </main>
      <Footer />
      <WhatsAppFAB />
    </>
  )
}

export default function App() {
  return (
    <CartProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/products" element={<Products />} />
            <Route path="/products/:id" element={<ProductDetail />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/order-confirmation" element={<OrderConfirmation />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </CartProvider>
  )
}
