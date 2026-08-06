import { useState, Fragment, useMemo, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import PageSEO from '../components/SEO'
import { getShippingForCP, SHIPPING_SERVICES } from '../config/shipping'
import mercadoPagoLogo from '../assets/mercado-pago-horizontal.svg'
import { POLICIES } from './Policy'

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
  if (!/^\d{7,8}$/.test(d.dni)) e.dni = 'Ingresá un DNI válido (7 u 8 números)'
  return e
}

function validateStep2(d, shippingZone) {
  const e = {}
  if (d.deliveryType === 'delivery') {
    if (!d.direccion.trim())    e.direccion    = 'La dirección es requerida'
    if (!d.ciudad.trim())       e.ciudad       = 'La ciudad es requerida'
    if (!d.provincia.trim())    e.provincia    = 'La provincia es requerida'
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

function validateBilling(d) {
  if (d.deliveryType === 'delivery' && d.billingSameAsShipping) return {}
  const e = {}
  if (!d.billingAddress.trim()) e.billingAddress = 'La dirección de facturación es requerida'
  if (!d.billingCity.trim()) e.billingCity = 'La ciudad es requerida'
  if (!d.billingPostalCode.trim()) e.billingPostalCode = 'El código postal es requerido'
  if (!d.billingProvince.trim()) e.billingProvince = 'La provincia es requerida'
  return e
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function Checkout() {
  const navigate = useNavigate()
  const { items, totalPrice, clearCart, dni, setDni } = useCart()
  const { user, authLoading, updateProfile, logout } = useAuth()
  const [step, setStep]             = useState(1)
  const [errors, setErrors]         = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState(null)
  const [authResolved, setAuthResolved] = useState(false)
  const [emailChecking, setEmailChecking] = useState(false)
  const [accountLoginRequired, setAccountLoginRequired] = useState(false)

  const [formData, setFormData] = useState({
    nombre:       user?.firstName  || '',
    apellido:     user?.lastName   || '',
    email:        user?.email      || '',
    telefono:     user?.phone      || '',
    dni,
    deliveryType: 'delivery',
    paymentMethod: 'mercadopago',
    shippingService: 'clasico',
    pickupDate:   '',
    direccion:    user?.address    || '',
    piso:          '',
    ciudad:       user?.city       || '',
    codigoPostal: user?.postalCode || '',
    provincia:    'Buenos Aires',
    billingSameAsShipping: true,
    billingAddress: '',
    billingAddressExtra: '',
    billingCity: '',
    billingPostalCode: '',
    billingProvince: 'Buenos Aires',
  })

  const [deliveryEstimate, setDeliveryEstimate] = useState(null)
  const [deliveryEstimateLoading, setDeliveryEstimateLoading] = useState(false)

  // Si el usuario entra directo a /checkout, el estado de sesión puede
  // resolverse recién después del primer render. Cuando termine de cargar
  // y haya un usuario, completamos los campos que sigan vacíos (sin pisar
  // nada que ya haya escrito).
  useEffect(() => {
    if (authLoading || !user) return
    let savedDraft = null
    try {
      const stored = sessionStorage.getItem('fenix_checkout_draft')
      savedDraft = stored ? JSON.parse(stored) : null
      if (stored) sessionStorage.removeItem('fenix_checkout_draft')
    } catch { /* ignore invalid drafts */ }
    setFormData((prev) => ({
      ...prev,
      ...(savedDraft || {}),
      nombre:       savedDraft?.nombre       || prev.nombre       || user.firstName  || '',
      apellido:     savedDraft?.apellido     || prev.apellido     || user.lastName   || '',
      email:        user.email || '',
      telefono:     savedDraft?.telefono     || prev.telefono     || user.phone      || '',
      direccion:    savedDraft?.direccion    || prev.direccion    || user.address    || '',
      ciudad:       savedDraft?.ciudad       || prev.ciudad       || user.city       || '',
      codigoPostal: savedDraft?.codigoPostal || prev.codigoPostal || user.postalCode || '',
    }))
  }, [authLoading, user])

  const missingAccountFields = {
    nombre:   !!user && !user.firstName?.trim(),
    apellido: !!user && !user.lastName?.trim(),
    telefono: !!user && !user.phone?.trim(),
  }
  const needsPersonalData = !user || Object.values(missingAccountFields).some(Boolean) || !/^\d{7,8}$/.test(formData.dni)

  useEffect(() => {
    if (authLoading || authResolved) return
    setAuthResolved(true)
    if (user && !needsPersonalData) setStep(2)
  }, [authLoading, authResolved, user, needsPersonalData])

  const localShippingZone = useMemo(() => {
    if (formData.deliveryType !== 'delivery') return null
    return getShippingForCP(formData.codigoPostal, formData.shippingService)
  }, [formData.deliveryType, formData.codigoPostal, formData.shippingService])

  const normalizedPostalCode = formData.codigoPostal.trim().replace(/\s/g, '').toUpperCase()
  const deliveryEstimateMatches =
    deliveryEstimate?.postalCode === normalizedPostalCode &&
    deliveryEstimate?.service === formData.shippingService
  const shippingZone = deliveryEstimateMatches
    ? {
        id: deliveryEstimate.zone.id,
        label: deliveryEstimate.zone.label,
        description: deliveryEstimate.zone.description,
        service: deliveryEstimate.service,
        price: deliveryEstimate.zone.cost,
      }
    : localShippingZone
  const shippingCost = shippingZone?.price ?? null
  const orderTotal   = shippingCost != null ? totalPrice + shippingCost : totalPrice

  // Estimación de entrega (Correo Argentino + margen de stock) — solo tiene
  // sentido pedirla cuando la zona ya resolvió a un costo concreto.
  useEffect(() => {
    if (formData.deliveryType !== 'delivery') {
      setDeliveryEstimate(null)
      setDeliveryEstimateLoading(false)
      return undefined
    }
    const cp = formData.codigoPostal.trim()
    if (cp.length < 4) {
      setDeliveryEstimate(null)
      setDeliveryEstimateLoading(false)
      return undefined
    }

    setDeliveryEstimate(null)
    setDeliveryEstimateLoading(true)
    const controller = new AbortController()
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          postalCode: cp,
          service: formData.shippingService,
        })
        const res = await fetch(`${API_BASE}/api/shipping/estimate?${params}`, {
          signal: controller.signal,
        })
        if (!res.ok) { setDeliveryEstimate(null); return }
        setDeliveryEstimate(await res.json())
      } catch (err) {
        if (err.name !== 'AbortError') setDeliveryEstimate(null)
      } finally {
        if (!controller.signal.aborted) setDeliveryEstimateLoading(false)
      }
    }, 400)
    return () => {
      clearTimeout(t)
      controller.abort()
    }
  }, [formData.deliveryType, formData.codigoPostal, formData.shippingService])

  function setField(key, value) {
    const normalizedValue = key === 'dni' ? value.replace(/\D/g, '').slice(0, 8) : value
    setFormData((prev) => ({ ...prev, [key]: normalizedValue }))
    if (key === 'dni') setDni(normalizedValue)
    if (errors[key]) setErrors((prev) => { const e = { ...prev }; delete e[key]; return e })
    if (key === 'email') {
      setAccountLoginRequired(false)
      setProfileError(null)
    }
  }

  async function saveProfileChanges(changes) {
    if (!user || Object.keys(changes).length === 0) return

    setProfileError(null)
    setProfileSaving(true)
    try {
      await updateProfile(changes)
    } catch (err) {
      setProfileError(err.message || 'No pudimos guardar los datos en tu cuenta.')
      throw err
    } finally {
      setProfileSaving(false)
    }
  }

  async function handleStep1() {
    const e = validateStep1(formData)
    if (Object.keys(e).length) { setErrors(e); return }

    if (!user) {
      setProfileError(null)
      setEmailChecking(true)
      try {
        const res = await fetch(`${API_BASE}/api/auth/email-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: formData.email }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'No pudimos verificar el email.')
        if (data.hasAccount) {
          setAccountLoginRequired(true)
          setEmailChecking(false)
          return
        }
      } catch (err) {
        setProfileError(err.message || 'No pudimos verificar el email.')
        setEmailChecking(false)
        return
      }
      setEmailChecking(false)
    }

    if (user) {
      const profileChanges = {}
      if (formData.nombre.trim() && formData.nombre.trim() !== (user.firstName || '').trim()) {
        profileChanges.firstName = formData.nombre.trim()
      }
      if (formData.apellido.trim() && formData.apellido.trim() !== (user.lastName || '').trim()) {
        profileChanges.lastName = formData.apellido.trim()
      }
      if (formData.telefono.trim() && formData.telefono.trim() !== (user.phone || '').trim()) {
        profileChanges.phone = formData.telefono.trim()
      }

      try {
        await saveProfileChanges(profileChanges)
      } catch {
        return
      }
    }

    setErrors({})
    setStep(2)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleStep2() {
    const e = validateStep2(formData, shippingZone)
    if (Object.keys(e).length) { setErrors(e); return }

    if (user && formData.deliveryType === 'delivery') {
      const profileChanges = {}
      if (formData.direccion.trim() && formData.direccion.trim() !== (user.address || '').trim()) {
        profileChanges.address = formData.direccion.trim()
      }
      if (formData.ciudad.trim() && formData.ciudad.trim() !== (user.city || '').trim()) {
        profileChanges.city = formData.ciudad.trim()
      }
      if (formData.codigoPostal.trim() && formData.codigoPostal.trim() !== (user.postalCode || '').trim()) {
        profileChanges.postalCode = formData.codigoPostal.trim()
      }

      try {
        await saveProfileChanges(profileChanges)
      } catch {
        return
      }
    }

    setErrors({})
    setStep(3)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleConfirm() {
    const validationErrors = {
      ...validateStep1(formData),
      ...validateStep2(formData, shippingZone),
      ...validateBilling(formData),
    }
    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    if (user) {
      const profileChanges = {}
      if (formData.nombre.trim() !== (user.firstName || '').trim()) profileChanges.firstName = formData.nombre.trim()
      if (formData.apellido.trim() !== (user.lastName || '').trim()) profileChanges.lastName = formData.apellido.trim()
      if (formData.telefono.trim() !== (user.phone || '').trim()) profileChanges.phone = formData.telefono.trim()
      if (formData.deliveryType === 'delivery') {
        if (formData.direccion.trim() !== (user.address || '').trim()) profileChanges.address = formData.direccion.trim()
        if (formData.ciudad.trim() !== (user.city || '').trim()) profileChanges.city = formData.ciudad.trim()
        if (formData.codigoPostal.trim() !== (user.postalCode || '').trim()) profileChanges.postalCode = formData.codigoPostal.trim()
      }
      try { await saveProfileChanges(profileChanges) } catch { return }
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer: formData, items }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data.code === 'ACCOUNT_LOGIN_REQUIRED') {
          setAccountLoginRequired(true)
          setStep(1)
          setSubmitting(false)
          return
        }
        throw new Error(data.error || 'Error al crear el pedido')
      }
      const { orderId, checkoutUrl } = await res.json()
      if (checkoutUrl) {
        sessionStorage.setItem('fenix_pending_order_id', orderId)
        window.location.href = checkoutUrl
      } else {
        // Pago en el local: no hay redirección a Mercado Pago, el pedido ya
        // quedó reservado.
        clearCart()
        navigate(`/order-confirmation?orderId=${orderId}&status=success`)
      }
    } catch (err) {
      setSubmitError(err.message || 'No pudimos procesar tu pedido. Intentá de nuevo.')
      setSubmitting(false)
    }
  }

  if (authLoading || !authResolved) {
    return (
      <>
        <PageSEO title="Finalizar compra" description="Completá tu pedido en Fénix Iluminación." url="/checkout" />
        <div className="fnx-checkout-loading">
          Preparando tu compra...
        </div>
      </>
    )
  }

  if (items.length === 0) {
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
    <PageSEO title="Finalizar compra" description="Completá tu pedido en Fénix Iluminación y pagá de forma segura con Mercado Pago." url="/checkout" />
    <div style={{ backgroundColor: 'var(--color-bg)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '70rem', margin: '0 auto', padding: '3rem 1.5rem 6rem' }}>

        <div className="fnx-checkout-layout">
          <aside className="fnx-checkout-summary-column">
            <OrderSummary items={items} totalPrice={totalPrice} deliveryType={formData.deliveryType} shippingZone={shippingZone} shippingCost={shippingCost} orderTotal={orderTotal} />
          </aside>

          <main className="fnx-checkout-step-column">
            <SinglePageCheckout
              formData={formData}
              errors={errors}
              setField={setField}
              user={user}
              onLogout={logout}
              navigate={navigate}
              shippingZone={shippingZone}
              deliveryEstimate={deliveryEstimate}
              deliveryEstimateMatches={deliveryEstimateMatches}
              deliveryEstimateLoading={deliveryEstimateLoading}
              accountLoginRequired={accountLoginRequired}
              profileError={profileError}
              submitError={submitError}
              submitting={submitting || profileSaving || emailChecking}
              onConfirm={handleConfirm}
            />
            {false && <>
        {/* ── Step 1: Datos personales ── */}
        {step === 1 && (
          <StepPanel title={user ? 'Completá tus datos' : 'Datos personales'}>
            {user && (
              <div className="fnx-checkout-account-note">
                <CheckSmall />
                <div>
                  <strong>Ya usamos los datos de tu cuenta.</strong>
                  <span> Solo necesitamos completar la información que falta para este pedido.</span>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {(!user || missingAccountFields.nombre) && (
                <Field label="Nombre" error={errors.nombre}>
                  <DarkInput placeholder="Juan" value={formData.nombre} onChange={(v) => setField('nombre', v)} hasError={!!errors.nombre} />
                </Field>
              )}
              {(!user || missingAccountFields.apellido) && (
                <Field label="Apellido" error={errors.apellido}>
                  <DarkInput placeholder="Pérez" value={formData.apellido} onChange={(v) => setField('apellido', v)} hasError={!!errors.apellido} />
                </Field>
              )}
              {!user && (
                <Field label="Email" error={errors.email} className="sm:col-span-2">
                  <DarkInput type="email" placeholder="juan@email.com" value={formData.email} onChange={(v) => setField('email', v)} hasError={!!errors.email} />
                </Field>
              )}
              {(!user || missingAccountFields.telefono) && (
                <Field label="Teléfono" error={errors.telefono} className="sm:col-span-2">
                  <DarkInput type="tel" placeholder="11-1234-5678" value={formData.telefono} onChange={(v) => setField('telefono', v)} hasError={!!errors.telefono} />
                </Field>
              )}
              <Field label="DNI" error={errors.dni} className="sm:col-span-2">
                <DarkInput inputMode="numeric" placeholder="Ej: 12345678" value={formData.dni} onChange={(v) => setField('dni', v)} hasError={!!errors.dni} />
              </Field>
            </div>
            {profileError && (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-primary)', marginTop: '1rem' }}>
                {profileError}
              </p>
            )}
            {accountLoginRequired && !user && (
              <div className="fnx-checkout-login-required">
                <div>
                  <strong>Este email ya tiene una cuenta.</strong>
                  <span> Iniciá sesión para continuar y asociar correctamente el pedido.</span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/login', {
                    state: { from: '/checkout', email: formData.email.trim().toLowerCase() },
                  })}
                >
                  Iniciar sesión
                </button>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem' }}>
              <PrimaryBtn onClick={handleStep1} disabled={profileSaving || emailChecking || accountLoginRequired}>
                {profileSaving
                  ? 'Guardando...'
                  : emailChecking
                    ? 'Verificando...'
                    : 'Continuar'} {!profileSaving && !emailChecking && <ArrowRightIcon />}
              </PrimaryBtn>
            </div>
          </StepPanel>
        )}

        {/* ── Step 2: Entrega ── */}
        {step === 2 && (
          <StepPanel title="Modalidad de entrega">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.75rem' }}>
              {[
                { value: 'delivery', label: 'Envío', desc: 'A domicilio, calculado por código postal' },
                { value: 'pickup', label: 'Retiro', desc: 'Gratis en nuestro local de City Bell' },
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
                <Field label="País / Región">
                  <DarkInput value="Argentina" onChange={() => {}} readOnly />
                </Field>
                <Field label="Dirección" error={errors.direccion}>
                  <DarkInput placeholder="Av. Siempreviva 742" value={formData.direccion} onChange={(v) => setField('direccion', v)} hasError={!!errors.direccion} />
                </Field>
                <Field label="Piso / Depto. (opcional)">
                  <DarkInput placeholder="Piso 2, Depto. B" value={formData.piso} onChange={(v) => setField('piso', v)} />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <Field label="Código postal" error={errors.codigoPostal}>
                    <DarkInput placeholder="1900" value={formData.codigoPostal} onChange={(v) => setField('codigoPostal', v)} hasError={!!errors.codigoPostal} />
                  </Field>
                  <Field label="Ciudad" error={errors.ciudad}>
                    <DarkInput placeholder="La Plata" value={formData.ciudad} onChange={(v) => setField('ciudad', v)} hasError={!!errors.ciudad} />
                  </Field>
                  <Field label="Provincia" error={errors.provincia}>
                    <DarkInput placeholder="Buenos Aires" value={formData.provincia} onChange={(v) => setField('provincia', v)} hasError={!!errors.provincia} />
                  </Field>
                </div>

                <div>
                  <label style={{
                    display: 'block', fontSize: '0.68rem', fontWeight: 600,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: 'var(--color-text-muted)', marginBottom: '0.5rem',
                  }}>
                    Tipo de envío
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    {SHIPPING_SERVICES.map((service) => {
                      const active = formData.shippingService === service.id
                      return (
                        <button
                          type="button"
                          key={service.id}
                          onClick={() => setField('shippingService', service.id)}
                          style={{
                            padding: '0.75rem 1rem', borderRadius: '0.625rem',
                            textAlign: 'left', fontSize: '0.8rem', fontWeight: 600,
                            color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
                            backgroundColor: active ? 'rgba(204,0,0,0.06)' : 'var(--color-surface-2)',
                            border: `1.5px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            cursor: 'pointer',
                          }}
                        >
                          {service.label}
                        </button>
                      )
                    })}
                  </div>
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
                        {shippingZone.label} · {SHIPPING_SERVICES.find(({ id }) => id === formData.shippingService)?.label}
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
                      : deliveryEstimateMatches
                        ? `Entrega estimada: ${fmtDate(deliveryEstimate.estimatedDeliveryDate)} (incluye margen por disponibilidad de stock)`
                        : null}
                  </p>
                )}
              </div>
            )}

            {profileError && (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-primary)', margin: '0 0 1rem' }}>
                {profileError}
              </p>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2rem' }}>
              <GhostBtn onClick={() => needsPersonalData ? setStep(1) : navigate('/cart')} disabled={profileSaving}><ArrowLeftIcon /> Volver</GhostBtn>
              <PrimaryBtn onClick={handleStep2} disabled={profileSaving}>
                {profileSaving ? 'Guardando...' : 'Continuar'} {!profileSaving && <ArrowRightIcon />}
              </PrimaryBtn>
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
                    : `Envío ${formData.shippingService} a ${formData.direccion}, ${formData.ciudad} (CP ${formData.codigoPostal})`}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>
                  {formData.nombre} {formData.apellido} · {formData.telefono}
                </p>
                {formData.deliveryType === 'pickup' && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>
                    Pago online con Mercado Pago
                    {formData.pickupDate ? ` · Retirás el ${fmtDate(formData.pickupDate)}` : ''}
                  </p>
                )}
                {formData.deliveryType === 'delivery' && deliveryEstimateMatches && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>
                    Entrega estimada: {fmtDate(deliveryEstimate.estimatedDeliveryDate)}
                  </p>
                )}
              </div>
            </div>

            <section style={{ marginBottom: '1.75rem' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text)' }}>
                Pago
              </h3>
              <div style={{ border: '1.5px solid var(--color-primary)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '14px 16px', background: 'rgba(204,0,0,.045)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600 }}>
                    <span style={{ width: 14, height: 14, borderRadius: '50%', border: '4px solid var(--color-primary)' }} />
                    Mercado Pago
                  </span>
                  <img src={mercadoPagoLogo} alt="Mercado Pago" style={{ width: 112, height: 'auto' }} />
                </div>
                <p style={{ margin: 0, padding: '11px 16px', borderTop: '1px solid var(--color-border)', background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', fontSize: 11.5, textAlign: 'center' }}>
                  Te redirigiremos a Mercado Pago para completar la compra de forma segura.
                </p>
              </div>
            </section>

            <BillingAddress formData={formData} errors={errors} setField={setField} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
              <GhostBtn onClick={() => setStep(2)} disabled={submitting}>
                <ArrowLeftIcon /> Volver
              </GhostBtn>

              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="fnx-mercadopago-button"
                aria-label="Pagar con Mercado Pago"
              >
                {submitting ? 'Procesando...' : <><span>Pagar con</span><img src={mercadoPagoLogo} alt="Mercado Pago" /></>}
              </button>
            </div>

            <nav className="fnx-checkout-legal" aria-label="Información legal">
              <Link to="/policies/refunds">Política de reembolso</Link>
              <Link to="/policies/shipping">Envíos</Link>
              <Link to="/policies/privacy">Política de privacidad</Link>
              <Link to="/policies/terms">Términos del servicio</Link>
            </nav>

            {submitError && (
              <p style={{ fontSize: '0.875rem', textAlign: 'center', color: 'var(--color-primary)' }}>
                {submitError}
              </p>
            )}
          </StepPanel>
        )}
            </>}
          </main>
        </div>
      </div>
    </div>
    </>
  )
}

