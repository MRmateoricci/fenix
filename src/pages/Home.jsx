import { useRef, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { products } from '../data/products'
import ProductCard from '../components/ProductCard'

// ─── Fade-in hook ──────────────────────────────────────────────────────────────
function useFadeIn(threshold = 0.1) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (el.getBoundingClientRect().top < window.innerHeight) {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      { threshold, rootMargin: '0px 0px 80px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [ref, visible]
}

const fadeStyle = (visible, delayMs = 0) => ({
  opacity: visible ? 1 : 0,
  transform: visible ? 'translateY(0)' : 'translateY(28px)',
  transition: `opacity 0.7s ease ${delayMs}ms, transform 0.7s ease ${delayMs}ms`,
})

// ─── Category cards data ───────────────────────────────────────────────────────
const CATEGORIES = [
  {
    name: 'Iluminación Interior',
    description: 'Lámparas, plafones y apliques para ambientes',
    Icon: IconInterior,
  },
  {
    name: 'Iluminación Exterior',
    description: 'Farolas, reflectores y colgantes de jardín',
    Icon: IconExterior,
  },
  {
    name: 'Tiras LED',
    description: 'RGB, monocromáticas, RGBW y perfiles',
    Icon: IconLed,
  },
  {
    name: 'Electricidad',
    description: 'Tomacorrientes, disyuntores y cables',
    Icon: IconElec,
  },
]

// ─── Trust stats ───────────────────────────────────────────────────────────────
const STATS = [
  {
    Icon: IconYears,
    value: '45+',
    label: 'Años de experiencia',
  },
  {
    Icon: IconService,
    value: '∞',
    label: 'Atención personalizada',
  },
  {
    Icon: IconQuality,
    value: '100%',
    label: 'Productos de calidad',
  },
]

// ─── Steps ─────────────────────────────────────────────────────────────────────
const STEPS = [
  {
    num: '01',
    Icon: IconGrid,
    title: 'Elegí tu producto',
    desc: 'Explorá nuestro catálogo completo de iluminación y electricidad. Filtrá por categoría y encontrá lo que necesitás.',
  },
  {
    num: '02',
    Icon: IconCartStep,
    title: 'Agregalo al carrito',
    desc: 'Sumá los artículos que necesitás, ajustá cantidades y revisá tu pedido antes de confirmar.',
  },
  {
    num: '03',
    Icon: IconStore,
    title: 'Retirá en local o coordiná envío',
    desc: 'Pasá a buscar tu pedido en 473 entre 14C y 15, City Bell, o coordinamos la entrega con vos.',
  },
]

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function Home() {
  return (
    <>
      <HeroSection />
      <CategoriesSection />
      <FeaturedSection />
      <TrustBanner />
      <HowToBuySection />
    </>
  )
}

// ─── 1. Hero ───────────────────────────────────────────────────────────────────
function HeroSection() {
  return (
    <section className="relative min-h-[92vh] flex items-center justify-center overflow-hidden">
      {/* Background image */}
      <img
        src="https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=1920&h=1080&fit=crop&q=85"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Overlay */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(15,12,8,0.52)' }}
      />

      {/* Content — centered */}
      <div className="relative z-10 text-center px-4 sm:px-6 py-24 max-w-3xl mx-auto">
        <p
          className="text-[10px] uppercase tracking-[0.28em] mb-8 font-medium"
          style={{ color: 'rgba(255,255,255,0.55)' }}
        >
          City Bell · La Plata · Desde 1977
        </p>

        <h1
          className="text-5xl sm:text-6xl lg:text-7xl font-light leading-[1.08] mb-8"
          style={{ fontFamily: 'var(--font-serif)', color: '#fff', letterSpacing: '0.02em' }}
        >
          Iluminamos hogares
          <br />
          <em style={{ fontStyle: 'italic', fontWeight: 300 }}>desde 1977</em>
        </h1>

        <p
          className="text-base sm:text-lg leading-relaxed mb-12 max-w-md mx-auto"
          style={{ color: 'rgba(255,255,255,0.60)', fontWeight: 300, letterSpacing: '0.02em' }}
        >
          Electricidad e iluminación de calidad en City Bell. Atención personalizada para cada proyecto.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            to="/products"
            className="inline-flex items-center gap-3 px-10 py-4 text-sm font-medium tracking-[0.12em] uppercase transition-all duration-300"
            style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)', backdropFilter: 'blur(4px)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.22)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.7)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.12)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)'
            }}
          >
            Ver productos
          </Link>

          <a
            href="https://wa.me/5491122334455?text=Hola!%20Quiero%20consultar%20sobre%20sus%20productos"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 px-10 py-4 text-sm font-medium tracking-[0.12em] uppercase transition-all duration-300"
            style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
          >
            <WhatsAppBubble />
            WhatsApp
          </a>
        </div>
      </div>

      {/* Bottom fade */}
      <div
        className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
        style={{ background: 'linear-gradient(to top, var(--color-bg), transparent)' }}
      />
    </section>
  )
}

