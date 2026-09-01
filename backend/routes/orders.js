import { Router } from 'express'
import { pool } from '../db/pool.js'
import { createPreference } from '../services/mercadopago.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { attachUserIfPresent, requireAuth } from '../middleware/requireAuth.js'
// stockReservation.js quedó fuera de servicio: la tienda ya no lleva stock (ver
// products.stock_inmediato en schema.sql). Reserva y liberación se apagaron
// juntas a propósito — si se reactiva una sin la otra, el stock se descuadra
// solo en cada pedido cancelado.
import { estimateDeliveryDate } from '../services/correoArgentino.js'
import { addBusinessDays } from '../services/businessDays.js'
import { SHIPPING_SERVICES, normalizeShippingService, qualifiesForFreeShipping } from '../config/shipping.js'
import { quoteShipping } from '../services/shippingQuotes.js'
import { sendBankTransferInstructions, sendOrderConfirmationNotifications } from '../services/orderNotifications.js'
import { PaymentReconciliationError, reconcileMercadoPagoReturn } from '../services/mercadopagoPayments.js'
import { sendReviewInvitationForOrder } from '../services/reviewInvitations.js'
import { isValidEmail, normalizeEmail } from '../utils/email.js'
import { resolveVariantRule, ruleMatches } from '../services/productVariants.js'
import { resolvePublicOptionPrice, resolvePublicPrice } from '../services/publicPricing.js'
import { evaluateCoupon, findCouponByCode } from '../services/coupons.js'
import {
  buildReceiverData,
  InvoiceValidationError,
  validateReceiverForVoucher,
} from '../services/invoiceFiscal.js'
import { getInvoiceOptions } from '../services/arcaParameters.js'
import {
  ArcaTaxpayerRegistryError,
  lookupTaxpayer,
  profileForInvoiceRecipient,
} from '../services/arcaTaxpayerRegistry.js'
import { safeArcaErrorMessage } from '../services/arcaSafeLog.js'
import { DEFAULT_VAT_RATE } from '../config/tax.js'
import {
  calculateTransferSubtotal,
  createCustomerAccessToken,
  hashCustomerAccessToken,
  normalizeBankTransferSettings,
  roundMoney,
  validateBankTransferSettings,
} from '../services/bankTransfer.js'
import 'dotenv/config'

const router = Router()

// Pedidos pay-in-store sin pagar/retirar: vencen a los 2 días de la fecha de
// retiro elegida. Pedidos mercadopago sin completar el pago: vencen a los 45
// minutos (MP no avisa cuando el cliente simplemente abandona el checkout).
const PENDING_PAYMENT_EXPIRY_MINUTES = 45

export const CUSTOMER_ORDER_STATUSES = ['reserved', 'paid', 'preparing', 'shipped', 'delivered']

export async function verifyInvoiceARecipient(
  receiver,
  invoiceOptions,
  taxpayerLookup = lookupTaxpayer,
  { lookupRequested = false } = {},
) {
  const selectedCondition = invoiceOptions?.vatConditions
    ?.find(option => option.id === receiver.vatConditionId)
  if (!lookupRequested && !['A', 'ALEY'].includes(selectedCondition?.invoiceClass)) {
    return { receiver, condition: selectedCondition, verified: false }
  }

  try {
    const profile = profileForInvoiceRecipient(
      await taxpayerLookup(receiver.docNumber),
      invoiceOptions,
    )
    const condition = invoiceOptions.vatConditions
      .find(option => option.id === profile.vatConditionId)
    return {
      receiver: {
        ...receiver,
        name: profile.name,
        docType: 80,
        docNumber: profile.cuit,
        vatConditionId: profile.vatConditionId,
      },
      condition,
      verified: true,
    }
  } catch (error) {
    if (error instanceof ArcaTaxpayerRegistryError && error.recoverable === false) {
      throw new InvoiceValidationError(error.message, error.code)
    }
    return { receiver, condition: selectedCondition, verified: false, lookupError: error }
  }
}

function dateInputValue(value) {
  if (!value) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

export function buildRetryCheckoutData(order) {
  const nameParts = String(order?.customer_name || '').trim().split(/\s+/).filter(Boolean)
  const fallbackFirstName = nameParts.shift() || ''
  return {
    nombre: order?.account_first_name || fallbackFirstName,
    apellido: order?.account_last_name || nameParts.join(' '),
    email: order?.customer_email || '',
    telefono: order?.customer_phone || '',
    invoiceName: order?.invoice_recipient_name || order?.customer_name || '',
    invoiceDocType: order?.invoice_doc_type == null ? '' : String(order.invoice_doc_type),
    invoiceDocNumber: order?.invoice_doc_number || '',
    invoiceVatConditionId: order?.invoice_vat_condition_id == null ? '' : String(order.invoice_vat_condition_id),
    deliveryType: order?.delivery_type || 'delivery',
    paymentMethod: order?.payment_method || 'mercadopago',
    shippingService: normalizeShippingService(order?.shipping_service),
    pickupDate: dateInputValue(order?.pickup_date),
    direccion: order?.address || '',
    piso: order?.address_extra || '',
    ciudad: order?.city || '',
    codigoPostal: order?.postal_code || '',
    provincia: order?.province || 'Buenos Aires',
    billingSameAsShipping: order?.billing_same_as_shipping !== false,
    billingAddress: order?.billing_address || '',
    billingAddressExtra: order?.billing_address_extra || '',
    billingCity: order?.billing_city || '',
    billingPostalCode: order?.billing_postal_code || '',
    billingProvince: order?.billing_province || 'Buenos Aires',
    pickupByOtherPerson: Boolean(order?.pickup_person_name || order?.pickup_person_last_name),
    pickupPersonName: order?.pickup_person_name || '',
    pickupPersonLastName: order?.pickup_person_last_name || '',
  }
}

// ── Genera número de orden legible (FX-A3B9C2) ───────────────────────────────
function generateOrderNumber() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let rand = ''
  for (let i = 0; i < 6; i++) rand += chars[Math.floor(Math.random() * chars.length)]
  return `FX-${rand}`
}

