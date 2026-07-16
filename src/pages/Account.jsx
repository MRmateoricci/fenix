import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Field, DarkInput, PrimaryBtn } from '../components/AuthFormKit'
import PageSEO from '../components/SEO'

export default function Account() {
  const { user, updateProfile, resendVerificationEmail } = useAuth()

  const [formData, setFormData] = useState({
    firstName:  user.firstName  || '',
    lastName:   user.lastName   || '',
    phone:      user.phone      || '',
    address:    user.address    || '',
    city:       user.city       || '',
    postalCode: user.postalCode || '',
  })
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState(null)
  const [saving, setSaving]   = useState(false)
  const [verificationStatus, setVerificationStatus] = useState(null)
  const [resendingVerification, setResendingVerification] = useState(false)

  function setField(key, value) {
    setFormData((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await updateProfile(formData)
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleResendVerification() {
    setVerificationStatus(null)
    setResendingVerification(true)
    try {
      await resendVerificationEmail()
      setVerificationStatus({ type: 'success', text: 'Te enviamos un nuevo enlace de verificación.' })
    } catch (err) {
      setVerificationStatus({ type: 'error', text: err.message })
    } finally {
      setResendingVerification(false)
    }
  }

  return (
    <>
      <PageSEO title="Mi cuenta" description="Gestioná tus datos, favoritos y pedidos en Fénix Iluminación." url="/account" />
      <div style={{ backgroundColor: 'var(--color-bg)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '42rem', margin: '0 auto', padding: '3rem 1.5rem 6rem' }}>
          <h1
            style={{
              fontFamily: 'var(--font-serif)', color: 'var(--color-text)',
              fontSize: '2.25rem', fontWeight: 400, letterSpacing: '-0.01em',
              textAlign: 'center', marginBottom: '1.5rem',
            }}
          >
            Mi cuenta
          </h1>

          {/* Tabs a Favoritos / Pedidos */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '2.5rem' }}>
            <Link
              to="/favorites"
              style={{
                padding: '0.6rem 1.25rem', borderRadius: '0.75rem',
                border: '1.5px solid var(--color-border)', color: 'var(--color-text)',
                fontSize: '0.85rem', fontWeight: 500, textDecoration: 'none',
              }}
            >
              Mis favoritos
            </Link>
            <Link
              to="/orders"
              style={{
                padding: '0.6rem 1.25rem', borderRadius: '0.75rem',
                border: '1.5px solid var(--color-border)', color: 'var(--color-text)',
                fontSize: '0.85rem', fontWeight: 500, textDecoration: 'none',
              }}
            >
              Mis pedidos
            </Link>
          </div>

          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '1rem',
              padding: '2rem 2.25rem',
              boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
            }}
          >
            {!user.emailVerified && (
              <div style={{
                padding: '1rem', marginBottom: '1.5rem', borderRadius: 12,
                backgroundColor: '#FFF6E5', border: '1px solid #EBCB87',
              }}>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#694B0C' }}>
                  Confirmá que <strong>{user.email}</strong> es tuyo. La verificación es necesaria para publicar reseñas.
                </p>
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resendingVerification}
                  style={{
                    marginTop: '0.75rem', color: 'var(--color-primary)', fontWeight: 600,
                    fontSize: '0.82rem', textDecoration: 'underline',
                    cursor: resendingVerification ? 'not-allowed' : 'pointer',
                  }}
                >
                  {resendingVerification ? 'Enviando…' : 'Reenviar email de verificación'}
                </button>
                {verificationStatus && (
                  <p style={{
                    margin: '0.5rem 0 0', fontSize: '0.78rem',
                    color: verificationStatus.type === 'success' ? '#166534' : 'var(--color-primary)',
                  }}>
                    {verificationStatus.text}
                  </p>
                )}
              </div>
            )}
            <h2
              style={{
                fontFamily: 'var(--font-serif)', fontSize: '1.35rem', fontWeight: 400,
                color: 'var(--color-text)', borderBottom: '1px solid var(--color-border)',
                paddingBottom: '1rem', marginBottom: '1.75rem',
              }}
            >
              Mis datos
            </h2>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                <Field label="Nombre">
                  <DarkInput value={formData.firstName} onChange={(v) => setField('firstName', v)} />
                </Field>
                <Field label="Apellido">
                  <DarkInput value={formData.lastName} onChange={(v) => setField('lastName', v)} />
                </Field>
              </div>
              <Field label="Email">
                <div style={{
                  padding: '0.75rem 1rem', borderRadius: '0.625rem',
                  fontSize: '0.9rem', backgroundColor: 'var(--color-surface-2)',
                  border: '1.5px solid var(--color-border)', color: 'var(--color-text-muted)',
                }}>
                  {user.email}
                </div>
              </Field>
              <Field label="Teléfono">
                <DarkInput type="tel" placeholder="11-1234-5678" value={formData.phone} onChange={(v) => setField('phone', v)} />
              </Field>
              <Field label="Dirección">
                <DarkInput placeholder="Calle 123" value={formData.address} onChange={(v) => setField('address', v)} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                <Field label="Ciudad">
                  <DarkInput value={formData.city} onChange={(v) => setField('city', v)} />
                </Field>
                <Field label="Código postal">
                  <DarkInput value={formData.postalCode} onChange={(v) => setField('postalCode', v)} />
                </Field>
              </div>

              {error && (
                <p style={{ fontSize: '0.8rem', color: 'var(--color-primary)', margin: 0 }}>{error}</p>
              )}
              {saved && !error && (
                <p style={{ fontSize: '0.8rem', color: '#166534', margin: 0 }}>Datos guardados.</p>
              )}

              <PrimaryBtn type="submit" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </PrimaryBtn>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}
