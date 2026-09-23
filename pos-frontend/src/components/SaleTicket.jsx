import PaymentSelector from './PaymentSelector'
import QuickInvoiceCuit from './QuickInvoiceCuit'

const money = value => Number(value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })

export default function SaleTicket({
  items, onUpdateQuantity, onRemove,
  subtotal, discountAmount, surchargeAmount, total,
  discountMode, discountValue, cashDiscountPercent, onDiscountModeChange, onDiscountValueChange,
  installmentTiers, installmentTier, onInstallmentTierChange,
  singleMethod, onSingleMethodChange, mixedPayments, onMixedPaymentsChange,
  isInvoiced, onIsInvoicedChange,
  invoiceReceiver, onInvoiceReceiverChange,
  notes, onNotesChange,
  onConfirm, confirming, error,
}) {
  const paidTotal = mixedPayments ? mixedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) : total
  const paymentsMatch = Math.abs(paidTotal - total) < 0.01
  const canConfirm = items.length > 0 && paymentsMatch && !confirming

  return (
    <div className="flex h-full flex-col border-l border-slate-200 bg-white">
      <div className="flex-1 overflow-y-auto p-4">
        <h2 className="mb-2 text-xl font-bold text-slate-800">Ticket</h2>
        {items.length === 0 && <p className="text-sm text-slate-400">Buscá un producto para empezar la venta.</p>}
        <div className="flex flex-col gap-2">
          {items.map(item => (
            <div key={item.key} className="rounded-md border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-base font-medium text-slate-800">{item.nombre}</p>
                  <p className="text-sm text-slate-400">{item.codigo}</p>
                  {item.stockDisponible != null && item.stockDisponible < item.cantidad && (
                    <p className="text-sm font-medium text-amber-600">Sin stock suficiente ({item.stockDisponible} disp.)</p>
                  )}
                </div>
                <button onClick={() => onRemove(item.key)} className="text-lg text-slate-400 hover:text-red-500">✕</button>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    value={item.cantidad}
                    onChange={e => onUpdateQuantity(item.key, Number(e.target.value))}
                    className="w-16 rounded-md border border-slate-300 px-2 py-1.5 text-center text-sm"
                  />
                  <span className="text-sm text-slate-400">x {money(item.precio)}</span>
                </div>
                <span className="text-base font-semibold text-slate-800">{money(item.precio * item.cantidad)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-200 p-4">
        <div className="mb-3 flex items-center justify-between text-base text-slate-600">
          <span>Subtotal</span>
          <span>{money(subtotal)}</span>
        </div>

        <div className="mb-3">
          <div className="mb-1 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onDiscountModeChange(discountMode === 'cash' ? 'none' : 'cash')}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                discountMode === 'cash' ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-slate-300 text-slate-600'
              }`}
            >
              Descuento efectivo ({cashDiscountPercent}%)
            </button>
            <button
              type="button"
              onClick={() => onDiscountModeChange(discountMode === 'percent' ? 'none' : 'percent')}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                discountMode === 'percent' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-600'
              }`}
            >
              % manual
            </button>
            <button
              type="button"
              onClick={() => onDiscountModeChange(discountMode === 'amount' ? 'none' : 'amount')}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                discountMode === 'amount' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-600'
              }`}
            >
              $ manual
            </button>
          </div>
          {(discountMode === 'percent' || discountMode === 'amount') && (
            <input
              type="number"
              min="0"
              autoFocus
              value={discountValue}
              onChange={e => onDiscountValueChange(Number(e.target.value))}
              placeholder={discountMode === 'percent' ? 'Porcentaje' : 'Monto en $'}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          )}
          {discountAmount > 0 && (
            <div className="mt-1 flex items-center justify-between text-sm text-emerald-700">
              <span>Descuento</span>
              <span>- {money(discountAmount)}</span>
            </div>
          )}
        </div>

        {installmentTiers?.length > 0 && (
          <div className="mb-3">
            <div className="mb-1 flex flex-wrap gap-1.5">
              {installmentTiers.map(tier => {
                const active = discountMode === 'installments' && installmentTier?.installments === tier.installments
                return (
                  <button
                    key={tier.installments}
                    type="button"
                    onClick={() => onInstallmentTierChange(active ? null : tier)}
                    className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                      active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-600'
                    }`}
                  >
                    Tarjeta {tier.installments} cuota{tier.installments > 1 ? 's' : ''} (+{tier.surchargePercent}%)
                  </button>
                )
              })}
            </div>
            {surchargeAmount > 0 && (
              <div className="mt-1 flex items-center justify-between text-sm text-amber-700">
                <span>Recargo por cuotas</span>
                <span>+ {money(surchargeAmount)}</span>
              </div>
            )}
          </div>
        )}

        <div className="mb-3 flex items-center justify-between text-2xl font-bold text-slate-900">
          <span>Total</span>
          <span>{money(total)}</span>
        </div>

        <div className="mb-3">
          <PaymentSelector
            total={total}
            singleMethod={singleMethod}
            onSingleMethodChange={onSingleMethodChange}
            mixedPayments={mixedPayments}
            onMixedPaymentsChange={onMixedPaymentsChange}
          />
        </div>

        <QuickInvoiceCuit
          invoiceReceiver={invoiceReceiver}
          onInvoiceReceiverChange={onInvoiceReceiverChange}
          isInvoiced={isInvoiced}
          onIsInvoicedChange={onIsInvoicedChange}
        />

        <input
          value={notes}
          onChange={e => onNotesChange(e.target.value)}
          placeholder="Nota (opcional)"
          className="mb-3 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />

        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={onConfirm}
          disabled={!canConfirm}
          className="w-full rounded-lg bg-emerald-600 py-3.5 text-lg font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {confirming ? 'Confirmando...' : 'Confirmar venta'}
        </button>
      </div>
    </div>
  )
}
