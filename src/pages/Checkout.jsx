import { useState, Fragment, useMemo, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import { useAdmin } from '../context/AdminContext'
import PageSEO from '../components/SEO'
import { getShippingForCP, SHIPPING_SERVICES } from '../config/shipping'
import mercadoPagoLogo from '../assets/mercado-pago-horizontal.svg'
import { POLICIES } from './Policy'
import { applyInvoiceMode, documentKindForNumber } from '../utils/checkoutInvoice'
import {
  plazoMaximo,
  rangoEntregaTexto,
  fechaRetiroMinima,
  fechaISOLocal,
  retiroDemasiadoTemprano,
  textoRetiroDisponible,
} from '../utils/plazoEntrega'

const API_BASE = import.meta.env.VITE_API_URL || ''
const CHECKOUT_PAYMENT_DRAFT_KEY = 'fenix_checkout_payment_draft'
const PAYMENT_FAILURE_MESSAGE = 'No se efectuó el pago. Tus datos y productos siguen cargados para que puedas intentarlo nuevamente.'

function readCheckoutPaymentDraft() {
  try {
    const stored = sessionStorage.getItem(CHECKOUT_PAYMENT_DRAFT_KEY)
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

const fmt = (n) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })

// Con un solo servicio no hace falta nombrarlo. Con más de uno se usa la
// etiqueta ("Clásico"), nunca el id crudo que guarda la base ("clasico").
const servicioEnvioTexto = (id) => {
  if (SHIPPING_SERVICES.length < 2) return ''
  const label = SHIPPING_SERVICES.find((service) => service.id === id)?.label
  return label ? ` ${label}` : ''
}

// La estimación es una ventana, no un día: el correo tarda distinto según la
// localidad dentro de la zona del CP (ver backend/config/shipping.js).
const fmtVentanaEntrega = (estimate) =>
  rangoEntregaTexto(estimate?.estimatedDeliveryMinDate, estimate?.estimatedDeliveryMaxDate)

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

function validateInvoiceRecipient(d, invoiceOptions) {
  const e = {}
  const docType = Number(d.invoiceDocType)
  const docNumber = String(d.invoiceDocNumber || '').replace(/\D/g, '')
  const vatCondition = invoiceOptions?.vatConditions
    ?.find((option) => option.id === Number(d.invoiceVatConditionId))
  const invoiceName = String(d.invoiceName || '').trim()
    || `${d.nombre || ''} ${d.apellido || ''}`.trim()
  if (!invoiceName) e.invoiceName = 'Ingresá el nombre o razón social'
  if (!invoiceOptions?.documents?.some((option) => option.id === docType)) {
    e.invoiceDocType = 'Elegí un tipo de documento válido'
  } else if (vatCondition && !vatCondition.allowedDocumentTypeIds.includes(docType)) {
    e.invoiceDocType = 'El documento no corresponde a la condición IVA elegida'
  } else if (docType === 80 && !/^\d{11}$/.test(docNumber)) {
    e.invoiceDocNumber = 'El CUIT debe tener 11 dígitos'
  } else if (docType === 96 && !/^\d{7,8}$/.test(docNumber)) {
    e.invoiceDocNumber = 'El DNI debe tener 7 u 8 dígitos'
  } else if (docType !== 99 && !docNumber) {
    e.invoiceDocNumber = 'Ingresá el número de documento'
  }
  if (!vatCondition) {
    e.invoiceVatConditionId = 'Elegí la condición frente al IVA'
  } else if (d.needsInvoiceA
    && !['A', 'ALEY'].includes(vatCondition.invoiceClass)
    && vatCondition.category !== 'exempt') {
    e.invoiceVatConditionId = 'La condición fiscal no corresponde a Factura A o B'
  } else if (!d.needsInvoiceA && vatCondition.category !== 'consumer_final') {
    e.invoiceVatConditionId = 'Los comprobantes sin Factura A se emiten a consumidor final'
  }
  return e
}

function validateStep2(d, shippingZone, handlingDays = 0) {
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
  } else if (d.deliveryType === 'pickup' && retiroDemasiadoTemprano(d.pickupDate, handlingDays)) {
    e.pickupDate = textoRetiroDisponible(handlingDays)
  }
  if (d.deliveryType === 'pickup' && d.pickupByOtherPerson) {
    if (!String(d.pickupPersonName || '').trim()) e.pickupPersonName = 'Ingresá el nombre de quien retira'
    if (!String(d.pickupPersonLastName || '').trim()) e.pickupPersonLastName = 'Ingresá el apellido de quien retira'
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
  const [searchParams] = useSearchParams()
  const { items, totalPrice, totalWeight, clearCart, shippingConfig } = useCart()
  const { user, authLoading, updateProfile, logout } = useAuth()
  const { products: catalogProducts } = useAdmin()
  const [paymentDraft] = useState(readCheckoutPaymentDraft)
  const paymentReturn = searchParams.get('payment')
  const returnedOrderId = searchParams.get('orderId')
  const returnedPaymentId = searchParams.get('payment_id') || searchParams.get('collection_id')
  const returnedMerchantOrderId = searchParams.get('merchant_order_id')
  const returnedPreferenceId = searchParams.get('preference_id')
  const [step, setStep]             = useState(1)
  const [errors, setErrors]         = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState(null)
  const [authResolved, setAuthResolved] = useState(false)
  const [emailChecking, setEmailChecking] = useState(false)
  const [accountLoginRequired, setAccountLoginRequired] = useState(false)
  const [discountCode, setDiscountCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState(paymentDraft?.appliedCoupon || null)
  const [couponChecking, setCouponChecking] = useState(false)
  const [couponError, setCouponError] = useState(null)
  const [invoiceOptions, setInvoiceOptions] = useState(null)
  const [invoiceOptionsError, setInvoiceOptionsError] = useState(null)
  const [paymentConfig, setPaymentConfig] = useState({
    bankTransfer: { enabled: null, discountPercent: 10 },
  })
  const [showPaymentFailureNotice, setShowPaymentFailureNotice] = useState(paymentReturn === 'failure')

  const [formData, setFormData] = useState({
    nombre:       user?.firstName  || '',
    apellido:     user?.lastName   || '',
    email:        user?.email      || '',
    telefono:     user?.phone      || '',
    invoiceName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
    invoiceDocType: '',
    invoiceDocNumber: '',
    invoiceVatConditionId: '',
    needsInvoiceA: null,
    consumerFinalWithoutCuit: false,
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
    pickupByOtherPerson: false,
    pickupPersonName: '',
    pickupPersonLastName: '',
    ...(paymentDraft?.formData || {}),
  })

  const [deliveryEstimate, setDeliveryEstimate] = useState(null)
  const [deliveryEstimateLoading, setDeliveryEstimateLoading] = useState(false)

  // Días hábiles de preparación del carrito: el mayor de sus items, porque se
  // despacha todo junto. El plazo se re-lee del catálogo (`/api/catalog`, ya
  // resuelto contra los settings actuales), no del snapshot del carrito: ese
  // pudo quedar viejo si cambió "Plazos de entrega" o si el carrito venía de
  // otra sesión. POST /api/orders igual lo revalida contra la DB.
  const handlingDays = useMemo(() => {
    const conPlazoActual = items.map((item) => {
      const fresco = catalogProducts.find((p) => p.id === item.id)
      return fresco?.diasEntrega != null
        ? { ...item, diasEntrega: fresco.diasEntrega }
        : item
    })
    return plazoMaximo(conPlazoActual)
  }, [items, catalogProducts])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${API_BASE}/api/payments/config`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(config => setPaymentConfig(config))
      .catch(() => {})
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (paymentConfig.bankTransfer?.enabled === false && formData.paymentMethod === 'bank_transfer') {
      setFormData(current => ({ ...current, paymentMethod: 'mercadopago' }))
    }
  }, [paymentConfig.bankTransfer?.enabled, formData.paymentMethod])

  // El checkout viaja a otro dominio para pagar. Guardamos cada cambio, no
  // solamente el instante de la redirección, para que dirección, receptor
  // fiscal y facturación sobrevivan incluso si MP o la red interrumpen el
  // flujo antes de recibir la respuesta final.
  useEffect(() => {
    try {
      sessionStorage.setItem(CHECKOUT_PAYMENT_DRAFT_KEY, JSON.stringify({ formData, appliedCoupon }))
    } catch { /* ignore storage quota */ }
  }, [formData, appliedCoupon])

  useEffect(() => {
    if (paymentReturn !== 'failure' || !returnedOrderId || paymentDraft?.formData) return undefined

    const controller = new AbortController()
    fetch(`${API_BASE}/api/orders/mine/${returnedOrderId}/retry-data`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'No pudimos recuperar los datos')
        return data
      })
      .then((data) => {
        if (data?.formData) setFormData((current) => ({ ...current, ...data.formData }))
      })
      .catch((error) => {
        if (error.name !== 'AbortError') return
      })

    return () => controller.abort()
  }, [paymentReturn, returnedOrderId, paymentDraft])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${API_BASE}/api/arca/invoice-options`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'No pudimos obtener las opciones fiscales de ARCA.')
        setInvoiceOptions(data)
        setFormData((current) => {
          const selectedCondition = data.vatConditions?.find(
            (condition) => condition.id === Number(current.invoiceVatConditionId)
          )
          const needsInvoiceA = typeof current.needsInvoiceA === 'boolean'
            ? current.needsInvoiceA
            : ['A', 'ALEY'].includes(selectedCondition?.invoiceClass)
          return applyInvoiceMode(current, data, needsInvoiceA)
        })
        setInvoiceOptionsError(null)
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setInvoiceOptionsError(error.message)
      })
    return () => controller.abort()
  }, [])

  // Un borrador recuperado puede llegar después que las opciones de ARCA.
  // Recalculamos el modo visible desde la condición persistida para que una
  // Factura A anterior nunca reaparezca como consumidor final.
  useEffect(() => {
    if (!invoiceOptions || !formData.invoiceVatConditionId) return
    const selected = invoiceOptions.vatConditions?.find(
      (condition) => condition.id === Number(formData.invoiceVatConditionId)
    )
    if (!selected) return
    // El usuario puede haber pedido Factura A y ARCA resolver que el receptor
    // es Exento: en ese caso corresponde B, pero conservamos el modo de
    // consulta y el CUIT verificado hasta crear el pedido.
    if (formData.needsInvoiceA && selected.category === 'exempt') return
    const inferredNeedsInvoiceA = ['A', 'ALEY'].includes(selected.invoiceClass)
    if (inferredNeedsInvoiceA !== formData.needsInvoiceA) {
      setFormData((current) => applyInvoiceMode(current, invoiceOptions, inferredNeedsInvoiceA))
    }
  }, [invoiceOptions, formData.invoiceVatConditionId, formData.needsInvoiceA])

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
      invoiceName:  savedDraft?.invoiceName  || prev.invoiceName  || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
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
  const needsPersonalData = !user || Object.values(missingAccountFields).some(Boolean)

  useEffect(() => {
    if (authLoading || authResolved) return
    setAuthResolved(true)
    if (paymentReturn === 'failure') setStep(3)
    else if (user && !needsPersonalData) setStep(2)
  }, [authLoading, authResolved, user, needsPersonalData, paymentReturn])

  useEffect(() => {
    if (paymentReturn !== 'failure') return undefined

    sessionStorage.removeItem('fenix_pending_order_id')
    setShowPaymentFailureNotice(true)
    setStep(3)
    setSubmitting(Boolean(returnedOrderId && (returnedPaymentId || returnedMerchantOrderId)))
    setSubmitError(PAYMENT_FAILURE_MESSAGE)

    if (!returnedOrderId || (!returnedPaymentId && !returnedMerchantOrderId)) return undefined

    const controller = new AbortController()
    async function verifyRejectedPayment() {
      try {
        const response = await fetch(`${API_BASE}/api/orders/public/${returnedOrderId}/reconcile-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentId: returnedPaymentId,
            merchantOrderId: returnedMerchantOrderId,
            preferenceId: returnedPreferenceId,
          }),
          signal: controller.signal,
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'No pudimos verificar el pago')

        if (['paid', 'preparing', 'shipped', 'delivered'].includes(data.status)) {
          sessionStorage.removeItem(CHECKOUT_PAYMENT_DRAFT_KEY)
          navigate(`/order-confirmation?orderId=${returnedOrderId}&status=success`, { replace: true })
        }
      } catch (error) {
        // El webhook de Mercado Pago queda como respaldo. Mientras tanto el
        // cliente conserva el carrito y puede seguir en la etapa de pago.
        if (error.name === 'AbortError') return
      } finally {
        if (!controller.signal.aborted) setSubmitting(false)
      }
    }
    verifyRejectedPayment()
    return () => controller.abort()
  }, [paymentReturn, returnedOrderId, returnedPaymentId, returnedMerchantOrderId, returnedPreferenceId, navigate])

  useEffect(() => {
    if (!showPaymentFailureNotice) return undefined
    const timer = setTimeout(() => setShowPaymentFailureNotice(false), 7000)
    return () => clearTimeout(timer)
  }, [showPaymentFailureNotice])

  const localShippingZone = useMemo(() => {
    if (formData.deliveryType !== 'delivery') return null
    // El costo depende de la zona (CP), el peso total y el valor declarado
    // (para el seguro). El backend vuelve a cotizar todo antes de crear la orden.
    return getShippingForCP(formData.codigoPostal, formData.shippingService, {
      weightKg: totalWeight,
      declaredValue: totalPrice,
    })
  }, [formData.deliveryType, formData.codigoPostal, formData.shippingService, totalWeight, totalPrice])

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
  const shippingCost   = shippingZone?.price ?? null
  const transferDiscountAmount = formData.paymentMethod === 'bank_transfer'
    ? Math.round(totalPrice * Number(paymentConfig.bankTransfer?.discountPercent || 0)) / 100
    : 0
  const couponBase = Math.round((totalPrice - transferDiscountAmount) * 100) / 100
  const discountAmount = appliedCoupon?.discountAmount || 0
  const orderTotal = Math.round(((shippingCost != null ? couponBase + shippingCost : couponBase) - discountAmount) * 100) / 100

  async function handleApplyCoupon() {
    const code = discountCode.trim()
    if (!code) return
    setCouponChecking(true)
    setCouponError(null)
    try {
      const res = await fetch(`${API_BASE}/api/coupons/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotal: couponBase }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No pudimos validar el código')
      setAppliedCoupon(data)
      setDiscountCode('')
    } catch (err) {
      setAppliedCoupon(null)
      setCouponError(err.message || 'No pudimos validar el código')
    } finally {
      setCouponChecking(false)
    }
  }

  function handleRemoveCoupon() {
    setAppliedCoupon(null)
    setCouponError(null)
  }

  useEffect(() => {
    if (!appliedCoupon?.code) return undefined
    const controller = new AbortController()
    setCouponChecking(true)
    fetch(`${API_BASE}/api/coupons/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: appliedCoupon.code, subtotal: couponBase }),
      signal: controller.signal,
    })
      .then(async response => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'El cupón no aplica a este medio de pago')
        setAppliedCoupon(data)
        setCouponError(null)
      })
      .catch(error => {
        if (error.name !== 'AbortError') {
          setAppliedCoupon(null)
          setCouponError(error.message)
        }
      })
      .finally(() => { if (!controller.signal.aborted) setCouponChecking(false) })
    return () => controller.abort()
    // El backend vuelve a validar el cupón al confirmar el pedido.
  }, [formData.paymentMethod])

  // Estimación de entrega (Correo Argentino + preparación del pedido) — solo
  // tiene sentido pedirla cuando la zona ya resolvió a un costo concreto.
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
          // `subtotal` es también el valor declarado con el que se calcula el
          // seguro (2 %). `weight` elige el tramo de tarifa. Vista previa nada
          // más: POST /api/orders vuelve a resolver todo contra la DB.
          subtotal: String(totalPrice),
          weight: String(totalWeight),
          handlingDays: String(handlingDays),
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
  }, [formData.deliveryType, formData.codigoPostal, formData.shippingService, totalPrice, totalWeight, handlingDays])

  function setField(key, value) {
    const normalizedValue = key === 'invoiceDocNumber'
      ? value.replace(/\D/g, '').slice(0, Number(formData.invoiceDocType) === 80 ? 11 : 20)
      : value
    setFormData((prev) => ({ ...prev, [key]: normalizedValue }))
    if (errors[key]) setErrors((prev) => { const e = { ...prev }; delete e[key]; return e })
    if (key === 'email') {
      setAccountLoginRequired(false)
      setProfileError(null)
    }
  }

  function setInvoiceMode(needsInvoiceA) {
    setFormData((current) => applyInvoiceMode(current, invoiceOptions, needsInvoiceA))
    setErrors((current) => {
      const next = { ...current }
      delete next.invoiceName
      delete next.invoiceDocType
      delete next.invoiceDocNumber
      delete next.invoiceVatConditionId
      return next
    })
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
    const e = validateStep2(formData, shippingZone, handlingDays)
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
      ...validateStep2(formData, shippingZone, handlingDays),
      ...validateBilling(formData),
      ...validateInvoiceRecipient(formData, invoiceOptions),
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
        body: JSON.stringify({
          customer: {
            ...formData,
            invoiceRecipient: {
              name: formData.invoiceName || `${formData.nombre} ${formData.apellido}`.trim(),
              docType: Number(formData.invoiceDocType),
              docNumber: formData.invoiceDocNumber,
              vatConditionId: Number(formData.invoiceVatConditionId),
            },
          },
          items,
          discountCode: appliedCoupon?.code || undefined,
        }),
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
      const { orderId, checkoutUrl, paymentMethod, customerAccessToken } = await res.json()
      if (checkoutUrl) {
        try {
          sessionStorage.setItem(CHECKOUT_PAYMENT_DRAFT_KEY, JSON.stringify({ formData, appliedCoupon }))
        } catch { /* ignore storage quota */ }
        sessionStorage.setItem('fenix_pending_order_id', orderId)
        window.location.href = checkoutUrl
      } else {
        if (paymentMethod === 'bank_transfer' && customerAccessToken) {
          localStorage.setItem(`fenix_order_access_${orderId}`, customerAccessToken)
        }
        clearCart()
        navigate(`/order-confirmation?orderId=${orderId}&status=${paymentMethod === 'bank_transfer' ? 'transfer' : 'success'}`)
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
    <PageSEO title="Finalizar compra" description="Completá tu pedido en Fénix Iluminación y elegí Mercado Pago o transferencia bancaria." url="/checkout" />
    {showPaymentFailureNotice && paymentReturn === 'failure' && (
      <PaymentFailureNotice onClose={() => setShowPaymentFailureNotice(false)} />
    )}
    <div style={{ backgroundColor: 'var(--color-bg)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '70rem', margin: '0 auto', padding: '3rem 1.5rem 6rem' }}>

        <div className="fnx-checkout-layout">
          <aside className="fnx-checkout-summary-column">
            <OrderSummary
              items={items}
              totalPrice={totalPrice}
              deliveryType={formData.deliveryType}
              shippingZone={shippingZone}
              shippingCost={shippingCost}
              orderTotal={orderTotal}
              shippingConfig={shippingConfig}
              discountCode={discountCode}
              onDiscountCodeChange={setDiscountCode}
              appliedCoupon={appliedCoupon}
              discountAmount={discountAmount}
              transferDiscountAmount={transferDiscountAmount}
              couponChecking={couponChecking}
              couponError={couponError}
              onApplyCoupon={handleApplyCoupon}
              onRemoveCoupon={handleRemoveCoupon}
            />
          </aside>

          <main className="fnx-checkout-step-column">
            <SinglePageCheckout
              formData={formData}
              errors={errors}
              setField={setField}
              handlingDays={handlingDays}
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
              paymentRejected={paymentReturn === 'failure'}
              submitting={submitting || profileSaving || emailChecking}
              onConfirm={handleConfirm}
              invoiceOptions={invoiceOptions}
              invoiceOptionsError={invoiceOptionsError}
              onInvoiceModeChange={setInvoiceMode}
              paymentConfig={paymentConfig}
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

                {/* Elegir entre una sola opción no es elegir: el selector aparece
                    solo si vuelve a haber más de un servicio. */}
                {SHIPPING_SERVICES.length > 1 && (
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
                )}

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
                        {shippingZone.label}{SHIPPING_SERVICES.length > 1 ? ` · ${SHIPPING_SERVICES.find(({ id }) => id === formData.shippingService)?.label}` : ''}
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
                      ? 'Calculando la fecha de entrega...'
                      : deliveryEstimateMatches
                        ? `Tu pedido llega ${fmtVentanaEntrega(deliveryEstimate)}.`
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
                    : `Envío${servicioEnvioTexto(formData.shippingService)} a ${formData.direccion}, ${formData.ciudad} (CP ${formData.codigoPostal})`}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>
                  {formData.nombre} {formData.apellido} · {formData.telefono}
                </p>
                {formData.deliveryType === 'pickup' && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>
                    {formData.paymentMethod === 'bank_transfer' ? 'Pago por transferencia bancaria' : 'Pago online con Mercado Pago'}
                    {formData.pickupDate ? ` · Retirás el ${fmtDate(formData.pickupDate)}` : ''}
                  </p>
                )}
                {formData.deliveryType === 'delivery' && deliveryEstimateMatches && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>
                    Tu pedido llega {fmtVentanaEntrega(deliveryEstimate)}.
                  </p>
                )}
              </div>
            </div>

            <section style={{ marginBottom: '1.75rem' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text)' }}>
                Pago
              </h3>
              <PaymentMethodSelector value={formData.paymentMethod} onChange={value => setField('paymentMethod', value)} bankTransfer={paymentConfig.bankTransfer} />
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
                aria-label={formData.paymentMethod === 'bank_transfer' ? 'Confirmar pedido por transferencia' : 'Pagar con Mercado Pago'}
              >
                {submitting ? 'Procesando...' : formData.paymentMethod === 'bank_transfer' ? 'Confirmar pedido' : <><span>Pagar con</span><img src={mercadoPagoLogo} alt="Mercado Pago" /></>}
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

function PaymentFailureNotice({ onClose }) {
  return (
    <div className="fnx-added-notice fnx-payment-failure-notice" role="alert" aria-live="assertive">
      <div className="fnx-added-notice__title">
        <span>Mercado Pago</span>
        <strong>Pago no efectuado</strong>
      </div>
      <div className="fnx-added-notice__body">
        <button type="button" onClick={onClose} aria-label="Cerrar notificación">×</button>
        <img src={mercadoPagoLogo} alt="" />
        <button type="button" onClick={onClose}>Intentar nuevamente</button>
      </div>
    </div>
  )
}

function PaymentMethodSelector({ value, onChange, bankTransfer }) {
  const options = [
    {
      value: 'mercadopago',
      title: 'Mercado Pago',
      description: 'Te redirigiremos a Mercado Pago para completar el pago.',
      logo: <img src={mercadoPagoLogo} alt="Mercado Pago" />,
    },
    ...(bankTransfer?.enabled ? [{
      value: 'bank_transfer',
      title: 'Transferencia bancaria',
      description: `${bankTransfer.discountPercent}% de descuento en los productos. Después podrás cargar el comprobante.`,
      logo: <span aria-hidden="true" style={{ fontSize: 20 }}>🏦</span>,
    }] : []),
  ]

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {options.map(option => {
        const selected = value === option.value
        return (
          <button
            type="button"
            key={option.value}
            onClick={() => onChange(option.value)}
            className="fnx-payment-option"
            aria-pressed={selected}
            style={{
              width: '100%',
              textAlign: 'left',
              borderColor: selected ? 'var(--color-primary)' : 'var(--color-border)',
              background: selected ? 'rgba(204,0,0,.035)' : 'var(--color-surface)',
              cursor: 'pointer',
            }}
          >
            <div>
              <span className="fnx-radio-dot" style={{ opacity: selected ? 1 : 0.3 }} />
              <strong>{option.title}</strong>
              {option.logo}
            </div>
            <p>{option.description}</p>
          </button>
        )
      })}
    </div>
  )
}

function SinglePageCheckout({
  formData, errors, setField, handlingDays, user, onLogout, navigate, shippingZone,
  deliveryEstimate, deliveryEstimateMatches, deliveryEstimateLoading,
  accountLoginRequired, profileError, submitError, submitting, onConfirm,
  paymentRejected,
  invoiceOptions, invoiceOptionsError,
  onInvoiceModeChange,
  paymentConfig,
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
          <>
            <h2>Datos de contacto</h2>
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
          </>
        ) : (
          <>
            <div className="fnx-checkout-section-title">
              <h2>Datos de contacto</h2>
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

        {formData.deliveryType === 'delivery' ? (
          <>
            <h3 className="fnx-checkout-subheading">Datos del destinatario</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nombre" error={errors.nombre}>
                <DarkInput placeholder="Nombre" value={formData.nombre} onChange={(value) => setField('nombre', value)} hasError={!!errors.nombre} />
              </Field>
              <Field label="Apellido" error={errors.apellido}>
                <DarkInput placeholder="Apellido" value={formData.apellido} onChange={(value) => setField('apellido', value)} hasError={!!errors.apellido} />
              </Field>
            </div>
            <Field label="Teléfono" error={errors.telefono}>
              <DarkInput type="tel" placeholder="Teléfono" value={formData.telefono} onChange={(value) => setField('telefono', value)} hasError={!!errors.telefono} />
            </Field>
            <Field label="País / Región"><DarkInput value="Argentina" onChange={() => {}} readOnly /></Field>
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
              <DarkInput type="date" value={formData.pickupDate} onChange={(value) => setField('pickupDate', value)} hasError={!!errors.pickupDate} min={fechaISOLocal(fechaRetiroMinima(handlingDays))} />
            </Field>
            {!errors.pickupDate && (
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.375rem' }}>
                {textoRetiroDisponible(handlingDays)}.
              </p>
            )}
          </>
        )}

        {formData.deliveryType === 'delivery' && (
          <div className="fnx-shipping-methods">
            <h3>{SHIPPING_SERVICES.length > 1 ? 'Métodos de envío' : 'Envío'}</h3>
            {formData.codigoPostal.trim().length < 4 ? (
              <div className="fnx-shipping-placeholder">Ingresá tu dirección de envío para ver los métodos disponibles.</div>
            ) : (
              <>
                {SHIPPING_SERVICES.map((service) => {
                  // Con un único servicio, `shippingZone` (ya combina la vista
                  // previa local con la respuesta del backend, peso y seguro
                  // incluidos) es la cotización de esa fila.
                  const optionQuote = service.id === formData.shippingService ? shippingZone : null
                  const contenido = (
                    <>
                      <span><b>{service.label}</b>{optionQuote?.description && <small>{optionQuote.description}</small>}</span>
                      <strong>{optionQuote?.price == null ? 'A confirmar' : optionQuote.price === 0 ? 'Gratis' : fmt(optionQuote.price)}</strong>
                    </>
                  )
                  // El costo se sigue mostrando; lo que desaparece es el gesto de
                  // elegir, que con un único servicio sólo confunde.
                  if (SHIPPING_SERVICES.length === 1) {
                    return <div key={service.id} className="fnx-shipping-single">{contenido}</div>
                  }
                  return (
                    <button
                      type="button"
                      key={service.id}
                      className={formData.shippingService === service.id ? 'is-active' : ''}
                      onClick={() => setField('shippingService', service.id)}
                    >
                      {contenido}
                    </button>
                  )
                })}
                <p className="fnx-delivery-estimate">
                  {deliveryEstimateLoading
                    ? 'Calculando la fecha de entrega...'
                    : deliveryEstimateMatches
                      ? `Tu pedido llega ${fmtVentanaEntrega(deliveryEstimate)}.`
                      : ''}
                </p>
              </>
            )}
          </div>
        )}
      </section>

      <InvoiceRecipientFields
        formData={formData}
        errors={errors}
        setField={setField}
        options={invoiceOptions}
        loadingError={invoiceOptionsError}
        onInvoiceModeChange={onInvoiceModeChange}
      />

      <BillingAddress formData={formData} errors={errors} setField={setField} />

      <section className="fnx-checkout-section">
        <h2>Pago</h2>
        <p className="fnx-section-caption">Elegí cómo querés abonar tu pedido.</p>
        <PaymentMethodSelector
          value={formData.paymentMethod}
          onChange={value => setField('paymentMethod', value)}
          bankTransfer={paymentConfig.bankTransfer}
        />
      </section>

      {(profileError || (!paymentRejected && submitError)) && (
        <p className="fnx-checkout-submit-error">{profileError || submitError}</p>
      )}

      <button type="button" className="fnx-pay-now" onClick={onConfirm} disabled={submitting || !invoiceOptions}>
        {submitting
          ? 'Procesando...'
          : !invoiceOptions
            ? 'Cargando datos fiscales...'
            : formData.paymentMethod === 'bank_transfer'
              ? 'Confirmar pedido'
              : 'Pagar ahora'}
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

function InvoiceRecipientFields({
  formData, errors, setField, options, loadingError, onInvoiceModeChange,
}) {
  const [taxpayerLookup, setTaxpayerLookup] = useState({ status: 'idle' })
  const aConditions = options?.vatConditions
    ?.filter((option) => ['A', 'ALEY'].includes(option.invoiceClass)) || []
  const supportsInvoiceA = aConditions.length > 0
  const cuit = String(formData.invoiceDocNumber || '').replace(/\D/g, '')

  useEffect(() => {
    if (!formData.needsInvoiceA || cuit.length !== 11 || !options) {
      setTaxpayerLookup({ status: 'idle' })
      return undefined
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setTaxpayerLookup({ status: 'loading' })
      fetch(`${API_BASE}/api/arca/cuit-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuit }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const data = await response.json().catch(() => ({}))
          if (!response.ok) {
            const error = new Error(data.error || 'No pudimos consultar el CUIT en ARCA.')
            error.code = data.code
            error.manualFallbackAllowed = data.manualFallbackAllowed === true
            error.consumerFinalAllowed = data.consumerFinalAllowed === true
            throw error
          }
          return data
        })
        .then((profile) => {
          const cuitDocument = options.documents?.find((document) => document.kind === 'cuit')
          setField('invoiceName', profile.name)
          setField('invoiceVatConditionId', String(profile.vatConditionId))
          setField('consumerFinalWithoutCuit', false)
          if (cuitDocument) setField('invoiceDocType', String(cuitDocument.id))
          setTaxpayerLookup({ status: 'success', profile })
        })
        .catch((error) => {
          if (error.name === 'AbortError') return
          setField('invoiceName', '')
          setField('invoiceVatConditionId', '')
          setTaxpayerLookup({
            status: 'error',
            message: error.message,
            code: error.code,
            manualFallbackAllowed: error.manualFallbackAllowed === true,
            consumerFinalAllowed: error.consumerFinalAllowed === true,
          })
        })
    }, 450)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [cuit, formData.needsInvoiceA, options])

  const changeDocumentNumber = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, formData.consumerFinalWithoutCuit ? 8 : 11)
    setField('invoiceDocNumber', digits)
    if (formData.consumerFinalWithoutCuit) {
      const document = options?.documents?.find((option) => (
        option.kind === (digits ? 'dni' : 'consumer_final')
      ))
      if (document) setField('invoiceDocType', String(document.id))
      return
    }
    setField('consumerFinalWithoutCuit', false)
    if (formData.needsInvoiceA) {
      setField('invoiceName', '')
      setField('invoiceVatConditionId', '')
      const cuitDocument = options?.documents?.find((option) => option.kind === 'cuit')
      if (cuitDocument) setField('invoiceDocType', String(cuitDocument.id))
    } else {
      const documentKind = documentKindForNumber(digits)
      const document = options?.documents?.find((option) => option.kind === documentKind)
      if (document) setField('invoiceDocType', String(document.id))
    }
  }

  const continueAsConsumerFinal = () => {
    const consumerCondition = options?.vatConditions
      ?.find((condition) => condition.category === 'consumer_final')
    const anonymousDocument = options?.documents
      ?.find((document) => document.kind === 'consumer_final')
    onInvoiceModeChange(false)
    setField('invoiceName', `${formData.nombre || ''} ${formData.apellido || ''}`.trim())
    setField('invoiceDocNumber', '')
    if (anonymousDocument) setField('invoiceDocType', String(anonymousDocument.id))
    if (consumerCondition) setField('invoiceVatConditionId', String(consumerCondition.id))
    setField('consumerFinalWithoutCuit', true)
    setTaxpayerLookup({ status: 'idle' })
  }

  return (
    <section className="fnx-checkout-section">
      <h2>Datos de facturación</h2>
      {loadingError && <p className="fnx-checkout-submit-error">{loadingError}</p>}
      {!options && !loadingError && <p className="fnx-section-caption">Consultando parámetros de ARCA...</p>}
      {options && (
        <>
          <Field label="País / Región"><DarkInput value="Argentina" onChange={() => {}} readOnly /></Field>
          <label className={`fnx-checkout-checkbox${supportsInvoiceA ? '' : ' is-disabled'}`}>
            <input
              type="checkbox"
              checked={Boolean(formData.needsInvoiceA)}
              disabled={!supportsInvoiceA}
              onChange={(event) => {
                setTaxpayerLookup({ status: 'idle' })
                onInvoiceModeChange(event.target.checked)
              }}
            />
            Necesito factura A
          </label>
          {!supportsInvoiceA && (
            <p className="fnx-section-caption fnx-invoice-unavailable">
              Factura A no está habilitada para la configuración fiscal actual.
            </p>
          )}

          {formData.needsInvoiceA ? (
            <div className="fnx-invoice-conditional">
              <Field label="CUIT" error={errors.invoiceDocNumber || errors.invoiceDocType}>
                <DarkInput
                  inputMode="numeric"
                  placeholder="CUIT, 11 dígitos"
                  value={formData.invoiceDocNumber}
                  onChange={changeDocumentNumber}
                  hasError={!!(errors.invoiceDocNumber || errors.invoiceDocType)}
                />
              </Field>
              {cuit.length < 11 && (
                <p className="fnx-taxpayer-status is-hint">
                  Al completar el CUIT consultaremos la razón social y la condición fiscal en ARCA.
                </p>
              )}
              {taxpayerLookup.status === 'loading' && (
                <p className="fnx-taxpayer-status is-loading" role="status">Consultando CUIT en ARCA...</p>
              )}
              {taxpayerLookup.status === 'error' && (
                <div className="fnx-taxpayer-resolution" role="alert">
                  <p className={`fnx-taxpayer-status ${taxpayerLookup.manualFallbackAllowed ? 'is-warning' : 'is-error'}`}>
                    {taxpayerLookup.message}
                  </p>
                  {taxpayerLookup.consumerFinalAllowed && (
                    <button type="button" className="fnx-taxpayer-consumer-button" onClick={continueAsConsumerFinal}>
                      Continuar como consumidor final
                    </button>
                  )}
                </div>
              )}
              {taxpayerLookup.status === 'success' && (
                <div className="fnx-taxpayer-confirmed">
                  <span className="fnx-taxpayer-confirmed__title">Datos informados por ARCA</span>
                  <dl className="fnx-taxpayer-summary">
                    <div>
                      <dt>Razón social</dt>
                      <dd>{taxpayerLookup.profile.name}</dd>
                    </div>
                    <div>
                      <dt>Condición frente al IVA</dt>
                      <dd>{taxpayerLookup.profile.vatConditionDescription}</dd>
                    </div>
                  </dl>
                  {taxpayerLookup.profile.invoiceClass === 'B' && (
                    <p className="fnx-taxpayer-invoice-note">
                      Por su condición fiscal corresponde Factura B. Podés continuar con la compra.
                    </p>
                  )}
                </div>
              )}
              {taxpayerLookup.status === 'error' && taxpayerLookup.manualFallbackAllowed && (
                <div className="fnx-taxpayer-manual">
                  <p>Completá estos datos como figuran en la constancia de inscripción.</p>
                  <Field label="Razón social" error={errors.invoiceName}>
                    <DarkInput
                      placeholder="Razón social"
                      value={formData.invoiceName}
                      onChange={(value) => setField('invoiceName', value)}
                      hasError={!!errors.invoiceName}
                    />
                  </Field>
                  <Field label="Condición frente al IVA" error={errors.invoiceVatConditionId}>
                    <DarkSelect
                      value={formData.invoiceVatConditionId}
                      onChange={(value) => setField('invoiceVatConditionId', value)}
                      hasError={!!errors.invoiceVatConditionId}
                      placeholder="Elegí una condición"
                      options={aConditions}
                    />
                  </Field>
                </div>
              )}
            </div>
          ) : (
            <>
              {formData.consumerFinalWithoutCuit && (
                <p className="fnx-taxpayer-consumer-note">
                  Continuarás como consumidor final. Se emitirá Factura B sin usar el CUIT consultado.
                </p>
              )}
              <Field
                label={formData.consumerFinalWithoutCuit ? 'DNI (opcional)' : 'DNI o CUIT'}
                error={errors.invoiceDocNumber || errors.invoiceDocType}
              >
                <DarkInput
                  inputMode="numeric"
                  placeholder={formData.consumerFinalWithoutCuit ? 'DNI (opcional)' : 'DNI o CUIT'}
                  value={formData.invoiceDocNumber}
                  onChange={changeDocumentNumber}
                  hasError={!!(errors.invoiceDocNumber || errors.invoiceDocType)}
                />
              </Field>
            </>
          )}

          {formData.deliveryType === 'pickup' && (
            <div className="fnx-checkout-person-block">
              <h3>Persona que pagará el pedido</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Nombre" error={errors.nombre}>
                  <DarkInput placeholder="Nombre" value={formData.nombre} onChange={(value) => setField('nombre', value)} hasError={!!errors.nombre} />
                </Field>
                <Field label="Apellido" error={errors.apellido}>
                  <DarkInput placeholder="Apellido" value={formData.apellido} onChange={(value) => setField('apellido', value)} hasError={!!errors.apellido} />
                </Field>
              </div>
              <Field label="Teléfono" error={errors.telefono}>
                <DarkInput type="tel" placeholder="Teléfono" value={formData.telefono} onChange={(value) => setField('telefono', value)} hasError={!!errors.telefono} />
              </Field>
              <label className="fnx-checkout-checkbox">
                <input
                  type="checkbox"
                  checked={Boolean(formData.pickupByOtherPerson)}
                  onChange={(event) => setField('pickupByOtherPerson', event.target.checked)}
                />
                Otra persona retirará el pedido
              </label>
              {formData.pickupByOtherPerson && (
                <div className="fnx-invoice-conditional">
                  <h3>Persona que retirará el pedido</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Nombre" error={errors.pickupPersonName}>
                      <DarkInput placeholder="Nombre" value={formData.pickupPersonName} onChange={(value) => setField('pickupPersonName', value)} hasError={!!errors.pickupPersonName} />
                    </Field>
                    <Field label="Apellido" error={errors.pickupPersonLastName}>
                      <DarkInput placeholder="Apellido" value={formData.pickupPersonLastName} onChange={(value) => setField('pickupPersonLastName', value)} hasError={!!errors.pickupPersonLastName} />
                    </Field>
                  </div>
                </div>
              )}
            </div>
          )}
          {options.stale && (
            <p className="fnx-section-caption">Se está usando la última respuesta válida guardada de ARCA.</p>
          )}
        </>
      )}
    </section>
  )
}

