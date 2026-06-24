import { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import CartDrawer from './CartDrawer'
import FenixLogo from '../assets/FenixLogo'

const NAV_ITEMS = [
  {
    label: 'Interior',
    to: '/products?category=Iluminación Interior',
    sub: [
      { label: 'Colgantes',          to: '/products?category=Iluminación Interior&sub=Colgantes' },
      { label: 'Plafones',           to: '/products?category=Iluminación Interior&sub=Plafones' },
      { label: 'Apliques de pared',  to: '/products?category=Iluminación Interior&sub=Apliques de pared' },
      { label: 'Lámparas de pie',    to: '/products?category=Iluminación Interior&sub=Lámparas de pie' },
      { label: 'Rieles',             to: '/products?category=Iluminación Interior&sub=Rieles' },
      { label: 'Spots embutidos',    to: '/products?category=Iluminación Interior&sub=Spots embutidos' },
      { label: 'Perfiles LED',       to: '/products?category=Iluminación Interior&sub=Perfiles LED' },
      { label: 'Veladores',          to: '/products?category=Iluminación Interior&sub=Veladores' },
    ],
  },
  {
    label: 'Exterior',
    to: '/products?category=Iluminación Exterior',
    sub: [
      { label: 'Farolas',            to: '/products?category=Iluminación Exterior&sub=Farolas' },
      { label: 'Apliques exteriores',to: '/products?category=Iluminación Exterior&sub=Apliques exteriores' },
      { label: 'Reflectores',        to: '/products?category=Iluminación Exterior&sub=Reflectores' },
      { label: 'Jardín',             to: '/products?category=Iluminación Exterior&sub=Jardín' },
      { label: 'Bollards',           to: '/products?category=Iluminación Exterior&sub=Bollards' },
      { label: 'Techo exterior',     to: '/products?category=Iluminación Exterior&sub=Techo exterior' },
    ],
  },
  {
    label: 'Tiras LED',
    to: '/products?category=Tiras LED',
    sub: [
      { label: 'RGB',                    to: '/products?category=Tiras LED&sub=RGB' },
      { label: 'Blanco cálido',          to: '/products?category=Tiras LED&sub=Blanco cálido' },
      { label: 'RGBW WiFi',              to: '/products?category=Tiras LED&sub=RGBW WiFi' },
      { label: 'Perfiles aluminio',      to: '/products?category=Tiras LED&sub=Perfiles aluminio' },
      { label: 'Fuentes de alimentación',to: '/products?category=Tiras LED&sub=Fuentes de alimentación' },
      { label: 'Accesorios',             to: '/products?category=Tiras LED&sub=Accesorios' },
    ],
  },
  {
    label: 'Electricidad',
    to: '/products?category=Electricidad',
    sub: [
      { label: 'Tomacorrientes', to: '/products?category=Electricidad&sub=Tomacorrientes' },
      { label: 'Interruptores',  to: '/products?category=Electricidad&sub=Interruptores' },
      { label: 'Dimmers',        to: '/products?category=Electricidad&sub=Dimmers' },
      { label: 'Disyuntores',    to: '/products?category=Electricidad&sub=Disyuntores' },
      { label: 'Cables',         to: '/products?category=Electricidad&sub=Cables' },
      { label: 'Tableros',       to: '/products?category=Electricidad&sub=Tableros' },
    ],
  },
  { label: 'Ventiladores', to: '/products?category=Ventiladores de techo' },
  { label: 'Contacto',     hash: 'contacto' },
  { label: 'La casa',      hash: 'historia'  },
]

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

export default function Navbar() {
  const { totalItems } = useCart()
  const [cartOpen,   setCartOpen]   = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled,   setScrolled]   = useState(false)
  const [activeMenu, setActiveMenu] = useState(null)
  const closeTimer = useRef(null)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isHome = pathname === '/'

  const [introReady, setIntroReady] = useState(() => {
    if (typeof window === 'undefined') return true
    if (window.location.pathname !== '/') return true
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    if (introReady) return
    const handler = () => setIntroReady(true)
    document.addEventListener('fnx-intro-done', handler, { once: true })
    return () => document.removeEventListener('fnx-intro-done', handler)
  }, [introReady])

  useEffect(() => {
    if (!isHome) { setScrolled(true); return }
    const check = () => setScrolled(window.scrollY > window.innerHeight * 0.82)
    check()
    window.addEventListener('scroll', check, { passive: true })
    return () => window.removeEventListener('scroll', check)
  }, [isHome])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  function handleLink(item, e) {
    e.preventDefault()
    setMobileOpen(false)
    setActiveMenu(null)
    clearTimeout(closeTimer.current)
    if (item.to) navigate(item.to)
    else if (isHome) setTimeout(() => scrollTo(item.hash), 60)
    else { navigate('/'); setTimeout(() => scrollTo(item.hash), 420) }
  }

  function openMenu(label) {
    clearTimeout(closeTimer.current)
    setActiveMenu(label)
  }

  function scheduleClose() {
    closeTimer.current = setTimeout(() => setActiveMenu(null), 160)
  }

  function cancelClose() {
    clearTimeout(closeTimer.current)
  }

  const opaque = scrolled || activeMenu !== null
  const ink    = opaque ? '#16110B' : '#F2EBDC'
  const activeItem = NAV_ITEMS.find(i => i.label === activeMenu)

  return (
    <>
      {/* ── Navbar bar ──────────────────────────────────────────────────────── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        height: 64,
        transition: 'background .3s ease, border-color .3s ease, opacity 0.6s ease',
        background: opaque ? 'rgba(247,244,239,0.96)' : 'transparent',
        backdropFilter: opaque ? 'blur(12px)' : 'none',
        WebkitBackdropFilter: opaque ? 'blur(12px)' : 'none',
        borderBottom: `1px solid ${opaque ? '#DED6C7' : 'transparent'}`,
        color: ink,
        opacity: introReady ? 1 : 0,
      }}>
        <div style={{
          padding: '0 24px', height: '100%',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          {/* ── Left: Logo + nav links ────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 44 }}>
            <Link to="/" style={{ textDecoration: 'none', flexShrink: 0 }}>
              <FenixLogo onDark={!opaque} />
            </Link>

            <nav className="fnx-desktop-nav" aria-label="Categorías" style={{
              display: 'flex', alignItems: 'center', gap: 28,
            }}>
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.label}
                  href={item.to || `#${item.hash}`}
                  onClick={(e) => handleLink(item, e)}
                  onMouseEnter={() => item.sub ? openMenu(item.label) : (clearTimeout(closeTimer.current), setActiveMenu(null))}
                  onMouseLeave={() => item.sub ? scheduleClose() : null}
                  style={{
                    textDecoration: 'none',
                    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
                    fontSize: 13.5, fontWeight: 400,
                    color: ink,
                    opacity: activeMenu && activeMenu !== item.label ? 0.45 : 0.82,
                    transition: 'opacity .18s ease, color .3s ease',
                    whiteSpace: 'nowrap',
                    paddingBottom: 3,
                    borderBottom: `1px solid ${activeMenu === item.label ? ink : 'transparent'}`,
                  }}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>

          {/* ── Right: Search + icons ─────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {/* Underline search */}
            <div className="fnx-desktop-nav" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="search"
                placeholder="Buscar"
                style={{
                  background: 'transparent', border: 'none', outline: 'none',
                  borderBottom: `1px solid ${opaque ? 'rgba(22,17,11,0.3)' : 'rgba(242,235,220,0.4)'}`,
                  width: 140, padding: '4px 26px 4px 0',
                  fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
                  fontSize: 13.5, color: ink,
                  transition: 'border-color .2s, color .3s',
                }}
                onFocus={(e) => (e.currentTarget.style.borderBottomColor = ink)}
                onBlur={(e)  => (e.currentTarget.style.borderBottomColor = opaque ? 'rgba(22,17,11,0.3)' : 'rgba(242,235,220,0.4)')}
              />
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={ink} strokeWidth="1.6" strokeLinecap="round"
                style={{ position: 'absolute', right: 0, opacity: 0.7, pointerEvents: 'none' }}>
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.4-3.4" />
              </svg>
            </div>

            {/* User icon */}
            <button className="fnx-desktop-nav"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: ink, display: 'flex', opacity: 0.8, transition: 'opacity .15s, color .3s' }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.8')}
              aria-label="Mi cuenta"
            >
              <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="8" r="3.4" />
                <path d="M5.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
              </svg>
            </button>

            <CartButton totalItems={totalItems} onClick={() => setCartOpen(true)} ink={ink} />

            {/* Mobile hamburger */}
            <button
              className="fnx-hamburger"
              onClick={() => setMobileOpen(true)}
              style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', color: ink, padding: 4 }}
              aria-label="Abrir menú"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M3 7h18M3 12h18M3 17h18" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* ── Dropdown panel ──────────────────────────────────────────────────── */}
      {activeMenu && activeItem?.sub && (
        <div
          role="menu"
          style={{
            position: 'fixed', top: 64, left: 0, right: 0, zIndex: 49,
            background: '#FBF8F3',
            borderBottom: '1px solid #DED6C7',
            padding: '22px 0 24px',
          }}
          onMouseEnter={cancelClose}
          onMouseLeave={() => setActiveMenu(null)}
        >
          <div style={{ maxWidth: 1320, margin: '0 auto', padding: '0 40px' }}>
            {/* Eyebrow */}
            <div style={{
              fontFamily: "'Spline Sans Mono', monospace",
              fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase',
              color: '#9A917F', marginBottom: 16,
            }}>
              {activeItem.label}
            </div>
            {/* Subcategory grid — 2 rows, column-first like Luminaires */}
            <div style={{
              display: 'grid',
              gridAutoFlow: 'column',
              gridTemplateRows: 'auto auto',
              gap: '11px 56px',
              justifyContent: 'start',
            }}>
              {activeItem.sub.map((sub) => (
                <a
                  key={sub.label}
                  href={sub.to}
                  onClick={(e) => { e.preventDefault(); setActiveMenu(null); navigate(sub.to) }}
                  style={{
                    textDecoration: 'none',
                    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
                    fontSize: 13.5, color: '#16110B',
                    opacity: 0.68,
                    transition: 'opacity .15s',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.68')}
                >
                  {sub.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile overlay ──────────────────────────────────────────────────── */}
      <MobileMenu open={mobileOpen} onClose={() => setMobileOpen(false)} onNavigate={handleLink} />

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />

      <style>{`
        @media (max-width: 900px) {
          .fnx-desktop-nav { display: none !important; }
          .fnx-hamburger   { display: flex !important; }
        }
      `}</style>
    </>
  )
}

// ─── Cart button ───────────────────────────────────────────────────────────────
function CartButton({ totalItems, onClick, ink }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative', background: 'none', border: 'none',
        cursor: 'pointer', padding: 4, color: ink,
        display: 'flex', opacity: hovered ? 0.5 : 1,
        transition: 'opacity .15s, color .3s',
      }}
      aria-label={`Carrito — ${totalItems} artículo${totalItems !== 1 ? 's' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M6 7h13l-1.2 9.5a2 2 0 0 1-2 1.7H9.2a2 2 0 0 1-2-1.7L6 7Z" />
        <path d="M9 7a3 3 0 0 1 6 0" strokeLinecap="round" />
      </svg>
      {totalItems > 0 && (
        <span style={{
          position: 'absolute', top: -4, right: -5,
          minWidth: 16, height: 16, padding: '0 4px',
          background: '#CC0000', color: '#fff', borderRadius: 8,
          fontFamily: "'Spline Sans Mono', monospace",
          fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
        }}>
          {totalItems > 99 ? '99+' : totalItems}
        </span>
      )}
    </button>
  )
}

// ─── Mobile full-screen menu ───────────────────────────────────────────────────
function MobileMenu({ open, onClose, onNavigate }) {
  if (!open) return null
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: '#14100A', color: '#EAE2D3',
      display: 'flex', flexDirection: 'column',
    }}>
      <div aria-hidden="true" style={{
        position: 'absolute', top: '-10%', right: '-6%', width: 520, height: 520,
        background: 'radial-gradient(circle, rgba(224,162,74,0.16), transparent 66%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        position: 'relative', padding: '0 24px', height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <FenixLogo onDark />
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EAE2D3', display: 'flex', padding: 4, transition: 'color .15s' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#CC0000')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#EAE2D3')}
          aria-label="Cerrar menú"
        >
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <div style={{
        position: 'relative', flex: 1, padding: '30px 24px 60px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6,
      }}>
        {NAV_ITEMS.map((item) => (
          <a
            key={item.label}
            href={item.to || `#${item.hash}`}
            onClick={(e) => onNavigate(item, e)}
            style={{
              textDecoration: 'none', color: '#F2EBDC',
              fontFamily: "'Newsreader', serif",
              fontSize: 'clamp(34px, 5.4vw, 62px)',
              lineHeight: 1.15, letterSpacing: '-.015em',
              transition: 'color .15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#E0A24A')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#F2EBDC')}
          >
            {item.label}
          </a>
        ))}
      </div>

      <div style={{
        position: 'relative', padding: '0 24px 40px',
        fontFamily: "'Spline Sans Mono', monospace", fontSize: 12, color: '#8C8270',
        display: 'flex', gap: 26, flexWrap: 'wrap',
      }}>
        <span>Av. Centenario 1234 · City Bell</span>
        <span>(221) 480-1977</span>
        <span>Lun a Sáb · 8:30–13 / 16–20</span>
      </div>
    </div>
  )
}
