import { useState, useRef, useEffect, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useAdmin } from '../context/AdminContext'
import { useAuth } from '../context/AuthContext'
import CartDrawer from './CartDrawer'
import FenixLogo from '../assets/FenixLogo'
import { NAVBAR_HEIGHT, ANNOUNCEMENT_BAR_HEIGHT, PAGE_CONTENT_OFFSET } from '../config/layout'
import { DEFAULT_HEADER_CATEGORY_VALUES, getCategoryValue } from '../data/categoryTree'

const fmtPrice = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

const CONTACT_NAV_ITEM = { label: 'Contacto', hash: 'contacto' }

function headerCategories(categoryTree) {
  return categoryTree
    .filter(category => category.showInHeader)
    .sort((left, right) => {
      const leftKey = left._taxonomy?.category || getCategoryValue(left)
      const rightKey = right._taxonomy?.category || getCategoryValue(right)
      const leftIndex = DEFAULT_HEADER_CATEGORY_VALUES.indexOf(leftKey)
      const rightIndex = DEFAULT_HEADER_CATEGORY_VALUES.indexOf(rightKey)
      if (leftIndex < 0 && rightIndex < 0) return 0
      if (leftIndex < 0) return 1
      if (rightIndex < 0) return -1
      return leftIndex - rightIndex
    })
}

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

