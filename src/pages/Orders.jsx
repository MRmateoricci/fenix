import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { OrderItemsBlock } from '../components/OrderItemsBlock'
import PageSEO from '../components/SEO'

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

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })

export default function Orders() {
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/api/orders/mine`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then(setOrders)
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <PageSEO title="Mis pedidos" description="Historial de pedidos en Fénix Iluminación." url="/orders" />
      <div style={{ backgroundColor: 'var(--color-bg)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '42rem', margin: '0 auto', padding: '3rem 1.5rem 6rem' }}>
          <h1
            className="text-3xl font-normal mb-10 text-center"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-text)' }}
          >
            Mis pedidos
          </h1>

          {loading ? (
            <p className="text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>
          ) : orders.length === 0 ? (
            <p className="text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Todavía no hiciste ningún pedido.
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {orders.map((order) => (
                <div key={order.id} className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                  <div
                    className="px-6 py-4 flex items-center justify-between"
                    style={{ backgroundColor: 'var(--color-surface-2)' }}
                  >
                    <div>
                      <p className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                        Pedido
                      </p>
                      <p className="text-lg font-bold mt-0.5" style={{ color: 'var(--color-text)', fontFamily: 'monospace' }}>
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

                  <div style={{ backgroundColor: 'var(--color-surface)' }}>
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

                  <div className="px-6 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {fmtDate(order.created_at)}
                    </span>
                    <Link
                      to={`/track-order?n=${order.order_number}`}
                      className="text-xs font-semibold"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      Ver detalle →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
