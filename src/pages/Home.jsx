import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { products } from '../data/products'
import { useCart } from '../context/CartContext'

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

const fmt = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

const CATEGORIES = [
  { code: 'IL',  name: 'Iluminación',          to: '/products?category=Iluminación Interior' },
  { code: 'LED', name: 'Lámparas LED',         to: '/products?category=Tiras LED'            },
  { code: 'VT',  name: 'Ventiladores',         to: '/products?category=Ventiladores de techo'},
  { code: 'EM',  name: 'Materiales eléctricos',to: '/products?category=Electricidad'         },
  { code: 'EX',  name: 'Exterior',             to: '/products?category=Iluminación Exterior' },
]

// ═══════════════════════════════════════════════════════════════════════════════
export default function Home() {
  return (
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
      <HeroSection />
      <CategoriasSection />
      <DestacadosSection />
      <CatalogoBand />
      <HistoriaSection />
      <ContactoSection />
    </div>
  )
}

// ─── 1. Hero ───────────────────────────────────────────────────────────────────
const ALL_REACHED  = { bulb:true,  lamp:true,  bg:true,  cone:true,  eyebrow:true,  h1:true,  sub:true,  cta:true  }
const NONE_REACHED = { bulb:false, lamp:false, bg:false, cone:false, eyebrow:false, h1:false, sub:false, cta:false }

function HeroSection() {
  const rm = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const [reached, setReached] = useState(rm ? ALL_REACHED : NONE_REACHED)

  useEffect(() => {
    if (rm) {
      document.dispatchEvent(new CustomEvent('fnx-intro-done'))
      return
    }

    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:#FAF7F0;pointer-events:none;transition:opacity 0.8s ease;'
    document.body.appendChild(overlay)
    overlay.getBoundingClientRect()

    const set = (key) => setReached(prev => ({ ...prev, [key]: true }))
    const ts = [
      setTimeout(() => { overlay.style.opacity = '0' },   100),
      setTimeout(() => set('bulb'),                        420),
      setTimeout(() => set('lamp'),                        720),
      setTimeout(() => set('bg'),                          920),
      setTimeout(() => set('cone'),                       1220),
      setTimeout(() => set('eyebrow'),                    1620),
      setTimeout(() => set('h1'),                         2020),
      setTimeout(() => set('sub'),                        2420),
      setTimeout(() => set('cta'),                        2820),
      setTimeout(() => document.dispatchEvent(new CustomEvent('fnx-intro-done')), 3220),
      setTimeout(() => overlay.remove(),                  4100),
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
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', color: T.ink,
      background: '#FAF7F0',
      overflow: 'hidden',
    }}>
      {/* Warm radial glow — fades in as bulb lights up */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, zIndex: 0,
        background: [
          'radial-gradient(62% 56% at 50% 15%, rgba(255,200,75,0.40), rgba(255,175,45,0.14) 48%, transparent 72%)',
          'linear-gradient(180deg, #FBF4DF 0%, #FAF7F0 52%, #F7F4EF 100%)',
        ].join(','),
        ...fade(reached.bg, '1.4s'),
      }} />

      {/* Edison bulb on cord */}
      <div
        aria-hidden="true"
        className="fnx-lamp"
        style={{
          position: 'absolute', top: 0, left: '50%',
          transform: 'translateX(-50%)',
          transformOrigin: 'top center',
          zIndex: 1,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          animation: reached.lamp ? 'fnx-sway 7s ease-in-out infinite' : 'none',
          pointerEvents: 'none',
        }}
      >
        {/* Ceiling mount + cord + bulb */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', ...fade(reached.bulb, '0.9s') }}>
          {/* Ceiling bracket */}
          <div style={{ width: 22, height: 5, borderRadius: '0 0 3px 3px', background: 'linear-gradient(#8A8070, #6A6050)' }} />
          {/* Cord */}
          <div style={{ width: 2, height: 88, background: 'linear-gradient(#9A9888, #7A7868)' }} />

          {/* Edison bulb with glow filter */}
          <div
            className={reached.lamp ? 'fnx-bulb' : ''}
            style={{
              filter: reached.lamp
                ? 'drop-shadow(0 0 18px rgba(255,162,38,0.95)) drop-shadow(0 0 54px rgba(255,140,22,0.62)) drop-shadow(0 0 110px rgba(255,125,10,0.32))'
                : 'none',
              transition: 'filter 0.8s ease',
            }}
          >
            <EdisonBulbSVG lit={reached.lamp} />
          </div>
        </div>

        {/* Light cone below bulb */}
        <div style={{
          position: 'absolute', top: 228, left: '50%', transform: 'translateX(-50%)',
          width: 380, height: 560,
          background: 'linear-gradient(180deg, rgba(255,200,75,0.22) 0%, rgba(255,180,55,0.08) 36%, transparent 72%)',
          clipPath: 'polygon(38% 0, 62% 0, 100% 100%, 0 100%)',
          filter: 'blur(20px)',
          ...fade(reached.cone, '1.2s'),
        }} />
      </div>

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 2, padding: '120px 30px 90px', maxWidth: 900 }}>
        <div style={{
          fontFamily: "'Spline Sans Mono', monospace",
          fontSize: 12.5, letterSpacing: '.26em', textTransform: 'uppercase',
          color: 'rgba(22,17,11,0.50)', marginBottom: 26,
          ...rise(reached.eyebrow, '0.7s'),
        }}>
          City Bell · desde 1977
        </div>
        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontWeight: 500, margin: 0,
          fontSize: 'clamp(54px, 8vw, 116px)',
          lineHeight: .96, letterSpacing: '-.02em',
          color: T.ink,
          ...rise(reached.h1, '0.8s'),
        }}>
          Tu casa,<br />
          <em style={{ fontStyle: 'normal' }}>en su mejor luz</em>
        </h1>
        <p style={{
          maxWidth: 520, margin: '26px auto 0', fontSize: 17.5, lineHeight: 1.6,
          color: 'rgba(22,17,11,0.62)',
          ...rise(reached.sub, '0.7s'),
        }}>
          Luminarias, materiales eléctricos y el consejo de quien lo hace, con buen gusto, desde hace casi medio siglo.
        </p>
        <div style={{ marginTop: 40, ...rise(reached.cta, '0.6s') }}>
          <HeroCTA />
        </div>
      </div>

      <ScrollIndicator visible={reached.cta} rm={rm} />
    </header>
  )
}

