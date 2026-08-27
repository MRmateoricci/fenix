import { useEffect, useState, useRef } from 'react'
import { Link, useSearchParams, Navigate } from 'react-router-dom'
import { OrderItemsBlock } from '../components/OrderItemsBlock'
import { useCart } from '../context/CartContext'
import BankTransferPanel from '../components/BankTransferPanel'

const API_BASE = import.meta.env.VITE_API_URL || ''

const STATUS_LABELS = {
  pending_payment: 'Pago pendiente',
  reserved:        'Reservado',
  paid:            'Pagado',
  preparing:       'Preparando',
  shipped:         'En camino',
  delivered:       'Entregado',
  cancelled:       'Cancelado',
  payment_failed:  'Pago rechazado',
  expired:         'Reserva vencida',
}

export default function OrderConfirmation() {
  const { clearCart }       = useCart()
  const [searchParams]    = useSearchParams()
  const returnedStatuses  = searchParams.getAll('status')
  const mpStatus          = returnedStatuses.find((status) => ['success', 'failure', 'pending'].includes(status))
    || returnedStatuses[0]
  const paymentStatus     = searchParams.get('collection_status')
    || returnedStatuses.find((status) => ['approved', 'rejected', 'in_process'].includes(status))
  const paymentId         = searchParams.get('payment_id') || searchParams.get('collection_id')
  const merchantOrderId   = searchParams.get('merchant_order_id')
  const preferenceId      = searchParams.get('preference_id')
  const orderId           = searchParams.get('orderId')

  const [order, setOrder]     = useState(null)
  const [loading, setLoading] = useState(true)
  const pollsRef              = useRef(0)
  const reconciliationRef     = useRef(false)
  const MAX_POLLS             = 10

  useEffect(() => {
    sessionStorage.removeItem('fenix_pending_order_id')
  }, [])

  useEffect(() => {
    const token = decodeURIComponent(window.location.hash.slice(1))
    if (!orderId || !token) return
    localStorage.setItem(`fenix_order_access_${orderId}`, token)
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  }, [orderId])

  useEffect(() => {
    if (!orderId) { setLoading(false); return }
    let cancelled = false
    let pollTimer

    async function fetchOrder() {
      try {
        const res = await fetch(`${API_BASE}/api/orders/public/${orderId}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('not found')
        const data = await res.json()
        if (cancelled) return
        setOrder(data)

        // Si MP dijo success pero el webhook aún no llegó, seguimos polling
        if (
          data.status === 'pending_payment' &&
          (mpStatus === 'success' || paymentStatus === 'approved') &&
          pollsRef.current < MAX_POLLS
        ) {
          pollsRef.current += 1
          pollTimer = setTimeout(fetchOrder, 3000)
          return
        }
      } catch {
        // no-op
      }
      if (!cancelled) setLoading(false)
    }

    async function verifyReturnAndFetch() {
      const shouldReconcile = paymentId
        && (mpStatus === 'success' || paymentStatus === 'approved')
        && !reconciliationRef.current

      if (shouldReconcile) {
        reconciliationRef.current = true
        try {
          await fetch(`${API_BASE}/api/orders/public/${orderId}/reconcile-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId }),
          })
        } catch {
          // El polling queda como respaldo si la API de MP está temporalmente caída.
        }
      }

      await fetchOrder()
    }

    verifyReturnAndFetch()
    return () => {
      cancelled = true
      clearTimeout(pollTimer)
    }
  }, [orderId, mpStatus, paymentStatus, paymentId])

  useEffect(() => {
    if (['paid', 'preparing', 'shipped', 'delivered', 'reserved'].includes(order?.status)) {
      sessionStorage.removeItem('fenix_checkout_payment_draft')
      clearCart()
    }
  }, [order?.status])

  // Sin parámetros → redirigir a home
  if (!orderId && !loading) return <Navigate to="/" replace />

  // Compatibilidad con preferencias creadas antes de que el back_url de
  // rechazo apuntara directamente al checkout.
  if ((mpStatus === 'failure' || order?.status === 'payment_failed') && orderId) {
    const params = new URLSearchParams({ payment: 'failure', orderId })
    if (paymentId) params.set('payment_id', paymentId)
    if (merchantOrderId) params.set('merchant_order_id', merchantOrderId)
    if (preferenceId) params.set('preference_id', preferenceId)
    return <Navigate to={`/checkout?${params}`} replace />
  }

  if (loading) {
    return (
      <div
        className="min-h-[60vh] flex flex-col items-center justify-center gap-4"
        style={{ backgroundColor: 'var(--color-bg)' }}
      >
        <SpinnerIcon />
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Verificando tu pago…</p>
      </div>
    )
  }

  const isFailed  = mpStatus === 'failure' || ['payment_failed', 'expired'].includes(order?.status)
  const isPending = !isFailed && (mpStatus === 'pending' || order?.status === 'pending_payment')
  const isSuccess = !isFailed && !isPending
  const isReserved = isSuccess && order?.status === 'reserved'
  const isBankTransfer = order?.payment_method === 'bank_transfer'

  return (
    <div style={{ backgroundColor: 'var(--color-bg)', minHeight: '100vh' }}>
      <div className={`fnx-order-confirmation-content${isBankTransfer ? ' is-bank-transfer' : ' max-w-xl mx-auto px-4 sm:px-6 py-16 pb-24'}`}>

        {/* ── Ícono de estado ──────────────────────────────────────────────── */}
        <div className="fnx-order-confirmation-status flex justify-center mb-8">
          {isSuccess && <AnimatedCheck />}
          {isPending  && <PendingIcon />}
          {isFailed   && <FailedIcon />}
        </div>

        {/* ── Título ───────────────────────────────────────────────────────── */}
        <div className="fnx-order-confirmation-intro text-center mb-10">
          <h1
            className="text-3xl sm:text-4xl font-normal mb-3"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-text)' }}
          >
            {isReserved && '¡Reserva confirmada!'}
            {isSuccess && !isReserved && '¡Pedido confirmado!'}
            {isPending  && (isBankTransfer ? 'Pedido recibido' : 'Pago en proceso')}
            {isFailed   && (order?.status === 'expired' ? 'La reserva venció' : 'El pago no fue aprobado')}
          </h1>
          <p className="text-base leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            {isReserved && `Te esperamos el ${order.pickup_date ? new Date(order.pickup_date).toLocaleDateString('es-AR', { day: '2-digit', month: 'long' }) : 'día elegido'} en el local para pagar y retirar tu pedido.`}
            {isSuccess && !isReserved && 'Te contactaremos a la brevedad para coordinar la entrega.'}
            {isPending  && (isBankTransfer
              ? 'Realizá la transferencia y cargá el comprobante. El pago se confirmará después de verificarlo.'
              : 'Tu pago está siendo procesado. Te avisaremos cuando se confirme.')}
            {isFailed && order?.status === 'expired' && 'No llegamos a confirmar el pago/retiro a tiempo y el pedido venció. Si todavía te interesa, hacelo de nuevo.'}
            {isFailed && order?.status !== 'expired' && 'Podés intentarlo de nuevo o contactarnos por WhatsApp.'}
          </p>
        </div>

        {/* ── Detalle del pedido (solo si tenemos datos) ───────────────────── */}
        {order && !isFailed && (
          <div
            className="fnx-order-confirmation-summary rounded-2xl overflow-hidden mb-8"
            style={{ border: '1px solid var(--color-border)' }}
          >
            {/* Header */}
            <div
              className="px-6 py-4 flex items-center justify-between"
              style={{ backgroundColor: 'var(--color-surface-2)' }}
            >
              <div>
                <p className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                  Número de orden
                </p>
                <p className="text-lg font-bold mt-0.5" style={{ color: 'var(--color-text)' }}>
                  #{order.order_number}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                  Estado
                </p>
                <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--color-primary)' }}>
                  {STATUS_LABELS[order.status] || order.status}
                </p>
              </div>
            </div>

            {/* Productos */}
            <div style={{ backgroundColor: 'var(--color-surface)' }}>
              <OrderItemsBlock
                items={order.items}
                totalAmount={order.total_amount}
                deliveryType={order.delivery_type}
                address={order.address}
                city={order.city}
                estimatedDeliveryMinDate={order.estimated_delivery_date}
                estimatedDeliveryMaxDate={order.estimated_delivery_max_date}
              />
            </div>
          </div>
        )}

        {order && isBankTransfer && !isFailed && <BankTransferPanel orderId={order.id} />}

        {/* ── Contacto ─────────────────────────────────────────────────────── */}
        {!isFailed && (
          <div
            className="fnx-order-confirmation-contact rounded-xl p-5 mb-8 text-sm"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <p className="font-medium mb-1" style={{ color: 'var(--color-text)' }}>
              ¿Tenés preguntas sobre tu pedido?
            </p>
            <p style={{ color: 'var(--color-text-muted)' }}>
              Escribinos a{' '}
              <a
                href="https://instagram.com/fenixcitybell"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
              >
                @fenixcitybell
              </a>{' '}
              o vení a vernos: 473 entre 14C y 15, City Bell.
            </p>
          </div>
        )}

        {/* ── CTAs ─────────────────────────────────────────────────────────── */}
        <div className="fnx-order-confirmation-actions flex flex-col sm:flex-row gap-3 justify-center">
          {isSuccess && (
            <>
              <Link
                to="/"
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-sm font-semibold transition-colors"
                style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
              >
                Seguir comprando
              </Link>
              {order && (
                <Link
                  to={`/track-order?n=${order.order_number}`}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-sm font-semibold transition-all"
                  style={{ border: '1.5px solid var(--color-border)', color: 'var(--color-text)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-text-muted)'; e.currentTarget.style.backgroundColor = 'var(--color-surface)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  Rastrear pedido
                </Link>
              )}
            </>
          )}
          {isPending && (
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-sm font-semibold transition-colors"
              style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
            >
              Volver al inicio
            </Link>
          )}
          {isFailed && (
            <>
              <Link
                to="/checkout"
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-sm font-semibold transition-colors"
                style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
              >
                Intentar de nuevo
              </Link>
              <Link
                to="/"
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-sm font-semibold transition-all"
                style={{ border: '1.5px solid var(--color-border)', color: 'var(--color-text)' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-text-muted)'; e.currentTarget.style.backgroundColor = 'var(--color-surface)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                Volver al inicio
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Iconos / componentes de estado ────────────────────────────────────────────

function AnimatedCheck() {
  return (
    <div className="anim-check-wrapper">
      <svg width="88" height="88" viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg">
        <circle className="anim-check-circle" cx="26" cy="26" r="25" stroke="var(--color-primary)" strokeWidth="2" />
        <path className="anim-check-mark" d="M14 27l9 9 16-18" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function PendingIcon() {
  return (
    <div style={{
      width: 88, height: 88, borderRadius: '50%',
      border: '3px solid #E0A24A',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#E0A24A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    </div>
  )
}

function FailedIcon() {
  return (
    <div style={{
      width: 88, height: 88, borderRadius: '50%',
      border: '3px solid var(--color-primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </div>
  )
}

function SpinnerIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}>
      <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.2"/>
      <path d="M12 3a9 9 0 019 9"/>
    </svg>
  )
}
