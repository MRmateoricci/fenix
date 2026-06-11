import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { getProductById, getProductsByCategory } from '../data/products'
import { useCart } from '../context/CartContext'
import ProductCard from '../components/ProductCard'

// Light-mode tokens — only this page
const PD = {
  bg:       '#F5F5F5',
  surface:  '#EBEBEB',
  text:     '#111111',
  muted:    '#555555',
  border:   '#E0E0E0',
}

const fmt = (n) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)

export default function ProductDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addItem } = useCart()
  const product = getProductById(id)

  const [qty, setQty]     = useState(1)
  const [added, setAdded] = useState(false)

  // ── Not found ────────────────────────────────────────────────────────────────
  if (!product) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[60vh] gap-6"
        style={{ backgroundColor: 'var(--color-bg)' }}
      >
        <p style={{ color: 'var(--color-text-muted)' }}>Producto no encontrado.</p>
        <button
          onClick={() => navigate('/products')}
          className="px-6 py-3 rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
        >
          Ver catálogo
        </button>
      </div>
    )
  }

  // ── Add to cart ──────────────────────────────────────────────────────────────
  function handleAdd() {
    if (!product.inStock || added) return
    for (let i = 0; i < qty; i++) {
      addItem({
        id:       product.id,
        name:     product.name,
        price:    product.price,
        image:    product.image,
        category: product.category,
      })
    }
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  // ── Related products (same category, exclude self, max 4) ────────────────────
  const related = getProductsByCategory(product.category)
    .filter((p) => p.id !== product.id)
    .slice(0, 4)

  // ── High-res image URL ───────────────────────────────────────────────────────
  const bigImage = product.image.replace('w=400&h=400', 'w=900&h=900')

  return (
    <>
      {/* ════════════════════════════════════════════════════════════════════════
          LIGHT SECTION — breadcrumb + main product layout
      ════════════════════════════════════════════════════════════════════════ */}
      <div style={{ backgroundColor: PD.bg }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">

          {/* Breadcrumb */}
          <nav
            className="flex items-center flex-wrap gap-1.5 text-sm mb-10"
            aria-label="Breadcrumb"
          >
            <Link
              to="/"
              className="transition-colors hover:underline"
              style={{ color: PD.muted }}
              onMouseEnter={(e) => (e.currentTarget.style.color = PD.text)}
              onMouseLeave={(e) => (e.currentTarget.style.color = PD.muted)}
            >
              Inicio
            </Link>
            <ChevronIcon color={PD.muted} />
            <Link
              to="/products"
              className="transition-colors hover:underline"
              style={{ color: PD.muted }}
              onMouseEnter={(e) => (e.currentTarget.style.color = PD.text)}
              onMouseLeave={(e) => (e.currentTarget.style.color = PD.muted)}
            >
              Productos
            </Link>
            <ChevronIcon color={PD.muted} />
            <Link
              to={`/products?category=${encodeURIComponent(product.category)}`}
              className="transition-colors hover:underline"
              style={{ color: PD.muted }}
              onMouseEnter={(e) => (e.currentTarget.style.color = PD.text)}
              onMouseLeave={(e) => (e.currentTarget.style.color = PD.muted)}
            >
              {product.category}
            </Link>
            <ChevronIcon color={PD.muted} />
            <span
              className="truncate max-w-[200px] sm:max-w-xs"
              style={{ color: PD.text }}
              aria-current="page"
            >
              {product.name}
            </span>
          </nav>

          {/* Two-column grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 pb-16 sm:pb-24">

            {/* ── Left: image ───────────────────────────────────────────────── */}
            <div className="lg:sticky lg:top-24 self-start">
              <div
                className="aspect-square rounded-2xl overflow-hidden"
                style={{ backgroundColor: PD.surface }}
              >
                <img
                  src={bigImage}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* ── Right: product info ────────────────────────────────────────── */}
            <div className="flex flex-col">

              {/* Category badge + stock badge */}
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span
                  className="inline-block px-3 py-1 rounded text-[11px] uppercase tracking-widest font-semibold"
                  style={{ backgroundColor: PD.surface, color: PD.muted }}
                >
                  {product.category}
                </span>
                {!product.inStock && (
                  <span
                    className="inline-block px-3 py-1 rounded text-[11px] uppercase tracking-widest font-semibold"
                    style={{ backgroundColor: '#FFE4E4', color: '#CC0000' }}
                  >
                    Sin stock
                  </span>
                )}
                {product.inStock && (
                  <span
                    className="inline-block px-3 py-1 rounded text-[11px] uppercase tracking-widest font-semibold"
                    style={{ backgroundColor: '#E4F5E9', color: '#166534' }}
                  >
                    En stock
                  </span>
                )}
              </div>

              {/* Product name */}
              <h1
                className="text-3xl sm:text-4xl font-bold leading-tight mb-5"
                style={{ fontFamily: 'var(--font-serif)', color: PD.text }}
              >
                {product.name}
              </h1>

              {/* Price */}
              <p
                className="text-4xl font-bold mb-6"
                style={{ color: PD.text, fontFamily: 'var(--font-sans)' }}
              >
                {fmt(product.price)}
              </p>

              {/* Divider */}
              <div
                className="mb-6"
                style={{ height: '1px', backgroundColor: PD.border }}
              />

              {/* Description */}
              <p
                className="text-base leading-relaxed mb-8"
                style={{ color: PD.muted }}
              >
                {product.description}
              </p>

              {/* Quantity selector — only when in stock */}
              {product.inStock && (
                <div className="flex items-center gap-4 mb-7">
                  <span className="text-sm font-medium" style={{ color: PD.text }}>
                    Cantidad
                  </span>
                  <div
                    className="inline-flex items-center rounded-lg overflow-hidden"
                    style={{ border: `1px solid ${PD.border}` }}
                  >
                    <button
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      disabled={qty <= 1}
                      className="w-11 h-11 flex items-center justify-center text-xl font-light transition-colors select-none"
                      style={{ color: qty <= 1 ? PD.border : PD.muted }}
                      onMouseEnter={(e) => {
                        if (qty > 1) e.currentTarget.style.backgroundColor = PD.surface
                      }}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      aria-label="Disminuir cantidad"
                    >
                      −
                    </button>
                    <span
                      className="w-12 text-center text-base font-semibold select-none"
                      style={{
                        color: PD.text,
                        borderLeft: `1px solid ${PD.border}`,
                        borderRight: `1px solid ${PD.border}`,
                      }}
                    >
                      {qty}
                    </span>
                    <button
                      onClick={() => setQty((q) => q + 1)}
                      className="w-11 h-11 flex items-center justify-center text-xl font-light transition-colors select-none"
                      style={{ color: PD.muted }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = PD.surface)}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      aria-label="Aumentar cantidad"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-sm" style={{ color: PD.muted }}>
                    Subtotal: {fmt(product.price * qty)}
                  </span>
                </div>
              )}

              {/* CTA buttons */}
              <div className="flex flex-col sm:flex-row gap-3 mb-8">
                {/* Add to cart */}
                <button
                  onClick={handleAdd}
                  disabled={!product.inStock || added}
                  className="flex-1 py-4 text-sm font-semibold rounded-xl tracking-wide transition-all duration-200 flex items-center justify-center gap-2"
                  style={
                    added
                      ? { backgroundColor: '#166534', color: '#fff', cursor: 'default' }
                      : product.inStock
                        ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                        : { backgroundColor: PD.border, color: PD.muted, cursor: 'not-allowed' }
                  }
                  onMouseEnter={(e) => {
                    if (product.inStock && !added)
                      e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)'
                  }}
                  onMouseLeave={(e) => {
                    if (product.inStock && !added)
                      e.currentTarget.style.backgroundColor = 'var(--color-primary)'
                  }}
                >
                  {added ? (
                    <>
                      <CheckIcon />
                      Agregado al carrito
                    </>
                  ) : product.inStock ? (
                    <>
                      <CartIcon />
                      Agregar al carrito
                    </>
                  ) : (
                    'Sin stock'
                  )}
                </button>

                {/* WhatsApp */}
                <a
                  href={`https://wa.me/5491122334455?text=Hola!%20Quiero%20consultar%20sobre%20${encodeURIComponent(product.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-4 text-sm font-semibold rounded-xl tracking-wide transition-all duration-200 flex items-center justify-center gap-2"
                  style={{ border: `1.5px solid ${PD.border}`, color: PD.text, backgroundColor: 'transparent' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = PD.text
                    e.currentTarget.style.backgroundColor = PD.surface
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = PD.border
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <WhatsAppIcon />
                  Consultar por WhatsApp
                </a>
              </div>

              {/* Info chips */}
              <div className="flex flex-wrap gap-2">
                {[
                  'Retiro en local',
                  'Asesoramiento incluido',
                  'Garantía de fábrica',
                ].map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
                    style={{ backgroundColor: PD.surface, color: PD.muted }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          DARK SECTION — related products
      ════════════════════════════════════════════════════════════════════════ */}
      {related.length > 0 && (
        <section
          className="py-20 sm:py-24"
          style={{ backgroundColor: 'var(--color-bg)' }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex items-end justify-between mb-10">
              <div>
                <p
                  className="text-xs uppercase tracking-[0.18em] font-medium mb-2"
                  style={{ color: 'var(--color-primary)' }}
                >
                  {product.category}
                </p>
                <h2
                  className="text-2xl sm:text-3xl font-bold"
                  style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-text)' }}
                >
                  Productos relacionados
                </h2>
              </div>
              <Link
                to={`/products?category=${encodeURIComponent(product.category)}`}
                className="hidden sm:inline-flex items-center gap-1.5 text-sm transition-colors"
                style={{ color: 'var(--color-text-muted)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
              >
                Ver todos
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
            </div>

            <div
              className="grid gap-5"
              style={{
                gridTemplateColumns: `repeat(${Math.min(related.length, 4)}, minmax(0, 1fr))`,
              }}
            >
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  )
}

// ─── Inline icons ──────────────────────────────────────────────────────────────
function ChevronIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function CartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 01-8 0" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M11.99 2C6.477 2 2 6.477 2 11.99c0 1.77.463 3.435 1.275 4.884L2 22l5.274-1.256A9.934 9.934 0 0011.99 21.98C17.503 21.98 22 17.503 22 11.99 22 6.477 17.503 2 11.99 2zm0 18.18a8.183 8.183 0 01-4.17-1.142l-.299-.177-3.097.738.768-3.015-.196-.31A8.194 8.194 0 013.79 11.99c0-4.524 3.683-8.207 8.2-8.207 4.524 0 8.207 3.683 8.207 8.207s-3.683 8.19-8.207 8.19z" />
    </svg>
  )
}
