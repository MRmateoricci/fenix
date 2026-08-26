import { Link } from 'react-router-dom'
import FenixLogo from '../assets/FenixLogo'

function scrollTo(id) {
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth' })
}

const LINK = { textDecoration: 'none', color: '#A89C88', fontSize: '14px', transition: 'color .15s' }
const enter = (e) => (e.currentTarget.style.color = '#F2EBDC')
const leave = (e) => (e.currentTarget.style.color = '#A89C88')

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer style={{ background: '#1C1208', color: '#A89C88' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '56px 40px 30px' }}>

        {/* ── Top row ──────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', gap: 40,
          flexWrap: 'wrap', paddingBottom: 36,
          borderBottom: '1px solid #2E2417',
        }}>
          {/* Brand */}
          <div style={{ maxWidth: 310 }}>
            <div style={{ marginBottom: 16 }}>
              <FenixLogo />
            </div>
            <p style={{
              fontFamily: 'var(--font-sans)', fontStyle: 'italic',
              fontWeight: 400, fontSize: 15, lineHeight: 1.55, color: '#8C8270', margin: 0,
            }}>
              Iluminando los hogares de City Bell desde 1977.
            </p>
          </div>

          {/* Link columns */}
          <div style={{ display: 'flex', gap: 58, flexWrap: 'wrap' }}>
            {/* Tienda */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <span style={{
                fontFamily: "var(--font-sans)",
                fontSize: 10.5, color: '#6B6151', marginBottom: 3,
              }}>
                tienda
              </span>
              <Link to="/products" style={LINK} onMouseEnter={enter} onMouseLeave={leave}>Catálogo</Link>
              <Link to="/entrega-inmediata" style={LINK} onMouseEnter={enter} onMouseLeave={leave}>Entrega inmediata</Link>
              <a
                href="#destacados"
                style={LINK}
                onMouseEnter={enter}
                onMouseLeave={leave}
                onClick={(e) => { e.preventDefault(); scrollTo('destacados') }}
              >
                Destacados
              </a>
              <Link to="/products?category=Iluminación" style={LINK} onMouseEnter={enter} onMouseLeave={leave}>Iluminación</Link>
              <Link to="/products?category=Electricidad" style={LINK} onMouseEnter={enter} onMouseLeave={leave}>Materiales eléctricos</Link>
              <Link to="/products?category=Herramientas" style={LINK} onMouseEnter={enter} onMouseLeave={leave}>Herramientas</Link>
            </div>

            {/* Información */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <span style={{
                fontFamily: "var(--font-sans)",
                fontSize: 10.5, color: '#6B6151', marginBottom: 3,
              }}>
                información
              </span>
              <Link to="/nosotros" style={LINK} onMouseEnter={enter} onMouseLeave={leave}>Nuestra historia</Link>
              <Link to="/guias" style={LINK} onMouseEnter={enter} onMouseLeave={leave}>Guías de iluminación</Link>
              <Link to="/faq" style={LINK} onMouseEnter={enter} onMouseLeave={leave}>Preguntas frecuentes</Link>
              <Link to="/profesionales" style={LINK} onMouseEnter={enter} onMouseLeave={leave}>Profesionales B2B</Link>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, color: '#6B6151', marginBottom: 3 }}>legal</span>
              <Link to="/policies/refunds" style={LINK} onMouseEnter={enter} onMouseLeave={leave}>Política de reembolso</Link>
              <Link to="/policies/shipping" style={LINK} onMouseEnter={enter} onMouseLeave={leave}>Envíos</Link>
              <Link to="/policies/privacy" style={LINK} onMouseEnter={enter} onMouseLeave={leave}>Privacidad</Link>
              <Link to="/policies/terms" style={LINK} onMouseEnter={enter} onMouseLeave={leave}>Términos del servicio</Link>
            </div>

          {/* Contacto */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <span style={{
                fontFamily: "var(--font-sans)",
                fontSize: 10.5, color: '#6B6151', marginBottom: 3,
              }}>
                contacto
              </span>
              <a
                href="#contacto"
                style={LINK}
                onMouseEnter={enter}
                onMouseLeave={leave}
                onClick={(e) => { e.preventDefault(); scrollTo('contacto') }}
              >
                City Bell, La Plata
              </a>
              <a href="tel:+542216007560" style={LINK} onMouseEnter={enter} onMouseLeave={leave}>221-600-7560</a>
              <a
                href="https://wa.me/5492216007560?text=Hola!%20Quiero%20consultar%20sobre%20sus%20productos"
                target="_blank" rel="noopener noreferrer"
                style={LINK} onMouseEnter={enter} onMouseLeave={leave}
              >
                WhatsApp
              </a>
              <a
                href="https://instagram.com/fenixcitybell"
                target="_blank" rel="noopener noreferrer"
                style={LINK} onMouseEnter={enter} onMouseLeave={leave}
              >
                Instagram
              </a>
            </div>
          </div>
        </div>

        {/* ── Bottom row ───────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', gap: 16,
          flexWrap: 'wrap', paddingTop: 22,
          fontFamily: "var(--font-sans)", fontSize: 11, color: '#6B6151',
        }}>
          <span>© 1977–{year} Fénix Electricidad e Iluminación</span>
          <span>City Bell · La Plata · Buenos Aires</span>
        </div>
      </div>
    </footer>
  )
}
