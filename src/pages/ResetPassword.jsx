import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PageSEO from '../components/SEO'

const API_BASE = import.meta.env.VITE_API_URL || ''

export default function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { refreshUser } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const token = params.get('token') || ''

  async function submit(event) {
    event.preventDefault()
    if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres')
    if (password !== confirmation) return setError('Las contraseñas no coinciden')
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'No pudimos cambiar la contraseña')
      await refreshUser()
      navigate('/account', { replace: true })
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <>
      <PageSEO title="Nueva contraseña" description="Elegí una nueva contraseña para tu cuenta." url="/reset-password" />
      <main className="fnx-auth-simple-page">
        <section>
          <h1>Nueva contraseña</h1>
          {!token ? (
            <div className="fnx-auth-success"><p>El enlace no es válido.</p></div>
          ) : (
            <form onSubmit={submit}>
              <input type="password" placeholder="Nueva contraseña" value={password} onChange={(event) => setPassword(event.target.value)} required />
              <input type="password" placeholder="Repetir contraseña" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
              {error && <small className="error">{error}</small>}
              <button type="submit" disabled={loading}>{loading ? 'Guardando…' : 'Guardar contraseña'}</button>
            </form>
          )}
          <Link to="/login">← Volver a ingresar</Link>
        </section>
      </main>
    </>
  )
}
