import { useState, Fragment, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import PageSEO from '../components/SEO'
import { getShippingForCP, SHIPPING_ZONES } from '../config/shipping'

const API_BASE = import.meta.env.VITE_API_URL || ''

const fmt = (n) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })

function tomorrowISO() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

// ─── Validation ───────────────────────────────────────────────────────────────
function validateStep1(d) {
  const e = {}
  if (!d.nombre.trim())               e.nombre    = 'El nombre es requerido'
  else if (d.nombre.trim().length < 2) e.nombre   = 'Mínimo 2 caracteres'
  if (!d.apellido.trim())              e.apellido = 'El apellido es requerido'
  else if (d.apellido.trim().length < 2) e.apellido = 'Mínimo 2 caracteres'
  if (!d.email.trim())                 e.email    = 'El email es requerido'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) e.email = 'Formato de email inválido'
  if (!d.telefono.trim())              e.telefono = 'El teléfono es requerido'
  else if (d.telefono.replace(/\D/g, '').length < 8) e.telefono = 'Mínimo 8 dígitos'
  return e
}

function validateStep2(d, shippingZone) {
  const e = {}
  if (d.deliveryType === 'delivery') {
    if (!d.direccion.trim())    e.direccion    = 'La dirección es requerida'
    if (!d.ciudad.trim())       e.ciudad       = 'La ciudad es requerida'
    if (!d.codigoPostal.trim()) e.codigoPostal = 'El código postal es requerido'
    else if (!shippingZone || shippingZone.price === null) {
      e.codigoPostal = 'No pudimos calcular el envío para esta zona — escribinos por WhatsApp'
    }
  }
  if (d.deliveryType === 'pickup' && !d.pickupDate) {
    e.pickupDate = 'Elegí una fecha de retiro'
  }
  return e
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function Checkout() {
  const navigate = useNavigate()
  const { items, totalPrice, clearCart } = useCart()
  const { user, authLoading } = useAuth()
  const [step, setStep]             = useState(1)
  const [errors, setErrors]         = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const [formData, setFormData] = useState({
    nombre:       user?.firstName  || '',
    apellido:     user?.lastName   || '',
    email:        user?.email      || '',
    telefono:     user?.phone      || '',
    deliveryType: 'pickup',
    paymentMethod: 'mercadopago',
    pickupDate:   '',
    direccion:    user?.address    || '',
    ciudad:       user?.city       || '',
    codigoPostal: user?.postalCode || '',
  })

  const [deliveryEstimate, setDeliveryEstimate] = useState(null)
  const [deliveryEstimateLoading, setDeliveryEstimateLoading] = useState(false)

  // Si el usuario entra directo a /checkout, el estado de sesión puede
  // resolverse recién después del primer render. Cuando termine de cargar
  // y haya un usuario, completamos los campos que sigan vacíos (sin pisar
  // nada que ya haya escrito).
  useEffect(() => {
    if (authLoading || !user) return
    setFormData((prev) => ({
      ...prev,
      nombre:       prev.nombre       || user.firstName  || '',
      apellido:     prev.apellido     || user.lastName   || '',
      email:        prev.email        || user.email      || '',
      telefono:     prev.telefono     || user.phone      || '',
      direccion:    prev.direccion    || user.address    || '',
      ciudad:       prev.ciudad       || user.city       || '',
      codigoPostal: prev.codigoPostal || user.postalCode || '',
    }))
  }, [authLoading, user])

  const shippingZone = useMemo(() => {
    if (formData.deliveryType !== 'delivery') return null
    return getShippingForCP(formData.codigoPostal)
  }, [formData.deliveryType, formData.codigoPostal])

  const shippingCost = shippingZone?.price ?? null
  const orderTotal   = shippingCost != null ? totalPrice + shippingCost : totalPrice

  // Estimación de entrega (Correo Argentino + margen de stock) — solo tiene
  // sentido pedirla cuando la zona ya resolvió a un costo concreto.
  useEffect(() => {
    if (formData.deliveryType !== 'delivery' || shippingCost == null) {
      setDeliveryEstimate(null)
      return undefined
    }
    const cp = formData.codigoPostal.trim()
    if (cp.length < 4) { setDeliveryEstimate(null); return undefined }

    setDeliveryEstimateLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/shipping/estimate?postalCode=${encodeURIComponent(cp)}`)
        if (!res.ok) { setDeliveryEstimate(null); return }
        setDeliveryEstimate(await res.json())
      } catch {
        setDeliveryEstimate(null)
      } finally {
        setDeliveryEstimateLoading(false)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [formData.deliveryType, formData.codigoPostal, shippingCost])

  function setField(key, value) {
    setFormData((prev) => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors((prev) => { const e = { ...prev }; delete e[key]; return e })
  }

  function handleStep1() {
    const e = validateStep1(formData)
    if (Object.keys(e).length) { setErrors(e); return }
    setErrors({})
    setStep(2)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleStep2() {
    const e = validateStep2(formData, shippingZone)
    if (Object.keys(e).length) { setErrors(e); return }
    setErrors({})
    setStep(3)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleConfirm() {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer: formData, items }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Error al crear el pedido')
      }
      const { orderId, checkoutUrl } = await res.json()
      clearCart()
      if (checkoutUrl) {
        sessionStorage.setItem('fenix_pending_order_id', orderId)
        window.location.href = checkoutUrl
      } else {
        // Pago en el local: no hay redirección a Mercado Pago, el pedido ya
        // quedó reservado.
        navigate(`/order-confirmation?orderId=${orderId}&status=success`)
      }
    } catch (err) {
      setSubmitError(err.message || 'No pudimos procesar tu pedido. Intentá de nuevo.')
      setSubmitting(false)
    }
  }

  if (items.length === 0 && step < 3) {
    return (
      <div
        style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', backgroundColor: 'var(--color-bg)' }}
      >
        <p style={{ color: 'var(--color-text-muted)' }}>Tu carrito está vacío.</p>
        <button
          onClick={() => navigate('/products')}
          style={{ backgroundColor: 'var(--color-primary)', color: '#fff', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
        >
          Ver productos
        </button>
      </div>
    )
  }

  return (
    <>
    <PageSEO title="Finalizar compra" description="Completá tu pedido en Fénix Iluminación. Pagá con MercadoPago o coordiná por WhatsApp." url="/checkout" />
    <div style={{ backgroundColor: 'var(--color-bg)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '42rem', margin: '0 auto', padding: '3rem 1.5rem 6rem' }}>

        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            color: 'var(--color-text)',
            fontSize: '2.25rem',
            fontWeight: 400,
            letterSpacing: '-0.01em',
            textAlign: 'center',
            marginBottom: '2.5rem',
          }}
        >
          Finalizar compra
        </h1>

        <Stepper current={step} />

        {/* ── Step 1: Datos personales ── */}
        {step === 1 && (
          <StepPanel title="Datos personales">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Nombre" error={errors.nombre}>
                <DarkInput placeholder="Juan" value={formData.nombre} onChange={(v) => setField('nombre', v)} hasError={!!errors.nombre} />
              </Field>
              <Field label="Apellido" error={errors.apellido}>
                <DarkInput placeholder="Pérez" value={formData.apellido} onChange={(v) => setField('apellido', v)} hasError={!!errors.apellido} />
              </Field>
              <Field label="Email" error={errors.email} className="sm:col-span-2">
                <DarkInput type="email" placeholder="juan@email.com" value={formData.email} onChange={(v) => setField('email', v)} hasError={!!errors.email} />
              </Field>
              <Field label="Teléfono" error={errors.telefono} className="sm:col-span-2">
                <DarkInput type="tel" placeholder="11-1234-5678" value={formData.telefono} onChange={(v) => setField('telefono', v)} hasError={!!errors.telefono} />
              </Field>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem' }}>
              <PrimaryBtn onClick={handleStep1}>Continuar <ArrowRightIcon /></PrimaryBtn>
            </div>
          </StepPanel>
        )}

        {/* ── Step 2: Entrega ── */}
        {step === 2 && (
          <StepPanel title="Modalidad de entrega">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.75rem' }}>
              {[
                { value: 'pickup',   label: 'Retiro en local',    desc: 'Sin costo' },
                { value: 'delivery', label: 'Envío a domicilio',  desc: 'Costo a confirmar' },
              ].map((opt) => {
                const active = formData.deliveryType === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => setField('deliveryType', opt.value)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.75rem',
                      padding: '1rem',
                      borderRadius: '0.75rem',
                      textAlign: 'left',
                      backgroundColor: active ? 'rgba(204,0,0,0.06)' : 'var(--color-surface-2)',
                      border: `1.5px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      transition: 'border-color 150ms ease, background-color 150ms ease',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        marginTop: '0.125rem',
                        width: '1rem',
                        height: '1rem',
                        borderRadius: '50%',
                        border: `1.5px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {active && (
                        <div style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', backgroundColor: 'var(--color-primary)' }} />
                      )}
                    </div>
                    <div>
                      <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: '0.125rem' }}>
                        {opt.label}
                      </p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        {opt.desc}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>

            {formData.deliveryType === 'pickup' && (
              <>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    padding: '1rem',
                    borderRadius: '0.75rem',
                    backgroundColor: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    marginBottom: '1.5rem',
                  }}
                >
                  <MapPinIcon />
                  <div>
                    <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)' }}>
                      473 entre 14C y 15, City Bell, La Plata
                    </p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>
                      Lunes a Viernes 8:30–18 hs · Sábados 8:30–13 hs
                    </p>
                  </div>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <label
                    style={{
                      display: 'block', fontSize: '0.68rem', fontWeight: 600,
                      letterSpacing: '0.1em', textTransform: 'uppercase',
                      color: 'var(--color-text-muted)', marginBottom: '0.5rem',
                    }}
                  >
                    ¿Cómo pagás la reserva?
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    {[
                      { value: 'mercadopago',  label: 'Pagar ahora online' },
                      { value: 'pay_in_store', label: 'Pagar en el local' },
                    ].map((opt) => {
                      const active = formData.paymentMethod === opt.value
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setField('paymentMethod', opt.value)}
                          style={{
                            padding: '0.75rem 1rem',
                            borderRadius: '0.625rem',
                            textAlign: 'left',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
                            backgroundColor: active ? 'rgba(204,0,0,0.06)' : 'var(--color-surface-2)',
                            border: `1.5px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            cursor: 'pointer',
                            transition: 'border-color 150ms ease, background-color 150ms ease',
                          }}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <Field label="Fecha de retiro" error={errors.pickupDate}>
                    <DarkInput
                      type="date"
                      value={formData.pickupDate}
                      onChange={(v) => setField('pickupDate', v)}
                      hasError={!!errors.pickupDate}
                      min={tomorrowISO()}
                    />
                  </Field>
                </div>
              </>
            )}

            {formData.deliveryType === 'delivery' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.5rem' }}>
                <Field label="Dirección" error={errors.direccion}>
                  <DarkInput placeholder="Av. Siempreviva 742" value={formData.direccion} onChange={(v) => setField('direccion', v)} hasError={!!errors.direccion} />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                  <Field label="Ciudad" error={errors.ciudad}>
                    <DarkInput placeholder="La Plata" value={formData.ciudad} onChange={(v) => setField('ciudad', v)} hasError={!!errors.ciudad} />
                  </Field>
                  <Field label="Código postal" error={errors.codigoPostal}>
                    <DarkInput placeholder="1900" value={formData.codigoPostal} onChange={(v) => setField('codigoPostal', v)} hasError={!!errors.codigoPostal} />
                  </Field>
                </div>

                {/* Costo de envío calculado */}
                {formData.codigoPostal.trim().length >= 4 && shippingZone && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px', borderRadius: 8,
                    backgroundColor: shippingZone.price === null
                      ? 'rgba(224,162,74,0.08)'
                      : shippingZone.price === 0
                        ? 'rgba(22,101,52,0.06)'
                        : 'var(--color-surface-2)',
                    border: `1px solid ${shippingZone.price === null ? 'rgba(224,162,74,0.3)' : 'var(--color-border)'}`,
                  }}>
                    <div>
                      <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
                        {shippingZone.label}
                      </p>
                      <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
                        {shippingZone.description}
                      </p>
                    </div>
                    <span style={{
                      fontFamily: "'Inter', system-ui, sans-serif",
                      fontSize: '0.9rem', fontWeight: 700,
                      color: shippingZone.price === null
                        ? '#9A6C00'
                        : shippingZone.price === 0
                          ? '#166534'
                          : 'var(--color-text)',
                      whiteSpace: 'nowrap',
                    }}>
                      {shippingZone.price === null
                        ? 'A coordinar'
                        : shippingZone.price === 0
                          ? 'Gratis'
                          : fmt(shippingZone.price)}
                    </span>
                  </div>
                )}

                {shippingZone && shippingZone.price !== null && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    {deliveryEstimateLoading
                      ? 'Calculando fecha estimada de entrega...'
                      : deliveryEstimate
                        ? `Entrega estimada: ${fmtDate(deliveryEstimate.estimatedDeliveryDate)} (incluye margen por disponibilidad de stock)`
                        : null}
                  </p>
                )}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2rem' }}>
              <GhostBtn onClick={() => setStep(1)}><ArrowLeftIcon /> Volver</GhostBtn>
              <PrimaryBtn onClick={handleStep2}>Continuar <ArrowRightIcon /></PrimaryBtn>
            </div>
          </StepPanel>
        )}

        {/* ── Step 3: Pago ── */}
        {step === 3 && (
          <StepPanel title="Revisión y confirmación">
            {/* Delivery summary */}
            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                padding: '1rem',
                borderRadius: '0.75rem',
                backgroundColor: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                marginBottom: '1.75rem',
              }}
            >
              <MapPinIcon />
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)' }}>
                  {formData.deliveryType === 'pickup'
                    ? 'Retiro en local — 473 entre 14C y 15, City Bell'
                    : `Envío a ${formData.direccion}, ${formData.ciudad} (CP ${formData.codigoPostal})`}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>
                  {formData.nombre} {formData.apellido} · {formData.telefono}
                </p>
                {formData.deliveryType === 'pickup' && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>
                    {formData.paymentMethod === 'pay_in_store' ? 'Pagás en el local' : 'Pago online'}
                    {formData.pickupDate ? ` · Retirás el ${fmtDate(formData.pickupDate)}` : ''}
                  </p>
                )}
                {formData.deliveryType === 'delivery' && deliveryEstimate && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>
                    Entrega estimada: {fmtDate(deliveryEstimate.estimatedDeliveryDate)}
                  </p>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
              <GhostBtn onClick={() => setStep(2)} disabled={submitting}>
                <ArrowLeftIcon /> Volver
              </GhostBtn>

              {(() => {
                const payInStore = formData.deliveryType === 'pickup' && formData.paymentMethod === 'pay_in_store'
                return (
                  <button
                    onClick={handleConfirm}
                    disabled={submitting}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.625rem',
                      padding: '1rem 1.5rem',
                      borderRadius: '0.75rem',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      letterSpacing: '0.02em',
                      backgroundColor: submitting ? 'var(--color-text-muted)' : payInStore ? 'var(--color-primary)' : '#009EE3',
                      color: '#fff',
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      transition: 'background-color 150ms ease',
                    }}
                    onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.backgroundColor = payInStore ? 'var(--color-primary-hover)' : '#0082BB' }}
                    onMouseLeave={(e) => { if (!submitting) e.currentTarget.style.backgroundColor = payInStore ? 'var(--color-primary)' : '#009EE3' }}
                  >
                    {!payInStore && <MpIcon />}
                    {submitting ? 'Procesando...' : payInStore ? 'Confirmar reserva' : 'Pagar con MercadoPago'}
                  </button>
                )
              })()}
            </div>

            {submitError && (
              <p style={{ fontSize: '0.875rem', textAlign: 'center', color: 'var(--color-primary)' }}>
                {submitError}
              </p>
            )}
          </StepPanel>
        )}

        {/* ── Resumen del pedido (todos los steps) ── */}
        <OrderSummary items={items} totalPrice={totalPrice} deliveryType={formData.deliveryType} shippingZone={shippingZone} shippingCost={shippingCost} orderTotal={orderTotal} />

      </div>
    </div>
    </>
  )
}

