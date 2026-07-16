import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PageSEO from '../components/SEO'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const { user, verifyEmail } = useAuth()
  const started = useRef(false)
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (started.current) return
    started.current = true
    const token = searchParams.get('token')
    if (!token) {
      setStatus('error')
      setMessage('Falta el token de verificación.')
      return
    }

    verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error')
        setMessage(err.message)
      })
  }, [searchParams, verifyEmail])

  return (
    <>
      <PageSEO title="Verificar email" description="Confirmación de email de tu cuenta." url="/verify-email" />
      <div style={{ minHeight: '70vh', backgroundColor: 'var(--color-bg)', display: 'grid', placeItems: 'center', padding: '3rem 1.5rem' }}>
        <div style={{
          width: '100%', maxWidth: 480, padding: '2rem', textAlign: 'center',
          backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 16,
        }}>
          <h1 style={{ fontSize: '1.75rem', color: 'var(--color-text)', marginBottom: '1rem' }}>
            {status === 'loading' && 'Verificando tu email…'}
            {status === 'success' && 'Email confirmado'}
            {status === 'error' && 'No pudimos confirmar el email'}
          </h1>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
            {status === 'loading' && 'Esto demora solo unos segundos.'}
            {status === 'success' && 'Tu cuenta ya puede publicar reseñas de productos que hayas recibido.'}
            {status === 'error' && message}
          </p>
          {status !== 'loading' && (
            <Link
              to={user ? '/account' : '/login'}
              style={{
                display: 'inline-block', padding: '0.75rem 1.25rem', borderRadius: 10,
                backgroundColor: 'var(--color-primary)', color: '#fff', fontWeight: 600,
              }}
            >
              {user ? 'Ir a mi cuenta' : 'Iniciar sesión'}
            </Link>
          )}
        </div>
      </div>
    </>
  )
}
