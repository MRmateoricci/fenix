import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'

const T = {
  paper:         '#F7F4EF',
  panel:         '#FBF8F3',
  hairline:      '#DED6C7',
  hairlineStrong: '#C9BFAF',
  ink:      '#16110B',
  ink2:     '#2A2118',
  muted:    '#8A8175',
  muted2:   '#9A917F',
  red:      '#CC0000',
  green:    '#1E8A4C',
  amber:    '#8A5A00',
  amberBg:  '#FDF0DC',
}

const fmt = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

export default function CartDrawer({ open, onClose }) {
  const { items, removeItem, updateQuantity, totalPrice, shippingConfig } = useCart()
  const navigate = useNavigate()

  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  function goTo(path) { onClose(); navigate(path) }
  function checkout() {
    goTo('/checkout')
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(10,8,5,0.52)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* Drawer */}
      <aside
        aria-label="Carrito de compras"
        aria-hidden={!open}
        style={{
          position: 'fixed', right: 0, top: 0,
          height: '100%', width: '100%', maxWidth: 400,
          zIndex: 50, display: 'flex', flexDirection: 'column',
          background: T.panel,
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.32s cubic-bezier(0.32,0,0.15,1)',
          boxShadow: '-8px 0 48px rgba(10,8,5,0.16)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 28px', height: 64, flexShrink: 0,
          borderBottom: `1px solid ${T.hairline}`,
        }}>
          <h2 style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 400, fontSize: 22, color: T.ink, margin: 0,
          }}>
            Tu carrito
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar carrito"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: T.muted, padding: 6, display: 'flex',
              transition: 'color .15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = T.ink)}
            onMouseLeave={(e) => (e.currentTarget.style.color = T.muted)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {items.length > 0 && (
          <FreeShippingProgress totalPrice={totalPrice} shippingConfig={shippingConfig} onViewZones={() => goTo('/policies/shipping')} />
        )}

        <APedidoNotice items={items} />

        {/* Items */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {items.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              height: '100%', gap: 20, padding: '0 32px', textAlign: 'center',
            }}>
              <svg width="50" height="50" viewBox="0 0 24 24" fill="none"
                stroke={T.muted2} strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 7h13l-1.2 9.5a2 2 0 0 1-2 1.7H9.2a2 2 0 0 1-2-1.7L6 7Z" />
                <path d="M9 7a3 3 0 0 1 6 0" />
              </svg>
              <p style={{
                fontFamily: "var(--font-sans)",
                fontSize: 15, color: T.muted, margin: 0,
              }}>
                Tu carrito está vacío
              </p>
              <CtaButton onClick={() => goTo('/products')}>Ver productos</CtaButton>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {items.map((item) => (
                <CartItem
                  key={`${item.id}-${item.color ?? 'default'}-${item.size ?? 'default'}-${item.tone ?? 'default'}`}
                  item={item}
                  onRemove={() => removeItem(item.id, item.color, item.size, item.tone)}
                  onUpdate={(quantity) => updateQuantity(item.id, item.color, item.size, quantity, item.tone)}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div style={{
            flexShrink: 0, padding: '22px 28px 30px',
            borderTop: `1px solid ${T.hairline}`,
          }}>
            <p style={{
              margin: '0 0 16px', textAlign: 'center', fontSize: 11.5,
              fontStyle: 'italic', color: T.muted,
            }}>
              *Gastos de envío y descuentos calculados al momento de pagar
            </p>
            <div style={{
              display: 'flex', alignItems: 'baseline',
              justifyContent: 'space-between', marginBottom: 16,
            }}>
              <span style={{
                fontFamily: "var(--font-sans)",
                fontSize: 11, letterSpacing: '.15em', textTransform: 'uppercase',
                color: T.muted2,
              }}>
                Subtotal
              </span>
              <span style={{
                fontFamily: "var(--font-sans)",
                fontSize: 19, fontWeight: 500, color: T.ink,
              }}>
                {fmt(totalPrice)}
              </span>
            </div>
            <CtaButton onClick={checkout} fullWidth>Finalizar pedido · {fmt(totalPrice)}</CtaButton>
            <button
              type="button"
              onClick={() => goTo('/cart')}
              style={{ width: '100%', marginTop: 12, border: 0, background: 'none', color: T.muted, fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
            >
              Ver carrito completo
            </button>
          </div>
        )}
      </aside>
    </>
  )
}

// Aviso breve cuando el carrito incluye items a pedido — el plazo mostrado es
// el mayor entre esos items, no una suma (cada uno llega por su cuenta).
function APedidoNotice({ items }) {
  const dias = items.filter((i) => i.aPedido).map((i) => Number(i.diasEntregaPedido) || 0)
  if (!dias.length) return null
  const maxDias = Math.max(...dias)
  return (
    <div style={{
      margin: '16px 28px 0', padding: '10px 12px', borderRadius: 4,
      background: T.amberBg, color: T.amber,
      fontFamily: 'var(--font-sans)', fontSize: 11.5, lineHeight: 1.4,
    }}>
      Tu pedido incluye productos a pedido. El plazo de entrega es de hasta {maxDias} días hábiles.
    </div>
  )
}

function FreeShippingProgress({ totalPrice, shippingConfig, onViewZones }) {
  if (!shippingConfig) return null
  const { freeShippingThreshold: threshold } = shippingConfig
  if (!threshold) return null

  const reached = totalPrice >= threshold
  const pct = Math.min(100, (totalPrice / threshold) * 100)
  const routeColor = reached ? T.green : T.red

  return (
    <div style={{ padding: '16px 28px 0', flexShrink: 0 }}>
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .fnx-ship-truck, .fnx-ship-fill { transition: none !important; }
        }
      `}</style>

      <div aria-live="polite">
        <p style={{
          margin: '0 0 9px', fontFamily: 'var(--font-sans)', fontSize: 12,
          color: reached ? T.ink : T.ink2, lineHeight: 1.4,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {reached ? (
            <>
              <CheckIcon color={T.green} />
              <span style={{ fontWeight: 500 }}>Tenés envío gratis</span>
              ·{' '}
              <button
                type="button"
                onClick={onViewZones}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  color: T.red, fontSize: 12, textDecoration: 'underline',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                Ver zonas de envío
              </button>
            </>
          ) : (
            <>Te faltan <strong>{fmt(threshold - totalPrice)}</strong> para el envío gratis</>
          )}
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={reached ? 'Envío gratis alcanzado' : `Progreso hacia el envío gratis: ${Math.round(pct)}%`}
        style={{ position: 'relative', height: 30, marginBottom: 16 }}
      >
        {/* Ruta de fondo */}
        <div aria-hidden="true" style={{
          position: 'absolute', top: 21, left: 0, width: '100%',
          height: 3, borderRadius: 2, background: T.hairlineStrong, opacity: .45,
        }} />

        {/* Tramo recorrido */}
        <div className="fnx-ship-fill" aria-hidden="true" style={{
          position: 'absolute', top: 21, left: 0, height: 3, borderRadius: 2,
          width: `${pct}%`, background: routeColor,
          transition: 'width 450ms cubic-bezier(.34,1.2,.64,1)',
        }} />

        {/* Camión */}
        <div className="fnx-ship-truck" aria-hidden="true" style={{
          position: 'absolute', top: 0, left: `${pct}%`, transform: 'translateX(-50%)',
          color: routeColor, transition: 'left 450ms cubic-bezier(.34,1.2,.64,1)',
          display: 'flex',
        }}>
          <TruckIcon />
        </div>

        {/* Pin de destino */}
        <div aria-hidden="true" style={{
          position: 'absolute', top: 12, right: -2, color: reached ? T.green : T.muted,
        }}>
          <PinIcon />
        </div>
      </div>
    </div>
  )
}

function TruckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="14" height="12" />
      <path d="M15 8h4l3 3v5h-7V8Z" />
      <circle cx="5.5" cy="18.5" r="2" />
      <circle cx="17.5" cy="18.5" r="2" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function CheckIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m8.5 12.5 2.5 2.5 5-5.5" />
    </svg>
  )
}

function CartItem({ item, onRemove, onUpdate }) {
  return (
    <li style={{
      display: 'flex', gap: 14, padding: '18px 28px',
      borderBottom: `1px solid ${T.hairline}`,
    }}>
      {/* Thumbnail */}
      <div style={{
        width: 62, height: 62, flexShrink: 0,
        borderRadius: 2, overflow: 'hidden',
        background: '#E7E0D3', border: `1px solid ${T.hairline}`,
      }}>
        {item.image && (
          <img src={item.image} alt={item.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 15, fontWeight: 400, color: T.ink,
          margin: '0 0 3px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.name}
        </p>
        <p style={{
          fontFamily: "var(--font-sans)",
          fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase',
          color: T.muted2, margin: '0 0 12px',
        }}>
          {item.category}
        </p>
        {item.aPedido && (
          <p style={{
            fontFamily: "var(--font-sans)", fontSize: 10.5, color: T.amber,
            margin: '-8px 0 12px',
          }}>
            A pedido · llega en ~{item.diasEntregaPedido} días hábiles
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Qty */}
          <div style={{
            display: 'inline-flex', alignItems: 'center',
            border: `1px solid ${T.hairline}`, borderRadius: 2,
          }}>
            {[
              { label: '−', delta: -1 },
              { label: '+', delta: +1 },
            ].reduce((acc, btn, i) => {
              const el = (
                <button
                  key={btn.label}
                  onClick={() => onUpdate(item.quantity + btn.delta)}
                  aria-label={btn.delta < 0 ? 'Disminuir' : 'Aumentar'}
                  style={{
                    width: 28, height: 28, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: T.muted, fontSize: 16, lineHeight: 1,
                    transition: 'color .12s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = T.ink)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = T.muted)}
                >
                  {btn.label}
                </button>
              )
              if (i === 0) return [el, <span key="qty" style={{
                width: 28, textAlign: 'center',
                fontFamily: "var(--font-sans)",
                fontSize: 13, color: T.ink,
              }}>{item.quantity}</span>]
              return [...acc, el]
            }, [])}
          </div>

          <span style={{
            fontFamily: "var(--font-sans)",
            fontSize: 14, fontWeight: 500, color: T.ink,
          }}>
            {fmt(item.price * item.quantity)}
          </span>
        </div>
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        aria-label={`Eliminar ${item.name}`}
        style={{
          alignSelf: 'flex-start', background: 'none', border: 'none',
          cursor: 'pointer', padding: 3, color: T.muted, flexShrink: 0,
          transition: 'color .12s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = T.red)}
        onMouseLeave={(e) => (e.currentTarget.style.color = T.muted)}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      </button>
    </li>
  )
}

function CtaButton({ onClick, children, fullWidth }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: fullWidth ? '100%' : 'auto',
        background: T.ink, color: T.paper, border: 'none', cursor: 'pointer',
        fontFamily: "var(--font-sans)",
        fontSize: 12.5, fontWeight: 500,
        letterSpacing: '.15em', textTransform: 'uppercase',
        padding: fullWidth ? '15px 0' : '13px 28px',
        borderRadius: 2, transition: 'background .2s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = T.ink2)}
      onMouseLeave={(e) => (e.currentTarget.style.background = T.ink)}
    >
      {children}
    </button>
  )
}
