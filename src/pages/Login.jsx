import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Field, DarkInput, PrimaryBtn } from '../components/AuthFormKit'
import PageSEO from '../components/SEO'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from || '/'

  const [email, setEmail]       = useState(location.state?.email || '')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
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
      <div style={{ backgroundColor: 'var(--color-bg)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '26rem', margin: '0 auto', padding: '4rem 1.5rem 6rem' }}>
          <h1
            style={{
              fontFamily: 'var(--font-serif)', color: 'var(--color-text)',
              fontSize: '2rem', fontWeight: 400, letterSpacing: '-0.01em',
              textAlign: 'center', marginBottom: '2rem',
            }}
          >
            Iniciar sesión
          </h1>

          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '1rem',
              padding: '2rem 2.25rem',
              boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
            }}
          >
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <Field label="Email">
                <DarkInput type="email" placeholder="juan@email.com" value={email} onChange={setEmail} />
              </Field>
              <Field label="Contraseña">
                <DarkInput type="password" placeholder="••••••••" value={password} onChange={setPassword} />
              </Field>

              {error && (
                <p style={{ fontSize: '0.8rem', color: 'var(--color-primary)', margin: 0 }}>
                  {error}
                </p>
              )}

              <PrimaryBtn type="submit" disabled={loading || !email || !password}>
                {loading ? 'Ingresando…' : 'Ingresar'}
              </PrimaryBtn>
            </form>

            <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '1.25rem', textAlign: 'center' }}>
              ¿Te olvidaste la contraseña? Escribinos por WhatsApp y te ayudamos.
            </p>
          </div>

          <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '1.5rem' }}>
            ¿No tenés cuenta?{' '}
            <Link to="/register" style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>
              Creá una acá
            </Link>
          </p>
        </div>
      </div>
    </>
  )
}
