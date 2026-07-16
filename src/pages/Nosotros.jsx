import localImg from '../assets/Fenix local.jpg'
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
}

const FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'AboutPage',
  name: 'Historia de Fénix Iluminación — Desde 1977, City Bell',
  description: 'Tres generaciones de la familia Fénix iluminando hogares de City Bell y La Plata desde 1977.',
  url: 'https://fenixiluminacion.com.ar/nosotros',
  mainEntity: {
    '@type': 'LocalBusiness',
    name: 'Fénix Electricidad e Iluminación',
    foundingDate: '1977',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Calle Cantilo 745',
      addressLocality: 'City Bell',
      addressRegion: 'Buenos Aires',
      addressCountry: 'AR',
    },
  },
}

const GENERACIONES = [
  {
    year: '1977',
    title: 'Primera generación',
    text: 'Armando Fénix abre el local en City Bell con una idea simple: vender materiales eléctricos de calidad y dar el asesoramiento que otros no daban. El boca en boca hace el resto.',
  },
  {
    year: '1998',
    title: 'Segunda generación',
    text: 'Sus hijos incorporan la línea de iluminación decorativa y amplían el local. La propuesta crece hacia diseño, no solo electricidad de obra.',
  },
  {
    year: '2012',
    title: 'Tercera generación',
    text: 'La tercera generación suma tiras LED, domotización y el catálogo online. Mismo mostrador, mismo asesoramiento; nuevas tecnologías.',
  },
]

const VALORES = [
  { label: 'Asesoramiento real', text: 'Cada proyecto es distinto. Antes de recomendar, preguntamos.' },
  { label: 'Selección curada', text: 'No tenemos todo — tenemos lo que pondríamos en nuestra propia casa.' },
  { label: 'Relación a largo plazo', text: 'Muchos clientes llevan décadas volviendo. Eso nos importa más que una venta.' },
]

export default function Nosotros() {
  return (
    <>
      <PageSEO
        title="Nuestra historia desde 1977 — City Bell, La Plata"
        description="Tres generaciones de la familia Fénix iluminando hogares de City Bell y La Plata desde 1977. Conocé quiénes somos."
        url="/nosotros"
        schema={FAQ_SCHEMA}
      />

      {/* ── Hero oscuro ─────────────────────────────────────────────────────── */}
      <section style={{ background: T.dark, color: T.cream, overflow: 'hidden', position: 'relative' }}>
        <div aria-hidden="true" style={{ position: 'absolute', top: '-10%', right: '-5%', width: 500, height: 500, background: 'radial-gradient(circle, rgba(224,162,74,0.13) 0%, transparent 65%)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '90px 40px', display: 'grid', gridTemplateColumns: '0.86fr 1.14fr', gap: 60, alignItems: 'center', position: 'relative' }}>
          <figure style={{ margin: 0 }}>
            <div style={{ aspectRatio: '3/4', borderRadius: 3, overflow: 'hidden', background: '#241B12', border: `1px solid ${T.border}` }}>
              <img
                src={localImg}
                alt="El local Fénix Electricidad e Iluminación, City Bell, La Plata"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.88 }}
              />
            </div>
          </figure>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: T.accent }}>City Bell · desde 1977</span>
              <span style={{ width: 34, height: 1, background: '#473A28' }} />
            </div>
            <h1 style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'clamp(38px, 4.5vw, 64px)', lineHeight: 1.05,
              fontWeight: 400, margin: '0 0 28px', color: T.cream, letterSpacing: '-.01em',
            }}>
              Cuarenta y ocho años iluminando City Bell
            </h1>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 16, lineHeight: 1.78, color: T.muted, margin: 0, maxWidth: 520 }}>
              Abrimos en 1977 con una idea simple, y todavía la sostenemos: asesorar de verdad, no solo vender una lámpara. Tres generaciones de la misma familia atendieron este mostrador.
            </p>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: T.muted2, marginTop: 38, borderTop: `1px solid ${T.border}`, paddingTop: 18 }}>
              Familia Fénix — tres generaciones en City Bell
            </div>
          </div>
        </div>

        <style>{`
          @media (max-width: 860px) {
            .fnx-nosotros-hero { grid-template-columns: 1fr !important; }
            .fnx-nosotros-hero figure { display: none; }
          }
        `}</style>
      </section>

      {/* ── Generaciones timeline ───────────────────────────────────────────── */}
      <section style={{ background: T.paper }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '90px 40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: '#9A917F' }}>Historia</span>
            <span style={{ flex: 1, height: 1, background: '#DED6C7' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 0 }}>
            {GENERACIONES.map((g, i) => (
              <div
                key={g.year}
                style={{
                  padding: '36px 40px',
                  borderLeft: i === 0 ? 'none' : '1px solid #DED6C7',
                  borderTop: '3px solid',
                  borderTopColor: i === 0 ? T.red : '#DED6C7',
                }}
              >
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 28, fontWeight: 400, color: T.red, display: 'block', marginBottom: 8 }}>
                  {g.year}
                </span>
                <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 22, fontWeight: 600, color: T.ink, margin: '0 0 14px' }}>
                  {g.title}
                </h2>
                <p style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14.5, lineHeight: 1.7, color: '#6B6051', margin: 0 }}>
                  {g.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Valores ─────────────────────────────────────────────────────────── */}
      <section style={{ background: '#EDE9E2' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '80px 40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: '#9A917F' }}>Lo que nos define</span>
            <span style={{ flex: 1, height: 1, background: '#C9BFAF' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 32 }}>
            {VALORES.map((v) => (
              <div key={v.label} style={{ background: '#F7F4EF', padding: '32px', borderRadius: 3, border: '1px solid #DED6C7' }}>
                <div style={{ width: 32, height: 3, background: T.red, marginBottom: 20 }} />
                <h3 style={{ fontFamily: 'var(--font-sans)', fontSize: 22, fontWeight: 600, color: T.ink, margin: '0 0 12px' }}>
                  {v.label}
                </h3>
                <p style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14.5, lineHeight: 1.7, color: '#6B6051', margin: 0 }}>
                  {v.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA final ───────────────────────────────────────────────────────── */}
      <section style={{ background: T.dark, textAlign: 'center', padding: '80px 40px' }}>
        <p style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: T.accent, marginBottom: 16 }}>
          Pasá a vernos
        </p>
        <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'clamp(30px, 4vw, 52px)', fontWeight: 400, color: T.cream, margin: '0 0 28px' }}>
          C. Cantilo 745, City Bell, La Plata
        </h2>
        <p style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14, color: T.muted, marginBottom: 32 }}>
          Lunes a sábado · 8:30–13:00 / 16:00–20:00
        </p>
        <a
          href="https://wa.me/5492214801977?text=Hola!%20Quisiera%20consultar%20sobre%20sus%20productos"
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
          <WaIcon /> Escribinos por WhatsApp
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
