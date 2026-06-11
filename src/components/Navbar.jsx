import { useState, useEffect } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import CartDrawer from './CartDrawer'
import FenixLogo from '../assets/FenixLogo'

const HEADER_BG = '#1C1208'
const HEADER_BORDER = 'rgba(255,255,255,0.07)'

const NAV_LINKS = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/products', label: 'Productos', end: false },
]

export default function Navbar() {
  const { totalItems } = useCart()
  const [cartOpen, setCartOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 10) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  return (
    <>
      <header
        className="sticky top-0 z-40 transition-shadow duration-300"
        style={{
          backgroundColor: HEADER_BG,
          borderBottom: `1px solid ${HEADER_BORDER}`,
          boxShadow: scrolled ? '0 4px 32px rgba(0,0,0,0.4)' : 'none',
        }}
      >
        <div className="relative w-full px-6 sm:px-10 h-[60px] flex items-center justify-between">

          {/* Left — ≡ Menú */}
          <button
            onClick={() => setMenuOpen(true)}
            className="flex items-center gap-2.5 transition-opacity duration-200"
            style={{ color: 'rgba(242,237,230,0.65)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(242,237,230,1)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(242,237,230,0.65)')}
            aria-label="Abrir menú"
            aria-expanded={menuOpen}
          >
            <HamburgerIcon />
            <span
              className="hidden sm:inline text-[11px] uppercase tracking-[0.18em] font-medium"
            >
              Menú
            </span>
          </button>

          {/* Center — logo (absolutely centered) */}
          <Link
            to="/"
            aria-label="Fénix — inicio"
            className="absolute left-1/2 -translate-x-1/2"
          >
            <FenixLogo onDark />
          </Link>

          {/* Right — cart */}
          <button
            onClick={() => setCartOpen(true)}
            className="relative p-2 transition-opacity duration-200"
            style={{ color: 'rgba(242,237,230,0.65)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(242,237,230,1)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(242,237,230,0.65)')}
            aria-label={`Carrito — ${totalItems} ${totalItems === 1 ? 'artículo' : 'artículos'}`}
          >
            <CartIcon />
            {totalItems > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full text-[11px] font-bold flex items-center justify-center px-1 leading-none"
                style={{ backgroundColor: '#CC0000', color: '#fff' }}
              >
                {totalItems > 99 ? '99+' : totalItems}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Menu drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Panel */}
          <aside
            className="absolute left-0 top-0 h-full w-72 flex flex-col"
            style={{ backgroundColor: HEADER_BG }}
            aria-label="Menú de navegación"
          >
            {/* Panel header */}
            <div
              className="flex items-center justify-between px-6 py-5"
              style={{ borderBottom: `1px solid ${HEADER_BORDER}` }}
            >
              <Link to="/" onClick={() => setMenuOpen(false)}>
                <FenixLogo onDark />
              </Link>
              <button
                onClick={() => setMenuOpen(false)}
                className="p-1.5 transition-opacity duration-200"
                style={{ color: 'rgba(242,237,230,0.50)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(242,237,230,1)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(242,237,230,0.50)')}
                aria-label="Cerrar menú"
              >
                <CloseIcon />
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex flex-col px-6 py-8 gap-1" aria-label="Navegación">
              {NAV_LINKS.map(({ to, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setMenuOpen(false)}
                  className="py-3 text-sm uppercase tracking-[0.18em] font-medium transition-opacity duration-200"
                  style={({ isActive }) => ({
                    color: isActive ? 'rgba(242,237,230,1)' : 'rgba(242,237,230,0.55)',
                    borderBottom: `1px solid ${HEADER_BORDER}`,
                  })}
                >
                  {label}
                </NavLink>
              ))}
              <a
                href="#contacto"
                onClick={() => setMenuOpen(false)}
                className="py-3 text-sm uppercase tracking-[0.18em] font-medium transition-opacity duration-200"
                style={{ color: 'rgba(242,237,230,0.55)', borderBottom: `1px solid ${HEADER_BORDER}` }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(242,237,230,1)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(242,237,230,0.55)')}
              >
                Contacto
              </a>
            </nav>
          </aside>
        </div>
      )}

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  )
}

function CartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 01-8 0" />
    </svg>
  )
}

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
