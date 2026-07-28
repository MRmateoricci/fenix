import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAdmin } from '../context/AdminContext'
import { useCart } from '../context/CartContext'
import localImg from '../assets/Fenix local.jpg'
import heroImg from '../assets/fondo fenix.jpg'
import interiorImg from '../assets/sin fondo iluminacion.png'
import electricidadImg from '../assets/sin fondo electricidad.png'
import herramientasImg from '../assets/sin fondo herramientas.png'
import automatizacionImg from '../assets/sin fondo automatizacion.png'
import PageSEO from '../components/SEO'
import { SEO as seoCfg } from '../config/seo'

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
  dark:           '#14100A',
  cream:          '#F2EBDC',
  red:            '#CC0000',
  amber:          '#E0A24A',
  wa:             '#1f7a3d',
}

const API_BASE = import.meta.env.VITE_API_URL || ''

const HERO_PAPER_FADE_HEIGHT = 'clamp(140px, 20vw, 240px)'
const INTRO_CURTAIN_DURATION_MS = 800
const INTRO_HERO_FADE_DELAY_MS = 180
const INTRO_DONE_DELAY_MS = 950

const fmt = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

// Reveals children with a fade + rise-up cinematic entrance the first time they scroll into view.
function useInView(threshold = 0.2) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setInView(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold, rootMargin: '0px 0px -8% 0px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [threshold])

  return [ref, inView]
}

function Reveal({ children, delay = 0, y = 26, threshold = 0.2, style }) {
  const [ref, inView] = useInView(threshold)
  return (
    <div
      ref={ref}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : `translateY(${y}px)`,
        transition: `opacity .8s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform .8s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
        willChange: 'opacity, transform',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

const CATEGORIES = [
  { code: 'EL', name: 'Electricidad',              to: '/products?category=Electricidad',              image: electricidadImg, icon: 'plug', productShot: true },
  { code: 'IL', name: 'Iluminación',                to: '/products?category=Iluminación',               image: interiorImg,     icon: 'bulb', productShot: true },
  { code: 'HE', name: 'Herramientas',               to: '/products?category=Herramientas',              image: herramientasImg,   icon: 'tool', productShot: true },
  { code: 'AI', name: 'Automatización',             to: '/products?category=Automatización Industrial', image: automatizacionImg, icon: 'gear', productShot: true },
]

const LOCAL_BUSINESS_SCHEMA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'LocalBusiness',
      '@id': `${seoCfg.siteUrl}/#business`,
      name: seoCfg.business.name,
      url: seoCfg.siteUrl,
      telephone: seoCfg.business.phone,
      email: seoCfg.business.email,
      address: {
        '@type': 'PostalAddress',
        streetAddress: seoCfg.business.streetAddress,
        addressLocality: seoCfg.business.locality,
        addressRegion: seoCfg.business.region,
        postalCode: seoCfg.business.postalCode,
        addressCountry: seoCfg.business.country,
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: seoCfg.business.geo.lat,
        longitude: seoCfg.business.geo.lng,
      },
      openingHours: seoCfg.business.hours,
      image: seoCfg.ogImage,
      priceRange: '$$',
      sameAs: [seoCfg.business.instagram],
      foundingDate: seoCfg.business.founded,
      description: seoCfg.description,
    },
    {
      '@type': 'Organization',
      '@id': `${seoCfg.siteUrl}/#organization`,
      name: seoCfg.business.name,
      url: seoCfg.siteUrl,
      logo: `${seoCfg.siteUrl}/favicon-192.png`,
      sameAs: [seoCfg.business.instagram],
    },
  ],
}

