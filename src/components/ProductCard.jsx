import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import { useFavorites } from '../context/FavoritesContext'

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
  green:          '#1E8A4C',
  amber:          '#E08A1E',
  star:           '#F5A623',
}

const fmt = (n) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)

const INSTALLMENTS = 6
const NATIONAL_TAX_RATE = 0.21 // IVA — se descuenta para estimar el "precio sin impuestos nacionales"

// Rating/reseñas de ejemplo, estables por producto (no hay datos reales de
// reseñas agregadas conectados a la tarjeta todavía — ver src/pages/ProductDetail.jsx
// para el sistema de reseñas real, que vive en la ficha de producto).
function placeholderReviews(id) {
  const str = String(id)
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0
  const seed = Math.abs(Math.sin(hash)) * 10000
  const rating = 4 + Math.floor(seed % 10) / 10 // 4.0–4.9
  const reviews = 3 + Math.floor(seed % 45) // 3–47
  return { rating, reviews }
}

function StarRow({ value, size = 12 }) {
  const rounded = Math.round(value)
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width={size} height={size} viewBox="0 0 24 24"
          fill={n <= rounded ? T.star : 'none'}
          stroke={n <= rounded ? T.star : T.hairlineStrong}
          strokeWidth="1.5">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </span>
  )
}

