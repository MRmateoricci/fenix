import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import { useFavorites } from '../context/FavoritesContext'
import { precioSinIva } from '../config/tax'
import { getPublicCoverVariantRule } from '../utils/productVariants'

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

const INSTALLMENTS = 3

const sameColorName = (left, right) =>
  String(left || '').localeCompare(String(right || ''), 'es-AR', { sensitivity: 'base' }) === 0

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
  const coverVariant = getPublicCoverVariantRule(product.variantRules)
  const coverColor = product.colors?.find(color => sameColorName(color?.name, coverVariant?.color))
  const coverTone = product.tones?.find(tone => sameColorName(tone?.name, coverVariant?.tone))
  const [added, setAdded] = useState(false)
  const [cardHovered, setCardHovered] = useState(false)
  const [hoverImageSuppressed, setHoverImageSuppressed] = useState(false)
  const [variantSelectedByUser, setVariantSelectedByUser] = useState(false)
  const [selectedColor, setSelectedColor] = useState(coverColor || product.colors?.[0] || null)
  const [selectedTone, setSelectedTone] = useState(coverTone || product.tones?.[0] || null)

  const favorite = isFavorite(product.id)
  const selectedColorVariantImage = product.variantRules?.find((rule) =>
    rule.image && sameColorName(rule.color, selectedColor?.name)
  )?.image
  const displayImage = (!variantSelectedByUser && coverVariant?.image) || selectedColor?.image || selectedColorVariantImage || product.image
  const showHoverImage = Boolean(cardHovered && product.hoverImage && !hoverImageSuppressed)
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
    if (added) return
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
      // Sin esto el checkout estima la entrega sin margen de preparación para
      // todo lo que se agregó desde el catálogo. La orden real igual lo
      // recalcula contra la DB, pero la fecha de la vista previa quedaba corta.
      stockInmediato: Boolean(product.stockInmediato),
      diasEntrega: Number(product.diasEntrega) || 3,
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
    setVariantSelectedByUser(true)
    // Si el cursor sigue dentro de la tarjeta, el hover no debe tapar la
    // imagen que el usuario acaba de pedir al elegir esta variante.
    setHoverImageSuppressed(cardHovered)
  }

  return (
    <div
      className="fnx-product-card"
      style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        transform: cardHovered ? 'translateY(-5px)' : 'translateY(0)',
        transition: 'transform .38s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      }}
      onMouseEnter={() => setCardHovered(true)}
      onMouseLeave={() => {
        setCardHovered(false)
        setHoverImageSuppressed(false)
      }}
    >
      {/* Image + floating add-to-cart button (wrapper stays overflow-visible so the button can overlap the image edge) */}
      <div style={{ position: 'relative' }}>
        <Link to={`/products/${product.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="fnx-product-card__image" style={{
            position: 'relative',
            aspectRatio: '1 / 1',
            // El blanco funciona como base para PNG/WebP transparentes y no
            // altera las fotos que ya traen su propio fondo opaco.
            background: '#fff',
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
                      opacity: showHoverImage ? 0 : 1,
                    }}
                    loading="lazy"
                  />
                  {product.hoverImage && (
                    <img
                      src={product.hoverImage}
                      alt={product.name}
                      style={{
                        position: 'absolute', inset: 0,
                        width: '100%', height: '100%', objectFit: 'cover',
                        transform: cardHovered ? 'scale(1.07)' : 'scale(1)',
                        transition: 'transform .6s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity .4s ease',
                        opacity: showHoverImage ? 1 : 0,
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

            {/* Favorite button */}
            <button
              type="button"
              className="fnx-product-card__favorite"
              onClick={handleToggleFavorite}
              aria-label={favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
              style={{
                position: 'absolute', top: 12, right: 13, zIndex: 1,
                width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(247,244,239,0.92)', border: 'none', borderRadius: '50%',
                cursor: 'pointer', padding: 0,
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill={favorite ? T.red : 'none'} stroke={favorite ? T.red : T.ink} strokeWidth="1.8">
                <path d="M12 20.5s-7.5-4.6-10-9.1C.5 8.1 2.1 4.5 5.6 4c2-.3 3.9.6 5 2.2C11.7 4.6 13.6 3.7 15.6 4c3.5.5 5.1 4.1 3.6 7.4-2.5 4.5-10 9.1-10 9.1Z" strokeLinejoin="round" />
              </svg>
            </button>

          </div>
        </Link>

        {/* Floating add-to-cart button, half-overlapping the image's bottom edge */}
        <button
          type="button"
          className="fnx-product-card__cart"
          onClick={handleAdd}
          disabled={added}
          aria-label={product.variantRules?.length ? 'Elegir opciones' : added ? 'Agregado al carrito' : 'Agregar al carrito'}
          style={{
            position: 'absolute', bottom: -18, right: 14, zIndex: 3,
            width: 40, height: 40, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: added ? T.green : T.ink,
            border: `3px solid ${T.paper}`,
            cursor: added ? 'default' : 'pointer',
            opacity: 1,
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
      <div className="fnx-product-card__info" style={{ padding: '24px 2px 0', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <Link to={`/products/${product.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <h3 className="fnx-product-card__title" style={{
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

        {/* Muestras compactas de todos los colores. Al elegir una, la tarjeta
            actualiza la foto y el precio cuando esa opción los tiene. */}
        <div className="fnx-product-card__variants" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, minHeight: 20 }}>
          {(product.colors || []).map((c) => {
            const isSelected = selectedColor?.name === c.name
            return (
              <button
                key={`color-${c.name}`}
                type="button"
                onClick={(e) => handleSelectColor(e, c)}
                title={c.name}
                aria-label={`Color ${c.name}`}
                aria-pressed={isSelected}
                style={{
                  width: 18, height: 18, flex: '0 0 18px', borderRadius: '50%',
                  padding: 0, cursor: 'pointer',
                  backgroundColor: c.hex || '#CCCCCC',
                  border: isSelected ? `2px solid ${T.ink}` : `1px solid ${T.hairlineStrong}`,
                  outline: isSelected ? `2px solid ${T.paper}` : 'none',
                  outlineOffset: isSelected ? '-4px' : 0,
                  boxShadow: isSelected ? `0 0 0 1px ${T.ink}` : 'none',
                  transition: 'box-shadow .15s, border-color .15s, transform .15s',
                }}
              />
            )
          })}
        </div>

        {/* Badges */}
        {(product.isNew || product.bestSeller) && (
          <div className="fnx-product-card__badges" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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

        <div className="fnx-product-card__pricing" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="fnx-product-card__price" style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 19, fontWeight: 600, color: T.ink,
          }}>
            {fmt(displayPrice)}
          </span>
          <span className="fnx-product-card__installments" style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 12, color: T.text3 }}>
            Hasta {INSTALLMENTS} cuotas sin interés de <strong style={{ fontWeight: 600 }}>{fmt(displayPrice / INSTALLMENTS)}</strong>
          </span>
          <span className="fnx-product-card__tax" style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 11, color: T.muted2 }}>
            Precio sin impuestos nacionales: {fmt(precioSinIva(displayPrice))}
          </span>
        </div>

        <div className="fnx-product-card__reviews" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto' }}>
          <StarRow value={rating} />
          <span style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 11.5, color: T.text3 }}>
            {reviews} {reviews === 1 ? 'reseña' : 'reseñas'}
          </span>
        </div>
      </div>
    </div>
  )
}
