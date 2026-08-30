import { useState, useMemo, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { CATEGORY_NAV_LABEL } from '../data/products'
import { getCategoryValue, getSubcategoryOptions, getProductTypeOptions } from '../data/categoryTree'
import { useAdmin } from '../context/AdminContext'
import ProductCard from '../components/ProductCard'
import PageSEO from '../components/SEO'
import electricidadImg from '../assets/elec.png'
import iluminacionImg from '../assets/ilu.png'
import herramientasImg from '../assets/her.png'
import automatizacionImg from '../assets/autom.png'
import promocionImg from '../assets/pro.png'
import catalogoImg from '../assets/cat.png'

const CATEGORY_IMAGE = {
  'Electricidad':                electricidadImg,
  'Herramientas':                herramientasImg,
  'Iluminación':                 iluminacionImg,
  'Automatización Industrial':   automatizacionImg,
  'Promociones':                 promocionImg,
  'Catálogo':                    catalogoImg,
}

const CATEGORY_IMAGE_POSITION = {
  'Electricidad':               'left 75%',
  'Herramientas':                'left 75%',
  'Iluminación':                 'left 78%',
  'Automatización Industrial':   'left 82%',
  'Promociones':                 'left 80%',
  'Catálogo':                    'left 80%',
}

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
const PRICE_STEP = 10000

const SORT_OPTIONS = [
  { value: 'default',    label: 'Novedades'            },
  { value: 'price-asc',  label: 'Precio: menor a mayor' },
  { value: 'price-desc', label: 'Precio: mayor a menor' },
  { value: 'name-az',    label: 'Nombre: A–Z'           },
]

const fmt = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

// ─── URL param helpers ─────────────────────────────────────────────────────────
function useFilterParams(priceMax) {
  const [searchParams, setSearchParams] = useSearchParams()

  const query              = searchParams.get('q') || ''
  const selectedCategories = searchParams.getAll('category')
  const sub                = searchParams.get('sub') || ''
  const productType        = searchParams.get('ctype') || searchParams.get('type') || ''
  const onlyEntregaInmediata = searchParams.get('inmediato') === '1'
  const sortBy             = searchParams.get('sort') || 'default'
  const minPrice           = Math.max(PRICE_MIN, Number(searchParams.get('min')) || PRICE_MIN)
  const maxPrice           = Math.min(priceMax, Number(searchParams.get('max')) || priceMax)
  const selectedColorTemps = searchParams.getAll('ct').map(Number)
  const selectedIPs        = searchParams.getAll('ip')

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

  function toggleMulti(key, val) {
    const p = new URLSearchParams(searchParams)
    const current = p.getAll(key)
    p.delete(key)
    if (current.includes(String(val))) current.filter(v => v !== String(val)).forEach(v => p.append(key, v))
    else [...current, String(val)].forEach(v => p.append(key, v))
    setSearchParams(p, { replace: true })
  }

  function clearAll() { setSearchParams({}, { replace: true }) }

  function selectCategory(cat) {
    const p = new URLSearchParams()
    if (cat) p.set('category', cat)
    setSearchParams(p, { replace: true })
  }

  // El tipo de cable es una sub-elección de `sub` (solo aplica dentro de
  // "Cables Normalizados") — cambiar de subcategoría lo invalida.
  function setSub(value) {
    const p = new URLSearchParams(searchParams)
    if (value == null || value === '') p.delete('sub')
    else p.set('sub', value)
    p.delete('ctype')
    p.delete('type')
    setSearchParams(p, { replace: true })
  }

  function setProductType(value) {
    const p = new URLSearchParams(searchParams)
    p.delete('ctype')
    p.delete('type')
    if (value) p.set(sub === 'Cables Normalizados' ? 'ctype' : 'type', value)
    setSearchParams(p, { replace: true })
  }

  const hasActiveFilters =
    query !== '' || selectedCategories.length > 0 || sub !== '' || productType !== '' || onlyEntregaInmediata ||
    sortBy !== 'default' || minPrice > PRICE_MIN || maxPrice < priceMax ||
    selectedColorTemps.length > 0 || selectedIPs.length > 0

  return { query, selectedCategories, sub, productType, onlyEntregaInmediata, sortBy, minPrice, maxPrice, priceMax, selectedColorTemps, selectedIPs, set, setSub, setProductType, toggleCategory, toggleMulti, clearAll, selectCategory, hasActiveFilters }
}

// ─── Breadcrumb + title ────────────────────────────────────────────────────────
function CatalogHeader({ filters, categoryTree }) {
  const navigate = useNavigate()
  // Derive labels from active filters
  const activeCategory = filters.selectedCategories[0] || null
  const categoryNode = activeCategory ? categoryTree.find(node => getCategoryValue(node) === activeCategory) : null
  const catLabel  = categoryNode?.label || (activeCategory ? CATEGORY_NAV_LABEL[activeCategory] : null)
  const subLabel  = filters.sub || null
  const pageTitle = subLabel || catLabel || 'Catálogo'
  const headerImgKey = activeCategory ? (categoryNode?._taxonomy?.category || activeCategory) : 'Catálogo'
  const headerImg = CATEGORY_IMAGE[headerImgKey]
  const headerImgPosition = CATEGORY_IMAGE_POSITION[headerImgKey] || 'left center'

  return (
    <div className="fnx-catalog-header" style={{ position: 'relative', padding: '96px 0 32px', borderBottom: `1px solid ${T.hairline}`, marginBottom: 36 }}>
      {headerImg && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', top: 0, bottom: 0,
            left: '50%', transform: 'translateX(-50%)',
            width: 'min(100vw, 1920px)',
            backgroundImage: `url(${headerImg})`,
            backgroundSize: 'cover',
            backgroundPosition: headerImgPosition,
            zIndex: 0,
          }}
        />
      )}
      {/* Breadcrumb */}
      <div className="fnx-catalog-breadcrumb" style={{
        position: 'relative', zIndex: 1,
        display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 11, letterSpacing: '.10em', textTransform: 'uppercase',
        color: T.ink, marginBottom: 18,
      }}>
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); navigate('/') }}
          style={{ textDecoration: 'none', color: T.ink, transition: 'color .15s' }}
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
      <h1 className="fnx-catalog-title" style={{
        position: 'relative', zIndex: 1,
        fontFamily: 'var(--font-sans)',
        fontWeight: 400, fontSize: 'clamp(40px, 5vw, 68px)',
        lineHeight: 0.96, letterSpacing: '-.01em',
        color: T.ink, margin: 0,
      }}>
        {pageTitle}
      </h1>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function Products() {
  const { products, categoryTree } = useAdmin()
  const priceMax = useMemo(
    () => Math.max(PRICE_STEP, Math.ceil(Math.max(0, ...products.map(p => p.price)) / PRICE_STEP) * PRICE_STEP),
    [products]
  )
  const filters = useFilterParams(priceMax)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const activeCategoryForSubs = filters.selectedCategories.length === 1 ? filters.selectedCategories[0] : null

  useEffect(() => { setMobileFiltersOpen(false) }, [activeCategoryForSubs])
  const filtered = useMemo(() => {
    let list = products
    if (filters.query) {
      const q = filters.query.toLowerCase()
      // `description` llega null desde /api/catalog cuando el producto no tiene
      // descripción larga cargada — sin el guard, buscar tira y deja la página en blanco.
      list = list.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      )
    }
    if (filters.selectedCategories.length > 0)
      list = list.filter(p => filters.selectedCategories.some(c =>
        c === 'Promociones' ? !!p.originalPrice : p.category === c
      ))
    if (filters.sub)
      list = list.filter(p => p.subcategory === filters.sub)
    if (filters.productType)
      list = list.filter(p => (p.productType || p.cableType) === filters.productType)
    if (filters.onlyEntregaInmediata)
      list = list.filter(p => p.stockInmediato)
    if (filters.selectedColorTemps.length > 0)
      list = list.filter(p => p.colorTemp != null && filters.selectedColorTemps.includes(p.colorTemp))
    if (filters.selectedIPs.length > 0)
      list = list.filter(p => p.ipRating != null && filters.selectedIPs.includes(p.ipRating))
    list = list.filter(p => p.price >= filters.minPrice && p.price <= filters.maxPrice)
    switch (filters.sortBy) {
      case 'price-asc':  return [...list].sort((a, b) => a.price - b.price)
      case 'price-desc': return [...list].sort((a, b) => b.price - a.price)
      case 'name-az':    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'es'))
      default:           return list
    }
  }, [products, filters.query, filters.selectedCategories, filters.sub, filters.productType, filters.onlyEntregaInmediata, filters.sortBy, filters.minPrice, filters.maxPrice, filters.selectedColorTemps, filters.selectedIPs])

  const seoCategory = filters.selectedCategories.length === 1 ? filters.selectedCategories[0] : null
  const seoTitle = seoCategory
    ? `${seoCategory} en City Bell, La Plata`
    : filters.query
      ? `Buscar: "${filters.query}" — Catálogo`
      : 'Catálogo de iluminación y electricidad'
  const seoDesc = seoCategory
    ? `Comprá ${seoCategory.toLowerCase()} en Fénix Iluminación, City Bell, La Plata. Asesoramiento experto, envíos y retiro en local. Desde 1977.`
    : 'Catálogo completo de luminarias, materiales eléctricos y tiras LED en Fénix Iluminación, City Bell, La Plata. Desde 1977.'

  return (
    <>
    <PageSEO title={seoTitle} description={seoDesc} url="/products" />
    <div style={{ background: T.paper, minHeight: '100vh', color: T.ink, overflowX: 'hidden' }}>
      <div className="fnx-products-page" style={{ maxWidth: 1320, margin: '0 auto', padding: '0 40px 80px' }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <CatalogHeader filters={filters} categoryTree={categoryTree} />

        {/* ── Category tabs ───────────────────────────────────────────────── */}
        <CategoryTabs filters={filters} />

        {/* ── Subcategory + product type filters (hidden on mobile, moved into the drawer below) ── */}
        <div className="fnx-products-inline-filters">
          <SubcategoryTabs filters={filters} />
          <ProductTypeTabs filters={filters} />
        </div>

        {/* ── Search + sort row ───────────────────────────────────────────── */}
        <div className="fnx-products-toolbar" style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search */}
          <div className="fnx-products-search" style={{ position: 'relative', flex: '1 1 280px' }}>
            <svg
              viewBox="0 0 24 24" width="15" height="15" fill="none"
              stroke={T.muted2} strokeWidth="1.7" strokeLinecap="round"
              style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            >
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.4-3.4" />
            </svg>
            <input
              className="fnx-products-search__input"
              type="search"
              placeholder="Buscar productos…"
              value={filters.query}
              onChange={(e) => filters.set('q', e.target.value || null)}
              style={{
                width: '100%', paddingLeft: 38, paddingRight: 14,
                paddingTop: 11, paddingBottom: 11,
                background: T.panel, border: `1px solid ${T.hairline}`,
                borderRadius: 2, outline: 'none',
                fontFamily: "var(--font-sans)",
                fontSize: 13.5, color: T.ink,
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = T.hairlineStrong)}
              onBlur={(e)  => (e.currentTarget.style.borderColor = T.hairline)}
            />
          </div>

          {/* Sort */}
          <select
            className="fnx-products-sort"
            value={filters.sortBy}
            onChange={(e) => filters.set('sort', e.target.value)}
            style={{
              padding: '11px 14px',
              background: T.panel, border: `1px solid ${T.hairline}`,
              borderRadius: 2, outline: 'none', cursor: 'pointer',
              fontFamily: "var(--font-sans)",
              fontSize: 13.5, color: T.ink,
              minWidth: 220,
            }}
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          {/* Mobile filter toggle (< 768px only) */}
          <button
            type="button"
            className="fnx-products-filter-toggle"
            onClick={() => setMobileFiltersOpen(true)}
            style={{
              alignItems: 'center', gap: 8,
              padding: '11px 16px', marginBottom: 24,
              border: `1px solid ${T.hairline}`, borderRadius: 2,
              background: T.panel, color: T.ink, cursor: 'pointer',
              fontFamily: "var(--font-sans)", fontSize: 13.5, fontWeight: 500,
            }}
          >
            <FilterIcon />
            Filtrar
          </button>
        </div>

        {/* Count */}
        <div className="fnx-products-count" style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 12, color: T.muted2, marginBottom: 32,
        }}>
          {filtered.length} {filtered.length === 1 ? 'producto encontrado' : 'productos encontrados'}
        </div>

        {/* ── Product grid ────────────────────────────────────────────────── */}
        {filtered.length === 0
          ? <EmptyState onClear={filters.clearAll} />
          : (
            <div className="fnx-products-grid" style={{
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

    <MobileFilterDrawer
      open={mobileFiltersOpen}
      onClose={() => setMobileFiltersOpen(false)}
      filters={filters}
      products={products}
    />
    </>
  )
}

// ─── Category tabs ─────────────────────────────────────────────────────────────
function CategoryTabs({ filters }) {
  const { categoryTree } = useAdmin()
  const activeCategory = filters.sub
    ? filters.selectedCategories[0] || null
    : filters.selectedCategories.length === 1 ? filters.selectedCategories[0] : null

  const tabs = [
    { label: 'Todos', value: null },
    ...categoryTree.map(node => ({ label: node.label, value: getCategoryValue(node) })),
  ]

  return (
    <div className="fnx-products-categories" style={{ position: 'relative', marginBottom: 28 }}>
      <div className="fnx-products-categories__rail" style={{
        display: 'flex', gap: 0,
        borderBottom: `1px solid ${T.hairline}`,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}>
        {tabs.map(tab => {
          const isActive = tab.value === null
            ? !activeCategory && !filters.sub
            : activeCategory === tab.value

          return (
            <button
              className="fnx-products-category-tab"
              key={tab.label}
              onClick={() => filters.selectCategory(tab.value)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '13px 22px',
                fontFamily: "var(--font-sans)",
                fontSize: 13.5, fontWeight: isActive ? 500 : 400,
                color: isActive ? T.ink : T.muted,
                borderBottom: `2px solid ${isActive ? T.ink : 'transparent'}`,
                marginBottom: -1,
                whiteSpace: 'nowrap',
                flexShrink: 0,
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
      {/* Mobile-only hint that the tab row scrolls sideways */}
      <div
        aria-hidden="true"
        className="fnx-cat-tabs-fade"
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: 36,
          background: `linear-gradient(90deg, transparent, ${T.paper} 75%)`,
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M8 12h8M11 18h2" />
    </svg>
  )
}

// ─── Subcategory tabs ──────────────────────────────────────────────────────────
function SubcategoryTabs({ filters }) {
  const { categoryTree } = useAdmin()
  const activeCategory = filters.selectedCategories.length === 1 ? filters.selectedCategories[0] : null
  const subs = activeCategory ? getSubcategoryOptions(activeCategory, categoryTree) : []
  if (!subs.length) return null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
      {subs.map((sub) => {
        const isActive = filters.sub === sub.label
        return (
          <button
            key={sub.label}
            onClick={() => filters.setSub(isActive ? null : sub.label)}
            style={{
              padding: '8px 16px', borderRadius: 999, cursor: 'pointer',
              border: `1px solid ${isActive ? T.ink : T.hairline}`,
              background: isActive ? T.ink : 'transparent',
              color: isActive ? T.paper : T.muted,
              fontFamily: "var(--font-sans)",
              fontSize: 13, fontWeight: isActive ? 500 : 400,
              whiteSpace: 'nowrap',
              transition: 'background .15s, border-color .15s, color .15s',
            }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.borderColor = T.hairlineStrong }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.borderColor = T.hairline }}
          >
            {sub.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Level-3 tabs — sourced from the same tree as the header menu ─────────────
function ProductTypeTabs({ filters }) {
  const { categoryTree } = useAdmin()
  const activeCategory = filters.selectedCategories.length === 1 ? filters.selectedCategories[0] : null
  const types = activeCategory && filters.sub
    ? getProductTypeOptions(activeCategory, filters.sub, categoryTree)
    : []
  if (!types.length) return null

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap',
      borderTop: `2px solid ${T.amber}`, borderBottom: `1px solid ${T.hairline}`,
      background: T.panel,
      marginBottom: 28,
    }}>
      {types.map((type) => {
        const isActive = filters.productType === type.label
        return (
          <button
            key={type.label}
            onClick={() => filters.setProductType(isActive ? null : type.label)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '14px 22px',
              fontFamily: "var(--font-sans)",
              fontSize: 13.5, fontWeight: isActive ? 600 : 400,
              color: isActive ? T.ink : T.muted,
              borderBottom: `2px solid ${isActive ? T.ink : 'transparent'}`,
              marginBottom: -1,
              whiteSpace: 'nowrap',
              transition: 'color .15s, border-color .15s',
            }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = T.ink2 }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = T.muted }}
          >
            {type.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Mobile filter drawer (< 768px only) ─────────────────────────────────────
function MobileFilterDrawer({ open, onClose, filters, products }) {
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
        className="fnx-mobile-filter-backdrop"
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 60,
          background: 'rgba(22,17,11,0.5)',
          opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity .3s ease',
        }}
      />
      <aside
        className="fnx-mobile-filter-panel"
        aria-label="Filtrar productos"
        aria-hidden={!open}
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 61,
          maxHeight: '78vh',
          display: 'flex', flexDirection: 'column',
          background: T.paper,
          borderRadius: '14px 14px 0 0',
          boxShadow: '0 -8px 40px rgba(22,17,11,0.22)',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform .32s cubic-bezier(0.32,0,0.15,1)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px', borderBottom: `1px solid ${T.hairline}`, flexShrink: 0,
        }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: 18, color: T.ink }}>
            Filtrar
          </span>
          <button
            onClick={onClose}
            aria-label="Cerrar filtros"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted, display: 'flex', padding: 4 }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="fnx-mobile-filter-content" style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 8px' }}>
          <SubcategoryTabs filters={filters} />
          <ProductTypeTabs filters={filters} />
          <FilterPanel filters={filters} products={products} />
        </div>
        <div style={{ padding: '14px 20px', borderTop: `1px solid ${T.hairline}`, flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 2,
              background: T.ink, color: T.paper, border: 'none', cursor: 'pointer',
              fontFamily: "var(--font-sans)",
              fontSize: 13.5, fontWeight: 500, letterSpacing: '.04em',
            }}
          >
            Ver resultados
          </button>
        </div>
      </aside>
    </>
  )
}

// ─── Filter Panel ──────────────────────────────────────────────────────────────
function FilterPanel({ filters, products }) {
  const { categoryTree } = useAdmin()
  const categoryOptions = categoryTree.map(node => ({ value: getCategoryValue(node), label: node.label }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {filters.hasActiveFilters && (
        <button
          onClick={filters.clearAll}
          style={{
            width: '100%', padding: '9px 0', borderRadius: 2,
            border: `1px solid ${T.hairlineStrong}`, background: 'transparent',
            color: T.text3,
            fontFamily: "var(--font-sans)",
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
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: T.muted2, marginBottom: 14 }}>
          Categoría
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {categoryOptions.map(cat => {
            const checked = filters.selectedCategories.includes(cat.value)
            return (
              <label key={cat.value} style={{ display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer' }}>
                <div
                  onClick={() => filters.toggleCategory(cat.value)}
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
                <input type="checkbox" checked={checked} onChange={() => filters.toggleCategory(cat.value)} style={{ display: 'none' }} />
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 13.5, color: checked ? T.ink : T.muted, transition: 'color .15s' }}>
                  {cat.label}
                </span>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: T.muted2, marginLeft: 'auto' }}>
                  {products.filter(p => p.category === cat.value).length}
                </span>
              </label>
            )
          })}
        </div>
      </div>

      <div style={{ height: 1, background: T.hairline }} />

      {/* Availability */}
      <div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: T.muted2, marginBottom: 14 }}>
          Disponibilidad
        </div>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13.5, color: T.ink }}>
            Solo entrega inmediata
          </span>
          <div
            onClick={() => filters.set('inmediato', filters.onlyEntregaInmediata ? null : '1')}
            style={{
              position: 'relative', width: 38, height: 22, borderRadius: 11,
              background: filters.onlyEntregaInmediata ? T.ink : T.surface2,
              border: `1px solid ${T.hairlineStrong}`,
              cursor: 'pointer', transition: 'background .2s',
            }}
            role="switch" aria-checked={filters.onlyEntregaInmediata}
          >
            <div style={{
              position: 'absolute', top: 2,
              width: 16, height: 16, borderRadius: '50%',
              background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              transform: filters.onlyEntregaInmediata ? 'translateX(18px)' : 'translateX(2px)',
              transition: 'transform .2s',
            }} />
          </div>
        </label>
      </div>

      <div style={{ height: 1, background: T.hairline }} />

      {/* Price */}
      <div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: T.muted2, marginBottom: 14 }}>
          Precio
        </div>
        <PriceRangeSlider
          min={PRICE_MIN} max={filters.priceMax}
          value={[filters.minPrice, filters.maxPrice]}
          onChange={([lo, hi]) => {
            filters.set('min', lo > PRICE_MIN ? lo : null)
            filters.set('max', hi < filters.priceMax ? hi : null)
          }}
        />
      </div>

      <div style={{ height: 1, background: T.hairline }} />

      {/* Temperatura de color */}
      <div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: T.muted2, marginBottom: 14 }}>
          Temperatura de color
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { value: 2700, label: 'Cálido 2700 K' },
            { value: 3000, label: 'Cálido 3000 K' },
            { value: 4000, label: 'Neutro 4000 K' },
            { value: 6500, label: 'Frío 6500 K' },
          ].map(({ value, label }) => {
            const checked = filters.selectedColorTemps.includes(value)
            return (
              <label key={value} style={{ display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer' }}>
                <div
                  onClick={() => filters.toggleMulti('ct', value)}
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
                <input type="checkbox" checked={checked} onChange={() => filters.toggleMulti('ct', value)} style={{ display: 'none' }} />
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 13.5, color: checked ? T.ink : T.muted, transition: 'color .15s' }}>
                  {label}
                </span>
              </label>
            )
          })}
        </div>
      </div>

      <div style={{ height: 1, background: T.hairline }} />

      {/* Grado IP */}
      <div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: T.muted2, marginBottom: 14 }}>
          Protección (IP)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {['IP20', 'IP40', 'IP44', 'IP54', 'IP65', 'IP66'].map((ip) => {
            const checked = filters.selectedIPs.includes(ip)
            return (
              <label key={ip} style={{ display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer' }}>
                <div
                  onClick={() => filters.toggleMulti('ip', ip)}
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
                <input type="checkbox" checked={checked} onChange={() => filters.toggleMulti('ip', ip)} style={{ display: 'none' }} />
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 13.5, color: checked ? T.ink : T.muted, transition: 'color .15s' }}>
                  {ip}
                </span>
              </label>
            )
          })}
        </div>
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
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: T.ink }}>{fmt(lo)}</span>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: T.ink }}>{fmt(hi)}</span>
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
          <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: 20, color: T.ink }}>Filtros</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted, display: 'flex', padding: 4 }} aria-label="Cerrar">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px' }}>
          <FilterPanel filters={filters} products={products} />
        </div>
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${T.hairline}` }}>
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 2,
              background: T.ink, color: T.paper, border: 'none', cursor: 'pointer',
              fontFamily: "var(--font-sans)",
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
        <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: 22, color: T.ink, marginBottom: 8 }}>
          Sin resultados
        </p>
        <p style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: T.muted }}>
          Intentá con otros términos o eliminá algunos filtros
        </p>
      </div>
      <button
        onClick={onClear}
        style={{
          padding: '11px 26px', borderRadius: 2,
          border: `1px solid ${T.hairlineStrong}`, background: 'transparent',
          color: T.ink, cursor: 'pointer',
          fontFamily: "var(--font-sans)",
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