// Combina color + tono en una sola clave de fila para variant_stock: un
// producto puede tener color de carcasa y tono de luz (cálido/neutro/frío) a
// la vez, pero la matriz de stock sigue siendo 2D (fila × medida). Misma
// convención en ProductModal (AdminDashboard.jsx) y ProductDetail.jsx — si
// se cambia acá hay que cambiarla en los tres lados.
export function combineVariantRowKey(selectedColor, selectedTone) {
  if (selectedColor && selectedTone) return `${selectedColor} / ${selectedTone}`
  return selectedColor || selectedTone || '_'
}

// Si el color, el tono y la medida elegidos tienen precio propio, la medida
// manda (suele ser lo que más cambia el costo, ej. largo de un cable); el
// tono pisa al color, y el color solo se usa si ni el tono ni la medida
// tienen precio propio.
export function resolveProductVariantPrice(product, selectedColor, selectedSize, selectedTone) {
  const usdArsRate = Number(product?.usd_ars_rate) || 1510
  const basePrice = resolvePublicPrice({
    priceWithTax: product?.precio_iva,
    priceWithTaxUsd: product?.precio_iva_usd,
    price: product?.precio_venta,
    priceUsd: product?.precio_venta_usd,
    currency: product?.price_currency,
    usdArsRate,
  })
  if (basePrice == null) return { error: 'missing_price', price: null }
  let price = basePrice
  const hasOption = (options, key, selected) => !selected || !options.length || options.some(option =>
    String(option?.[key] || '').localeCompare(String(selected), 'es-AR', { sensitivity: 'base' }) === 0
  )
  const availableColors = Array.isArray(product.color_options) ? product.color_options : []
  const availableSizes = Array.isArray(product.size_options) ? product.size_options : []
  const availableTones = Array.isArray(product.tone_options) ? product.tone_options : []
  if (!hasOption(availableColors, 'name', selectedColor)) return { error: 'invalid_color', price: null }
  if (!hasOption(availableSizes, 'label', selectedSize)) return { error: 'invalid_size', price: null }
  if (!hasOption(availableTones, 'name', selectedTone)) return { error: 'invalid_tone', price: null }
  const normalizedRules = (Array.isArray(product?.variant_rules) ? product.variant_rules : []).map(rule => ({
    ...rule,
    precio_publico: resolvePublicPrice({
      priceWithTax: rule.precio_iva,
      priceWithTaxUsd: rule.precio_iva_usd,
      price: rule.precio_venta,
      priceUsd: rule.precio_venta_usd,
      currency: rule.price_currency,
      usdArsRate,
    }),
  }))
  const priceRule = resolveVariantRule(normalizedRules, {
    color: selectedColor, size: selectedSize, tone: selectedTone,
  }, 'precio_publico')
  if (priceRule?.error) return { error: 'invalid_variant', price: null }
  if (priceRule) return { error: null, price: priceRule.precio_publico, ruleId: priceRule.id }
  if (normalizedRules.length && !normalizedRules.some(rule => ruleMatches(rule, {
    color: selectedColor, size: selectedSize, tone: selectedTone,
  }))) return { error: 'invalid_variant', price: null }

  if (selectedColor) {
    const colors = Array.isArray(product.color_options) ? product.color_options : []
    const variant = colors.find(color =>
      String(color?.name || '').localeCompare(String(selectedColor), 'es-AR', { sensitivity: 'base' }) === 0
    )
    if (colors.length && !variant) return { error: 'invalid_color', price: null }
    const variantPrice = resolvePublicOptionPrice(variant, product?.price_currency, usdArsRate)
    if (variantPrice != null) price = variantPrice
  }

  if (selectedTone) {
    const tones = Array.isArray(product.tone_options) ? product.tone_options : []
    const variant = tones.find(tone =>
      String(tone?.name || '').localeCompare(String(selectedTone), 'es-AR', { sensitivity: 'base' }) === 0
    )
    if (tones.length && !variant) return { error: 'invalid_tone', price: null }
    const variantPrice = resolvePublicOptionPrice(variant, product?.price_currency, usdArsRate)
    if (variantPrice != null) price = variantPrice
  }

  if (selectedSize) {
    const sizes = Array.isArray(product.size_options) ? product.size_options : []
    const variant = sizes.find(size =>
      String(size?.label || '').localeCompare(String(selectedSize), 'es-AR', { sensitivity: 'base' }) === 0
    )
    if (sizes.length && !variant) return { error: 'invalid_size', price: null }
    const variantPrice = resolvePublicOptionPrice(variant, product?.price_currency, usdArsRate)
    if (variantPrice != null) price = variantPrice
  }

  return { error: null, price }
}