// ─── Order Summary ─────────────────────────────────────────────────────────────
function OrderSummary({ items, totalPrice, deliveryType, shippingZone, shippingCost, orderTotal }) {
  return (
    <div
      style={{
        marginTop: '1.25rem',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: '1rem',
        overflow: 'hidden',
        boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
      }}
    >
      <div
        style={{
          padding: '0.75rem 1.5rem',
          backgroundColor: 'var(--color-surface-2)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: '0.68rem',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--color-text-muted)',
          }}
        >
          Tu pedido
        </span>
        <span
          style={{
            fontSize: '0.68rem',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--color-text-muted)',
          }}
        >
          {items.reduce((s, i) => s + i.quantity, 0)} {items.reduce((s, i) => s + i.quantity, 0) === 1 ? 'producto' : 'productos'}
        </span>
      </div>

      <ul>
        {items.map((item) => (
          <li
            key={`${item.id}-${item.color ?? 'default'}-${item.size ?? 'default'}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              padding: '0.875rem 1.5rem',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <img
              src={item.image}
              alt={item.name}
              style={{
                width: '3rem',
                height: '3rem',
                borderRadius: '0.5rem',
                objectFit: 'cover',
                flexShrink: 0,
                backgroundColor: 'var(--color-surface-2)',
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'var(--color-text)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.name}
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>
                {item.quantity} × {fmt(item.price)}{item.color ? ` · ${item.color}` : ''}{item.size ? ` · ${item.size}` : ''}
              </p>
            </div>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)', flexShrink: 0 }}>
              {fmt(item.price * item.quantity)}
            </p>
          </li>
        ))}
      </ul>

      <div style={{ padding: '0 1.5rem', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
          <span>Subtotal</span>
          <span>{fmt(totalPrice)}</span>
        </div>
        {deliveryType === 'delivery' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            <span>Envío{shippingZone ? ` · ${shippingZone.label}` : ''}</span>
            <span style={{ color: shippingCost === 0 ? '#166534' : 'var(--color-text-muted)', fontWeight: shippingCost === 0 ? 600 : 400 }}>
              {shippingCost === null
                ? 'A confirmar'
                : shippingCost === 0
                  ? 'Gratis'
                  : fmt(shippingCost)}
            </span>
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1rem 1.5rem',
        }}
      >
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>Total</span>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
          {fmt(orderTotal)}
        </span>
      </div>
    </div>
  )
}

// ─── Stepper ───────────────────────────────────────────────────────────────────
function Stepper({ current }) {
  const steps = [
    { num: 1, label: 'Datos' },
    { num: 2, label: 'Entrega' },
    { num: 3, label: 'Pago' },
  ]

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%', maxWidth: '18rem', margin: '0 auto 3rem' }}>
      {steps.map((s, i) => {
        const done   = s.num < current
        const active = s.num === current
        return (
          <Fragment key={s.num}>
            {i > 0 && (
              <div
                style={{
                  flex: 1,
                  height: '1px',
                  marginTop: '1.125rem',
                  marginLeft: '0.25rem',
                  marginRight: '0.25rem',
                  backgroundColor: done ? 'var(--color-primary)' : 'var(--color-border)',
                  transition: 'background-color 500ms ease',
                }}
              />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
              <div
                style={{
                  width: '2.25rem',
                  height: '2.25rem',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  backgroundColor: done || active ? 'var(--color-primary)' : 'var(--color-surface-2)',
                  border: done || active ? 'none' : '1.5px solid var(--color-border)',
                  color: done || active ? '#fff' : 'var(--color-text-muted)',
                  transition: 'all 300ms ease',
                }}
              >
                {done ? <CheckSmall /> : s.num}
              </div>
              <span
                style={{
                  fontSize: '0.6875rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 500,
                  color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
                }}
              >
                {s.label}
              </span>
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function StepPanel({ title, children }) {
  return (
    <div
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: '1rem',
        padding: '2rem 2.25rem',
        boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '1.35rem',
          fontWeight: 400,
          color: 'var(--color-text)',
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: '1rem',
          marginBottom: '1.75rem',
          letterSpacing: '0.01em',
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  )
}

function Field({ label, error, className = '', children }) {
  return (
    <div className={className}>
      <label
        style={{
          display: 'block',
          fontSize: '0.68rem',
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--color-text-muted)',
          marginBottom: '0.5rem',
        }}
      >
        {label}
      </label>
      {children}
      {error && (
        <p style={{ fontSize: '0.75rem', marginTop: '0.375rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {error}
        </p>
      )}
    </div>
  )
}

function DarkInput({ type = 'text', placeholder, value, onChange, hasError, min }) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      min={min}
      className="dark-input"
      style={{
        width: '100%',
        padding: '0.75rem 1rem',
        borderRadius: '0.625rem',
        fontSize: '0.9rem',
        outline: 'none',
        backgroundColor: 'var(--color-surface-2)',
        border: `1.5px solid ${hasError ? 'var(--color-primary)' : 'var(--color-border)'}`,
        color: 'var(--color-text)',
        transition: 'border-color 150ms ease',
      }}
      onFocus={(e) => { if (!hasError) e.currentTarget.style.borderColor = 'var(--color-primary)' }}
      onBlur={(e)  => { if (!hasError) e.currentTarget.style.borderColor = 'var(--color-border)' }}
    />
  )
}

function PrimaryBtn({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.75rem 1.75rem',
        borderRadius: '0.75rem',
        fontSize: '0.875rem',
        fontWeight: 600,
        backgroundColor: 'var(--color-primary)',
        color: '#fff',
        transition: 'background-color 150ms ease',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
    >
      {children}
    </button>
  )
}

function GhostBtn({ onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.75rem 1.25rem',
        borderRadius: '0.75rem',
        fontSize: '0.875rem',
        fontWeight: 500,
        color: 'var(--color-text-muted)',
        border: '1.5px solid var(--color-border)',
        backgroundColor: 'transparent',
        transition: 'color 150ms ease, border-color 150ms ease',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.color = 'var(--color-text)'
          e.currentTarget.style.borderColor = 'var(--color-text-muted)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--color-text-muted)'
        e.currentTarget.style.borderColor = 'var(--color-border)'
      }}
    >
      {children}
    </button>
  )
}

// ─── Icons ─────────────────────────────────────────────────────────────────────
function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  )
}

function ArrowLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

function CheckSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function MapPinIcon() {
  return (
    <svg
      style={{ flexShrink: 0, marginTop: '0.125rem', color: 'var(--color-primary)' }}
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function MpIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="24" fill="#fff" fillOpacity="0.2"/>
      <path d="M8 24C8 15.163 15.163 8 24 8s16 7.163 16 16-7.163 16-16 16S8 32.837 8 24z" fill="#fff" fillOpacity="0.15"/>
      <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="bold" fontFamily="Arial,sans-serif">MP</text>
    </svg>
  )
}