function EdisonBulbSVG({ lit }) {
  const glass      = lit ? 'rgba(255,195,72,0.48)' : 'rgba(235,212,158,0.22)'
  const glassStroke= lit ? 'rgba(200,148,48,0.52)' : 'rgba(170,145,98,0.32)'
  const innerGlow  = lit ? 'rgba(255,222,108,0.30)' : 'transparent'
  const filament   = lit ? '#FF9830' : '#8B6B30'
  const metal      = '#C4BC9A'
  const metalStroke= '#9E9676'

  return (
    <svg width="100" height="190" viewBox="0 0 100 190" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Inner warm glow */}
      <circle cx="50" cy="52" r="30" fill={innerGlow} />

      {/* Glass globe — A60 bulb profile */}
      <path
        d="M 50 10
           C 24 10 8 26 8 52
           C 8 70 18 84 34 92
           L 34 106
           L 66 106
           L 66 92
           C 82 84 92 70 92 52
           C 92 26 76 10 50 10 Z"
        fill={glass}
        stroke={glassStroke}
        strokeWidth="1.5"
      />

      {/* Specular highlight */}
      <path
        d="M 20 32 Q 26 17 40 12"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Filament support rods */}
      <line x1="40" y1="104" x2="40" y2="74" stroke="#B09060" strokeWidth="0.9" opacity="0.75" />
      <line x1="60" y1="104" x2="60" y2="74" stroke="#B09060" strokeWidth="0.9" opacity="0.75" />
      <line x1="40" y1="80" x2="60" y2="80" stroke="#B09060" strokeWidth="0.8" opacity="0.55" />

      {/* Edison filament — looped arch */}
      <path
        d="M 40 74 L 40 58 Q 40 46 50 44 Q 60 46 60 58 L 60 74"
        stroke={filament} strokeWidth="1.6" strokeLinecap="round"
      />
      {/* Inner coil detail */}
      <path
        d="M 43 58 C 43 53 50 51 50 55 C 50 59 57 57 57 52 C 57 47 50 45 50 45"
        stroke={filament} strokeWidth="1.2" strokeLinecap="round"
      />

      {/* Metal collar */}
      <rect x="30" y="106" width="40" height="7" rx="2" fill={metal} stroke={metalStroke} strokeWidth="1" />

      {/* Screw base */}
      <rect x="28" y="113" width="44" height="46" rx="3.5" fill={metal} />
      {/* Highlight strip */}
      <rect x="29" y="113" width="8" height="46" rx="2" fill="rgba(255,255,255,0.16)" />
      {/* Thread lines */}
      {[119, 125, 131, 137, 143, 149, 155].map(y => (
        <line key={y} x1="28" y1={y} x2="72" y2={y} stroke={metalStroke} strokeWidth="0.8" opacity="0.65" />
      ))}

      {/* Insulator disc */}
      <ellipse cx="50" cy="159" rx="22" ry="3.5" fill="#6E6454" />
      {/* Contact dome */}
      <ellipse cx="50" cy="163" rx="14" ry="7" fill="#D4C880" />
      <ellipse cx="50" cy="167" rx="9" ry="4.5" fill="#C4B868" />
    </svg>
  )
}

