import { Link } from 'react-router-dom'
import PageSEO from '../components/SEO'

const T = {
  dark:   '#14100A',
  cream:  '#F2EBDC',
  paper:  '#F7F4EF',
  ink:    '#16110B',
  muted:  '#A99E8B',
  muted2: '#8C8270',
  border: '#2E2417',
  accent: '#9A8B6E',
  red:    '#CC0000',
  surface2: '#EDE9E2',
  hairline: '#DED6C7',
}

const BENEFICIOS = [
  {
    icon: TagIcon,
    title: 'Precios diferenciados',
    text: 'Esquema de descuentos por volumen para proyectos, obras y recompras frecuentes. Consultá según tu caso.',
  },
  {
    icon: ChatIcon,
    title: 'Asesoramiento técnico',
    text: 'Calculamos contigo la potencia, distribución y temperatura de color para cada ambiente. Soporte durante y después de la obra.',
  },
  {
    icon: DocIcon,
    title: 'Facturación y documentación',
    text: 'Emitimos factura A y B. Podemos cotizar con especificaciones técnicas para presentar a clientes o arquitectos.',
  },
  {
    icon: BoxIcon,
    title: 'Stock y entregas coordinadas',
    text: 'Reserva de stock para tus proyectos, entrega por etapas según avance de obra. Sin urgencias de última hora.',
  },
]

const PERFILES = [
  'Electricistas matriculados',
  'Arquitectos y diseñadores de interiores',
  'Constructoras e inmobiliarias',
  'Decoradores de viviendas y comercios',
  'Hoteles, restoranes y locales comerciales',
  'Administraciones de consorcios',
]

export default function Profesionales() {
  return (
    <>
      <PageSEO
        title="Profesionales y B2B — Iluminación para obras y proyectos"
        description="Precios diferenciados, asesoramiento técnico y facturación para electricistas, arquitectos y constructoras en City Bell, La Plata. Desde 1977."
        url="/profesionales"
      />

      {/* ── Hero oscuro ─────────────────────────────────────────────────────── */}
      <section style={{ background: T.dark, color: T.cream, overflow: 'hidden', position: 'relative', padding: '100px 40px' }}>
        <div aria-hidden="true" style={{ position: 'absolute', top: '10%', right: '5%', width: 420, height: 420, background: 'radial-gradient(circle, rgba(204,0,0,0.12) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 760, position: 'relative' }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: T.accent, display: 'block', marginBottom: 20 }}>
            Para profesionales
          </span>
          <h1 style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'clamp(44px, 5.5vw, 80px)', fontWeight: 400,
            lineHeight: 1.0, letterSpacing: '-.015em',
            color: T.cream, margin: '0 0 28px',
          }}>
            Para los que construyen con luz
          </h1>
          <p style={{
            fontFamily: 'var(--font-sans)', fontSize: 18,
            lineHeight: 1.72, color: T.muted, margin: '0 0 40px', maxWidth: 560,
          }}>
            Trabajamos con electricistas, arquitectos y constructoras desde hace más de cuatro décadas. Sabemos lo que necesita una obra: stock, precio, asesoramiento y documentación.
          </p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <a
              href="https://wa.me/5492214801977?text=Hola!%20Soy%20profesional%20y%20quisiera%20consultar%20sobre%20precios%20y%20condiciones"
              target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 9,
                padding: '14px 32px', borderRadius: 2,
                background: '#1f7a3d', color: '#fff',
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 14, fontWeight: 500, textDecoration: 'none',
                transition: 'background .15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#176832')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#1f7a3d')}
            >
              <WaIcon /> Consultanos por WhatsApp
            </a>
            <Link
              to="/products"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '14px 32px', borderRadius: 2,
                background: 'transparent', color: T.cream,
                border: `1px solid rgba(242,235,220,0.3)`,
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 14, fontWeight: 500, textDecoration: 'none',
                transition: 'border-color .15s, background .15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(242,235,220,0.7)'
                e.currentTarget.style.background = 'rgba(242,235,220,0.05)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(242,235,220,0.3)'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              Ver catálogo
            </Link>
          </div>
        </div>
      </section>

      {/* ── Beneficios ──────────────────────────────────────────────────────── */}
      <section style={{ background: T.paper }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '80px 40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: '#9A917F' }}>Qué ofrecemos</span>
            <span style={{ flex: 1, height: 1, background: T.hairline }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 28 }}>
            {BENEFICIOS.map((b) => (
              <div key={b.title} style={{ background: T.paper, padding: '32px 28px', border: `1px solid ${T.hairline}`, borderRadius: 3 }}>
                <div style={{ width: 40, height: 40, background: T.surface2, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                  <b.icon />
                </div>
                <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 20, fontWeight: 600, color: T.ink, margin: '0 0 10px' }}>
                  {b.title}
                </h2>
                <p style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14, lineHeight: 1.7, color: '#6B6051', margin: 0 }}>
                  {b.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── A quiénes va dirigido ────────────────────────────────────────────── */}
      <section style={{ background: T.surface2 }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '72px 40px' }}>
          <div style={{ display: 'flex', gap: 64, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 300px' }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: '#9A917F', display: 'block', marginBottom: 16 }}>
                Para quién
              </span>
              <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 400, color: T.ink, margin: '0 0 16px' }}>
                Trabajamos con profesionales del sector
              </h2>
              <p style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14.5, lineHeight: 1.72, color: '#6B6051', margin: 0, maxWidth: 420 }}>
                Si sos parte del sector de la construcción, el diseño o la instalación eléctrica, tenemos un esquema de atención pensado para vos.
              </p>
            </div>
            <div style={{ flex: '1 1 280px' }}>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {PERFILES.map(p => (
                  <li key={p} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize: 14.5, color: T.ink,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA final ───────────────────────────────────────────────────────── */}
      <section style={{ background: T.dark, padding: '80px 40px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'clamp(28px, 3.5vw, 48px)', fontWeight: 400, color: T.cream, margin: '0 0 16px' }}>
          ¿Tenés un proyecto en mente?
        </h2>
        <p style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14, color: T.muted, margin: '0 0 32px' }}>
          Escribinos con los detalles y te respondemos con presupuesto y disponibilidad.
        </p>
        <a
          href="https://wa.me/5492214801977?text=Hola!%20Tengo%20un%20proyecto%20y%20quisiera%20cotizar"
          target="_blank" rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 9,
            padding: '15px 36px', borderRadius: 2,
            background: '#1f7a3d', color: '#fff',
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 14, fontWeight: 500, textDecoration: 'none',
            transition: 'background .15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#176832')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#1f7a3d')}
        >
          <WaIcon /> Hablar con el equipo
        </a>
      </section>
    </>
  )
}

function WaIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M11.99 2C6.477 2 2 6.477 2 11.99c0 1.77.463 3.435 1.275 4.884L2 22l5.274-1.256A9.934 9.934 0 0011.99 21.98C17.503 21.98 22 17.503 22 11.99 22 6.477 17.503 2 11.99 2zm0 18.18a8.183 8.183 0 01-4.17-1.142l-.299-.177-3.097.738.768-3.015-.196-.31A8.194 8.194 0 013.79 11.99c0-4.524 3.683-8.207 8.2-8.207 4.524 0 8.207 3.683 8.207 8.207s-3.683 8.19-8.207 8.19z" />
    </svg>
  )
}

function TagIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B6051" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B6051" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  )
}

function DocIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B6051" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

function BoxIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B6051" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  )
}
