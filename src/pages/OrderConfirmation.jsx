import { useEffect } from 'react'
import { Link, useLocation, Navigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'

const fmt = (n) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)

export default function OrderConfirmation() {
  const location = useLocation()
  const { clearCart } = useCart()
  const order = location.state

  // Clear cart on mount — order snapshot lives in location.state
  useEffect(() => {
    clearCart()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Guard: if navigated here directly without order state, redirect home
  if (!order) {
    return <Navigate to="/" replace />
  }

  const { orderNumber, items, total, customer } = order

  const deliveryLabel =
    customer.deliveryType === 'pickup'
      ? 'Retiro en local — 473 entre 14C y 15, City Bell'
      : `Envío a domicilio — ${customer.direccion}, ${customer.ciudad}`

  return (
    <div style={{ backgroundColor: 'var(--color-bg)', minHeight: '100vh' }}>
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-16 pb-24">

        {/* ── Animated check ───────────────────────────────────────────────── */}
        <div className="flex justify-center mb-8">
          <div className="anim-check-wrapper">
            <svg
              width="88"
              height="88"
              viewBox="0 0 52 52"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                className="anim-check-circle"
                cx="26"
                cy="26"
                r="25"
                stroke="var(--color-primary)"
                strokeWidth="2"
              />
              <path
                className="anim-check-mark"
                d="M14 27l9 9 16-18"
                stroke="var(--color-primary)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* ── Title & message ──────────────────────────────────────────────── */}
        <div className="text-center mb-10">
          <h1
            className="text-3xl sm:text-4xl font-bold mb-3"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-text)' }}
          >
            ¡Pedido confirmado!
          </h1>
          <p className="text-base leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            Te contactaremos a la brevedad para coordinar la entrega.
          </p>
        </div>

        {/* ── Order card ───────────────────────────────────────────────────── */}
        <div
          className="rounded-2xl overflow-hidden mb-8"
          style={{ border: '1px solid var(--color-border)' }}
        >
          {/* Card header */}
          <div
            className="px-6 py-4 flex items-center justify-between"
            style={{ backgroundColor: 'var(--color-surface-2)' }}
          >
            <div>
              <p className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                Número de orden
              </p>
              <p className="text-lg font-bold mt-0.5" style={{ color: 'var(--color-text)' }}>
                #{orderNumber}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                Cliente
              </p>
              <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--color-text)' }}>
                {customer.nombre} {customer.apellido}
              </p>
            </div>
          </div>

          {/* Products */}
          <div style={{ backgroundColor: 'var(--color-surface)' }}>
            {items.map((item, i) => (
              <div
                key={`${item.id}-${i}`}
                className="flex items-center gap-4 px-6 py-4"
                style={{ borderBottom: '1px solid var(--color-border)' }}
              >
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-12 h-12 rounded-lg object-cover shrink-0"
                  style={{ backgroundColor: 'var(--color-surface-2)' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                    {item.name}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {item.quantity} × {fmt(item.price)}
                  </p>
                </div>
                <p className="text-sm font-semibold shrink-0" style={{ color: 'var(--color-text)' }}>
                  {fmt(item.price * item.quantity)}
                </p>
              </div>
            ))}

            {/* Total */}
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: '1px solid var(--color-border)' }}
            >
              <span className="font-semibold" style={{ color: 'var(--color-text)' }}>Total</span>
              <span className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
                {fmt(total)}
              </span>
            </div>

            {/* Delivery */}
            <div className="flex items-start gap-3 px-6 py-4">
              <MapPinIcon />
              <div>
                <p className="text-[11px] uppercase tracking-widest font-semibold mb-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  Entrega
                </p>
                <p className="text-sm" style={{ color: 'var(--color-text)' }}>
                  {deliveryLabel}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Contact info ─────────────────────────────────────────────────── */}
        <div
          className="rounded-xl p-5 mb-8 text-sm"
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
              className="underline transition-colors"
              style={{ color: 'var(--color-primary)' }}
            >
              @fenixcitybell
            </a>{' '}
            o vení a vernos: 473 entre 14C y 15, City Bell.
          </p>
        </div>

        {/* ── CTA ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/"
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-sm font-semibold transition-colors"
            style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
          >
            Seguir comprando
          </Link>
          <a
            href={`https://wa.me/5491122334455?text=${encodeURIComponent(`Hola! Tengo una consulta sobre mi pedido #${orderNumber}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-sm font-semibold transition-all"
            style={{ border: '1.5px solid var(--color-border)', color: 'var(--color-text)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-text-muted)'
              e.currentTarget.style.backgroundColor = 'var(--color-surface)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)'
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <WhatsAppIcon />
            Consultar por WhatsApp
          </a>
        </div>
      </div>
    </div>
  )
}

function MapPinIcon() {
  return (
    <svg className="shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary)' }}>
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M11.99 2C6.477 2 2 6.477 2 11.99c0 1.77.463 3.435 1.275 4.884L2 22l5.274-1.256A9.934 9.934 0 0011.99 21.98C17.503 21.98 22 17.503 22 11.99 22 6.477 17.503 2 11.99 2zm0 18.18a8.183 8.183 0 01-4.17-1.142l-.299-.177-3.097.738.768-3.015-.196-.31A8.194 8.194 0 013.79 11.99c0-4.524 3.683-8.207 8.2-8.207 4.524 0 8.207 3.683 8.207 8.207s-3.683 8.19-8.207 8.19z" />
    </svg>
  )
}
