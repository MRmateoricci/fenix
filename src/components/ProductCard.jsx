import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'

const T = {
  paper:          '#F7F4EF',
  panel:          '#FBF8F3',
  surface2:       '#E7E0D3',
  ink:            '#16110B',
  text3:          '#6B6051',
  muted2:         '#9A917F',
  hairline:       '#DED6C7',
  hairlineStrong: '#C9BFAF',
  cream:          '#F2EBDC',
  red:            '#CC0000',
}

const fmt = (n) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)

export default function ProductCard({ product }) {
  const { addItem } = useCart()
  const [added, setAdded] = useState(false)
  const [cardHovered, setCardHovered] = useState(false)
  const [addHover, setAddHover] = useState(false)

  function handleAdd(e) {
    e.preventDefault()
    e.stopPropagation()
    if (!product.inStock || added) return
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      category: product.category,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column',
        transform: cardHovered ? 'translateY(-5px)' : 'translateY(0)',
        transition: 'transform .38s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      }}
      onMouseEnter={() => setCardHovered(true)}
      onMouseLeave={() => setCardHovered(false)}
    >
      <Link to={`/products/${product.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
        <div style={{
          position: 'relative',
          aspectRatio: '1 / 1',
          background: T.surface2,
          border: `1px solid ${cardHovered ? T.hairlineStrong : T.hairline}`,
          borderRadius: 3,
          overflow: 'hidden',
          boxShadow: cardHovered
            ? '0 20px 52px -12px rgba(22,17,11,0.20)'
            : '0 2px 10px -4px rgba(22,17,11,0.06)',
          transition: 'box-shadow .38s ease, border-color .25s ease',
        }}>
          {product.image
            ? <img
                src={product.image}
                alt={product.name}
                style={{
                  width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                  transform: cardHovered ? 'scale(1.07)' : 'scale(1)',
                  transition: 'transform .6s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                }}
                loading="lazy"
              />
            : <div style={{
                position: 'absolute', inset: 0,
                background: 'radial-gradient(64% 54% at 58% 32%, rgba(255,255,255,0.72), transparent 64%)',
              }} />
          }

          {/* Category label */}
          <span style={{
            position: 'absolute', top: 12, left: 13, zIndex: 1,
            fontFamily: "'Spline Sans Mono', monospace",
            fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase',
            color: '#F2EBDC',
            textShadow: '0 1px 4px rgba(0,0,0,0.5)',
          }}>
            {product.category}
          </span>

          {!product.inStock && (
            <span style={{
              position: 'absolute', top: 12, right: 13, zIndex: 1,
              fontFamily: "'Spline Sans Mono', monospace",
              fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase',
              color: T.muted2,
              background: 'rgba(247,244,239,0.92)',
              padding: '4px 9px', borderRadius: 2,
            }}>
              Sin stock
            </span>
          )}

          {/* Hover overlay */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: 2,
            background: 'rgba(22,17,11,0.36)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: cardHovered ? 1 : 0,
            transition: 'opacity .3s ease',
            pointerEvents: 'none',
          }}>
            <span style={{
              background: T.cream,
              color: T.ink,
              fontSize: 12, fontWeight: 500,
              letterSpacing: '.15em', textTransform: 'uppercase',
              padding: '12px 24px', borderRadius: 2,
              fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
              transform: cardHovered ? 'translateY(0)' : 'translateY(10px)',
              transition: 'transform .35s ease',
            }}>
              Ver producto
            </span>
          </div>
        </div>
      </Link>

      {/* Info below image */}
      <div style={{ padding: '15px 2px 0', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <Link to={`/products/${product.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <h3 style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 400, fontSize: 18, lineHeight: 1.25,
            margin: '0 0 12px', color: T.ink,
          }}>
            {product.name}
          </h3>
        </Link>

        <div style={{
          marginTop: 'auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          borderTop: `1px solid ${T.hairline}`, paddingTop: 13,
        }}>
          <span style={{
            fontFamily: "'Spline Sans Mono', monospace",
            fontSize: 14, fontWeight: 500, color: T.ink,
          }}>
            {fmt(product.price)}
          </span>

          <button
            onClick={handleAdd}
            disabled={!product.inStock || added}
            style={{
              background: 'none', border: 'none',
              cursor: product.inStock && !added ? 'pointer' : 'default',
              fontSize: 13, fontWeight: 500,
              color: added
                ? '#166534'
                : addHover && product.inStock ? T.red : T.ink,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 0',
              borderBottom: `1px solid ${
                added ? '#166534'
                  : addHover && product.inStock ? T.red : T.hairlineStrong
              }`,
              transition: 'color .15s, border-color .15s',
              fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
            }}
            onMouseEnter={() => setAddHover(true)}
            onMouseLeave={() => setAddHover(false)}
          >
            {added
              ? '✓ Agregado'
              : product.inStock ? 'Agregar' : 'Sin stock'
            }
            {product.inStock && !added && (
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
