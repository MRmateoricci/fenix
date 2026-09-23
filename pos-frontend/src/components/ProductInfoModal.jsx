import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'

const money = value => value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

function margin(precioSinIva, precioCosto) {
  if (precioSinIva == null || precioCosto == null || precioSinIva <= 0) return null
  return ((precioSinIva - precioCosto) / precioSinIva) * 100
}

// Costo y margen son admin-only (ver backend/routes/pos/products.js): se
// piden aparte, bajo demanda, y nunca viajan en el cache de catálogo que
// bajan TODOS los vendedores al loguearse.
function useProductCost(productId, enabled) {
  const [cost, setCost] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setCost(null)
    if (!enabled || !productId) return
    let cancelled = false
    setLoading(true)
    api.getProductCost(productId)
      .then(data => { if (!cancelled) setCost(data) })
      .catch(() => { if (!cancelled) setCost(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [productId, enabled])

  return { cost, loading }
}

const CARACTERISTICA_LABELS = {
  medida: 'Medida', watts: 'Watts', amperes: 'Amperes',
  ipRating: 'IP', material: 'Material', cableType: 'Cable',
}

export default function ProductInfoModal({ product, onAdd, onClose }) {
  const { isAdmin } = useAuth()
  const hasVariants = product.variantes?.length > 0
  const [selectedVariantId, setSelectedVariantId] = useState(hasVariants ? product.variantes[0].id : null)
  const selectedVariant = hasVariants ? product.variantes.find(v => v.id === selectedVariantId) : null

  const { cost, loading: loadingCost } = useProductCost(product.id, isAdmin)

  useEffect(() => {
    const onKeyDown = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const activePrecio = selectedVariant ? selectedVariant.precio : product.precio
  const activePrecioSinIva = selectedVariant ? selectedVariant.precioSinIva : product.precioSinIva
  const activeStock = selectedVariant ? selectedVariant.stock : product.stock
  const activeCosto = !cost ? null : selectedVariant
    ? cost.variantes.find(v => v.id === selectedVariant.id)?.precioCosto ?? null
    : cost.precioCosto
  const activeMargen = margin(activePrecioSinIva, activeCosto)

  // Acá solo se agrega a precio de lista (con IVA) — el vendedor elige
  // efectivo/cuotas recién al confirmar la venta, en el ticket
  // (SaleTicket → "Descuento efectivo"), no producto por producto.
  function handleAdd() {
    if (activePrecio == null) return
    onAdd(selectedVariant)
  }

  const caracteristicas = Object.entries(CARACTERISTICA_LABELS)
    .map(([key, label]) => [label, product.caracteristicas?.[key]])
    .filter(([, value]) => value != null && value !== '')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-slate-900">{product.nombre}</h2>
          <p className="text-sm text-slate-400">
            {product.codigo}
            {product.marca && ` · ${product.marca}`}
            {product.proveedor && ` · ${product.proveedor}`}
          </p>
        </div>

        {(caracteristicas.length > 0 || product.caracteristicas?.descripcion) && (
          <div className="mb-4 rounded-lg bg-slate-50 p-3">
            {caracteristicas.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {caracteristicas.map(([label, value]) => (
                  <span key={label} className="text-slate-600">
                    <span className="text-slate-400">{label}:</span> {value}
                  </span>
                ))}
              </div>
            )}
            {product.caracteristicas?.descripcion && (
              <p className="mt-1 line-clamp-3 text-sm text-slate-500">{product.caracteristicas.descripcion}</p>
            )}
          </div>
        )}

        {hasVariants && (
          <div className="mb-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">
              Elegí la variante ({product.variantes.length})
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {product.variantes.map(variant => {
                const selected = variant.id === selectedVariantId
                return (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => setSelectedVariantId(variant.id)}
                    className={`rounded-lg border-2 p-3 text-left transition ${
                      selected ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800">{variant.nombre}</span>
                      {variant.stock != null && variant.stock <= 0 && (
                        <span className="shrink-0 text-xs font-medium text-amber-600">sin stock</span>
                      )}
                    </div>
                    {variant.medida && <p className="text-xs text-slate-500">Medida: {variant.medida}</p>}
                    {variant.descripcion && (
                      <p className="line-clamp-2 text-xs text-slate-400">{variant.descripcion}</p>
                    )}
                    {variant.precio == null && <p className="text-xs font-medium text-red-600">Sin precio</p>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Precio</h3>
          <span className="text-xs text-slate-400">
            {activeStock == null ? '' : activeStock > 0 ? `Stock: ${activeStock}` : 'Sin stock'}
          </span>
        </div>

        <div className="mb-4 rounded-lg border-2 border-slate-300 p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Precio final (IVA incluido)</span>
          <div className="text-3xl font-bold text-slate-900">{activePrecio == null ? '—' : money(activePrecio)}</div>
          {activePrecio == null ? (
            <p className="mt-1 text-xs font-medium text-red-600">Sin precio cargado</p>
          ) : (
            <span className="text-xs text-slate-500">Sin IVA: {money(activePrecioSinIva)}</span>
          )}
        </div>

        <button
          type="button"
          onClick={handleAdd}
          disabled={activePrecio == null}
          className="mb-4 w-full rounded-lg bg-emerald-600 py-3 text-base font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Agregar a la venta
        </button>

        {isAdmin && (
          <div className="mb-4 rounded-lg border border-dashed border-slate-300 p-3 text-sm">
            {loadingCost ? (
              <span className="text-slate-400">Cargando costo...</span>
            ) : (
              <div className="flex items-center gap-4">
                <span className="text-slate-600">
                  <span className="text-slate-400">Costo:</span> {activeCosto == null ? '—' : money(activeCosto)}
                </span>
                <span className="text-slate-600">
                  <span className="text-slate-400">Margen:</span> {activeMargen == null ? '—' : `${activeMargen.toFixed(1)}%`}
                </span>
              </div>
            )}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full rounded-md border border-slate-300 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          Cancelar (Esc)
        </button>
      </div>
    </div>
  )
}
