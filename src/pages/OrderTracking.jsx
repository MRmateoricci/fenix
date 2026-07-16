import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { OrderItemsBlock } from '../components/OrderItemsBlock'
import { SEO as seoCfg } from '../config/seo'

const API_BASE = import.meta.env.VITE_API_URL || ''

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

function CardIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
      <line x1="2.5" y1="9.5" x2="21.5" y2="9.5" />
      <line x1="6" y1="14.5" x2="10" y2="14.5" />
    </svg>
  )
}

function CheckCircleIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9.5" />
      <polyline points="8 12.5 10.8 15.5 16 9.5" />
    </svg>
  )
}

function BoxIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z" />
      <polyline points="3.5 7.5 12 12 20.5 7.5" />
      <line x1="12" y1="12" x2="12" y2="21" />
    </svg>
  )
}

function TruckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="1.5" y="7" width="13" height="10" rx="1" />
      <path d="M14.5 10.5H18l3.5 3.5V17h-3" />
      <circle cx="6" cy="18" r="1.8" />
      <circle cx="17" cy="18" r="1.8" />
    </svg>
  )
}

function HomeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <line x1="10" y1="20" x2="10" y2="14" />
      <line x1="14" y1="20" x2="14" y2="14" />
    </svg>
  )
}

function XCircleIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9.5" />
      <line x1="9" y1="9" x2="15" y2="15" />
      <line x1="15" y1="9" x2="9" y2="15" />
    </svg>
  )
}

function WhatsAppIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M11.99 2C6.477 2 2 6.477 2 11.99c0 1.77.463 3.435 1.275 4.884L2 22l5.274-1.256A9.934 9.934 0 0011.99 21.98C17.503 21.98 22 17.503 22 11.99 22 6.477 17.503 2 11.99 2zm0 18.18a8.183 8.183 0 01-4.17-1.142l-.299-.177-3.097.738.768-3.015-.196-.31A8.194 8.194 0 013.79 11.99c0-4.524 3.683-8.207 8.2-8.207 4.524 0 8.207 3.683 8.207 8.207s-3.683 8.19-8.207 8.19z" />
    </svg>
  )
}

const STEPS = [
  { key: 'pending_payment', label: 'Pago/reserva pendiente', Icon: CardIcon },
  { key: 'paid',            label: 'Pago confirmado',        Icon: CheckCircleIcon },
  { key: 'preparing',       label: 'Preparando',             Icon: BoxIcon },
  { key: 'shipped',         label: 'En camino',              Icon: TruckIcon },
  { key: 'delivered',       label: 'Entregado',              Icon: HomeIcon },
]

const FAILED_STATES = ['cancelled', 'payment_failed', 'expired']
const FAILED_LABELS = { cancelled: 'Cancelado', payment_failed: 'Pago rechazado', expired: 'Reserva vencida' }

// 'reserved' (retiro a pagar en el local) ocupa el mismo primer paso que
// 'pending_payment' (Mercado Pago) — son mutuamente excluyentes por pedido.
function getStepIndex(status) {
  const normalized = status === 'reserved' ? 'pending_payment' : status
  return STEPS.findIndex((s) => s.key === normalized)
}

