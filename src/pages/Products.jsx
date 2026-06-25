import { useState, useMemo, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { products, categories, CATEGORY_NAV_LABEL } from '../data/products'
import ProductCard from '../components/ProductCard'

const T = {
  paper:          '#F7F4EF',
  panel:          '#FBF8F3',
  surface2:       '#E7E0D3',
  ink:            '#16110B',
  ink2:           '#2A2118',
  text3:          '#6B6051',
  muted:          '#8A8175',
  muted2:         '#9A917F',
  hairline:       '#DED6C7',
  hairlineStrong: '#C9BFAF',
  red:            '#CC0000',
  amber:          '#E0A24A',
}

const PRICE_MIN = 0
const PRICE_MAX = 40000

const SORT_OPTIONS = [
  { value: 'default',    label: 'Novedades'            },
  { value: 'price-asc',  label: 'Precio: menor a mayor' },
  { value: 'price-desc', label: 'Precio: mayor a menor' },
  { value: 'name-az',    label: 'Nombre: A–Z'           },
]

const fmt = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

// ─── URL param helpers ─────────────────────────────────────────────────────────
function useFilterParams() {
  const [searchParams, setSearchParams] = useSearchParams()

  const query              = searchParams.get('q') || ''
  const selectedCategories = searchParams.getAll('category')
  const sub                = searchParams.get('sub') || ''
  const onlyInStock        = searchParams.get('stock') === '1'
  const sortBy             = searchParams.get('sort') || 'default'
  const minPrice           = Math.max(PRICE_MIN, Number(searchParams.get('min')) || PRICE_MIN)
  const maxPrice           = Math.min(PRICE_MAX, Number(searchParams.get('max')) || PRICE_MAX)

  function set(key, value) {
    const p = new URLSearchParams(searchParams)
    if (value == null || value === '' || value === 'default') p.delete(key)
    else p.set(key, String(value))
    setSearchParams(p, { replace: true })
  }

  function toggleCategory(cat) {
    const p = new URLSearchParams(searchParams)
    const current = p.getAll('category')
    p.delete('category')
    if (current.includes(cat)) current.filter(c => c !== cat).forEach(c => p.append('category', c))
    else [...current, cat].forEach(c => p.append('category', c))
    setSearchParams(p, { replace: true })
  }

  function clearAll() { setSearchParams({}, { replace: true }) }

  function selectCategory(cat) {
    const p = new URLSearchParams()
    if (cat) p.set('category', cat)
    setSearchParams(p, { replace: true })
  }

  const hasActiveFilters =
    query !== '' || selectedCategories.length > 0 || sub !== '' || onlyInStock ||
    sortBy !== 'default' || minPrice > PRICE_MIN || maxPrice < PRICE_MAX

  return { query, selectedCategories, sub, onlyInStock, sortBy, minPrice, maxPrice, set, toggleCategory, clearAll, selectCategory, hasActiveFilters }
}

// ─── Breadcrumb + title ────────────────────────────────────────────────────────
function CatalogHeader({ filters }) {
  const navigate = useNavigate()
  // Derive labels from active filters
  const activeCategory = filters.selectedCategories[0] || null
  const catLabel  = activeCategory ? CATEGORY_NAV_LABEL[activeCategory] : null
  const subLabel  = filters.sub || null
  const pageTitle = subLabel || catLabel || 'Catálogo'

  return (
    <div style={{ padding: '96px 0 32px', borderBottom: `1px solid ${T.hairline}`, marginBottom: 36 }}>
      {/* Breadcrumb */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: "'Spline Sans Mono', monospace",
        fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase',
        color: T.muted2, marginBottom: 18,
      }}>
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); navigate('/') }}
          style={{ textDecoration: 'none', color: T.muted2, transition: 'color .15s' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = T.ink)}
          onMouseLeave={(e) => (e.currentTarget.style.color = T.muted2)}
        >
          Inicio
        </a>
        {catLabel && (
          <>
            <span style={{ opacity: 0.5 }}>/</span>
            <a
              href={`/products?category=${activeCategory}`}
              onClick={(e) => { e.preventDefault(); navigate(`/products?category=${activeCategory}`) }}
              style={{ textDecoration: 'none', color: subLabel ? T.muted2 : T.ink, transition: 'color .15s' }}
              onMouseEnter={(e) => !subLabel && (e.currentTarget.style.color = T.ink)}
            >
              {catLabel}
            </a>
          </>
        )}
        {subLabel && (
          <>
            <span style={{ opacity: 0.5 }}>/</span>
            <span style={{ color: T.ink }}>{subLabel}</span>
          </>
        )}
      </div>

      {/* Page title */}
      <h1 style={{
        fontFamily: "'Playfair Display', serif",
        fontWeight: 500, fontSize: 'clamp(38px, 5vw, 64px)',
        lineHeight: 0.94, letterSpacing: '-.02em',
        color: T.ink, margin: 0,
      }}>
        {pageTitle}
      </h1>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function Products() {
  const filters = useFilterParams()
  const filtered = useMemo(() => {
    let list = products
    if (filters.query) {
      const q = filters.query.toLowerCase()
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
    }
    if (filters.selectedCategories.length > 0)
      list = list.filter(p => filters.selectedCategories.includes(p.category))
    if (filters.sub)
      list = list.filter(p => p.subcategory === filters.sub)
    if (filters.onlyInStock)
      list = list.filter(p => p.inStock)
    list = list.filter(p => p.price >= filters.minPrice && p.price <= filters.maxPrice)
    switch (filters.sortBy) {
      case 'price-asc':  return [...list].sort((a, b) => a.price - b.price)
      case 'price-desc': return [...list].sort((a, b) => b.price - a.price)
      case 'name-az':    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'es'))
      default:           return list
    }
  }, [filters.query, filters.selectedCategories, filters.onlyInStock, filters.sortBy, filters.minPrice, filters.maxPrice])

  return (
    <div style={{ background: T.paper, minHeight: '100vh', color: T.ink }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '0 40px 80px' }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <CatalogHeader filters={filters} />

        {/* ── Category tabs ───────────────────────────────────────────────── */}
        <CategoryTabs filters={filters} />

        {/* ── Search + sort row ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 280px' }}>
            <svg
              viewBox="0 0 24 24" width="15" height="15" fill="none"
              stroke={T.muted2} strokeWidth="1.7" strokeLinecap="round"
              style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            >
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.4-3.4" />
            </svg>
            <input
              type="search"
              placeholder="Buscar productos…"
              value={filters.query}
              onChange={(e) => filters.set('q', e.target.value || null)}
              style={{
                width: '100%', paddingLeft: 38, paddingRight: 14,
                paddingTop: 11, paddingBottom: 11,
                background: T.panel, border: `1px solid ${T.hairline}`,
                borderRadius: 2, outline: 'none',
                fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
                fontSize: 13.5, color: T.ink,
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = T.hairlineStrong)}
              onBlur={(e)  => (e.currentTarget.style.borderColor = T.hairline)}
            />
          </div>

          {/* Sort */}
          <select
            value={filters.sortBy}
            onChange={(e) => filters.set('sort', e.target.value)}
            style={{
              padding: '11px 14px',
              background: T.panel, border: `1px solid ${T.hairline}`,
              borderRadius: 2, outline: 'none', cursor: 'pointer',
              fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
              fontSize: 13.5, color: T.ink,
              minWidth: 220,
            }}
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

        </div>

        {/* Count */}
        <div style={{
          fontFamily: "'Spline Sans Mono', monospace",
          fontSize: 11, letterSpacing: '.08em', color: T.muted2, marginBottom: 32,
        }}>
          {filtered.length} {filtered.length === 1 ? 'producto encontrado' : 'productos encontrados'}
        </div>

        {/* ── Product grid ────────────────────────────────────────────────── */}
        {filtered.length === 0
          ? <EmptyState onClear={filters.clearAll} />
          : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 28,
            }}>
              {filtered.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          )
        }
      </div>
    </div>
  )
}

