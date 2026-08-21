import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAdmin } from '../context/AdminContext'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import { useFavorites } from '../context/FavoritesContext'
import ProductCard from '../components/ProductCard'
import PageSEO from '../components/SEO'
import FenixLogo from '../assets/FenixLogo'
import { SEO as seoCfg } from '../config/seo'
import {
  findCompatiblePublicSelection,
  hasMatchingPublicRule,
  hasPublicAxisFallback,
  resolvePublicVariantRule,
} from '../utils/productVariants'

const fmt = (n) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)

// Combina color + tono en una sola clave de fila para variantStock: un
// producto puede tener color de carcasa y tono de luz (cálido/neutro/frío) a
// la vez, pero la matriz de stock sigue siendo 2D (fila × medida). Misma
// convención en backend/routes/orders.js y AdminDashboard.jsx — si se cambia
// acá hay que cambiarla en los tres lados.
function combineVariantRowKey(colorName, toneName) {
  if (colorName && toneName) return `${colorName} / ${toneName}`
  return colorName || toneName || '_'
}

const REVIEWS_API = import.meta.env.VITE_API_URL || ''

function useProductReviews(productId, authKey) {
  const [reviews, setReviews] = useState([])
  const [average, setAverage] = useState(0)
  const [count, setCount]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [eligibility, setEligibility] = useState({
    authenticated: false,
    emailVerified: false,
    hasDeliveredOrder: false,
    canReview: false,
  })

  const reload = useCallback(() => {
    if (productId == null) return
    setLoading(true)
    fetch(`${REVIEWS_API}/api/reviews/${productId}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { reviews: [], average: 0, count: 0 }))
      .then((data) => {
        setReviews(data.reviews)
        setAverage(data.average)
        setCount(data.count)
        setEligibility(data.eligibility || {
          authenticated: false,
          emailVerified: false,
          hasDeliveredOrder: false,
          canReview: false,
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [productId, authKey])

  useEffect(() => { reload() }, [reload])

  return { reviews, average, count, loading, eligibility, reload }
}

export default function ProductDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addItem } = useCart()
  const { products } = useAdmin()
  const { isAuthenticated, user } = useAuth()
  const { isFavorite, toggleFavorite } = useFavorites()
  const product = products.find(p => p.id === id)
  const reviewsData = useProductReviews(product?.id, `${isAuthenticated}-${user?.emailVerified}`)

  const [qty, setQty]     = useState(1)
  const [added, setAdded] = useState(false)
  const [selectedColor, setSelectedColor] = useState(product?.colors?.[0] ?? null)
  const [selectedSize, setSelectedSize] = useState(product?.sizes?.[0] ?? null)
  const [selectedTone, setSelectedTone] = useState(product?.tones?.[0] ?? null)
  const [imgError, setImgError] = useState(false)
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const hasDefaultColorOption = hasPublicAxisFallback(product?.variantRules, 'color')
  const ruleSelection = { color: selectedColor?.name, size: selectedSize?.label, tone: selectedTone?.name }
  const selectedPriceRule = resolvePublicVariantRule(product?.variantRules, ruleSelection, 'price')
  const selectedStockRule = resolvePublicVariantRule(product?.variantRules, ruleSelection, 'stock')
  const selectedImageRule = resolvePublicVariantRule(product?.variantRules, ruleSelection, 'image')
  const selectedDetailsRule = resolvePublicVariantRule(product?.variantRules, ruleSelection, 'productData')
  const variantData = selectedDetailsRule?.productData || {}
  const variantValue = (field, fallback) => variantData[field] !== '' && variantData[field] != null ? variantData[field] : fallback
  const displayName = variantValue('name', product?.name)
  const displayDescription = variantValue('description', product?.description)
  const displayCategory = variantValue('category', product?.category)
  const variantSpecs = [
    ['Medida', variantValue('medida', selectedSize?.label)],
    ['Categoría', variantValue('category', product?.category)], ['Subcategoría', variantValue('subcategory', product?.subcategory)],
    ['Marca / grupo', variantValue('grupo', null)],
    ['Potencia', variantValue('watts', product?.watts) != null ? `${variantValue('watts', product?.watts)} W` : null],
    ['Corriente', variantValue('amperes', product?.amperes) != null ? `${variantValue('amperes', product?.amperes)} A` : null],
    ['Temperatura', variantValue('colorTemp', product?.colorTemp) != null ? `${variantValue('colorTemp', product?.colorTemp)} K` : null],
    ['Protección', variantValue('ipRating', product?.ipRating)], ['Material', variantValue('material', product?.material)],
    ['Tipo', variantValue('productType', product?.productType)], ['Tipo de cable', variantValue('cableType', product?.cableType)],
  ].filter(([, value]) => value !== '' && value != null)
  const selectedImage = selectedImageRule?.image || selectedSize?.image || selectedTone?.image || selectedColor?.image || product?.image
  const selectedPrice = selectedPriceRule?.price != null
    ? Number(selectedPriceRule.price)
    : selectedSize?.price != null
    ? Number(selectedSize.price)
    : selectedTone?.price != null
      ? Number(selectedTone.price)
      : selectedColor?.price != null
        ? Number(selectedColor.price)
        : product?.price

  // Si el producto carga stock por combinación exacta (variantStock no
  // vacío), la disponibilidad depende del color/tono/medida elegidos; si no,
  // sigue siendo el stock único de siempre.
  const hasRuleStock = (product?.variantRules || []).some(rule => rule.stock != null)
  const hasVariantStock = Object.keys(product?.variantStock || {}).length > 0
  const hasValidVariantSelection = !product?.variantRules?.length || hasMatchingPublicRule(product.variantRules, ruleSelection)
  const variantRowKey = combineVariantRowKey(selectedColor?.name, selectedTone?.name)
  const availableStock = !hasValidVariantSelection
    ? 0
    : hasRuleStock
    ? Number(selectedStockRule?.stock ?? 0)
    : hasVariantStock
    ? Number(product.variantStock[variantRowKey]?.[selectedSize?.label ?? '_'] ?? 0)
    : (product?.stock ?? 0)
  const variantInStock = availableStock > 0
  // El plazo de "a pedido" aplica a la combinación elegida, no al producto en
  // general: si hay variantes, lo que importa es si ESA combinación (availableStock)
  // tiene stock, no el stock agregado del producto.
  const isAPedido = !variantInStock && Boolean(product?.aPedido)

  const publicVariantChoices = {
    color: (product?.colors || []).map(option => option.name).filter(Boolean),
    size: (product?.sizes || []).map(option => option.label).filter(Boolean),
    tone: (product?.tones || []).map(option => option.name).filter(Boolean),
  }
  const sameOption = (left, right) => String(left || '').localeCompare(String(right || ''), 'es-AR', { sensitivity: 'base' }) === 0
  const findPublicOption = (axis, value) => {
    if (!value) return null
    const config = {
      color: [product?.colors || [], 'name'],
      size: [product?.sizes || [], 'label'],
      tone: [product?.tones || [], 'name'],
    }[axis]
    return config?.[0].find(option => sameOption(option?.[config[1]], value)) || null
  }
  const getVariantOptionState = (axis, value) => {
    if (!product?.variantRules?.length) return { selectable: true, direct: true }
    const direct = hasMatchingPublicRule(product.variantRules, { ...ruleSelection, [axis]: value || undefined })
    const compatible = findCompatiblePublicSelection(
      product.variantRules,
      publicVariantChoices,
      ruleSelection,
      axis,
      value
    )
    return { selectable: Boolean(compatible), direct }
  }
  const selectVariantOption = (axis, value) => {
    const next = findCompatiblePublicSelection(
      product?.variantRules,
      publicVariantChoices,
      ruleSelection,
      axis,
      value
    )
    if (!next) return
    setSelectedColor(findPublicOption('color', next.color))
    setSelectedSize(findPublicOption('size', next.size))
    setSelectedTone(findPublicOption('tone', next.tone))
    setImgError(false)
  }
  const defaultColorState = getVariantOptionState('color', null)

  useEffect(() => {
    let nextColor = product?.colors?.[0] ?? null
    let nextSize = product?.sizes?.[0] ?? null
    let nextTone = product?.tones?.[0] ?? null
    if (product?.variantRules?.length) {
      const colors = hasPublicAxisFallback(product.variantRules, 'color')
        ? [null, ...(product.colors || [])]
        : (product.colors?.length ? product.colors : [null])
      const sizes = product.sizes?.length ? product.sizes : [null]
      const tones = product.tones?.length ? product.tones : [null]
      outer: for (const color of colors) for (const size of sizes) for (const tone of tones) {
        if (hasMatchingPublicRule(product.variantRules, { color: color?.name, size: size?.label, tone: tone?.name })) {
          nextColor = color; nextSize = size; nextTone = tone
          break outer
        }
      }
    }
    setSelectedColor(nextColor)
    setSelectedSize(nextSize)
    setSelectedTone(nextTone)
    setImgError(false)
  }, [product?.id])

  useEffect(() => {
    setQty((q) => Math.max(1, Math.min(q, availableStock || 1)))
  }, [availableStock])

  // Cambiar de color/tono/medida muestra la foto de esa combinación primero;
  // si el usuario había elegido una miniatura de la galería, se vuelve a la
  // foto principal para no dejar una miniatura "vieja" seleccionada.
  useEffect(() => {
    setImgError(false)
    setActiveImageIndex(0)
  }, [selectedImage])

  useEffect(() => {
    if (product && window.location.hash === '#reviews') {
      window.requestAnimationFrame(() => {
        document.getElementById('reviews')?.scrollIntoView({ block: 'start' })
      })
    }
  }, [product?.id])

  function handleToggleFavorite() {
    if (!isAuthenticated) { navigate('/login'); return }
    toggleFavorite(product.id)
  }

  if (!product) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '60vh', gap: 24,
        backgroundColor: 'var(--color-bg)',
      }}>
        <p style={{ color: 'var(--color-text-muted)' }}>Producto no encontrado.</p>
        <button
          onClick={() => navigate('/products')}
          style={{
            padding: '12px 28px', borderRadius: 8, fontSize: 14, fontWeight: 500,
            backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none',
            cursor: 'pointer',
          }}
        >
          Ver catálogo
        </button>
      </div>
    )
  }

  function handleAdd() {
    if (!hasValidVariantSelection || (!variantInStock && !isAPedido) || added) return
    for (let i = 0; i < qty; i++) {
      addItem({
        id:       product.id,
        name:     displayName,
        price:    selectedPrice,
        image:    selectedImage,
        category: product.category,
        color:    selectedColor?.name,
        size:     selectedSize?.label,
        tone:     selectedTone?.name,
        aPedido:  isAPedido,
        diasEntregaPedido: isAPedido ? product.diasEntregaPedido : null,
      })
    }
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  const related = products
    .filter(p => p.category === product.category && p.id !== product.id)
    .slice(0, 4)

  const displayImage = selectedImage
  const bigImage = displayImage?.replace('w=400&h=400', 'w=900&h=900') || null
  // Galería única por producto (no varía por color/tono): la foto de la
  // combinación elegida siempre encabeza la tira de miniaturas.
  const galleryImages = Array.isArray(product?.galleryImages) ? product.galleryImages.filter(Boolean) : []
  const galleryThumbs = [bigImage, ...galleryImages.filter(url => url !== bigImage)].filter(Boolean)
  const activeImage = galleryThumbs[activeImageIndex] ?? bigImage ?? null

  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: displayName,
    description: displayDescription,
    image: galleryThumbs.length > 0 ? galleryThumbs : bigImage,
    brand: { '@type': 'Brand', name: seoCfg.business.name },
    offers: {
      '@type': 'Offer',
      url: `${seoCfg.siteUrl}/products/${product.id}`,
      priceCurrency: 'ARS',
      price: selectedPrice,
      availability: variantInStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: seoCfg.business.name },
    },
  }

  return (
    <>
      <PageSEO
        title={displayName}
        description={`${displayDescription} — Disponible en Fénix Iluminación, City Bell, La Plata.`}
        url={`/products/${product.id}`}
        image={product.image}
        schema={productSchema}
      />
      {/* ── Main section ─────────────────────────────────────────────────────── */}
      <div style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="fnx-pd-container" style={{ maxWidth: 1200, margin: '0 auto' }}>

          {/* Breadcrumb */}
          <nav style={{
            display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
            fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase',
            color: 'var(--color-text-muted)', marginBottom: 40,
            fontFamily: 'var(--font-sans)',
          }}>
            <Link
              to="/"
              style={{ color: 'var(--color-text-muted)', textDecoration: 'none', transition: 'color .15s' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
            >
              Inicio
            </Link>
            <span style={{ opacity: 0.5 }}>/</span>
            <Link
              to="/products"
              style={{ color: 'var(--color-text-muted)', textDecoration: 'none', transition: 'color .15s' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
            >
              Productos
            </Link>
            <span style={{ opacity: 0.5 }}>/</span>
            <Link
              to={`/products?category=${encodeURIComponent(displayCategory)}`}
              style={{ color: 'var(--color-text-muted)', textDecoration: 'none', transition: 'color .15s' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
            >
              {displayCategory}
            </Link>
            <span style={{ opacity: 0.5 }}>/</span>
            <span style={{ color: 'var(--color-text)' }}>{displayName}</span>
          </nav>

          {/* Two-column layout */}
          <div className="fnx-pd-grid">

            {/* ── Image ──────────────────────────────────────────────────────── */}
            <div className="fnx-pd-image">
              <div style={{
                borderRadius: 12,
                overflow: 'hidden',
                backgroundColor: 'var(--color-surface-2)',
              }}>
                {(!activeImage || imgError) ? (
                  <div className="fnx-pd-image-fallback">
                    <FenixLogo height={64} />
                  </div>
                ) : (
                  <img
                    src={activeImage}
                    alt={displayName}
                    style={{ width: '100%', display: 'block', objectFit: 'cover' }}
                    onError={() => setImgError(true)}
                  />
                )}
              </div>

              {galleryThumbs.length > 1 && (
                <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                  {galleryThumbs.map((url, idx) => {
                    const isActive = idx === activeImageIndex
                    return (
                      <button
                        key={`${url}-${idx}`}
                        type="button"
                        onClick={() => { setActiveImageIndex(idx); setImgError(false) }}
                        aria-label={`Ver foto ${idx + 1} de ${displayName}`}
                        aria-pressed={isActive}
                        style={{
                          width: 64, height: 64, padding: 0, flexShrink: 0,
                          borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                          backgroundColor: 'var(--color-surface-2)',
                          border: isActive ? '2px solid var(--color-text)' : '1.5px solid var(--color-border)',
                          opacity: isActive ? 1 : 0.7,
                          transition: 'opacity .15s, border-color .15s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = isActive ? '1' : '0.7' }}
                      >
                        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── Product info ──────────────────────────────────────────────── */}
            <div className="fnx-pd-info" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Badges */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    padding: '4px 10px', borderRadius: 4,
                    fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase',
                    fontWeight: 600, fontFamily: 'var(--font-sans)',
                    backgroundColor: 'var(--color-surface-2)',
                    color: 'var(--color-text-muted)',
                  }}>
                    {displayCategory}
                  </span>
                  {variantInStock ? (
                    <span style={{
                      padding: '4px 10px', borderRadius: 4,
                      fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase',
                      fontWeight: 600, backgroundColor: '#E4F5E9', color: '#166534',
                    }}>
                      En stock
                    </span>
                  ) : isAPedido ? (
                    <span style={{
                      padding: '4px 10px', borderRadius: 4,
                      fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase',
                      fontWeight: 600, backgroundColor: '#FDF0DC', color: '#8A5A00',
                    }}>
                      A pedido
                    </span>
                  ) : (
                    <span style={{
                      padding: '4px 10px', borderRadius: 4,
                      fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase',
                      fontWeight: 600, backgroundColor: '#FFE4E4', color: '#CC0000',
                    }}>
                      Sin stock
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleToggleFavorite}
                  aria-label={isFavorite(product.id) ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                  style={{
                    width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: '50%',
                    cursor: 'pointer', padding: 0, flexShrink: 0,
                  }}
                >
                  <svg viewBox="0 0 24 24" width="17" height="17" fill={isFavorite(product.id) ? 'var(--color-primary)' : 'none'} stroke={isFavorite(product.id) ? 'var(--color-primary)' : 'var(--color-text)'} strokeWidth="1.8">
                    <path d="M12 20.5s-7.5-4.6-10-9.1C.5 8.1 2.1 4.5 5.6 4c2-.3 3.9.6 5 2.2C11.7 4.6 13.6 3.7 15.6 4c3.5.5 5.1 4.1 3.6 7.4-2.5 4.5-10 9.1-10 9.1Z" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              {/* Product name */}
              <h1 className="fnx-pd-title" style={{
                fontFamily: 'var(--font-serif)',
                fontWeight: 400,
                lineHeight: 1.1,
                letterSpacing: '-0.01em',
                color: 'var(--color-text)',
                margin: 0,
              }}>
                {displayName}
              </h1>

              {/* Rating summary */}
              {reviewsData.count > 0 && (
                <a
                  href="#reviews"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    textDecoration: 'none', width: 'fit-content',
                  }}
                >
                  <StarRating value={Math.round(reviewsData.average)} readOnly size={16} />
                  <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                    {reviewsData.average.toFixed(1)} · {reviewsData.count} {reviewsData.count === 1 ? 'reseña' : 'reseñas'}
                  </span>
                </a>
              )}

              {/* Price */}
              <p style={{
                fontSize: 36,
                fontWeight: 700,
                color: 'var(--color-text)',
                fontFamily: 'var(--font-sans)',
                margin: 0,
              }}>
                {fmt(selectedPrice)}
              </p>

              {isAPedido && (
                <p style={{
                  fontSize: 13.5, color: '#8A5A00', backgroundColor: '#FDF0DC',
                  padding: '12px 14px', borderRadius: 10, margin: 0,
                }}>
                  Este producto no está en stock inmediato. Lo conseguimos especialmente para vos y llega en aproximadamente {product.diasEntregaPedido} días hábiles.
                </p>
              )}

              {/* Selector de color */}
              {(product.colors?.length > 0 || hasDefaultColorOption) && (
                <div>
                  <span style={{
                    fontSize: 14, fontWeight: 500,
                    color: 'var(--color-text)', fontFamily: 'var(--font-sans)',
                    display: 'block', marginBottom: 10,
                  }}>
                    Color: {selectedColor?.name || 'Sin color'}
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {hasDefaultColorOption && (
                      <button
                        type="button"
                        onClick={() => selectVariantOption('color', null)}
                        disabled={!defaultColorState.selectable}
                        title={defaultColorState.direct ? 'Sin color (opción predeterminada)' : 'Sin color (cambia también la combinación)'}
                        aria-label="Sin color"
                        aria-pressed={!selectedColor}
                        style={{
                          width: 34, height: 34, borderRadius: '50%', position: 'relative',
                          backgroundColor: 'var(--color-bg)', overflow: 'hidden',
                          border: !selectedColor
                            ? '2px solid var(--color-text)'
                            : '2px solid var(--color-border)',
                          outline: !selectedColor ? '2px solid var(--color-bg)' : 'none',
                          outlineOffset: !selectedColor ? '-4px' : '0',
                          boxShadow: !selectedColor ? '0 0 0 1.5px var(--color-text)' : 'none',
                          cursor: defaultColorState.selectable ? 'pointer' : 'not-allowed', padding: 0,
                          opacity: defaultColorState.direct ? 1 : defaultColorState.selectable ? .55 : .28,
                          transition: 'box-shadow .15s, border-color .15s',
                        }}
                      >
                        <span aria-hidden="true" style={{
                          position: 'absolute', left: '50%', top: 3, bottom: 3, width: 2,
                          backgroundColor: 'var(--color-text-muted)',
                          transform: 'translateX(-50%) rotate(45deg)', transformOrigin: 'center',
                        }} />
                      </button>
                    )}
                    {(product.colors || []).map((c) => {
                      const isSelected = selectedColor?.name === c.name
                      const optionState = getVariantOptionState('color', c.name)
                      return (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => selectVariantOption('color', c.name)}
                          disabled={!optionState.selectable}
                          title={optionState.direct ? c.name : optionState.selectable ? `${c.name} (cambia también la combinación)` : `${c.name} no disponible`}
                          aria-label={c.name}
                          aria-pressed={isSelected}
                          style={{
                            width: 34, height: 34, borderRadius: '50%',
                            backgroundColor: c.hex || '#ccc',
                            border: isSelected
                              ? '2px solid var(--color-text)'
                              : '2px solid var(--color-border)',
                            outline: isSelected ? '2px solid var(--color-bg)' : 'none',
                            outlineOffset: isSelected ? '-4px' : '0',
                            boxShadow: isSelected ? '0 0 0 1.5px var(--color-text)' : 'none',
                            cursor: optionState.selectable ? 'pointer' : 'not-allowed', padding: 0,
                            opacity: optionState.direct ? 1 : optionState.selectable ? .55 : .28,
                            transition: 'box-shadow .15s, border-color .15s',
                          }}
                        />
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Selector de tono */}
              {product.tones?.length > 0 && (
                <div>
                  <span style={{
                    fontSize: 14, fontWeight: 500,
                    color: 'var(--color-text)', fontFamily: 'var(--font-sans)',
                    display: 'block', marginBottom: 10,
                  }}>
                    Tono{selectedTone ? `: ${selectedTone.name}` : ''}
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {product.tones.map((t) => {
                      const isSelected = selectedTone?.name === t.name
                      const optionState = getVariantOptionState('tone', t.name)
                      return (
                        <button
                          key={t.name}
                          type="button"
                          onClick={() => selectVariantOption('tone', t.name)}
                          disabled={!optionState.selectable}
                          title={optionState.direct ? t.name : optionState.selectable ? `${t.name} (cambia también la combinación)` : `${t.name} no disponible`}
                          aria-label={t.name}
                          aria-pressed={isSelected}
                          style={{
                            width: 34, height: 34, borderRadius: '50%',
                            backgroundColor: t.hex || '#ccc',
                            border: isSelected
                              ? '2px solid var(--color-text)'
                              : '2px solid var(--color-border)',
                            outline: isSelected ? '2px solid var(--color-bg)' : 'none',
                            outlineOffset: isSelected ? '-4px' : '0',
                            boxShadow: isSelected ? '0 0 0 1.5px var(--color-text)' : 'none',
                            cursor: optionState.selectable ? 'pointer' : 'not-allowed', padding: 0,
                            opacity: optionState.direct ? 1 : optionState.selectable ? .55 : .28,
                            transition: 'box-shadow .15s, border-color .15s',
                          }}
                        />
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Selector de medida */}
              {product.sizes?.length > 0 && (
                <div>
                  <span style={{
                    fontSize: 14, fontWeight: 500,
                    color: 'var(--color-text)', fontFamily: 'var(--font-sans)',
                    display: 'block', marginBottom: 10,
                  }}>
                    Medida{selectedSize ? `: ${selectedSize.label}` : ''}
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {product.sizes.map((s) => {
                      const isSelected = selectedSize?.label === s.label
                      const optionState = getVariantOptionState('size', s.label)
                      return (
                        <button
                          key={s.label}
                          type="button"
                          onClick={() => selectVariantOption('size', s.label)}
                          disabled={!optionState.selectable}
                          title={optionState.direct ? s.label : optionState.selectable ? `${s.label} (cambia también la combinación)` : `${s.label} no disponible`}
                          aria-pressed={isSelected}
                          style={{
                            padding: '8px 16px', borderRadius: 4,
                            fontSize: 13, fontFamily: 'var(--font-sans)',
                            color: isSelected ? '#fff' : 'var(--color-text)',
                            backgroundColor: isSelected ? 'var(--color-text)' : 'transparent',
                            border: `1.5px solid ${isSelected ? 'var(--color-text)' : 'var(--color-border)'}`,
                            cursor: optionState.selectable ? 'pointer' : 'not-allowed',
                            opacity: optionState.direct ? 1 : optionState.selectable ? .58 : .32,
                            transition: 'background-color .15s, border-color .15s, color .15s',
                          }}
                        >
                          {s.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Divider */}
              <div style={{ height: 1, backgroundColor: 'var(--color-border)' }} />

              {/* Quantity selector */}
              {variantInStock && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 14, fontWeight: 500,
                    color: 'var(--color-text)', fontFamily: 'var(--font-sans)',
                  }}>
                    Cantidad
                  </span>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center',
                    border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden',
                  }}>
                    <button
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      disabled={qty <= 1}
                      style={{
                        width: 44, height: 44, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 20, fontWeight: 300,
                        background: 'none', border: 'none', cursor: qty <= 1 ? 'not-allowed' : 'pointer',
                        color: qty <= 1 ? 'var(--color-border)' : 'var(--color-text-muted)',
                        transition: 'background .15s',
                      }}
                      onMouseEnter={(e) => { if (qty > 1) e.currentTarget.style.backgroundColor = 'var(--color-surface-2)' }}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      aria-label="Disminuir cantidad"
                    >
                      −
                    </button>
                    <span style={{
                      width: 48, textAlign: 'center', fontSize: 15, fontWeight: 600,
                      color: 'var(--color-text)', userSelect: 'none',
                      borderLeft: '1px solid var(--color-border)',
                      borderRight: '1px solid var(--color-border)',
                    }}>
                      {qty}
                    </span>
                    <button
                      onClick={() => setQty((q) => Math.min(availableStock, q + 1))}
                      disabled={qty >= availableStock}
                      style={{
                        width: 44, height: 44, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 20, fontWeight: 300,
                        background: 'none', border: 'none', cursor: qty >= availableStock ? 'not-allowed' : 'pointer',
                        color: qty >= availableStock ? 'var(--color-border)' : 'var(--color-text-muted)',
                        transition: 'background .15s',
                      }}
                      onMouseEnter={(e) => { if (qty < availableStock) e.currentTarget.style.backgroundColor = 'var(--color-surface-2)' }}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      aria-label="Aumentar cantidad"
                    >
                      +
                    </button>
                  </div>
                  <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
                    Subtotal: {fmt(selectedPrice * qty)}
                  </span>
                </div>
              )}

              {/* CTA buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  onClick={handleAdd}
                  disabled={(!variantInStock && !isAPedido) || added}
                  style={{
                    width: '100%', padding: '15px 0',
                    fontSize: 14, fontWeight: 600, letterSpacing: '.04em',
                    borderRadius: 10, border: 'none', cursor: (variantInStock || isAPedido) && !added ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'background .2s, opacity .2s',
                    ...(added
                      ? { backgroundColor: '#166534', color: '#fff' }
                      : (variantInStock || isAPedido)
                        ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                        : { backgroundColor: 'var(--color-border)', color: 'var(--color-text-muted)' }),
                  }}
                  onMouseEnter={(e) => { if ((variantInStock || isAPedido) && !added) e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)' }}
                  onMouseLeave={(e) => { if ((variantInStock || isAPedido) && !added) e.currentTarget.style.backgroundColor = 'var(--color-primary)' }}
                >
                  {added ? (
                    <><CheckIcon /> Agregado al carrito</>
                  ) : variantInStock ? (
                    <><CartIcon /> Agregar al carrito</>
                  ) : isAPedido ? (
                    <><CartIcon /> Agregar al carrito · a pedido</>
                  ) : (
                    'Sin stock'
                  )}
                </button>

                <a
                  href={`https://wa.me/${seoCfg.business.whatsapp}?text=Hola!%20Quiero%20consultar%20sobre%20${encodeURIComponent(displayName)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    width: '100%', padding: '15px 0',
                    fontSize: 14, fontWeight: 600, letterSpacing: '.04em',
                    borderRadius: 10, border: '1.5px solid var(--color-border)',
                    color: 'var(--color-text)', backgroundColor: 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    textDecoration: 'none', transition: 'border-color .2s, background .2s',
                    boxSizing: 'border-box',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-text)'
                    e.currentTarget.style.backgroundColor = 'var(--color-surface-2)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border)'
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <WhatsAppIcon />
                  Consultar por WhatsApp
                </a>
              </div>

              {!variantInStock && !isAPedido && <StockAlertForm product={product} />}

              {/* Info chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {['Retiro en local', 'Asesoramiento incluido', 'Garantía de fábrica'].map((label) => (
                  <span
                    key={label}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 999, fontSize: 12,
                      backgroundColor: 'var(--color-surface-2)',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {label}
                  </span>
                ))}
              </div>

            </div>

            {/* ── Description ────────────────────────────────────────────────── */}
            <div className="fnx-pd-desc">
              <p style={{
                fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase',
                fontWeight: 600, color: 'var(--color-text-muted)',
                fontFamily: 'var(--font-sans)', marginBottom: 12,
              }}>
                Descripción
              </p>
              <p style={{
                fontSize: 15, lineHeight: 1.75,
                color: 'var(--color-text-muted)', margin: 0,
              }}>
                {displayDescription}
              </p>
              {variantSpecs.length > 0 && (
                <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '9px 16px', margin: '18px 0 0' }}>
                  {variantSpecs.map(([label, value]) => <div key={label}><dt style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--color-text-muted)' }}>{label}</dt><dd style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--color-text)' }}>{value}</dd></div>)}
                </dl>
              )}
            </div>
          </div>
        </div>
      </div>

      <ReviewsSection product={product} reviewsData={reviewsData} />

      {/* ── Related products ─────────────────────────────────────────────────── */}
      {related.length > 0 && (
        <section style={{ backgroundColor: 'var(--color-bg)', paddingTop: 64, paddingBottom: 80 }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 36 }}>
              <div>
                <p style={{
                  fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase',
                  fontWeight: 500, color: 'var(--color-primary)', marginBottom: 8,
                }}>
                  {product.category}
                </p>
                <h2 style={{
                  fontFamily: 'var(--font-serif)', fontWeight: 400,
                  fontSize: 'clamp(22px, 2.5vw, 30px)',
                  color: 'var(--color-text)', margin: 0,
                }}>
                  Productos relacionados
                </h2>
              </div>
              <Link
                to={`/products?category=${encodeURIComponent(product.category)}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 13, color: 'var(--color-text-muted)',
                  textDecoration: 'none', transition: 'color .15s',
                }}
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

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 20,
            }}>
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

const STOCK_ALERTS_API = import.meta.env.VITE_API_URL || ''

function StockAlertForm({ product }) {
  const { user } = useAuth()
  const [email, setEmail]     = useState(user?.email || '')
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${STOCK_ALERTS_API}/api/stock-alerts`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, email }),
      })
      if (!res.ok) throw new Error('No pudimos guardar tu aviso. Probá de nuevo.')
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <p style={{
        fontSize: 13.5, color: '#166534', backgroundColor: '#E4F5E9',
        padding: '12px 14px', borderRadius: 10,
      }}>
        ¡Listo! Te avisaremos por email cuando vuelva a estar disponible.
      </p>
    )
  }

  return (
    <div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
        <input
          type="email"
          required
          placeholder="Tu email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            flex: 1, padding: '11px 14px', borderRadius: 8,
            border: '1.5px solid var(--color-border)', outline: 'none',
            fontSize: 13.5, color: 'var(--color-text)', backgroundColor: 'var(--color-surface-2)',
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '0 18px', borderRadius: 8, border: 'none',
            fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            backgroundColor: 'var(--color-text)', color: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Enviando…' : 'Avisame'}
        </button>
      </form>
      {error && (
        <p style={{ fontSize: 12, color: 'var(--color-primary)', margin: '6px 0 0' }}>{error}</p>
      )}
    </div>
  )
}

