import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdmin } from '../../context/AdminContext'
import FenixLogo from '../../assets/FenixLogo'

export default function AdminLogin() {
  const { isAdmin, adminAuthLoading, login } = useAdmin()
  const navigate = useNavigate()
  const [pwd, setPwd]         = useState('')
  const [error, setError]     = useState(false)
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (isAdmin) navigate('/admin', { replace: true })
  }, [isAdmin, navigate])

  if (adminAuthLoading) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!pwd) return
    setLoading(true)
    try {
      const ok = await login(pwd)
      if (ok) {
        navigate('/admin', { replace: true })
      } else {
        setError(true)
        setPwd('')
        setLoading(false)
      }
    } catch {
      setError(true)
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#FFFFFF',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      fontFamily: 'var(--font-sans)',
      fontWeight: 400,
    }}>
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #DDE3EA',
        borderRadius: 16,
        padding: '52px 44px',
        width: '100%',
        maxWidth: 380,
        textAlign: 'center',
        boxShadow: '0 4px 32px rgba(22,17,11,0.07)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <FenixLogo />
        </div>

        <h1 style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 28,
          fontWeight: 500,
          color: '#111827',
          margin: '0 0 6px',
          letterSpacing: '-0.01em',
          lineHeight: 1.2,
        }}>
          Administración
        </h1>
        <p style={{
          color: '#6B7280',
          fontSize: 10,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          margin: '0 0 40px',
        }}>
          Acceso restringido
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Contraseña"
            value={pwd}
            onChange={e => { setPwd(e.target.value); setError(false) }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{
              background: '#F3F4F6',
              border: `1px solid ${
                error   ? '#CC0000' :
                focused ? '#CC0000' :
                          '#DDE3EA'
              }`,
              borderRadius: 8,
              padding: '13px 16px',
              color: '#111827',
              fontSize: 14,
              outline: 'none',
              fontFamily: 'inherit',
              textAlign: 'center',
              letterSpacing: '0.08em',
              transition: 'border-color 0.2s',
            }}
          />

          {error && (
            <p style={{ color: '#CC0000', fontSize: 12, margin: 0, letterSpacing: '0.04em' }}>
              Contraseña incorrecta. Intentá de nuevo.
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !pwd}
            style={{
              marginTop: 4,
              background: loading || !pwd ? '#E5E7EB' : '#CC0000',
              color: loading || !pwd ? '#6B7280' : '#FFFFFF',
              border: 'none',
              borderRadius: 8,
              padding: '13px 24px',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              cursor: loading || !pwd ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              transition: 'background 0.2s',
            }}
            onMouseEnter={e => { if (!loading && pwd) e.currentTarget.style.background = '#AA0000' }}
            onMouseLeave={e => { if (!loading && pwd) e.currentTarget.style.background = '#CC0000' }}
          >
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>

        <a
          href="/"
          style={{
            display: 'inline-block',
            marginTop: 36,
            color: '#6B7280',
            fontSize: 11,
            letterSpacing: '0.1em',
            textDecoration: 'none',
            transition: 'color 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#374151'}
          onMouseLeave={e => e.currentTarget.style.color = '#6B7280'}
        >
          ← Volver a la tienda
        </a>
      </div>
    </div>
  )
}