function HeroCTA() {
  const [hovered, setHovered] = useState(false)
  const navigate = useNavigate()
  return (
    <a
      href="/products"
      onClick={(e) => { e.preventDefault(); navigate('/products') }}
      style={{
        textDecoration: 'none', display: 'inline-block',
        border: `1px solid ${hovered ? T.ink : 'rgba(22,17,11,0.42)'}`,
        background: hovered ? T.ink : 'transparent',
        color: hovered ? T.paper : T.ink,
        fontSize: 13, fontWeight: 500,
        letterSpacing: '.16em', textTransform: 'uppercase',
        padding: '16px 34px', borderRadius: 2,
        transition: 'background .25s ease, color .25s ease, border-color .25s ease',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      Ver el catálogo
    </a>
  )
}

function ScrollIndicator({ visible = true, rm = false }) {
  const [hovered, setHovered] = useState(false)
  return (
    <a
      href="#categorias"
      onClick={(e) => { e.preventDefault(); document.getElementById('categorias')?.scrollIntoView({ behavior: 'smooth' }) }}
      style={{
        position: 'absolute', left: '50%', bottom: 30,
        transform: 'translateX(-50%)', zIndex: 2,
        textDecoration: 'none',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9,
        color: hovered ? T.ink : 'rgba(22,17,11,0.50)',
        fontFamily: "'Spline Sans Mono', monospace",
        fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase',
        opacity: visible ? 1 : 0,
        transition: rm ? 'color .15s' : 'color .15s, opacity 0.6s ease',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      Comprá por categoría
      <svg
        viewBox="0 0 24 24" width="18" height="18"
        fill="none" stroke="currentColor" strokeWidth="1.4"
        className="fnx-bob-el"
        style={{ animation: 'fnx-bob 2.4s ease-in-out infinite' }}
      >
        <path d="M12 5v14M6 13l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  )
}

// ─── 2. Comprá por categoría ───────────────────────────────────────────────────
function CategoriasSection() {
  const navigate = useNavigate()
  return (
    <section id="categorias" style={{ maxWidth: 1320, margin: '0 auto', padding: '96px 40px 30px', scrollMarginTop: 90 }}>
      <h2 style={{
        fontFamily: "'Playfair Display', serif", fontWeight: 500,
        fontSize: 'clamp(32px, 3.8vw, 52px)', lineHeight: 1.0,
        margin: '0 0 48px', color: T.ink, letterSpacing: '-.015em', textAlign: 'center',
      }}>
        Comprá por categoría
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 18 }}>
        {CATEGORIES.map((cat) => (
          <CategoryCard key={cat.code} cat={cat} onClick={() => navigate(cat.to)} />
        ))}
      </div>
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
          position: 'relative', aspectRatio: '4/5',
          background: T.surface2,
          border: `1px solid ${hovered ? T.hairlineStrong : T.hairline}`,
          borderRadius: 3, overflow: 'hidden',
          boxShadow: hovered ? '0 12px 36px -10px rgba(22,17,11,0.16)' : '0 2px 8px -4px rgba(22,17,11,0.04)',
          transition: 'box-shadow .35s ease, border-color .25s ease',
        }}
      >
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(72% 60% at 64% 30%, rgba(255,255,255,0.66), transparent 64%)',
          transform: hovered ? 'scale(1.06)' : 'scale(1)',
          transition: 'transform .6s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }} />
        <span style={{ position: 'absolute', top: 13, left: 14, fontFamily: "'Spline Sans Mono', monospace", fontSize: 11, letterSpacing: '.08em', color: T.ink, zIndex: 1 }}>
          {cat.code}
        </span>
        <span style={{ position: 'absolute', bottom: 12, right: 14, fontFamily: "'Spline Sans Mono', monospace", fontSize: 9.5, color: T.muted2, zIndex: 1 }}>
          FOTO
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 14 }}>
        <span style={{ fontFamily: "'Playfair Display', serif", fontWeight: 400, fontSize: 20, color: T.ink }}>
          {cat.name}
        </span>
        <svg
          viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={T.muted2} strokeWidth="1.6"
          style={{
            transform: hovered ? 'translateX(5px)' : 'translateX(0)',
            transition: 'transform .25s ease',
          }}
        >
          <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </a>
  )
}

