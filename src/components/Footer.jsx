import { Link } from 'react-router-dom'
import FenixLogo from '../assets/FenixLogo'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer
      id="contacto"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <FenixLogo className="mb-5" />
            <p className="text-sm leading-relaxed max-w-[220px]" style={{ color: 'var(--color-text-muted)' }}>
              Iluminamos hogares desde 1977. Calidad y confianza en cada proyecto eléctrico.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h4
              className="text-[11px] font-semibold uppercase tracking-[0.15em] mb-5"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Navegación
            </h4>
            <ul className="space-y-3">
              {[
                { to: '/', label: 'Inicio' },
                { to: '/products', label: 'Productos' },
                { to: '/cart', label: 'Mi carrito' },
              ].map(({ to, label }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="text-sm transition-colors duration-200"
                    style={{ color: 'var(--color-text)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-primary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text)')}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4
              className="text-[11px] font-semibold uppercase tracking-[0.15em] mb-5"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Contacto
            </h4>
            <ul className="space-y-4">
              <li className="flex items-start gap-2.5">
                <MapPinIcon />
                <span className="text-sm leading-snug" style={{ color: 'var(--color-text)' }}>
                  473 entre 14C y 15
                  <br />
                  City Bell, La Plata
                </span>
              </li>
              <li>
                <a
                  href="https://instagram.com/fenixcitybell"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 text-sm transition-colors duration-200"
                  style={{ color: 'var(--color-text)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text)')}
                >
                  <InstagramIcon />
                  @fenixcitybell
                </a>
              </li>
              <li>
                <a
                  href="https://wa.me/5491122334455?text=Hola!%20Quiero%20consultar%20sobre%20sus%20productos"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 text-sm transition-colors duration-200"
                  style={{ color: 'var(--color-text)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text)')}
                >
                  <WhatsAppIconSmall />
                  WhatsApp
                </a>
              </li>
            </ul>
          </div>

          {/* Hours */}
          <div>
            <h4
              className="text-[11px] font-semibold uppercase tracking-[0.15em] mb-5"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Horarios
            </h4>
            <ul className="space-y-4">
              <li>
                <span
                  className="text-[11px] uppercase tracking-wider block mb-0.5"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Lunes a Viernes
                </span>
                <span className="text-sm" style={{ color: 'var(--color-text)' }}>
                  8:30 – 18:00 hs
                </span>
              </li>
              <li>
                <span
                  className="text-[11px] uppercase tracking-wider block mb-0.5"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Sábados
                </span>
                <span className="text-sm" style={{ color: 'var(--color-text)' }}>
                  8:30 – 13:00 hs
                </span>
              </li>
              <li>
                <span
                  className="text-[11px] uppercase tracking-wider block mb-0.5"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Domingos
                </span>
                <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  Cerrado
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            © {year} Fénix Electricidad e Iluminación. Todos los derechos reservados.
          </p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            City Bell, La Plata, Buenos Aires
          </p>
        </div>
      </div>
    </footer>
  )
}

function MapPinIcon() {
  return (
    <svg
      className="shrink-0 mt-0.5"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: 'var(--color-text-muted)' }}
    >
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg
      className="shrink-0"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}

function WhatsAppIconSmall() {
  return (
    <svg className="shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M11.99 2C6.477 2 2 6.477 2 11.99c0 1.77.463 3.435 1.275 4.884L2 22l5.274-1.256A9.934 9.934 0 0011.99 21.98C17.503 21.98 22 17.503 22 11.99 22 6.477 17.503 2 11.99 2zm0 18.18a8.183 8.183 0 01-4.17-1.142l-.299-.177-3.097.738.768-3.015-.196-.31A8.194 8.194 0 013.79 11.99c0-4.524 3.683-8.207 8.2-8.207 4.524 0 8.207 3.683 8.207 8.207s-3.683 8.19-8.207 8.19z" />
    </svg>
  )
}