export default function ProductCard({ product }) {
  const { addItem } = useCart()
  const { isAuthenticated } = useAuth()
  const { isFavorite, toggleFavorite } = useFavorites()
  const navigate = useNavigate()
  const [added, setAdded] = useState(false)
  const [cardHovered, setCardHovered] = useState(false)
  const [selectedColor, setSelectedColor] = useState(product.colors?.[0] || null)
  const [selectedTone, setSelectedTone] = useState(product.tones?.[0] || null)

  const favorite = isFavorite(product.id)
  const displayImage = selectedColor?.image || product.image
  const displayPrice = product.variantRules?.length
    ? product.price
    : selectedTone?.price != null
    ? Number(selectedTone.price)
    : selectedColor?.price != null
      ? Number(selectedColor.price)
      : product.price
  const { rating, reviews } = placeholderReviews(product.id)

  function handleAdd(e) {
    e.preventDefault()
    e.stopPropagation()
    if (!product.inStock || added) return
    if (product.variantRules?.length) {
      navigate(`/products/${product.id}`)
      return
    }
    const defaultSize = product.sizes?.[0]
    addItem({
      id: product.id,
      name: product.name,
      price: displayPrice,
      image: displayImage,
      category: product.category,
      color: selectedColor?.name,
      size: defaultSize?.label,
      tone: selectedTone?.name,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  function handleToggleFavorite(e) {
    e.preventDefault()
    e.stopPropagation()
    if (!isAuthenticated) { navigate('/login'); return }
    toggleFavorite(product.id)
  }

  function handleSelectColor(e, color) {
    e.preventDefault()
    e.stopPropagation()
    setSelectedColor(color)
  }

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        transform: cardHovered ? 'translateY(-5px)' : 'translateY(0)',
        transition: 'transform .38s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      }}
      onMouseEnter={() => setCardHovered(true)}
      onMouseLeave={() => setCardHovered(false)}
    >
      {/* Image + floating add-to-cart button (wrapper stays overflow-visible so the button can overlap the image edge) */}
      <div style={{ position: 'relative' }}>
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
            {displayImage
              ? <>
                  <img
                    src={displayImage}
                    alt={product.name}
                    style={{
                      position: 'absolute', inset: 0,
                      width: '100%', height: '100%', objectFit: 'cover',
                      transform: cardHovered ? 'scale(1.07)' : 'scale(1)',
                      transition: 'transform .6s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity .4s ease',
                      opacity: (cardHovered && product.hoverImage && !selectedColor) ? 0 : 1,
                    }}
                    loading="lazy"
                  />
                  {product.hoverImage && !selectedColor && (
                    <img
                      src={product.hoverImage}
                      alt={product.name}
                      style={{
                        position: 'absolute', inset: 0,
                        width: '100%', height: '100%', objectFit: 'cover',
                        transform: cardHovered ? 'scale(1.07)' : 'scale(1)',
                        transition: 'transform .6s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity .4s ease',
                        opacity: cardHovered ? 1 : 0,
                      }}
                      loading="lazy"
                    />
                  )}
                </>
              : <div style={{
                  position: 'absolute', inset: 0,
                  background: 'radial-gradient(64% 54% at 58% 32%, rgba(255,255,255,0.72), transparent 64%)',
                }} />
            }

            {!product.inStock && (
              <span style={{
                position: 'absolute', top: 12, right: 13, zIndex: 1,
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase',
                color: T.muted2,
                background: 'rgba(247,244,239,0.92)',
                padding: '4px 9px', borderRadius: 2,
              }}>
                Sin stock
              </span>
            )}

            {/* Favorite button */}
            <button
              type="button"
              onClick={handleToggleFavorite}
              aria-label={favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
              style={{
                position: 'absolute', top: product.inStock ? 12 : 44, right: 13, zIndex: 1,
                width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(247,244,239,0.92)', border: 'none', borderRadius: '50%',
                cursor: 'pointer', padding: 0,
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill={favorite ? T.red : 'none'} stroke={favorite ? T.red : T.ink} strokeWidth="1.8">
                <path d="M12 20.5s-7.5-4.6-10-9.1C.5 8.1 2.1 4.5 5.6 4c2-.3 3.9.6 5 2.2C11.7 4.6 13.6 3.7 15.6 4c3.5.5 5.1 4.1 3.6 7.4-2.5 4.5-10 9.1-10 9.1Z" strokeLinejoin="round" />
              </svg>
            </button>

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
                fontFamily: "var(--font-sans)",
                transform: cardHovered ? 'translateY(0)' : 'translateY(10px)',
                transition: 'transform .35s ease',
              }}>
                Ver producto
              </span>
            </div>
          </div>
        </Link>

        {/* Floating add-to-cart button, half-overlapping the image's bottom edge */}
        <button
          type="button"
          onClick={handleAdd}
          disabled={!product.inStock || added}
          aria-label={product.variantRules?.length ? 'Elegir opciones' : added ? 'Agregado al carrito' : product.inStock ? 'Agregar al carrito' : 'Sin stock'}
          style={{
            position: 'absolute', bottom: -18, right: 14, zIndex: 3,
            width: 40, height: 40, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: added ? T.green : T.ink,
            border: `3px solid ${T.paper}`,
            cursor: product.inStock && !added ? 'pointer' : 'default',
            opacity: product.inStock ? 1 : 0.5,
            boxShadow: '0 6px 16px -4px rgba(22,17,11,0.35)',
            transition: 'background .2s ease, transform .2s ease',
            transform: cardHovered ? 'scale(1.06)' : 'scale(1)',
          }}
        >
          {added
            ? <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" strokeWidth="2.2">
                <path d="M5 12.5 10 17.5 19 7.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            : <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#fff" strokeWidth="1.8">
                <path d="M4 6h2l2.2 11.1a2 2 0 0 0 2 1.6h7.1a2 2 0 0 0 2-1.6L21 9H7" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="10" cy="21" r="1.3" fill="#fff" stroke="none" />
                <circle cx="17" cy="21" r="1.3" fill="#fff" stroke="none" />
                <path d="M15 3v6M12 6h6" strokeLinecap="round" />
              </svg>
          }
        </button>
      </div>

      {/* Info below image */}
      <div style={{ padding: '24px 2px 0', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <Link to={`/products/${product.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <h3 style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontWeight: 400, fontSize: 14, lineHeight: 1.4,
            margin: 0, color: T.ink,
            minHeight: 'calc(1.4em * 2)',
            display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {product.name}
          </h3>
        </Link>

        {/* Color thumbnails — tone is only shown on the product detail page.
            Always reserves one row of height so the price line lands in the
            same place whether or not a product has color variants. The
            selected color shows as a larger bordered thumbnail, the rest as
            small plain photos. Products with no color variants (or whose
            colors have no photo assigned) still show a single bordered
            thumbnail of the product itself, for the same look — a flat hex
            swatch with no picture reads as a UI glitch, not a color option. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minHeight: 32 }}>
          {product.colors?.some((c) => c.image)
            ? product.colors.filter((c) => c.image).map((c) => {
                const isSelected = selectedColor?.name === c.name
                const size = isSelected ? 44 : 32
                return (
                  <button
                    key={`color-${c.name}`}
                    type="button"
                    onClick={(e) => handleSelectColor(e, c)}
                    title={c.name}
                    aria-label={c.name}
                    aria-pressed={isSelected}
                    style={{
                      width: size, height: size, borderRadius: 4,
                      padding: 0, cursor: 'pointer', overflow: 'hidden',
                      background: c.image ? `${T.surface2} url(${c.image}) center/cover no-repeat` : (c.hex || T.surface2),
                      border: isSelected ? `2px solid ${T.ink}` : 'none',
                      transition: 'width .15s, height .15s, border-color .15s',
                    }}
                  />
                )
              })
            : product.image && (
                <div style={{
                  width: 44, height: 44, borderRadius: 4, overflow: 'hidden',
                  background: `${T.surface2} url(${product.image}) center/cover no-repeat`,
                  border: `2px solid ${T.ink}`,
                }} />
              )}
        </div>

        {/* Badges */}
        {(product.isNew || product.bestSeller || product.aPedido) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {product.isNew && (
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                background: T.green, color: '#fff',
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 10.5, fontWeight: 600, letterSpacing: '.02em',
                padding: '3px 9px', borderRadius: 20,
              }}>
                Nuevo
              </span>
            )}
            {product.aPedido && (
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                background: T.ink, color: '#fff',
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 10.5, fontWeight: 600, letterSpacing: '.02em',
                padding: '3px 9px', borderRadius: 20,
              }}>
                A pedido
              </span>
            )}
            {product.bestSeller && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                color: T.amber,
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 11.5, fontWeight: 500,
              }}>
                🔥 Más vendido
              </span>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 19, fontWeight: 600, color: T.ink,
          }}>
            {product.priceFrom && <span style={{ fontSize: '0.72em', fontWeight: 500, marginRight: 5 }}>Desde</span>}
            {fmt(displayPrice)}
          </span>
          <span style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 12, color: T.text3 }}>
            Hasta {INSTALLMENTS} cuotas sin interés de <strong style={{ fontWeight: 600 }}>{fmt(displayPrice / INSTALLMENTS)}</strong>
          </span>
          <span style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 11, color: T.muted2 }}>
            Precio sin impuestos nacionales: {fmt(displayPrice * (1 - NATIONAL_TAX_RATE))}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto' }}>
          <StarRow value={rating} />
          <span style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 11.5, color: T.text3 }}>
            {reviews} {reviews === 1 ? 'reseña' : 'reseñas'}
          </span>
        </div>
      </div>
    </div>
  )
}