// ═══════════════════════════════════════════════════════════════════════════════
// The area below the hero starts covered by a dark veil (same tone as the header,
// with a soft gradient trailing edge) instead of the bare paper color. The veil moves
// upward inside a clipped track so its gradient keeps its softness without entering
// the hero. Once it clears, the hero's paper fade continues the reveal upward.
export default function Home() {
  const rm = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [pageReady, setPageReady] = useState(rm)

  useEffect(() => {
    if (rm) return
    const onIntroDone = () => setPageReady(true)
    document.addEventListener('fnx-intro-done', onIntroDone)
    return () => document.removeEventListener('fnx-intro-done', onIntroDone)
  }, [rm])

  return (
    <>
    <PageSEO
      title="Iluminación en City Bell y La Plata — Desde 1977"
      description="Luminarias, materiales eléctricos y asesoramiento experto en City Bell, La Plata. Tres generaciones de familia desde 1977. Envíos y retiro en local."
      url="/"
      schema={LOCAL_BUSINESS_SCHEMA}
    />
    <div style={{ background: T.paper, color: T.ink, overflowX: 'hidden', position: 'relative' }}>
      {/* Paper grain */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
          mixBlendMode: 'multiply', opacity: 0.04,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
      <HeroSection pageReady={pageReady} />
      <div style={{ position: 'relative' }}>
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50, pointerEvents: 'none',
            height: 'clamp(500px, 100vh, 1000px)', overflow: 'hidden',
          }}
        >
          <div style={{
            position: 'absolute', inset: 0,
            background: `linear-gradient(180deg, ${T.dark} 0%, ${T.dark} 52%, rgba(20,16,10,.92) 61%, rgba(20,16,10,.70) 72%, rgba(20,16,10,.42) 83%, rgba(20,16,10,.16) 93%, rgba(20,16,10,0) 100%)`,
            transform: pageReady ? 'translateY(-100%)' : 'translateY(0)',
            transition: rm ? 'none' : `transform ${INTRO_CURTAIN_DURATION_MS}ms cubic-bezier(0.16,1,0.3,1)`,
            willChange: 'transform',
          }} />
        </div>
        <CategoriasSection />
        <DestacadosSection />
        <MostSearchedSection />
        <HistoriaSection />
        <ResenasSection />
        <ContactoSection />
      </div>
    </div>
    </>
  )
}

// ─── 1. Hero ───────────────────────────────────────────────────────────────────
const ALL_REACHED  = { bg:true,  eyebrow:true,  h1:true,  sub:true,  cta:true  }
const NONE_REACHED = { bg:false, eyebrow:false, h1:false, sub:false, cta:false }

