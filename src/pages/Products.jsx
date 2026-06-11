import { useState, useMemo, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { products, categories } from '../data/products'
import ProductCard from '../components/ProductCard'

const PRICE_MIN = 0
const PRICE_MAX = 40000

const SORT_OPTIONS = [
  { value: 'default', label: 'Novedades' },
  { value: 'price-asc', label: 'Precio: menor a mayor' },
  { value: 'price-desc', label: 'Precio: mayor a menor' },
  { value: 'name-az', label: 'Nombre: A–Z' },
]

const fmt = (n) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)

// ─── URL helpers ───────────────────────────────────────────────────────────────
function useFilterParams() {
  const [searchParams, setSearchParams] = useSearchParams()

  const query = searchParams.get('q') || ''
  const selectedCategories = searchParams.getAll('category')
  const onlyInStock = searchParams.get('stock') === '1'
  const sortBy = searchParams.get('sort') || 'default'
  const minPrice = Math.max(PRICE_MIN, Number(searchParams.get('min')) || PRICE_MIN)
  const maxPrice = Math.min(PRICE_MAX, Number(searchParams.get('max')) || PRICE_MAX)

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
    if (current.includes(cat)) {
      current.filter((c) => c !== cat).forEach((c) => p.append('category', c))
    } else {
      [...current, cat].forEach((c) => p.append('category', c))
    }
    setSearchParams(p, { replace: true })
  }

  function clearAll() {
    setSearchParams({}, { replace: true })
  }

  const hasActiveFilters =
    query !== '' ||
    selectedCategories.length > 0 ||
    onlyInStock ||
    sortBy !== 'default' ||
    minPrice > PRICE_MIN ||
    maxPrice < PRICE_MAX

  return {
    query, selectedCategories, onlyInStock, sortBy, minPrice, maxPrice,
    set, toggleCategory, clearAll, hasActiveFilters,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function Products() {
  const filters = useFilterParams()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const filtered = useMemo(() => {
    let list = products

    if (filters.query) {
      const q = filters.query.toLowerCase()
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
    }
    if (filters.selectedCategories.length > 0) {
      list = list.filter((p) => filters.selectedCategories.includes(p.category))
    }
    if (filters.onlyInStock) {
      list = list.filter((p) => p.inStock)
    }
    list = list.filter((p) => p.price >= filters.minPrice && p.price <= filters.maxPrice)

    switch (filters.sortBy) {
      case 'price-asc':  return [...list].sort((a, b) => a.price - b.price)
      case 'price-desc': return [...list].sort((a, b) => b.price - a.price)
      case 'name-az':    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'es'))
      default:           return list
    }
  }, [filters.query, filters.selectedCategories, filters.onlyInStock, filters.sortBy, filters.minPrice, filters.maxPrice])

  return (
    <div style={{ backgroundColor: 'var(--color-bg)', minHeight: '100vh' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-20">

        {/* Page header */}
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.18em] font-medium mb-2" style={{ color: 'var(--color-primary)' }}>
            Fénix
          </p>
          <h1
            className="text-3xl sm:text-4xl font-bold"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-text)' }}
          >
            Catálogo
          </h1>
        </div>

        {/* Search + Sort + Mobile filter button row */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          {/* Search */}
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              placeholder="Buscar productos…"
              value={filters.query}
              onChange={(e) => filters.set('q', e.target.value || null)}
              className="dark-input w-full pl-10 pr-4 py-2.5 rounded-lg text-sm outline-none transition-colors"
              style={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
            />
          </div>

          {/* Sort */}
          <select
            value={filters.sortBy}
            onChange={(e) => filters.set('sort', e.target.value)}
            className="dark-select px-4 py-2.5 rounded-lg text-sm outline-none cursor-pointer"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
              minWidth: '200px',
            }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Mobile filter toggle */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          >
            <FilterIcon />
            Filtros
            {filters.hasActiveFilters && (
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: 'var(--color-primary)' }}
              />
            )}
          </button>
        </div>

        {/* Result count */}
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
          {filtered.length} {filtered.length === 1 ? 'producto encontrado' : 'productos encontrados'}
        </p>

        {/* Layout: sidebar + grid */}
        <div className="flex gap-8 items-start">
          {/* Desktop sidebar */}
          <aside
            className="hidden lg:block w-[240px] shrink-0 sticky top-20"
            style={{ maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}
          >
            <FilterPanel filters={filters} />
          </aside>

          {/* Product grid */}
          <div className="flex-1 min-w-0">
            {filtered.length === 0 ? (
              <EmptyState onClear={filters.clearAll} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {filtered.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile filter drawer */}
      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
      />
    </div>
  )
}

// ─── Filter Panel (shared by sidebar + drawer) ─────────────────────────────────
function FilterPanel({ filters }) {
  return (
    <div className="space-y-7">
      {/* Clear all */}
      {filters.hasActiveFilters && (
        <button
          onClick={filters.clearAll}
          className="w-full py-2 rounded-lg text-xs uppercase tracking-widest font-medium transition-colors"
          style={{
            border: '1px solid var(--color-primary)',
            color: 'var(--color-primary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(204,0,0,0.08)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          Limpiar filtros
        </button>
      )}

      {/* Categories */}
      <div>
        <h3
          className="text-[11px] uppercase tracking-[0.15em] font-semibold mb-4"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Categoría
        </h3>
        <ul className="space-y-2.5">
          {categories.map((cat) => {
            const checked = filters.selectedCategories.includes(cat)
            return (
              <li key={cat}>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div
                    className="w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors"
                    style={{
                      backgroundColor: checked ? 'var(--color-primary)' : 'transparent',
                      border: `1.5px solid ${checked ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    }}
                    onClick={() => filters.toggleCategory(cat)}
                  >
                    {checked && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => filters.toggleCategory(cat)}
                    aria-label={cat}
                  />
                  <span
                    className="text-sm transition-colors"
                    style={{ color: checked ? 'var(--color-text)' : 'var(--color-text-muted)' }}
                  >
                    {cat}
                  </span>
                  <span
                    className="ml-auto text-[11px]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {products.filter((p) => p.category === cat).length}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Divider */}
      <div style={{ height: '1px', backgroundColor: 'var(--color-border)' }} />

      {/* Availability */}
      <div>
        <h3
          className="text-[11px] uppercase tracking-[0.15em] font-semibold mb-4"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Disponibilidad
        </h3>
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-sm" style={{ color: 'var(--color-text)' }}>
            Solo disponibles
          </span>
          {/* Toggle switch */}
          <div
            onClick={() => filters.set('stock', filters.onlyInStock ? null : '1')}
            className="relative w-10 h-6 rounded-full transition-colors duration-200 cursor-pointer"
            style={{
              backgroundColor: filters.onlyInStock ? 'var(--color-primary)' : 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
            }}
            role="switch"
            aria-checked={filters.onlyInStock}
          >
            <div
              className="absolute top-0.5 w-5 h-5 rounded-full transition-transform duration-200"
              style={{
                backgroundColor: '#fff',
                transform: filters.onlyInStock ? 'translateX(18px)' : 'translateX(1px)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
              }}
            />
          </div>
        </label>
      </div>

      {/* Divider */}
      <div style={{ height: '1px', backgroundColor: 'var(--color-border)' }} />

      {/* Price range */}
      <div>
        <h3
          className="text-[11px] uppercase tracking-[0.15em] font-semibold mb-4"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Precio
        </h3>
        <PriceRangeSlider
          min={PRICE_MIN}
          max={PRICE_MAX}
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

// ─── Price Range Dual Slider ───────────────────────────────────────────────────
function PriceRangeSlider({ min, max, value, onChange }) {
  const [lo, setLo] = useState(value[0])
  const [hi, setHi] = useState(value[1])
  const trackRef = useRef(null)

  useEffect(() => {
    setLo(value[0])
    setHi(value[1])
  }, [value[0], value[1]])

  const loPercent = ((lo - min) / (max - min)) * 100
  const hiPercent = ((hi - min) / (max - min)) * 100

  function handleLo(e) {
    const v = Math.min(Number(e.target.value), hi - 500)
    setLo(v)
    onChange([v, hi])
  }

  function handleHi(e) {
    const v = Math.max(Number(e.target.value), lo + 500)
    setHi(v)
    onChange([lo, v])
  }

  return (
    <div>
      <div className="flex justify-between mb-3">
        <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
          {fmt(lo)}
        </span>
        <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
          {fmt(hi)}
        </span>
      </div>

      <div
        ref={trackRef}
        className="relative h-1.5 rounded-full"
        style={{ backgroundColor: 'var(--color-border)' }}
      >
        {/* Filled track */}
        <div
          className="absolute h-full rounded-full pointer-events-none"
          style={{
            left: `${loPercent}%`,
            right: `${100 - hiPercent}%`,
            backgroundColor: 'var(--color-primary)',
          }}
        />
        {/* Min thumb */}
        <input
          type="range"
          min={min}
          max={max}
          step={500}
          value={lo}
          onChange={handleLo}
          className="range-thumb"
          aria-label="Precio mínimo"
        />
        {/* Max thumb */}
        <input
          type="range"
          min={min}
          max={max}
          step={500}
          value={hi}
          onChange={handleHi}
          className="range-thumb"
          aria-label="Precio máximo"
        />
      </div>
    </div>
  )
}

// ─── Mobile Filter Drawer ──────────────────────────────────────────────────────
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
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 lg:hidden transition-opacity duration-300"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        className="fixed left-0 top-0 h-full z-50 lg:hidden flex flex-col transition-transform duration-300 ease-in-out"
        style={{
          width: '300px',
          maxWidth: '85vw',
          backgroundColor: 'var(--color-surface)',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
        }}
        aria-label="Panel de filtros"
        aria-hidden={!open}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>Filtros</h2>
          <button
            onClick={onClose}
            className="p-1.5 transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
            aria-label="Cerrar filtros"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <FilterPanel filters={filters} />
        </div>

        {/* Footer */}
        <div
          className="shrink-0 px-6 py-4"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <button
            onClick={onClose}
            className="w-full py-3 rounded-lg text-sm font-medium transition-colors"
            style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
          >
            Ver resultados
          </button>
        </div>
      </aside>
    </>
  )
}

// ─── Empty State ───────────────────────────────────────────────────────────────
function EmptyState({ onClear }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5 text-center">
      <svg
        width="56"
        height="56"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </svg>
      <div>
        <p className="font-medium mb-1" style={{ color: 'var(--color-text)' }}>
          No encontramos productos con esos filtros
        </p>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Intentá con otros términos o eliminá algunos filtros
        </p>
      </div>
      <button
        onClick={onClear}
        className="px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
        style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
      >
        Limpiar filtros
      </button>
    </div>
  )
}

// ─── Icons ─────────────────────────────────────────────────────────────────────
function SearchIcon({ className }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: 'var(--color-text-muted)' }}
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </svg>
  )
}
