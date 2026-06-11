import { useState, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'

const fmt = (n) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)

// ─── Validation ────────────────────────────────────────────────────────────────
function validateStep1(d) {
  const e = {}
  if (!d.nombre.trim())             e.nombre    = 'El nombre es requerido'
  else if (d.nombre.trim().length < 2) e.nombre = 'Mínimo 2 caracteres'
  if (!d.apellido.trim())              e.apellido = 'El apellido es requerido'
  else if (d.apellido.trim().length < 2) e.apellido = 'Mínimo 2 caracteres'
  if (!d.email.trim())                 e.email   = 'El email es requerido'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) e.email = 'Formato de email inválido'
  if (!d.telefono.trim())              e.telefono = 'El teléfono es requerido'
  else if (d.telefono.replace(/\D/g, '').length < 8) e.telefono = 'Mínimo 8 dígitos'
  return e
}

function validateStep2(d) {
  const e = {}
  if (d.deliveryType === 'delivery') {
    if (!d.direccion.trim())      e.direccion    = 'La dirección es requerida'
    if (!d.ciudad.trim())         e.ciudad       = 'La ciudad es requerida'
    if (!d.codigoPostal.trim())   e.codigoPostal = 'El código postal es requerido'
  }
  return e
}

// ─── WhatsApp message builder ──────────────────────────────────────────────────
function buildWhatsAppUrl(formData, items, total) {
  const lines = items
    .map((i) => `  • ${i.quantity}x ${i.name} — ${fmt(i.price * i.quantity)}`)
    .join('\n')

  const entrega =
    formData.deliveryType === 'pickup'
      ? 'Retiro en local (473 entre 14C y 15, City Bell)'
      : `Envío a domicilio: ${formData.direccion}, ${formData.ciudad}${formData.codigoPostal ? ` (CP ${formData.codigoPostal})` : ''}`

  const msg = [
    '¡Hola! Quiero hacer un pedido en Fénix Electricidad e Iluminación 🛒',
    '',
    '*Mis datos:*',
    `Nombre: ${formData.nombre} ${formData.apellido}`,
    `Email: ${formData.email}`,
    `Teléfono: ${formData.telefono}`,
    '',
    '*Productos:*',
    lines,
    '',
    `*Total: ${fmt(total)}*`,
    '',
    `*Entrega:* ${entrega}`,
  ].join('\n')

  return `https://wa.me/5491122334455?text=${encodeURIComponent(msg)}`
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function Checkout() {
  const navigate = useNavigate()
  const { items, totalPrice } = useCart()
  const [step, setStep]       = useState(1)
  const [errors, setErrors]   = useState({})

  const [formData, setFormData] = useState({
    // Step 1
    nombre:      '',
    apellido:    '',
    email:       '',
    telefono:    '',
    // Step 2
    deliveryType: 'pickup',
    direccion:   '',
    ciudad:      '',
    codigoPostal: '',
  })

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
    const e = validateStep2(formData)
    if (Object.keys(e).length) { setErrors(e); return }
    setErrors({})
    setStep(3)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleConfirm() {
    const url = buildWhatsAppUrl(formData, items, totalPrice)
    window.open(url, '_blank', 'noopener,noreferrer')
    const orderNumber = Math.random().toString(36).slice(2, 8).toUpperCase()
    navigate('/order-confirmation', {
      state: { orderNumber, items: [...items], total: totalPrice, customer: formData },
    })
  }

  // Redirect if cart is empty and they land here directly
  if (items.length === 0 && step < 3) {
    return (
      <div
        className="min-h-[60vh] flex flex-col items-center justify-center gap-5"
        style={{ backgroundColor: 'var(--color-bg)' }}
      >
        <p style={{ color: 'var(--color-text-muted)' }}>Tu carrito está vacío.</p>
        <button
          onClick={() => navigate('/products')}
          className="px-6 py-3 rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
        >
          Ver productos
        </button>
      </div>
    )
  }

  return (
    <div style={{ backgroundColor: 'var(--color-bg)', minHeight: '100vh' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 pb-20">

        {/* Page title */}
        <h1
          className="text-3xl font-bold mb-10 text-center"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-text)' }}
        >
          Finalizar compra
        </h1>

        {/* Stepper */}
        <Stepper current={step} />

        {/* Step panels */}
        {step === 1 && (
          <StepPanel title="Datos personales">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Nombre" error={errors.nombre}>
                <DarkInput
                  placeholder="Juan"
                  value={formData.nombre}
                  onChange={(v) => setField('nombre', v)}
                  hasError={!!errors.nombre}
                />
              </Field>
              <Field label="Apellido" error={errors.apellido}>
                <DarkInput
                  placeholder="Pérez"
                  value={formData.apellido}
                  onChange={(v) => setField('apellido', v)}
                  hasError={!!errors.apellido}
                />
              </Field>
              <Field label="Email" error={errors.email} className="sm:col-span-2">
                <DarkInput
                  type="email"
                  placeholder="juan@email.com"
                  value={formData.email}
                  onChange={(v) => setField('email', v)}
                  hasError={!!errors.email}
                />
              </Field>
              <Field label="Teléfono" error={errors.telefono} className="sm:col-span-2">
                <DarkInput
                  type="tel"
                  placeholder="11-1234-5678"
                  value={formData.telefono}
                  onChange={(v) => setField('telefono', v)}
                  hasError={!!errors.telefono}
                />
              </Field>
            </div>

            <div className="flex justify-end mt-8">
              <PrimaryBtn onClick={handleStep1}>
                Continuar
                <ArrowRightIcon />
              </PrimaryBtn>
            </div>
          </StepPanel>
        )}

        {step === 2 && (
          <StepPanel title="Modalidad de entrega">
            {/* Radio options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-7">
              {[
                { value: 'pickup',   label: 'Retiro en local', desc: 'Sin costo' },
                { value: 'delivery', label: 'Envío a domicilio', desc: 'Costo a confirmar' },
              ].map((opt) => {
                const active = formData.deliveryType === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => setField('deliveryType', opt.value)}
                    className="flex items-start gap-3 p-4 rounded-xl text-left transition-all"
                    style={{
                      backgroundColor: active ? 'rgba(204,0,0,0.08)' : 'var(--color-surface)',
                      border: `1.5px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    }}
                  >
                    {/* Radio dot */}
                    <div
                      className="mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                      style={{
                        border: `1.5px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      }}
                    >
                      {active && (
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: 'var(--color-primary)' }}
                        />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                        {opt.label}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                        {opt.desc}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Pickup info */}
            {formData.deliveryType === 'pickup' && (
              <div
                className="rounded-xl p-4 mb-6 flex gap-3"
                style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              >
                <MapPinIcon />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                    473 entre 14C y 15, City Bell, La Plata
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    Lunes a Viernes 8:30–18 hs · Sábados 8:30–13 hs
                  </p>
                </div>
              </div>
            )}

            {/* Delivery address fields */}
            {formData.deliveryType === 'delivery' && (
              <div className="space-y-5 mb-6">
                <Field label="Dirección" error={errors.direccion}>
                  <DarkInput
                    placeholder="Av. Siempreviva 742"
                    value={formData.direccion}
                    onChange={(v) => setField('direccion', v)}
                    hasError={!!errors.direccion}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-5">
                  <Field label="Ciudad" error={errors.ciudad}>
                    <DarkInput
                      placeholder="La Plata"
                      value={formData.ciudad}
                      onChange={(v) => setField('ciudad', v)}
                      hasError={!!errors.ciudad}
                    />
                  </Field>
                  <Field label="Código postal" error={errors.codigoPostal}>
                    <DarkInput
                      placeholder="1900"
                      value={formData.codigoPostal}
                      onChange={(v) => setField('codigoPostal', v)}
                      hasError={!!errors.codigoPostal}
                    />
                  </Field>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mt-8">
              <GhostBtn onClick={() => setStep(1)}>
                <ArrowLeftIcon /> Volver
              </GhostBtn>
              <PrimaryBtn onClick={handleStep2}>
                Continuar <ArrowRightIcon />
              </PrimaryBtn>
            </div>
          </StepPanel>
        )}

        {step === 3 && (
          <StepPanel title="Revisión y confirmación">
            {/* Order items */}
            <div
              className="rounded-xl overflow-hidden mb-6"
              style={{ border: '1px solid var(--color-border)' }}
            >
              <div
                className="px-5 py-3 text-[11px] uppercase tracking-widest font-semibold"
                style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-muted)' }}
              >
                Productos ({items.reduce((s, i) => s + i.quantity, 0)})
              </div>
              <ul style={{ backgroundColor: 'var(--color-surface)' }}>
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-4 px-5 py-4"
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
                  </li>
                ))}
                {/* Total row */}
                <li className="flex items-center justify-between px-5 py-4">
                  <span className="font-semibold" style={{ color: 'var(--color-text)' }}>Total</span>
                  <span className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>{fmt(totalPrice)}</span>
                </li>
              </ul>
            </div>

            {/* Delivery summary */}
            <div
              className="rounded-xl p-4 mb-6 flex gap-3 text-sm"
              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <MapPinIcon />
              <div>
                <p className="font-medium" style={{ color: 'var(--color-text)' }}>
                  {formData.deliveryType === 'pickup'
                    ? 'Retiro en local — 473 entre 14C y 15, City Bell'
                    : `Envío a ${formData.direccion}, ${formData.ciudad}`}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {formData.nombre} {formData.apellido} · {formData.telefono}
                </p>
              </div>
            </div>

            {/* Payment info banner */}
            <div
              className="rounded-xl p-5 mb-8"
              style={{
                backgroundColor: 'rgba(204,0,0,0.07)',
                border: '1px solid rgba(204,0,0,0.25)',
              }}
            >
              <p className="font-semibold mb-1.5" style={{ color: 'var(--color-text)' }}>
                🚧 Integración con pasarela de pago próximamente
              </p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                Por ahora podés abonar en efectivo al retirar, o coordinar el pago por WhatsApp. Al confirmar, te enviamos los detalles del pedido directamente al número de la tienda.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <GhostBtn onClick={() => setStep(2)}>
                <ArrowLeftIcon /> Volver
              </GhostBtn>

              <button
                onClick={handleConfirm}
                className="flex-1 w-full sm:w-auto flex items-center justify-center gap-2.5 py-4 px-6 rounded-xl text-sm font-semibold tracking-wide transition-colors"
                style={{ backgroundColor: '#25D366', color: '#fff' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1ebe5d')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#25D366')}
              >
                <WhatsAppIcon />
                Confirmar pedido por WhatsApp
              </button>
            </div>
          </StepPanel>
        )}
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
    <div className="flex items-start w-full max-w-xs mx-auto mb-12">
      {steps.map((s, i) => {
        const done   = s.num < current
        const active = s.num === current
        return (
          <Fragment key={s.num}>
            {/* Connector */}
            {i > 0 && (
              <div
                className="flex-1 h-px mt-[18px] mx-1 transition-colors duration-500"
                style={{ backgroundColor: done ? 'var(--color-primary)' : 'var(--color-border)' }}
              />
            )}
            {/* Step */}
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300"
                style={{
                  backgroundColor: done || active ? 'var(--color-primary)' : 'var(--color-surface-2)',
                  border: done || active ? 'none' : '1.5px solid var(--color-border)',
                  color: done || active ? '#fff' : 'var(--color-text-muted)',
                }}
              >
                {done ? <CheckSmall /> : s.num}
              </div>
              <span
                className="text-[11px] uppercase tracking-wider font-medium"
                style={{ color: active ? 'var(--color-text)' : 'var(--color-text-muted)' }}
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
      className="rounded-2xl p-6 sm:p-8"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <h2
        className="text-xl font-semibold mb-7"
        style={{ color: 'var(--color-text)', borderBottom: '1px solid var(--color-border)', paddingBottom: '1.25rem' }}
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
      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text)' }}>
        {label}
      </label>
      {children}
      {error && (
        <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: 'var(--color-primary)' }}>
          {error}
        </p>
      )}
    </div>
  )
}

function DarkInput({ type = 'text', placeholder, value, onChange, hasError }) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="dark-input w-full px-4 py-3 rounded-lg text-sm outline-none transition-colors"
      style={{
        backgroundColor: 'var(--color-surface-2)',
        border: `1px solid ${hasError ? 'var(--color-primary)' : 'var(--color-border)'}`,
        color: 'var(--color-text)',
      }}
      onFocus={(e) => {
        if (!hasError) e.currentTarget.style.borderColor = 'var(--color-primary)'
      }}
      onBlur={(e) => {
        if (!hasError) e.currentTarget.style.borderColor = 'var(--color-border)'
      }}
    />
  )
}

function PrimaryBtn({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold transition-colors"
      style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
    >
      {children}
    </button>
  )
}

function GhostBtn({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl text-sm font-medium transition-colors"
      style={{
        color: 'var(--color-text-muted)',
        border: '1px solid var(--color-border)',
        backgroundColor: 'transparent',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--color-text)'
        e.currentTarget.style.borderColor = 'var(--color-text-muted)'
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
    <svg className="shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary)' }}>
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M11.99 2C6.477 2 2 6.477 2 11.99c0 1.77.463 3.435 1.275 4.884L2 22l5.274-1.256A9.934 9.934 0 0011.99 21.98C17.503 21.98 22 17.503 22 11.99 22 6.477 17.503 2 11.99 2zm0 18.18a8.183 8.183 0 01-4.17-1.142l-.299-.177-3.097.738.768-3.015-.196-.31A8.194 8.194 0 013.79 11.99c0-4.524 3.683-8.207 8.2-8.207 4.524 0 8.207 3.683 8.207 8.207s-3.683 8.19-8.207 8.19z" />
    </svg>
  )
}
