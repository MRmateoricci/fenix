import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'

const fmt = (n) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)

export default function Cart() {
  const { items, removeItem, updateQuantity, totalPrice } = useCart()
  const navigate = useNavigate()

  if (items.length === 0) {
    return (
      <div
        className="min-h-[70vh] flex flex-col items-center justify-center gap-7 px-4 text-center"
        style={{ backgroundColor: 'var(--color-bg)' }}
      >
        <EmptyCartIllustration />
        <div>
          <h2
            className="text-2xl font-bold mb-2"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-text)' }}
          >
            Tu carrito está vacío
          </h2>
          <p style={{ color: 'var(--color-text-muted)' }}>
            Todavía no agregaste ningún producto.
          </p>
        </div>
        <Link
          to="/products"
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
        >
          Ver productos
        </Link>
      </div>
    )
  }

  return (
    <div style={{ backgroundColor: 'var(--color-bg)', minHeight: '100vh' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 pb-20">

        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <h1
            className="text-3xl sm:text-4xl font-bold"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-text)' }}
          >
            Mi carrito
          </h1>
          <Link
            to="/products"
            className="hidden sm:inline-flex items-center gap-1.5 text-sm transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
          >
            <ArrowLeftIcon />
            Seguir comprando
          </Link>
        </div>

        {/* Main layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

          {/* ── Items list ─────────────────────────────────────────────────── */}
          <div className="lg:col-span-2">
            {/* Header row */}
            <div
              className="hidden sm:grid grid-cols-[1fr_auto] gap-4 pb-3 mb-1 text-[11px] uppercase tracking-widest font-semibold"
              style={{ color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}
            >
              <span>Producto</span>
              <span className="text-right">Subtotal</span>
            </div>

            <ul>
              {items.map((item) => (
                <CartItem
                  key={item.id}
                  item={item}
                  onRemove={() => removeItem(item.id)}
                  onQtyChange={(q) => updateQuantity(item.id, q)}
                />
              ))}
            </ul>

            {/* Mobile "seguir comprando" */}
            <Link
              to="/products"
              className="sm:hidden inline-flex items-center gap-1.5 text-sm mt-6 transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
            >
              <ArrowLeftIcon />
              Seguir comprando
            </Link>
          </div>

          {/* ── Order summary ─────────────────────────────────────────────── */}
          <div className="lg:col-span-1">
            <div
              className="rounded-xl p-6 sticky top-20"
              style={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
              }}
            >
              <h2
                className="font-semibold text-lg mb-6"
                style={{ color: 'var(--color-text)' }}
              >
                Resumen del pedido
              </h2>

              <div className="space-y-3 mb-6">
                <SummaryRow
                  label={`Subtotal (${items.reduce((s, i) => s + i.quantity, 0)} artículos)`}
                  value={fmt(totalPrice)}
                />
                <SummaryRow
                  label="Envío"
                  value="A confirmar"
                  valueStyle={{ color: 'var(--color-text-muted)', fontSize: '12px' }}
                />
              </div>

              <div
                className="flex items-center justify-between py-4 mb-6"
                style={{ borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}
              >
                <span className="font-semibold text-base" style={{ color: 'var(--color-text)' }}>
                  Total
                </span>
                <span className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
                  {fmt(totalPrice)}
                </span>
              </div>

              <p className="text-xs text-center mb-5" style={{ color: 'var(--color-text-muted)' }}>
                El costo de envío se confirma al finalizar el pedido.
              </p>

              <button
                onClick={() => navigate('/checkout')}
                className="w-full py-4 rounded-xl text-sm font-semibold tracking-wide transition-colors"
                style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
              >
                Proceder al pago
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Cart Item Row ─────────────────────────────────────────────────────────────
function CartItem({ item, onRemove, onQtyChange }) {
  return (
    <li
      className="flex gap-4 py-6"
      style={{ borderBottom: '1px solid var(--color-border)' }}
    >
      {/* Thumbnail */}
      <Link to={`/products/${item.id}`} className="shrink-0">
        <img
          src={item.image}
          alt={item.name}
          className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-lg transition-opacity hover:opacity-80"
          style={{ backgroundColor: 'var(--color-surface-2)' }}
        />
      </Link>

      {/* Details */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <Link
            to={`/products/${item.id}`}
            className="text-sm font-medium leading-snug line-clamp-2 transition-colors hover:underline"
            style={{ color: 'var(--color-text)' }}
          >
            {item.name}
          </Link>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            {item.category}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {fmt(item.price)} c/u
          </p>
        </div>

        {/* Quantity controls */}
        <div className="flex items-center gap-3 mt-3">
          <div
            className="inline-flex items-center rounded-lg overflow-hidden"
            style={{ border: '1px solid var(--color-border)' }}
          >
            <button
              onClick={() => onQtyChange(item.quantity - 1)}
              className="w-8 h-8 flex items-center justify-center text-lg leading-none transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-surface-2)'
                e.currentTarget.style.color = 'var(--color-text)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = 'var(--color-text-muted)'
              }}
              aria-label="Disminuir"
            >
              −
            </button>
            <span
              className="w-8 text-center text-sm font-semibold"
              style={{ color: 'var(--color-text)', borderLeft: '1px solid var(--color-border)', borderRight: '1px solid var(--color-border)' }}
            >
              {item.quantity}
            </span>
            <button
              onClick={() => onQtyChange(item.quantity + 1)}
              className="w-8 h-8 flex items-center justify-center text-lg leading-none transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-surface-2)'
                e.currentTarget.style.color = 'var(--color-text)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = 'var(--color-text-muted)'
              }}
              aria-label="Aumentar"
            >
              +
            </button>
          </div>

          <button
            onClick={onRemove}
            className="flex items-center gap-1 text-xs transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
            aria-label={`Eliminar ${item.name}`}
          >
            <TrashIcon />
            Eliminar
          </button>
        </div>
      </div>

      {/* Line total */}
      <div className="shrink-0 text-right">
        <p className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
          {fmt(item.price * item.quantity)}
        </p>
      </div>
    </li>
  )
}

// ─── Summary Row ───────────────────────────────────────────────────────────────
function SummaryRow({ label, value, valueStyle }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: 'var(--color-text)', ...valueStyle }}>
        {value}
      </span>
    </div>
  )
}

// ─── Empty cart illustration ───────────────────────────────────────────────────
function EmptyCartIllustration() {
  return (
    <svg
      width="120"
      height="120"
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ color: 'var(--color-surface-2)' }}
    >
      <circle cx="60" cy="60" r="56" stroke="var(--color-border)" strokeWidth="2" />
      <path
        d="M38 42l-6 8v28a4 4 0 004 4h48a4 4 0 004-4V50l-6-8H38z"
        stroke="var(--color-text-muted)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="32" y1="50" x2="88" y2="50" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M72 58a12 12 0 01-24 0"
        stroke="var(--color-text-muted)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

// ─── Icons ─────────────────────────────────────────────────────────────────────
function ArrowLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  )
}