export default function OrderTracking() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [input, setInput]   = useState(searchParams.get('n') || '')
  const [order, setOrder]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)

  // Si viene con ?n=FX-XXXXXX en la URL, busca automáticamente
  useEffect(() => {
    const n = searchParams.get('n')
    if (n) search(n)
  }, [])

  async function search(orderNumber) {
    const num = (orderNumber || input).trim().toUpperCase()
    if (!num) return
    setLoading(true)
    setError(null)
    setOrder(null)
    try {
      const res = await fetch(`${API_BASE}/api/orders/track/${num}`)
      if (res.status === 404) throw new Error('No encontramos ese número de pedido.')
      if (!res.ok) throw new Error('Error al buscar el pedido. Intentá de nuevo.')
      const data = await res.json()
      setOrder(data)
      setSearchParams({ n: data.order_number }, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const isFailed   = order && FAILED_STATES.includes(order.status)
  const stepIndex  = order ? getStepIndex(order.status) : -1

  return (
    <div style={{ backgroundColor: 'var(--color-bg)', minHeight: '100vh' }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-14 pb-24">

        <h1
          className="text-3xl font-normal mb-2 text-center"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-text)' }}
        >
          Rastrear pedido
        </h1>
        <p className="text-center text-sm mb-10" style={{ color: 'var(--color-text-muted)' }}>
          Ingresá tu número de pedido para ver el estado
        </p>

        {/* ── Buscador ─────────────────────────────────────────────────────── */}
        <div className="flex gap-3 mb-10">
          <input
            type="text"
            placeholder="FX-A3B9C2"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            className="flex-1 px-4 py-3 rounded-xl text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1.5px solid var(--color-border)',
              color: 'var(--color-text)',
              fontFamily: 'var(--font-sans)',
              letterSpacing: '0.08em',
            }}
          />
          <button
            onClick={() => search()}
            disabled={loading}
            className="px-6 py-3 rounded-xl text-sm font-semibold transition-colors"
            style={{
              backgroundColor: loading ? 'var(--color-text-muted)' : 'var(--color-primary)',
              color: '#fff',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '...' : 'Buscar'}
          </button>
        </div>

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {error && (
          <div
            className="rounded-xl p-4 mb-8 text-sm text-center"
            style={{
              backgroundColor: 'rgba(204,0,0,0.07)',
              border: '1px solid rgba(204,0,0,0.25)',
              color: 'var(--color-primary)',
            }}
          >
            {error}
          </div>
        )}

        {/* ── Resultado ────────────────────────────────────────────────────── */}
        {order && (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: '1px solid var(--color-border)' }}
          >
            {/* Header */}
            <div
              className="px-6 py-5 flex items-center justify-between"
              style={{ backgroundColor: 'var(--color-surface-2)' }}
            >
              <div>
                <p className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                  Pedido
                </p>
                <p className="text-2xl font-bold mt-0.5" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-serif)' }}>
                  #{order.order_number}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                  Realizado
                </p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--color-text)' }}>
                  {fmtDate(order.created_at)}
                </p>
              </div>
            </div>

            {/* Timeline de estados */}
            <div
              className="px-6 py-8"
              style={{ backgroundColor: 'var(--color-surface)' }}
            >
              {isFailed ? (
                <div
                  className="rounded-xl p-5 text-center"
                  style={{ backgroundColor: 'rgba(204,0,0,0.07)', border: '1px solid rgba(204,0,0,0.2)' }}
                >
                  <XCircleIcon width={28} height={28} style={{ display: 'block', margin: '0 auto 8px', color: 'var(--color-primary)' }} />
                  <p className="font-semibold" style={{ color: 'var(--color-primary)' }}>
                    {FAILED_LABELS[order.status] || order.status}
                  </p>
                </div>
              ) : (
                <div className="relative">
                  {/* Línea de fondo */}
                  <div
                    className="absolute top-5 left-5 right-5 h-0.5"
                    style={{ backgroundColor: 'var(--color-border)' }}
                  />
                  {/* Línea de progreso */}
                  {stepIndex > 0 && (
                    <div
                      className="absolute top-5 left-5 h-0.5 transition-all duration-700"
                      style={{
                        backgroundColor: 'var(--color-primary)',
                        width: `calc(${(stepIndex / (STEPS.length - 1)) * 100}% - 10px)`,
                      }}
                    />
                  )}
                  <div className="relative flex justify-between">
                    {STEPS.map((step, i) => {
                      const done   = i <= stepIndex
                      const active = i === stepIndex
                      return (
                        <div key={step.key} className="flex flex-col items-center gap-2" style={{ width: 64 }}>
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-lg z-10 transition-all duration-300"
                            style={{
                              backgroundColor: done ? 'var(--color-primary)' : 'var(--color-surface-2)',
                              border: `2px solid ${done ? 'var(--color-primary)' : 'var(--color-border)'}`,
                              transform: active ? 'scale(1.15)' : 'scale(1)',
                              boxShadow: active ? '0 0 0 4px rgba(204,0,0,0.15)' : 'none',
                            }}
                          >
                            <step.Icon
                              width={18}
                              height={18}
                              style={{ color: done ? '#fff' : 'var(--color-text-muted)', opacity: done ? 1 : 0.5 }}
                            />
                          </div>
                          <p
                            className="text-center leading-tight"
                            style={{
                              fontSize: 10,
                              fontWeight: active ? 700 : 400,
                              color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
                              letterSpacing: '0.02em',
                            }}
                          >
                            {step.label}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Productos */}
            <div style={{ backgroundColor: 'var(--color-surface)', borderTop: '1px solid var(--color-border)' }}>
              <OrderItemsBlock
                items={order.items}
                totalAmount={order.total_amount}
                deliveryType={order.delivery_type}
                address={order.address}
                city={order.city}
                showDeliveryLabel={false}
                imageSizeClass="w-11 h-11"
                totalSizeClass="text-lg font-bold"
              />
            </div>

            {/* Consulta por WhatsApp */}
            <div
              className="px-6 py-4"
              style={{ backgroundColor: 'var(--color-surface)', borderTop: '1px solid var(--color-border)' }}
            >
              <a
                href={`https://wa.me/${seoCfg.business.whatsapp}?text=${encodeURIComponent(`Hola! Tengo una consulta sobre mi pedido #${order.order_number}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full"
                style={{
                  padding: '13px 0',
                  fontSize: 13, fontWeight: 600, letterSpacing: '.04em',
                  borderRadius: 8, border: '1.5px solid var(--color-border)',
                  color: 'var(--color-text)', backgroundColor: 'transparent',
                  textDecoration: 'none',
                }}
              >
                <WhatsAppIcon width={16} height={16} style={{ color: '#25D366' }} />
                ¿Algún inconveniente? Consultanos por WhatsApp
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
