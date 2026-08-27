import { useCallback, useEffect, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || ''
const fmt = value => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(Number(value || 0))

const STATUS_TEXT = {
  awaiting_proof: 'Esperando comprobante',
  pending_review: 'Comprobante en revisión',
  rejected: 'Comprobante rechazado',
  approved: 'Transferencia aprobada',
  expired: 'Plazo vencido',
}

export default function BankTransferPanel({ orderId, accessToken: providedToken, onStatusChange }) {
  const [details, setDetails] = useState(null)
  const [payerAccountHolder, setPayerAccountHolder] = useState('')
  const [proof, setProof] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const accessToken = providedToken || localStorage.getItem(`fenix_order_access_${orderId}`) || ''

  const load = useCallback(async () => {
    const response = await fetch(`${API_BASE}/api/bank-transfers/orders/${orderId}`, {
      credentials: 'include', cache: 'no-store',
      headers: accessToken ? { 'x-order-access-token': accessToken } : {},
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'No pudimos consultar la transferencia')
    setDetails(data)
    onStatusChange?.(data)
  }, [accessToken, onStatusChange, orderId])

  useEffect(() => {
    load().catch(reason => setError(reason.message))
  }, [load])

  const submit = async event => {
    event.preventDefault()
    if (!proof) return setError('Adjuntá un comprobante JPG, PNG o PDF')
    setBusy(true)
    setError('')
    try {
      const body = new FormData()
      body.append('payerAccountHolder', payerAccountHolder)
      body.append('proof', proof)
      const response = await fetch(`${API_BASE}/api/bank-transfers/orders/${orderId}/submissions`, {
        method: 'POST', credentials: 'include', body,
        headers: accessToken ? { 'x-order-access-token': accessToken } : {},
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'No pudimos enviar el comprobante')
      setProof(null)
      await load()
    } catch (reason) {
      setError(reason.message)
    } finally {
      setBusy(false)
    }
  }

  if (!details && !error) return <section style={{ margin: '24px 0' }}><p>Cargando instrucciones bancarias…</p></section>

  const latest = details?.submissions?.[0]
  const canSubmit = ['awaiting_proof', 'rejected'].includes(details?.transferStatus)
  const proofInputId = `bank-transfer-proof-${orderId}`
  return (
    <section className="fnx-bank-transfer-panel">
      <h2 style={{ marginTop: 0 }}>Transferencia bancaria</h2>
      {details && <>
        <p><strong>{STATUS_TEXT[details.transferStatus] || details.transferStatus}</strong></p>
        <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '8px 18px', margin: '18px 0' }}>
          <dt>CBU</dt><dd><strong>{details.bank.cbu}</strong></dd>
          <dt>Alias</dt><dd><strong>{details.bank.alias}</strong></dd>
          <dt>Titular</dt><dd><strong>{details.bank.accountHolder}</strong></dd>
          <dt>Importe exacto</dt><dd><strong>{fmt(details.total)}</strong></dd>
          <dt>Pedido</dt><dd><strong>#{details.orderNumber}</strong></dd>
          <dt>Vence</dt><dd>{new Date(details.expiresAt).toLocaleString('es-AR')}</dd>
        </dl>
        {canSubmit && <p className="fnx-bank-transfer-note">La cuenta de origen puede pertenecer a otra persona. Informá el titular real.</p>}
        {latest?.status === 'rejected' && <p style={{ color: '#b91c1c' }}>Motivo del rechazo: <strong>{latest.rejectionReason}</strong></p>}
        {details.transferStatus === 'pending_review' && <p>Recibimos el comprobante. El pedido seguirá pendiente hasta verificar el ingreso.</p>}
        {details.transferStatus === 'approved' && <p>El pago fue verificado y el pedido continúa por el flujo normal.</p>}
        {details.transferStatus === 'expired' && <p>El plazo para presentar un comprobante válido venció.</p>}
        {canSubmit && <form onSubmit={submit} style={{ display: 'grid', gap: 12, marginTop: 20 }}>
          <label>Titular de la cuenta de origen
            <input value={payerAccountHolder} onChange={event => setPayerAccountHolder(event.target.value)} minLength={2} maxLength={160} required style={{ display: 'block', width: '100%', marginTop: 6, padding: 10, border: '1px solid var(--color-border)', borderRadius: 8 }} />
          </label>
          <div className="fnx-bank-transfer-file-field">
            <label htmlFor={proofInputId}>Comprobante (JPG, PNG o PDF; máximo 10 MB)</label>
            <input
              id={proofInputId}
              className="fnx-bank-transfer-file-input"
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              aria-required="true"
              onChange={event => {
                setProof(event.target.files?.[0] || null)
                setError('')
              }}
            />
            <label className="fnx-bank-transfer-file-picker" htmlFor={proofInputId}>
              <span className="fnx-bank-transfer-file-button">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 16V4" />
                  <path d="m7 9 5-5 5 5" />
                  <path d="M5 14v5h14v-5" />
                </svg>
                Seleccionar archivo
              </span>
              <span className="fnx-bank-transfer-file-name" aria-live="polite">
                {proof?.name || 'Ningún archivo seleccionado'}
              </span>
            </label>
          </div>
          <button type="submit" className="fnx-pay-now" disabled={busy}>{busy ? 'Enviando…' : latest?.status === 'rejected' ? 'Enviar nuevo comprobante' : 'Informar transferencia'}</button>
        </form>}
      </>}
      {error && <p style={{ color: 'var(--color-primary)' }}>{error}</p>}
    </section>
  )
}
