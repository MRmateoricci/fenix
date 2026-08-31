import { useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PageSEO from '../components/SEO'

const API_BASE = import.meta.env.VITE_API_URL || ''

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from || '/account'
  const queryError = new URLSearchParams(location.search).get('authError')

  const [email, setEmail] = useState(location.state?.email || '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(queryError)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <PageSEO title="Iniciar sesión" description="Ingresá a tu cuenta de Fénix Iluminación." url="/login" />
      <main className="fnx-login-page">
        <section className="fnx-login-card">
          <h1>Acceso del cliente</h1>

          <div className="fnx-login-columns">
            <div className="fnx-login-section">
              <h2>Clientes registrados</h2>
              <p className="fnx-login-intro">
                Si ya tenés una cuenta, iniciá sesión con tu correo electrónico.
              </p>

              <form onSubmit={handleSubmit}>
                <label htmlFor="login-email">
                  Correo electrónico <span aria-hidden="true">*</span>
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />

                <label htmlFor="login-password">
                  Contraseña <span aria-hidden="true">*</span>
                </label>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />

                <label className="fnx-login-show-password">
                  <input
                    type="checkbox"
                    checked={showPassword}
                    onChange={(event) => setShowPassword(event.target.checked)}
                  />
                  <span>Mostrar contraseña</span>
                </label>

                {error && <p className="fnx-login-error" role="alert">{error}</p>}

                <div className="fnx-login-actions">
                  <button className="fnx-login-submit" type="submit" disabled={loading}>
                    {loading ? 'Ingresando…' : 'Iniciar sesión'}
                  </button>
                  <Link to="/forgot-password" state={{ email, from: redirectTo }}>
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
              </form>

              <small className="fnx-login-required">* Campos obligatorios</small>
            </div>

            <div className="fnx-login-section fnx-login-new-customer">
              <h2>Nuevos clientes</h2>
              <p className="fnx-login-intro">
                ¿Primera vez? Registrate en pocos segundos para guardar tus favoritos,
                consultar tus pedidos y agilizar tus próximas compras.
              </p>
              <Link className="fnx-login-create" to="/register" state={{ from: redirectTo }}>
                Crear una cuenta
              </Link>
            </div>
          </div>
        </section>
      </main>
      <LoginInformation />
    </>
  )
}

function LoginInformation() {
  const [newsletterEmail, setNewsletterEmail] = useState('')
  const [newsletterState, setNewsletterState] = useState('idle')

  async function subscribe(event) {
    event.preventDefault()
    setNewsletterState('loading')
    try {
      const response = await fetch(`${API_BASE}/api/newsletter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newsletterEmail }),
      })
      if (!response.ok) throw new Error()
      setNewsletterState('success')
      setNewsletterEmail('')
    } catch {
      setNewsletterState('error')
    }
  }

  return (
    <section className="fnx-login-info">
      <div>
        <h2>Info</h2>
        <Link to="/nosotros">Sobre nosotros</Link>
        <Link to="/?section=contacto">Contacto</Link>
        <Link to="/account">Entrar a mi cuenta</Link>
      </div>
      <div>
        <h2>Ayuda e información</h2>
        <Link to="/faq">¿Cómo comprar?</Link>
        <Link to="/policies/refunds">Cambios y devoluciones</Link>
        <Link to="/policies/shipping">Tiempos y métodos de envío</Link>
        <Link to="/policies/refunds">Botón de arrepentimiento</Link>
      </div>
      <div className="fnx-login-security">
        <h2>Seguridad</h2>
        <span aria-hidden="true">✓</span>
        <p>Compra segura</p>
        <small>Pagos protegidos por Mercado Pago</small>
      </div>
      <div className="fnx-login-newsletter">
        <h2>Newsletter</h2>
        <p>Mantenete informado sobre nuestros lanzamientos y promociones.</p>
        <form onSubmit={subscribe}>
          <input type="email" placeholder="tu-email@ejemplo.com" value={newsletterEmail} onChange={(event) => setNewsletterEmail(event.target.value)} required />
          <button type="submit" disabled={newsletterState === 'loading'} aria-label="Suscribirme">→</button>
        </form>
        {newsletterState === 'success' && <small>¡Gracias! Ya estás suscripto.</small>}
        {newsletterState === 'error' && <small className="error">No pudimos suscribirte. Intentá nuevamente.</small>}
      </div>
    </section>
  )
}