function HeroSection({ pageReady }) {
  const rm = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const [reached, setReached] = useState(rm ? ALL_REACHED : NONE_REACHED)

  useEffect(() => {
    if (rm) {
      document.dispatchEvent(new CustomEvent('fnx-intro-done'))
      return
    }

    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:#14100A;pointer-events:none;transition:opacity 0.8s ease;'
    document.body.appendChild(overlay)
    overlay.getBoundingClientRect()

    const set = (key) => setReached(prev => ({ ...prev, [key]: true }))
    const ts = [
      setTimeout(() => { overlay.style.opacity = '0' },   80),
      setTimeout(() => set('bg'),                        200),
      setTimeout(() => set('eyebrow'),                   520),
      setTimeout(() => set('h1'),                        720),
      setTimeout(() => set('sub'),                       920),
      setTimeout(() => set('cta'),                      1120),
      setTimeout(() => document.dispatchEvent(new CustomEvent('fnx-intro-done')), INTRO_DONE_DELAY_MS),
      setTimeout(() => overlay.remove(),                1760),
    ]
    return () => { ts.forEach(clearTimeout); overlay.remove() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fade = (v, dur = '0.8s') =>
    v ? { opacity: 1, transition: rm ? 'none' : `opacity ${dur} ease` }
      : { opacity: 0, transition: 'none' }

  const rise = (v, dur = '0.7s') =>
    v ? { opacity: 1, transform: 'none',           transition: rm ? 'none' : `opacity ${dur} ease, transform ${dur} cubic-bezier(0.16,1,0.3,1)` }
      : { opacity: 0, transform: 'translateY(16px)', transition: 'none' }

  return (
    <header style={{
      position: 'relative',
      minHeight: 'clamp(620px, 72vh, 840px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', color: '#F2EBDC',
      background: '#14100A',
      overflow: 'hidden',
    }}>
      {/* Photo background — pendant globe lights */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: `url(${heroImg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center 66%',
        ...fade(reached.bg, '1.4s'),
      }} />

      {/* Darkening overlay for text legibility */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, zIndex: 1,
        background: [
          'linear-gradient(180deg, rgba(10,8,4,0.55) 0%, rgba(10,8,4,0.35) 40%, rgba(10,8,4,0.72) 100%)',
          'radial-gradient(60% 55% at 50% 42%, rgba(10,8,4,0.15), rgba(10,8,4,0.55) 78%)',
        ].join(','),
      }} />

      {/* Fade into the page background so the categories blend in, no hard cut.
          Scales up from the bottom edge so the transition sweeps in cinematically. */}
      <div aria-hidden="true" style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 1,
        height: HERO_PAPER_FADE_HEIGHT,
        background: `linear-gradient(180deg, rgba(247,244,239,0) 0%, rgba(247,244,239,.05) 18%, rgba(247,244,239,.18) 38%, rgba(247,244,239,.42) 60%, rgba(247,244,239,.72) 80%, rgba(247,244,239,.92) 94%, ${T.paper} 100%)`,
        pointerEvents: 'none',
        transform: pageReady ? 'scaleY(1)' : 'scaleY(0)',
        transformOrigin: 'bottom',
        transition: rm ? 'none' : `transform .75s cubic-bezier(0.16,1,0.3,1) ${INTRO_HERO_FADE_DELAY_MS}ms`,
      }} />

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 2, padding: '90px 30px 44px', maxWidth: 900 }}>
        <div style={{
          fontFamily: "var(--font-sans)",
          fontSize: 12.5, letterSpacing: '.26em', textTransform: 'uppercase',
          color: 'rgba(242,235,220,0.72)', marginBottom: 20,
          ...rise(reached.eyebrow, '0.7s'),
        }}>
          City Bell · desde 1977
        </div>
        <h1 style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 600, margin: 0,
          fontSize: 'clamp(48px, 7vw, 100px)',
          lineHeight: .9, letterSpacing: '-.025em',
          color: '#F7F4EF',
          textShadow: '0 4px 32px rgba(0,0,0,0.35)',
          ...rise(reached.h1, '0.8s'),
        }}>
          Tu casa,<br />
          <em style={{ fontStyle: 'normal' }}>en su mejor luz</em>
        </h1>
      </div>
    </header>
  )
}

// ─── 2. Comprá por categoría (flotante sobre el hero) ──────────────────────────
// Stays hidden until the hero's cinematic intro finishes dispatching 'fnx-intro-done',
// so the photo + headline always land before the category cards appear.
function CategoriasSection() {
  const navigate = useNavigate()
  const rm = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [ready, setReady] = useState(rm)

  useEffect(() => {
    if (rm) return
    const onIntroDone = () => setReady(true)
    document.addEventListener('fnx-intro-done', onIntroDone)
    return () => document.removeEventListener('fnx-intro-done', onIntroDone)
  }, [rm])

  return (
    <section
      id="categorias"
      style={{
        maxWidth: 1440, margin: '0 auto', padding: '0 40px 120px', position: 'relative', zIndex: 3, scrollMarginTop: 90,
        opacity: ready ? 1 : 0,
        transform: ready ? 'translateY(0)' : 'translateY(24px)',
        transition: rm ? 'none' : 'opacity .8s cubic-bezier(0.16,1,0.3,1), transform .8s cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      <div
        className="fnx-cat-grid"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'clamp(32px, 5vw, 56px)' }}
      >
        {CATEGORIES.map((cat) => (
          <CategoryCard key={cat.code} cat={cat} onClick={() => navigate(cat.to)} />
        ))}
      </div>
      <style>{`
        .fnx-cat-grid { margin-top: -72px; }
        @media (min-width: 640px)  { .fnx-cat-grid { margin-top: -104px; } }
        @media (min-width: 1024px) { .fnx-cat-grid { margin-top: -136px; } }
      `}</style>
    </section>
  )
}

function CategoryCard({ cat, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <a
      href={cat.to}
      onClick={(e) => { e.preventDefault(); onClick() }}
      style={{ textDecoration: 'none', color: T.ink, display: 'block' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          display: 'flex', flexDirection: 'column',
          background: cat.productShot ? 'transparent' : cat.image ? T.surface2 : 'linear-gradient(160deg, #2A2118 0%, #3A2E1E 55%, #4A3B24 100%)',
          border: cat.productShot ? 'none' : `1px solid ${hovered ? T.hairlineStrong : T.hairline}`,
          borderRadius: 3, overflow: 'hidden',
          boxShadow: cat.productShot ? 'none' : hovered ? '0 12px 36px -10px rgba(22,17,11,0.16)' : '0 2px 8px -4px rgba(22,17,11,0.04)',
          transition: 'box-shadow .35s ease, border-color .25s ease',
        }}
      >
        <div style={{ position: 'relative', aspectRatio: cat.productShot ? '2.4/1' : '4/4.3' }}>
          {cat.image
            ? <img
                src={cat.image} alt={cat.name}
                style={{
                  width: '100%', height: '100%', display: 'block',
                  objectFit: cat.productShot ? 'contain' : 'cover',
                  objectPosition: 'center',
                  padding: cat.productShot ? '3%' : 0,
                  boxSizing: 'border-box',
                  transform: hovered ? 'scale(1.06)' : 'scale(1)',
                  transition: 'transform .6s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                }}
                loading="lazy"
              />
            : (
              <>
                <div aria-hidden="true" style={{
                  position: 'absolute', inset: 0,
                  background: 'radial-gradient(64% 54% at 68% 28%, rgba(224,162,74,0.28), transparent 68%)',
                  transform: hovered ? 'scale(1.06)' : 'scale(1)',
                  transition: 'transform .6s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                }} />
                <div style={{
                  position: 'absolute', inset: 0, zIndex: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: hovered ? 0.9 : 0.72,
                  transform: hovered ? 'scale(1.08)' : 'scale(1)',
                  transition: 'transform .5s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity .3s ease',
                }}>
                  <CategoryIcon type={cat.icon} />
                </div>
              </>
            )
          }
        </div>
        <div style={{ padding: '14px 4px 4px', textAlign: 'center' }}>
          <span style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 18, color: T.ink }}>
            {cat.name}
          </span>
        </div>
      </div>
    </a>
  )
}

function CategoryIcon({ type }) {
  const stroke = '#E0A24A'
  const common = { width: 56, height: 56, viewBox: '0 0 24 24', fill: 'none', stroke, strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }
  switch (type) {
    case 'led':
      return (
        <svg {...common}>
          <rect x="3" y="9" width="18" height="6" rx="1.5" />
          <path d="M6 9v6M9.5 9v6M13 9v6M16.5 9v6" opacity="0.6" />
        </svg>
      )
    case 'plug':
      return (
        <svg {...common}>
          <path d="M9 3v5M15 3v5" />
          <path d="M6 8h12v4a6 6 0 0 1-12 0V8Z" />
          <path d="M12 18v3" />
        </svg>
      )
    case 'sun':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
        </svg>
      )
    case 'tool':
      return (
        <svg {...common}>
          <path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4L20 7.3l-3-3-2.3 2z" />
        </svg>
      )
    case 'gear':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z" />
        </svg>
      )
    case 'tag':
      return (
        <svg {...common}>
          <path d="M12.6 2H4a2 2 0 0 0-2 2v8.6a2 2 0 0 0 .6 1.4l9 9a2 2 0 0 0 2.8 0l7.6-7.6a2 2 0 0 0 0-2.8l-9-9a2 2 0 0 0-1.4-.6Z" />
          <circle cx="7.5" cy="7.5" r="1.4" />
        </svg>
      )
    case 'bulb':
    default:
      return (
        <svg {...common}>
          <path d="M9 18h6" />
          <path d="M10 21h4" />
          <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.46 1.1 1.3 1.1 2.2h5c0-.9.5-1.74 1.1-2.2A6 6 0 0 0 12 3Z" />
        </svg>
      )
  }
}

// ─── 3. Destacados ─────────────────────────────────────────────────────────────
// Same product set as the "Promociones" category page (/products?category=Promociones):
// anything currently marked down (has an originalPrice), kept in sync via that one condition.
function DestacadosSection() {
  const { addItem } = useCart()
  const { products } = useAdmin()
  const featured = products.filter(p => p.originalPrice)

  if (featured.length === 0) return null

  return (
    <section
      id="destacados"
      style={{
        margin: '18px 0 0',
        padding: '14px 24px',
        scrollMarginTop: 90,
      }}
    >
      <Reveal>
        <div className="fnx-tonal-product-section">
          <div className="fnx-tonal-product-section__header">
            <Link to="/products?category=Promociones" style={{ textDecoration: 'none' }}>
              <h2 className="fnx-tonal-product-section__title">Promociones</h2>
            </Link>
          </div>
          <InfiniteProductCarousel products={featured} onAdd={addItem} label="Promociones" />
        </div>
      </Reveal>
    </section>
  )
}

function MostSearchedSection() {
  const { addItem } = useCart()
  const { products } = useAdmin()
  const [bestSellerIds, setBestSellerIds] = useState([])

  useEffect(() => {
    const controller = new AbortController()

    fetch(`${API_BASE}/api/catalog/best-sellers?days=30&limit=15`, { signal: controller.signal })
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('No se pudo cargar el ranking')))
      .then((data) => setBestSellerIds((data.products || []).map((item) => item.productId)))
      .catch((err) => {
        if (err.name !== 'AbortError') setBestSellerIds([])
      })

    return () => controller.abort()
  }, [])

  const productById = new Map(products.map((product) => [String(product.id), product]))
  const rankedProducts = bestSellerIds.map((id) => productById.get(String(id))).filter(Boolean)
  const rankedIds = new Set(rankedProducts.map((product) => String(product.id)))
  const mostSearched = [
    ...rankedProducts,
    ...products.filter((product) => !rankedIds.has(String(product.id))),
  ].slice(0, 15)

  if (mostSearched.length === 0) return null

  return (
    <section
      id="mas-buscados"
      style={{
        margin: '18px 0 0',
        padding: '14px 24px',
        scrollMarginTop: 90,
      }}
    >
      <Reveal>
        <div className="fnx-tonal-product-section fnx-tonal-product-section--alternate">
          <div className="fnx-tonal-product-section__header">
            <h2 className="fnx-tonal-product-section__title">Los más buscados</h2>
          </div>
          <InfiniteProductCarousel products={mostSearched} onAdd={addItem} label="Los más buscados" />
        </div>
      </Reveal>
    </section>
  )
}

function InfiniteProductCarousel({ products, onAdd, label }) {
  const carouselRef = useRef(null)
  const normalizeTimer = useRef(null)
  const [canScroll, setCanScroll] = useState(false)
  const shouldLoop = products.length > 5
  const carouselProducts = shouldLoop
    ? Array.from({ length: 3 }, () => products).flat()
    : products

  useEffect(() => {
    const carousel = carouselRef.current
    if (!carousel || products.length === 0) return undefined
    let frameId

    function jumpTo(left) {
      carousel.style.scrollBehavior = 'auto'
      carousel.scrollLeft = left
      frameId = requestAnimationFrame(() => { carousel.style.scrollBehavior = '' })
    }

    function getMetrics() {
      if (!shouldLoop) return null
      const middleStart = carousel.children[products.length]?.offsetLeft
      const nextStart = carousel.children[products.length * 2]?.offsetLeft
      if (middleStart == null || nextStart == null) return null
      return { middleStart, nextStart, setWidth: nextStart - middleStart }
    }

    function positionCarousel() {
      const first = carousel.children[0]
      const last = carousel.children[products.length - 1]
      const contentWidth = first && last ? last.offsetLeft + last.offsetWidth - first.offsetLeft : 0
      setCanScroll(contentWidth > carousel.clientWidth + 2)

      const metrics = getMetrics()
      if (metrics) jumpTo(metrics.middleStart)
    }

    function normalizePosition() {
      if (!shouldLoop) return
      clearTimeout(normalizeTimer.current)
      normalizeTimer.current = setTimeout(() => {
        const metrics = getMetrics()
        if (!metrics) return

        if (carousel.scrollLeft < metrics.middleStart - 2) {
          jumpTo(carousel.scrollLeft + metrics.setWidth)
        } else if (carousel.scrollLeft >= metrics.nextStart - 2) {
          jumpTo(carousel.scrollLeft - metrics.setWidth)
        }
      }, 140)
    }

    frameId = requestAnimationFrame(positionCarousel)
    carousel.addEventListener('scroll', normalizePosition, { passive: true })
    window.addEventListener('resize', positionCarousel)

    return () => {
      cancelAnimationFrame(frameId)
      clearTimeout(normalizeTimer.current)
      carousel.removeEventListener('scroll', normalizePosition)
      window.removeEventListener('resize', positionCarousel)
    }
  }, [products.length, shouldLoop])

  function move(direction) {
    const carousel = carouselRef.current
    if (!carousel) return
    carousel.scrollBy({ left: direction * carousel.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className="fnx-promo-carousel-shell">
      <button
        type="button"
        className="fnx-promo-arrow fnx-promo-arrow--previous"
        onClick={() => move(-1)}
        disabled={!canScroll}
        aria-label={`Ver productos anteriores de ${label}`}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7" /></svg>
      </button>
      <div ref={carouselRef} className="fnx-promo-carousel" aria-label={label}>
        {carouselProducts.map((product, index) => (
          <div key={`${product.id}-${index}`} className="fnx-promo-slide">
            <FeaturedCard product={product} onAdd={onAdd} />
          </div>
        ))}
      </div>
      <button
        type="button"
        className="fnx-promo-arrow fnx-promo-arrow--next"
        onClick={() => move(1)}
        disabled={!canScroll}
        aria-label={`Ver más productos de ${label}`}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 5 7 7-7 7" /></svg>
      </button>
    </div>
  )
}

function FeaturedCard({ product, onAdd }) {
  const [addHover, setAddHover] = useState(false)
  const [cardHovered, setCardHovered] = useState(false)

  function handleAdd(e) {
    e.preventDefault()
    if (!product.inStock) return
    onAdd({ id: product.id, name: product.name, price: product.price, image: product.image, category: product.category })
  }

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column',
        height: '100%',
        transform: cardHovered ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'transform .38s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      }}
      onMouseEnter={() => setCardHovered(true)}
      onMouseLeave={() => setCardHovered(false)}
    >
      <Link to={`/products/${product.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
        <div style={{
          position: 'relative', aspectRatio: '1/1',
          background: T.surface2,
          border: `1px solid ${cardHovered ? T.hairlineStrong : T.hairline}`,
          borderRadius: 3, overflow: 'hidden',
          boxShadow: cardHovered
            ? '0 20px 52px -12px rgba(22,17,11,0.22)'
            : '0 2px 10px -4px rgba(22,17,11,0.06)',
          transition: 'box-shadow .38s ease, border-color .25s ease',
        }}>
          {product.image
            ? <img
                src={product.image} alt={product.name}
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
                transform: cardHovered ? 'scale(1.07)' : 'scale(1)',
                transition: 'transform .6s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              }} />
          }
          <span style={{ position: 'absolute', top: 9, left: 10, fontFamily: "'Inter', system-ui, sans-serif", fontSize: 9, letterSpacing: '.07em', color: T.text3, zIndex: 1 }}>
            {product.category}
          </span>
          {product.originalPrice && (
            <span style={{
              position: 'absolute', top: 9, right: 10, zIndex: 1,
              background: T.amber, color: '#fff',
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 10, fontWeight: 600, letterSpacing: '.02em',
              padding: '2px 6px', borderRadius: 2,
            }}>
              -{Math.round((1 - product.price / product.originalPrice) * 100)}%
            </span>
          )}
          {/* Hover overlay */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: 2,
            background: 'rgba(22,17,11,0.36)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: cardHovered ? 1 : 0,
            transition: 'opacity .3s ease',
            pointerEvents: cardHovered ? 'auto' : 'none',
          }}>
            <span style={{
              background: T.cream,
              color: T.ink,
              fontSize: 10, fontWeight: 500,
              letterSpacing: '.15em', textTransform: 'uppercase',
              padding: '9px 16px', borderRadius: 2,
              fontFamily: "var(--font-sans)",
              transform: cardHovered ? 'translateY(0)' : 'translateY(10px)',
              transition: 'transform .35s ease',
            }}>
              Ver producto
            </span>
          </div>
        </div>
      </Link>
      <div style={{ padding: '10px 2px 0', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <Link to={`/products/${product.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <h3 style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 400, fontSize: 12.5, lineHeight: 1.35, margin: '0 0 8px', color: T.ink }}>
            {product.name}
          </h3>
        </Link>
        <div style={{
          marginTop: 'auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          borderTop: `1px solid ${T.hairline}`, paddingTop: 9,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, fontWeight: 500, color: T.ink }}>
              {fmt(product.price)}
            </span>
            {product.originalPrice && (
              <span style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 10.5, color: T.muted2, textDecoration: 'line-through' }}>
                {fmt(product.originalPrice)}
              </span>
            )}
          </div>
          <button
            onClick={handleAdd}
            disabled={!product.inStock}
            style={{
              background: 'none', border: 'none',
              cursor: product.inStock ? 'pointer' : 'default',
              fontSize: 11.5, fontWeight: 500,
              color: addHover && product.inStock ? T.red : T.ink,
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 0',
              borderBottom: `1px solid ${addHover && product.inStock ? T.red : T.hairlineStrong}`,
              transition: 'color .15s, border-color .15s',
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
            onMouseEnter={() => setAddHover(true)}
            onMouseLeave={() => setAddHover(false)}
          >
            {product.inStock ? 'Agregar' : 'Sin stock'}
            {product.inStock && (
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

// ─── 4. La casa ────────────────────────────────────────────────────────────────
function HistoriaSection() {
  return (
    <section
      id="historia"
      className="fnx-historia-section"
      style={{ marginTop: 84, scrollMarginTop: 90 }}
    >
      <div className="fnx-historia-card" style={{ background: T.dark, color: '#EAE2D3' }}>
        <div aria-hidden="true" style={{ position: 'absolute', top: '-14%', right: '-4%', width: 480, height: 480, background: 'radial-gradient(circle, rgba(224,162,74,0.16) 0%, rgba(224,162,74,0.04) 42%, transparent 68%)', pointerEvents: 'none' }} />
        <div
          className="fnx-historia-grid"
          style={{ maxWidth: 1320, margin: '0 auto', padding: '90px 40px', display: 'grid', gridTemplateColumns: '0.86fr 1.14fr', gap: 60, alignItems: 'center', position: 'relative' }}
        >
          <Reveal y={40}>
            <figure style={{ margin: 0 }}>
              <div style={{ aspectRatio: '3/4', borderRadius: 3, overflow: 'hidden', background: '#241B12', border: '1px solid #2E2417', position: 'relative' }}>
                <img
                  src={localImg}
                  alt="El local Fénix"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.88 }}
                />
              </div>
            </figure>
          </Reveal>

          <Reveal delay={150} y={40}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: '#9A8B6E' }}>Quiénes somos</span>
              <span style={{ width: 34, height: 1, background: '#473A28' }} />
            </div>
            <p style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'clamp(26px, 2.9vw, 40px)', lineHeight: 1.32,
              fontWeight: 400, margin: 0, color: '#F2EBDC', letterSpacing: '-.005em',
            }}>
              Abrimos en <span style={{ fontVariantNumeric: 'lining-nums', fontFeatureSettings: '"lnum" 1' }}>1977</span> con una idea simple, y todavía la sostenemos: asesorar de verdad, no solo vender una lámpara.
            </p>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 15.5, lineHeight: 1.75, color: '#A99E8B', margin: '28px 0 0', maxWidth: 520 }}>
              Tres generaciones de la misma familia atendieron este mostrador. Conocemos cada proyecto por su nombre y elegimos los productos que pondríamos en nuestra propia casa.
            </p>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: '#8C8270', marginTop: 38, borderTop: '1px solid #2E2417', paddingTop: 18 }}>
              Familia Fénix — tres generaciones en City Bell
            </div>
          </div>
          </Reveal>
        </div>
        <style>{`.fnx-historia-grid { grid-template-columns: 1fr !important; } @media (min-width: 860px) { .fnx-historia-grid { grid-template-columns: 0.86fr 1.14fr !important; } }`}</style>
      </div>
    </section>
  )
}

// ─── 5. Contacto ───────────────────────────────────────────────────────────────
function ContactoSection() {
  return (
    <section id="contacto" style={{ maxWidth: 1320, margin: '0 auto', padding: '90px 40px', scrollMarginTop: 90 }}>
      <div className="fnx-contacto-grid" style={{ display: 'grid', gridTemplateColumns: '0.92fr 1.08fr', gap: 54, alignItems: 'stretch' }}>
        {/* Info */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: T.muted }}>El local</span>
            <span style={{ width: 34, height: 1, background: T.hairlineStrong }} />
          </div>
          <h2 style={{
            fontFamily: 'var(--font-sans)', fontWeight: 400,
            fontSize: 'clamp(32px, 3.8vw, 52px)', lineHeight: 1.0,
            margin: '0 0 30px', color: T.ink, letterSpacing: '-.015em',
          }}>
            Pasá a vernos
          </h2>
          <div style={{ borderTop: `1px solid ${T.hairline}` }}>
            {[
              { label: 'dirección', value: <span>C. Cantilo 745, City Bell<br />La Plata, Buenos Aires</span> },
              { label: 'horarios',  value: 'Lunes a Sábado · 8:30–13:00 / 16:00–20:00' },
              { label: 'teléfono', value: '(221) 480-1977' },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', gap: 18, padding: '17px 0', borderBottom: `1px solid ${T.hairline}` }}>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: T.muted2, minWidth: 88, paddingTop: 3 }}>
                  {label}
                </span>
                <span style={{ fontSize: 16, color: T.ink2, lineHeight: 1.5 }}>{value}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 28, flexWrap: 'wrap', alignItems: 'center' }}>
            <WaButton />
            <ComoLlegarLink />
          </div>
        </div>

        {/* Map embed */}
        <figure style={{ margin: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            position: 'relative', flex: 1, minHeight: 360,
            borderRadius: 3, overflow: 'hidden',
            border: `1px solid ${T.hairline}`,
          }}>
            <iframe
              title="Ubicación Fénix"
              src="https://maps.google.com/maps?q=Electricidad+E+Iluminacion+Fenix+City+Bell+La+Plata&output=embed"
              width="100%"
              height="100%"
              style={{ position: 'absolute', inset: 0, border: 0, display: 'block', filter: 'saturate(0.85) contrast(0.95)' }}
              allowFullScreen=""
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <figcaption style={{ fontFamily: "var(--font-sans)", fontSize: 10.5, color: T.muted2, marginTop: 11 }}>
            MAPA · C. Cantilo 745, City Bell
          </figcaption>
        </figure>
      </div>
      <style>{`.fnx-contacto-grid { grid-template-columns: 1fr !important; } @media (min-width: 820px) { .fnx-contacto-grid { grid-template-columns: 0.92fr 1.08fr !important; } }`}</style>
    </section>
  )
}

function WaButton() {
  const [hovered, setHovered] = useState(false)
  return (
    <a
      href="https://wa.me/5492214801977?text=Hola!%20Quiero%20consultar%20sobre%20sus%20productos"
      target="_blank" rel="noopener noreferrer"
      style={{
        textDecoration: 'none',
        background: hovered ? T.wa : T.ink,
        color: T.paper,
        fontSize: 14, fontWeight: 500, padding: '14px 26px', borderRadius: 2,
        display: 'inline-flex', alignItems: 'center', gap: 9,
        transition: 'background .15s',
        fontFamily: "var(--font-sans)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <WaIcon />
      Escribinos por WhatsApp
    </a>
  )
}

function ComoLlegarLink() {
  const [hovered, setHovered] = useState(false)
  return (
    <a
      href="https://maps.google.com/?q=Electricidad+E+Iluminacion+Fenix+City+Bell+La+Plata"
      target="_blank" rel="noopener noreferrer"
      style={{
        textDecoration: 'none', color: T.ink,
        fontSize: 14.5, fontWeight: 500,
        borderBottom: `1px solid ${hovered ? T.ink : T.hairlineStrong}`, paddingBottom: 3,
        transition: 'border-color .15s',
        fontFamily: "var(--font-sans)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      Cómo llegar →
    </a>
  )
}

function WaIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7s-3.7-3.2-3.8-3.4c-.1-.2-.9-1.2-.9-2.3s.6-1.6.8-1.9c.2-.2.4-.3.6-.3h.4c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .5l-.4.5c-.2.2-.3.3-.1.6s.7 1.1 1.4 1.7c.9.8 1.6 1 1.9 1.2.2.1.4.1.5-.1l.6-.7c.2-.2.3-.2.6-.1l1.8.9c.3.1.4.2.5.3.1.2.1.6-.1 1.2Z" />
    </svg>
  )
}

// ─── Reseñas Section ───────────────────────────────────────────────────────────
const RESENAS = [
  {
    nombre: 'Martina G.',
    inicial: 'M',
    fecha: 'hace 2 semanas',
    texto: 'Excelente atención. Fui buscando una lámpara para el comedor y me asesoraron muy bien, terminé eligiendo algo mucho mejor de lo que tenía en mente. El producto llegó perfecto.',
  },
  {
    nombre: 'Pablo R.',
    inicial: 'P',
    fecha: 'hace 1 mes',
    texto: 'Compré tiras LED para toda la cocina. Me explicaron todo sobre temperatura de color y potencia antes de llevar. Instalé todo sin problemas y quedó impecable.',
  },
  {
    nombre: 'Laura S.',
    inicial: 'L',
    fecha: 'hace 3 semanas',
    texto: 'Local de barrio con atención de primera. Llevan años en City Bell y se nota — conocen los productos de verdad. Los precios son más que razonables para la calidad que ofrecen.',
  },
]

function StarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="#F59E0B" stroke="none">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

const RESENA_CARD_W = 340
const RESENA_GAP = 20
const RESENA_SPEED = 46 // px/s

function ResenasSection() {
  // Enough copies so the strip never runs out of content mid-loop, however wide
  // the screen is — otherwise the reset shows a visible jump instead of an
  // uninterrupted scroll. Kept even so translateX(-50%) lands on a whole
  // multiple of one set's width.
  const repeatRaw = Math.min(8, Math.max(2, Math.ceil(16 / RESENAS.length)))
  const repeat = repeatRaw % 2 === 0 ? repeatRaw : repeatRaw + 1
  const track = Array.from({ length: repeat }, () => RESENAS).flat()
  const setWidth = RESENAS.length * RESENA_CARD_W + (RESENAS.length - 1) * RESENA_GAP
  const duration = (repeat / 2) * setWidth / RESENA_SPEED

  return (
    <section style={{ background: T.paper, padding: '72px 0' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '0 40px' }}>
        <Reveal>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, marginBottom: 40, flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: T.muted2, display: 'block', marginBottom: 10 }}>
              Opiniones
            </span>
            <h2 style={{
              fontFamily: 'var(--font-sans)', fontWeight: 400,
              fontSize: 'clamp(26px, 3vw, 40px)', color: T.ink, margin: 0, lineHeight: 1.1,
            }}>
              Lo que dicen nuestros clientes
            </h2>
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 16px', borderRadius: 999,
            background: '#FBF8F3', border: '1px solid #DED6C7',
            fontFamily: "var(--font-sans)", fontSize: 11, color: T.muted,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="#4285F4" stroke="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google Reviews
          </div>
        </div>
        </Reveal>
      </div>

      <div style={{ overflow: 'hidden', width: '100%' }}>
        <div
          className="fnx-marquee-track fnx-resenas-track"
          style={{
            display: 'flex', gap: RESENA_GAP, width: 'max-content', padding: '4px 40px',
            animation: `fnx-marquee ${duration}s linear infinite`,
          }}
        >
          {track.map((r, i) => (
            <div
              key={`${r.nombre}-${i}`}
              style={{
                width: RESENA_CARD_W, flexShrink: 0,
                background: T.panel, border: '1px solid #DED6C7',
                borderRadius: 3, padding: '24px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: T.surface2, color: T.ink,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: 15, fontWeight: 600, flexShrink: 0,
                }}>
                  {r.inicial}
                </div>
                <div>
                  <p style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13.5, fontWeight: 500, color: T.ink, margin: 0 }}>{r.nombre}</p>
                  <p style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 11.5, color: T.muted2, margin: 0 }}>{r.fecha}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 2, marginBottom: 12 }}>
                {[...Array(5)].map((_, i) => <StarIcon key={i} />)}
              </div>
              <p style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 13.5, lineHeight: 1.65, color: '#5A5248', margin: 0,
              }}>
                {r.texto}
              </p>
            </div>
          ))}
        </div>
      </div>
      <style>{`.fnx-resenas-track:hover { animation-play-state: paused; }`}</style>
    </section>
  )
}