// Si el producto carga stock por combinación exacta (variant_stock no vacío),
// resuelve a qué celda de esa matriz corresponde el color+tono/medida
// elegidos — '_' es el comodín para la dimensión que el producto no usa.
// Devuelve null si el producto no usa stock por variante (ese item sigue
// reservando contra el `stock` plano de siempre, sin cambios). Si el
// producto sí lo usa pero la combinación pedida no es una celda cargada,
// devuelve error 'invalid_variant'.
export function resolveVariantStockPath(product, selectedColor, selectedSize, selectedTone) {
  const normalizedRules = Array.isArray(product?.variant_rules) ? product.variant_rules : []
  const stockRule = resolveVariantRule(normalizedRules, {
    color: selectedColor, size: selectedSize, tone: selectedTone,
  }, 'stock')
  if (stockRule?.error) return { error: 'invalid_variant' }
  if (stockRule) return { error: null, variantRuleId: stockRule.id }
  if (normalizedRules.length) return { error: 'invalid_variant' }
  const variantStock = product?.variant_stock
  const colorKeys = variantStock && typeof variantStock === 'object' ? Object.keys(variantStock) : []
  if (!colorKeys.length) return null

  const targetRowKey = combineVariantRowKey(selectedColor, selectedTone)
  const colorKey = colorKeys.find(key =>
    String(key).localeCompare(targetRowKey, 'es-AR', { sensitivity: 'base' }) === 0
  )
  if (!colorKey) return { error: 'invalid_variant' }

  const sizeMap = variantStock[colorKey]
  const sizeKeys = sizeMap && typeof sizeMap === 'object' ? Object.keys(sizeMap) : []
  const sizeKey = sizeKeys.find(key =>
    key === '_' ? !selectedSize : String(key).localeCompare(String(selectedSize || ''), 'es-AR', { sensitivity: 'base' }) === 0
  )
  if (!sizeKey) return { error: 'invalid_variant' }

  return { error: null, colorKey, sizeKey }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orders
// Body: { customer: {...formData incl. deliveryType/paymentMethod/pickupDate}, items }
// Crea la orden en DB (reservando stock) + preferencia MP si corresponde.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', attachUserIfPresent, async (req, res) => {
  try {
    const { customer, items } = req.body
    const deliveryType  = customer?.deliveryType
    const pickupDate    = customer?.pickupDate
    const paymentMethod = customer?.paymentMethod || 'mercadopago'
    const shippingService = String(customer?.shippingService || SHIPPING_SERVICES[0]).toLowerCase()
    let customerEmail   = normalizeEmail(customer?.email)
    let orderUserId     = req.userId || null

    let invoiceReceiver = buildReceiverData(customer)
    const invoiceOptions = await getInvoiceOptions()
    if (!invoiceOptions.documents.some(option => option.id === invoiceReceiver.docType)) {
      return res.status(400).json({ error: 'El tipo de documento fiscal no fue informado por ARCA' })
    }
    let receiverVatCondition = invoiceOptions.vatConditions
      .find(option => option.id === invoiceReceiver.vatConditionId)
    if (!receiverVatCondition) {
      return res.status(400).json({ error: 'La condición IVA no es válida para el emisor configurado' })
    }
    if (!receiverVatCondition.allowedDocumentTypeIds.includes(invoiceReceiver.docType)) {
      return res.status(400).json({ error: 'El documento no corresponde a la condición IVA elegida' })
    }
    const registryVerification = await verifyInvoiceARecipient(
      invoiceReceiver,
      invoiceOptions,
      lookupTaxpayer,
      { lookupRequested: customer?.needsInvoiceA === true },
    )
    invoiceReceiver = registryVerification.receiver
    receiverVatCondition = registryVerification.condition
    if (!receiverVatCondition?.allowedDocumentTypeIds.includes(invoiceReceiver.docType)) {
      return res.status(400).json({ error: 'El documento no corresponde a la condición fiscal informada por ARCA' })
    }
    if (registryVerification.lookupError) {
      console.warn(
        '[POST /api/orders] padrón ARCA no disponible; se conserva validación fiscal manual',
        registryVerification.lookupError.code || registryVerification.lookupError.name,
      )
    }
    const customerDni = invoiceReceiver.docType === 96
      ? invoiceReceiver.docNumber
      : String(customer?.dni || '').replace(/\D/g, '') || null
    const billingSameAsShipping = deliveryType === 'delivery' && customer?.billingSameAsShipping !== false
    const pickupByOtherPerson = deliveryType === 'pickup' && customer?.pickupByOtherPerson === true
    const pickupPersonName = pickupByOtherPerson ? String(customer?.pickupPersonName || '').trim() : null
    const pickupPersonLastName = pickupByOtherPerson ? String(customer?.pickupPersonLastName || '').trim() : null

    if (!isValidEmail(customerEmail) || !customer?.nombre || !items?.length) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }
    if (!['pickup', 'delivery'].includes(deliveryType)) {
      return res.status(400).json({ error: 'Modalidad de entrega inválida' })
    }
    if (!['mercadopago', 'bank_transfer'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Método de pago inválido' })
    }
    if (deliveryType === 'pickup' && !pickupDate) {
      return res.status(400).json({ error: 'Falta la fecha de retiro' })
    }
    if (pickupByOtherPerson && (!pickupPersonName || !pickupPersonLastName)) {
      return res.status(400).json({ error: 'Completá el nombre y apellido de la persona que retirará el pedido' })
    }
    if (deliveryType === 'delivery' && !SHIPPING_SERVICES.includes(shippingService)) {
      return res.status(400).json({ error: 'Servicio de envío inválido' })
    }
    if (deliveryType === 'delivery' && (!customer?.direccion?.trim() || !customer?.ciudad?.trim() || !customer?.provincia?.trim())) {
      return res.status(400).json({ error: 'Completá la dirección de envío' })
    }
    if (!billingSameAsShipping && (
      !customer?.billingAddress?.trim() || !customer?.billingCity?.trim() ||
      !customer?.billingPostalCode?.trim() || !customer?.billingProvince?.trim()
    )) {
      return res.status(400).json({ error: 'Completá la dirección de facturación' })
    }

    if (orderUserId) {
      const { rows: users } = await pool.query(
        'SELECT email FROM users WHERE id = $1',
        [orderUserId]
      )
      if (!users.length) return res.status(401).json({ error: 'Sesión inválida' })
      customerEmail = users[0].email
    }

    // Precio y plazo de entrega se recalculan contra la DB — nunca se confía
    // en lo que manda el cliente (podría mandar cualquier item.price).
    const productIds = items.map((i) => i.id)
    const { rows: dbProducts } = await pool.query(
      `SELECT products.id, precio_venta, precio_iva, precio_venta_usd, precio_iva_usd, price_currency,
              color_options, size_options, tone_options, variant_stock, weight_kg,
              COALESCE((SELECT usd_ars_rate FROM store_settings WHERE id=1),1510) AS usd_ars_rate,
              stock_inmediato,
              CASE WHEN stock_inmediato
                THEN COALESCE((SELECT dias_despacho_inmediato FROM store_settings WHERE id=1), 1)
                ELSE COALESCE(dias_entrega_pedido, (SELECT dias_entrega_pedido_default FROM store_settings WHERE id=1), 3)
              END AS dias_entrega,
              COALESCE((SELECT jsonb_agg(to_jsonb(vr)) FROM product_variant_rules vr
                        WHERE vr.product_id=products.id), '[]'::jsonb) AS variant_rules
       FROM products WHERE id = ANY($1::uuid[])`,
      [productIds]
    )
    const productMap = new Map(dbProducts.map((p) => [p.id, p]))

    const itemsSnapshot = []
    for (const i of items) {
      const dbProduct = productMap.get(i.id)
      if (!dbProduct || (dbProduct.precio_iva == null && dbProduct.precio_iva_usd == null &&
          dbProduct.precio_venta == null && dbProduct.precio_venta_usd == null)) {
        return res.status(400).json({ error: `Producto no disponible: ${i.name || i.id}` })
      }
      const resolvedPrice = resolveProductVariantPrice(dbProduct, i.color, i.size, i.tone)
      if (resolvedPrice.error === 'invalid_color') {
        return res.status(400).json({ error: `Color no disponible para ${i.name || i.id}` })
      }
      if (resolvedPrice.error === 'invalid_tone') {
        return res.status(400).json({ error: `Tono no disponible para ${i.name || i.id}` })
      }
      if (resolvedPrice.error === 'invalid_size') {
        return res.status(400).json({ error: `Medida no disponible para ${i.name || i.id}` })
      }
      if (resolvedPrice.error === 'invalid_variant') {
        return res.status(400).json({ error: `Combinación ambigua o no disponible para ${i.name || i.id}` })
      }
      const variantPath = resolveVariantStockPath(dbProduct, i.color, i.size, i.tone)
      if (variantPath?.error === 'invalid_variant') {
        return res.status(400).json({ error: `Combinación no disponible para ${i.name || i.id}` })
      }

      const price = resolvedPrice.price
      itemsSnapshot.push({
        id:       dbProduct.id,
        name:     i.name,
        category: i.category,
        price,
        quantity: i.quantity,
        subtotal: price * i.quantity,
        image:    i.image || null,
        color:    i.color || null,
        size:     i.size || null,
        tone:     i.tone || null,
        vatRate:  DEFAULT_VAT_RATE,
        colorKey: variantPath ? variantPath.colorKey : null,
        sizeKey:  variantPath ? variantPath.sizeKey : null,
        variantRuleId: variantPath?.variantRuleId || null,
        // Se conservan los nombres `aPedido`/`diasEntregaPedido`: los pedidos
        // históricos ya los tienen serializados en orders.items y los mails y
        // el seguimiento los leen de ahí. Lo que cambió es de dónde salen —
        // antes marcaban la excepción de stock insuficiente, ahora significan
        // "este producto no estaba en el local, se repone del proveedor".
        aPedido: !dbProduct.stock_inmediato,
        diasEntregaPedido: Number(dbProduct.dias_entrega) || 3,
        // Peso unitario para cotizar el envío por tramo. Sin dato, el tarifario
        // cae al tramo más barato (ver backend/config/shipping.js).
        weightKg: dbProduct.weight_kg != null ? Number(dbProduct.weight_kg) : 0,
      })
    }
    const productsTotal = roundMoney(itemsSnapshot.reduce((sum, i) => sum + i.subtotal, 0))
    let transferSettings = null
    let transferDiscountAmount = 0
    let couponBase = productsTotal
    let customerAccessToken = null
    let customerAccessTokenHash = null
    if (paymentMethod === 'bank_transfer') {
      const { rows: settingsRows } = await pool.query(
        `SELECT bank_transfer_enabled, bank_transfer_discount_percent,
                bank_transfer_expiry_hours, bank_transfer_cbu,
                bank_transfer_alias, bank_transfer_account_holder
         FROM store_settings WHERE id = 1`,
      )
      transferSettings = normalizeBankTransferSettings(settingsRows[0])
      if (!transferSettings.enabled || validateBankTransferSettings(transferSettings)) {
        return res.status(409).json({
          error: 'La transferencia bancaria ya no está disponible. Elegí otro medio de pago.',
        })
      }
      const transferCalculation = calculateTransferSubtotal(productsTotal, transferSettings.discountPercent)
      transferDiscountAmount = transferCalculation.transferDiscountAmount
      couponBase = transferCalculation.couponBase
      if (!orderUserId) {
        customerAccessToken = createCustomerAccessToken()
        customerAccessTokenHash = hashCustomerAccessToken(customerAccessToken)
      }
    }

    // Cupón de descuento: se revalida contra la DB acá (nunca se confía en el
    // monto que haya calculado el navegador en /api/coupons/validate).
    let discountAmount = 0
    let couponCode = null
    if (req.body?.discountCode) {
      const coupon = await findCouponByCode(req.body.discountCode)
      const evaluation = evaluateCoupon(coupon, couponBase)
      if (evaluation.error) {
        return res.status(400).json({ error: evaluation.error })
      }
      discountAmount = evaluation.amount
      couponCode = coupon.code
    }

    // Envío: costo por zona + estimación de entrega (Correo Argentino + margen
    // de preparación del pedido). Llamado fuera de la transacción de DB — es
    // red, no debe sostener locks de Postgres.
    let shippingCost = 0
    // Ventana de entrega: se guardan los dos extremos. La tienda dejó de
    // prometer un día exacto (ver config/shipping.js).
    let estimatedDeliveryDate = null
    let estimatedDeliveryMaxDate = null
    if (deliveryType === 'delivery') {
      // Valor declarado (para el seguro) = subtotal de productos con IVA, antes
      // de cupón/descuento. Peso total = suma de weight_kg × cantidad.
      const totalWeightKg = itemsSnapshot.reduce((sum, i) => sum + (i.weightKg || 0) * i.quantity, 0)
      const quote = await quoteShipping({
        postalCode: customer.codigoPostal,
        service: shippingService,
        weightKg: totalWeightKg,
        declaredValue: productsTotal,
      })
      if (!quote) {
        return res.status(400).json({ error: 'No pudimos calcular el envío automáticamente — consultanos por WhatsApp y lo coordinamos' })
      }
      const freeShipping = qualifiesForFreeShipping({ subtotal: productsTotal })
      shippingCost = freeShipping ? 0 : quote.cost
      // Margen de preparación: el mayor plazo del carrito, nunca la suma — los
      // items se despachan juntos, así que manda el que más tarda en estar.
      const handlingBusinessDays = Math.max(
        0,
        ...itemsSnapshot.map((i) => Number(i.diasEntregaPedido) || 0),
      )
      const estimate = await estimateDeliveryDate(customer.codigoPostal, handlingBusinessDays)
      estimatedDeliveryDate    = estimate.minDate
      estimatedDeliveryMaxDate = estimate.maxDate
    }

    if (deliveryType === 'pickup') {
      // El retiro no puede ofrecerse antes de que la mercadería esté lista: un
      // producto que se repone del proveedor son varios días hábiles. Mismo
      // piso que ve el cliente en el checkout (src/utils/plazoEntrega.js); se
      // revalida acá porque el `min` del <input type="date"> se puede saltar.
      const handlingBusinessDays = Math.max(
        0,
        ...itemsSnapshot.map((i) => Number(i.diasEntregaPedido) || 0),
      )
      const hoy = new Date()
      const minPickup = addBusinessDays(
        new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()),
        Math.max(1, handlingBusinessDays),
      )
      const [anio, mes, dia] = String(pickupDate).split('-').map(Number)
      const fechaElegida = new Date(anio, (mes || 1) - 1, dia || 1)
      if (Number.isNaN(fechaElegida.getTime()) || fechaElegida < minPickup) {
        return res.status(400).json({
          error: `La fecha de retiro más temprana es el ${minPickup.toLocaleDateString('es-AR', { day: '2-digit', month: 'long' })}: los productos del pedido necesitan ese tiempo de preparación.`,
        })
      }
    }

    const total = roundMoney(couponBase - discountAmount + shippingCost)
    if (paymentMethod === 'bank_transfer' && total <= 0) {
      return res.status(400).json({ error: 'El importe final de la transferencia debe ser mayor a cero' })
    }
    validateReceiverForVoucher({
      receiver: invoiceReceiver,
      receiverVatCondition: receiverVatCondition.category,
      voucherType: receiverVatCondition.voucherType,
      totalAmount: total.toFixed(2),
    })

    let reservationExpiresAt = null
    if (paymentMethod === 'mercadopago') {
      reservationExpiresAt = new Date(Date.now() + PENDING_PAYMENT_EXPIRY_MINUTES * 60 * 1000)
    } else if (paymentMethod === 'bank_transfer') {
      reservationExpiresAt = new Date(Date.now() + transferSettings.expiryHours * 60 * 60 * 1000)
    }

    const initialStatus = 'pending_payment'
    const orderNumber   = generateOrderNumber()

    const client = await pool.connect()
    let order
    try {
      await client.query('BEGIN')

      const { rows } = await client.query(
        `INSERT INTO orders
           (order_number, status, customer_name, customer_email, customer_phone,
            delivery_type, address, city, postal_code, total_amount, shipping_cost, shipping_service,
            payment_method, pickup_date, estimated_delivery_date, estimated_delivery_max_date, reservation_expires_at,
            items, user_id, customer_dni, address_extra, province, billing_same_as_shipping,
            billing_address, billing_address_extra, billing_city, billing_postal_code, billing_province,
            coupon_code, discount_amount, invoice_recipient_name, invoice_doc_type,
            invoice_doc_number, invoice_vat_condition_id, invoice_data_confirmed_at, invoice_concept,
            pickup_person_name, pickup_person_last_name, transfer_discount_amount,
            bank_transfer_snapshot, customer_access_token_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
                 $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29,
                 $30, $31, $32, $33, $34, NOW(), $35, $36, $37, $38, $39, $40)
         RETURNING *`,
        [
          orderNumber, initialStatus,
          `${customer.nombre} ${customer.apellido}`.trim(),
          customerEmail,
          customer.telefono,
          deliveryType,
          customer.direccion    || null,
          customer.ciudad       || null,
          customer.codigoPostal || null,
          total,
          shippingCost || null,
          deliveryType === 'delivery' ? shippingService : null,
          paymentMethod,
          deliveryType === 'pickup' ? pickupDate : null,
          estimatedDeliveryDate,
          estimatedDeliveryMaxDate,
          reservationExpiresAt,
          JSON.stringify(itemsSnapshot),
          orderUserId,
          customerDni,
          customer.piso?.trim() || null,
          customer.provincia?.trim() || null,
          billingSameAsShipping,
          billingSameAsShipping ? customer.direccion?.trim() || null : customer.billingAddress?.trim() || null,
          billingSameAsShipping ? customer.piso?.trim() || null : customer.billingAddressExtra?.trim() || null,
          billingSameAsShipping ? customer.ciudad?.trim() || null : customer.billingCity?.trim() || null,
          billingSameAsShipping ? customer.codigoPostal?.trim() || null : customer.billingPostalCode?.trim() || null,
          billingSameAsShipping ? customer.provincia?.trim() || null : customer.billingProvince?.trim() || null,
          couponCode,
          discountAmount,
          invoiceReceiver.name,
          invoiceReceiver.docType,
          invoiceReceiver.docNumber,
          invoiceReceiver.vatConditionId,
          1,
          pickupPersonName,
          pickupPersonLastName,
          transferDiscountAmount,
          transferSettings ? JSON.stringify({
            cbu: transferSettings.cbu,
            alias: transferSettings.alias,
            accountHolder: transferSettings.accountHolder,
            discountPercent: transferSettings.discountPercent,
            expiryHours: transferSettings.expiryHours,
          }) : null,
          customerAccessTokenHash,
        ]
      )
      order = rows[0]
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    let checkoutUrl = null
    if (paymentMethod === 'mercadopago') {
      let preference
      try {
        preference = await createPreference(order)
      } catch (err) {
        await pool.query(
          `UPDATE orders
           SET status = 'payment_failed',
               mp_status = 'preference_creation_failed'
           WHERE id = $1`,
          [order.id]
        )
        throw err
      }

      const { preferenceId, initPoint, sandboxInitPoint } = preference

      await pool.query(
        'UPDATE orders SET mp_preference_id = $1 WHERE id = $2',
        [preferenceId, order.id]
      )

      // El entorno de pago depende de las credenciales, no de NODE_ENV.
      // Un token APP_USR crea pagos reales aunque el backend se ejecute
      // localmente; un token TEST debe usar siempre el checkout sandbox.
      const usesProductionCredentials = process.env.MP_ACCESS_TOKEN
        ?.trim()
        .startsWith('APP_USR-')
      checkoutUrl = usesProductionCredentials ? initPoint : sandboxInitPoint
    } else {
      await sendBankTransferInstructions(order, customerAccessToken).catch((error) => {
        console.error('Error enviando instrucciones de transferencia:', error.message)
      })
    }

    res.status(201).json({
      orderId:      order.id,
      orderNumber:  order.order_number,
      checkoutUrl,
      paymentMethod,
      customerAccessToken,
    })
  } catch (err) {
    if (err instanceof InvoiceValidationError) {
      return res.status(400).json({ error: err.message, code: err.code })
    }
    if (err?.name === 'ArcaParameterError' || String(err?.code || '').startsWith('ARCA_')) {
      console.error('[POST /api/orders]', err.code || err.name, safeArcaErrorMessage(err))
    } else {
      console.error('[POST /api/orders]', err)
    }
    res.status(err?.name === 'ArcaParameterError' ? 503 : 500).json({
      error: err?.name === 'ArcaParameterError' ? err.message : 'Error interno al crear el pedido',
      code: err?.code,
    })
  }
})