function StarRating({ value, onChange, size = 18, readOnly = false }) {
  const [hover, setHover] = useState(0)
  return (
    <div style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = (hover || value) >= n
        return (
          <svg
            key={n}
            width={size} height={size} viewBox="0 0 24 24"
            fill={filled ? '#F5A623' : 'none'}
            stroke={filled ? '#F5A623' : 'var(--color-text-muted)'}
            strokeWidth="1.5"
            style={{ cursor: readOnly ? 'default' : 'pointer' }}
            onMouseEnter={() => !readOnly && setHover(n)}
            onMouseLeave={() => !readOnly && setHover(0)}
            onClick={() => !readOnly && onChange?.(n)}
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        )
      })}
    </div>
  )
}

function ReviewsSection({ product, reviewsData }) {
  const { user, isAuthenticated, resendVerificationEmail } = useAuth()
  const navigate = useNavigate()

  const { reviews, average, count, loading, eligibility, reload: load } = reviewsData

  const [rating, setRating]     = useState(0)
  const [comment, setComment]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]       = useState(null)
  const [resending, setResending] = useState(false)
  const [verificationMessage, setVerificationMessage] = useState(null)

  const myReview = reviews.find((r) => r.userId === user?.id)

  useEffect(() => {
    setRating(myReview?.rating || 0)
    setComment(myReview?.comment || '')
  }, [myReview?.id])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!rating) { setError('Elegí un puntaje de 1 a 5 estrellas.'); return }
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`${REVIEWS_API}/api/reviews`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, rating, comment }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'No pudimos guardar tu reseña. Probá de nuevo.')
      }
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    setSubmitting(true)
    try {
      await fetch(`${REVIEWS_API}/api/reviews/${product.id}`, { method: 'DELETE', credentials: 'include' })
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResendVerification() {
    setVerificationMessage(null)
    setResending(true)
    try {
      await resendVerificationEmail()
      setVerificationMessage({ type: 'success', text: 'Te enviamos un nuevo enlace de verificación.' })
    } catch (err) {
      setVerificationMessage({ type: 'error', text: err.message })
    } finally {
      setResending(false)
    }
  }

  return (
    <section id="reviews" style={{ backgroundColor: 'var(--color-bg)', paddingTop: 24, scrollMarginTop: 96 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
          <h2 style={{
            fontFamily: 'var(--font-serif)', fontWeight: 400,
            fontSize: 'clamp(22px, 2.5vw, 30px)', color: 'var(--color-text)', margin: 0,
          }}>
            Reseñas
          </h2>
          {count > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StarRating value={Math.round(average)} readOnly size={16} />
              <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
                {average.toFixed(1)} · {count} {count === 1 ? 'reseña' : 'reseñas'}
              </span>
            </div>
          )}
        </div>

        {/* Formulario para dejar/editar reseña */}
        <div style={{
          padding: 20, borderRadius: 12, backgroundColor: 'var(--color-surface-2)',
          marginBottom: 32, maxWidth: 560,
        }}>
          {!isAuthenticated ? (
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>
              <button
                onClick={() => navigate('/login', { state: { from: `/products/${product.id}#reviews` } })}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  color: 'var(--color-primary)', cursor: 'pointer',
                  font: 'inherit', textDecoration: 'underline',
                }}
              >
                Iniciá sesión
              </button>{' '}
              para dejar una reseña cuando tu pedido haya sido entregado.
            </p>
          ) : loading ? (
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>
              Comprobando si podés reseñar este producto…
            </p>
          ) : !eligibility.emailVerified ? (
            <div>
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>
                Confirmá que <strong>{user.email}</strong> es tuyo antes de publicar una reseña.
              </p>
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={resending}
                style={{
                  marginTop: 10, color: 'var(--color-primary)', fontSize: 13,
                  fontWeight: 600, textDecoration: 'underline',
                  cursor: resending ? 'not-allowed' : 'pointer',
                }}
              >
                {resending ? 'Enviando…' : 'Reenviar email de verificación'}
              </button>
              {verificationMessage && (
                <p style={{
                  fontSize: 12, margin: '8px 0 0',
                  color: verificationMessage.type === 'success' ? '#166534' : 'var(--color-primary)',
                }}>
                  {verificationMessage.text}
                </p>
              )}
            </div>
          ) : !eligibility.hasDeliveredOrder ? (
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>
              La reseña se habilitará cuando tengas un pedido entregado que incluya este producto.
            </p>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)' }}>
                  {myReview ? 'Tu reseña' : 'Tu puntaje'}
                </span>
                <StarRating value={rating} onChange={setRating} />
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Contanos qué te pareció (opcional)"
                rows={3}
                style={{
                  padding: '10px 12px', borderRadius: 8, resize: 'vertical',
                  border: '1.5px solid var(--color-border)', outline: 'none',
                  fontSize: 13.5, color: 'var(--color-text)', backgroundColor: 'var(--color-bg)',
                  fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '10px 20px', borderRadius: 8, border: 'none',
                    fontSize: 13, fontWeight: 600, backgroundColor: 'var(--color-primary)', color: '#fff',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? 'Guardando…' : myReview ? 'Actualizar reseña' : 'Publicar reseña'}
                </button>
                {myReview && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={submitting}
                    style={{
                      padding: '10px 20px', borderRadius: 8, border: '1.5px solid var(--color-border)',
                      fontSize: 13, fontWeight: 600, backgroundColor: 'transparent', color: 'var(--color-text-muted)',
                      cursor: submitting ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Eliminar
                  </button>
                )}
              </div>
              {error && <p style={{ fontSize: 12, color: 'var(--color-primary)', margin: 0 }}>{error}</p>}
            </form>
          )}
        </div>

        {/* Lista de reseñas */}
        {!loading && (
          reviews.length === 0 ? (
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
              Todavía no hay reseñas para este producto. ¡Sé el primero en dejar una!
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720 }}>
              {reviews.map((r) => (
                <div key={r.id} style={{ paddingBottom: 20, borderBottom: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                    <StarRating value={r.rating} readOnly size={14} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{r.author}</span>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {new Date(r.createdAt).toLocaleDateString('es-AR')}
                    </span>
                  </div>
                  {r.comment && (
                    <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-muted)', margin: 0 }}>
                      {r.comment}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </section>
  )
}