// ─── Category tabs ─────────────────────────────────────────────────────────────
function CategoryTabs({ filters }) {
  const activeCategory = filters.sub
    ? filters.selectedCategories[0] || null
    : filters.selectedCategories.length === 1 ? filters.selectedCategories[0] : null

  const tabs = [
    { label: 'Todos',         value: null },
    { label: 'Interior',      value: 'Iluminación Interior' },
    { label: 'Exterior',      value: 'Iluminación Exterior' },
    { label: 'Tiras LED',     value: 'Tiras LED' },
    { label: 'Electricidad',  value: 'Electricidad' },
    { label: 'Ventiladores',  value: 'Ventiladores de techo' },
  ]

  return (
    <div style={{
      display: 'flex', gap: 0,
      borderBottom: `1px solid ${T.hairline}`,
      marginBottom: 28,
      overflowX: 'auto',
    }}>
      {tabs.map(tab => {
        const isActive = tab.value === null
          ? !activeCategory && !filters.sub
          : activeCategory === tab.value

        return (
          <button
            key={tab.label}
            onClick={() => filters.selectCategory(tab.value)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '13px 22px',
              fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
              fontSize: 13.5, fontWeight: isActive ? 500 : 400,
              color: isActive ? T.ink : T.muted,
              borderBottom: `2px solid ${isActive ? T.ink : 'transparent'}`,
              marginBottom: -1,
              whiteSpace: 'nowrap',
              transition: 'color .15s, border-color .15s',
            }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = T.ink2 }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = T.muted }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Filter Panel ──────────────────────────────────────────────────────────────
function FilterPanel({ filters }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {filters.hasActiveFilters && (
        <button
          onClick={filters.clearAll}
          style={{
            width: '100%', padding: '9px 0', borderRadius: 2,
            border: `1px solid ${T.hairlineStrong}`, background: 'transparent',
            color: T.text3,
            fontFamily: "'Spline Sans Mono', monospace",
            fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase',
            cursor: 'pointer', transition: 'border-color .15s, color .15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.ink; e.currentTarget.style.color = T.ink }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.hairlineStrong; e.currentTarget.style.color = T.text3 }}
        >
          Limpiar filtros
        </button>
      )}

      {/* Categories */}
      <div>
        <div style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: T.muted2, marginBottom: 14 }}>
          Categoría
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {categories.map(cat => {
            const checked = filters.selectedCategories.includes(cat)
            return (
              <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer' }}>
                <div
                  onClick={() => filters.toggleCategory(cat)}
                  style={{
                    width: 15, height: 15, borderRadius: 2, flexShrink: 0,
                    border: `1.5px solid ${checked ? T.ink : T.hairlineStrong}`,
                    background: checked ? T.ink : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background .15s, border-color .15s',
                  }}
                >
                  {checked && (
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                      <path d="M1 3.5l2.5 2.5 4.5-5" stroke="#F7F4EF" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <input type="checkbox" checked={checked} onChange={() => filters.toggleCategory(cat)} style={{ display: 'none' }} />
                <span style={{ fontFamily: "'Hanken Grotesk', system-ui, sans-serif", fontSize: 13.5, color: checked ? T.ink : T.muted, transition: 'color .15s' }}>
                  {cat}
                </span>
                <span style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: 11, color: T.muted2, marginLeft: 'auto' }}>
                  {products.filter(p => p.category === cat).length}
                </span>
              </label>
            )
          })}
        </div>
      </div>

      <div style={{ height: 1, background: T.hairline }} />

      {/* Availability */}
      <div>
        <div style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: T.muted2, marginBottom: 14 }}>
          Disponibilidad
        </div>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
          <span style={{ fontFamily: "'Hanken Grotesk', system-ui, sans-serif", fontSize: 13.5, color: T.ink }}>
            Solo disponibles
          </span>
          <div
            onClick={() => filters.set('stock', filters.onlyInStock ? null : '1')}
            style={{
              position: 'relative', width: 38, height: 22, borderRadius: 11,
              background: filters.onlyInStock ? T.ink : T.surface2,
              border: `1px solid ${T.hairlineStrong}`,
              cursor: 'pointer', transition: 'background .2s',
            }}
            role="switch" aria-checked={filters.onlyInStock}
          >
            <div style={{
              position: 'absolute', top: 2,
              width: 16, height: 16, borderRadius: '50%',
              background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              transform: filters.onlyInStock ? 'translateX(18px)' : 'translateX(2px)',
              transition: 'transform .2s',
            }} />
          </div>
        </label>
      </div>

      <div style={{ height: 1, background: T.hairline }} />

      {/* Price */}
      <div>
        <div style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: T.muted2, marginBottom: 14 }}>
          Precio
        </div>
        <PriceRangeSlider
          min={PRICE_MIN} max={PRICE_MAX}
          value={[filters.minPrice, filters.maxPrice]}
          onChange={([lo, hi]) => {
            filters.set('min', lo > PRICE_MIN ? lo : null)
            filters.set('max', hi < PRICE_MAX ? hi : null)
          }}
        />
      </div>
    </div>
  )
}

