import { useState } from 'react'
import { Link } from 'react-router-dom'
import PageSEO from '../components/SEO'
import { SEO as seoCfg } from '../config/seo'

const API_BASE = import.meta.env.VITE_API_URL || ''

// Botón de arrepentimiento (Res. 424/2020): formulario para revocar la compra
// sin causa dentro de los 10 días corridos. Reutiliza el layout de las páginas
// de cuenta (fnx-auth-simple-page) para no sumar estilos propios. La norma
// exige que sea de fácil acceso y sin trabas: no pide cuenta ni pedido válido.
export default function Arrepentimiento() {
  const [form, setForm] = useState({ fullName: '', email: '', orderNumber: '', reason: '' })
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const setField = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  async function submit(event) {
    event.preventDefault()
    setStatus('loading')
    setError('')
    try {
      const response = await fetch(`${API_BASE}/api/revocations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'No pudimos registrar la solicitud')
      setResult(data)
      setStatus('success')
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  return (
    <>
      <PageSEO
        title="Botón de arrepentimiento"
        description="Revocá tu compra sin costo dentro de los 10 días corridos, según la Ley 24.240."
        url="/arrepentimiento"
      />
      <main className="fnx-auth-simple-page">
        <section>
          <h1>Botón de arrepentimiento</h1>
          {status === 'success' ? (
            <div className="fnx-auth-success">
              <strong>Solicitud registrada · {result.code}</strong>
              <p>
                Te enviamos un correo con el número de trámite. Nos comunicamos con vos dentro de las
                24 horas hábiles para coordinar la devolución y el reintegro, sin costo para vos.
              </p>
            </div>
          ) : (
            <form onSubmit={submit}>
              <p>
                Podés arrepentirte de una compra hecha en este sitio, sin dar motivo y sin costo, dentro de
                los 10 días corridos desde que recibiste el producto (art. 34, Ley 24.240). Completá el
                formulario y te damos un número de trámite en el acto.
              </p>
              <input type="text" placeholder="Nombre y apellido" value={form.fullName} onChange={setField('fullName')} required autoComplete="name" />
              <input type="email" placeholder="Correo electrónico usado en la compra" value={form.email} onChange={setField('email')} required autoComplete="email" />
              <input type="text" placeholder="Número de pedido (FX-XXXXXX, opcional)" value={form.orderNumber} onChange={setField('orderNumber')} maxLength={20} />
              <textarea
                placeholder="Motivo (opcional)"
                value={form.reason}
                onChange={setField('reason')}
                rows={3}
                maxLength={2000}
                style={{ width: '100%', padding: '10px 13px', border: '1px solid var(--color-border)', borderRadius: 2, background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 13, resize: 'vertical' }}
              />
              {error && <small className="error">{error}</small>}
              <button type="submit" disabled={status === 'loading'}>{status === 'loading' ? 'Enviando…' : 'Enviar solicitud'}</button>
              <p>
                También podés hacerlo escribiendo a {seoCfg.legal.email}. Más información en la{' '}
                <Link to="/policies/refunds">política de cambios y devoluciones</Link>.
              </p>
            </form>
          )}
          <Link to="/">← Volver al inicio</Link>
        </section>
      </main>
    </>
  )
}