// ─── 2. Categories ─────────────────────────────────────────────────────────────
function CategoriesSection() {
  const navigate = useNavigate()
  const [ref, visible] = useFadeIn(0.1)

  return (
    <section
      ref={ref}
      className="py-20 sm:py-24"
      style={fadeStyle(visible)}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="mb-12">
          <p
            className="text-xs uppercase tracking-[0.18em] font-medium mb-3"
            style={{ color: 'var(--color-primary)' }}
          >
            Catálogo
          </p>
          <h2
            className="text-3xl sm:text-4xl font-bold"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-text)' }}
          >
            Nuestras categorías
          </h2>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {CATEGORIES.map((cat, i) => (
            <button
              key={cat.name}
              onClick={() =>
                navigate(`/products?category=${encodeURIComponent(cat.name)}`)
              }
              className="group text-left p-6 sm:p-8 rounded-lg transition-all duration-300 outline-none focus-visible:ring-2"
              style={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                transitionDelay: `${i * 60}ms`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-primary)'
                e.currentTarget.style.backgroundColor = 'var(--color-surface-2)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)'
                e.currentTarget.style.backgroundColor = 'var(--color-surface)'
              }}
            >
              <cat.Icon
                className="mb-5 transition-transform duration-300 group-hover:scale-110"
                style={{ color: 'var(--color-primary)', width: '38px', height: '38px' }}
              />
              <h3
                className="text-sm sm:text-base font-semibold mb-1.5 leading-snug"
                style={{ color: 'var(--color-text)' }}
              >
                {cat.name}
              </h3>
              <p
                className="text-xs sm:text-sm leading-snug mb-5"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {cat.description}
              </p>
              <span
                className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-medium transition-colors duration-200"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Ver más
                <ArrowRightIcon size={11} />
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── 3. Featured Products ──────────────────────────────────────────────────────
function FeaturedSection() {
  const [ref, visible] = useFadeIn(0.08)
  const featured = products.slice(0, 4)

  return (
    <section
      ref={ref}
      className="py-20 sm:py-24"
      style={{ ...fadeStyle(visible), backgroundColor: 'var(--color-surface)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12">
          <div>
            <p
              className="text-xs uppercase tracking-[0.18em] font-medium mb-3"
              style={{ color: 'var(--color-primary)' }}
            >
              Selección
            </p>
            <h2
              className="text-3xl sm:text-4xl font-bold"
              style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-text)' }}
            >
              Productos destacados
            </h2>
          </div>
          <Link
            to="/products"
            className="inline-flex items-center gap-2 text-sm font-medium tracking-wide transition-colors shrink-0"
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
          >
            Ver todos los productos
            <ArrowRightIcon size={14} />
          </Link>
        </div>

        {/* Products grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {featured.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <Link
            to="/products"
            className="inline-flex items-center gap-2.5 px-8 py-4 text-sm font-medium tracking-wide rounded transition-colors"
            style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = 'var(--color-primary)')
            }
          >
            Ver todos los productos
            <ArrowRightIcon size={15} />
          </Link>
        </div>
      </div>
    </section>
  )
}

// ─── 4. Trust Banner ───────────────────────────────────────────────────────────
function TrustBanner() {
  const [ref, visible] = useFadeIn(0.15)

  return (
    <section
      ref={ref}
      className="py-20 sm:py-24"
      style={{ ...fadeStyle(visible), backgroundColor: 'var(--color-primary)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <h2
          className="text-center text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-16 max-w-2xl mx-auto leading-tight"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          Más de 45 años iluminando hogares en City Bell
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 sm:gap-8">
          {STATS.map((stat, i) => (
            <div
              key={stat.label}
              className="flex flex-col items-center text-center gap-4"
              style={fadeStyle(visible, i * 100)}
            >
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
              >
                <stat.Icon
                  style={{ color: '#fff', width: '28px', height: '28px' }}
                />
              </div>
              <div>
                <p className="text-4xl font-bold text-white mb-1">{stat.value}</p>
                <p className="text-sm text-white" style={{ opacity: 0.8 }}>
                  {stat.label}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── 5. How to Buy ─────────────────────────────────────────────────────────────
function HowToBuySection() {
  const [ref, visible] = useFadeIn(0.1)

  return (
    <section
      ref={ref}
      className="py-20 sm:py-28"
      style={fadeStyle(visible)}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <p
            className="text-xs uppercase tracking-[0.18em] font-medium mb-3"
            style={{ color: 'var(--color-primary)' }}
          >
            Simple y rápido
          </p>
          <h2
            className="text-3xl sm:text-4xl font-bold"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-text)' }}
          >
            ¿Cómo comprarnos?
          </h2>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12 relative">
          {/* Connector line — desktop only */}
          <div
            className="hidden md:block absolute h-px top-[1.75rem]"
            style={{
              left: 'calc(100% / 6)',
              right: 'calc(100% / 6)',
              backgroundColor: 'var(--color-border)',
            }}
          />

          {STEPS.map((step, i) => (
            <div
              key={step.num}
              className="flex flex-col items-center md:items-start text-center md:text-left"
              style={fadeStyle(visible, i * 120)}
            >
              {/* Number badge */}
              <div className="flex items-center gap-4 mb-6 md:w-full">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-base relative z-10 shrink-0"
                  style={{ backgroundColor: 'var(--color-primary)', fontFamily: 'var(--font-serif)' }}
                >
                  {step.num}
                </div>
              </div>

              {/* Icon */}
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center mb-5"
                style={{ backgroundColor: 'var(--color-surface-2)' }}
              >
                <step.Icon
                  style={{ color: 'var(--color-primary)', width: '24px', height: '24px' }}
                />
              </div>

              {/* Text */}
              <h3
                className="text-base font-semibold mb-2"
                style={{ color: 'var(--color-text)' }}
              >
                {step.title}
              </h3>
              <p
                className="text-sm leading-relaxed"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {step.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div
          className="mt-16 p-8 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-6"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}
        >
          <div>
            <p
              className="font-semibold text-lg mb-1"
              style={{ color: 'var(--color-text)' }}
            >
              ¿Tenés dudas antes de comprar?
            </p>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Nuestro equipo te asesora sin compromiso.
            </p>
          </div>
          <a
            href="https://wa.me/5491122334455?text=Hola!%20Quiero%20consultar%20sobre%20sus%20productos"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 px-6 py-3 text-sm font-medium rounded transition-colors shrink-0"
            style={{ backgroundColor: '#25D366', color: '#fff' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1ebe5d')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#25D366')}
          >
            <WhatsAppBubble />
            Escribinos por WhatsApp
          </a>
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY ICONS
// ═══════════════════════════════════════════════════════════════════════════════

function IconInterior({ className, style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Cord */}
      <line x1="12" y1="2" x2="12" y2="5" />
      {/* Shade — trapezoid */}
      <path d="M7 5h10l-2 9H9L7 5z" />
      {/* Stem */}
      <line x1="12" y1="14" x2="12" y2="17" />
      {/* Base bar */}
      <path d="M9.5 17h5" />
    </svg>
  )
}

function IconExterior({ className, style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Reflector housing */}
      <path d="M6 8h12l-1.5 7H7.5L6 8z" />
      {/* Top bracket */}
      <path d="M9 8V5a3 3 0 016 0v3" />
      {/* Light rays */}
      <line x1="12" y1="15" x2="12" y2="19" />
      <line x1="8" y1="17" x2="6" y2="20" />
      <line x1="16" y1="17" x2="18" y2="20" />
    </svg>
  )
}

function IconLed({ className, style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Strip body */}
      <rect x="2" y="8" width="20" height="8" rx="4" />
      {/* LED dots */}
      <circle cx="7.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IconElec({ className, style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRUST BANNER ICONS
// ═══════════════════════════════════════════════════════════════════════════════

function IconYears({ style }) {
  return (
    <svg style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 3.5" />
    </svg>
  )
}

function IconService({ style }) {
  return (
    <svg style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  )
}

function IconQuality({ style }) {
  return (
    <svg style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOW TO BUY ICONS
// ═══════════════════════════════════════════════════════════════════════════════

function IconGrid({ style }) {
  return (
    <svg style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function IconCartStep({ style }) {
  return (
    <svg style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 01-8 0" />
    </svg>
  )
}

function IconStore({ style }) {
  return (
    <svg style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY ICONS
// ═══════════════════════════════════════════════════════════════════════════════

function ArrowRightIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}

function WhatsAppBubble() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M11.99 2C6.477 2 2 6.477 2 11.99c0 1.77.463 3.435 1.275 4.884L2 22l5.274-1.256A9.934 9.934 0 0011.99 21.98C17.503 21.98 22 17.503 22 11.99 22 6.477 17.503 2 11.99 2zm0 18.18a8.183 8.183 0 01-4.17-1.142l-.299-.177-3.097.738.768-3.015-.196-.31A8.194 8.194 0 013.79 11.99c0-4.524 3.683-8.207 8.2-8.207 4.524 0 8.207 3.683 8.207 8.207s-3.683 8.19-8.207 8.19z" />
    </svg>
  )
}
