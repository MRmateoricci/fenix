import { useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PageSEO from '../components/SEO'

function validate({ firstName, lastName, dni, email, password, confirmPassword }) {
  const e = {}
  if (!firstName.trim()) e.firstName = 'El nombre es requerido'
  if (!lastName.trim())  e.lastName  = 'El apellido es requerido'
  if (dni && !/^\d{7,8}$/.test(dni)) e.dni = 'El DNI debe tener 7 u 8 dígitos'
  if (!email.trim())     e.email     = 'El email es requerido'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Formato de email inválido'
  if (!password)                    e.password = 'La contraseña es requerida'
  else if (password.length < 6)     e.password = 'Mínimo 6 caracteres'
  if (!confirmPassword)             e.confirmPassword = 'Confirmá tu contraseña'
  else if (confirmPassword !== password) e.confirmPassword = 'Las contraseñas no coinciden'
  return e
}

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from || '/account'

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dni: '',
    subscribeNewsletter: false,
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [errors, setErrors]     = useState({})
  const [submitError, setSubmitError] = useState(null)
  const [loading, setLoading]   = useState(false)
  const [showPassword, setShowPassword] = useState(false)

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
      <main className="fnx-register-page">
        <section className="fnx-register-card">
          <h1>Crear nueva cuenta de cliente</h1>

          <form onSubmit={handleSubmit} noValidate>
            <fieldset className="fnx-register-section">
              <legend>Información personal</legend>

              <RegisterField
                id="register-first-name"
                label="Nombre"
                value={formData.firstName}
                error={errors.firstName}
                autoComplete="given-name"
                onChange={(value) => setField('firstName', value)}
              />
              <RegisterField
                id="register-last-name"
                label="Apellido"
                value={formData.lastName}
                error={errors.lastName}
                autoComplete="family-name"
                onChange={(value) => setField('lastName', value)}
              />

              <label className="fnx-register-newsletter">
                <input
                  type="checkbox"
                  checked={formData.subscribeNewsletter}
                  onChange={(event) => setField('subscribeNewsletter', event.target.checked)}
                />
                <span>Quiero recibir novedades y promociones por correo electrónico</span>
              </label>

              <RegisterField
                id="register-dni"
                label="DNI"
                value={formData.dni}
                error={errors.dni}
                inputMode="numeric"
                maxLength={8}
                required={false}
                hint="Opcional. Ingresalo sin puntos."
                onChange={(value) => setField('dni', value.replace(/\D/g, '').slice(0, 8))}
              />
            </fieldset>

            <fieldset className="fnx-register-section fnx-register-access">
              <legend>Información de inicio de sesión</legend>

              <RegisterField
                id="register-email"
                type="email"
                label="Correo electrónico"
                value={formData.email}
                error={errors.email}
                autoComplete="email"
                onChange={(value) => setField('email', value)}
              />
              <RegisterField
                id="register-password"
                type={showPassword ? 'text' : 'password'}
                label="Contraseña"
                value={formData.password}
                error={errors.password}
                autoComplete="new-password"
                hint="Usá al menos 6 caracteres."
                onChange={(value) => setField('password', value)}
              />
              <RegisterField
                id="register-confirm-password"
                type={showPassword ? 'text' : 'password'}
                label="Confirmar contraseña"
                value={formData.confirmPassword}
                error={errors.confirmPassword}
                autoComplete="new-password"
                onChange={(value) => setField('confirmPassword', value)}
              />

              <label className="fnx-register-show-password">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(event) => setShowPassword(event.target.checked)}
                />
                <span>Mostrar contraseña</span>
              </label>
            </fieldset>

            {submitError && <p className="fnx-register-submit-error" role="alert">{submitError}</p>}

            <small className="fnx-register-required">* Campos obligatorios</small>

            <div className="fnx-register-actions">
              <button type="submit" disabled={loading}>
                {loading ? 'Creando cuenta…' : 'Crear una cuenta'}
              </button>
              <p>
                ¿Ya tenés cuenta?{' '}
                <Link to="/login" state={{ from: redirectTo }}>Iniciá sesión</Link>
              </p>
            </div>
          </form>
        </section>
      </main>
    </>
  )
}

function RegisterField({
  id,
  label,
  type = 'text',
  value,
  error,
  autoComplete,
  inputMode,
  maxLength,
  hint,
  required = true,
  onChange,
}) {
  return (
    <div className={`fnx-register-field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>
        {label} {required && <span aria-hidden="true">*</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error
        ? <small id={`${id}-error`} className="error">{error}</small>
        : hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  )
}