// ─── Price Slider ──────────────────────────────────────────────────────────────
function PriceRangeSlider({ min, max, value, onChange }) {
  const [lo, setLo] = useState(value[0])
  const [hi, setHi] = useState(value[1])

  useEffect(() => { setLo(value[0]); setHi(value[1]) }, [value[0], value[1]])

  const loP = ((lo - min) / (max - min)) * 100
  const hiP = ((hi - min) / (max - min)) * 100

  function handleLo(e) { const v = Math.min(Number(e.target.value), hi - 500); setLo(v); onChange([v, hi]) }
  function handleHi(e) { const v = Math.max(Number(e.target.value), lo + 500); setHi(v); onChange([lo, v]) }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: 12, color: T.ink }}>{fmt(lo)}</span>
        <span style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: 12, color: T.ink }}>{fmt(hi)}</span>
      </div>
      <div style={{ position: 'relative', height: 6, borderRadius: 3, background: T.surface2 }}>
        <div style={{
          position: 'absolute', height: '100%', borderRadius: 3,
          left: `${loP}%`, right: `${100 - hiP}%`,
          background: T.ink,
        }} />
        <input type="range" min={min} max={max} step={500} value={lo} onChange={handleLo} className="range-thumb" aria-label="Precio mínimo" />
        <input type="range" min={min} max={max} step={500} value={hi} onChange={handleHi} className="range-thumb" aria-label="Precio máximo" />
      </div>
    </div>
  )
}

