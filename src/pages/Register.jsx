import { useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Field, DarkInput, PrimaryBtn } from '../components/AuthFormKit'
import PageSEO from '../components/SEO'

function validate({ firstName, lastName, email, password }) {
  const e = {}
  if (!firstName.trim()) e.firstName = 'El nombre es requerido'
  if (!lastName.trim())  e.lastName  = 'El apellido es requerido'
  if (!email.trim())     e.email     = 'El email es requerido'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Formato de email inválido'
  if (!password)                    e.password = 'La contraseña es requerida'
  else if (password.length < 6)     e.password = 'Mínimo 6 caracteres'
  return e
}

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from || '/account'

  const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '', password: '' })
  const [errors, setErrors]     = useState({})
  const [submitError, setSubmitError] = useState(null)
  const [loading, setLoading]   = useState(false)

  function setField(key, value) {
    setFormData((prev) => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors((prev) => { const e = { ...prev }; delete e[key]; return e })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const v = validate(formData)
    if (Object.keys(v).length) { setErrors(v); return }

    setSubmitError(null)
    setLoading(true)
    try {
      await register(formData)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <PageSEO title="Crear cuenta" description="Creá tu cuenta en Fénix Iluminación para guardar favoritos y ver tus pedidos." url="/register" />
      <div style={{ backgroundColor: 'var(--color-bg)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '26rem', margin: '0 auto', padding: '4rem 1.5rem 6rem' }}>
          <h1
            style={{
              fontFamily: 'var(--font-serif)', color: 'var(--color-text)',
              fontSize: '2rem', fontWeight: 400, letterSpacing: '-0.01em',
              textAlign: 'center', marginBottom: '2rem',
            }}
          >
            Creá tu cuenta
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Field label="Nombre" error={errors.firstName}>
                  <DarkInput placeholder="Juan" value={formData.firstName} onChange={(v) => setField('firstName', v)} hasError={!!errors.firstName} />
                </Field>
                <Field label="Apellido" error={errors.lastName}>
                  <DarkInput placeholder="Pérez" value={formData.lastName} onChange={(v) => setField('lastName', v)} hasError={!!errors.lastName} />
                </Field>
              </div>
              <Field label="Email" error={errors.email}>
                <DarkInput type="email" placeholder="juan@email.com" value={formData.email} onChange={(v) => setField('email', v)} hasError={!!errors.email} />
              </Field>
              <Field label="Contraseña" error={errors.password}>
                <DarkInput type="password" placeholder="Mínimo 6 caracteres" value={formData.password} onChange={(v) => setField('password', v)} hasError={!!errors.password} />
              </Field>

              {submitError && (
                <p style={{ fontSize: '0.8rem', color: 'var(--color-primary)', margin: 0 }}>
                  {submitError}
                </p>
              )}

              <PrimaryBtn type="submit" disabled={loading}>
                {loading ? 'Creando cuenta…' : 'Crear cuenta'}
              </PrimaryBtn>
            </form>
          </div>

          <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '1.5rem' }}>
            ¿Ya tenés cuenta?{' '}
            <Link to="/login" state={{ from: redirectTo }} style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>
              Iniciá sesión
            </Link>
          </p>
        </div>
      </div>
    </>
  )
}