// ─── 3. Destacados ─────────────────────────────────────────────────────────────
function DestacadosSection() {
  const { addItem } = useCart()
  const featured = products.slice(0, 4)

  return (
    <section id="destacados" style={{ maxWidth: 1320, margin: '0 auto', padding: '74px 40px 26px', scrollMarginTop: 90 }}>
      <div style={{ marginBottom: 42, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: 12, color: T.amber, marginBottom: 14, letterSpacing: '.12em' }}>
          Ofertas
        </div>
        <h2 style={{
          fontFamily: "'Playfair Display', serif", fontWeight: 500,
          fontSize: 'clamp(32px, 3.8vw, 52px)', lineHeight: 1.0,
          margin: 0, color: T.ink, letterSpacing: '-.015em',
        }}>
          Precios especiales de esta semana
        </h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(258px, 1fr))', gap: 26 }}>
        {featured.map((p) => (
          <FeaturedCard key={p.id} product={p} onAdd={addItem} />
        ))}
      </div>
    </section>
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
        transform: cardHovered ? 'translateY(-5px)' : 'translateY(0)',
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
          <span style={{ position: 'absolute', top: 12, left: 13, fontFamily: "'Spline Sans Mono', monospace", fontSize: 10, letterSpacing: '.06em', color: T.text3, zIndex: 1 }}>
            {product.category}
          </span>
          {product.originalPrice && (
            <span style={{
              position: 'absolute', top: 12, right: 13, zIndex: 1,
              background: T.amber, color: '#fff',
              fontFamily: "'Spline Sans Mono', monospace",
              fontSize: 11, fontWeight: 500, letterSpacing: '.04em',
              padding: '3px 8px', borderRadius: 2,
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
      <div style={{ padding: '16px 2px 0', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <Link to={`/products/${product.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <h3 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 400, fontSize: 19, lineHeight: 1.2, margin: '0 0 12px', color: T.ink }}>
            {product.name}
          </h3>
        </Link>
        <div style={{
          marginTop: 'auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          borderTop: `1px solid ${T.hairline}`, paddingTop: 13,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: 15, fontWeight: 500, color: T.ink }}>
              {fmt(product.price)}
            </span>
            {product.originalPrice && (
              <span style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: 12, color: T.muted2, textDecoration: 'line-through' }}>
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
              fontSize: 13, fontWeight: 500,
              color: addHover && product.inStock ? T.red : T.ink,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 0',
              borderBottom: `1px solid ${addHover && product.inStock ? T.red : T.hairlineStrong}`,
              transition: 'color .15s, border-color .15s',
              fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
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

// ─── 3b. Separador catálogo ────────────────────────────────────────────────────
const BAND_ITEMS = [
  'Iluminación', 'Lámparas LED', 'Ventiladores', 'Exterior', 'Materiales eléctricos',
  'Apliques', 'Tiras LED', 'Plafones', 'City Bell',
]

function CatalogoBand() {
  const items = [...BAND_ITEMS, ...BAND_ITEMS]
  return (
    <div style={{
      margin: '64px 0 0',
      borderTop: `1px solid ${T.hairline}`,
      borderBottom: `1px solid ${T.hairline}`,
      overflow: 'hidden',
      background: T.panel,
      padding: '18px 0',
    }}>
      <div
        className="fnx-marquee-track"
        style={{
          display: 'flex', gap: 0,
          width: 'max-content',
          animation: 'fnx-marquee 28s linear infinite',
        }}
      >
        {items.map((item, i) => (
          <span
            key={i}
            style={{
              fontFamily: "'Spline Sans Mono', monospace",
              fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase',
              color: i % 2 === 0 ? T.ink : T.muted2,
              padding: '0 38px',
              whiteSpace: 'nowrap',
              display: 'inline-flex', alignItems: 'center', gap: 38,
            }}
          >
            {item}
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: T.hairlineStrong, display: 'inline-block' }} />
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── 4. La casa ────────────────────────────────────────────────────────────────
function HistoriaSection() {
  return (
    <section
      id="historia"
      style={{ marginTop: 84, background: T.dark, color: '#EAE2D3', position: 'relative', overflow: 'hidden', scrollMarginTop: 90 }}
    >
      <div aria-hidden="true" style={{ position: 'absolute', top: '-14%', right: '-4%', width: 480, height: 480, background: 'radial-gradient(circle, rgba(224,162,74,0.16) 0%, rgba(224,162,74,0.04) 42%, transparent 68%)', pointerEvents: 'none' }} />
      <div
        className="fnx-historia-grid"
        style={{ maxWidth: 1320, margin: '0 auto', padding: '90px 40px', display: 'grid', gridTemplateColumns: '0.86fr 1.14fr', gap: 60, alignItems: 'center', position: 'relative' }}
      >
        <figure style={{ margin: 0 }}>
          <div style={{ aspectRatio: '4/5', borderRadius: 3, overflow: 'hidden', background: '#241B12', border: '1px solid #2E2417', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(80% 55% at 50% 18%, rgba(224,162,74,0.16), transparent 60%)' }} />
          </div>
          <figcaption style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: 10.5, color: '#7C7160', marginTop: 11 }}>
            FOTO · el local sobre Av. Centenario, 1980
          </figcaption>
        </figure>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <span style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: 12, color: '#9A8B6E' }}>La casa</span>
            <span style={{ width: 34, height: 1, background: '#473A28' }} />
          </div>
          <p style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 'clamp(27px, 3.1vw, 42px)', lineHeight: 1.28,
            fontWeight: 400, margin: 0, color: '#F2EBDC', letterSpacing: '-.01em',
          }}>
            Abrimos en 1977 con una idea simple, y todavía la sostenemos:{' '}
            <em style={{ fontStyle: 'italic', color: T.amber }}>asesorar de verdad</em>, no solo vender una lámpara.
          </p>
          <p style={{ fontSize: 15.5, lineHeight: 1.7, color: '#A99E8B', margin: '28px 0 0', maxWidth: 520 }}>
            Tres generaciones de la misma familia atendieron este mostrador. Conocemos cada proyecto por su nombre y elegimos los productos que pondríamos en nuestra propia casa.
          </p>
          <div style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: 12, color: '#8C8270', marginTop: 38, borderTop: '1px solid #2E2417', paddingTop: 18 }}>
            Familia Fénix — tres generaciones en City Bell
          </div>
        </div>
      </div>
      <style>{`.fnx-historia-grid { grid-template-columns: 1fr !important; } @media (min-width: 860px) { .fnx-historia-grid { grid-template-columns: 0.86fr 1.14fr !important; } }`}</style>
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
            <span style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: 12, color: T.muted }}>El local</span>
            <span style={{ width: 34, height: 1, background: T.hairlineStrong }} />
          </div>
          <h2 style={{
            fontFamily: "'Playfair Display', serif", fontWeight: 500,
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
                <span style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: 11, color: T.muted2, minWidth: 88, paddingTop: 3 }}>
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
          <figcaption style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: 10.5, color: T.muted2, marginTop: 11 }}>
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
        fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
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
        fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
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