function BillingAddress({ formData, errors, setField }) {
  const usesShipping = formData.deliveryType === 'delivery' && formData.billingSameAsShipping

  return (
    <section className="fnx-billing-address">
      {formData.deliveryType === 'delivery' && (
        <label className="fnx-checkout-checkbox fnx-billing-same-checkbox">
          <input
            type="checkbox"
            checked={Boolean(formData.billingSameAsShipping)}
            onChange={(event) => setField('billingSameAsShipping', event.target.checked)}
          />
          Mis datos de facturación y entrega son los mismos
        </label>
      )}

      {!usesShipping && (
        <div className="fnx-billing-address__fields">
          <h3>Dirección de facturación</h3>
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
function OrderSummary({
  items, totalPrice, deliveryType, shippingZone, shippingCost, orderTotal, shippingConfig,
  discountCode, onDiscountCodeChange, appliedCoupon, discountAmount, transferDiscountAmount,
  couponChecking, couponError,
  onApplyCoupon, onRemoveCoupon,
}) {
  const showFreeShippingNote =
    deliveryType === 'delivery' && shippingCost != null && shippingCost > 0 && shippingConfig?.freeShippingThreshold
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
            key={`${item.id}-${item.color ?? 'default'}-${item.size ?? 'default'}-${item.tone ?? 'default'}`}
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
                {item.quantity} × {fmt(item.price)}{item.color ? ` · ${item.color}` : ''}{item.tone ? ` · ${item.tone}` : ''}{item.size ? ` · ${item.size}` : ''}
              </p>
            </div>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)', flexShrink: 0 }}>
              {fmt(item.price * item.quantity)}
            </p>
          </li>
        ))}
      </ul>

      {appliedCoupon ? (
        <div className="fnx-checkout-discount fnx-checkout-discount-applied">
          <span>
            Código <strong>{appliedCoupon.code}</strong> aplicado
            {appliedCoupon.type === 'percentage' ? ` (-${appliedCoupon.value}%)` : ''}
          </span>
          <button type="button" onClick={onRemoveCoupon}>Quitar</button>
        </div>
      ) : (
        <div className="fnx-checkout-discount">
          <input
            type="text"
            placeholder="Código de descuento"
            aria-label="Código de descuento"
            value={discountCode}
            onChange={(e) => onDiscountCodeChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onApplyCoupon() } }}
            disabled={couponChecking}
          />
          <button type="button" onClick={onApplyCoupon} disabled={couponChecking || !discountCode.trim()}>
            {couponChecking ? '...' : 'Aplicar'}
          </button>
        </div>
      )}
      {couponError && (
        <p style={{ margin: '-0.375rem 0 0.5rem', padding: '0 1.5rem', fontSize: '0.75rem', color: '#b91c1c' }}>
          {couponError}
        </p>
      )}

      <div style={{ padding: '0 1.5rem', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
          <span>Subtotal</span>
          <span>{fmt(totalPrice)}</span>
        </div>
        {transferDiscountAmount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', fontSize: '0.875rem', color: '#166534', fontWeight: 600 }}>
            <span>Descuento por transferencia</span>
            <span>-{fmt(transferDiscountAmount)}</span>
          </div>
        )}
        {discountAmount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', fontSize: '0.875rem', color: '#166534', fontWeight: 600 }}>
            <span>Descuento{appliedCoupon ? ` · ${appliedCoupon.code}` : ''}</span>
            <span>-{fmt(discountAmount)}</span>
          </div>
        )}
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
        {showFreeShippingNote && (
          <p style={{ margin: '-0.5rem 0 0.75rem', fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
            El envío gratis aplica a todo el país a partir de {fmt(shippingConfig.freeShippingThreshold)}.
          </p>
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

function DarkSelect({ value, onChange, options, placeholder, hasError }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
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
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>{option.description || option.id}</option>
      ))}
    </select>
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

