import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PageSEO from '../components/SEO'

const API_BASE = import.meta.env.VITE_API_URL || ''

const fmt = (value) => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
}).format(Number(value || 0))

const date = (value) => new Date(value).toLocaleDateString('es-AR', {
  day: 'numeric', month: 'long', year: 'numeric',
})

const paidLabel = (status) => ['paid', 'preparing', 'shipped', 'delivered'].includes(status) ? 'Pagada' : 'Pendiente'
const fulfillmentLabel = (status) => ({
  delivered: 'Concluida', shipped: 'En camino', preparing: 'En preparación',
  cancelled: 'Cancelada', payment_failed: 'Pago rechazado', expired: 'Vencida',
}[status] || 'Pendiente')

export default function Account() {
  const { user, updateProfile, resendVerificationEmail, logout } = useAuth()
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [verificationStatus, setVerificationStatus] = useState('')
  const [formData, setFormData] = useState({
    firstName: user.firstName || '', lastName: user.lastName || '', phone: user.phone || '',
    address: user.address || '', city: user.city || '', postalCode: user.postalCode || '',
  })

  useEffect(() => {
    fetch(`${API_BASE}/api/orders/mine`, { credentials: 'include' })
      .then((response) => response.ok ? response.json() : [])
      .then(setOrders)
      .finally(() => setOrdersLoading(false))
  }, [])

  async function signOut() {
    await logout()
    navigate('/', { replace: true })
  }

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      await updateProfile(formData)
      setMessage('Datos guardados.')
      setEditing(false)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function resendVerification() {
    setVerificationStatus('Enviando…')
    try {
      await resendVerificationEmail()
      setVerificationStatus('Te enviamos un nuevo enlace de verificación.')
    } catch (error) {
      setVerificationStatus(error.message)
    }
  }

  return (
    <>
      <PageSEO title="Mi cuenta" description="Gestioná tus datos y pedidos en Fénix Iluminación." url="/account" />
      <main className="fnx-account-page">
        <header className="fnx-account-head">
          <h1>Mi cuenta</h1>
          <button type="button" onClick={signOut}>Cerrar sesión →</button>
        </header>

        {!user.emailVerified && (
          <div className="fnx-account-verification">
            <span>Confirmá que <strong>{user.email}</strong> es tuyo para poder publicar reseñas.</span>
            <button type="button" onClick={resendVerification}>Reenviar verificación</button>
            {verificationStatus && <small>{verificationStatus}</small>}
          </div>
        )}

        <div className="fnx-account-layout">
          <section className="fnx-account-orders">
            <h2>Historial de pedidos</h2>
            <i />
            {ordersLoading ? (
              <p className="fnx-account-empty">Cargando pedidos…</p>
            ) : orders.length === 0 ? (
              <p className="fnx-account-empty">Todavía no hiciste ningún pedido.</p>
            ) : (
              <div className="fnx-account-orders-table">
                <div className="head"><b>Pedido</b><b>Fecha</b><b>Estado del pago</b><b>Finalización</b><b>Total</b></div>
                {orders.map((order) => (
                  <div className="row" key={order.id}>
                    <Link to={`/orders/${order.id}`}>#{order.order_number}</Link>
                    <span>{date(order.created_at)}</span>
                    <span>{paidLabel(order.status)}</span>
                    <span>{fulfillmentLabel(order.status)}</span>
                    <strong>{fmt(order.total_amount)}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside className="fnx-account-details">
            <h2>Detalles de la cuenta</h2>
            <i />
            <strong>{user.firstName} {user.lastName}</strong>
            {user.address && <span>{user.address}</span>}
            {user.city && <span>{user.city}</span>}
            {user.postalCode && <span>{user.postalCode}</span>}
            <span>Argentina</span>
            {user.phone && <span>{user.phone}</span>}
            <span>{user.email}</span>
            <button type="button" onClick={() => setEditing((value) => !value)}>Editar datos →</button>
            <Link to="/favorites">Ver favoritos →</Link>
            {message && <small>{message}</small>}
          </aside>
        </div>

        {editing && (
          <section className="fnx-account-edit">
            <h2>Editar datos</h2>
            <form onSubmit={save}>
              <input value={formData.firstName} onChange={(event) => setFormData({ ...formData, firstName: event.target.value })} placeholder="Nombre" />
              <input value={formData.lastName} onChange={(event) => setFormData({ ...formData, lastName: event.target.value })} placeholder="Apellido" />
              <input value={formData.phone} onChange={(event) => setFormData({ ...formData, phone: event.target.value })} placeholder="Teléfono" />
              <input className="wide" value={formData.address} onChange={(event) => setFormData({ ...formData, address: event.target.value })} placeholder="Dirección" />
              <input value={formData.city} onChange={(event) => setFormData({ ...formData, city: event.target.value })} placeholder="Ciudad" />
              <input value={formData.postalCode} onChange={(event) => setFormData({ ...formData, postalCode: event.target.value })} placeholder="Código postal" />
              <div className="wide actions"><button type="button" onClick={() => setEditing(false)}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button></div>
            </form>
          </section>
        )}
      </main>
    </>
  )
}
