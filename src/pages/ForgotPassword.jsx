import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import PageSEO from '../components/SEO'

const API_BASE = import.meta.env.VITE_API_URL || ''

export default function ForgotPassword() {
  const location = useLocation()
  const [email, setEmail] = useState(location.state?.email || '')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setStatus('loading')
    setError('')
    try {
      const response = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'No pudimos procesar la solicitud')
      setStatus('success')
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  return (
    <>
      <PageSEO title="Recuperar contraseña" description="Recuperá el acceso a tu cuenta de Fénix Iluminación." url="/forgot-password" />
      <main className="fnx-auth-simple-page">
        <section>
          <h1>Recuperar contraseña</h1>
          {status === 'success' ? (
            <div className="fnx-auth-success">
              <strong>Revisá tu correo</strong>
              <p>Si existe una cuenta con ese email, recibirás un enlace válido durante una hora.</p>
            </div>
          ) : (
            <form onSubmit={submit}>
              <p>Ingresá el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva.</p>
              <input type="email" placeholder="Correo electrónico" value={email} onChange={(event) => setEmail(event.target.value)} required />
              {error && <small className="error">{error}</small>}
              <button type="submit" disabled={status === 'loading'}>{status === 'loading' ? 'Enviando…' : 'Enviar enlace'}</button>
            </form>
          )}
          <Link to="/login" state={{ from: location.state?.from || '/account', email }}>← Volver a ingresar</Link>
        </section>
      </main>
    </>
  )
}
