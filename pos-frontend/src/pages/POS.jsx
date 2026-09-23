import { useCallback, useEffect, useState } from 'react'
import ProductSearch from '../components/ProductSearch'
import SaleTicket from '../components/SaleTicket'
import ProductInfoModal from '../components/ProductInfoModal'
import { api } from '../services/api'

export default function POS() {
  const [items, setItems] = useState([])
  const [pendingProduct, setPendingProduct] = useState(null)

  const [discountMode, setDiscountMode] = useState('none') // none | cash | percent | amount | installments
  const [discountValue, setDiscountValue] = useState(0)
  const [installmentTier, setInstallmentTier] = useState(null) // { installments, surchargePercent }, solo si discountMode === 'installments'
  const [cashDiscountPercent, setCashDiscountPercent] = useState(10)
  const [installmentTiers, setInstallmentTiers] = useState([])

  const [singleMethod, setSingleMethod] = useState('efectivo')
  const [mixedPayments, setMixedPayments] = useState(null)

  const [isInvoiced, setIsInvoiced] = useState(false)
  const [invoiceReceiver, setInvoiceReceiver] = useState({})
  const [notes, setNotes] = useState('')

  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState(null)
  const [focusToken, setFocusToken] = useState(0)

  useEffect(() => {
    api.getSettings()
      .then(s => {
        setCashDiscountPercent(s.cashDiscountPercent)
        setInstallmentTiers(s.installmentTiers)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!confirmation) return
    const id = setTimeout(() => setConfirmation(null), 8000)
    return () => clearTimeout(id)
  }, [confirmation])

  const addItem = useCallback((product, variant = null) => {
    setItems(prev => {
      const key = `${product.id}:${variant?.id || ''}`
      const existing = prev.find(i => i.key === key)
      if (existing) {
        return prev.map(i => (i.key === key ? { ...i, cantidad: i.cantidad + 1 } : i))
      }
      return [
        ...prev,
        {
          key,
          productId: product.id,
          variantId: variant?.id || null,
          nombre: variant ? `${product.nombre} - ${variant.nombre}` : product.nombre,
          codigo: product.codigo,
          precio: variant ? variant.precio : product.precio,
          cantidad: 1,
          stockDisponible: variant ? variant.stock : product.stock,
        },
      ]
    })
  }, [])

  function handleSelectProduct(product) {
    setError('')
    setPendingProduct(product)
  }

  // El modal de detalle ya no elige precio: agrega el ítem SIEMPRE a precio
  // de lista (con IVA). El descuento efectivo/cuotas se elige aparte, para
  // toda la venta, recién al confirmar (ver "Descuento efectivo" en el ticket).
  function handleAddFromModal(variant) {
    const precio = variant ? variant.precio : pendingProduct.precio
    if (precio == null) {
      const nombre = variant ? `${pendingProduct.nombre} - ${variant.nombre}` : pendingProduct.nombre
      setError(`${nombre} (${pendingProduct.codigo}) no tiene precio cargado — cargale un precio desde el panel antes de venderlo.`)
      setPendingProduct(null)
      return
    }
    setError('')
    addItem(pendingProduct, variant)
    setPendingProduct(null)
  }

  function updateQuantity(key, cantidad) {
    setItems(prev => prev.map(i => (i.key === key ? { ...i, cantidad: Math.max(1, Math.floor(cantidad) || 1) } : i)))
  }

  function removeItem(key) {
    setItems(prev => prev.filter(i => i.key !== key))
  }

  const subtotal = items.reduce((sum, i) => sum + i.precio * i.cantidad, 0)
  const effectivePercent =
    discountMode === 'cash' ? cashDiscountPercent : discountMode === 'percent' ? discountValue : null
  const discountAmount =
    discountMode === 'amount' ? Math.min(discountValue, subtotal) : effectivePercent != null ? (subtotal * effectivePercent) / 100 : 0
  const surchargeAmount =
    discountMode === 'installments' && installmentTier ? (subtotal * installmentTier.surchargePercent) / 100 : 0
  const total = Math.max(0, Math.round((subtotal - discountAmount + surchargeAmount) * 100) / 100)

  function resetTicket() {
    setItems([])
    setDiscountMode('none')
    setDiscountValue(0)
    setInstallmentTier(null)
    setMixedPayments(null)
    setSingleMethod('efectivo')
    setIsInvoiced(false)
    setInvoiceReceiver({})
    setNotes('')
  }

  async function handleConfirm() {
    if (!items.length) return
    setError('')
    setConfirming(true)
    try {
      const payload = {
        items: items.map(i => ({ productId: i.productId, variantId: i.variantId, quantity: i.cantidad })),
        payments: mixedPayments || [{ method: singleMethod, amount: total }],
        isInvoiced,
      }
      if (notes.trim()) payload.notes = notes.trim()
      if (discountMode === 'installments' && installmentTier) {
        payload.surchargePercent = installmentTier.surchargePercent
        payload.installments = installmentTier.installments
      } else if (discountMode === 'amount' && discountAmount > 0) payload.discountAmount = discountAmount
      else if (effectivePercent != null && effectivePercent > 0) payload.discountPercent = effectivePercent
      if (isInvoiced) {
        payload.customerDocType = invoiceReceiver.docType
        payload.customerDocNumber = invoiceReceiver.docNumber
        payload.customerName = invoiceReceiver.customerName
        payload.vatConditionId = invoiceReceiver.vatConditionId
      }

      const { sale, invoice, invoiceError } = await api.createSale(payload)
      const totalLabel = total.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
      let message = `Venta #${sale.saleNumber} registrada — ${totalLabel}`
      if (invoice?.status === 'authorized') {
        message += ` — ${invoice.voucherName} ${String(invoice.pointOfSale).padStart(4, '0')}-${String(invoice.voucherNumber).padStart(8, '0')} — CAE: ${invoice.cae}`
      } else if (invoiceError) {
        message += ' — ⚠ No se pudo emitir la factura, reintentar desde Ventas'
      }
      setConfirmation(message)
      resetTicket()
      setFocusToken(t => t + 1)
    } catch (err) {
      setError(err.message || 'No se pudo registrar la venta')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="grid h-full grid-cols-[1fr_600px]">
      <ProductSearch onSelect={handleSelectProduct} focusToken={focusToken} />
      <SaleTicket
        items={items}
        onUpdateQuantity={updateQuantity}
        onRemove={removeItem}
        subtotal={subtotal}
        discountAmount={discountAmount}
        surchargeAmount={surchargeAmount}
        total={total}
        discountMode={discountMode}
        discountValue={discountValue}
        cashDiscountPercent={cashDiscountPercent}
        installmentTiers={installmentTiers}
        installmentTier={installmentTier}
        onDiscountModeChange={mode => {
          setDiscountMode(mode)
          setDiscountValue(0)
          setInstallmentTier(null)
        }}
        onInstallmentTierChange={tier => {
          setDiscountMode(tier ? 'installments' : 'none')
          setInstallmentTier(tier)
        }}
        onDiscountValueChange={setDiscountValue}
        singleMethod={singleMethod}
        onSingleMethodChange={setSingleMethod}
        mixedPayments={mixedPayments}
        onMixedPaymentsChange={setMixedPayments}
        isInvoiced={isInvoiced}
        onIsInvoicedChange={setIsInvoiced}
        invoiceReceiver={invoiceReceiver}
        onInvoiceReceiverChange={setInvoiceReceiver}
        notes={notes}
        onNotesChange={setNotes}
        onConfirm={handleConfirm}
        confirming={confirming}
        error={error}
      />

      {pendingProduct && (
        <ProductInfoModal
          product={pendingProduct}
          onAdd={handleAddFromModal}
          onClose={() => setPendingProduct(null)}
        />
      )}

      {confirmation && (
        <div className="fixed bottom-6 right-6 max-w-md rounded-lg bg-emerald-600 px-5 py-3 text-base font-medium text-white shadow-xl">
          {confirmation}
        </div>
      )}
    </div>
  )
}