const PUBLIC_ORDER_FIELDS = `
  id, order_number, status, customer_name, delivery_type,
  address, city, postal_code, total_amount, shipping_cost, shipping_service,
  payment_method, pickup_date, estimated_delivery_date, estimated_delivery_max_date,
  pickup_person_name, pickup_person_last_name,
  coupon_code, discount_amount, transfer_discount_amount,
  items, created_at, paid_at
`

// POST /api/orders/public/:id/reconcile-payment
// El retorno de Checkout Pro puede llegar antes que el webhook. Usamos los IDs
// solo para volver a consultar a Mercado Pago y verificar orden, monto y moneda.
router.post('/public/:id/reconcile-payment', async (req, res) => {
  try {
    const { paymentId, merchantOrderId, preferenceId } = req.body || {}
    const { rows } = await pool.query(
      'SELECT mp_preference_id FROM orders WHERE id = $1',
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Pedido no encontrado' })
    if (preferenceId && String(preferenceId) !== String(rows[0].mp_preference_id || '')) {
      return res.status(409).json({ error: 'La preferencia no corresponde a este pedido' })
    }

    const { order } = await reconcileMercadoPagoReturn({
      paymentId,
      merchantOrderId,
      expectedOrderId: req.params.id,
      expectedPreferenceId: rows[0].mp_preference_id,
    })

    res.set('Cache-Control', 'no-store')
    res.json({
      id: order.id,
      status: order.status,
      paidAt: order.paid_at,
    })
  } catch (err) {
    if (err instanceof PaymentReconciliationError) {
      return res.status(err.statusCode).json({ error: err.message })
    }
    console.error(`[payment-reconcile] order=${req.params.id} payment=${req.body?.paymentId || '-'} merchant_order=${req.body?.merchantOrderId || '-'} status=error code=${err.code || err.name}`)
    res.status(502).json({ error: 'No pudimos verificar el pago con Mercado Pago' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders/public/:id
// Endpoint público — devuelve campos no sensibles para la página de confirmación
// ─────────────────────────────────────────────────────────────────────────────
router.get('/public/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_ORDER_FIELDS} FROM orders WHERE id = $1`,
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Pedido no encontrado' })
    res.json(rows[0])
  } catch (err) {
    console.error('[GET /api/orders/public/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders/track/:orderNumber
// Endpoint público — rastreo por número de orden (FX-XXXXXX)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/track/:orderNumber', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_ORDER_FIELDS} FROM orders WHERE order_number = $1`,
      [req.params.orderNumber.toUpperCase()]
    )
    if (!rows.length) return res.status(404).json({ error: 'Pedido no encontrado' })
    res.json(rows[0])
  } catch (err) {
    console.error('[GET /api/orders/track/:orderNumber]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders/mine
// Historial de pedidos del usuario autenticado
// ─────────────────────────────────────────────────────────────────────────────
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
       `SELECT ${PUBLIC_ORDER_FIELDS}
       FROM orders
       WHERE user_id = $1
         AND (status = ANY($2::varchar[])
              OR (payment_method = 'bank_transfer' AND status IN ('pending_payment', 'expired'))
              OR (status = 'cancelled' AND paid_at IS NOT NULL))
       ORDER BY created_at DESC`,
      [req.userId, CUSTOMER_ORDER_STATUSES]
    )
    res.json(rows)
  } catch (err) {
    console.error('[GET /api/orders/mine]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// Recupera el formulario de un intento no confirmado únicamente para el dueño
// autenticado. Se mantiene separado del detalle público porque contiene DNI y
// domicilios que no deben quedar protegidos solamente por conocer un UUID.
router.get('/mine/:id/retry-data', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.customer_name, o.customer_email, o.customer_phone,
              o.delivery_type, o.address, o.address_extra, o.city, o.province, o.postal_code,
              o.billing_same_as_shipping, o.billing_address, o.billing_address_extra,
              o.billing_city, o.billing_province, o.billing_postal_code,
              o.invoice_recipient_name, o.invoice_doc_type, o.invoice_doc_number,
              o.invoice_vat_condition_id, o.payment_method, o.pickup_date, o.shipping_service,
              o.pickup_person_name, o.pickup_person_last_name,
              u.first_name AS account_first_name, u.last_name AS account_last_name
       FROM orders o
       JOIN users u ON u.id = o.user_id
       WHERE o.id = $1 AND o.user_id = $2
         AND o.payment_method = 'mercadopago'
         AND o.status IN ('pending_payment', 'payment_failed', 'expired')`,
      [req.params.id, req.userId]
    )
    if (!rows.length) return res.status(404).json({ error: 'Intento de pago no encontrado' })
    res.set('Cache-Control', 'no-store')
    res.json({ formData: buildRetryCheckoutData(rows[0]) })
  } catch (err) {
    console.error('[GET /api/orders/mine/:id/retry-data]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// Detalle privado de un pedido perteneciente a la cuenta autenticada.
router.get('/mine/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, order_number, status, customer_name, customer_email, customer_phone, customer_dni,
              delivery_type, address, address_extra, city, province, postal_code,
              billing_same_as_shipping, billing_address, billing_address_extra,
              billing_city, billing_province, billing_postal_code,
              invoice_recipient_name, invoice_doc_type, invoice_doc_number,
              invoice_vat_condition_id, invoice_data_confirmed_at, invoice_concept,
              invoice_service_from, invoice_service_to, invoice_payment_due,
              total_amount, shipping_cost, shipping_service, payment_method,
              coupon_code, discount_amount, transfer_discount_amount,
              pickup_date, estimated_delivery_date, estimated_delivery_max_date,
              pickup_person_name, pickup_person_last_name,
              items, created_at, paid_at
       FROM orders
       WHERE id = $1 AND user_id = $2
         AND (status = ANY($3::varchar[])
              OR (payment_method = 'bank_transfer' AND status IN ('pending_payment', 'expired'))
              OR (status = 'cancelled' AND paid_at IS NOT NULL))`,
      [req.params.id, req.userId, CUSTOMER_ORDER_STATUSES]
    )
    if (!rows.length) return res.status(404).json({ error: 'Pedido no encontrado' })
    res.set('Cache-Control', 'no-store')
    res.json(rows[0])
  } catch (err) {
    console.error('[GET /api/orders/mine/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders  (admin)
// Query params: ?status=paid&search=email&page=1&limit=50
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { status, search, paymentMethod, transferStatus, page = 1, limit = 50, all = 'false' } = req.query
    const fetchAll = all === 'true'
    const offset = (Number(page) - 1) * Number(limit)

    const conditions = []
    const params     = []
    let idx = 1

    if (status) {
      conditions.push(`o.status = $${idx++}`)
      params.push(status)
    }
    if (search) {
      conditions.push(
        `(o.customer_email ILIKE $${idx} OR o.customer_name ILIKE $${idx} OR o.order_number ILIKE $${idx})`
      )
      params.push(`%${search}%`)
      idx++
    }
    if (paymentMethod) {
      conditions.push(`o.payment_method = $${idx++}`)
      params.push(paymentMethod)
    }
    if (transferStatus) {
      conditions.push(`COALESCE(bt.status, 'awaiting_proof') = $${idx++}`)
      params.push(transferStatus)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const pagination = fetchAll ? '' : `LIMIT $${idx} OFFSET $${idx + 1}`
    const dataParams = fetchAll ? params : [...params, Number(limit), offset]

    const [data, countResult, invoiceSummaryResult] = await Promise.all([
      pool.query(
        `SELECT o.id, o.order_number, o.status, o.customer_name, o.customer_email, o.customer_phone,
                o.delivery_type, o.address, o.city, o.postal_code, o.total_amount,
                o.shipping_cost, o.shipping_service, o.payment_method, o.mp_status,
                o.pickup_date, o.estimated_delivery_date, o.estimated_delivery_max_date, o.items,
                o.pickup_person_name, o.pickup_person_last_name,
                o.coupon_code, o.discount_amount, o.transfer_discount_amount,
                o.created_at, o.updated_at,
                o.paid_at, o.mp_payment_id, o.invoice_data_confirmed_at,
                o.invoice_recipient_name, o.invoice_doc_type, o.invoice_doc_number,
                o.invoice_vat_condition_id,
                i.id AS invoice_id, i.status AS invoice_status,
                i.pto_vta AS invoice_pto_vta, i.cbte_tipo AS invoice_cbte_tipo,
                i.cbte_numero AS invoice_cbte_numero, i.cae AS invoice_cae,
                i.cae_expiration_date AS invoice_cae_expiration_date,
                i.last_attempt_at AS invoice_last_attempt_at,
                i.observations AS invoice_observations, i.errors AS invoice_errors,
                j.status AS invoice_attempt_status,
                j.attempt_count AS invoice_attempt_count,
                j.last_error_code AS invoice_last_error_code,
                j.last_error_message AS invoice_last_error_message,
                j.last_attempt_origin AS invoice_last_attempt_origin,
                j.updated_at AS invoice_attempt_updated_at,
                bt.id AS transfer_submission_id,
                bt.attempt_number AS transfer_attempt,
                bt.status AS transfer_status,
                bt.payer_account_holder AS transfer_payer_account_holder,
                bt.proof_original_name AS transfer_proof_original_name,
                bt.rejection_reason AS transfer_rejection_reason,
                bt.submitted_at AS transfer_submitted_at,
                bt.reviewed_at AS transfer_reviewed_at,
                COALESCE(bth.history, '[]'::jsonb) AS transfer_history,
                CASE
                  WHEN i.status IS NOT NULL THEN i.status
                  WHEN j.status = 'needs_data' THEN 'needs_data'
                  WHEN j.status = 'processing' THEN 'processing'
                  WHEN j.status = 'failed' THEN 'error'
                  WHEN ((o.payment_method = 'mercadopago' AND o.mp_status = 'approved')
                        OR (o.payment_method = 'bank_transfer' AND bt.status = 'approved'))
                       AND o.status IN ('paid', 'preparing', 'shipped', 'delivered')
                       AND o.invoice_data_confirmed_at IS NULL THEN 'needs_data'
                  WHEN ((o.payment_method = 'mercadopago' AND o.mp_status = 'approved')
                        OR (o.payment_method = 'bank_transfer' AND bt.status = 'approved'))
                       AND o.status IN ('paid', 'preparing', 'shipped', 'delivered') THEN 'pending'
                  ELSE 'not_applicable'
                END AS invoice_display_status,
                (((o.payment_method = 'mercadopago' AND o.mp_status = 'approved')
                  OR (o.payment_method = 'bank_transfer' AND bt.status = 'approved'))
                  AND o.status IN ('paid', 'preparing', 'shipped', 'delivered')
                  AND i.status IS DISTINCT FROM 'authorized'
                  AND o.paid_at < NOW() - INTERVAL '24 hours') AS invoice_overdue
         FROM orders o
         LEFT JOIN invoices i ON i.order_id = o.id
         LEFT JOIN invoice_jobs j ON j.order_id = o.id
         LEFT JOIN LATERAL (
           SELECT s.* FROM bank_transfer_submissions s
           WHERE s.order_id = o.id
           ORDER BY s.attempt_number DESC LIMIT 1
         ) bt ON TRUE
         LEFT JOIN LATERAL (
           SELECT jsonb_agg(jsonb_build_object(
             'attempt', s.attempt_number,
             'status', s.status,
             'payerAccountHolder', s.payer_account_holder,
             'originalName', s.proof_original_name,
             'rejectionReason', s.rejection_reason,
             'submittedAt', s.submitted_at,
             'reviewedAt', s.reviewed_at
           ) ORDER BY s.attempt_number DESC) AS history
           FROM bank_transfer_submissions s WHERE s.order_id = o.id
         ) bth ON TRUE
         ${where}
         ORDER BY o.created_at DESC
         ${pagination}`,
        dataParams
      ),
      pool.query(
        `SELECT COUNT(*) FROM orders o
         LEFT JOIN LATERAL (
           SELECT s.status FROM bank_transfer_submissions s
           WHERE s.order_id = o.id
           ORDER BY s.attempt_number DESC LIMIT 1
         ) bt ON TRUE
         ${where}`,
        params,
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (
             WHERE ((o.payment_method = 'mercadopago' AND o.mp_status = 'approved')
                    OR (o.payment_method = 'bank_transfer' AND EXISTS (
                      SELECT 1 FROM bank_transfer_submissions s
                      WHERE s.order_id = o.id AND s.status = 'approved'
                    )))
               AND o.status IN ('paid', 'preparing', 'shipped', 'delivered')
               AND i.status IS DISTINCT FROM 'authorized'
           )::integer AS pending,
           COUNT(*) FILTER (
             WHERE ((o.payment_method = 'mercadopago' AND o.mp_status = 'approved')
                    OR (o.payment_method = 'bank_transfer' AND EXISTS (
                      SELECT 1 FROM bank_transfer_submissions s
                      WHERE s.order_id = o.id AND s.status = 'approved'
                    )))
               AND o.status IN ('paid', 'preparing', 'shipped', 'delivered')
               AND i.status IS DISTINCT FROM 'authorized'
               AND o.paid_at < NOW() - INTERVAL '24 hours'
           )::integer AS overdue
         FROM orders o
         LEFT JOIN invoices i ON i.order_id = o.id`,
      ),
    ])

    res.json({
      orders: data.rows,
      total:  Number(countResult.rows[0].count),
      page:   Number(page),
      limit:  fetchAll ? data.rows.length : Number(limit),
      invoiceSummary: invoiceSummaryResult.rows[0] || { pending: 0, overdue: 0 },
      transferSummary: {
        pendingReview: data.rows.filter(order => order.transfer_status === 'pending_review').length,
      },
    })
  } catch (err) {
    console.error('[GET /api/orders]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders/:id  (admin)
// Detalle completo de un pedido
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Pedido no encontrado' })
    const submissions = rows[0].payment_method === 'bank_transfer'
      ? await pool.query(
        `SELECT id, attempt_number, payer_account_holder, proof_original_name,
                proof_mime_type, proof_size_bytes, status, rejection_reason,
                submitted_at, reviewed_at
         FROM bank_transfer_submissions WHERE order_id = $1
         ORDER BY attempt_number DESC`,
        [req.params.id],
      )
      : { rows: [] }
    res.set('Cache-Control', 'no-store')
    res.json({ ...rows[0], bankTransferSubmissions: submissions.rows })
  } catch (err) {
    console.error('[GET /api/orders/:id]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/orders/:id/status  (admin)
// Body: { status: 'preparing' }
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id/status', requireAdmin, async (req, res) => {
  try {
    const VALID = [
      'pending_payment', 'paid', 'preparing', 'shipped',
      'delivered', 'cancelled', 'payment_failed', 'reserved', 'expired',
    ]
    const { status } = req.body

    if (!VALID.includes(status)) {
      return res.status(400).json({ error: 'Estado inválido' })
    }

    const currentResult = await pool.query(
      'SELECT payment_method, status FROM orders WHERE id = $1',
      [req.params.id],
    )
    if (!currentResult.rows.length) return res.status(404).json({ error: 'Pedido no encontrado' })
    const current = currentResult.rows[0]
    if (current.payment_method === 'bank_transfer'
        && !['paid', 'preparing', 'shipped', 'delivered'].includes(current.status)
        && ['paid', 'preparing', 'shipped', 'delivered'].includes(status)) {
      return res.status(409).json({
        error: 'Una transferencia solo puede marcarse como pagada desde la revisión de su comprobante',
      })
    }
    if (current.payment_method === 'bank_transfer'
        && ['paid', 'preparing', 'shipped', 'delivered'].includes(current.status)
        && ['pending_payment', 'payment_failed', 'reserved', 'expired'].includes(status)) {
      return res.status(409).json({ error: 'Un pago bancario aprobado no puede volver a estado pendiente' })
    }

    const { rows } = await pool.query(
      `UPDATE orders
       SET status  = $1,
           paid_at = CASE
             WHEN $3 IN ('paid', 'preparing', 'shipped', 'delivered') AND paid_at IS NULL THEN NOW()
             ELSE paid_at
           END
       WHERE id = $2 RETURNING *`,
      [status, req.params.id, status]
    )
    if (!rows.length) return res.status(404).json({ error: 'Pedido no encontrado' })

    if (status === 'delivered') {
      await sendReviewInvitationForOrder(req.params.id)
    }
    if (status === 'paid' || status === 'reserved') {
      await sendOrderConfirmationNotifications(req.params.id)
    }

    res.json(rows[0])
  } catch (err) {
    console.error('[PATCH /api/orders/:id/status]', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