function SinglePageCheckout({
  formData, errors, setField, user, onLogout, navigate, shippingZone,
  deliveryEstimate, deliveryEstimateMatches, deliveryEstimateLoading,
  accountLoginRequired, profileError, submitError, submitting, onConfirm,
}) {
  const [activePolicy, setActivePolicy] = useState(null)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const policy = activePolicy ? POLICIES[activePolicy] : null
  const login = () => {
    try { sessionStorage.setItem('fenix_checkout_draft', JSON.stringify(formData)) } catch { /* ignore */ }
    navigate('/login', {
      state: { from: '/checkout', email: formData.email.trim().toLowerCase() },
    })
  }

  async function handleLogout() {
    setAccountMenuOpen(false)
    await onLogout()
  }

  useEffect(() => {
    if (!activePolicy) return undefined
    const closeOnEscape = (event) => { if (event.key === 'Escape') setActivePolicy(null) }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [activePolicy])

  return (
    <div className="fnx-single-checkout">
      <section className="fnx-checkout-section">
        {user ? (
          <div className="fnx-checkout-account-bar">
            <span className="fnx-checkout-account-avatar">{(user.firstName || user.email || 'U').charAt(0).toUpperCase()}</span>
            <strong>{user.email}</strong>
            <div className="fnx-checkout-account-menu">
              <button type="button" onClick={() => setAccountMenuOpen((open) => !open)} aria-label="Opciones de la cuenta">⋮</button>
              {accountMenuOpen && (
                <div><button type="button" onClick={handleLogout}>Cerrar sesión</button></div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="fnx-checkout-section-title">
              <h2>Contacto</h2>
              <button type="button" onClick={login}>Iniciar sesión</button>
            </div>
            <Field label="Correo electrónico" error={errors.email}>
              <DarkInput
                type="email"
                placeholder="correo@ejemplo.com"
                value={formData.email}
                onChange={(value) => setField('email', value)}
                hasError={!!errors.email}
              />
            </Field>
            <label className="fnx-checkout-checkbox">
              <input type="checkbox" />
              Enviarme novedades y ofertas por correo electrónico
            </label>
          </>
        )}
      </section>

      <section className="fnx-checkout-section">
        <h2>Entrega</h2>
        <div className="fnx-delivery-tabs">
          {[
            { value: 'delivery', label: 'Envío', icon: <DeliveryIcon /> },
            { value: 'pickup', label: 'Retiro', icon: <PickupIcon /> },
          ].map((option) => (
            <button
              type="button"
              key={option.value}
              className={formData.deliveryType === option.value ? 'is-active' : ''}
              onClick={() => setField('deliveryType', option.value)}
            >
              <span aria-hidden="true">{option.icon}</span> {option.label}
            </button>
          ))}
        </div>

        {formData.deliveryType === 'delivery' && (
          <Field label="País / Región"><DarkInput value="Argentina" onChange={() => {}} readOnly /></Field>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nombre" error={errors.nombre}>
            <DarkInput placeholder="Nombre" value={formData.nombre} onChange={(value) => setField('nombre', value)} hasError={!!errors.nombre} />
          </Field>
          <Field label="Apellidos" error={errors.apellido}>
            <DarkInput placeholder="Apellidos" value={formData.apellido} onChange={(value) => setField('apellido', value)} hasError={!!errors.apellido} />
          </Field>
        </div>

        <Field label="DNI" error={errors.dni}>
          <DarkInput inputMode="numeric" placeholder="DNI" value={formData.dni} onChange={(value) => setField('dni', value)} hasError={!!errors.dni} />
        </Field>

        {formData.deliveryType === 'delivery' ? (
          <>
            <Field label="Dirección" error={errors.direccion}>
              <DarkInput placeholder="Calle y número" value={formData.direccion} onChange={(value) => setField('direccion', value)} hasError={!!errors.direccion} />
            </Field>
            <Field label="Piso / Depto. (opcional)">
              <DarkInput placeholder="Piso / Depto." value={formData.piso} onChange={(value) => setField('piso', value)} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Código postal" error={errors.codigoPostal}>
                <DarkInput placeholder="Código postal" value={formData.codigoPostal} onChange={(value) => setField('codigoPostal', value)} hasError={!!errors.codigoPostal} />
              </Field>
              <Field label="Ciudad" error={errors.ciudad}>
                <DarkInput placeholder="Ciudad" value={formData.ciudad} onChange={(value) => setField('ciudad', value)} hasError={!!errors.ciudad} />
              </Field>
              <Field label="Provincia" error={errors.provincia}>
                <DarkInput placeholder="Provincia" value={formData.provincia} onChange={(value) => setField('provincia', value)} hasError={!!errors.provincia} />
              </Field>
            </div>
          </>
        ) : (
          <>
            <div className="fnx-pickup-card"><MapPinIcon /><div><strong>Fénix City Bell</strong><span>473 entre 14C y 15, City Bell, La Plata</span></div><b>Gratis</b></div>
            <Field label="Fecha de retiro" error={errors.pickupDate}>
              <DarkInput type="date" value={formData.pickupDate} onChange={(value) => setField('pickupDate', value)} hasError={!!errors.pickupDate} min={tomorrowISO()} />
            </Field>
          </>
        )}

        <Field label="Teléfono" error={errors.telefono}>
          <DarkInput type="tel" placeholder="Teléfono" value={formData.telefono} onChange={(value) => setField('telefono', value)} hasError={!!errors.telefono} />
        </Field>

        {formData.deliveryType === 'delivery' && (
          <div className="fnx-shipping-methods">
            <h3>Métodos de envío</h3>
            {formData.codigoPostal.trim().length < 4 ? (
              <div className="fnx-shipping-placeholder">Ingresá tu dirección de envío para ver los métodos disponibles.</div>
            ) : (
              <>
                {SHIPPING_SERVICES.map((service) => {
                  const optionQuote = getShippingForCP(formData.codigoPostal, service.id)
                  return (
                    <button
                      type="button"
                      key={service.id}
                      className={formData.shippingService === service.id ? 'is-active' : ''}
                      onClick={() => setField('shippingService', service.id)}
                    >
                      <span><b>{service.label}</b>{optionQuote?.description && <small>{optionQuote.description}</small>}</span>
                      <strong>{optionQuote?.price == null ? 'A confirmar' : optionQuote.price === 0 ? 'Gratis' : fmt(optionQuote.price)}</strong>
                    </button>
                  )
                })}
                <p className="fnx-delivery-estimate">
                  {deliveryEstimateLoading
                    ? 'Calculando fecha estimada...'
                    : deliveryEstimateMatches
                      ? `Entrega estimada: ${fmtDate(deliveryEstimate.estimatedDeliveryDate)}`
                      : ''}
                </p>
              </>
            )}
          </div>
        )}
      </section>

      <section className="fnx-checkout-section">
        <h2>Pago</h2>
        <p className="fnx-section-caption">Todas las transacciones son seguras y están encriptadas.</p>
        <div className="fnx-payment-option">
          <div><span className="fnx-radio-dot" /> <strong>Mercado Pago</strong><img src={mercadoPagoLogo} alt="Mercado Pago" /></div>
          <p>Se te redirigirá a Mercado Pago para que completes la compra.</p>
        </div>
      </section>

      <BillingAddress formData={formData} errors={errors} setField={setField} />

      {(profileError || submitError) && (
        <p className="fnx-checkout-submit-error">{profileError || submitError}</p>
      )}

      <button type="button" className="fnx-pay-now" onClick={onConfirm} disabled={submitting}>
        {submitting ? 'Procesando...' : 'Pagar ahora'}
      </button>

      <nav className="fnx-checkout-legal" aria-label="Información legal">
        <button type="button" onClick={() => setActivePolicy('refunds')}>Política de reembolso</button>
        <button type="button" onClick={() => setActivePolicy('shipping')}>Envíos</button>
        <button type="button" onClick={() => setActivePolicy('privacy')}>Política de privacidad</button>
        <button type="button" onClick={() => setActivePolicy('terms')}>Términos del servicio</button>
      </nav>

      {policy && (
        <div className="fnx-policy-modal-backdrop" onMouseDown={() => setActivePolicy(null)}>
          <section
            className="fnx-policy-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-policy-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span>Información legal</span>
                <h2 id="checkout-policy-title">{policy.title}</h2>
              </div>
              <button type="button" onClick={() => setActivePolicy(null)} aria-label="Cerrar política">×</button>
            </header>
            <div className="fnx-policy-modal-content">
              {policy.sections.map(([title, body]) => (
                <article key={title}>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
              <p className="fnx-policy-modal-updated">Última actualización: agosto de 2026</p>
            </div>
            <footer>
              <button type="button" onClick={() => setActivePolicy(null)}>Cerrar</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}

function BillingAddress({ formData, errors, setField }) {
  const usesShipping = formData.deliveryType === 'delivery' && formData.billingSameAsShipping

  return (
    <section style={{ marginBottom: '1.75rem' }}>
      <h3 style={{ margin: '0 0 8px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text)' }}>
        Dirección de facturación
      </h3>
      {formData.deliveryType === 'delivery' && (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden', marginBottom: usesShipping ? 0 : 16 }}>
          {[
            { value: true, label: 'La misma dirección de envío' },
            { value: false, label: 'Usar una dirección de facturación distinta' },
          ].map((option) => (
            <button
              type="button"
              key={String(option.value)}
              onClick={() => setField('billingSameAsShipping', option.value)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px',
                border: 0, borderBottom: option.value ? '1px solid var(--color-border)' : 0,
                background: 'var(--color-surface)',
                color: 'var(--color-text)', fontSize: 12.5, textAlign: 'left', cursor: 'pointer',
              }}
            >
              <span style={{ width: 14, height: 14, borderRadius: '50%', border: `4px solid ${formData.billingSameAsShipping === option.value ? 'var(--color-primary)' : 'var(--color-border)'}` }} />
              {option.label}
            </button>
          ))}
        </div>
      )}

      {!usesShipping && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Field label="País / Región"><DarkInput value="Argentina" onChange={() => {}} readOnly /></Field>
          <Field label="Dirección" error={errors.billingAddress}>
            <DarkInput placeholder="Calle y número" value={formData.billingAddress} onChange={(v) => setField('billingAddress', v)} hasError={!!errors.billingAddress} />
          </Field>
          <Field label="Piso / Depto. (opcional)">
            <DarkInput placeholder="Piso 2, Depto. B" value={formData.billingAddressExtra} onChange={(v) => setField('billingAddressExtra', v)} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Código postal" error={errors.billingPostalCode}>
              <DarkInput placeholder="1900" value={formData.billingPostalCode} onChange={(v) => setField('billingPostalCode', v)} hasError={!!errors.billingPostalCode} />
            </Field>
            <Field label="Ciudad" error={errors.billingCity}>
              <DarkInput placeholder="La Plata" value={formData.billingCity} onChange={(v) => setField('billingCity', v)} hasError={!!errors.billingCity} />
            </Field>
            <Field label="Provincia" error={errors.billingProvince}>
              <DarkInput placeholder="Buenos Aires" value={formData.billingProvince} onChange={(v) => setField('billingProvince', v)} hasError={!!errors.billingProvince} />
            </Field>
          </div>
        </div>
      )}
    </section>
  )
}

// ─── Order Summary ─────────────────────────────────────────────────────────────
function OrderSummary({ items, totalPrice, deliveryType, shippingZone, shippingCost, orderTotal }) {
  return (
    <div
      style={{
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

      <div className="fnx-checkout-discount">
        <input type="text" placeholder="Código de descuento" aria-label="Código de descuento" />
        <button type="button" disabled>Aplicar</button>
      </div>

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
        {deliveryType === 'pickup' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            <span>Retiro en tienda</span>
            <span style={{ color: '#166534', fontWeight: 600 }}>Gratis</span>
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

function DarkInput({ type = 'text', inputMode, placeholder, value, onChange, hasError, min, readOnly = false }) {
  return (
    <input
      type={type}
      inputMode={inputMode}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      min={min}
      readOnly={readOnly}
      className="dark-input"
      style={{
        width: '100%',
        padding: '0.75rem 1rem',
        borderRadius: '0.625rem',
        fontSize: '0.9rem',
        outline: 'none',
        backgroundColor: readOnly ? 'var(--color-border)' : 'var(--color-surface-2)',
        border: `1.5px solid ${hasError ? 'var(--color-primary)' : 'var(--color-border)'}`,
        color: 'var(--color-text)',
        transition: 'border-color 150ms ease',
        cursor: readOnly ? 'not-allowed' : 'text',
      }}
      onFocus={(e) => { if (!hasError) e.currentTarget.style.borderColor = 'var(--color-primary)' }}
      onBlur={(e)  => { if (!hasError) e.currentTarget.style.borderColor = 'var(--color-border)' }}
    />
  )
}

function PrimaryBtn({ onClick, disabled = false, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.75rem 1.75rem',
        borderRadius: '0.75rem',
        fontSize: '0.875rem',
        fontWeight: 600,
        backgroundColor: disabled ? 'var(--color-text-muted)' : 'var(--color-primary)',
        color: '#fff',
        transition: 'background-color 150ms ease',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)' }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.backgroundColor = 'var(--color-primary)' }}
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

function DeliveryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" />
    </svg>
  )
}

function PickupIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" />
    </svg>
  )
}