// ─── Mobile Drawer ─────────────────────────────────────────────────────────────
function FilterDrawer({ open, onClose, filters }) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(22,17,11,0.5)',
          opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity .3s ease',
        }}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        style={{
          position: 'fixed', left: 0, top: 0, height: '100%', zIndex: 50,
          width: 300, maxWidth: '88vw',
          background: T.paper,
          display: 'flex', flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform .3s ease',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', borderBottom: `1px solid ${T.hairline}`,
        }}>
          <span style={{ fontFamily: "'Playfair Display', serif", fontWeight: 400, fontSize: 20, color: T.ink }}>Filtros</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted, display: 'flex', padding: 4 }} aria-label="Cerrar">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px' }}>
          <FilterPanel filters={filters} />
        </div>
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${T.hairline}` }}>
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 2,
              background: T.ink, color: T.paper, border: 'none', cursor: 'pointer',
              fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
              fontSize: 13.5, fontWeight: 500, letterSpacing: '.04em',
              transition: 'opacity .15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '.82')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            Ver resultados
          </button>
        </div>
      </aside>
    </>
  )
}

// ─── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ onClear }) {
  return (
    <div style={{ textAlign: 'center', padding: '80px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <svg viewBox="0 0 24 24" width="52" height="52" fill="none" stroke={T.hairlineStrong} strokeWidth="1.2" strokeLinecap="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" />
      </svg>
      <div>
        <p style={{ fontFamily: "'Playfair Display', serif", fontWeight: 400, fontSize: 22, color: T.ink, marginBottom: 8 }}>
          Sin resultados
        </p>
        <p style={{ fontFamily: "'Hanken Grotesk', system-ui, sans-serif", fontSize: 14, color: T.muted }}>
          Intentá con otros términos o eliminá algunos filtros
        </p>
      </div>
      <button
        onClick={onClear}
        style={{
          padding: '11px 26px', borderRadius: 2,
          border: `1px solid ${T.hairlineStrong}`, background: 'transparent',
          color: T.ink, cursor: 'pointer',
          fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
          fontSize: 13, fontWeight: 500, letterSpacing: '.06em',
          transition: 'background .15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = T.surface2)}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        Limpiar filtros
      </button>
    </div>
  )
}
