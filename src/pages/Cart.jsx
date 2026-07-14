import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import PageSEO from '../components/SEO'

const T = {
  paper:          '#F7F4EF',
  panel:          '#FBF8F3',
  surface2:       '#E7E0D3',
  ink:            '#16110B',
  text3:          '#6B6051',
  muted:          '#8A8175',
  muted2:         '#9A917F',
  hairline:       '#DED6C7',
  hairlineStrong: '#C9BFAF',
  red:            '#CC0000',
  redHover:       '#AA0000',
}

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
      <>
      <PageSEO title="Tu carrito" description="Revisá y completá tu pedido en Fénix Iluminación." url="/cart" />
      <div style={{
        background: T.paper, minHeight: '70vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 28, padding: '40px 24px', textAlign: 'center',
      }}>
        <EmptyCartIllustration />
        <div>
          <h2 style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 400, fontSize: 28, color: T.ink,
            margin: '0 0 8px',
          }}>
            Tu carrito está vacío
          </h2>
          <p style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14, color: T.muted, margin: 0 }}>
            Todavía no agregaste ningún producto.
          </p>
        </div>
        <Link
          to="/products"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '13px 32px',
            background: T.ink, color: T.paper,
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 13, fontWeight: 500, letterSpacing: '.06em',
            textDecoration: 'none', borderRadius: 2,
            transition: 'background .2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = T.text3)}
          onMouseLeave={(e) => (e.currentTarget.style.background = T.ink)}
        >
          Ver productos
        </Link>
      </div>
      </>
    )
  }

  return (
    <>
    <PageSEO title="Tu carrito" description="Revisá y completá tu pedido en Fénix Iluminación." url="/cart" />
    <div style={{ background: T.paper, minHeight: '100vh' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '80px 40px 100px' }}>

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 48 }}>
          <h1 style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 400, fontSize: 'clamp(36px, 4vw, 58px)',
            lineHeight: 1, letterSpacing: '-.01em',
            color: T.ink, margin: 0,
          }}>
            Mi carrito
          </h1>
          <Link
            to="/products"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 13, color: T.muted,
              textDecoration: 'none', transition: 'color .15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = T.ink)}
            onMouseLeave={(e) => (e.currentTarget.style.color = T.muted)}
          >
            <ArrowLeftIcon />
            Seguir comprando
          </Link>
        </div>

        {/* ── Main layout ──────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 48, alignItems: 'start' }}>

          {/* ── Items list ─────────────────────────────────────────────── */}
          <div>
            {/* Column headers */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr auto',
              paddingBottom: 12, marginBottom: 4,
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase',
              color: T.muted2, borderBottom: `1px solid ${T.hairline}`,
            }}>
              <span>Producto</span>
              <span>Subtotal</span>
            </div>

            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {items.map((item) => (
                <CartItem
                  key={`${item.id}-${item.color ?? 'default'}-${item.size ?? 'default'}`}
                  item={item}
                  onRemove={() => removeItem(item.id, item.color, item.size)}
                  onQtyChange={(q) => updateQuantity(item.id, item.color, item.size, q)}
                />
              ))}
            </ul>
          </div>

          {/* ── Order summary ─────────────────────────────────────────── */}
          <div style={{
            background: T.panel,
            border: `1px solid ${T.hairline}`,
            borderRadius: 3,
            padding: '28px 24px',
            position: 'sticky',
            top: 88,
          }}>
            <h2 style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontWeight: 600, fontSize: 15,
              color: T.ink, margin: '0 0 24px',
            }}>
              Resumen del pedido
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <SummaryRow
                label={`Subtotal (${items.reduce((s, i) => s + i.quantity, 0)} artículos)`}
                value={fmt(totalPrice)}
              />
              <SummaryRow
                label="Envío"
                value="A confirmar"
                valueColor={T.muted}
              />
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 0', margin: '0 0 20px',
              borderTop: `1px solid ${T.hairline}`,
              borderBottom: `1px solid ${T.hairline}`,
            }}>
              <span style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontWeight: 600, fontSize: 15, color: T.ink,
              }}>
                Total
              </span>
              <span style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontWeight: 600, fontSize: 22, color: T.ink,
              }}>
                {fmt(totalPrice)}
              </span>
            </div>

            <p style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 11, color: T.muted2, textAlign: 'center',
              margin: '0 0 20px',
            }}>
              El costo de envío se confirma al finalizar el pedido.
            </p>

            <button
              onClick={() => navigate('/checkout')}
              style={{
                width: '100%', padding: '14px 0',
                background: T.red, color: '#fff',
                border: 'none', borderRadius: 2, cursor: 'pointer',
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 13, fontWeight: 600, letterSpacing: '.08em',
                textTransform: 'uppercase',
                transition: 'background .2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.redHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = T.red)}
            >
              Proceder al pago
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}

// ─── Cart Item Row ─────────────────────────────────────────────────────────────
function CartItem({ item, onRemove, onQtyChange }) {
  return (
    <li style={{
      display: 'grid',
      gridTemplateColumns: '96px 1fr auto',
      gap: 20, alignItems: 'start',
      padding: '24px 0',
      borderBottom: `1px solid ${T.hairline}`,
    }}>
      {/* Thumbnail */}
      <Link to={`/products/${item.id}`} style={{ display: 'block' }}>
        <img
          src={item.image}
          alt={item.name}
          style={{
            width: 96, height: 96, objectFit: 'cover',
            borderRadius: 2, background: T.surface2, display: 'block',
            transition: 'opacity .2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '.8')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        />
      </Link>

      {/* Details */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 96 }}>
        <div>
          <Link
            to={`/products/${item.id}`}
            style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 14, fontWeight: 400, lineHeight: 1.4,
              color: T.ink, textDecoration: 'none',
              display: 'block', marginBottom: 4,
              transition: 'color .15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = T.text3)}
            onMouseLeave={(e) => (e.currentTarget.style.color = T.ink)}
          >
            {item.name}
          </Link>
          <p style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 12, color: T.muted, margin: '0 0 3px',
          }}>
            {item.category}{item.color ? ` · Color: ${item.color}` : ''}{item.size ? ` · Medida: ${item.size}` : ''}
          </p>
          <p style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 12, color: T.muted, margin: 0,
          }}>
            {fmt(item.price)} c/u
          </p>
        </div>

        {/* Quantity + remove */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center',
            border: `1px solid ${T.hairline}`, borderRadius: 2,
          }}>
            <QtyButton onClick={() => onQtyChange(item.quantity - 1)} label="Disminuir">−</QtyButton>
            <span style={{
              width: 36, textAlign: 'center',
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 13, fontWeight: 500, color: T.ink,
              borderLeft: `1px solid ${T.hairline}`,
              borderRight: `1px solid ${T.hairline}`,
              lineHeight: '32px',
            }}>
              {item.quantity}
            </span>
            <QtyButton onClick={() => onQtyChange(item.quantity + 1)} label="Aumentar">+</QtyButton>
          </div>

          <button
            onClick={onRemove}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 12, color: T.muted,
              transition: 'color .15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = T.red)}
            onMouseLeave={(e) => (e.currentTarget.style.color = T.muted)}
          >
            <TrashIcon />
            Eliminar
          </button>
        </div>
      </div>

      {/* Line total */}
      <div style={{ textAlign: 'right', paddingTop: 2 }}>
        <span style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 14, fontWeight: 500, color: T.ink,
        }}>
          {fmt(item.price * item.quantity)}
        </span>
      </div>
    </li>
  )
}

function QtyButton({ onClick, label, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        width: 32, height: 32,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'none', border: 'none', cursor: 'pointer',
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 16, color: T.muted,
        transition: 'background .15s, color .15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = T.surface2
        e.currentTarget.style.color = T.ink
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none'
        e.currentTarget.style.color = T.muted
      }}
    >
      {children}
    </button>
  )
}

// ─── Summary Row ───────────────────────────────────────────────────────────────
function SummaryRow({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 13, color: T.muted,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 13, fontWeight: 500,
        color: valueColor || T.ink,
      }}>
        {value}
      </span>
    </div>
  )
}

// ─── Empty cart illustration ───────────────────────────────────────────────────
function EmptyCartIllustration() {
  return (
    <svg width="100" height="100" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="60" r="56" stroke={T.hairlineStrong} strokeWidth="1.5" />
      <path
        d="M38 42l-6 8v28a4 4 0 004 4h48a4 4 0 004-4V50l-6-8H38z"
        stroke={T.muted2} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      />
      <line x1="32" y1="50" x2="88" y2="50" stroke={T.muted2} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M72 58a12 12 0 01-24 0" stroke={T.muted2} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// ─── Icons ─────────────────────────────────────────────────────────────────────
function ArrowLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  )
}

