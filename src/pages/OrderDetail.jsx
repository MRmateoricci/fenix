import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PageSEO from '../components/SEO'

const API_BASE = import.meta.env.VITE_API_URL || ''
const fmt = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(value || 0))
const fmtDateTime = (value) => new Date(value).toLocaleString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const statusLabel = (status) => ({
  pending_payment: 'Pago pendiente', reserved: 'Reservado', paid: 'Pagada', preparing: 'En preparación',
  shipped: 'En camino', delivered: 'Concluida', cancelled: 'Cancelada', payment_failed: 'Pago rechazado', expired: 'Vencida',
}[status] || status)

function Address({ order, billing = false }) {
  const address = billing ? order.billing_address : order.address
  const extra = billing ? order.billing_address_extra : order.address_extra
  const city = billing ? order.billing_city : order.city
  const province = billing ? order.billing_province : order.province
  const postalCode = billing ? order.billing_postal_code : order.postal_code
  return (
    <div className="fnx-order-address">
      <strong>{order.customer_name} {order.customer_dni || ''}</strong>
      {address && <span>{address}{extra ? `, ${extra}` : ''}</span>}
      {city && <span>{city}</span>}
      {province && <span>{province}</span>}
      {postalCode && <span>{postalCode}</span>}
      <span>Argentina</span>
      {order.customer_phone && <span>{order.customer_phone}</span>}
    </div>
  )
}

export default function OrderDetail() {
  const { id } = useParams()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${API_BASE}/api/orders/mine/${id}`, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'No pudimos cargar el pedido')
        return data
      })
      .then(setOrder)
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [id])

  const productsSubtotal = useMemo(() => (order?.items || []).reduce((sum, item) => sum + Number(item.subtotal ?? item.price * item.quantity), 0), [order])

  if (loading) return <main className="fnx-order-detail-page"><p>Cargando pedido…</p></main>
  if (error || !order) return <main className="fnx-order-detail-page"><p>{error || 'Pedido no encontrado'}</p><Link to="/account">← Volver a mi cuenta</Link></main>

  return (
    <>
      <PageSEO title={`Pedido ${order.order_number}`} description="Detalle de tu pedido en Fénix Iluminación." url={`/orders/${order.id}`} />
      <main className="fnx-order-detail-page">
        <header><h1>Mi cuenta</h1></header>
        <div className="fnx-order-detail-layout">
          <section className="fnx-order-main">
            <h2>Pedido #{order.order_number}</h2><i />
            <p className="date">{fmtDateTime(order.created_at)}</p>
            <div className="fnx-order-products">
              <div className="head"><b>Producto</b><b>Precio</b><b>Cantidad</b><b>Total</b></div>
              {order.items.map((item, index) => (
                <div className="row" key={`${item.id}-${index}`}>
                  <div>{item.image && <img src={item.image} alt="" />}<span><strong>{item.name}</strong><small>{item.color || item.category || ''}{item.size ? ` · ${item.size}` : ''}</small></span></div>
                  <span>{fmt(item.price)}</span>
                  <span>{item.quantity}</span>
                  <strong>{fmt(item.subtotal ?? item.price * item.quantity)}</strong>
                </div>
              ))}
            </div>
            <div className="fnx-order-totals">
              <div><span>Subtotal</span><strong>{fmt(productsSubtotal)}</strong></div>
              <div><span>{order.delivery_type === 'pickup' ? 'Retiro en el local' : `Envío${order.shipping_service ? ` · ${order.shipping_service}` : ''}`}</span><strong>{Number(order.shipping_cost) ? fmt(order.shipping_cost) : 'Gratis'}</strong></div>
              <div className="total"><span>Total</span><strong>{fmt(order.total_amount)}</strong></div>
            </div>
            <Link className="fnx-order-back" to="/account">← Volver a detalles de la cuenta</Link>
          </section>

          <aside className="fnx-order-side">
            <section><h2>Dirección de facturación</h2><i /><Address order={order} billing /><p>Estado del pago: <b>{['paid','preparing','shipped','delivered'].includes(order.status) ? 'Pagada' : statusLabel(order.status)}</b></p></section>
            <section><h2>{order.delivery_type === 'pickup' ? 'Retiro' : 'Dirección de envío'}</h2><i />{order.delivery_type === 'pickup' ? <div className="fnx-order-address"><strong>Fénix City Bell</strong><span>473 entre 14C y 15, City Bell</span>{order.pickup_date && <span>Retiro: {new Date(order.pickup_date).toLocaleDateString('es-AR')}</span>}</div> : <Address order={order} />}<p>Estado de finalización: <b>{statusLabel(order.status)}</b></p></section>
          </aside>
        </div>
      </main>
    </>
  )
}
