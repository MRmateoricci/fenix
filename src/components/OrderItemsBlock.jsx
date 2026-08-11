const fmt = (n) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)

export function MapPinIcon() {
  return (
    <svg className="shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary)' }}>
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  )
}

// Bloque de items + total + entrega, compartido entre OrderConfirmation,
// OrderTracking y el historial de pedidos (Orders.jsx).
export function OrderItemsBlock({
  items, totalAmount, deliveryType, address, city,
  showDeliveryLabel = true,
  imageSizeClass = 'w-12 h-12',
  totalSizeClass = 'text-xl font-bold',
}) {
  return (
    <>
      {items.map((item, i) => (
        <div
          key={`${item.id}-${i}`}
          className="flex items-center gap-4 px-6 py-4"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          {item.image && (
            <img
              src={item.image}
              alt={item.name}
              className={`${imageSizeClass} rounded-lg object-cover shrink-0`}
              style={{ backgroundColor: 'var(--color-surface-2)' }}
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
              {item.name}
            </p>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {item.quantity} × {fmt(item.price)}{item.color ? ` · ${item.color}` : ''}{item.tone ? ` · ${item.tone}` : ''}{item.size ? ` · ${item.size}` : ''}
            </p>
          </div>
          <p className="text-sm font-semibold shrink-0" style={{ color: 'var(--color-text)' }}>
            {fmt(item.subtotal)}
          </p>
        </div>
      ))}

      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <span className="font-semibold" style={{ color: 'var(--color-text)' }}>Total</span>
        <span className={totalSizeClass} style={{ color: 'var(--color-text)' }}>
          {fmt(totalAmount)}
        </span>
      </div>

      <div className="flex items-start gap-3 px-6 py-4">
        <MapPinIcon />
        <div>
          {showDeliveryLabel && (
            <p className="text-[11px] uppercase tracking-widest font-semibold mb-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Entrega
            </p>
          )}
          <p className="text-sm" style={{ color: 'var(--color-text)' }}>
            {deliveryType === 'pickup'
              ? 'Retiro en local — 473 entre 14C y 15, City Bell'
              : `Envío a ${address}, ${city}`}
          </p>
        </div>
      </div>
    </>
  )
}