export default function Navbar() {
  const { totalItems, lastAdded, dismissAddedNotification } = useCart()
  const { products, categoryTree } = useAdmin()
  const { user, isAuthenticated, logout } = useAuth()
  const [cartOpen,   setCartOpen]   = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled,   setScrolled]   = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [activeCategoryLabel, setActiveCategoryLabel] = useState(categoryTree[0].label)
  const searchBlurTimer = useRef(null)
  const accountRef = useRef(null)
  const categoryRef = useRef(null)
  const categoryPanelRef = useRef(null)
  const navRef = useRef(null)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isHome = pathname === '/'

  useEffect(() => {
    if (!accountOpen) return
    function onClickOutside(e) {
      if (accountRef.current && !accountRef.current.contains(e.target)) setAccountOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [accountOpen])

  useEffect(() => {
    if (!categoryOpen) return
    function onClickOutside(e) {
      const inButton = categoryRef.current && categoryRef.current.contains(e.target)
      const inPanel  = categoryPanelRef.current && categoryPanelRef.current.contains(e.target)
      if (!inButton && !inPanel) setCategoryOpen(false)
    }
    function onKey(e) { if (e.key === 'Escape') setCategoryOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [categoryOpen])

  // La announcement bar (no sticky) vive arriba del navbar en el DOM. El navbar
  // sigue siendo `fixed` — convertirlo a `sticky` es un refactor propio, no un
  // efecto colateral de esto (ver docs/ESTADO.md) — así que simulamos el
  // "empuje" con un transform: arranca corrido `ANNOUNCEMENT_BAR_HEIGHT` hacia
  // abajo y se desliza hasta pegarse a top al scrollear esa misma distancia.
  // Se anima con transform (compositor) en vez de animar `top` (layout) en
  // cada frame de scroll. Igual que categoryPanelRef, se actualiza por ref en
  // vez de por estado para no re-renderizar el navbar entero en cada scroll.
  useEffect(() => {
    let raf = null
    function applyScrollOffset() {
      const shift = Math.min(window.scrollY, ANNOUNCEMENT_BAR_HEIGHT)
      if (navRef.current) navRef.current.style.transform = `translateY(-${shift}px)`
      if (categoryPanelRef.current) categoryPanelRef.current.style.top = `${PAGE_CONTENT_OFFSET - shift}px`
      raf = null
    }
    function onScroll() {
      if (raf == null) raf = requestAnimationFrame(applyScrollOffset)
    }
    applyScrollOffset()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf != null) cancelAnimationFrame(raf)
    }
  }, [])

  function goToCategory(to) {
    setCategoryOpen(false)
    navigate(to)
  }

  // El mega-menú se abre solo por click (en "Categoría" o en un atajo del
  // header). Si `label` viene, deja esa categoría activa en el panel.
  function openCategoryMenu(label) {
    if (label) setActiveCategoryLabel(label)
    setCategoryOpen(true)
  }

  function goToAccountLink(to) {
    setAccountOpen(false)
    navigate(to)
  }

  async function handleLogout() {
    setAccountOpen(false)
    await logout()
    navigate('/')
  }

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    return products.filter(p => p.name.toLowerCase().includes(q)).slice(0, 6)
  }, [searchQuery, products])

  const showSearchDropdown = searchFocused && searchQuery.trim() !== ''

  function submitSearch(e) {
    e.preventDefault()
    const q = searchQuery.trim()
    if (!q) return
    navigate(`/products?q=${encodeURIComponent(q)}`)
    setSearchQuery('')
    setSearchFocused(false)
    setCategoryOpen(false)
    setMobileOpen(false)
  }

  function goToProduct(id) {
    clearTimeout(searchBlurTimer.current)
    setSearchQuery('')
    setSearchFocused(false)
    navigate(`/products/${id}`)
  }

  function handleSearchFocus() {
    clearTimeout(searchBlurTimer.current)
    setSearchFocused(true)
  }

  function handleSearchBlur() {
    searchBlurTimer.current = setTimeout(() => setSearchFocused(false), 150)
  }

  useEffect(() => { setScrolled(true) }, [])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  useEffect(() => {
    if (!lastAdded) return undefined
    const timer = setTimeout(dismissAddedNotification, 3600)
    return () => clearTimeout(timer)
  }, [lastAdded, dismissAddedNotification])

  function handleLink(item, e) {
    e.preventDefault()
    setCategoryOpen(false)
    setMobileOpen(false)
    if (item.to) navigate(item.to)
    else if (isHome) setTimeout(() => scrollTo(item.hash), 60)
    else { navigate('/'); setTimeout(() => scrollTo(item.hash), 420) }
  }

  const opaque = scrolled || categoryOpen
  const ink    = opaque ? '#16110B' : '#F7F4EF'
  const searchBorder = opaque ? 'rgba(22,17,11,0.3)' : 'rgba(247,244,239,0.4)'
  const activeCategory = categoryTree.find(c => c.label === activeCategoryLabel) || categoryTree[0]
  const visibleHeaderCategories = headerCategories(categoryTree)

  return (
    <>
      {/* ── Navbar bar ──────────────────────────────────────────────────────── */}
      <nav ref={navRef} style={{
        position: 'fixed', top: ANNOUNCEMENT_BAR_HEIGHT, left: 0, right: 0, zIndex: 50,
        height: NAVBAR_HEIGHT,
        transition: 'background .3s ease, border-color .3s ease',
        background: opaque ? 'rgba(247,244,239,0.96)' : 'transparent',
        backdropFilter: opaque ? 'blur(12px)' : 'none',
        WebkitBackdropFilter: opaque ? 'blur(12px)' : 'none',
        borderBottom: `1px solid ${opaque ? '#DED6C7' : 'transparent'}`,
        color: ink,
      }}>
        <div style={{
          padding: '0 24px', height: '100%',
          display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto',
          alignItems: 'center',
        }}>
          {/* ── Left: logo + nav links ───────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 36, minWidth: 0 }}>
            <Link to="/" aria-label="Ir al inicio" style={{ textDecoration: 'none', flexShrink: 0 }}>
              <FenixLogo />
            </Link>
            <nav className="fnx-desktop-nav" aria-label="Categorías" style={{
              display: 'flex', alignItems: 'center', gap: 28,
            }} ref={categoryRef}>
              <button
                type="button"
                onClick={() => setCategoryOpen((o) => !o)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  fontFamily: "var(--font-sans)",
                  fontSize: 13.5, fontWeight: 500,
                  color: ink,
                  opacity: 0.9,
                  transition: 'opacity .18s ease, color .3s ease',
                  whiteSpace: 'nowrap',
                  paddingBottom: 3,
                  borderBottom: `1px solid ${categoryOpen ? ink : 'transparent'}`,
                }}
                aria-expanded={categoryOpen}
              >
                Categoría
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: categoryOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {visibleHeaderCategories.map((category) => {
                const isActiveCategory = categoryOpen && activeCategoryLabel === category.label
                return (
                  <a
                    key={category._taxonomy?.category || category.label}
                    href={category.to}
                    onClick={(e) => {
                      // Un atajo de categoría abre el mega-menú en esa categoría
                      // (segundo click sobre el mismo lo cierra); "Ver todo" del
                      // panel lleva a la sección.
                      e.preventDefault()
                      if (isActiveCategory) setCategoryOpen(false)
                      else openCategoryMenu(category.label)
                    }}
                    aria-expanded={isActiveCategory}
                    style={{
                      textDecoration: 'none',
                      fontFamily: "var(--font-sans)",
                      fontSize: 13.5, fontWeight: isActiveCategory ? 500 : 400,
                      color: ink,
                      opacity: isActiveCategory ? 1 : 0.82,
                      transition: 'opacity .18s ease, color .3s ease',
                      whiteSpace: 'nowrap',
                      paddingBottom: 3,
                      borderBottom: `1px solid ${isActiveCategory ? ink : 'transparent'}`,
                    }}
                  >
                    {category.label}
                  </a>
                )
              })}
              <a
                href={`#${CONTACT_NAV_ITEM.hash}`}
                onClick={(event) => handleLink(CONTACT_NAV_ITEM, event)}
                style={{
                  textDecoration: 'none', fontFamily: "var(--font-sans)", fontSize: 13.5,
                  fontWeight: 400, color: ink, opacity: 0.82, transition: 'opacity .18s ease, color .3s ease',
                  whiteSpace: 'nowrap', paddingBottom: 3, borderBottom: '1px solid transparent',
                }}
              >
                {CONTACT_NAV_ITEM.label}
              </a>
            </nav>
          </div>

          {/* ── Right: Search + icons ─────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, justifySelf: 'end' }}>
            {/* Underline search */}
            <form
              className="fnx-desktop-nav"
              onSubmit={submitSearch}
              style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
            >
              <input
                type="search"
                placeholder="Buscar"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={(e) => { e.currentTarget.style.borderBottomColor = ink; handleSearchFocus() }}
                onBlur={(e)  => { e.currentTarget.style.borderBottomColor = searchBorder; handleSearchBlur() }}
                style={{
                  background: 'transparent', border: 'none', outline: 'none',
                  borderBottom: `1px solid ${searchBorder}`,
                  width: 140, padding: '4px 26px 4px 0',
                  fontFamily: "var(--font-sans)",
                  fontSize: 13.5, color: ink,
                  transition: 'border-color .2s, color .3s',
                }}
              />
              <button
                type="submit"
                aria-label="Buscar"
                style={{
                  position: 'absolute', right: 0, background: 'none', border: 'none',
                  padding: 0, display: 'flex', cursor: 'pointer', opacity: 0.7,
                }}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={ink} strokeWidth="1.6" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7" /><path d="m20 20-3.4-3.4" />
                </svg>
              </button>

              {/* Live results dropdown */}
              {showSearchDropdown && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 14,
                  width: 320, maxHeight: 420, overflowY: 'auto',
                  background: 'rgba(247,244,239,0.98)',
                  backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid #DED6C7', borderRadius: 4,
                  boxShadow: '0 12px 32px rgba(22,17,11,0.18)',
                }}>
                  {searchMatches.length > 0 ? (
                    <>
                      {searchMatches.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); goToProduct(p.id) }}
                          style={{
                            display: 'flex', gap: 12, width: '100%', padding: '10px 14px',
                            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                            alignItems: 'center',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(22,17,11,0.05)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                        >
                          <img src={p.image} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{
                              display: 'block', fontFamily: "var(--font-sans)",
                              fontSize: 13, color: '#16110B',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {p.name}
                            </span>
                            <span style={{ display: 'block', fontFamily: "var(--font-sans)", fontSize: 11.5, color: '#8A8175' }}>
                              {fmtPrice(p.price)}
                            </span>
                          </span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); submitSearch(e) }}
                        style={{
                          width: '100%', padding: '12px 14px', background: 'none', border: 'none',
                          borderTop: '1px solid #DED6C7', cursor: 'pointer', textAlign: 'left',
                          fontFamily: "var(--font-sans)", fontSize: 11,
                          letterSpacing: '.08em', textTransform: 'uppercase', color: '#6B6051',
                        }}
                      >
                        Ver todos los resultados para "{searchQuery.trim()}"
                      </button>
                    </>
                  ) : (
                    <div style={{
                      padding: '16px 14px', fontFamily: "var(--font-sans)",
                      fontSize: 13, color: '#8A8175',
                    }}>
                      Sin resultados para "{searchQuery.trim()}"
                    </div>
                  )}
                </div>
              )}
            </form>

            {/* User icon + dropdown */}
            <div className="fnx-desktop-nav" ref={accountRef} style={{ position: 'relative', display: 'flex' }}>
              <button
                onClick={() => setAccountOpen((o) => !o)}
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

              {accountOpen && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 14,
                  width: 200,
                  background: 'rgba(247,244,239,0.98)',
                  backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid #DED6C7', borderRadius: 4,
                  boxShadow: '0 12px 32px rgba(22,17,11,0.18)',
                  overflow: 'hidden',
                }}>
                  {isAuthenticated ? (
                    <>
                      <div style={{ padding: '12px 14px', borderBottom: '1px solid #DED6C7' }}>
                        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: '#8A8175' }}>
                          Hola, {user.firstName}
                        </span>
                      </div>
                      <AccountMenuItem onClick={() => goToAccountLink('/account')}>Mi cuenta</AccountMenuItem>
                      <AccountMenuItem onClick={() => goToAccountLink('/favorites')}>Mis favoritos</AccountMenuItem>
                      <AccountMenuItem onClick={() => goToAccountLink('/orders')}>Mis pedidos</AccountMenuItem>
                      <AccountMenuItem onClick={handleLogout} borderTop>Cerrar sesión</AccountMenuItem>
                    </>
                  ) : (
                    <>
                      <AccountMenuItem onClick={() => goToAccountLink('/login')}>Iniciar sesión</AccountMenuItem>
                      <AccountMenuItem onClick={() => goToAccountLink('/register')}>Crear cuenta</AccountMenuItem>
                    </>
                  )}
                </div>
              )}
            </div>

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

      {/* ── Categoría mega-menu ─────────────────────────────────────────────── */}
      {categoryOpen && (
        <div
          ref={categoryPanelRef}
          role="menu"
          style={{
            position: 'fixed',
            top: PAGE_CONTENT_OFFSET - Math.min(typeof window !== 'undefined' ? window.scrollY : 0, ANNOUNCEMENT_BAR_HEIGHT),
            left: 0, right: 0, zIndex: 49,
            background: 'rgba(247,244,239,0.98)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: '1px solid #DED6C7',
            boxShadow: '0 16px 40px rgba(22,17,11,0.14)',
          }}
        >
          <div style={{
            maxWidth: 1320, margin: '0 auto', padding: '0 40px',
            display: 'flex', maxHeight: 'calc(100vh - 120px)', overflow: 'hidden',
          }}>
            {/* Top-level category list */}
            <div style={{
              flex: '0 0 240px', borderRight: '1px solid #DED6C7',
              padding: '22px 24px 24px 0', overflowY: 'auto',
            }}>
              {categoryTree.map((cat) => (
                <button
                  key={cat.label}
                  type="button"
                  onMouseEnter={() => setActiveCategoryLabel(cat.label)}
                  onClick={() => (cat.children ? setActiveCategoryLabel(cat.label) : goToCategory(cat.to))}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    border: 'none', cursor: 'pointer',
                    padding: '9px 10px', borderRadius: 2,
                    marginBottom: 2,
                    fontFamily: "var(--font-sans)",
                    fontSize: 14, fontWeight: activeCategoryLabel === cat.label ? 600 : 400,
                    color: '#16110B',
                    background: activeCategoryLabel === cat.label ? 'rgba(22,17,11,0.06)' : 'none',
                    transition: 'background .15s',
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Subcategory columns */}
            <div style={{ flex: 1, padding: '22px 0 24px 32px', overflowY: 'auto' }}>
              {activeCategory.children ? (
                <>
                  <a
                    href={activeCategory.to}
                    onClick={(e) => { e.preventDefault(); goToCategory(activeCategory.to) }}
                    style={{
                      display: 'inline-block', marginBottom: 18,
                      textDecoration: 'none', color: '#16110B',
                      fontFamily: "var(--font-sans)",
                      fontSize: 13.5, fontWeight: 600,
                      borderBottom: '1px solid currentColor', paddingBottom: 2,
                    }}
                  >
                    Ver todo {activeCategory.label} →
                  </a>
                  <div style={{ columns: '3 220px', columnGap: 40 }}>
                    {activeCategory.children.map((child) => (
                      <div key={child.label} style={{ breakInside: 'avoid', marginBottom: 22 }}>
                        <CategoryTreeNode node={child} depth={0} onNavigate={goToCategory} />
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <a
                  href={activeCategory.to}
                  onClick={(e) => { e.preventDefault(); goToCategory(activeCategory.to) }}
                  style={{
                    textDecoration: 'none', color: '#16110B',
                    fontFamily: "var(--font-sans)",
                    fontSize: 15, fontWeight: 500,
                  }}
                >
                  Ver {activeCategory.label} →
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile overlay ──────────────────────────────────────────────────── */}
      <MobileMenu open={mobileOpen} onClose={() => setMobileOpen(false)} onNavigate={handleLink} navigate={navigate} />

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />

      {lastAdded && (
        <AddedToCartNotice
          item={lastAdded}
          onClose={dismissAddedNotification}
          onViewCart={() => { dismissAddedNotification(); setCartOpen(true) }}
        />
      )}

      <style>{`
        @media (max-width: 900px) {
          .fnx-desktop-nav { display: none !important; }
          .fnx-hamburger   { display: flex !important; }
        }
      `}</style>
    </>
  )
}

function AddedToCartNotice({ item, onClose, onViewCart }) {
  return (
    <div className="fnx-added-notice" role="status" aria-live="polite">
      <div className="fnx-added-notice__title">
        <span>{item.name}</span>
        <strong>Elemento añadido</strong>
      </div>
      <div className="fnx-added-notice__body">
        <button type="button" onClick={onClose} aria-label="Cerrar notificación">×</button>
        <img src={item.image} alt="" />
        <button type="button" onClick={onViewCart}>Ver el carrito</button>
      </div>
    </div>
  )
}

// ─── Category tree node (recursive, used by the desktop mega-menu) ─────────────
function CategoryTreeNode({ node, depth, onNavigate }) {
  const label = node.to ? (
    <a
      href={node.to}
      onClick={(e) => { e.preventDefault(); onNavigate(node.to) }}
      style={{
        textDecoration: 'none', color: '#16110B',
        fontFamily: "var(--font-sans)",
        fontSize: depth === 0 ? 13.5 : 13,
        fontWeight: depth === 0 ? 600 : 400,
        opacity: depth === 0 ? 1 : 0.72,
        transition: 'opacity .15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = depth === 0 ? '1' : '0.72')}
    >
      {node.label}
    </a>
  ) : (
    <span style={{
      fontFamily: "var(--font-sans)",
      fontSize: 13, color: '#6B6051',
    }}>
      {node.label}
    </span>
  )

  return (
    <div style={{ marginBottom: depth === 0 ? 6 : 3 }}>
      {label}
      {node.children && (
        <div style={{ paddingLeft: 12, marginTop: depth === 0 ? 6 : 3, display: 'flex', flexDirection: 'column', gap: depth === 0 ? 6 : 3 }}>
          {node.children.map((child) => (
            <CategoryTreeNode key={child.label} node={child} depth={depth + 1} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Account dropdown item ──────────────────────────────────────────────────────
function AccountMenuItem({ onClick, borderTop, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'block', width: '100%', padding: '11px 14px',
        background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        borderTop: borderTop ? '1px solid #DED6C7' : 'none',
        fontFamily: "var(--font-sans)",
        fontSize: 13.5, color: '#16110B',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(22,17,11,0.05)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
    >
      {children}
    </button>
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
          fontFamily: "var(--font-sans)",
          fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
        }}>
          {totalItems > 99 ? '99+' : totalItems}
        </span>
      )}
    </button>
  )
}

// ─── Mobile full-screen menu ───────────────────────────────────────────────────
function MobileMenu({ open, onClose, onNavigate, navigate }) {
  const { categoryTree } = useAdmin()
  const visibleHeaderCategories = headerCategories(categoryTree)
  const [catPath, setCatPath] = useState(null) // null = main menu · [] = category root · [...] = drilled in

  useEffect(() => { if (!open) setCatPath(null) }, [open])

  if (!open) return null

  const browsing = catPath !== null
  const currentNode = browsing && catPath.length > 0 ? catPath[catPath.length - 1] : null
  const currentChildren = browsing ? (currentNode ? currentNode.children : categoryTree) : null

  function goLeaf(to) {
    navigate(to)
    onClose()
  }

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
        {browsing ? (
          <button
            onClick={() => setCatPath(catPath.slice(0, -1))}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#EAE2D3', padding: 0 }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600 }}>
              {currentNode ? currentNode.label : 'Categoría'}
            </span>
          </button>
        ) : (
          <FenixLogo />
        )}
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

      {browsing ? (
        <div style={{
          position: 'relative', flex: 1, overflowY: 'auto',
          padding: '12px 24px 40px', display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {currentNode && (
            <button
              onClick={() => goLeaf(currentNode.to)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '12px 0', marginBottom: 8, borderBottom: '1px solid #2E2417',
                fontFamily: "var(--font-sans)",
                fontSize: 15, fontWeight: 600, color: '#E0A24A',
              }}
            >
              Ver todo — {currentNode.label}
            </button>
          )}
          {currentChildren.map((child) => {
            const interactive = Boolean(child.children || child.to)
            return (
            <button
              key={child.label}
              disabled={!interactive}
              onClick={() => {
                if (child.children) setCatPath([...catPath, child])
                else if (child.to) goLeaf(child.to)
              }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', textAlign: 'left',
                background: 'none', border: 'none', cursor: interactive ? 'pointer' : 'default',
                padding: '13px 0', borderBottom: '1px solid #241C12',
                fontFamily: "var(--font-sans)",
                fontSize: 15.5, color: interactive ? '#F2EBDC' : '#8C8270',
              }}
            >
              {child.label}
              {child.children && (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#8C8270" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              )}
            </button>
          )})}
        </div>
      ) : (
        <div style={{
          position: 'relative', flex: 1, padding: '30px 24px 60px',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6,
        }}>
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); setCatPath([]) }}
            style={{
              textDecoration: 'none', color: '#F2EBDC',
              fontFamily: 'var(--font-sans)',
              fontSize: 'clamp(34px, 5.4vw, 62px)',
              fontWeight: 500, lineHeight: 1.15, letterSpacing: '-.015em',
              transition: 'color .15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#E0A24A')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#F2EBDC')}
          >
            Categoría
          </a>
          {[...visibleHeaderCategories, CONTACT_NAV_ITEM].map((item) => (
            <a
              key={item._taxonomy?.category || item.label}
              href={item.to || `#${item.hash}`}
              onClick={(e) => onNavigate(item, e)}
              style={{
                textDecoration: 'none', color: '#F2EBDC',
                fontFamily: 'var(--font-sans)',
                fontSize: 'clamp(34px, 5.4vw, 62px)',
                fontWeight: 500, lineHeight: 1.15, letterSpacing: '-.015em',
                transition: 'color .15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#E0A24A')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#F2EBDC')}
            >
              {item.label}
            </a>
          ))}
        </div>
      )}

      <div style={{
        position: 'relative', padding: '0 24px 40px',
        fontFamily: "var(--font-sans)", fontSize: 12, color: '#8C8270',
        display: 'flex', gap: 26, flexWrap: 'wrap',
      }}>
        <span>C. Cantilo 745 · City Bell</span>
        <span>221-600-7560</span>
        <span>Lun a Vie · 8–18 / Sáb · 9–14</span>
      </div>
    </div>
  )
}
