'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Lock, User, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

type Mode = 'login' | 'register'

export default function LoginPage() {
  const { login, register } = useAuth()
  const router = useRouter()

  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        if (!name.trim()) { setError('El nombre es requerido'); setLoading(false); return }
        await register(email, name, password)
      }
      router.replace('/')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        .ap-input:focus { border-color: #5C5C5A !important; outline: none; }
        .ap-input::placeholder { color: #444441; }
        .ap-btn-ghost:hover { background-color: #2C2C2A !important; }
      `}</style>
      <div style={{ fontFamily: "'Inter', sans-serif", backgroundColor: '#0D0D0C', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div style={{ width: '100%', maxWidth: '360px' }}>

          {/* Logo + marca */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '28px' }}>
            <div style={{ backgroundColor: '#0D0D0C', border: '1px solid #2C2C2A', borderRadius: '16px', padding: '10px', marginBottom: '16px' }}>
              <svg width="48" height="48" viewBox="0 0 80 80" fill="none">
                <rect width="80" height="80" rx="20" fill="white"/>
                <path d="M18 58L40 16L62 58H50L40 34L30 58H18Z" fill="#0D0D0C"/>
                <rect x="30" y="44" width="20" height="6" fill="white"/>
              </svg>
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 500, color: '#FFFFFF', letterSpacing: '-0.3px', margin: 0 }}>
              Autopost
            </h1>
            <p style={{ fontSize: '13px', color: '#888780', marginTop: '4px' }}>
              Automatizá tu contenido
            </p>
          </div>

          {/* Card */}
          <div style={{ backgroundColor: '#1C1C1A', border: '0.5px solid #2C2C2A', borderRadius: '16px', padding: '28px' }}>

            {/* Tabs */}
            <div style={{ display: 'flex', backgroundColor: '#0D0D0C', borderRadius: '10px', padding: '4px', marginBottom: '24px' }}>
              {(['login', 'register'] as Mode[]).map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError('') }}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    fontSize: '13px',
                    fontWeight: 500,
                    fontFamily: "'Inter', sans-serif",
                    borderRadius: '7px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    backgroundColor: mode === m ? '#E8E8E4' : 'transparent',
                    color: mode === m ? '#0D0D0C' : '#888780',
                  }}
                >
                  {m === 'login' ? 'Iniciar sesión' : 'Registrarse'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Nombre — solo en register */}
              {mode === 'register' && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 400, color: '#888780', marginBottom: '6px' }}>
                    Nombre
                  </label>
                  <div style={{ position: 'relative' }}>
                    <User size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#555552', pointerEvents: 'none' }} />
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Tu nombre completo"
                      className="ap-input"
                      style={inputStyle}
                    />
                  </div>
                </div>
              )}

              {/* Email */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 400, color: '#888780', marginBottom: '6px' }}>
                  Email
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#555552', pointerEvents: 'none' }} />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    required
                    className="ap-input"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Contraseña */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 400, color: '#888780', marginBottom: '6px' }}>
                  Contraseña
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#555552', pointerEvents: 'none' }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : '••••••••'}
                    required
                    className="ap-input"
                    style={{ ...inputStyle, paddingRight: '40px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#555552', padding: 0, display: 'flex', alignItems: 'center' }}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.25)', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#f87171' }}>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  height: '42px',
                  backgroundColor: loading ? '#C8C8C4' : '#E8E8E4',
                  color: '#0D0D0C',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '14px',
                  fontWeight: 500,
                  borderRadius: '8px',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  marginTop: '4px',
                  transition: 'background-color 0.15s',
                }}
              >
                {loading && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
                {loading ? 'Cargando...' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
              </button>
            </form>

            {/* Admin hint */}
            {mode === 'login' && (
              <p style={{ textAlign: 'center', fontSize: '11px', color: '#444441', marginTop: '16px', marginBottom: 0 }}>
                Admin demo: admin@socialpilot.ai / admin123
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: '42px',
  backgroundColor: '#2C2C2A',
  border: '0.5px solid #3C3C3A',
  borderRadius: '8px',
  paddingLeft: '36px',
  paddingRight: '12px',
  fontSize: '14px',
  color: '#FFFFFF',
  fontFamily: "'Inter', sans-serif",
  outline: 'none',
  boxSizing: 'border-box',
}
