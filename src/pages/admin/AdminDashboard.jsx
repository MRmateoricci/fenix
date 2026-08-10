import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdmin } from '../../context/AdminContext'
import { CATEGORY_NAV_LABEL } from '../../data/products'
import { getSubcategoryOptions, getProductTypeOptions } from '../../data/categoryTree'
import FenixLogo from '../../assets/FenixLogo'
import OverviewDashboard from './OverviewDashboard'

// ── Paleta ────────────────────────────────────────────────────────────────────
const C = {
  dark:        '#111827',
  darkHover:   '#1F2937',
  paper:       '#FFFFFF',
  white:       '#FFFFFF',
  ink:         '#111827',
  text2:       '#374151',
  text3:       '#4B5563',
  muted:       '#6B7280',
  border:      '#DDE3EA',
  hairline:    '#ECEFF3',
  amber:       '#E0A24A',
  amberLight:  '#FFF7E6',
  amberDark:   '#B8821A',
  red:         '#CC0000',
  redLight:    '#FDECEC',
  green:       '#1a7a3d',
  greenLight:  '#EAF7EF',
  sidebar:     218,
}
const ADMIN_FONT = "var(--font-sans)"

const CATS = Object.keys(CATEGORY_NAV_LABEL)

const fmt = n =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

const fmtUsd = n =>
  `US$ ${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtPickupDate = (d) =>
  new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })

const pct = (price, original) =>
  original ? Math.round((1 - price / original) * 100) : 0

// ── Sales helpers ─────────────────────────────────────────────────────────────
function computeTop5(sales) {
  const map = {}
  sales.forEach(s => {
    s.items.forEach(item => {
      if (!map[item.id]) map[item.id] = { name: item.name, units: 0, revenue: 0 }
      map[item.id].units   += item.quantity
      map[item.id].revenue += item.price * item.quantity
    })
  })
  return Object.values(map).sort((a, b) => b.units - a.units).slice(0, 5)
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const BarChartIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor" style={{ flexShrink: 0 }}>
    <rect x="0.5" y="7.5" width="3" height="7" rx="0.6"/>
    <rect x="6" y="4.5" width="3" height="10" rx="0.6"/>
    <rect x="11.5" y="0.5" width="3" height="14" rx="0.6"/>
  </svg>
)

const GridIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ flexShrink: 0 }}>
    <rect x="0.8" y="0.8" width="5.9" height="5.9" rx="1"/>
    <rect x="8.3" y="0.8" width="5.9" height="5.9" rx="1"/>
    <rect x="0.8" y="8.3" width="5.9" height="5.9" rx="1"/>
    <rect x="8.3" y="8.3" width="5.9" height="5.9" rx="1"/>
  </svg>
)

const StoreIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ flexShrink: 0 }}>
    <path d="M1.5 5.3h12l-1-3.2h-10z" strokeLinejoin="round"/>
    <path d="M2.5 5.3v7.6h10V5.3M5.5 12.9V9h4v3.9" strokeLinejoin="round"/>
    <path d="M1.5 5.3c0 1 .7 1.7 1.6 1.7s1.6-.7 1.6-1.7c0 1 .7 1.7 1.6 1.7S8 6.3 8 5.3c0 1 .7 1.7 1.6 1.7s1.6-.7 1.6-1.7c0 1 .7 1.7 1.6 1.7s1.6-.7 1.6-1.7" strokeLinecap="round"/>
  </svg>
)

const FolderIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ flexShrink: 0 }}>
    <path d="M1 3.3c0-.6.5-1.1 1.1-1.1h3.2l1.4 1.6h6.2c.6 0 1.1.5 1.1 1.1v6.8c0 .6-.5 1.1-1.1 1.1H2.1c-.6 0-1.1-.5-1.1-1.1z" strokeLinejoin="round"/>
  </svg>
)

const TagIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ flexShrink: 0 }}>
    <circle cx="4.5" cy="4.5" r="1.3"/>
    <line x1="2.5" y1="12.5" x2="12.5" y2="2.5" strokeLinecap="round"/>
    <circle cx="10.5" cy="10.5" r="1.3"/>
  </svg>
)

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({ value, onChange, size = 'md' }) {
  const w = size === 'sm' ? 32 : 40
  const h = size === 'sm' ? 18 : 22
  const d = size === 'sm' ? 14 : 18
  return (
    <button
      onClick={() => onChange(!value)}
      title={value ? 'En stock' : 'Sin stock'}
      style={{
        width: w, height: h, borderRadius: h / 2,
        background: value ? C.green : '#CBD5E1',
        border: 'none', cursor: 'pointer',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: (h - d) / 2,
        left: value ? w - d - (h - d) / 2 : (h - d) / 2,
        width: d, height: d, borderRadius: '50%',
        background: '#fff', transition: 'left 0.18s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
      }} />
    </button>
  )
}

// ── ConfirmModal ──────────────────────────────────────────────────────────────
function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000, padding: 16,
    }}>
      <div style={{
        background: C.white, borderRadius: 12, padding: '32px 28px',
        maxWidth: 360, width: '100%', boxShadow: '0 16px 48px rgba(0,0,0,0.25)',
      }}>
        <p style={{ margin: '0 0 24px', color: C.ink, fontSize: 15, lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={outlineBtn}>Cancelar</button>
          <button
            onClick={onConfirm}
            style={{ ...solidBtn, background: C.red, color: '#fff' }}
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}

function DismissibleErrorNotice({ children, marginBottom = 20, fontSize = 13 }) {
  const [visible, setVisible] = useState(true)

  if (!visible) return null

  return (
    <div
      role="alert"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        background: C.white, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.red}`,
        borderRadius: 8, padding: '11px 12px 11px 14px', marginBottom,
        color: C.ink, fontSize, boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
      }}
    >
      <span style={{ lineHeight: 1.4 }}>{children}</span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Cerrar aviso"
        title="Cerrar aviso"
        style={{
          display: 'grid', placeItems: 'center', flexShrink: 0,
          width: 28, height: 28, padding: 0, border: 'none', borderRadius: 6,
          background: 'transparent', color: C.text3, cursor: 'pointer', fontSize: 16,
        }}
      >
        ✕
      </button>
    </div>
  )
}

// ── FormField — input reutilizable para los modales de producto/inventario ──
// Definido a nivel de módulo (no dentro del componente que lo usa): si se
// redefine en cada render, React lo trata como un tipo de componente distinto
// y remonta el <input> en cada tecla, haciendo que pierda el foco todo el
// tiempo y parezca que "no deja escribir".
function FormField({ label, value, onChange, type = 'text', placeholder = '', span = 1, step, disabled = false }) {
  return (
    <div style={{ gridColumn: `span ${span}`, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={lbl}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? step : undefined}
        disabled={disabled}
        style={disabled ? { ...inp, opacity: 0.6, cursor: 'not-allowed' } : inp}
      />
    </div>
  )
}

// ── InventoryLookup — busca en el inventario interno y devuelve el producto ──
// elegido, para precargar el formulario del catálogo público con esos datos.
function InventoryLookup({ onSelect }) {
  const { searchProducts } = useAdmin()
  const [query, setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen]     = useState(false)

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) { setResults([]); return undefined }
    const t = setTimeout(async () => setResults(await searchProducts(query)), 300)
    return () => clearTimeout(t)
  }, [query, searchProducts])

  return (
    <div style={{ gridColumn: 'span 2', position: 'relative' }}>
      <label style={lbl}>Cargar datos desde el inventario (opcional)</label>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Buscar por código o descripción del inventario..."
        style={{ ...inp, marginTop: 5 }}
      />
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', zIndex: 10, top: '100%', left: 0, right: 0, marginTop: 4,
          background: C.white, border: `1px solid ${C.border}`, borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto',
        }}>
          {results.map(p => (
            <div
              key={p.id}
              onMouseDown={() => { onSelect(p); setQuery(''); setResults([]); setOpen(false) }}
              style={{ padding: '8px 12px', fontSize: 12.5, color: C.text2, cursor: 'pointer', borderBottom: `1px solid ${C.hairline}` }}
              onMouseEnter={e => e.currentTarget.style.background = C.paper}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ fontWeight: 600 }}>{p.codigo} — {p.descripcion || 'sin descripción'}</div>
              <div style={{ color: C.muted }}>
                stock: {p.stock}{p.precio_venta != null ? ` · precio venta: ${fmt(p.precio_venta)}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── ImageFileField — sube un archivo y conserva internamente la URL devuelta
// por el servidor. También admite imágenes durante el alta de un producto.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

function ImageFileField({ label, value, onChange, productId, compact = false }) {
  const inputRef = useRef(null)
  const { uploadProductImage } = useAdmin()
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  const handleFile = async (file) => {
    setError('')
    if (!file.type.startsWith('image/')) { setError('El archivo debe ser una imagen'); return }
    if (file.size > MAX_IMAGE_BYTES) { setError('La imagen no puede pesar más de 8 MB'); return }
    setUploading(true)
    try {
      const { url } = await uploadProductImage(productId, file)
      onChange(url)
    } catch (err) {
      setError(err.message || 'No se pudo subir la imagen')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={lbl}>{label}</label>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 6 : 10, flexWrap: 'wrap' }}>
        {value && (
          <img
            src={value} alt=""
            style={{ width: compact ? 34 : 44, height: compact ? 34 : 44, objectFit: 'cover', borderRadius: 6, border: `1px solid ${C.border}`, flexShrink: 0 }}
          />
        )}
        <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} style={{ ...outlineBtn, fontSize: compact ? 10.5 : 11.5, padding: compact ? '5px 8px' : '7px 12px', opacity: uploading ? 0.6 : 1 }}>
          {uploading ? 'Subiendo...' : 'Subir archivo'}
        </button>
        {value && (
          <button type="button" onClick={() => onChange('')} style={{ ...outlineBtn, fontSize: compact ? 10.5 : 11.5, padding: compact ? '5px 8px' : '7px 12px', color: C.red }}>
            Quitar
          </button>
        )}
      </div>
      {error && <p style={{ fontSize: 11, color: C.red, margin: 0 }}>{error}</p>}
    </div>
  )
}

// ── ProductModal ──────────────────────────────────────────────────────────────
// Best-effort: adivina la categoría a partir de grupo/subgrupo del Inventario
// (marca/distribuidor del proveedor, no coincide 1 a 1 con las categorías de
// la tienda). Si no matchea ninguna, se deja vacío para que se asigne a mano.
function guessCategory(grupo, subgrupo) {
  const text = `${grupo || ''} ${subgrupo || ''}`.toUpperCase()
  if (/LED|LAMPAR|LUMINAR|ILUMINA|REFLECTOR|APLIQUE|PLAFON/.test(text)) return 'Iluminación'
  if (/HERRAMIENT|TALADRO|PINZA|DESTORNILL|SOLDADOR|AMOLADORA|LLAVE/.test(text)) return 'Herramientas'
  if (/CONTACTOR|GUARDAMOTOR|VARIADOR|AUTOMAT|RELE|PLC/.test(text)) return 'Automatización Industrial'
  return ''
}

const EMPTY = {
  codigo: '', supplier: 'OTRO', inventoryDescription: '',
  priceCost: '', priceWithTax: '',
  name: '', category: '', subcategory: '', productType: '',
  price: '', originalPrice: '',
  description: '', image: '', hoverImage: '',
  lengthCm: '', widthCm: '', heightCm: '', weightKg: '',
  inStock: true, stock: '', colors: [], sizes: [], variantStock: {},
  published: true,
}

// Normaliza una fila de la API para editar todos sus datos en un único modal.
function draftFromInventoryRow(inv) {
  return {
    ...EMPTY,
    id:          inv.id,
    codigo:      inv.codigo || '',
    supplier:    inv.supplier || 'OTRO',
    inventoryDescription: inv.descripcion || '',
    priceCost:   inv.precio_costo ?? '',
    priceWithTax: inv.precio_iva ?? '',
    name:        inv.name || inv.descripcion || '',
    description: inv.description_larga || inv.descripcion || '',
    category:    inv.category || guessCategory(inv.grupo, inv.subgrupo),
    subcategory: inv.subcategory || '',
    price:       inv.precio_venta ?? inv.precio_costo ?? '',
    originalPrice: inv.original_price ?? '',
    stock:       inv.stock ?? '',
    inStock:     inv.stock > 0,
    image:       inv.image_url || '',
    hoverImage:  inv.hover_image_url || '',
    colorTemp:   inv.color_temp,
    ipRating:    inv.ip_rating,
    watts:       inv.watts,
    material:    inv.material,
    productType: inv.product_type || inv.cable_type || '',
    lengthCm:    inv.length_cm ?? '',
    widthCm:     inv.width_cm ?? '',
    heightCm:    inv.height_cm ?? '',
    weightKg:    inv.weight_kg ?? '',
    colors:      inv.color_options || [],
    sizes:       inv.size_options || [],
    variantStock: inv.variant_stock || {},
    published:   Boolean(inv.published),
  }
}

function toUnifiedProductPayload(data) {
  return {
    codigo: data.codigo,
    supplier: data.supplier || 'OTRO',
    descripcion: data.inventoryDescription || null,
    precio_costo: data.priceCost,
    precio_venta: data.price,
    precio_iva: data.priceWithTax,
    stock: data.stock === '' ? 0 : Number(data.stock),
    name: data.name?.trim() || null,
    category: data.category || null,
    subcategory: data.subcategory || null,
    product_type: data.productType || null,
    length_cm: data.lengthCm === '' ? null : Number(data.lengthCm),
    width_cm: data.widthCm === '' ? null : Number(data.widthCm),
    height_cm: data.heightCm === '' ? null : Number(data.heightCm),
    weight_kg: data.weightKg === '' ? null : Number(data.weightKg),
    description_larga: data.description?.trim() || null,
    original_price: data.originalPrice ?? null,
    image_url: data.image || null,
    hover_image_url: data.hoverImage || null,
    color_options: data.colors || [],
    size_options: data.sizes || [],
    variant_stock: data.variantStock || {},
    color_temp: data.colorTemp || null,
    ip_rating: data.ipRating || null,
    watts: data.watts || null,
    material: data.material || null,
    published: Boolean(data.published),
  }
}

function ProductModal({ product, onSave, onClose, publishOnSave = false }) {
  const { currencySettings, categoryTree } = useAdmin()
  const isNew = !product
  const [form, setForm] = useState(() => isNew ? EMPTY : {
    ...EMPTY,
    ...product,
    price:         String(product.price ?? ''),
    originalPrice: String(product.originalPrice ?? ''),
    priceCost:     String(product.priceCost ?? ''),
    priceWithTax:  String(product.priceWithTax ?? ''),
    stock:         String(product.stock ?? ''),
    lengthCm:      String(product.lengthCm ?? ''),
    widthCm:       String(product.widthCm ?? ''),
    heightCm:      String(product.heightCm ?? ''),
    weightKg:      String(product.weightKg ?? ''),
    colors:        product.colors || [],
    sizes:         product.sizes || [],
    variantStock:  product.variantStock || {},
  })
  const [useVariantStock, setUseVariantStock] = useState(
    () => Object.keys(product?.variantStock || {}).length > 0
  )

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const willBePublished = publishOnSave || form.published
  const valid = (!isNew || form.codigo.trim()) && (!willBePublished || (form.name.trim() && form.price && Number(form.price) > 0))
  const subOptions = getSubcategoryOptions(form.category, categoryTree).map(node => node.label)
  const typeOptions = getProductTypeOptions(form.category, form.subcategory, categoryTree).map(node => node.label)
  const usdArsRate = Number(currencySettings.usdArsRate) || 1510

  const setColor = (idx, key, value) => setForm(f => ({
    ...f,
    colors: f.colors.map((c, i) => i === idx ? { ...c, [key]: value } : c),
  }))
  const addColor = () => setForm(f => ({ ...f, colors: [...f.colors, { name: '', hex: '#000000', image: '', price: '' }] }))
  const removeColor = (idx) => setForm(f => ({ ...f, colors: f.colors.filter((_, i) => i !== idx) }))

  const setSize = (idx, key, value) => setForm(f => ({
    ...f,
    sizes: f.sizes.map((s, i) => i === idx ? { ...s, [key]: value } : s),
  }))
  const addSize = () => setForm(f => ({ ...f, sizes: [...f.sizes, { label: '', price: '' }] }))
  const removeSize = (idx) => setForm(f => ({ ...f, sizes: f.sizes.filter((_, i) => i !== idx) }))

  // Stock por combinación exacta color×medida. Filas = colores (o una sola
  // fila implícita '_' si el producto no tiene colores), columnas = medidas
  // (o una sola columna implícita '_' si no tiene medidas).
  const filledColorNames = form.colors.map(c => c.name).filter(Boolean)
  const filledSizeLabels = form.sizes.map(s => s.label).filter(Boolean)
  const variantRows = filledColorNames.length ? filledColorNames : ['_']
  const variantCols = filledSizeLabels.length ? filledSizeLabels : ['_']
  const setVariantCell = (rowKey, colKey, value) => setForm(f => ({
    ...f,
    variantStock: {
      ...f.variantStock,
      [rowKey]: { ...(f.variantStock[rowKey] || {}), [colKey]: value },
    },
  }))
  const variantStockTotal = Object.values(form.variantStock)
    .flatMap(row => Object.values(row || {}))
    .reduce((sum, v) => sum + (Number(v) || 0), 0)

  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!valid || saving) return
    setSaving(true)
    const out = { ...form, price: form.price === '' ? null : Number(form.price) }
    out.codigo = form.codigo.trim()
    out.supplier = form.supplier.trim().toUpperCase() || 'OTRO'
    out.inventoryDescription = form.inventoryDescription.trim()
    out.lengthCm = form.lengthCm === '' ? null : Number(form.lengthCm)
    out.widthCm = form.widthCm === '' ? null : Number(form.widthCm)
    out.heightCm = form.heightCm === '' ? null : Number(form.heightCm)
    out.weightKg = form.weightKg === '' ? null : Number(form.weightKg)
    out.priceCost = form.priceCost === '' ? null : Number(form.priceCost)
    out.priceWithTax = form.priceWithTax === '' ? null : Number(form.priceWithTax)
    out.originalPrice = form.originalPrice ? Number(form.originalPrice) : null
    if (publishOnSave) out.published = true
    if (form.stock !== '') {
      out.stock   = Number(form.stock)
      out.inStock = out.stock > 0
    } else {
      delete out.stock
    }
    out.colors = form.colors.filter(c => c.name?.trim()).map(c => ({ ...c, price: c.price === '' || c.price == null ? null : Number(c.price) }))
    out.sizes  = form.sizes.filter(s => s.label.trim()).map(s => ({ ...s, price: s.price === '' || s.price == null ? null : Number(s.price) }))

    if (useVariantStock) {
      const rowKeys = out.colors.length ? out.colors.map(c => c.name) : ['_']
      const colKeys = out.sizes.length ? out.sizes.map(s => s.label) : ['_']
      const cleanedVariantStock = {}
      let total = 0
      for (const rowKey of rowKeys) {
        const row = form.variantStock[rowKey] || {}
        cleanedVariantStock[rowKey] = {}
        for (const colKey of colKeys) {
          const n = Math.max(0, Math.round(Number(row[colKey]) || 0))
          cleanedVariantStock[rowKey][colKey] = n
          total += n
        }
      }
      out.variantStock = cleanedVariantStock
      out.stock = total
      out.inStock = total > 0
    } else {
      out.variantStock = {}
    }
    try {
      await onSave(out)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
    >
      <div className="adm-product-modal" style={{
        background: C.paper, borderRadius: 12,
        width: '100%', maxWidth: 1180,
        maxHeight: '94vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div className="adm-product-modal__header" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '24px 28px 18px', borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          <h2 style={{ fontFamily: ADMIN_FONT, fontSize: 22, color: C.ink, margin: 0, fontWeight: 500 }}>
            {publishOnSave ? 'Configurar y publicar' : isNew ? 'Nuevo producto' : 'Editar producto'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        <div className="adm-product-modal__body" style={{ overflowY: 'auto', padding: '24px 28px', flex: 1, minHeight: 0 }}>
        <div className="adm-product-modal__columns">
          <section className="adm-product-modal__section">
          <h3 style={{ ...sectionTitle, margin: '0 0 14px' }}>Datos internos</h3>
          <div className="adm-product-modal__fields">
          <FormField label="Código *" value={form.codigo} onChange={v => set('codigo', v)} placeholder="ej: ALC-PO043" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={lbl}>Proveedor</label>
            <input list="supplier-options" value={form.supplier} onChange={e => set('supplier', e.target.value)} placeholder="ej: ALCIDES" style={inp} />
            <datalist id="supplier-options">{SUPPLIER_FILTERS.filter(s => s !== 'Todos').map(s => <option key={s} value={s} />)}</datalist>
          </div>
          <FormField label="Descripción interna" value={form.inventoryDescription} onChange={v => set('inventoryDescription', v)} span={2} />
          <FormField
            label={useVariantStock ? 'Stock (suma de las variantes)' : 'Stock'}
            value={useVariantStock ? String(variantStockTotal) : form.stock}
            onChange={v => set('stock', v)}
            type="number"
            disabled={useVariantStock}
          />
          <div style={{ gridColumn: 'span 2', marginTop: 4 }}>
            <label style={lbl}>Dimensiones para envío</label>
            <p style={{ fontSize: 10.5, color: C.muted, margin: '3px 0 8px' }}>Medidas del paquete en centímetros y peso aproximado en kilogramos.</p>
            <div className="adm-product-modal__shipping-fields">
              <FormField label="Largo (cm)" value={form.lengthCm} onChange={v => set('lengthCm', v)} type="number" step="0.01" />
              <FormField label="Ancho (cm)" value={form.widthCm} onChange={v => set('widthCm', v)} type="number" step="0.01" />
              <FormField label="Alto (cm)" value={form.heightCm} onChange={v => set('heightCm', v)} type="number" step="0.01" />
              <FormField label="Peso aprox. (kg)" value={form.weightKg} onChange={v => set('weightKg', v)} type="number" step="0.001" />
            </div>
          </div>
          <FormField label="Precio costo (ARS)" value={form.priceCost} onChange={v => set('priceCost', v)} type="number" />
          <FormField label="Precio de venta (ARS)" value={form.price} onChange={v => set('price', v)} type="number" />
          <FormField label="Precio con IVA (ARS)" value={form.priceWithTax} onChange={v => set('priceWithTax', v)} type="number" />
          <div style={{ gridColumn: 'span 2', color: C.muted, fontSize: 11.5, marginTop: -4 }}>
            Equivalentes con US$ 1 = {fmt(usdArsRate)}: costo {form.priceCost !== '' ? fmtUsd(Number(form.priceCost) / usdArsRate) : '—'} · venta {form.price !== '' ? fmtUsd(Number(form.price) / usdArsRate) : '—'} · con IVA {form.priceWithTax !== '' ? fmtUsd(Number(form.priceWithTax) / usdArsRate) : '—'}
          </div>
          </div>
          </section>

          <section className="adm-product-modal__section adm-product-modal__section--store">
            <h3 style={{ ...sectionTitle, margin: '0 0 14px' }}>Información para la tienda online</h3>
            <div className="adm-product-modal__fields">
              <FormField label="Nombre del producto *" value={form.name} onChange={v => set('name', v)} span={2} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={lbl}>Categoría *</label>
            <input
              list="category-options"
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value, subcategory: '', productType: '' }))}
              placeholder="ej: Electricidad"
              style={inp}
            />
            <datalist id="category-options">
              {CATS.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={lbl}>Subcategoría</label>
            <select value={form.subcategory} onChange={e => setForm(f => ({ ...f, subcategory: e.target.value, productType: '' }))} style={inp}>
              <option value="">Sin subcategoría</option>
              {subOptions.map(s => <option key={s} value={s}>{s}</option>)}
              {form.subcategory && !subOptions.includes(form.subcategory) && (
                <option value={form.subcategory}>{form.subcategory} (actual)</option>
              )}
            </select>
          </div>
          {typeOptions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={lbl}>{form.subcategory === 'Cables Normalizados' ? 'Tipo de cable' : 'Tipo / clasificación'}</label>
              <select value={form.productType || ''} onChange={e => set('productType', e.target.value)} style={inp}>
                <option value="">Sin especificar</option>
                {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                {form.productType && !typeOptions.includes(form.productType) && (
                  <option value={form.productType}>{form.productType} (actual)</option>
                )}
              </select>
            </div>
          )}
          <FormField label="Precio original (para mostrar oferta)" value={form.originalPrice} onChange={v => set('originalPrice', v)} type="number" placeholder="36900" />

          <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={lbl}>Descripción</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              style={{ ...inp, resize: 'vertical' }}
            />
          </div>

          <ImageFileField label="Imagen principal" value={form.image} onChange={v => set('image', v)} productId={product?.id} />
          <ImageFileField label="Imagen hover (opcional)" value={form.hoverImage} onChange={v => set('hoverImage', v)} productId={product?.id} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={lbl}>Visibilidad en la tienda</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 38 }}>
                  {!publishOnSave && <Toggle value={form.published} onChange={v => set('published', v)} />}
                  {publishOnSave && <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: C.green }} />}
                  <span style={{ fontSize: 13, color: willBePublished ? C.green : C.text3, fontWeight: 600 }}>
                    {publishOnSave ? 'Se publicará al guardar' : form.published ? 'Publicado' : 'Sin publicar (borrador)'}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Variantes de color */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={lbl}>Colores (opcional)</label>
            <button type="button" onClick={addColor} style={{ ...outlineBtn, padding: '5px 12px', fontSize: 11 }}>
              + Agregar color
            </button>
          </div>
          <p style={{ fontSize: 11.5, color: C.muted, margin: '0 0 10px' }}>
            Si cargás colores, el comprador va a poder elegir uno en la página del producto. La imagen por color es opcional; si falta, se usa la foto principal. Si le cargás un precio a un color, ese precio reemplaza al precio de venta cuando el comprador elige ese color; si lo dejás vacío, usa el precio de venta normal.
          </p>

          {form.colors.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 }}>
              {form.colors.map((c, idx) => (
                <div key={idx} style={{
                  display: 'grid', gridTemplateColumns: '38px minmax(120px, 1fr) 120px minmax(200px, 1.3fr) auto', gap: 8, alignItems: 'center',
                  padding: 8, background: C.white, border: `1px solid ${C.border}`, borderRadius: 6,
                }}>
                  <input
                    type="color"
                    value={c.hex || '#000000'}
                    onChange={e => setColor(idx, 'hex', e.target.value)}
                    title="Color"
                    style={{ width: 34, height: 34, padding: 0, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    value={c.name}
                    onChange={e => setColor(idx, 'name', e.target.value)}
                    placeholder="Nombre (ej: Negro)"
                    style={inp}
                  />
                  <input
                    type="number"
                    min={0}
                    value={c.price ?? ''}
                    onChange={e => setColor(idx, 'price', e.target.value)}
                    placeholder="Precio propio"
                    title="Precio de venta propio de este color (ARS). Vacío = usa el precio de venta del producto."
                    style={inp}
                  />
                  <ImageFileField
                    compact
                    value={c.image}
                    onChange={value => setColor(idx, 'image', value)}
                    productId={product?.id}
                  />
                  <button
                    type="button"
                    onClick={() => removeColor(idx)}
                    aria-label="Quitar color"
                    style={{ ...iconBtn, color: C.red }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Variantes de medida comerciales */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={lbl}>Variantes de medida (opcional)</label>
            <button type="button" onClick={addSize} style={{ ...outlineBtn, padding: '5px 12px', fontSize: 11 }}>
              + Agregar medida
            </button>
          </div>
          <p style={{ fontSize: 11.5, color: C.muted, margin: '0 0 10px' }}>
            Si el producto viene en distintas medidas (ej: un cable de 5 m o de 10 m), cargalas acá y el comprador va a poder elegir una en la página del producto. Si no cargás ninguna, se vende con una sola medida fija. Si le cargás un precio a una medida, ese precio reemplaza al precio de venta cuando el comprador elige esa medida; si lo dejás vacío, usa el precio de venta normal.
          </p>

          {form.sizes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 }}>
              {form.sizes.map((s, idx) => (
                <div key={idx} style={{
                  display: 'grid', gridTemplateColumns: '1fr 140px auto', gap: 8, alignItems: 'center',
                  padding: 8, background: C.white, border: `1px solid ${C.border}`, borderRadius: 6,
                }}>
                  <input
                    type="text"
                    value={s.label}
                    onChange={e => setSize(idx, 'label', e.target.value)}
                    placeholder="Medida (ej: 5 m, 10 m, 2.5 mm)"
                    style={inp}
                  />
                  <input
                    type="number"
                    min={0}
                    value={s.price ?? ''}
                    onChange={e => setSize(idx, 'price', e.target.value)}
                    placeholder="Precio propio"
                    title="Precio de venta propio de esta medida (ARS). Vacío = usa el precio de venta del producto."
                    style={inp}
                  />
                  <button
                    type="button"
                    onClick={() => removeSize(idx)}
                    aria-label="Quitar medida"
                    style={{ ...iconBtn, color: C.red }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stock por combinación exacta color×medida */}
        {(form.colors.length > 0 || form.sizes.length > 0) && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Toggle value={useVariantStock} onChange={setUseVariantStock} />
              <label style={lbl}>Cargar stock por color/medida</label>
            </div>
            <p style={{ fontSize: 11.5, color: C.muted, margin: '0 0 10px' }}>
              Si lo activás, cargás una cantidad para cada combinación exacta (ej: Negro + medida 10) y el campo "Stock" de arriba pasa a ser la suma de todas. Si lo dejás apagado, seguís usando un único número de stock para todo el producto, como siempre.
            </p>
            {useVariantStock && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      <th style={{ padding: 6, textAlign: 'left' }} />
                      {variantCols.map(colKey => (
                        <th key={colKey} style={{ padding: 6, textAlign: 'center', fontWeight: 600, color: C.text3, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {colKey === '_' ? 'Stock' : colKey}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {variantRows.map(rowKey => (
                      <tr key={rowKey}>
                        <td style={{ padding: 6, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap' }}>
                          {rowKey === '_' ? 'Stock' : rowKey}
                        </td>
                        {variantCols.map(colKey => (
                          <td key={colKey} style={{ padding: 4 }}>
                            <input
                              type="number"
                              min={0}
                              value={form.variantStock[rowKey]?.[colKey] ?? ''}
                              onChange={e => setVariantCell(rowKey, colKey, e.target.value)}
                              style={{ ...inp, width: 70, textAlign: 'center' }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ fontSize: 12, color: C.muted, margin: '8px 0 0' }}>
                  Stock total: <strong style={{ color: C.ink }}>{variantStockTotal}</strong>
                </p>
              </div>
            )}
          </div>
        )}

        {form.image && (
          <div style={{ marginTop: 16 }}>
            <label style={lbl}>Vista previa</label>
            <img
              src={form.image}
              alt="preview"
              onError={e => { e.target.style.display = 'none' }}
              style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, marginTop: 6, border: `1px solid ${C.border}` }}
            />
          </div>
        )}
        </div>

        {/* Actions */}
        <div className="adm-product-modal__actions" style={{
          display: 'flex', gap: 10, justifyContent: 'flex-end',
          padding: '16px 28px', borderTop: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          <button onClick={onClose} style={outlineBtn}>Cancelar</button>
          <button
            onClick={handleSave}
            disabled={!valid || saving}
            style={{ ...solidBtn, background: valid && !saving ? C.red : '#ddd', color: valid && !saving ? '#fff' : '#aaa', cursor: valid && !saving ? 'pointer' : 'not-allowed' }}
          >
            {saving ? 'Guardando...' : publishOnSave ? 'Publicar producto' : isNew ? '+ Agregar producto' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── OverviewTab ───────────────────────────────────────────────────────────────
const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const PENDING_DELIVERY_STATUSES = ['paid', 'preparing', 'shipped']

function OverviewTab({ products }) {
  const { orders, fetchOrders, updateOrderStatus } = useAdmin()
  const [selectedOrder, setSelectedOrder] = useState(null)

  useEffect(() => {
    fetchOrders({ limit: 200 })
  }, [fetchOrders])

  const inStock    = products.filter(p => p.inStock).length
  const outOfStock = products.length - inStock
  const withOffer  = products.filter(p => p.originalPrice).length

  const byCat = CATS.map(cat => {
    const items = products.filter(p => p.category === cat)
    return { cat, count: items.length, inStock: items.filter(p => p.inStock).length }
  })

  const lowStock = products.filter(p => p.stock !== undefined && p.stock <= 5 && p.inStock)

  const now    = new Date()
  const monthLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`

  // Filtra pedidos pagados del mes actual
  const monthSales = orders.filter(o => {
    if (!o.paid_at) return false
    const d = new Date(o.paid_at)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  })
  const monthRevenue = monthSales.reduce((sum, o) => sum + Number(o.total_amount), 0)
  const top5         = computeTop5(monthSales)

  // Pedidos ya pagados que todavía no llegaron al cliente — más viejos primero
  const pendingDelivery = orders
    .filter(o => PENDING_DELIVERY_STATUSES.includes(o.status))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  // Reservas de retiro a pagar en el local — este stock ya está descontado,
  // no se debe vender en el mostrador. Fecha de retiro más próxima primero.
  const reservations = orders
    .filter(o => o.status === 'reserved')
    .sort((a, b) => new Date(a.pickup_date) - new Date(b.pickup_date))

  async function handleStatusChange(id, status) {
    await updateOrderStatus(id, status)
    fetchOrders({ limit: 200 })
  }

  const StatCard = ({ label, value, accent }) => (
    <div style={{
      background: C.white, borderRadius: 8, padding: '18px 22px',
      border: `1px solid ${C.border}`,
      borderTop: `3px solid ${accent || C.border}`,
    }}>
      <div style={{ fontSize: 26, fontWeight: 600, color: C.ink, fontFamily: ADMIN_FONT, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.06em', marginTop: 8, textTransform: 'uppercase' }}>{label}</div>
    </div>
  )

  return (
    <div>
      {/* ── Ventas del mes ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 28 }}>
        {/* Total recaudado */}
        <div style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, padding: '24px 28px' }}>
          <div style={{ fontSize: 11, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 10 }}>
            Total recaudado — {monthLabel}
          </div>
          <div style={{ fontSize: 34, fontWeight: 600, color: C.ink, fontFamily: ADMIN_FONT, lineHeight: 1 }}>
            {monthRevenue > 0 ? fmt(monthRevenue) : '—'}
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
            {monthSales.length === 0
              ? 'Sin ventas registradas este mes'
              : `${monthSales.length} pedido${monthSales.length !== 1 ? 's' : ''} este mes`}
          </div>
        </div>

        {/* Pedidos por entregar */}
        <div style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>
              Pedidos por entregar
            </div>
            {pendingDelivery.length > 0 && (
              <span style={pill(C.amberLight, C.amberDark)}>{pendingDelivery.length}</span>
            )}
          </div>
          {pendingDelivery.length === 0 ? (
            <div style={{ fontSize: 13, color: C.muted, paddingTop: 4 }}>No hay pedidos pendientes de entrega.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {pendingDelivery.map((o, i) => (
                <div key={o.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                  borderTop: i > 0 ? `1px solid ${C.hairline}` : 'none',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.ink, fontFamily: ADMIN_FONT, flexShrink: 0 }}>
                    #{o.order_number}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: C.ink, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.customer_name}
                    </div>
                    <div style={{ fontSize: 11, color: C.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.delivery_type === 'pickup' ? 'Retiro en local' : `Domicilio: ${o.address}${o.city ? `, ${o.city}` : ''}`}
                    </div>
                  </div>
                  <StatusBadge status={o.status} />
                  <button
                    onClick={() => setSelectedOrder(o)}
                    style={{ ...solidBtn, background: C.dark, color: '#fff', fontSize: 11, padding: '5px 12px', flexShrink: 0 }}
                  >
                    Ver
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reservas de retiro (pago en el local) */}
        <div style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>
              Reservas de retiro — no vender este stock en el local
            </div>
            {reservations.length > 0 && (
              <span style={pill(C.amberLight, C.amberDark)}>{reservations.length}</span>
            )}
          </div>
          {reservations.length === 0 ? (
            <div style={{ fontSize: 13, color: C.muted, paddingTop: 4 }}>No hay reservas pendientes.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {reservations.map((o, i) => (
                <div key={o.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                  borderTop: i > 0 ? `1px solid ${C.hairline}` : 'none',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.ink, fontFamily: ADMIN_FONT, flexShrink: 0 }}>
                    #{o.order_number}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: C.ink, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.customer_name}
                    </div>
                    <div style={{ fontSize: 11, color: C.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Retira el {o.pickup_date ? fmtPickupDate(o.pickup_date) : '—'}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedOrder(o)}
                    style={{ ...solidBtn, background: C.dark, color: '#fff', fontSize: 11, padding: '5px 12px', flexShrink: 0 }}
                  >
                    Ver
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top 5 productos */}
        <div style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, padding: '24px 28px' }}>
          <div style={{ fontSize: 11, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 12 }}>
            Top 5 más vendidos — {monthLabel}
          </div>
          {top5.length === 0 ? (
            <div style={{ fontSize: 13, color: C.muted, paddingTop: 4 }}>Sin datos este mes</div>
          ) : (
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {top5.map((p, i) => (
                <li key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    minWidth: 22, height: 22, borderRadius: '50%',
                    background: i === 0 ? C.amber : C.hairline,
                    color: i === 0 ? C.dark : C.text3,
                    fontSize: 11, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {i + 1}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, color: C.ink, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </span>
                  <span style={{ fontSize: 12, color: C.text3, flexShrink: 0 }}>
                    {p.units} u.
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* ── Inventario ── */}
      <h3 style={sectionTitle}>Resumen de inventario</h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginBottom: 28 }}>
        <StatCard label="Total productos" value={products.length} accent={C.border} />
        <StatCard label="En stock" value={inStock} accent={C.green} />
        <StatCard label="Sin stock" value={outOfStock} accent={outOfStock > 0 ? C.red : C.border} />
        <StatCard label="Con oferta" value={withOffer} accent={C.amber} />
      </div>

      <h3 style={sectionTitle}>Productos por categoría</h3>
      <div style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        {byCat.map(({ cat, count, inStock }, i) => (
          <div key={cat} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: i < byCat.length - 1 ? `1px solid ${C.hairline}` : 'none',
          }}>
            <span style={{ fontSize: 14, color: C.ink }}>{cat}</span>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: C.text3 }}>{count} productos</span>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                background: inStock < count ? C.redLight : C.greenLight,
                color: inStock < count ? C.red : C.green,
              }}>
                {inStock}/{count} en stock
              </span>
            </div>
          </div>
        ))}
      </div>

      {lowStock.length > 0 && (
        <>
          <h3 style={{ ...sectionTitle, marginTop: 28 }}>Stock bajo (≤ 5 unidades)</h3>
          <div style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            {lowStock.map((p, i) => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px',
                borderBottom: i < lowStock.length - 1 ? `1px solid ${C.hairline}` : 'none',
              }}>
                {p.image && <img src={p.image} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: C.text3 }}>{p.category}</div>
                </div>
                <span style={{
                  fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                  background: C.amberLight, color: C.amberDark,
                }}>
                  {p.stock} unidades
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  )
}

// ── StoreTab ──────────────────────────────────────────────────────────────────
function StoreTab({ products, onUpdate, onDelete }) {
  const { fetchInventoryItem } = useAdmin()
  const [search, setSearch]     = useState('')
  const [catFilter, setCat]     = useState('Todas')
  const [editProduct, setEdit]  = useState(null)
  const [publishCandidate, setPublishCandidate] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [loadingProductId, setLoadingProductId] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [confirmId, setConfirmId] = useState(null)
  const [hoveredRow, setHoveredRow] = useState(null)

  const filtered = useMemo(() => {
    let list = products
    if (catFilter !== 'Todas') list = list.filter(p => p.category === catFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.subcategory || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [products, catFilter, search])

  const withOffer  = products.filter(p => p.originalPrice).length
  const outOfStock = products.filter(p => !p.inStock).length

  async function openStoreProduct(product) {
    if (loadingProductId) return
    setLoadingProductId(product.id)
    setLoadError('')
    try {
      const inventoryProduct = await fetchInventoryItem(product.id)
      setEdit(draftFromInventoryRow(inventoryProduct))
    } catch (err) {
      setLoadError(err.message || 'No se pudo cargar el producto')
    } finally {
      setLoadingProductId(null)
    }
  }

  function selectProductToPublish(product) {
    setPickerOpen(false)
    setPublishCandidate({ ...draftFromInventoryRow(product), published: true })
  }

  return (
    <div>
      {/* Stats bar + add button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span style={pill('#F3F4F6', C.text3)}>{products.length} productos</span>
          {outOfStock > 0 && <span style={pill(C.redLight, C.red)}>{outOfStock} sin stock</span>}
          {withOffer > 0 && <span style={pill(C.amberLight, C.amberDark)}>{withOffer} con oferta</span>}
        </div>
        <button onClick={() => setPickerOpen(true)} style={{ ...solidBtn, background: C.red, color: '#fff' }}>
          + Publicar producto
        </button>
      </div>

      <p style={{ margin: '-10px 0 18px', color: C.muted, fontSize: 12.5 }}>
        Acá se muestran únicamente los productos publicados. Para sumar uno, elegilo desde Productos y completá su ficha antes de publicarlo.
      </p>

      {loadError && (
        <DismissibleErrorNotice key={loadError} marginBottom={16} fontSize={12.5}>{loadError}</DismissibleErrorNotice>
      )}

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Buscar producto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inp, flex: 1, minWidth: 180 }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['Todas', ...CATS].map(c => (
            <button
              key={c}
              onClick={() => setCat(c)}
              style={{
                padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontSize: 11, fontFamily: 'inherit', fontWeight: 600,
                letterSpacing: '0.04em',
                background: catFilter === c ? C.red : C.hairline,
                color: catFilter === c ? '#fff' : C.text2,
                transition: 'all 0.15s',
              }}
            >
              {c === 'Todas' ? 'Todas' : CATEGORY_NAV_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      {/* Product list */}
      <div style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        {filtered.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: C.muted, fontSize: 14 }}>
            No se encontraron productos.
          </div>
        )}
        {filtered.map((p, i) => (
          <div
            key={p.id}
            onMouseEnter={() => setHoveredRow(p.id)}
            onMouseLeave={() => setHoveredRow(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
              borderBottom: i < filtered.length - 1 ? `1px solid ${C.hairline}` : 'none',
              background: hoveredRow === p.id ? '#F9FAFB' : 'transparent',
              transition: 'background 0.12s',
            }}
          >
            {/* Image */}
            <img
              src={p.image || 'https://via.placeholder.com/48'}
              alt={p.name}
              onError={e => { e.target.src = 'https://placehold.co/48x48?text=?' }}
              style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, flexShrink: 0, border: `1px solid ${C.hairline}` }}
            />

            {/* Name + category */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: C.ink, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.name}
              </div>
              <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>
                {p.category}{p.subcategory ? ` · ${p.subcategory}` : ''}
              </div>
            </div>

            {/* Price */}
            <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 110 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{fmt(p.price)}</div>
              {p.originalPrice && (
                <div style={{ fontSize: 11, color: C.text3, textDecoration: 'line-through' }}>{fmt(p.originalPrice)}</div>
              )}
              {p.originalPrice && (
                <span style={{
                  fontSize: 10, fontWeight: 600, background: C.amberLight, color: C.amberDark,
                  padding: '1px 6px', borderRadius: 10,
                }}>
                  -{pct(p.price, p.originalPrice)}%
                </span>
              )}
            </div>

            {/* Stock de referencia; se edita desde Productos. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, minWidth: 110 }}>
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: p.inStock ? C.green : C.red }} />
              <span style={{ fontSize: 12, color: p.inStock ? C.green : C.red, fontWeight: 600 }}>
                Stock: {p.stock ?? 0}
              </span>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => openStoreProduct(p)}
                disabled={loadingProductId === p.id}
                title="Editar"
                style={{ ...iconBtn, background: C.amberLight, color: C.amberDark, opacity: loadingProductId === p.id ? 0.55 : 1 }}
              >
                {loadingProductId === p.id ? '…' : '✎'}
              </button>
              <button
                onClick={() => setConfirmId(p.id)}
                title="Quitar de la tienda"
                style={{ ...iconBtn, background: C.redLight, color: C.red }}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modals */}
      {(editProduct || publishCandidate) && (
        <ProductModal
          product={publishCandidate || editProduct}
          publishOnSave={Boolean(publishCandidate)}
          onSave={publishCandidate
            ? (data) => onUpdate(publishCandidate.id, { ...data, published: true })
            : (data) => onUpdate(editProduct.id, data)}
          onClose={() => { setEdit(null); setPublishCandidate(null) }}
        />
      )}

      {pickerOpen && (
        <StoreProductPicker onSelect={selectProductToPublish} onClose={() => setPickerOpen(false)} />
      )}

      {confirmId !== null && (
        <ConfirmModal
          message={`¿Quitar "${products.find(p => p.id === confirmId)?.name}" de la tienda? Deja de verse en el catálogo, pero se mantiene en el Inventario y podés volver a publicarlo cuando quieras.`}
          onConfirm={() => { onDelete(confirmId); setConfirmId(null) }}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </div>
  )
}

// ── CategoriesTab ─────────────────────────────────────────────────────────────
// Administra los dos niveles que cuelgan de cada categoría del header:
// subcategoría (ej. "Cables Normalizados" dentro de Electricidad) y tipo/
// clasificación (ej. "Unipolares" dentro de esa subcategoría). Lo que se crea
// acá se guarda en las tablas `subcategories`/`product_types` y se refleja en
// vivo en el mega-menú del header y en los filtros de /products (ver
// `categoryTree` en AdminContext y `buildCategoryTree` en data/categoryTree.js).
function CategoriesTab() {
  const {
    categoryTree, subcategories, productTypes,
    createSubcategory, deleteSubcategory, createProductType, deleteProductType,
  } = useAdmin()

  // ── Nueva subcategoría ──
  const [subCategory, setSubCategory] = useState(CATS[0])
  const [subName, setSubName]         = useState('')
  const [savingSub, setSavingSub]     = useState(false)
  const [subError, setSubError]       = useState('')

  const handleAddSub = async (e) => {
    e.preventDefault()
    const trimmed = subName.trim()
    if (!trimmed) return
    setSubError('')
    setSavingSub(true)
    try {
      await createSubcategory(subCategory, trimmed)
      setSubName('')
    } catch (err) {
      setSubError(err.message)
    } finally {
      setSavingSub(false)
    }
  }

  // ── Nuevo tipo / clasificación ──
  const [typeCategory, setTypeCategory]       = useState(CATS[0])
  const [typeSubcategory, setTypeSubcategory] = useState('')
  const [typeName, setTypeName]               = useState('')
  const [savingType, setSavingType]           = useState(false)
  const [typeError, setTypeError]             = useState('')

  const typeSubcategoryOptions = getSubcategoryOptions(typeCategory, categoryTree).map(node => node.label)

  useEffect(() => {
    if (!typeSubcategoryOptions.includes(typeSubcategory)) {
      setTypeSubcategory(typeSubcategoryOptions[0] || '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeCategory, categoryTree])

  const handleAddType = async (e) => {
    e.preventDefault()
    const trimmed = typeName.trim()
    if (!trimmed || !typeSubcategory) return
    setTypeError('')
    setSavingType(true)
    try {
      await createProductType(typeCategory, typeSubcategory, trimmed)
      setTypeName('')
    } catch (err) {
      setTypeError(err.message)
    } finally {
      setSavingType(false)
    }
  }

  // ── Árbol completo, para ver y borrar lo agregado ──
  const [treeError, setTreeError] = useState('')
  const customSubcategoryId = (cat, name) => subcategories.find(s => s.category === cat && s.name === name)?.id
  const customTypeId = (cat, sub, name) => productTypes.find(t => t.category === cat && t.subcategory === sub && t.name === name)?.id

  const handleDeleteSub = async (id) => {
    setTreeError('')
    try {
      await deleteSubcategory(id)
    } catch (err) {
      setTreeError(err.message)
    }
  }

  const handleDeleteType = async (id) => {
    setTreeError('')
    try {
      await deleteProductType(id)
    } catch (err) {
      setTreeError(err.message)
    }
  }

  return (
    <div>
      <h3 style={sectionTitle}>Nueva subcategoría</h3>
      <div style={{
        background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
        padding: '20px 24px', marginBottom: 28,
      }}>
        <p style={{ fontSize: 13, color: C.text3, margin: '0 0 16px' }}>
          Agregá una subcategoría dentro de una categoría existente (ej. "Ventiladores de Techo" dentro de Herramientas). Va a aparecer en el menú "Categoría" del header y en los filtros de /products.
        </p>
        <form onSubmit={handleAddSub} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={lbl}>Categoría</label>
            <select value={subCategory} onChange={e => setSubCategory(e.target.value)} style={{ ...inp, width: 220 }}>
              {CATS.map(c => <option key={c} value={c}>{CATEGORY_NAV_LABEL[c]}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 220 }}>
            <label style={lbl}>Nombre de la subcategoría</label>
            <input value={subName} onChange={e => setSubName(e.target.value)} placeholder="ej: Ventiladores de Techo" style={inp} />
          </div>
          <button
            type="submit"
            disabled={savingSub || !subName.trim()}
            style={{
              ...solidBtn,
              background: !subName.trim() ? '#ddd' : C.red,
              color: !subName.trim() ? '#aaa' : '#fff',
              cursor: savingSub || !subName.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {savingSub ? 'Agregando...' : 'Agregar'}
          </button>
        </form>
        {subError && <p style={{ fontSize: 12, color: C.red, margin: '10px 0 0' }}>{subError}</p>}
      </div>

      <h3 style={sectionTitle}>Nuevo tipo / clasificación</h3>
      <div style={{
        background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
        padding: '20px 24px', marginBottom: 28,
      }}>
        <p style={{ fontSize: 13, color: C.text3, margin: '0 0 16px' }}>
          Es el tercer nivel, dentro de una subcategoría (ej. "Unipolares" dentro de "Cables Normalizados"). Podés usar una subcategoría de fábrica o una que hayas creado arriba.
        </p>
        <form onSubmit={handleAddType} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={lbl}>Categoría</label>
            <select value={typeCategory} onChange={e => setTypeCategory(e.target.value)} style={{ ...inp, width: 220 }}>
              {CATS.map(c => <option key={c} value={c}>{CATEGORY_NAV_LABEL[c]}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={lbl}>Subcategoría</label>
            <select
              value={typeSubcategory}
              onChange={e => setTypeSubcategory(e.target.value)}
              disabled={!typeSubcategoryOptions.length}
              style={{ ...inp, width: 220 }}
            >
              {typeSubcategoryOptions.length === 0 && <option value="">Sin subcategorías</option>}
              {typeSubcategoryOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 200 }}>
            <label style={lbl}>Nombre del tipo</label>
            <input value={typeName} onChange={e => setTypeName(e.target.value)} placeholder="ej: Unipolares" style={inp} />
          </div>
          <button
            type="submit"
            disabled={savingType || !typeName.trim() || !typeSubcategory}
            style={{
              ...solidBtn,
              background: !typeName.trim() || !typeSubcategory ? '#ddd' : C.red,
              color: !typeName.trim() || !typeSubcategory ? '#aaa' : '#fff',
              cursor: savingType || !typeName.trim() || !typeSubcategory ? 'not-allowed' : 'pointer',
            }}
          >
            {savingType ? 'Agregando...' : 'Agregar'}
          </button>
        </form>
        {typeError && <p style={{ fontSize: 12, color: C.red, margin: '10px 0 0' }}>{typeError}</p>}
      </div>

      <h3 style={{ ...sectionTitle, margin: 0 }}>Árbol de categorías</h3>
      <p style={{ fontSize: 12.5, color: C.muted, margin: '4px 0 14px' }}>
        Así se ve en la tienda: el menú "Categoría" del header y los filtros de /products usan esta misma estructura. Lo gris es de fábrica; lo ámbar lo agregaste vos y se puede borrar.
      </p>
      {treeError && <p style={{ fontSize: 12, color: C.red, margin: '0 0 10px' }}>{treeError}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {CATS.map(cat => {
          const subNodes = getSubcategoryOptions(cat, categoryTree)
          return (
            <div key={cat} style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, padding: '16px 20px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 10 }}>{CATEGORY_NAV_LABEL[cat]}</div>
              {subNodes.length === 0 ? (
                <span style={{ fontSize: 12, color: C.muted }}>Sin subcategorías todavía.</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {subNodes.map(subNode => {
                    const subId = customSubcategoryId(cat, subNode.label)
                    const typeNodes = subNode.children || []
                    return (
                      <div key={subNode.label} style={{ border: `1px solid ${C.hairline}`, borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{
                            fontSize: 12.5, fontWeight: 600,
                            color: subId ? C.amberDark : C.text2,
                          }}>
                            {subNode.label}
                          </span>
                          {subId && (
                            <button
                              onClick={() => handleDeleteSub(subId)}
                              title="Eliminar subcategoría"
                              style={{ border: 'none', background: 'transparent', color: C.amberDark, cursor: 'pointer', fontSize: 11.5 }}
                            >
                              Eliminar ✕
                            </button>
                          )}
                        </div>
                        {typeNodes.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                            {typeNodes.map(typeNode => {
                              const typeId = customTypeId(cat, subNode.label, typeNode.label)
                              return (
                                <span
                                  key={typeNode.label}
                                  style={{
                                    ...pill(typeId ? C.amberLight : C.hairline, typeId ? C.amberDark : C.text3),
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                  }}
                                >
                                  {typeNode.label}
                                  {typeId && (
                                    <button
                                      onClick={() => handleDeleteType(typeId)}
                                      title="Eliminar tipo"
                                      style={{ border: 'none', background: 'transparent', color: C.amberDark, cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}
                                    >
                                      ✕
                                    </button>
                                  )}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── OffersTab ─────────────────────────────────────────────────────────────────
function OffersTab({ products, onUpdate }) {
  const activeOffers = products.filter(p => p.originalPrice)

  const removeOffer = (p) => {
    if (!p.originalPrice) return
    onUpdate(p.id, { price: p.originalPrice, originalPrice: undefined })
  }

  const removeAllOffers = () => {
    activeOffers.forEach(p => onUpdate(p.id, { price: p.originalPrice, originalPrice: undefined }))
  }

  return (
    <div>
      {/* Aplicar oferta a producto */}
      <h3 style={sectionTitle}>Aplicar oferta a producto</h3>
      <div style={{
        background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
        padding: '20px 24px', marginBottom: 28,
      }}>
        <p style={{ fontSize: 13, color: C.text3, margin: '0 0 16px' }}>
          Buscá un producto y establecé el precio de oferta. El precio original se guarda automáticamente.
        </p>
        <SingleOfferForm products={products} onUpdate={onUpdate} />
      </div>

      {/* Ofertas activas */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ ...sectionTitle, margin: 0 }}>
          Ofertas activas{activeOffers.length > 0 ? <span style={{ fontFamily: ADMIN_FONT }}> ({activeOffers.length})</span> : ''}
        </h3>
        {activeOffers.length > 0 && (
          <button onClick={removeAllOffers} style={{ ...outlineBtn, color: C.red, borderColor: C.red, fontSize: 12 }}>
            Quitar todas
          </button>
        )}
      </div>

      {activeOffers.length === 0 ? (
        <div style={{
          background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
          padding: '32px 20px', textAlign: 'center', color: C.muted, fontSize: 14,
        }}>
          No hay ofertas activas.
        </div>
      ) : (
        <div style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          {activeOffers.map((p, i) => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
              borderBottom: i < activeOffers.length - 1 ? `1px solid ${C.hairline}` : 'none',
            }}>
              {p.image && (
                <img src={p.image} alt={p.name} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{p.name}</div>
                <div style={{ fontSize: 12, color: C.text3 }}>{p.category}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.red }}>{fmt(p.price)}</div>
                <div style={{ fontSize: 12, color: C.text3, textDecoration: 'line-through' }}>{fmt(p.originalPrice)}</div>
              </div>
              <span style={{
                fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 20,
                background: C.amberLight, color: C.amberDark, flexShrink: 0,
              }}>
                -{pct(p.price, p.originalPrice)}%
              </span>
              <button
                onClick={() => removeOffer(p)}
                title="Quitar oferta"
                style={{ ...iconBtn, background: C.redLight, color: C.red, flexShrink: 0 }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SingleOfferForm({ products, onUpdate }) {
  const [query, setQuery]         = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [newPrice, setNewPrice]     = useState('')
  const [msg, setMsg]               = useState('')
  const [showResults, setShowResults] = useState(false)

  const selectedProduct = products.find(p => p.id === selectedId)

  const results = query.trim()
    ? products
        .filter(p => p.name.toLowerCase().includes(query.trim().toLowerCase()))
        .slice(0, 8)
    : []

  const selectProduct = (p) => {
    setSelectedId(p.id)
    setQuery(p.name)
    setNewPrice('')
    setShowResults(false)
  }

  const clearSelection = () => {
    setSelectedId('')
    setQuery('')
    setNewPrice('')
  }

  const apply = () => {
    if (!selectedProduct || !newPrice) return
    const np = Number(newPrice)
    if (np <= 0 || np >= selectedProduct.price) return
    onUpdate(selectedProduct.id, {
      originalPrice: selectedProduct.originalPrice || selectedProduct.price,
      price: np,
    })
    setMsg(`✓ Oferta aplicada a "${selectedProduct.name}".`)
    clearSelection()
    setTimeout(() => setMsg(''), 3000)
  }

  const applyDisabled = !selectedProduct || !newPrice || Number(newPrice) >= selectedProduct?.price

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 220, position: 'relative' }}>
          <label style={lbl}>Producto</label>
          <input
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value)
              if (selectedId) setSelectedId('')
              setShowResults(true)
            }}
            onFocus={() => setShowResults(true)}
            onBlur={() => setTimeout(() => setShowResults(false), 150)}
            placeholder="Buscá un producto por nombre..."
            style={inp}
          />
          {showResults && !selectedProduct && query.trim() && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 10,
              background: C.white, border: `1px solid ${C.border}`, borderRadius: 8,
              maxHeight: 220, overflowY: 'auto', boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
            }}>
              {results.length > 0 ? results.map(p => (
                <div
                  key={p.id}
                  onMouseDown={() => selectProduct(p)}
                  style={{
                    padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                    borderBottom: `1px solid ${C.hairline}`,
                    display: 'flex', justifyContent: 'space-between', gap: 10,
                  }}
                >
                  <span>{p.name}</span>
                  <span style={{ color: C.text3 }}>{fmt(p.price)}</span>
                </div>
              )) : (
                <div style={{ padding: '10px 12px', fontSize: 13, color: C.text3 }}>
                  No se encontraron productos.
                </div>
              )}
            </div>
          )}
        </div>
        {selectedProduct && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={lbl}>Precio de oferta (ARS)</label>
            <input
              type="number"
              min={1}
              max={selectedProduct.price - 1}
              value={newPrice}
              onChange={e => setNewPrice(e.target.value)}
              placeholder={`Menor a ${fmt(selectedProduct.price)}`}
              style={{ ...inp, width: 180 }}
            />
          </div>
        )}
        <button
          onClick={apply}
          disabled={applyDisabled}
          style={{
            ...solidBtn,
            background: applyDisabled ? '#ddd' : C.red,
            color: applyDisabled ? '#aaa' : '#fff',
            cursor: applyDisabled ? 'not-allowed' : 'pointer',
            alignSelf: 'flex-end',
          }}
        >
          Aplicar oferta
        </button>
      </div>
      {msg && <p style={{ fontSize: 13, color: C.green, marginTop: 10, fontWeight: 600 }}>{msg}</p>}
    </div>
  )
}

// ── Shared micro-styles ───────────────────────────────────────────────────────
const inp = {
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: '7px 10px',
  fontSize: 12.5,
  color: C.ink,
  background: C.white,
  fontFamily: ADMIN_FONT,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  appearance: 'none',
}
const lbl = {
  fontSize: 9.5,
  fontWeight: 600,
  letterSpacing: '0.1em',
  color: C.text3,
  textTransform: 'uppercase',
}
const solidBtn = {
  padding: '7px 15px',
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer',
  fontSize: 11.5,
  fontWeight: 600,
  fontFamily: ADMIN_FONT,
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
}
const outlineBtn = {
  ...solidBtn,
  background: 'transparent',
  border: `1px solid ${C.border}`,
  color: C.text3,
}
const iconBtn = {
  width: 28, height: 28,
  borderRadius: 6, border: 'none',
  cursor: 'pointer', fontSize: 13,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'inherit',
  transition: 'opacity 0.15s',
}
const sectionTitle = {
  fontFamily: ADMIN_FONT,
  fontSize: 17,
  fontWeight: 500,
  color: C.ink,
  margin: '0 0 12px',
  letterSpacing: '0.01em',
}
const pill = (bg, color) => ({
  fontSize: 11,
  fontWeight: 600,
  padding: '3px 10px',
  borderRadius: 20,
  background: bg,
  color,
  letterSpacing: '0.02em',
})

// ── OrdersTab ─────────────────────────────────────────────────────────────────

function TooltipIconButton({ label, color, onClick, disabled = false, children }) {
  const [tooltip, setTooltip] = useState(null)

  const showTooltip = (event) => {
    if (disabled) return
    const rect = event.currentTarget.getBoundingClientRect()
    setTooltip({ left: rect.left + rect.width / 2, top: rect.bottom + 7 })
  }

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={onClick}
        onMouseEnter={showTooltip}
        onMouseLeave={() => setTooltip(null)}
        onFocus={showTooltip}
        onBlur={() => setTooltip(null)}
        style={{
          ...iconBtn,
          width: 24,
          height: 24,
          background: 'transparent',
          color,
          fontSize: 16,
          fontWeight: 600,
          opacity: disabled ? 0.35 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {children}
      </button>
      {tooltip && (
        <span role="tooltip" style={{
          position: 'fixed', left: tooltip.left, top: tooltip.top,
          transform: 'translateX(-50%)', zIndex: 3000, pointerEvents: 'none',
          padding: '5px 8px', borderRadius: 5, background: C.dark, color: '#fff',
          fontSize: 10.5, fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
        }}>
          {label}
        </span>
      )}
    </>
  )
}

const ORDER_STATUSES = [
  { key: 'all',             label: 'Todos' },
  { key: 'pending_payment', label: 'Pago pendiente' },
  { key: 'reserved',        label: 'Reservado' },
  { key: 'paid',            label: 'Pagado' },
  { key: 'preparing',       label: 'Preparando' },
  { key: 'shipped',         label: 'En camino' },
  { key: 'delivered',       label: 'Entregado' },
  { key: 'cancelled',       label: 'Cancelado' },
  { key: 'payment_failed',  label: 'Pago rechazado' },
  { key: 'expired',         label: 'Reserva vencida' },
]

const STATUS_STYLE = {
  pending_payment: { bg: '#FFF7E6', color: '#B8821A' },
  reserved:        { bg: '#FFF7E6', color: '#B8821A' },
  paid:            { bg: '#EAF7EF', color: '#1a7a3d' },
  preparing:       { bg: '#FDECEC', color: '#CC0000' },
  shipped:         { bg: '#FFF1F2', color: '#9F1239' },
  delivered:       { bg: '#EAF7EF', color: '#14532d' },
  cancelled:       { bg: '#FDECEC', color: '#CC0000' },
  payment_failed:  { bg: '#FDECEC', color: '#CC0000' },
  expired:         { bg: '#FDECEC', color: '#CC0000' },
}

const STATUS_LABEL = {
  pending_payment: 'Pago pendiente',
  reserved:        'Reservado (a pagar/retirar)',
  paid:            'Pagado',
  preparing:       'Preparando',
  shipped:         'En camino',
  delivered:       'Entregado',
  cancelled:       'Cancelado',
  payment_failed:  'Pago rechazado',
  expired:         'Reserva vencida',
}

const NEXT_STATUSES = ['pending_payment','reserved','paid','preparing','shipped','delivered','cancelled','payment_failed','expired']

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || { bg: '#F3F4F6', color: C.text3 }
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
      background: s.bg, color: s.color, whiteSpace: 'nowrap',
    }}>
      {STATUS_LABEL[status] || status}
    </span>
  )
}

function OrderDetailModal({ order, onClose, onStatusChange }) {
  const [newStatus, setNewStatus] = useState(order.status)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)

  async function handleSave() {
    if (newStatus === order.status) { onClose(); return }
    setSaving(true)
    try {
      await onStatusChange(order.id, newStatus)
      setSaved(true)
      setTimeout(onClose, 800)
    } catch { setSaving(false) }
  }

  async function markPaidInStore() {
    setSaving(true)
    try {
      await onStatusChange(order.id, 'paid')
      setSaved(true)
      setTimeout(onClose, 800)
    } catch { setSaving(false) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000, padding: 16,
    }}>
      <div style={{
        background: C.paper, borderRadius: 12, width: '100%', maxWidth: 580,
        maxHeight: '90vh', overflowY: 'auto',
        padding: 28, boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <p style={{ fontSize: 11, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>Pedido</p>
            <h2 style={{ fontFamily: ADMIN_FONT, fontSize: 24, color: C.ink, margin: '4px 0 0', fontWeight: 500 }}>
              #{order.order_number}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: 20 }}>✕</button>
        </div>

        {/* Cliente */}
        <div style={{ background: C.white, borderRadius: 8, border: `1px solid ${C.border}`, padding: '14px 18px', marginBottom: 14 }}>
          <p style={lbl}>Cliente</p>
          <p style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginTop: 4 }}>{order.customer_name}</p>
          <p style={{ fontSize: 13, color: C.text3, marginTop: 2 }}>{order.customer_email}</p>
          <p style={{ fontSize: 13, color: C.text3, marginTop: 2 }}>{order.customer_phone}</p>
        </div>

        {/* Entrega */}
        <div style={{ background: C.white, borderRadius: 8, border: `1px solid ${C.border}`, padding: '14px 18px', marginBottom: 14 }}>
          <p style={lbl}>Entrega</p>
          <p style={{ fontSize: 14, color: C.ink, marginTop: 4 }}>
            {order.delivery_type === 'pickup'
              ? 'Retiro en local — 473 entre 14C y 15, City Bell'
              : `Domicilio: ${order.address}, ${order.city}${order.postal_code ? ` (CP ${order.postal_code})` : ''}`}
          </p>
          {order.delivery_type === 'pickup' && (
            <p style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>
              {order.payment_method === 'pay_in_store' ? 'Pago en el local' : 'Pago online'}
              {order.pickup_date ? ` · Retira el ${fmtPickupDate(order.pickup_date)}` : ''}
            </p>
          )}
          {order.delivery_type === 'delivery' && order.estimated_delivery_date && (
            <p style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>
              Entrega estimada: {fmtPickupDate(order.estimated_delivery_date)}
            </p>
          )}
        </div>

        {/* Productos */}
        <div style={{ background: C.white, borderRadius: 8, border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 14 }}>
          <p style={{ ...lbl, padding: '10px 18px', borderBottom: `1px solid ${C.hairline}` }}>Productos</p>
          {order.items.map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px',
              borderBottom: i < order.items.length - 1 ? `1px solid ${C.hairline}` : 'none',
            }}>
              {item.image && (
                <img src={item.image} alt={item.name} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</p>
                <p style={{ fontSize: 11, color: C.text3 }}>{item.quantity} × {fmt(item.price)}</p>
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: C.ink, flexShrink: 0 }}>{fmt(item.subtotal)}</p>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 18px', borderTop: `1px solid ${C.hairline}` }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Total</span>
            <span style={{ fontSize: 16, fontWeight: 600, color: C.ink }}>{fmt(order.total_amount)}</span>
          </div>
        </div>

        {/* Estado + cambio */}
        <div style={{ background: C.white, borderRadius: 8, border: `1px solid ${C.border}`, padding: '14px 18px', marginBottom: 20 }}>
          {order.status === 'reserved' && (
            <button
              onClick={markPaidInStore}
              disabled={saving}
              style={{
                ...solidBtn,
                background: saved ? C.green : C.amber,
                color: '#fff',
                cursor: saving ? 'not-allowed' : 'pointer',
                width: '100%',
                marginBottom: 14,
              }}
            >
              {saved ? '✓ Marcado como pagado' : saving ? 'Guardando...' : 'Marcar pagado en el local'}
            </button>
          )}
          <p style={{ ...lbl, marginBottom: 10 }}>Cambiar estado</p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              style={{ ...inp, flex: 1, minWidth: 200 }}
            >
              {NEXT_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                ...solidBtn,
                background: saved ? C.green : C.red,
                color: '#fff',
                cursor: saving ? 'not-allowed' : 'pointer',
                minWidth: 120,
              }}
            >
              {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar estado'}
            </button>
          </div>
          {order.mp_payment_id && (
            <p style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
              ID de pago MP: {order.mp_payment_id}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={outlineBtn}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}

const DELIVERY_WORK_STATUSES = ['paid', 'preparing', 'shipped']
const PICKUP_WORK_STATUSES = ['reserved', 'paid', 'preparing']
const WORK_STATUS_PRIORITY = {
  reserved: 0,
  paid: 1,
  preparing: 2,
  shipped: 3,
}

function QuickStatusSelect({ order, onChange, saving = false }) {
  const style = STATUS_STYLE[order.status] || STATUS_STYLE.pending_payment
  return (
    <label className="adm-quick-status" title="Cambiar estado rápidamente">
      <span style={{ background: style.color }} />
      <select
        value={order.status}
        disabled={saving}
        aria-label={`Cambiar estado del pedido ${order.order_number}`}
        onChange={(event) => onChange(order, event.target.value)}
      >
        {NEXT_STATUSES.map((status) => (
          <option key={status} value={status}>{STATUS_LABEL[status]}</option>
        ))}
      </select>
      {saving && <i aria-label="Guardando" />}
    </label>
  )
}

function StoreProductPicker({ onSelect, onClose }) {
  const { searchProducts } = useAdmin()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const normalized = query.trim()
    if (normalized.length < 2) {
      setResults([])
      setLoading(false)
      return undefined
    }

    let active = true
    const timer = setTimeout(async () => {
      setLoading(true)
      const matches = await searchProducts(normalized, { published: 'false' })
      if (active) {
        setResults(matches)
        setLoading(false)
      }
    }, 250)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [query, searchProducts])

  return (
    <div
      onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, padding: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 680, maxHeight: '86vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', background: C.white,
        borderRadius: 12, boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 20, padding: '24px 26px 18px', borderBottom: `1px solid ${C.border}` }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: ADMIN_FONT, fontSize: 21, fontWeight: 500, color: C.ink }}>Publicar un producto</h2>
            <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.45, color: C.muted }}>
              Elegí un producto de Productos. Después vas a poder completar su información e imágenes antes de publicarlo.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ border: 'none', background: 'transparent', color: C.text3, cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        <div style={{ padding: '20px 26px 24px', overflowY: 'auto' }}>
          <label htmlFor="store-product-search" style={lbl}>Buscar en Productos</label>
          <input
            id="store-product-search"
            type="search"
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Escribí el código, nombre o descripción..."
            style={{ ...inp, marginTop: 6 }}
          />

          <div style={{ marginTop: 14, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
            {query.trim().length < 2 && (
              <p style={{ margin: 0, padding: 24, textAlign: 'center', fontSize: 12.5, color: C.muted }}>Escribí al menos 2 caracteres para buscar.</p>
            )}
            {query.trim().length >= 2 && loading && (
              <p style={{ margin: 0, padding: 24, textAlign: 'center', fontSize: 12.5, color: C.muted }}>Buscando productos...</p>
            )}
            {query.trim().length >= 2 && !loading && results.length === 0 && (
              <p style={{ margin: 0, padding: 24, textAlign: 'center', fontSize: 12.5, color: C.muted }}>No encontramos productos sin publicar con esa búsqueda.</p>
            )}
            {!loading && results.map((product, index) => (
              <button
                key={product.id}
                type="button"
                onClick={() => onSelect(product)}
                style={{
                  width: '100%', display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr) auto', alignItems: 'center', gap: 12,
                  padding: '11px 13px', border: 'none', borderBottom: index < results.length - 1 ? `1px solid ${C.hairline}` : 'none',
                  background: C.white, color: C.ink, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {product.image_url ? (
                  <img src={product.image_url} alt="" style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 7, border: `1px solid ${C.hairline}` }} />
                ) : (
                  <span aria-hidden="true" style={{ width: 46, height: 46, display: 'grid', placeItems: 'center', borderRadius: 7, background: C.hairline, color: C.muted }}>□</span>
                )}
                <span style={{ minWidth: 0 }}>
                  <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{product.name || product.descripcion || 'Sin nombre'}</strong>
                  <small style={{ display: 'block', marginTop: 3, color: C.muted, fontSize: 11 }}>{product.codigo} · Stock: {product.stock}</small>
                </span>
                <span style={{ ...outlineBtn, padding: '6px 10px', color: C.red, borderColor: '#E9BABA' }}>Configurar</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function OperationalOrdersSection({ title, subtitle, orders, emptyText, type, onSelect, onQuickStatus, updatingOrderIds }) {
  return (
    <section className={`adm-work-queue adm-work-queue--${type}`}>
      <div className="adm-work-queue__head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span>{orders.length}</span>
      </div>

      {orders.length === 0 ? (
        <div className="adm-work-queue__empty">{emptyText}</div>
      ) : (
        <div className="adm-work-queue__list">
          {orders.map((order) => (
            <article className="adm-work-order" key={order.id}>
              <div className="adm-work-order__top">
                <strong>#{order.order_number}</strong>
                <StatusBadge status={order.status} />
              </div>
              <div className="adm-work-order__customer">{order.customer_name}</div>
              <div className="adm-work-order__destination">
                {type === 'delivery' ? (
                  <>
                    <b>Enviar a</b>
                    <span>{order.address || 'Dirección sin completar'}{order.city ? `, ${order.city}` : ''}{order.postal_code ? ` (CP ${order.postal_code})` : ''}</span>
                    {order.estimated_delivery_date && <small>Entrega estimada: {fmtPickupDate(order.estimated_delivery_date)}</small>}
                  </>
                ) : (
                  <>
                    <b>Retiro en el local</b>
                    <span>{order.pickup_date ? `Retira el ${fmtPickupDate(order.pickup_date)}` : 'Fecha de retiro sin definir'}</span>
                    <small>{order.status === 'reserved' ? 'Cobrar al momento de retirar' : 'Pedido pagado'}</small>
                  </>
                )}
              </div>
              <div className="adm-work-order__footer">
                <span>{fmt(order.total_amount)}</span>
                <div className="adm-work-order__actions">
                  <QuickStatusSelect
                    order={order}
                    onChange={onQuickStatus}
                    saving={updatingOrderIds.has(order.id)}
                  />
                  <button onClick={() => onSelect(order)}>Ver pedido</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function OrdersTab() {
  const { orders, ordersTotal, ordersLoading, ordersError, fetchOrders, updateOrderStatus } = useAdmin()
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch]             = useState('')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [updatingOrderIds, setUpdatingOrderIds] = useState(() => new Set())
  const [quickStatusError, setQuickStatusError] = useState('')

  useEffect(() => {
    fetchOrders({ limit: 500 })
  }, [fetchOrders])

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase()
    return orders.filter((order) => {
      if (statusFilter !== 'all' && order.status !== statusFilter) return false
      if (!term) return true
      return [order.customer_name, order.customer_email, order.order_number]
        .some((value) => String(value || '').toLowerCase().includes(term))
    })
  }, [orders, search, statusFilter])

  const ordersToShip = useMemo(() =>
    orders
      .filter((order) =>
        order.delivery_type === 'delivery'
        && DELIVERY_WORK_STATUSES.includes(order.status)
      )
      .sort((a, b) =>
        (WORK_STATUS_PRIORITY[a.status] - WORK_STATUS_PRIORITY[b.status])
        || new Date(a.estimated_delivery_date || a.created_at) - new Date(b.estimated_delivery_date || b.created_at)
      ),
  [orders])

  const pickupsToManage = useMemo(() =>
    orders
      .filter((order) =>
        order.delivery_type === 'pickup'
        && PICKUP_WORK_STATUSES.includes(order.status)
      )
      .sort((a, b) =>
        (WORK_STATUS_PRIORITY[a.status] - WORK_STATUS_PRIORITY[b.status])
        || new Date(a.pickup_date || a.created_at) - new Date(b.pickup_date || b.created_at)
      ),
  [orders])

  async function handleStatusChange(id, status) {
    await updateOrderStatus(id, status)
    fetchOrders({ limit: 500 })
  }

  async function handleQuickStatusChange(order, status) {
    if (status === order.status || updatingOrderIds.has(order.id)) return
    if (['cancelled', 'payment_failed', 'expired'].includes(status)) {
      const confirmed = window.confirm(`¿Cambiar el pedido #${order.order_number} a "${STATUS_LABEL[status]}"? Esta acción puede liberar el stock reservado.`)
      if (!confirmed) return
    }

    setQuickStatusError('')
    setUpdatingOrderIds((current) => new Set(current).add(order.id))
    try {
      await updateOrderStatus(order.id, status)
    } catch (error) {
      setQuickStatusError(error.message || 'No se pudo actualizar el estado del pedido.')
    } finally {
      setUpdatingOrderIds((current) => {
        const next = new Set(current)
        next.delete(order.id)
        return next
      })
    }
  }

  return (
    <div>
      <div className="adm-work-queues">
        <OperationalOrdersSection
          title="Pedidos a enviar"
          subtitle="Pagados, en preparación o en camino"
          orders={ordersToShip}
          emptyText="No hay envíos pendientes."
          type="delivery"
          onSelect={setSelectedOrder}
          onQuickStatus={handleQuickStatusChange}
          updatingOrderIds={updatingOrderIds}
        />
        <OperationalOrdersSection
          title="Retiros en el local"
          subtitle="Reservados o pagados pendientes de retiro"
          orders={pickupsToManage}
          emptyText="No hay retiros pendientes."
          type="pickup"
          onSelect={setSelectedOrder}
          onQuickStatus={handleQuickStatusChange}
          updatingOrderIds={updatingOrderIds}
        />
      </div>

      <div className="adm-orders-history-head">
        <div>
          <h2>Todos los pedidos</h2>
          <p>Historial y búsqueda por estado</p>
        </div>
      </div>

      {quickStatusError && (
        <div style={{ background: C.redLight, border: `1px solid ${C.red}`, borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: C.red, fontSize: 12 }}>
          {quickStatusError}
        </div>
      )}

      {/* ── Filtros de estado ── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {ORDER_STATUSES.map((s) => (
          <button
            key={s.key}
            onClick={() => setStatusFilter(s.key)}
            style={{
              padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 11, fontFamily: 'inherit', fontWeight: 600,
              letterSpacing: '0.04em',
              background: statusFilter === s.key ? C.red : C.hairline,
              color: statusFilter === s.key ? '#fff' : C.text2,
              transition: 'all 0.15s',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Buscador ── */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Buscar por nombre, email o número de pedido..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inp, maxWidth: 420 }}
        />
      </div>

      {/* ── Total ── */}
      <p style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
        {ordersLoading
          ? 'Cargando...'
          : `${filteredOrders.length}${filteredOrders.length !== ordersTotal ? ` de ${ordersTotal}` : ''} pedido${filteredOrders.length !== 1 ? 's' : ''}`}
      </p>

      {/* ── Error ── */}
      {ordersError && (
        <div style={{ background: C.redLight, border: `1px solid ${C.red}`, borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: C.red, fontSize: 13 }}>
          {ordersError} — asegurate de que el backend esté corriendo.
        </div>
      )}

      {/* ── Tabla ── */}
      {!ordersLoading && !ordersError && (
        <div style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          {filteredOrders.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: C.muted, fontSize: 14 }}>
              No hay pedidos que coincidan con el filtro.
            </div>
          ) : (
            <>
              {/* Header de tabla */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '110px 130px 1fr 150px 90px 170px 80px',
                gap: 8, padding: '8px 14px',
                borderBottom: `1px solid ${C.hairline}`,
                background: C.paper,
              }}>
                {['Número', 'Fecha', 'Cliente', 'Email', 'Total', 'Estado rápido', 'Acción'].map((h) => (
                  <span key={h} style={{ ...lbl }}>{h}</span>
                ))}
              </div>

              {filteredOrders.map((order, i) => (
                <div
                  key={order.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '110px 130px 1fr 150px 90px 170px 80px',
                    gap: 8, padding: '10px 14px', alignItems: 'center',
                    borderBottom: i < filteredOrders.length - 1 ? `1px solid ${C.hairline}` : 'none',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#F9FAFB')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.ink, fontFamily: ADMIN_FONT }}>
                    #{order.order_number}
                  </span>
                  <span style={{ fontSize: 11, color: C.text3 }}>
                    {fmtDate(order.created_at)}
                  </span>
                  <span style={{ fontSize: 13, color: C.ink, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {order.customer_name}
                  </span>
                  <span style={{ fontSize: 11, color: C.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {order.customer_email}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                    {fmt(order.total_amount)}
                  </span>
                  <QuickStatusSelect
                    order={order}
                    onChange={handleQuickStatusChange}
                    saving={updatingOrderIds.has(order.id)}
                  />
                  <button
                    onClick={() => setSelectedOrder(order)}
                    style={{ ...solidBtn, background: C.dark, color: '#fff', fontSize: 11, padding: '5px 12px' }}
                  >
                    Ver
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Modal de detalle ── */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onStatusChange={handleStatusChange}
        />
      )}

      <style>{`
        .adm-work-queues { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; margin-bottom:28px; }
        .adm-work-queue { min-width:0; background:${C.white}; border:1px solid ${C.border}; border-radius:10px; overflow:hidden; box-shadow:0 3px 14px rgba(15,23,42,.04); }
        .adm-work-queue--delivery { border-top:3px solid ${C.red}; }
        .adm-work-queue--pickup { border-top:3px solid ${C.amber}; }
        .adm-work-queue__head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; padding:16px 18px; border-bottom:1px solid ${C.hairline}; }
        .adm-work-queue__head h2,.adm-orders-history-head h2 { margin:0; color:${C.ink}; font:600 16px/1.2 ${ADMIN_FONT}; }
        .adm-work-queue__head p,.adm-orders-history-head p { margin:5px 0 0; color:${C.muted}; font-size:11px; }
        .adm-work-queue__head > span { display:grid; place-items:center; min-width:28px; height:28px; padding:0 8px; border-radius:20px; background:${C.hairline}; color:${C.ink}; font-size:12px; font-weight:700; }
        .adm-work-queue--delivery .adm-work-queue__head > span { background:${C.redLight}; color:${C.red}; }
        .adm-work-queue--pickup .adm-work-queue__head > span { background:${C.amberLight}; color:${C.amberDark}; }
        .adm-work-queue__list { max-height:440px; overflow-y:auto; }
        .adm-work-queue__empty { padding:30px 18px; text-align:center; color:${C.muted}; font-size:12px; }
        .adm-work-order { padding:14px 18px; border-bottom:1px solid ${C.hairline}; }
        .adm-work-order:last-child { border-bottom:0; }
        .adm-work-order__top,.adm-work-order__footer { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .adm-work-order__top > strong { color:${C.ink}; font:600 12px ${ADMIN_FONT}; }
        .adm-work-order__customer { margin-top:8px; color:${C.ink}; font-size:13px; font-weight:600; }
        .adm-work-order__destination { display:flex; flex-direction:column; gap:2px; margin-top:7px; min-width:0; color:${C.text3}; font-size:11px; }
        .adm-work-order__destination b { color:${C.ink}; font-size:10px; text-transform:uppercase; letter-spacing:.06em; }
        .adm-work-order__destination span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .adm-work-order__destination small { color:${C.muted}; font-size:10.5px; }
        .adm-work-order__footer { margin-top:12px; padding-top:10px; border-top:1px solid ${C.hairline}; }
        .adm-work-order__footer > span { color:${C.ink}; font-size:13px; font-weight:700; }
        .adm-work-order__actions { display:flex; align-items:center; justify-content:flex-end; gap:7px; min-width:0; }
        .adm-work-order__footer button { border:0; border-radius:6px; padding:6px 11px; background:${C.dark}; color:#fff; cursor:pointer; font:600 10.5px ${ADMIN_FONT}; }
        .adm-work-order__footer button:hover { background:${C.darkHover}; }
        .adm-quick-status { position:relative; min-width:0; height:30px; display:inline-flex; align-items:center; gap:7px; padding:0 7px; border:1px solid ${C.border}; border-radius:7px; background:${C.white}; }
        .adm-quick-status > span { width:7px; height:7px; flex:0 0 auto; border-radius:50%; }
        .adm-quick-status select { min-width:0; max-width:145px; height:28px; padding:0 18px 0 0; border:0; outline:0; background:transparent; color:${C.ink}; cursor:pointer; font:600 10.5px ${ADMIN_FONT}; }
        .adm-quick-status select:disabled { cursor:wait; opacity:.55; }
        .adm-quick-status i { position:absolute; right:6px; width:10px; height:10px; border:2px solid ${C.hairline}; border-top-color:${C.red}; border-radius:50%; animation:adm-status-spin .65s linear infinite; }
        @keyframes adm-status-spin { to { transform:rotate(360deg); } }
        .adm-orders-history-head { margin-bottom:14px; }
        @media (max-width:980px) { .adm-work-queues { grid-template-columns:1fr; } }
        @media (max-width:560px) { .adm-work-order__footer { align-items:flex-start; flex-direction:column; } .adm-work-order__actions { width:100%; justify-content:space-between; } }
      `}</style>
    </div>
  )
}

// ── Iconos adicionales ────────────────────────────────────────────────────────
const ClipboardIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ flexShrink: 0 }}>
    <rect x="3" y="2" width="9" height="11" rx="1"/>
    <path d="M5 2V1.5a.5.5 0 011 0v.5h2V1.5a.5.5 0 011 0V2" strokeLinecap="round"/>
    <line x1="5" y1="6" x2="10" y2="6" strokeLinecap="round"/>
    <line x1="5" y1="9" x2="10" y2="9" strokeLinecap="round"/>
    <line x1="5" y1="12" x2="8" y2="12" strokeLinecap="round"/>
  </svg>
)

const BoxIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ flexShrink: 0 }}>
    <path d="M7.5 1.5l6 3v6l-6 3-6-3v-6l6-3z" strokeLinejoin="round"/>
    <path d="M1.5 4.5l6 3 6-3M7.5 7.5V13.5" strokeLinejoin="round"/>
  </svg>
)

// ── InventoryProductModal ──────────────────────────────────────────────────────
const INV_EMPTY = {
  codigo: '', descripcion: '', grupo: '', subgrupo: '', medida: '',
  precio_costo: '', precio_venta: '', precio_iva: '', stock: '0',
}

function InventoryProductModal({ product, onSave, onClose }) {
  const isNew = !product
  const [form, setForm] = useState(() => isNew ? INV_EMPTY : {
    codigo:       product.codigo || '',
    descripcion:  product.descripcion || '',
    grupo:        product.grupo || '',
    subgrupo:     product.subgrupo || '',
    medida:       product.medida || '',
    precio_costo: String(product.precio_costo ?? ''),
    precio_venta: String(product.precio_venta ?? ''),
    precio_iva:   String(product.precio_iva ?? ''),
    stock:        String(product.stock ?? '0'),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const valid = form.codigo.trim().length > 0

  const handleSave = async () => {
    if (!valid || saving) return
    setSaving(true)
    setError('')
    try {
      await onSave({
        codigo:       form.codigo.trim(),
        descripcion:  form.descripcion.trim() || null,
        grupo:        form.grupo.trim() || null,
        subgrupo:     form.subgrupo.trim() || null,
        medida:       form.medida.trim() || null,
        precio_costo: form.precio_costo === '' ? null : Number(form.precio_costo),
        precio_venta: form.precio_venta === '' ? null : Number(form.precio_venta),
        precio_iva:   form.precio_iva === '' ? null : Number(form.precio_iva),
        stock:        form.stock === '' ? 0 : Number(form.stock),
      })
      onClose()
    } catch (err) {
      setError(err.message || 'No se pudo guardar el producto')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: C.paper, borderRadius: 12,
        width: '100%', maxWidth: 560,
        maxHeight: '92vh', overflowY: 'auto',
        padding: 32, boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontFamily: ADMIN_FONT, fontSize: 22, color: C.ink, margin: 0, fontWeight: 500 }}>
            {isNew ? 'Nuevo producto de inventario' : 'Editar producto de inventario'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <FormField label="Código *" value={form.codigo} onChange={v => set('codigo', v)} span={2} placeholder="ej: ALC-PO043" />
          <FormField label="Descripción" value={form.descripcion} onChange={v => set('descripcion', v)} span={2} />
          <FormField label="Grupo (marca)" value={form.grupo} onChange={v => set('grupo', v)} placeholder="ej: SILVERLIGH" />
          <FormField label="Subgrupo (categoría)" value={form.subgrupo} onChange={v => set('subgrupo', v)} placeholder="ej: DAYTON" />
          <FormField label="Medida" value={form.medida} onChange={v => set('medida', v)} />
          <FormField label="Stock" value={form.stock} onChange={v => set('stock', v)} type="number" />
          <FormField label="Precio costo" value={form.precio_costo} onChange={v => set('precio_costo', v)} type="number" />
          <FormField label="Precio venta" value={form.precio_venta} onChange={v => set('precio_venta', v)} type="number" />
          <FormField label="Precio c/IVA" value={form.precio_iva} onChange={v => set('precio_iva', v)} type="number" />
        </div>

        {error && <p style={{ fontSize: 12.5, color: C.red, marginTop: 14 }}>{error}</p>}

        <div style={{
          display: 'flex', gap: 10, justifyContent: 'flex-end',
          marginTop: 28, paddingTop: 20, borderTop: `1px solid ${C.border}`,
        }}>
          <button onClick={onClose} style={outlineBtn}>Cancelar</button>
          <button
            onClick={handleSave}
            disabled={!valid || saving}
            style={{
              ...solidBtn,
              background: valid ? C.red : '#ddd', color: valid ? '#fff' : '#aaa',
              cursor: valid && !saving ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? 'Guardando...' : isNew ? '+ Agregar producto' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ImportUploadCard ─────────────────────────────────────────────────────────
function ImportUploadCard({
  label, hint, disabled, onFile, onFiles, accept = '.xls,.xlsx', busyLabel = 'Importando...',
  children = null, multiple = false, allowDirectory = false,
}) {
  const inputRef = useRef(null)
  const directoryInputRef = useRef(null)
  const handleSelection = (fileList) => {
    const acceptsPdf = String(accept).toLowerCase().includes('.pdf')
    const files = [...(fileList || [])].filter(file => acceptsPdf
      ? /\.pdf$/i.test(file.name)
      : /\.(xlsx|xls)$/i.test(file.name)
    )
    if (!files.length) return
    if (onFiles) onFiles(files)
    else if (onFile) onFile(files[0])
  }
  return (
    <div style={{
      background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
      padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{label}</div>
      <p style={{ fontSize: 10.5, lineHeight: 1.35, color: C.muted, margin: 0 }}>{hint}</p>
      {children}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        style={{ display: 'none' }}
        onChange={e => {
          handleSelection(e.target.files)
          e.target.value = ''
        }}
      />
      {allowDirectory && (
        <input
          ref={directoryInputRef}
          type="file"
          accept={accept}
          multiple
          webkitdirectory=""
          directory=""
          style={{ display: 'none' }}
          onChange={e => {
            handleSelection(e.target.files)
            e.target.value = ''
          }}
        />
      )}
      <div style={{ display: 'grid', gridTemplateColumns: allowDirectory ? '1fr 1fr' : '1fr', gap: 7 }}>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          style={{
            ...outlineBtn,
            fontSize: 11, padding: '5px 10px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
          }}
        >
          {disabled ? busyLabel : multiple ? 'Elegir archivos' : 'Elegir archivo'}
        </button>
        {allowDirectory && (
          <button
            onClick={() => directoryInputRef.current?.click()}
            disabled={disabled}
            style={{
              ...outlineBtn,
              fontSize: 11, padding: '5px 10px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.6 : 1,
            }}
          >
            {disabled ? busyLabel : 'Elegir carpeta'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── InvoiceLineEditor — fila de la revisión de factura PDF ───────────────────
function InvoiceLineEditor({ line, onChange }) {
  const { searchProducts } = useAdmin()
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) { setResults([]); return undefined }
    const t = setTimeout(async () => {
      setResults(await searchProducts(query))
    }, 300)
    return () => clearTimeout(t)
  }, [query, searchProducts])

  const set = (changes) => onChange({ ...line, ...changes })

  const selectMatch = (p) => {
    set({
      mode: 'update', productId: p.id,
      matchLabel: `${p.codigo} — ${p.descripcion || 'sin descripción'} (stock actual: ${p.stock})`,
      searchOpen: false,
    })
    setQuery('')
    setResults([])
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '28px 56px 1fr', gap: 10, alignItems: 'start',
      padding: '12px 0', borderBottom: `1px solid ${C.hairline}`,
    }}>
      <input
        type="checkbox"
        checked={!line.excluded}
        onChange={e => set({ excluded: !e.target.checked })}
        style={{ marginTop: 4 }}
      />
      <input
        type="number"
        min={1}
        value={line.cantidad}
        onChange={e => set({ cantidad: Number(e.target.value) })}
        style={{ ...inp, padding: '6px 8px', fontSize: 12.5, opacity: line.excluded ? 0.5 : 1 }}
      />
      <div style={{ opacity: line.excluded ? 0.5 : 1 }}>
        <p style={{ fontSize: 12.5, color: C.ink, margin: '0 0 6px', fontWeight: 500 }}>{line.descripcion}</p>

        {line.mode === 'update' && !line.searchOpen && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={pill(line.autoMatched ? C.greenLight : C.amberLight, line.autoMatched ? C.green : C.amberDark)}>
              {line.matchLabel}
            </span>
            <button onClick={() => set({ searchOpen: true })} style={{ ...outlineBtn, fontSize: 11, padding: '4px 10px' }}>
              Cambiar producto
            </button>
          </div>
        )}

        {line.mode === 'create' && !line.searchOpen && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              value={line.newCodigo}
              onChange={e => set({ newCodigo: e.target.value })}
              placeholder="Código nuevo *"
              style={{ ...inp, padding: '6px 8px', fontSize: 12, width: 140 }}
            />
            <input
              value={line.newDescripcion}
              onChange={e => set({ newDescripcion: e.target.value })}
              placeholder="Descripción"
              style={{ ...inp, padding: '6px 8px', fontSize: 12, flex: 1, minWidth: 160 }}
            />
            <button onClick={() => set({ searchOpen: true })} style={{ ...outlineBtn, fontSize: 11, padding: '4px 10px' }}>
              Buscar existente
            </button>
          </div>
        )}

        {line.searchOpen && (
          <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar por código o descripción..."
                style={{ ...inp, padding: '6px 8px', fontSize: 12, flex: 1 }}
              />
              <button
                onClick={() => set({ searchOpen: false })}
                style={{ ...outlineBtn, fontSize: 11, padding: '4px 10px' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => set({
                  mode: 'create', productId: null, matchLabel: null, searchOpen: false,
                  newCodigo: line.newCodigo || line.codigoCandidato || '', newDescripcion: line.newDescripcion || line.descripcion,
                })}
                style={{ ...outlineBtn, fontSize: 11, padding: '4px 10px' }}
              >
                + Producto nuevo
              </button>
            </div>
            {results.map(p => (
              <div
                key={p.id}
                onClick={() => selectMatch(p)}
                style={{
                  fontSize: 12, color: C.text2, padding: '6px 8px', borderRadius: 6,
                  cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
                }}
                onMouseEnter={e => e.currentTarget.style.background = C.hairline}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span>{p.codigo} — {p.descripcion || 'sin descripción'}</span>
                <span style={{ color: C.muted }}>stock: {p.stock}</span>
              </div>
            ))}
            {query.trim().length >= 2 && !results.length && (
              <p style={{ fontSize: 11.5, color: C.muted, margin: '4px 8px' }}>Sin resultados</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── InvoiceReviewModal ────────────────────────────────────────────────────────
function InvoiceReviewModal({ parsed, onConfirm, onClose }) {
  const [lines, setLines] = useState(() => parsed.lines.map((l, i) => ({
    key: i,
    cantidad: l.cantidad,
    descripcion: l.descripcion,
    precioUsd: l.precioUsd,
    codigoCandidato: l.codigoCandidato,
    excluded: false,
    searchOpen: false,
    mode: l.match ? 'update' : 'create',
    productId: l.match?.id || null,
    autoMatched: !!l.match,
    matchLabel: l.match
      ? `${l.match.codigo} — ${l.match.descripcion || 'sin descripción'} (stock actual: ${l.match.stock})`
      : null,
    newCodigo: l.match ? '' : (l.codigoCandidato || ''),
    newDescripcion: l.match ? '' : l.descripcion,
  })))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const updateLine = (key, next) => setLines(ls => ls.map(l => l.key === key ? next : l))

  const included = lines.filter(l => !l.excluded)
  const readyCount = included.filter(l => l.mode === 'update' ? l.productId : l.newCodigo.trim()).length

  const handleConfirm = async () => {
    setError('')
    const actions = []
    for (const l of included) {
      if (l.mode === 'update') {
        if (!l.productId) continue
        actions.push({ type: 'update', productId: l.productId, cantidad: l.cantidad, precioUsd: l.precioUsd })
      } else if (l.newCodigo.trim()) {
        actions.push({ type: 'create', codigo: l.newCodigo.trim(), descripcion: l.newDescripcion, cantidad: l.cantidad, precioUsd: l.precioUsd })
      }
    }
    if (!actions.length) { setError('No hay líneas listas para aplicar.'); return }
    setSubmitting(true)
    try {
      await onConfirm(actions)
      onClose()
    } catch (err) {
      setError(err.message || 'No se pudo aplicar la factura')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: C.paper, borderRadius: 12,
        width: '100%', maxWidth: 720,
        maxHeight: '92vh', overflowY: 'auto',
        padding: 32, boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontFamily: ADMIN_FONT, fontSize: 22, color: C.ink, margin: 0, fontWeight: 500 }}>
            Revisar factura/remito antes de sumar stock
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <p style={{ fontSize: 12, color: C.muted, margin: '0 0 16px' }}>
          Se leyeron {lines.length} línea{lines.length !== 1 ? 's' : ''} del PDF. Revisá el producto emparejado
          en cada una (o creá uno nuevo) antes de confirmar — nada se guarda hasta que aceptes.
        </p>

        <div>
          {lines.map(l => (
            <InvoiceLineEditor key={l.key} line={l} onChange={next => updateLine(l.key, next)} />
          ))}
        </div>

        {error && <p style={{ fontSize: 12.5, color: C.red, marginTop: 14 }}>{error}</p>}

        <div style={{
          display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center',
          marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.border}`,
        }}>
          <span style={{ fontSize: 12, color: C.muted }}>{readyCount} de {included.length} líneas listas para aplicar</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={outlineBtn}>Cancelar</button>
            <button
              onClick={handleConfirm}
              disabled={submitting || !readyCount}
              style={{
                ...solidBtn,
                background: readyCount ? C.red : '#ddd', color: readyCount ? '#fff' : '#aaa',
                cursor: readyCount && !submitting ? 'pointer' : 'not-allowed',
              }}
            >
              {submitting ? 'Aplicando...' : `Confirmar y sumar stock (${readyCount})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Productos unificados ─────────────────────────────────────────────────────
function ProductThumb({ product, size = 42 }) {
  const src = product?.imageUrl || product?.image_url
  if (!src) {
    return <div style={{ width: size, height: size, flexShrink: 0, borderRadius: 7, background: '#EEF1F4', border: `1px solid ${C.hairline}`, display: 'grid', placeItems: 'center', color: C.muted, fontSize: 9, textAlign: 'center' }}>Sin foto</div>
  }
  return <img src={src} alt="" style={{ width: size, height: size, flexShrink: 0, borderRadius: 7, objectFit: 'cover', border: `1px solid ${C.hairline}` }} />
}

function priceMatchFromProduct(product) {
  return {
    id: product.id,
    codigo: product.codigo,
    nombre: product.nombre || product.name || product.descripcion || product.codigo,
    imageUrl: product.imageUrl || product.image_url || null,
    precioCosto: product.precioCosto ?? product.precio_costo,
    precioVenta: product.precioVenta ?? product.precio_venta,
    precioIva: product.precioIva ?? product.precio_iva,
    precioCostoUsd: product.precioCostoUsd ?? product.precio_costo_usd,
  }
}

function inferPriceColor(codigo, descripcion) {
  const code = String(codigo || '').trim().toUpperCase()
  const text = `${code} ${descripcion || ''}`.toUpperCase()
  if (/(?:-|_|\s)W$/.test(code) && /LUZ FR[IÍ]A|COOL WHITE|6[05]00K/.test(text)) {
    return { name: 'Cool white', hex: '#E0F2FE' }
  }
  if (/(?:-|_|\s)W$/.test(code) && /LUZ C[AÁ]LIDA|WARM WHITE|2[7-9]00K|3000K/.test(text)) {
    return { name: 'Warm white', hex: '#F5D08A' }
  }
  const suffixes = [
    [/(?:-|_|\s)WW$/, 'Warm white', '#F5D08A'],
    [/(?:-|_|\s)CW$/, 'Cool white', '#E0F2FE'],
    [/(?:-|_|\s)NW$/, 'Neutral white', '#F1F5F9'],
    [/(?:-|_|\s)N$/, 'Neutral white', '#F1F5F9'],
    [/(?:-|_|\s)BK$/, 'Black', '#111827'],
    [/(?:-|_|\s)RGB$/, 'RGB', '#A855F7'],
    [/(?:-|_|\s)Y$/, 'Yellow', '#FACC15'],
    [/(?:-|_|\s)B$/, 'Blue', '#2563EB'],
    [/(?:-|_|\s)W$/, 'White', '#F8FAFC'],
    [/(?:-|_|\s)R$/, 'Red', '#DC2626'],
    [/(?:-|_|\s)G$/, 'Green', '#16A34A'],
  ]
  for (const [pattern, name, hex] of suffixes) {
    if (pattern.test(code)) return { name, hex }
  }
  const named = [
    [/LUZ FR[IÍ]A|COOL WHITE|6[05]00K/, 'Cool white', '#E0F2FE'],
    [/LUZ C[AÁ]LIDA|WARM WHITE|2[7-9]00K|3000K/, 'Warm white', '#F5D08A'],
    [/LUZ NEUTRA|NEUTRAL WHITE|4000K|4500K/, 'Neutral white', '#F1F5F9'],
    [/LUZ AMARILLA|YELLOW|AMARILL/, 'Yellow', '#FACC15'],
    [/BLUE|AZUL/, 'Blue', '#2563EB'],
    [/BLACK|NEGRO/, 'Black', '#111827'],
    [/WHITE|BLANCO/, 'White', '#F8FAFC'],
    [/RED|ROJO/, 'Red', '#DC2626'],
    [/GREEN|VERDE/, 'Green', '#16A34A'],
  ]
  for (const [pattern, name, hex] of named) {
    if (pattern.test(text)) return { name, hex }
  }
  return { name: '', hex: '#CCCCCC' }
}

function replaceCodeLiteral(codigo, search, replacement, prefixOnly) {
  const source = String(codigo || '')
  const needle = String(search || '')
  if (!needle) return source
  const sourceUpper = source.toUpperCase()
  const needleUpper = needle.toUpperCase()
  if (prefixOnly) {
    return sourceUpper.startsWith(needleUpper) ? `${replacement}${source.slice(needle.length)}` : source
  }

  let cursor = 0
  let result = ''
  let index = sourceUpper.indexOf(needleUpper, cursor)
  if (index < 0) return source
  while (index >= 0) {
    result += source.slice(cursor, index) + replacement
    cursor = index + needle.length
    index = sourceUpper.indexOf(needleUpper, cursor)
  }
  return result + source.slice(cursor)
}

function CurrencyToggle({ value, onChange, compact = false }) {
  return (
    <div role="group" aria-label="Seleccionar moneda" style={{ display: 'inline-grid', gridTemplateColumns: '1fr 1fr', minWidth: compact ? 112 : 142, padding: 2, border: `1px solid ${C.border}`, borderRadius: 7, background: '#EEF1F5', gap: 2 }}>
      {[
        { value: 'ARS', symbol: '$', label: 'ARS' },
        { value: 'USD', symbol: 'US$', label: 'USD' },
      ].map(option => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: compact ? 27 : 29, padding: compact ? '3px 5px' : '4px 7px', border: selected ? '1px solid #C9D2DC' : '1px solid transparent', borderRadius: 5, background: selected ? C.white : 'transparent', boxShadow: selected ? '0 1px 2px rgba(17,24,39,.1)' : 'none', color: selected ? C.ink : C.muted, fontSize: compact ? 9 : 9.5, fontWeight: selected ? 700 : 500, cursor: 'pointer' }}
          >
            <span style={{ color: selected ? C.amberDark : C.muted, fontSize: 8.5, fontWeight: 800 }}>{option.symbol}</span>
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

const PRICE_CODE_COLLATOR = new Intl.Collator('es-AR', { sensitivity: 'base', numeric: true })

function priceLineHasValidPrice(line) {
  return [line.precioCosto, line.precioVenta, line.precioIva]
    .some(value => value !== '' && value != null && Number.isFinite(Number(value)) && Number(value) >= 0)
}

function normalizePriceReviewCode(value) {
  return String(value || '').trim().toUpperCase()
}

function priceLineHasCreateConflict(line) {
  return line.mode === 'create' && line.createConflict &&
    normalizePriceReviewCode(line.newCodigo) === normalizePriceReviewCode(line.createConflict.codigo)
}

function priceLineIsReady(line) {
  const destinationReady = line.mode === 'update'
    ? line.productId && (!line.variantMode || line.colorName?.trim())
    : line.mode === 'create' && line.newCodigo?.trim() && !priceLineHasCreateConflict(line)
  return Boolean(destinationReady && priceLineHasValidPrice(line))
}

function buildPriceReviewLineIssues(lines) {
  const issues = new Map(lines.map(line => [line.key, []]))
  const active = lines.filter(line => !line.excluded)
  const addIssue = (line, message) => {
    const current = issues.get(line.key) || []
    if (!current.includes(message)) current.push(message)
    issues.set(line.key, current)
  }

  for (const line of active) {
    if (line.mode === 'unresolved') addIssue(line, 'Falta asignar o crear el producto')
    if (line.mode === 'update' && !line.productId) addIssue(line, 'Falta asignar el producto')
    if (line.mode === 'update' && line.variantMode && !line.colorName?.trim()) addIssue(line, 'Falta completar el color')
    if (line.mode === 'create' && !line.newCodigo?.trim()) addIssue(line, 'Falta completar el código nuevo')
    if (priceLineHasCreateConflict(line)) {
      const conflict = line.createConflict
      const productLabel = `${conflict.codigo} — ${conflict.nombre || 'Sin nombre'}`
      const supplierLabel = conflict.supplier ? ` (proveedor: ${conflict.supplier})` : ''
      addIssue(line, `El código nuevo ya pertenece al producto existente ${productLabel}${supplierLabel}`)
    }
    if (!priceLineHasValidPrice(line)) addIssue(line, 'No tiene un precio válido')
  }

  const byProduct = new Map()
  for (const line of active.filter(line => line.mode === 'update' && line.productId)) {
    if (!byProduct.has(line.productId)) byProduct.set(line.productId, [])
    byProduct.get(line.productId).push(line)
  }
  for (const group of byProduct.values()) {
    if (group.length <= 1) continue
    const colors = group.map(line => line.colorName?.trim().toLocaleLowerCase('es-AR'))
    const invalid = group.some(line => !line.variantMode || !line.colorName?.trim()) || new Set(colors).size !== group.length
    if (invalid) group.forEach(line => addIssue(line, 'Producto repetido: todas las filas necesitan colores diferentes'))
  }

  const byNewCode = new Map()
  for (const line of active.filter(line => line.mode === 'create' && line.newCodigo?.trim())) {
    const code = line.newCodigo.trim().toUpperCase()
    if (!byNewCode.has(code)) byNewCode.set(code, [])
    byNewCode.get(code).push(line)
  }
  for (const group of byNewCode.values()) {
    if (group.length > 1) group.forEach(line => addIssue(line, 'El código del producto nuevo está repetido'))
  }

  return issues
}

function groupPriceReviewLines(lines, lineIssues) {
  const groups = new Map()

  for (const line of lines) {
    const firstSuggestion = line.mode === 'unresolved' && Number(line.suggestions?.[0]?.similarity) >= 55
      ? line.suggestions[0]
      : null
    const candidate = line.mode === 'update' && line.productId
      ? line.match
      : line.mode === 'unresolved'
        ? line.colorRecommendation?.product || firstSuggestion
        : null
    const familyCode = line.mode === 'unresolved' || line.mode === 'update'
      ? line.familyCode || line.colorRecommendation?.familyCode || null
      : null
    const naturalKey = candidate?.id
      ? `product:${candidate.id}`
      : familyCode
        ? `family:${familyCode}`
        : `line:${line.key}`
    const key = line.excluded ? `excluded:${line.key}` : naturalKey

    if (!groups.has(key)) {
      groups.set(key, { key, product: candidate || null, familyCodes: new Set(), lines: [] })
    }
    const group = groups.get(key)
    if (!group.product && candidate) group.product = candidate
    if (familyCode) group.familyCodes.add(familyCode)
    group.lines.push(line)
  }

  return [...groups.values()]
    .map(group => {
      const assignedCount = group.lines.filter(line => line.mode === 'update' && line.productId).length
      const needsAttentionCount = group.lines.filter(line => (lineIssues.get(line.key) || []).length).length
      const issueLabels = [...new Set(group.lines.flatMap(line => lineIssues.get(line.key) || []))]
      const familyLabel = [...group.familyCodes].sort(PRICE_CODE_COLLATOR.compare).join(', ')
      const productLabel = group.product
        ? `${group.product.codigo} — ${group.product.nombre || group.product.name || group.product.descripcion || 'Sin nombre'}`
        : null
      return {
        ...group,
        assignedCount,
        needsAttentionCount,
        issueLabels,
        section: group.lines.every(line => line.excluded)
          ? 'excluded'
          : needsAttentionCount
            ? 'attention'
            : (familyLabel || group.lines.some(line => line.variantMode)) ? 'families' : 'ready',
        sortLabel: productLabel || familyLabel || group.lines[0]?.codigo || 'ZZZ',
        familyLabel,
        productLabel,
        lines: [...group.lines].sort((left, right) => PRICE_CODE_COLLATOR.compare(left.codigo, right.codigo)),
      }
    })
    .sort((left, right) => PRICE_CODE_COLLATOR.compare(left.sortLabel, right.sortLabel))
}

const PRICE_REVIEW_SECTIONS = [
  { id: 'attention', title: 'Requieren atención', description: 'Asociaciones, colores o precios que todavía deben revisarse.', color: C.red, background: C.redLight, border: '#F4B8B8' },
  { id: 'excluded', title: 'Deseleccionados', description: 'Filas omitidas de esta actualización. Podés abrirlas y volver a seleccionarlas.', color: C.amberDark, background: C.amberLight, border: '#EFD8AD' },
  { id: 'families', title: 'Familias con variantes de color', description: 'Productos agrupados por familia y contraídos para revisar más rápido.', color: '#6D28D9', background: '#F5F3FF', border: '#DDD6FE' },
  { id: 'ready', title: 'Otros productos listos', description: 'Productos resueltos que no pertenecen a una familia de colores.', color: C.green, background: C.greenLight, border: '#BBE2C8' },
]

function ProductSuggestionButton({ product, onSelect, showSimilarity = false, colorShortcut = null, onSelectWithColor = null, regularDisabled = false }) {
  const fullName = product.nombre || product.name || product.descripcion || 'Sin nombre'
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', width: '100%', minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, overflow: 'hidden' }}>
      <button
        type="button"
        disabled={regularDisabled}
        onClick={() => onSelect(product)}
        title={regularDisabled ? `${product.codigo} — ya está asignado; usá el atajo de color` : `${product.codigo} — ${fullName}`}
        style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, flex: 1, border: 'none', background: C.white, textAlign: 'left', padding: 7, cursor: regularDisabled ? 'not-allowed' : 'pointer', opacity: regularDisabled ? 0.58 : 1 }}
      >
        <ProductThumb product={product} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', color: C.ink, fontSize: 11.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.codigo}</span>
          <span style={{ display: 'block', color: C.muted, fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName}</span>
        </span>
        {showSimilarity && <span style={{ color: C.amberDark, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>{product.similarity}%</span>}
      </button>
      {colorShortcut?.name && onSelectWithColor && (
        <button
          type="button"
          onClick={() => onSelectWithColor(product)}
          title={`Asignar ${product.codigo} como variante ${colorShortcut.name}`}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, minWidth: 86, maxWidth: 105, padding: '5px 7px', border: 'none', borderLeft: '1px solid #DDD6FE', background: '#F5F3FF', color: '#6D28D9', fontSize: 9.5, fontWeight: 700, lineHeight: 1.15, cursor: 'pointer', textAlign: 'center' }}
        >
          <span style={{ width: 15, height: 15, borderRadius: 4, background: colorShortcut.hex, border: '1px solid rgba(17,24,39,.25)', flexShrink: 0 }} />
          <span>Como {colorShortcut.name}</span>
        </button>
      )}
    </div>
  )
}

function PriceLineEditor({ line, issues = [], exchangeRate, assignedProductIds, onChange }) {
  const { searchProducts } = useAdmin()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return undefined }
    const timer = setTimeout(async () => setResults(await searchProducts(query)), 300)
    return () => clearTimeout(timer)
  }, [query, searchProducts])

  const set = (changes) => onChange({ ...line, ...changes })
  const inferredColor = inferPriceColor(line.codigo, line.descripcion)
  const colorShortcut = line.colorName?.trim()
    ? { name: line.colorName.trim(), hex: line.colorHex || '#CCCCCC' }
    : inferredColor
  const hasColorShortcut = Boolean(colorShortcut.name)
  const selectMatch = (product, asColorVariant = false) => {
    if (!asColorVariant && !line.variantMode && assignedProductIds.has(product.id) && product.id !== line.productId) return
    set({
      mode: 'update',
      productId: product.id,
      match: priceMatchFromProduct(product),
      searchOpen: false,
      autoMatched: false,
      savedMatched: false,
      familyRecommended: false,
      variantMode: asColorVariant || line.variantMode,
      ...(asColorVariant ? { colorName: colorShortcut.name, colorHex: colorShortcut.hex } : {}),
    })
    setQuery('')
    setResults([])
  }
  const createNew = () => set({
    mode: 'create', productId: null, match: null, searchOpen: false,
    newCodigo: line.newCodigo || line.codigo,
    newDescripcion: line.newDescripcion || line.descripcion || '',
  })
  const converted = (value) => {
    if (value === '' || value == null) return '—'
    const number = Number(value)
    if (!Number.isFinite(number)) return '—'
    return line.currency === 'USD' ? fmt(number * exchangeRate) : fmtUsd(number / exchangeRate)
  }
  const productCanBeSelectedNormally = (product) => line.variantMode || !assignedProductIds.has(product.id) || product.id === line.productId
  const availableSuggestions = (line.suggestions || []).filter(product => hasColorShortcut || productCanBeSelectedNormally(product))
  const availableSearchResults = results.filter(product => hasColorShortcut || productCanBeSelectedNormally(product))

  return (
    <div style={{ padding: '14px 0', borderBottom: `1px solid ${C.hairline}`, opacity: line.excluded ? 0.52 : 1 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(180px, 1.2fr) minmax(220px, 1.5fr)', gap: 12, alignItems: 'start' }}>
        <input type="checkbox" checked={!line.excluded} onChange={event => set({ excluded: !event.target.checked })} style={{ marginTop: 4 }} />
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{line.codigo}</div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>{line.descripcion || 'Sin descripción en el archivo'}</div>
          {issues.length > 0 && (
            <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
              {issues.map(issue => <span key={issue} style={{ color: C.red, fontSize: 10.5, fontWeight: 600 }}>⚠ {issue}</span>)}
            </div>
          )}
        </div>
        <div>
          {line.mode === 'update' && line.productId && !line.searchOpen ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
              <ProductThumb product={line.match} size={46} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <span title={`${line.match?.codigo} — ${line.match?.nombre}`} style={pill(line.autoMatched ? C.greenLight : C.amberLight, line.autoMatched ? C.green : C.amberDark)}>
                  {line.match?.codigo} — {line.match?.nombre}
                </span>
                <div style={{ color: C.muted, fontSize: 10.5, marginTop: 5 }}>
                  Actual: costo {line.match?.precioCosto != null ? fmt(line.match.precioCosto) : '—'} · venta {line.match?.precioVenta != null ? fmt(line.match.precioVenta) : '—'} · con IVA {line.match?.precioIva != null ? fmt(line.match.precioIva) : '—'}
                </div>
                {line.savedMatched && <div style={{ marginTop: 5 }}><span style={pill(C.greenLight, C.green)}>Asociación guardada para {line.match?.codigo}</span></div>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => set({ searchOpen: true })} style={{ ...outlineBtn, fontSize: 11, padding: '4px 9px' }}>Cambiar</button>
                <button type="button" onClick={() => set({ mode: 'unresolved', productId: null, match: null, autoMatched: false, savedMatched: false, searchOpen: false })} style={{ ...outlineBtn, borderColor: C.red, color: C.red, fontSize: 11, padding: '4px 9px' }}>Quitar</button>
              </div>
            </div>
          ) : line.mode === 'create' && !line.searchOpen ? (
            <div style={{ display: 'grid', gridTemplateColumns: '52px 150px minmax(180px, 1fr) auto', gap: 8, alignItems: 'center' }}>
              <ProductThumb product={null} size={46} />
              <input value={line.newCodigo} onChange={event => set({ newCodigo: event.target.value })} placeholder="Código nuevo *" style={{ ...inp, padding: '7px 8px', fontSize: 11.5 }} />
              <input value={line.newDescripcion} onChange={event => set({ newDescripcion: event.target.value })} placeholder="Descripción" style={{ ...inp, padding: '7px 8px', fontSize: 11.5 }} />
              <button type="button" onClick={() => set({ mode: 'unresolved', searchOpen: true })} style={{ ...outlineBtn, fontSize: 11, padding: '5px 9px' }}>Buscar existente</button>
            </div>
          ) : !line.searchOpen ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={pill(C.redLight, C.red)}>Código no encontrado</span>
              <button type="button" onClick={() => set({ searchOpen: true })} style={{ ...outlineBtn, fontSize: 11, padding: '4px 9px' }}>Buscar producto</button>
              <button type="button" onClick={createNew} style={{ ...outlineBtn, borderColor: C.amber, color: C.amberDark, fontSize: 11, padding: '4px 9px' }}>+ Crear como nuevo</button>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: C.text3, fontSize: 10.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={line.variantMode} onChange={event => set({ variantMode: event.target.checked })} />
                Permitir repetir producto como otro color
              </label>
              {line.familyCode && <span style={pill('#F5F3FF', '#6D28D9')}>Familia detectada: {line.familyCode} · {line.colorName}</span>}
            </div>
          ) : null}

          {line.mode === 'unresolved' && !line.searchOpen && availableSuggestions.length > 0 && (
            <div style={{ marginTop: 9 }}>
              <div style={{ color: C.text3, fontSize: 10.5, fontWeight: 600, marginBottom: 6 }}>Productos más parecidos</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7 }}>
                {availableSuggestions.slice(0, line.suggestionLimit || 3).map(product => (
                  <ProductSuggestionButton
                    key={product.id}
                    product={product}
                    onSelect={selectMatch}
                    showSimilarity
                    colorShortcut={hasColorShortcut ? colorShortcut : null}
                    onSelectWithColor={hasColorShortcut ? selected => selectMatch(selected, true) : null}
                    regularDisabled={!productCanBeSelectedNormally(product)}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 7 }}>
                {(line.suggestionLimit || 3) < availableSuggestions.length && (
                  <button type="button" onClick={() => set({ suggestionLimit: Math.min((line.suggestionLimit || 3) + 3, availableSuggestions.length) })} style={{ ...outlineBtn, fontSize: 10.5, padding: '4px 8px' }}>Ver más similares</button>
                )}
                <button type="button" onClick={() => set({ searchOpen: true })} style={{ ...outlineBtn, fontSize: 10.5, padding: '4px 8px' }}>Buscar otro</button>
              </div>
            </div>
          )}

          {line.searchOpen && (
            <div style={{ background: '#F9FAFB', border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por código o nombre..." style={{ ...inp, padding: '6px 8px', fontSize: 12, flex: 1 }} />
                <button type="button" onClick={() => set({ searchOpen: false })} style={{ ...outlineBtn, fontSize: 11, padding: '4px 9px' }}>Cerrar</button>
                <button type="button" onClick={createNew} style={{ ...outlineBtn, borderColor: C.amber, color: C.amberDark, fontSize: 11, padding: '4px 9px' }}>+ Crear nuevo</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7, marginTop: availableSearchResults.length ? 8 : 0 }}>
                {availableSearchResults.map(product => (
                  <ProductSuggestionButton
                    key={product.id}
                    product={product}
                    onSelect={selectMatch}
                    colorShortcut={hasColorShortcut ? colorShortcut : null}
                    onSelectWithColor={hasColorShortcut ? selected => selectMatch(selected, true) : null}
                    regularDisabled={!productCanBeSelectedNormally(product)}
                  />
                ))}
              </div>
              {query.trim().length >= 2 && !availableSearchResults.length && <div style={{ color: C.muted, fontSize: 11.5, padding: '7px 6px 0' }}>Sin resultados disponibles</div>}
            </div>
          )}
        </div>
      </div>

      {line.mode === 'update' && line.productId && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '10px 0 0 40px', padding: line.variantMode ? '9px 10px' : 0, background: line.variantMode ? '#F5F3FF' : 'transparent', border: line.variantMode ? '1px solid #DDD6FE' : 'none', borderRadius: 8 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: line.variantMode ? '#6D28D9' : C.text3, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
            <input type="checkbox" checked={line.variantMode} onChange={event => set({ variantMode: event.target.checked })} />
            Este precio corresponde a una variante de color
          </label>
          {line.variantMode && (
            <>
              <input type="color" value={line.colorHex || '#CCCCCC'} onChange={event => set({ colorHex: event.target.value })} title="Color de la variante" style={{ width: 34, height: 32, padding: 0, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer' }} />
              <input value={line.colorName} onChange={event => set({ colorName: event.target.value })} placeholder="Nombre del color *" style={{ ...inp, width: 170, padding: '7px 9px', fontSize: 11.5 }} />
              <span style={{ color: C.muted, fontSize: 10.5 }}>Código proveedor: {line.codigo}</span>
              {line.familyCode && (
                <span style={pill('#EDE9FE', '#6D28D9')}>
                  {line.familyRecommended ? 'Recomendado por familia' : 'Familia detectada'}: {line.familyCode}
                </span>
              )}
            </>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '122px repeat(3, minmax(120px, 1fr))', gap: 10, margin: '12px 0 0 40px' }}>
        <div>
          <label style={lbl}>Moneda</label>
          <div style={{ marginTop: 5 }}><CurrencyToggle compact value={line.currency} onChange={currency => set({ currency })} /></div>
        </div>
        {[
          ['precioCosto', 'Costo'], ['precioVenta', 'Venta'], ['precioIva', 'Con IVA'],
        ].map(([key, label]) => (
          <div key={key}>
            <label style={lbl}>{label}</label>
            <input type="number" min="0" step="0.01" value={line[key] ?? ''} onChange={event => set({ [key]: event.target.value })} style={{ ...inp, marginTop: 5 }} />
            <div style={{ color: C.muted, fontSize: 10.5, marginTop: 3 }}>Equivale a {converted(line[key])}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PriceReviewModal({ parsed, onConfirm, onClose }) {
  const { rematchPriceLines } = useAdmin()
  const [lines, setLines] = useState(() => parsed.lines.map((line, index) => {
    const color = line.colorRecommendation || inferPriceColor(line.codigo, line.descripcion)
    const familyProduct = line.colorRecommendation?.product || null
    const initialMatch = line.match || familyProduct
    return {
      ...line,
      key: index,
      originalCodigo: line.codigo,
      mode: initialMatch ? 'update' : 'unresolved',
      productId: initialMatch?.id || null,
      match: initialMatch,
      autoMatched: Boolean(line.match),
      savedMatched: line.matchType === 'saved',
      familyRecommended: Boolean(familyProduct && !line.match),
      familyCode: line.colorRecommendation?.familyCode || null,
      searchOpen: false,
      excluded: false,
      currency: 'ARS',
      suggestionLimit: 3,
      newCodigo: line.codigo || '',
      newDescripcion: line.descripcion || '',
      variantMode: Boolean(line.colorRecommendation),
      colorName: color.name,
      colorHex: color.hex,
    }
  }))
  const [fileCurrency, setFileCurrency] = useState('ARS')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [codeSearch, setCodeSearch] = useState('')
  const [codeReplacement, setCodeReplacement] = useState('')
  const [prefixOnly, setPrefixOnly] = useState(true)
  const [rematching, setRematching] = useState(false)
  const [replacementNotice, setReplacementNotice] = useState('')
  const [openSections, setOpenSections] = useState({ attention: true, excluded: true, families: true, ready: false })
  const [openGroups, setOpenGroups] = useState({})
  const exchangeRate = Number(parsed.usdArsRate) || 1510
  const lineIssues = useMemo(() => buildPriceReviewLineIssues(lines), [lines])
  const displayGroups = useMemo(() => groupPriceReviewLines(lines, lineIssues), [lines, lineIssues])
  const displaySections = useMemo(() => PRICE_REVIEW_SECTIONS
    .map(section => {
      const groups = displayGroups.filter(group => group.section === section.id)
      return {
        ...section,
        groups,
        lineCount: groups.reduce((total, group) => total + group.lines.length, 0),
      }
    })
    .filter(section => section.groups.length), [displayGroups])
  const firstAttentionGroupKey = displaySections.find(section => section.id === 'attention')?.groups[0]?.key
  const firstExcludedGroupKey = displaySections.find(section => section.id === 'excluded')?.groups[0]?.key
  const replacementSearch = codeSearch.trim()
  const replacementValue = codeReplacement.trim()
  const replacementCount = useMemo(() => replacementSearch
    ? lines.filter(line => replaceCodeLiteral(line.codigo, replacementSearch, replacementValue, prefixOnly) !== line.codigo).length
    : 0, [lines, replacementSearch, replacementValue, prefixOnly])

  const groupIsOpen = (group) => openGroups[group.key] ?? (
    (group.section === 'attention' && group.key === firstAttentionGroupKey) ||
    (group.section === 'excluded' && group.key === firstExcludedGroupKey)
  )
  const setSectionGroupsOpen = (groups, open) => {
    setOpenGroups(current => ({
      ...current,
      ...Object.fromEntries(groups.map(group => [group.key, open])),
    }))
  }

  const applyCodeReplacement = async () => {
    if (!replacementSearch || !replacementCount || rematching) return
    setRematching(true)
    setError('')
    setReplacementNotice('')
    try {
      const nextCodes = lines.map(line => replaceCodeLiteral(line.codigo, replacementSearch, replacementValue, prefixOnly))
      const result = await rematchPriceLines(lines.map((line, index) => ({
        codigo: nextCodes[index],
        descripcion: line.descripcion,
        precioCosto: line.precioCosto,
        precioVenta: line.precioVenta,
        precioIva: line.precioIva,
      })), parsed.supplier)
      if (!Array.isArray(result.lines) || result.lines.length !== lines.length) {
        throw new Error('La respuesta de asociación está incompleta')
      }

      const exactMatches = result.lines.reduce((total, matched, index) => (
        total + (nextCodes[index] !== lines[index].codigo && matched.match ? 1 : 0)
      ), 0)
      setLines(current => current.map((line, index) => {
        const rematched = result.lines[index]
        const codeChanged = nextCodes[index] !== lines[index].codigo
        const color = rematched.colorRecommendation || inferPriceColor(rematched.codigo, rematched.descripcion)
        const familyProduct = rematched.colorRecommendation?.product || null
        const initialMatch = rematched.match || familyProduct

        if (!codeChanged && line.mode !== 'unresolved') {
          return {
            ...line,
            suggestions: rematched.suggestions,
            colorRecommendation: rematched.colorRecommendation,
            matchType: rematched.matchType,
            familyCode: rematched.colorRecommendation?.familyCode || line.familyCode,
            variantMode: line.variantMode || Boolean(rematched.colorRecommendation),
            colorName: line.colorName?.trim() ? line.colorName : color.name,
            colorHex: line.colorName?.trim() ? line.colorHex : color.hex,
          }
        }

        return {
          ...line,
          codigo: rematched.codigo,
          descripcion: rematched.descripcion,
          match: initialMatch,
          suggestions: rematched.suggestions,
          colorRecommendation: rematched.colorRecommendation,
          mode: initialMatch ? 'update' : 'unresolved',
          productId: initialMatch?.id || null,
          autoMatched: Boolean(rematched.match),
          savedMatched: rematched.matchType === 'saved',
          familyRecommended: Boolean(familyProduct && !rematched.match),
          familyCode: rematched.colorRecommendation?.familyCode || null,
          searchOpen: false,
          suggestionLimit: 3,
          newCodigo: line.newCodigo === line.codigo ? rematched.codigo : line.newCodigo,
          variantMode: Boolean(rematched.colorRecommendation),
          colorName: color.name,
          colorHex: color.hex,
        }
      }))
      setOpenGroups({})
      setOpenSections({ attention: true, excluded: true, families: true, ready: false })
      setReplacementNotice(`${replacementCount} códigos reemplazados · ${exactMatches} coincidencias exactas encontradas`)
      setCodeSearch('')
      setCodeReplacement('')
    } catch (err) {
      setError(err.message || 'No se pudo aplicar el reemplazo general')
    } finally {
      setRematching(false)
    }
  }

  const setAllCurrencies = (currency) => {
    setFileCurrency(currency)
    setLines(current => current.map(line => ({ ...line, currency })))
  }
  const setAllSelected = (selected) => {
    setLines(current => current.map(line => ({ ...line, excluded: !selected })))
  }
  const acceptAllRecommendations = () => {
    setLines(current => {
      const usedProductIds = new Set(
        current
          .filter(line => !line.excluded && line.mode === 'update' && line.productId)
          .map(line => line.productId)
      )
      return current.map(line => {
        if (line.excluded || line.mode !== 'unresolved') return line
        const suggestion = (line.suggestions || []).find(product => line.variantMode || !usedProductIds.has(product.id))
        if (!suggestion) return line
        if (!line.variantMode) usedProductIds.add(suggestion.id)
        return {
          ...line,
          mode: 'update',
          productId: suggestion.id,
          match: priceMatchFromProduct(suggestion),
          autoMatched: false,
          savedMatched: false,
          familyRecommended: Boolean(line.familyCode && line.suggestions?.[0]?.id === suggestion.id),
          searchOpen: false,
        }
      })
    })
  }
  const updateLine = (key, next) => {
    setError('')
    setLines(current => {
      const nextConflictIsCurrent = next.createConflict &&
        normalizePriceReviewCode(next.newCodigo) === normalizePriceReviewCode(next.createConflict.codigo)
      const cleanNext = nextConflictIsCurrent ? next : { ...next, createConflict: null }
      const updated = current.map(line => line.key === key ? cleanNext : line)
      if (cleanNext.mode !== 'update' || !cleanNext.productId || !cleanNext.variantMode) return updated

      return updated.map(line => {
        if (line.key === key || line.mode !== 'update' || line.productId !== cleanNext.productId || line.variantMode) return line
        const inferred = line.colorName?.trim()
          ? { name: line.colorName.trim(), hex: line.colorHex || '#CCCCCC' }
          : inferPriceColor(line.codigo, line.descripcion)
        if (!inferred.name) return line
        return {
          ...line,
          variantMode: true,
          colorName: inferred.name,
          colorHex: inferred.hex,
        }
      })
    })
  }
  const included = lines.filter(line => !line.excluded)
  const assignedProductIds = new Set(
    included.filter(line => line.mode === 'update' && line.productId).map(line => line.productId)
  )
  const recommendableCount = included.filter(line => (
    line.mode === 'unresolved' && line.suggestions?.some(product => line.variantMode || !assignedProductIds.has(product.id))
  )).length
  const ready = included.filter(priceLineIsReady)
  const unresolved = included.length - ready.length
  const assignmentGroups = included.reduce((groups, line) => {
    if (line.mode === 'update' && line.productId) {
      if (!groups.has(line.productId)) groups.set(line.productId, [])
      groups.get(line.productId).push(line)
    }
    return groups
  }, new Map())
  const duplicateAssignments = [...assignmentGroups.values()].filter(group => {
    if (group.length <= 1) return false
    const colors = group.map(line => line.colorName?.trim().toLocaleLowerCase('es-AR'))
    return group.some(line => !line.variantMode || !line.colorName?.trim()) || new Set(colors).size !== group.length
  }).length
  const newCodeCounts = included.reduce((counts, line) => {
    if (line.mode === 'create' && line.newCodigo?.trim()) {
      const code = line.newCodigo.trim().toUpperCase()
      counts.set(code, (counts.get(code) || 0) + 1)
    }
    return counts
  }, new Map())
  const duplicateNewCodes = [...newCodeCounts.values()].filter(count => count > 1).length

  const handleConfirm = async () => {
    if (!ready.length || unresolved || duplicateAssignments || duplicateNewCodes) return
    setSubmitting(true)
    setError('')
    try {
      await onConfirm(ready.map(line => ({
        type: line.mode === 'create' ? 'create' : 'update',
        ...(line.mode === 'create'
          ? { codigo: line.newCodigo.trim(), sourceCode: line.originalCodigo || line.codigo, descripcion: line.newDescripcion?.trim() || null }
          : {
              productId: line.productId,
              sourceCode: line.originalCodigo || line.codigo,
              ...(line.variantMode ? { colorVariant: { name: line.colorName.trim(), hex: line.colorHex || '#CCCCCC' } } : {}),
            }),
        currency: line.currency,
        precioCosto: line.precioCosto,
        precioVenta: line.precioVenta,
        precioIva: line.precioIva,
      })))
      onClose()
    } catch (err) {
      const conflicts = Array.isArray(err.conflicts) ? err.conflicts : []
      if (conflicts.length) {
        const conflictsByCode = new Map(conflicts.map(conflict => [normalizePriceReviewCode(conflict.codigo), conflict]))
        const affectedKeys = lines
          .filter(line => line.mode === 'create' && conflictsByCode.has(normalizePriceReviewCode(line.newCodigo)))
          .map(line => line.key)
        setLines(current => current.map(line => ({
          ...line,
          createConflict: line.mode === 'create'
            ? conflictsByCode.get(normalizePriceReviewCode(line.newCodigo)) || null
            : null,
        })))
        setOpenSections(current => ({ ...current, attention: true }))
        setOpenGroups(current => ({
          ...current,
          ...Object.fromEntries(affectedKeys.map(key => [`line:${key}`, true])),
        }))
      }
      setError(err.message || 'No se pudieron actualizar los precios')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: C.paper, display: 'flex' }}>
      <div style={{ width: '100%', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: C.paper }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start', padding: '20px 28px 16px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div>
            <h2 style={{ fontFamily: ADMIN_FONT, fontSize: 22, color: C.ink, margin: 0, fontWeight: 500 }}>Vista previa de actualización de precios</h2>
            <p style={{ fontSize: 12, color: C.muted, margin: '7px 0 0' }}>Proveedor: <strong style={{ color: C.ink }}>{parsed.supplier}</strong> · Revisá precios y asociaciones. Nada se modifica hasta confirmar.</p>
          </div>
          <button type="button" onClick={onClose} title="Cerrar vista previa" style={{ width: 36, height: 36, border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, color: C.text3, cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>

        <div style={{ overflowY: 'auto', overflowX: 'auto', padding: '0 28px', flex: 1, minHeight: 0 }}>
        <div style={{ padding: 14, marginTop: 18, background: C.amberLight, border: '1px solid #F2D9A8', borderRadius: 10 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'end', flexWrap: 'wrap' }}>
            <div>
              <label style={lbl}>Moneda de toda la planilla</label>
              <div style={{ marginTop: 6 }}><CurrencyToggle value={fileCurrency} onChange={setAllCurrencies} /></div>
            </div>
            <div style={{ fontSize: 12, color: C.text2, paddingBottom: 10 }}>Cotización aplicada: <strong>US$ 1 = {fmt(exchangeRate)}</strong></div>
            <div style={{ fontSize: 11.5, color: C.muted, paddingBottom: 10 }}>{parsed.totalRows} filas leídas · {parsed.skipped || 0} omitidas</div>
            <div style={{ display: 'flex', gap: 7, marginLeft: 'auto', flexWrap: 'wrap', paddingBottom: 5 }}>
              <button type="button" onClick={() => setAllSelected(true)} disabled={included.length === lines.length} style={{ ...outlineBtn, background: C.white, fontSize: 10.5, padding: '6px 9px', opacity: included.length === lines.length ? 0.5 : 1 }}>Seleccionar todo</button>
              <button type="button" onClick={() => setAllSelected(false)} disabled={!included.length} style={{ ...outlineBtn, background: C.white, fontSize: 10.5, padding: '6px 9px', opacity: !included.length ? 0.5 : 1 }}>Deseleccionar todo</button>
              <button type="button" onClick={acceptAllRecommendations} disabled={!recommendableCount} style={{ ...outlineBtn, background: recommendableCount ? C.white : '#F3F4F6', borderColor: recommendableCount ? C.amber : C.border, color: recommendableCount ? C.amberDark : C.muted, fontSize: 10.5, padding: '6px 9px', opacity: recommendableCount ? 1 : 0.55 }}>Aceptar recomendaciones ({recommendableCount})</button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'end', gap: 9, flexWrap: 'wrap', marginTop: 13, paddingTop: 13, borderTop: '1px solid #EFD8AD' }}>
            <div style={{ minWidth: 155 }}>
              <label style={lbl}>Reemplazo general de códigos</label>
              <div style={{ color: C.muted, fontSize: 9.5, marginTop: 3 }}>Ejemplo: CCL- → CL-</div>
            </div>
            <div>
              <label style={{ ...lbl, fontSize: 9 }}>Buscar</label>
              <input value={codeSearch} onChange={event => { setCodeSearch(event.target.value.toUpperCase()); setReplacementNotice('') }} placeholder="CCL-" style={{ ...inp, width: 130, marginTop: 4, padding: '8px 9px', fontFamily: 'monospace', fontWeight: 700 }} />
            </div>
            <span style={{ color: C.amberDark, fontSize: 18, paddingBottom: 7 }}>→</span>
            <div>
              <label style={{ ...lbl, fontSize: 9 }}>Reemplazar por</label>
              <input value={codeReplacement} onChange={event => { setCodeReplacement(event.target.value.toUpperCase()); setReplacementNotice('') }} placeholder="Vacío = eliminar" style={{ ...inp, width: 145, marginTop: 4, padding: '8px 9px', fontFamily: 'monospace', fontWeight: 700 }} />
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, color: C.text3, fontSize: 10.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={prefixOnly} onChange={event => { setPrefixOnly(event.target.checked); setReplacementNotice('') }} />
              Solo al inicio del código
            </label>
            <span style={pill(replacementCount ? C.amberLight : '#F3F4F6', replacementCount ? C.amberDark : C.muted)}>{replacementCount} {replacementCount === 1 ? 'fila afectada' : 'filas afectadas'}</span>
            <button type="button" onClick={applyCodeReplacement} disabled={!replacementSearch || !replacementCount || rematching} style={{ ...solidBtn, padding: '8px 12px', background: replacementCount && !rematching ? C.amberDark : '#D1D5DB', color: replacementCount && !rematching ? C.white : '#6B7280', cursor: replacementCount && !rematching ? 'pointer' : 'not-allowed' }}>
              {rematching ? 'Reasociando...' : 'Aplicar y volver a asociar'}
            </button>
            {replacementNotice && <span style={{ color: C.green, fontSize: 10.5, fontWeight: 600 }}>{replacementNotice}</span>}
          </div>
        </div>

        <div style={{ paddingBottom: 12 }}>
          {displaySections.map(section => {
            const sectionIsOpen = openSections[section.id] !== false
            return (
              <section key={section.id} style={{ marginTop: 16, border: `1px solid ${section.border}`, borderRadius: 10, overflow: 'hidden', background: C.white }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: section.background }}>
                  <button
                    type="button"
                    aria-expanded={sectionIsOpen}
                    onClick={() => setOpenSections(current => ({ ...current, [section.id]: !sectionIsOpen }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1, padding: 0, border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
                  >
                    <span style={{ color: section.color, fontSize: 16, width: 16 }}>{sectionIsOpen ? '▾' : '▸'}</span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', color: section.color, fontSize: 13, fontWeight: 700 }}>{section.title}</span>
                      <span style={{ display: 'block', color: C.muted, fontSize: 10.5, marginTop: 2 }}>{section.description}</span>
                    </span>
                    <span style={{ color: C.text3, fontSize: 10.5, whiteSpace: 'nowrap' }}>{section.groups.length} {section.groups.length === 1 ? 'grupo' : 'grupos'} · {section.lineCount} {section.lineCount === 1 ? 'precio' : 'precios'}</span>
                  </button>
                  {sectionIsOpen && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button type="button" onClick={() => setSectionGroupsOpen(section.groups, true)} style={{ ...outlineBtn, background: C.white, fontSize: 10, padding: '5px 8px' }}>Expandir todos</button>
                      <button type="button" onClick={() => setSectionGroupsOpen(section.groups, false)} style={{ ...outlineBtn, background: C.white, fontSize: 10, padding: '5px 8px' }}>Contraer todos</button>
                    </div>
                  )}
                </div>

                {sectionIsOpen && (
                  <div style={{ padding: '0 12px 12px' }}>
                    {section.groups.map(group => {
                      const isOpen = groupIsOpen(group)
                      const title = group.productLabel || group.familyLabel || group.lines[0]?.codigo || 'Sin identificar'
                      const status = section.id === 'attention'
                        ? group.product ? 'Producto con pendientes' : group.familyLabel ? 'Familia pendiente' : 'Sin producto asignado'
                        : section.id === 'excluded' ? 'Deseleccionado de la actualización'
                          : section.id === 'families' ? 'Familia de colores' : 'Producto listo'
                      return (
                        <div key={group.key} style={{ marginTop: 10, border: `1px solid ${section.border}`, borderRadius: 8, overflow: 'hidden' }}>
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            onClick={() => setOpenGroups(current => ({ ...current, [group.key]: !isOpen }))}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 10px', border: 'none', background: isOpen ? section.background : C.white, textAlign: 'left', cursor: 'pointer' }}
                          >
                            <span style={{ color: section.color, fontSize: 15, width: 14 }}>{isOpen ? '▾' : '▸'}</span>
                            {group.product && <ProductThumb product={group.product} size={34} />}
                            <span style={{ minWidth: 0, flex: 1 }}>
                              <span style={{ display: 'block', color: section.color, fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{status}</span>
                              <span title={title} style={{ display: 'block', color: C.ink, fontSize: 12, fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                              {group.issueLabels.length > 0 && <span style={{ display: 'block', color: C.red, fontSize: 9.5, fontWeight: 600, marginTop: 3 }}>{group.issueLabels.join(' · ')}</span>}
                            </span>
                            {group.needsAttentionCount > 0 && <span style={pill(C.redLight, C.red)}>{group.needsAttentionCount} pendientes</span>}
                            <span style={{ color: C.muted, fontSize: 10.5, whiteSpace: 'nowrap' }}>{group.lines.length} {group.lines.length === 1 ? 'precio' : 'precios'}</span>
                          </button>
                          {isOpen && (
                            <div style={{ borderTop: `1px solid ${section.border}`, padding: '0 10px' }}>
                              {group.lines.map(line => <PriceLineEditor key={line.key} line={line} issues={lineIssues.get(line.key) || []} exchangeRate={exchangeRate} assignedProductIds={assignedProductIds} onChange={next => updateLine(line.key, next)} />)}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })}
        </div>
        {error && <div style={{ color: C.red, fontSize: 12.5, marginTop: 12 }}>{error}</div>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '16px 28px', borderTop: `1px solid ${C.border}`, background: C.white, boxShadow: '0 -8px 20px rgba(17,24,39,0.06)', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: unresolved || duplicateAssignments || duplicateNewCodes ? C.red : C.muted }}>
            {ready.length} listas{unresolved ? ` · ${unresolved} requieren asociar o crear un producto, completar el color, corregir precios o desmarcarse` : ''}{duplicateAssignments ? ` · ${duplicateAssignments} productos repetidos necesitan colores diferentes en todas sus filas` : ''}{duplicateNewCodes ? ` · ${duplicateNewCodes} códigos nuevos están repetidos` : ''}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} disabled={submitting} style={outlineBtn}>Cancelar</button>
            <button type="button" onClick={handleConfirm} disabled={submitting || !ready.length || unresolved > 0 || duplicateAssignments > 0 || duplicateNewCodes > 0} style={{ ...solidBtn, background: ready.length && !unresolved && !duplicateAssignments && !duplicateNewCodes ? C.red : '#ddd', color: ready.length && !unresolved && !duplicateAssignments && !duplicateNewCodes ? '#fff' : '#999', cursor: ready.length && !unresolved && !duplicateAssignments && !duplicateNewCodes && !submitting ? 'pointer' : 'not-allowed' }}>
              {submitting ? 'Actualizando...' : `Confirmar actualización (${ready.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CurrencySettingsCard({ settings, onSave }) {
  const [value, setValue] = useState(String(settings.usdArsRate || 1510))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => setValue(String(settings.usdArsRate || 1510)), [settings.usdArsRate])

  const save = async () => {
    const rate = Number(value)
    if (!Number.isFinite(rate) || rate <= 0) { setMessage('Ingresá una cotización válida.'); return }
    setSaving(true)
    setMessage('')
    try {
      await onSave(rate)
      setMessage('Cotización guardada.')
    } catch (err) {
      setMessage(err.message || 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>Cotización USD / ARS</div>
      <p style={{ fontSize: 10.5, color: C.muted, margin: 0 }}>Conversión vigente para proveedores USD.</p>
      <div style={{ display: 'flex', gap: 7 }}>
        <input type="number" min="0.01" step="0.01" value={value} onChange={event => { setValue(event.target.value); setMessage('') }} aria-label="Cotización de un dólar en pesos" style={{ ...inp, minWidth: 0 }} />
        <button type="button" onClick={save} disabled={saving} style={{ ...outlineBtn, padding: '5px 9px', whiteSpace: 'nowrap' }}>{saving ? 'Guardando...' : 'Guardar'}</button>
      </div>
      <div style={{ minHeight: 14, fontSize: 10.5, color: message.includes('guardada') ? C.green : C.red }}>{message || `US$ 1 = ${fmt(Number(value) || 0)}`}</div>
    </div>
  )
}

function SupplierToolbar({ supplierNames, settings, inventory, selectedSupplier, usdArsRate, onSelect, onSave }) {
  const [value, setValue] = useState(selectedSupplier === 'Todos' ? '' : selectedSupplier)
  const [open, setOpen] = useState(false)
  const [savingCurrency, setSavingCurrency] = useState('')
  const [message, setMessage] = useState('')
  const names = useMemo(() => [...new Set([
    ...supplierNames,
    ...settings.map(item => item.supplier),
  ])].filter(Boolean).sort(PRICE_CODE_COLLATOR.compare), [supplierNames, settings])
  const normalizedValue = value.trim().toLocaleUpperCase('es-AR')
  const selectedName = names.find(name => name.toLocaleUpperCase('es-AR') === normalizedValue) || null
  const selectedSetting = settings.find(item => item.supplier === selectedName) || null
  const selectedProduct = inventory.find(product => product.supplier === selectedName) || null
  const currentCurrency = selectedSetting?.currency || selectedProduct?.price_currency || 'ARS'
  const suggestions = names
    .filter(name => !normalizedValue || name.toLocaleUpperCase('es-AR').includes(normalizedValue))

  useEffect(() => {
    setValue(selectedSupplier === 'Todos' ? '' : selectedSupplier)
  }, [selectedSupplier])

  const chooseSupplier = (supplier) => {
    setValue(supplier)
    setOpen(false)
    setMessage('')
    onSelect(supplier)
  }

  const setCurrency = async (currency) => {
    if (!selectedName) { setMessage('Elegí un proveedor de los resultados.'); return }
    setSavingCurrency(currency)
    setMessage('')
    try {
      const result = await onSave(selectedName, currency)
      setMessage(`${result.productCount} productos pasaron a ${currency}.`)
    } catch (err) {
      setMessage(err.message || 'No se pudo guardar.')
    } finally {
      setSavingCurrency('')
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: 230 }}>
        <input
          type="search"
          value={value}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={event => {
            const next = event.target.value.toUpperCase()
            setValue(next)
            setOpen(true)
            setMessage('')
            onSelect(next || 'Todos')
          }}
          placeholder="Buscar proveedor"
          aria-label="Buscar proveedor para mostrar"
          style={{ ...headerFilterControl, width: '100%' }}
        />
        {open && suggestions.length > 0 && (
          <div style={{ position: 'absolute', zIndex: 40, top: 'calc(100% + 4px)', left: 0, right: 0, maxHeight: 230, overflowY: 'auto', background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: '0 8px 22px rgba(17,24,39,0.14)' }}>
            {suggestions.map(name => {
              const item = settings.find(setting => setting.supplier === name)
              return (
                <button key={name} type="button" onMouseDown={() => chooseSupplier(name)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 10px', border: 'none', borderBottom: `1px solid ${C.hairline}`, background: C.white, color: C.text2, fontSize: 11.5, cursor: 'pointer', textAlign: 'left' }}>
                  <strong>{name}</strong>
                  <span style={{ color: C.muted }}>{item?.productCount ?? ''}{item?.productCount != null ? ' prod.' : ''}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
      {value && <button type="button" onClick={() => { setValue(''); setOpen(false); setMessage(''); onSelect('Todos') }} style={{ ...outlineBtn, padding: '6px 9px' }}>Todos</button>}
      <span style={{ fontSize: 10.5, color: C.muted }}>Moneda:</span>
      {['ARS', 'USD'].map(currency => (
        <button
          key={currency}
          type="button"
          onClick={() => setCurrency(currency)}
          disabled={!selectedName || Boolean(savingCurrency)}
          title={currency === 'USD' ? `Convertir a ARS con US$ 1 = ${fmt(usdArsRate)}` : 'Mantener los importes en pesos'}
          style={{
            ...outlineBtn, padding: '6px 11px',
            borderColor: selectedName && currentCurrency === currency ? C.red : C.border,
            background: selectedName && currentCurrency === currency ? C.red : C.white,
            color: selectedName && currentCurrency === currency ? C.white : C.text3,
            opacity: selectedName ? 1 : 0.45,
          }}
        >
          {savingCurrency === currency ? '...' : currency}
        </button>
      ))}
      {message && <span style={{ fontSize: 10.5, color: message.includes('pasaron') ? C.green : C.red }}>{message}</span>}
    </div>
  )
}

function CleosProductEditor({ product, onChange, importId, onUploadImage }) {
  const { categoryTree } = useAdmin()
  const set = (changes) => onChange({ ...product, ...changes })
  const selectedImage = product.removeImage
    ? null
    : product.imageOptions.find(option => option.key === product.selectedImageKey)
  const imageInputRef = useRef(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState('')
  const subcategoryOptions = getSubcategoryOptions(product.category, categoryTree).map(node => node.label)

  const handleImageUpload = async (file) => {
    if (!file) return
    setImageError('')
    if (!file.type.startsWith('image/')) {
      setImageError('Seleccioná una imagen válida.')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setImageError('La imagen no puede pesar más de 8 MB.')
      return
    }
    setImageUploading(true)
    try {
      const option = await onUploadImage(importId, file)
      set({
        imageOptions: [...product.imageOptions.filter(item => item.key !== option.key), option],
        selectedImageKey: option.key,
        removeImage: false,
      })
    } catch (err) {
      setImageError(err.message || 'No se pudo subir la imagen.')
    } finally {
      setImageUploading(false)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  return (
    <div style={{
      border: `1px solid ${product.accepted ? C.border : C.hairline}`,
      borderRadius: 10,
      padding: 14,
      background: product.accepted ? C.paper : '#F8F8F8',
      opacity: product.accepted ? 1 : 0.62,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: C.ink }}>
          <input
            type="checkbox"
            checked={product.accepted}
            onChange={event => set({ accepted: event.target.checked })}
          />
          {product.accepted ? 'Importar producto' : 'Producto descartado'}
        </label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span style={pill('#F3F4F6', C.text3)}>Página {product.page}</span>
          {product.match && <span style={pill(C.amberLight, C.amberDark)}>Ya existe</span>}
          {!product.priceUsd && <span style={pill(C.redLight, C.red)}>Revisar precio</span>}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(110px, 140px) minmax(0, 1fr)',
        gap: 14,
        alignItems: 'start',
      }}>
        <div>
          <div style={{
            width: '100%', aspectRatio: '1 / 1', border: `1px solid ${C.border}`, borderRadius: 8,
            background: '#F4F4F4', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}>
            {selectedImage ? (
              <img src={selectedImage.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <span style={{ fontSize: 11, color: C.muted, textAlign: 'center', padding: 10 }}>Sin imagen seleccionada</span>
            )}
          </div>

          {product.imageOptions.length > 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, marginTop: 7 }}>
              {product.imageOptions.map(option => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => set({ selectedImageKey: option.key, removeImage: false })}
                  style={{
                    border: `2px solid ${option.key === product.selectedImageKey ? C.red : C.hairline}`,
                    padding: 2, borderRadius: 6, background: '#fff', cursor: 'pointer', aspectRatio: '1 / 1',
                  }}
                >
                  <img src={option.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </button>
              ))}
            </div>
          )}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={event => handleImageUpload(event.target.files?.[0])}
          />
          <button
            type="button"
            disabled={imageUploading}
            onClick={() => imageInputRef.current?.click()}
            style={{ ...outlineBtn, width: '100%', marginTop: 7, padding: '5px 7px', fontSize: 10.5 }}
          >
            {imageUploading ? 'Subiendo...' : 'Subir otra imagen'}
          </button>
          {product.selectedImageKey && !product.removeImage && (
            <button
              type="button"
              onClick={() => set({ selectedImageKey: null, removeImage: false })}
              style={{ ...outlineBtn, width: '100%', marginTop: 7, padding: '5px 7px', fontSize: 10.5 }}
            >
              No usar esta imagen
            </button>
          )}
          {product.match?.image_url && (
            <button
              type="button"
              onClick={() => set({ selectedImageKey: null, removeImage: true })}
              style={{ ...outlineBtn, width: '100%', marginTop: 7, padding: '5px 7px', fontSize: 10.5, color: C.red, borderColor: C.red }}
            >
              Eliminar imagen actual
            </button>
          )}
          {product.removeImage && (
            <p style={{ margin: '6px 0 0', color: C.red, fontSize: 10.5, textAlign: 'center' }}>La imagen guardada se eliminará</p>
          )}
          {imageError && <p style={{ margin: '6px 0 0', color: C.red, fontSize: 10.5 }}>{imageError}</p>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 0.7fr) minmax(180px, 1.3fr)', gap: 10 }}>
          <label style={{ fontSize: 11.5, color: C.text3 }}>
            Código
            <input
              value={product.code}
              onChange={event => set({ code: event.target.value.toUpperCase() })}
              style={{ ...inp, marginTop: 4, padding: '7px 8px', fontSize: 12 }}
            />
          </label>
          <label style={{ fontSize: 11.5, color: C.text3 }}>
            Nombre
            <input
              value={product.name}
              onChange={event => set({ name: event.target.value })}
              style={{ ...inp, marginTop: 4, padding: '7px 8px', fontSize: 12 }}
            />
          </label>
          <label style={{ fontSize: 11.5, color: C.text3 }}>
            Precio costo USD
            <input
              type="number"
              min="0"
              step="0.01"
              value={product.priceUsd ?? ''}
              onChange={event => set({ priceUsd: event.target.value })}
              style={{ ...inp, marginTop: 4, padding: '7px 8px', fontSize: 12 }}
            />
          </label>
          <label style={{ fontSize: 11.5, color: C.text3 }}>
            Potencia (W)
            <input
              type="number"
              min="0"
              step="0.01"
              value={product.watts ?? ''}
              onChange={event => set({ watts: event.target.value })}
              style={{ ...inp, marginTop: 4, padding: '7px 8px', fontSize: 12 }}
            />
          </label>
          <label style={{ fontSize: 11.5, color: C.text3 }}>
            Categoría
            <select
              value={product.category || ''}
              onChange={event => set({ category: event.target.value, subcategory: '' })}
              style={{ ...inp, marginTop: 4, padding: '7px 8px', fontSize: 12 }}
            >
              <option value="">Sin categoría</option>
              {CATS.map(category => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 11.5, color: C.text3 }}>
            Subcategoría
            <select
              value={product.subcategory || ''}
              onChange={event => set({ subcategory: event.target.value })}
              disabled={!product.category}
              style={{ ...inp, marginTop: 4, padding: '7px 8px', fontSize: 12 }}
            >
              <option value="">Sin subcategoría</option>
              {subcategoryOptions.map(subcategory => <option key={subcategory} value={subcategory}>{subcategory}</option>)}
              {product.subcategory && !subcategoryOptions.includes(product.subcategory) && (
                <option value={product.subcategory}>{product.subcategory} (actual)</option>
              )}
            </select>
          </label>
          <label style={{ fontSize: 11.5, color: C.text3, gridColumn: '1 / -1' }}>
            Descripción
            <input
              value={product.description || ''}
              onChange={event => set({ description: event.target.value })}
              style={{ ...inp, marginTop: 4, padding: '7px 8px', fontSize: 12 }}
            />
          </label>
          {product.match && (
            <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 11, color: C.muted }}>
              Actualiza {product.match.codigo} y conserva sus campos públicos editados. La imagen seleccionada sí reemplaza la actual.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function CleosReviewModal({ parsed, onConfirm, onClose, onUploadImage }) {
  const { categoryTree } = useAdmin()
  const [products, setProducts] = useState(() => parsed.products.map((product, index) => ({
    ...product,
    key: `${product.code}-${index}`,
    accepted: true,
    category: product.match?.category || '',
    subcategory: product.match?.subcategory || '',
    removeImage: false,
  })))
  const [query, setQuery] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [bulkCategory, setBulkCategory] = useState('')
  const [bulkSubcategory, setBulkSubcategory] = useState('')

  const acceptedCount = products.filter(product => product.accepted).length
  const visibleProducts = products.filter((product) => {
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    return `${product.code} ${product.name} ${product.description || ''}`.toLowerCase().includes(needle)
  })

  const updateProduct = (key, next) => {
    setProducts(current => current.map(product => product.key === key ? next : product))
  }

  const setAll = (accepted) => {
    setProducts(current => current.map(product => ({ ...product, accepted })))
  }

  const bulkSubcategoryOptions = getSubcategoryOptions(bulkCategory, categoryTree).map(node => node.label)
  const applyBulkCategory = () => {
    if (!bulkCategory) return
    setProducts(current => current.map(product => product.accepted
      ? { ...product, category: bulkCategory, subcategory: bulkSubcategory }
      : product
    ))
  }

  const handleConfirm = async () => {
    setError('')
    const accepted = products.filter(product => product.accepted)
    if (!accepted.length) {
      setError('Seleccioná al menos un producto para importar.')
      return
    }
    const invalid = accepted.find(product => !product.code.trim() || !product.name.trim())
    if (invalid) {
      setError('Todos los productos aceptados necesitan código y nombre.')
      return
    }

    setSubmitting(true)
    try {
      await onConfirm(parsed.importId, accepted.map(product => ({
        code: product.code.trim(),
        name: product.name.trim(),
        description: product.description,
        longDescription: product.longDescription,
        groupTitle: product.groupTitle,
        priceUsd: product.priceUsd,
        watts: product.watts,
        ipRating: product.ipRating,
        selectedImageKey: product.selectedImageKey,
        removeImage: product.removeImage,
        category: product.category,
        subcategory: product.subcategory,
      })))
      onClose()
    } catch (err) {
      setError(err.message || 'No se pudo importar el catálogo CLEOS')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: C.paper, borderRadius: 12, width: '100%', maxWidth: 1050,
        height: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.3)', overflow: 'hidden',
      }}>
        <div style={{ padding: '24px 28px 18px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16 }}>
            <div>
              <h2 style={{ fontFamily: ADMIN_FONT, fontSize: 22, color: C.ink, margin: 0, fontWeight: 500 }}>
                Revisar catálogo CLEOS
              </h2>
              <p style={{ fontSize: 12, color: C.muted, margin: '6px 0 0' }}>
                Se detectaron {products.length} productos en {parsed.pageCount} páginas. Nada se guarda hasta confirmar.
                Los productos quedan sin publicar para completar precio de venta, categoría y stock.
              </p>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: 18 }}>✕</button>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Buscar por código o nombre..."
              style={{ ...inp, padding: '8px 10px', fontSize: 12, flex: '1 1 260px', maxWidth: 420 }}
            />
            <button onClick={() => setAll(true)} style={{ ...outlineBtn, padding: '7px 10px', fontSize: 11.5 }}>Aceptar todos</button>
            <button onClick={() => setAll(false)} style={{ ...outlineBtn, padding: '7px 10px', fontSize: 11.5 }}>Descartar todos</button>
            <span style={pill(C.greenLight, C.green)}>{acceptedCount} aceptados</span>
            {!!parsed.duplicateCodes && <span style={pill(C.amberLight, C.amberDark)}>{parsed.duplicateCodes} código repetido unificado</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <select
              value={bulkCategory}
              onChange={event => { setBulkCategory(event.target.value); setBulkSubcategory('') }}
              style={{ ...inp, width: 190, padding: '7px 8px', fontSize: 11.5 }}
            >
              <option value="">Categoría para aceptados...</option>
              {CATS.map(category => <option key={category} value={category}>{category}</option>)}
            </select>
            <select
              value={bulkSubcategory}
              onChange={event => setBulkSubcategory(event.target.value)}
              disabled={!bulkCategory}
              style={{ ...inp, width: 220, padding: '7px 8px', fontSize: 11.5 }}
            >
              <option value="">Sin subcategoría</option>
              {bulkSubcategoryOptions.map(subcategory => <option key={subcategory} value={subcategory}>{subcategory}</option>)}
            </select>
            <button
              onClick={applyBulkCategory}
              disabled={!bulkCategory}
              style={{ ...outlineBtn, padding: '7px 10px', fontSize: 11.5, opacity: bulkCategory ? 1 : 0.55 }}
            >
              Aplicar categoría a aceptados
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 28px', display: 'grid', gap: 12 }}>
          {visibleProducts.map(product => (
            <CleosProductEditor
              key={product.key}
              product={product}
              onChange={next => updateProduct(product.key, next)}
              importId={parsed.importId}
              onUploadImage={onUploadImage}
            />
          ))}
          {!visibleProducts.length && (
            <p style={{ textAlign: 'center', color: C.muted, padding: 40 }}>No hay productos que coincidan con la búsqueda.</p>
          )}
        </div>

        <div style={{
          padding: '16px 28px', borderTop: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        }}>
          <div>
            {error && <p style={{ margin: 0, color: C.red, fontSize: 12 }}>{error}</p>}
            {!error && <span style={{ color: C.muted, fontSize: 12 }}>{acceptedCount} productos se crearán o actualizarán con su imagen.</span>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} disabled={submitting} style={outlineBtn}>Cancelar</button>
            <button
              onClick={handleConfirm}
              disabled={submitting || !acceptedCount}
              style={{
                ...solidBtn,
                background: acceptedCount ? C.red : '#ddd',
                color: acceptedCount ? '#fff' : '#aaa',
                cursor: acceptedCount && !submitting ? 'pointer' : 'not-allowed',
              }}
            >
              {submitting ? 'Importando...' : `Importar seleccionados (${acceptedCount})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CatalogProductPicker({ row, supplier, onChange }) {
  const { searchProducts } = useAdmin()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [codeError, setCodeError] = useState('')
  const selectedProducts = row.selectedProducts || []

  const normalizeCode = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

  const nearbyCodeCandidates = [...new Set([
    row.detectedCode,
    ...String(row.nearbyText || '').split('·'),
  ]
    .map(value => String(value || '').trim())
    .filter(value => value.length >= 2 && value.length <= 64)
    .filter(value => /[A-Za-z]/.test(value) && /\d/.test(value))
    .filter(value => /^[A-Za-z0-9][A-Za-z0-9 ./_()+-]*$/.test(value))
  )].slice(0, 8)

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([])
      setLoading(false)
      return undefined
    }
    let active = true
    const timer = setTimeout(async () => {
      setLoading(true)
      const found = await searchProducts(query, { supplier })
      if (active) {
        setResults(found.filter(product => product.supplier === supplier))
        setLoading(false)
      }
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [open, query, searchProducts, supplier])

  const choose = (product, selectedCode = query.trim() || row.detectedCode) => {
    const selectedProduct = {
      id: product.id,
      codigo: product.codigo,
      name: product.name || null,
      descripcion: product.descripcion || null,
      image_url: product.image_url || null,
    }
    const nextProducts = selectedProducts.some(selected => selected.id === product.id)
      ? selectedProducts
      : [...selectedProducts, selectedProduct]
    onChange({
      ...row,
      detectedCode: selectedCode || product.codigo,
      selectedProducts: nextProducts,
      accepted: Boolean(nextProducts.length && row.selectedImageKey),
    })
    setOpen(false)
    setQuery('')
    setResults([])
    setCodeError('')
  }

  const removeProduct = (productId) => {
    const nextProducts = selectedProducts.filter(product => product.id !== productId)
    onChange({
      ...row,
      selectedProducts: nextProducts,
      accepted: Boolean(nextProducts.length && row.selectedImageKey && row.accepted),
    })
  }

  const useNearbyCode = async (code) => {
    setLoading(true)
    setCodeError('')
    try {
      const found = (await searchProducts(code, { supplier }))
        .filter(product => product.supplier === supplier)
      const exact = found.find(product => normalizeCode(product.codigo) === normalizeCode(code))
      if (exact) {
        choose(exact, code)
        return
      }
      setOpen(true)
      setQuery(code)
      setResults(found)
      setCodeError(found.length
        ? `No hubo coincidencia exacta para ${code}. Elegí el producto correcto.`
        : `No se encontró el código ${code} dentro de ${supplier}.`)
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <div>
        <div style={{ display: 'grid', gap: 7 }}>
          {selectedProducts.length ? selectedProducts.map(product => (
            <div key={product.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px', borderRadius: 7, background: C.greenLight, color: C.green, fontSize: 11.5 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>{product.codigo}</strong> — {product.name || product.descripcion || 'Sin descripción'}
              </span>
              <button
                type="button"
                onClick={() => removeProduct(product.id)}
                aria-label={`Quitar ${product.codigo}`}
                title="Quitar producto"
                style={{ border: 0, background: 'transparent', color: C.green, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
              >
                ×
              </button>
            </div>
          )) : (
            <span style={pill(C.redLight, C.red)}>Sin producto asociado</span>
          )}
          <button type="button" onClick={() => setOpen(true)} style={{ ...outlineBtn, justifySelf: 'start', padding: '5px 9px', fontSize: 10.5 }}>
            {selectedProducts.length ? 'Agregar otro producto' : 'Buscar producto'}
          </button>
        </div>
        {!!nearbyCodeCandidates.length && (
          <div style={{ marginTop: 11 }}>
            <p style={{ fontSize: 10.5, color: C.text3, margin: '0 0 6px' }}>
              Indicá cuál valor del texto cercano es el código de esta foto:
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {nearbyCodeCandidates.map(code => (
                <button
                  type="button"
                  key={code}
                  disabled={loading}
                  onClick={() => useNearbyCode(code)}
                  style={{
                    ...outlineBtn,
                    padding: '5px 9px', fontSize: 10.5,
                    borderColor: row.detectedCode === code ? C.green : C.border,
                    color: row.detectedCode === code ? C.green : C.text2,
                  }}
                >
                  {loading ? 'Buscando...' : `Usar ${code}`}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 9, background: C.white }}>
      <div style={{ display: 'flex', gap: 7 }}>
        <input
          autoFocus
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={`Buscar dentro de ${supplier}...`}
          style={{ ...inp, padding: '6px 8px', fontSize: 11.5, flex: 1 }}
        />
        <button type="button" onClick={() => setOpen(false)} style={{ ...outlineBtn, padding: '5px 9px', fontSize: 10.5 }}>Cancelar</button>
      </div>
      <div style={{ display: 'grid', gap: 3, marginTop: results.length ? 7 : 0 }}>
        {codeError && <span style={{ fontSize: 10.5, color: C.amberDark, padding: '4px 2px' }}>{codeError}</span>}
        {results.map(product => (
          <button
            type="button"
            key={product.id}
            disabled={selectedProducts.some(selected => selected.id === product.id)}
            onClick={() => choose(product, query.trim())}
            style={{ border: 0, background: C.paper, borderRadius: 5, padding: '7px 8px', textAlign: 'left', cursor: selectedProducts.some(selected => selected.id === product.id) ? 'default' : 'pointer', color: C.text2, fontSize: 11.5, opacity: selectedProducts.some(selected => selected.id === product.id) ? 0.55 : 1 }}
          >
            <strong>{product.codigo}</strong> — {product.name || product.descripcion || 'Sin descripción'}
            {selectedProducts.some(selected => selected.id === product.id) ? ' (ya agregado)' : ''}
          </button>
        ))}
        {loading && <span style={{ fontSize: 10.5, color: C.muted, padding: 4 }}>Buscando...</span>}
        {!loading && query.trim().length >= 2 && !results.length && (
          <span style={{ fontSize: 10.5, color: C.muted, padding: 4 }}>No se encontraron productos de {supplier}.</span>
        )}
      </div>
    </div>
  )
}

function CatalogImageReviewRow({ row, supplier, importId, onChange, onUploadImage }) {
  const set = changes => onChange({ ...row, ...changes })
  const selectedProducts = row.selectedProducts || []
  const selectedImage = row.imageOptions.find(option => option.key === row.selectedImageKey) || null
  const imageInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const uploadReplacement = async (file) => {
    if (!file) return
    setUploadError('')
    setUploading(true)
    try {
      const option = await onUploadImage(importId, file)
      set({
        imageOptions: [...row.imageOptions, option],
        selectedImageKey: option.key,
        accepted: Boolean(selectedProducts.length),
      })
    } catch (error) {
      setUploadError(error.message || 'No se pudo subir la imagen')
    } finally {
      setUploading(false)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  return (
    <div style={{ border: `1px solid ${row.accepted ? C.border : C.hairline}`, borderRadius: 10, padding: 13, opacity: row.accepted ? 1 : 0.72 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: C.ink }}>
          <input
            type="checkbox"
            checked={row.accepted}
            disabled={!selectedProducts.length || !row.selectedImageKey}
            onChange={event => set({ accepted: event.target.checked })}
          />
          {row.accepted ? 'Aplicar esta imagen' : 'No aplicar'}
        </label>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={pill('#F3F4F6', C.text3)}>Página {row.page}</span>
          {row.detectedCode && <span style={pill('#EEF2FF', '#4338CA')}>Código leído: {row.detectedCode}</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 155px) minmax(0, 1fr)', gap: 15 }}>
        <div>
          <div style={{ aspectRatio: '1 / 1', border: `1px solid ${C.border}`, borderRadius: 8, background: '#F4F4F4', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {selectedImage
              ? <img src={selectedImage.url} alt="Imagen extraída" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <span style={{ fontSize: 10.5, color: C.muted }}>Sin imagen</span>}
          </div>
          {row.imageOptions.length > 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginTop: 6 }}>
              {row.imageOptions.map(option => (
                <button
                  type="button"
                  key={option.key}
                  onClick={() => set({ selectedImageKey: option.key, accepted: Boolean(selectedProducts.length) })}
                  style={{ padding: 2, aspectRatio: '1 / 1', borderRadius: 5, cursor: 'pointer', background: '#fff', border: `2px solid ${option.key === row.selectedImageKey ? C.red : C.hairline}` }}
                >
                  <img src={option.url} alt="Alternativa" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </button>
              ))}
            </div>
          )}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={event => uploadReplacement(event.target.files?.[0])}
          />
          <button type="button" disabled={uploading} onClick={() => imageInputRef.current?.click()} style={{ ...outlineBtn, width: '100%', marginTop: 6, padding: '5px 7px', fontSize: 10.5 }}>
            {uploading ? 'Subiendo...' : 'Reemplazar imagen'}
          </button>
          {uploadError && <p style={{ color: C.red, fontSize: 10, margin: '5px 0 0' }}>{uploadError}</p>}
        </div>

        <div style={{ minWidth: 0 }}>
          <p style={{ ...lbl, marginBottom: 6 }}>Esta imagen se insertará en</p>
          <CatalogProductPicker row={row} supplier={supplier} onChange={onChange} />
          {selectedProducts.some(product => product.image_url) && (
            <div style={{ display: 'grid', gap: 7, marginTop: 12, padding: 8, borderRadius: 7, background: '#F8F8F8' }}>
              {selectedProducts.filter(product => product.image_url).map(product => (
                <div key={product.id} style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                  <img src={product.image_url} alt={`Imagen actual de ${product.codigo}`} style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: 5, background: '#fff' }} />
                  <span style={{ fontSize: 10.5, color: C.muted }}>
                    Imagen actual de <strong>{product.codigo}</strong>. Sólo será reemplazada si confirmás esta fila.
                  </span>
                </div>
              ))}
            </div>
          )}
          {row.nearbyText && (
            <p style={{ fontSize: 10.5, lineHeight: 1.4, color: C.muted, margin: '11px 0 0' }}>
              Texto cercano en el PDF: {row.nearbyText}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

const CATALOG_DRAFT_MAX_AGE_MS = 48 * 60 * 60 * 1000

function catalogDraftKey(supplier) {
  return `catalogReviewDraft:${supplier}`
}

function loadCatalogDraft(supplier) {
  try {
    const raw = localStorage.getItem(catalogDraftKey(supplier))
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data?.entries || Date.now() - data.savedAt > CATALOG_DRAFT_MAX_AGE_MS) return null
    return data
  } catch {
    return null
  }
}

function CatalogImagesReviewModal({ parsed, onConfirm, onClose, onUploadImage }) {
  const [draftInfo] = useState(() => loadCatalogDraft(parsed.supplier))
  const [rows, setRows] = useState(() => parsed.products.map((row, index) => {
    const key = `${row.page}-${row.detectedCode || 'image'}-${index}`
    const draftEntry = draftInfo?.entries?.[key]
    return {
      ...row,
      key,
      selectedProducts: draftEntry ? draftEntry.selectedProducts : (row.match ? [row.match] : []),
      selectedImageKey: draftEntry ? draftEntry.selectedImageKey : row.selectedImageKey,
      accepted: draftEntry ? draftEntry.accepted : Boolean(row.match && row.selectedImageKey),
    }
  }))
  const [draftNotice, setDraftNotice] = useState(() => Boolean(draftInfo?.entries && Object.keys(draftInfo.entries).length))
  const [query, setQuery] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [duplicates, setDuplicates] = useState([])
  const [highlightKey, setHighlightKey] = useState(null)
  const [scrollTarget, setScrollTarget] = useState(null)
  const rowRefs = useRef({})
  const accepted = rows.filter(row => row.accepted && row.selectedProducts.length && row.selectedImageKey)
  const acceptedAssociations = accepted.flatMap(row => row.selectedProducts.map(product => ({
    productId: product.id,
    selectedImageKey: row.selectedImageKey,
  })))
  const visibleRows = rows.filter(row => {
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    const selectedText = row.selectedProducts
      .map(product => `${product.codigo || ''} ${product.name || ''} ${product.descripcion || ''}`)
      .join(' ')
    return `${row.detectedCode || ''} ${row.nearbyText || ''} ${selectedText}`.toLowerCase().includes(needle)
  })

  const updateRow = (key, next) => setRows(current => current.map(row => row.key === key ? next : row))

  useEffect(() => {
    const timeout = setTimeout(() => {
      const entries = {}
      rows.forEach(row => {
        if (row.accepted || row.selectedProducts.length) {
          entries[row.key] = { selectedProducts: row.selectedProducts, selectedImageKey: row.selectedImageKey, accepted: row.accepted }
        }
      })
      try {
        localStorage.setItem(catalogDraftKey(parsed.supplier), JSON.stringify({ savedAt: Date.now(), entries }))
      } catch {
        // localStorage lleno o no disponible: seguimos sin autoguardado
      }
    }, 500)
    return () => clearTimeout(timeout)
  }, [rows, parsed.supplier])

  const discardDraft = () => {
    try { localStorage.removeItem(catalogDraftKey(parsed.supplier)) } catch { /* ignore */ }
    setRows(parsed.products.map((row, index) => ({
      ...row,
      key: `${row.page}-${row.detectedCode || 'image'}-${index}`,
      selectedProducts: row.match ? [row.match] : [],
      accepted: Boolean(row.match && row.selectedImageKey),
    })))
    setDraftNotice(false)
  }

  const goToRow = key => {
    setQuery('')
    setScrollTarget(key)
  }

  useEffect(() => {
    if (!scrollTarget) return
    const el = rowRefs.current[scrollTarget]
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightKey(scrollTarget)
    setScrollTarget(null)
    const timeout = setTimeout(() => setHighlightKey(current => current === scrollTarget ? null : current), 2500)
    return () => clearTimeout(timeout)
  }, [scrollTarget, visibleRows])

  const handleConfirm = async () => {
    setError('')
    setDuplicates([])
    if (!acceptedAssociations.length) {
      setError('Seleccioná al menos una asociación válida.')
      return
    }
    const productIds = acceptedAssociations.map(action => action.productId)
    const seenIds = new Set()
    const duplicateIds = new Set()
    productIds.forEach(id => {
      if (seenIds.has(id)) duplicateIds.add(id)
      seenIds.add(id)
    })
    if (duplicateIds.size) {
      const dupInfo = Array.from(duplicateIds).map(productId => {
        const dupRows = accepted.filter(row => row.selectedProducts.some(product => product.id === productId))
        const product = dupRows.flatMap(row => row.selectedProducts).find(p => p.id === productId)
        return { productId, codigo: product?.codigo || product?.name || productId, rowKeys: dupRows.map(row => row.key) }
      })
      setDuplicates(dupInfo)
      setError(`Hay ${dupInfo.length} producto${dupInfo.length > 1 ? 's' : ''} con más de una imagen asociada: ${dupInfo.map(d => d.codigo).join(', ')}. Dejá seleccionada sólo la imagen correcta en cada uno.`)
      return
    }
    setSubmitting(true)
    try {
      await onConfirm(parsed.importId, parsed.supplier, acceptedAssociations)
      try { localStorage.removeItem(catalogDraftKey(parsed.supplier)) } catch { /* ignore */ }
      onClose()
    } catch (confirmError) {
      setError(confirmError.message || 'No se pudieron guardar las imágenes')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: C.paper, borderRadius: 12, width: '100%', maxWidth: 980, height: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
        <div style={{ padding: '22px 26px 17px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 15 }}>
            <div>
              <h2 style={{ fontFamily: ADMIN_FONT, fontSize: 21, color: C.ink, margin: 0, fontWeight: 500 }}>Revisar imágenes de {parsed.supplier}</h2>
              <p style={{ fontSize: 11.5, color: C.muted, margin: '6px 0 0' }}>
                Se extrajeron propuestas de {parsed.pageCount} páginas. Nada se modifica hasta confirmar; sólo se reemplazará la imagen de los productos seleccionados.
                {' '}Tu progreso se guarda automáticamente en este navegador por si se cierra la pestaña.
              </p>
            </div>
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: 18 }}>×</button>
          </div>
          {draftNotice && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, padding: '8px 11px', borderRadius: 7, background: C.amberLight }}>
              <span style={{ fontSize: 11.5, color: C.amberDark, flex: 1 }}>
                Se restauró un progreso guardado el {draftInfo?.savedAt ? new Date(draftInfo.savedAt).toLocaleString('es-AR') : ''} para {parsed.supplier}.
              </span>
              <button type="button" onClick={discardDraft} style={{ ...outlineBtn, padding: '4px 9px', fontSize: 10.5 }}>Descartar y empezar de nuevo</button>
              <button type="button" onClick={() => setDraftNotice(false)} style={{ ...outlineBtn, padding: '4px 9px', fontSize: 10.5 }}>Ok, seguir</button>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar código, producto o texto del PDF..." style={{ ...inp, padding: '7px 9px', fontSize: 11.5, flex: '1 1 280px', maxWidth: 430 }} />
            <span style={pill(C.greenLight, C.green)}>{acceptedAssociations.length} productos listos para aplicar</span>
            <span style={pill('#EEF2FF', '#4338CA')}>{rows.filter(row => row.selectedProducts.length).length} imágenes asociadas</span>
            {!!rows.filter(row => !row.selectedProducts.length).length && <span style={pill(C.amberLight, C.amberDark)}>{rows.filter(row => !row.selectedProducts.length).length} para revisar</span>}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '17px 26px', display: 'grid', gap: 11 }}>
          {visibleRows.map(row => (
            <div
              key={row.key}
              ref={el => { rowRefs.current[row.key] = el }}
              style={highlightKey === row.key ? { borderRadius: 10, boxShadow: `0 0 0 3px ${C.red}`, transition: 'box-shadow 0.2s' } : undefined}
            >
              <CatalogImageReviewRow
                row={row}
                supplier={parsed.supplier}
                importId={parsed.importId}
                onChange={next => updateRow(row.key, next)}
                onUploadImage={onUploadImage}
              />
            </div>
          ))}
          {!visibleRows.length && <p style={{ color: C.muted, textAlign: 'center', padding: 30 }}>No hay resultados para esa búsqueda.</p>}
        </div>

        <div style={{ padding: '15px 26px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            {error
              ? (
                <div>
                  <p style={{ margin: 0, color: C.red, fontSize: 11.5 }}>{error}</p>
                  {!!duplicates.length && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
                      {duplicates.map(dup => (
                        <div key={dup.productId} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={pill('#FEE2E2', C.red)}>{dup.codigo}</span>
                          {dup.rowKeys.map((key, index) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => goToRow(key)}
                              style={{ ...outlineBtn, padding: '3px 8px', fontSize: 10.5 }}
                            >
                              Ir a imagen {dup.rowKeys.length > 1 ? index + 1 : ''}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
              : <span style={{ color: C.muted, fontSize: 11.5 }}>Se actualizarán {acceptedAssociations.length} productos con {accepted.length} imágenes seleccionadas.</span>}
          </div>
          <div style={{ display: 'flex', gap: 9 }}>
            <button type="button" onClick={onClose} disabled={submitting} style={outlineBtn}>Cancelar</button>
            <button type="button" onClick={handleConfirm} disabled={submitting || !acceptedAssociations.length} style={{ ...solidBtn, background: acceptedAssociations.length ? C.red : '#ddd', color: acceptedAssociations.length ? '#fff' : '#aaa', cursor: acceptedAssociations.length && !submitting ? 'pointer' : 'not-allowed' }}>
              {submitting ? 'Guardando...' : `Confirmar productos (${acceptedAssociations.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const SUPPLIER_FILTERS = ['Todos', 'ALCIDES', 'KIAN', 'CLEOS', 'OTRO']
const INV_PAGE_SIZE = 50
const headerFilterControl = {
  width: '100%', minWidth: 0, height: 31, padding: '5px 7px',
  border: `1px solid ${C.border}`, borderRadius: 6, background: C.white,
  color: C.ink, font: `400 11px ${ADMIN_FONT}`, outline: 'none', boxSizing: 'border-box',
}
const headerRangeRow = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }

function UnifiedProductsTab() {
  const {
    inventory, inventoryTotal, inventorySuppliers, inventoryLoading, inventoryError,
    importResult, importLoading, importError,
    currencySettings, updateCurrencySettings,
    supplierSettings, updateSupplierCurrency,
    fetchInventory, createInventoryItem, updateInventoryItem, deleteInventoryItem, fetchCatalog,
    fetchInventorySelectionIds, applyInventoryBatch,
    adjustInventoryStocks, uploadInventoryFile,
    uploadPriceFiles,
    parseInvoicePdf, applyInvoiceLines,
    parseCatalogImagesPdf, uploadCatalogPreviewImage, applyCatalogImages,
  } = useAdmin()

  const [search, setSearch]           = useState('')
  const [supplierFilter, setSupplier] = useState('Todos')
  const [publicationFilter, setPublicationFilter] = useState('Todos')
  const [stockStatus, setStockStatus] = useState('Todos')
  const [stockMin, setStockMin]       = useState('')
  const [stockMax, setStockMax]       = useState('')
  const [costMin, setCostMin]         = useState('')
  const [costMax, setCostMax]         = useState('')
  const [saleMin, setSaleMin]         = useState('')
  const [saleMax, setSaleMax]         = useState('')
  const [sortBy, setSortBy]           = useState('updated')
  const [sortDir, setSortDir]         = useState('desc')
  const [page, setPage]               = useState(1)
  const [editItem, setEditItem]       = useState(null)
  const [addOpen, setAddOpen]         = useState(false)
  const [confirmId, setConfirmId]     = useState(null)
  const [showResult, setShowResult]   = useState(false)
  const [invoiceParsing, setInvoiceParsing] = useState(false)
  const [invoiceError, setInvoiceError]     = useState(null)
  const [invoiceParsed, setInvoiceParsed]   = useState(null)
  const [priceParsing, setPriceParsing]     = useState(false)
  const [catalogSupplier, setCatalogSupplier] = useState('')
  const [catalogParsing, setCatalogParsing]   = useState(false)
  const [catalogError, setCatalogError]       = useState(null)
  const [catalogParsed, setCatalogParsed]     = useState(null)
  const [stockDrafts, setStockDrafts]       = useState({})
  const [stockSaving, setStockSaving]       = useState(false)
  const [stockSaveError, setStockSaveError] = useState('')
  const [hoveredProductId, setHoveredProductId] = useState(null)
  const [selectedIds, setSelectedIds]       = useState(() => new Set())
  const [bulkAction, setBulkAction]         = useState('precio_venta')
  const [bulkPrice, setBulkPrice]           = useState('')
  const [bulkSaving, setBulkSaving]         = useState(false)
  const [bulkError, setBulkError]           = useState('')
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const selectPageRef = useRef(null)

  const inventoryFilters = useMemo(() => ({
    page,
    limit: INV_PAGE_SIZE,
    sortBy,
    sortDir,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(supplierFilter !== 'Todos' ? { supplier: supplierFilter } : {}),
    ...(publicationFilter !== 'Todos' ? { published: publicationFilter === 'Publicados' ? 'true' : 'false' } : {}),
    ...(stockStatus !== 'Todos' ? { stockStatus } : {}),
    ...(stockMin !== '' ? { stockMin } : {}),
    ...(stockMax !== '' ? { stockMax } : {}),
    ...(costMin !== '' ? { costMin } : {}),
    ...(costMax !== '' ? { costMax } : {}),
    ...(saleMin !== '' ? { saleMin } : {}),
    ...(saleMax !== '' ? { saleMax } : {}),
  }), [page, search, supplierFilter, publicationFilter, stockStatus, stockMin, stockMax, costMin, costMax, saleMin, saleMax, sortBy, sortDir])

  useEffect(() => {
    fetchInventory(inventoryFilters)
  }, [inventoryFilters, fetchInventory])

  useEffect(() => {
    if (importResult) setShowResult(true)
  }, [importResult])

  useEffect(() => {
    setSelectedIds(new Set())
    setBulkError('')
  }, [search, supplierFilter, publicationFilter, stockStatus, stockMin, stockMax, costMin, costMax, saleMin, saleMax])

  const totalPages = Math.max(1, Math.ceil(inventoryTotal / INV_PAGE_SIZE))
  const usdArsRate = Number(currencySettings.usdArsRate) || 1510
  const pendingStockCount = Object.keys(stockDrafts).length
  const selectedCount = selectedIds.size
  const pageIds = inventory.map(product => product.id)
  const allResultsSelected = inventoryTotal > 0 && selectedCount === inventoryTotal

  useEffect(() => {
    if (selectPageRef.current) {
      selectPageRef.current.indeterminate = selectedCount > 0 && !allResultsSelected
    }
  }, [selectedCount, allResultsSelected])

  async function handleUpload(type, file) {
    try {
      await uploadInventoryFile(type, file)
      await fetchCatalog()
      setPage(1)
      fetchInventory({ ...inventoryFilters, page: 1 })
    } catch {
      // el error ya queda reflejado en importError
    }
  }

  async function handleInvoiceUpload(file) {
    setInvoiceError(null)
    setInvoiceParsing(true)
    try {
      const data = await parseInvoicePdf(file)
      if (!data.lines.length) {
        setInvoiceError('No se reconocieron líneas de productos en el PDF. Podés cargar el stock a mano.')
      } else {
        setInvoiceParsed(data)
      }
    } catch (err) {
      setInvoiceError(err.message)
    } finally {
      setInvoiceParsing(false)
    }
  }

  async function handlePriceFilesUpload(files) {
    setPriceParsing(true)
    try {
      await uploadPriceFiles(files)
      await fetchCatalog()
      setPage(1)
      await fetchInventory({ ...inventoryFilters, page: 1 })
    } catch {
      // El contexto muestra el error de importación en el panel.
    } finally {
      setPriceParsing(false)
    }
  }

  async function handleSupplierCurrencySave(supplier, currency) {
    const result = await updateSupplierCurrency(supplier, currency)
    await fetchCatalog()
    setPage(1)
    await fetchInventory({ ...inventoryFilters, supplier, page: 1 })
    return result
  }

  async function handleCurrencyRateSave(rate) {
    const result = await updateCurrencySettings(rate)
    await fetchCatalog()
    await fetchInventory(inventoryFilters)
    return result
  }

  async function handleInvoiceConfirm(actions) {
    await applyInvoiceLines(actions)
    await fetchCatalog()
    setPage(1)
    fetchInventory({ ...inventoryFilters, page: 1 })
  }

  async function handleCatalogImagesUpload(file) {
    if (!catalogSupplier) {
      setCatalogError('Elegí el proveedor antes de subir el catálogo.')
      return
    }
    setCatalogError(null)
    setCatalogParsing(true)
    try {
      const data = await parseCatalogImagesPdf(file, catalogSupplier)
      setCatalogParsed(data)
    } catch (err) {
      setCatalogError(err.message)
    } finally {
      setCatalogParsing(false)
    }
  }

  async function handleCatalogImagesConfirm(importId, supplier, actions) {
    await applyCatalogImages(importId, supplier, actions)
    await fetchCatalog()
    setPage(1)
    fetchInventory({ ...inventoryFilters, page: 1 })
  }

  function queueStockValue(product, rawValue) {
    if (stockSaving) return
    setStockSaveError('')
    setStockDrafts(current => {
      const savedStock = Number(product.stock) || 0
      const draft = current[product.id]
      const base = draft?.base ?? savedStock
      const next = { ...current }

      if (rawValue === '') {
        next[product.id] = { base, value: '' }
        return next
      }

      const value = Number(rawValue)
      if (!Number.isInteger(value) || value < 0) return current
      if (value === base) delete next[product.id]
      else next[product.id] = { base, value }
      return next
    })
  }

  function restoreEmptyStockDraft(product) {
    setStockDrafts(current => {
      if (current[product.id]?.value !== '') return current
      const next = { ...current }
      delete next[product.id]
      return next
    })
  }

  function openProduct(product) {
    const stockDraft = stockDrafts[product.id]
    setEditItem(stockDraft ? { ...product, stock: stockDraft.value } : product)
  }

  async function handleSaveStockChanges() {
    const hasInvalidStock = Object.values(stockDrafts).some(draft => !Number.isInteger(draft.value) || draft.value < 0)
    if (hasInvalidStock) {
      setStockSaveError('Completá el stock pendiente con un número entero mayor o igual a cero.')
      return
    }
    const changes = Object.entries(stockDrafts).map(([id, draft]) => ({
      id,
      delta: draft.value - draft.base,
    })).filter(change => change.delta !== 0)
    if (!changes.length || stockSaving) return

    setStockSaving(true)
    setStockSaveError('')
    try {
      await adjustInventoryStocks(changes)
      setStockDrafts({})
    } catch (err) {
      setStockSaveError(err.message || 'No se pudieron guardar los cambios de stock')
    } finally {
      setStockSaving(false)
    }
  }

  async function handleSave(data) {
    const payload = toUnifiedProductPayload(data)
    if (addOpen) await createInventoryItem(payload)
    else await updateInventoryItem(editItem.id, payload)
    if (editItem?.id) {
      setStockDrafts(current => {
        const next = { ...current }
        delete next[editItem.id]
        return next
      })
    }
    await fetchCatalog()
    fetchInventory(inventoryFilters)
  }

  async function handleDelete(id) {
    await deleteInventoryItem(id)
    await fetchCatalog()
    setStockDrafts(current => {
      const next = { ...current }
      delete next[id]
      return next
    })
    setConfirmId(null)
    fetchInventory(inventoryFilters)
  }

  function toggleProductSelection(id) {
    setSelectedIds(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setBulkError('')
  }

  async function selectAllFiltered() {
    setBulkSaving(true)
    setBulkError('')
    try {
      const ids = await fetchInventorySelectionIds(inventoryFilters)
      setSelectedIds(new Set(ids))
    } catch (err) {
      setBulkError(err.message || 'No se pudieron seleccionar todos los productos')
    } finally {
      setBulkSaving(false)
    }
  }

  function toggleAllSelection() {
    if (allResultsSelected) {
      setSelectedIds(new Set())
      setBulkError('')
      return
    }
    selectAllFiltered()
  }

  async function refreshAfterBulkAction(removedIds = []) {
    setSelectedIds(new Set())
    if (removedIds.length) {
      const removed = new Set(removedIds)
      setStockDrafts(current => Object.fromEntries(
        Object.entries(current).filter(([id]) => !removed.has(id))
      ))
    }
    await fetchCatalog()
    await fetchInventory(inventoryFilters)
  }

  async function handleApplyBulkAction() {
    if (!selectedCount || bulkSaving) return
    const changes = bulkAction === 'published'
      ? { published: true }
      : bulkAction === 'unpublished'
        ? { published: false }
        : { [bulkAction]: Number(bulkPrice) }

    if ((bulkAction === 'precio_venta' || bulkAction === 'precio_costo') && (bulkPrice === '' || !Number.isFinite(Number(bulkPrice)) || Number(bulkPrice) < 0)) {
      setBulkError('Ingresá un precio válido mayor o igual a cero.')
      return
    }

    setBulkSaving(true)
    setBulkError('')
    try {
      await applyInventoryBatch([...selectedIds], 'update', changes)
      setBulkPrice('')
      await refreshAfterBulkAction()
    } catch (err) {
      setBulkError(err.message || 'No se pudo aplicar el cambio')
    } finally {
      setBulkSaving(false)
    }
  }

  async function handleBulkDelete() {
    if (!selectedCount || bulkSaving) return
    const idsToDelete = [...selectedIds]
    setBulkSaving(true)
    setBulkError('')
    try {
      await applyInventoryBatch(idsToDelete, 'delete')
      setBulkDeleteOpen(false)
      await refreshAfterBulkAction(idsToDelete)
    } catch (err) {
      setBulkDeleteOpen(false)
      setBulkError(err.message || 'No se pudieron eliminar los productos')
    } finally {
      setBulkSaving(false)
    }
  }

  function changeSort(column) {
    setPage(1)
    if (sortBy === column) setSortDir(current => current === 'asc' ? 'desc' : 'asc')
    else {
      setSortBy(column)
      setSortDir(['product', 'supplier', 'published'].includes(column) ? 'asc' : 'desc')
    }
  }

  function resetFilters() {
    setSearch('')
    setSupplier('Todos')
    setPublicationFilter('Todos')
    setStockStatus('Todos')
    setStockMin('')
    setStockMax('')
    setCostMin('')
    setCostMax('')
    setSaleMin('')
    setSaleMax('')
    setSortBy('updated')
    setSortDir('desc')
    setPage(1)
  }

  const hasFilters = Boolean(
    search || supplierFilter !== 'Todos' || publicationFilter !== 'Todos' ||
    stockStatus !== 'Todos' || stockMin || stockMax || costMin || costMax || saleMin || saleMax ||
    sortBy !== 'updated' || sortDir !== 'desc'
  )

  function sortHeader(column, label) {
    const active = sortBy === column
    return (
      <button
        type="button"
        onClick={() => changeSort(column)}
        title={`Ordenar por ${label.toLowerCase()}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: 0, margin: 0,
          border: 'none', background: 'transparent', cursor: 'pointer',
          color: active ? C.red : C.text3, font: `600 10px ${ADMIN_FONT}`,
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}
      >
        {label}<span aria-hidden="true" style={{ fontSize: 11 }}>{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    )
  }

  return (
    <div style={{ fontFamily: ADMIN_FONT }}>
      {/* Carga de excel */}
      <h3 style={sectionTitle}>Importaciones y movimientos de stock</h3>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 8, marginBottom: 16, alignItems: 'start',
      }}>
        {/* Importaciones temporalmente ocultas: stock general, ventas del local y compras a proveedor. */}
        <ImportUploadCard
          label="Precios proveedor"
          hint="Subí varios Excel o una carpeta completa. El nombre de cada archivo se usa como proveedor y los productos se crean sin publicar."
          disabled={importLoading || priceParsing}
          busyLabel={priceParsing ? 'Creando productos...' : 'Importando...'}
          onFiles={handlePriceFilesUpload}
          multiple
          allowDirectory
        />
        <ImportUploadCard
          label="Catálogo con imágenes"
          hint="Elegí el proveedor y subí su PDF. Vas a revisar qué foto se insertará en cada producto antes de guardar."
          accept=".pdf"
          disabled={importLoading || catalogParsing || !catalogSupplier}
          busyLabel={catalogParsing ? 'Extrayendo imágenes...' : !catalogSupplier ? 'Elegí un proveedor' : 'Importando...'}
          onFile={handleCatalogImagesUpload}
        >
          <select
            value={catalogSupplier}
            onChange={event => { setCatalogSupplier(event.target.value); setCatalogError(null) }}
            aria-label="Proveedor del catálogo"
            style={{ ...inp, padding: '6px 8px', fontSize: 11, marginTop: 2 }}
          >
            <option value="">Seleccionar proveedor...</option>
            {[...inventorySuppliers].sort(PRICE_CODE_COLLATOR.compare).map(supplier => (
              <option key={supplier} value={supplier}>{supplier}</option>
            ))}
          </select>
        </ImportUploadCard>
        <CurrencySettingsCard settings={currencySettings} onSave={handleCurrencyRateSave} />
      </div>

      {invoiceError && (
        <DismissibleErrorNotice key={invoiceError}>
          {invoiceError}
        </DismissibleErrorNotice>
      )}

      {invoiceParsed && (
        <InvoiceReviewModal
          parsed={invoiceParsed}
          onConfirm={handleInvoiceConfirm}
          onClose={() => setInvoiceParsed(null)}
        />
      )}

      {catalogError && (
        <DismissibleErrorNotice key={catalogError}>
          {catalogError}
        </DismissibleErrorNotice>
      )}

      {catalogParsed && (
        <CatalogImagesReviewModal
          parsed={catalogParsed}
          onConfirm={handleCatalogImagesConfirm}
          onUploadImage={uploadCatalogPreviewImage}
          onClose={() => setCatalogParsed(null)}
        />
      )}

      {importError && (
        <DismissibleErrorNotice key={importError}>
          {importError}
        </DismissibleErrorNotice>
      )}

      {showResult && importResult && (
        <div style={{ background: C.greenLight, border: `1px solid ${C.green}`, borderRadius: 8, padding: '14px 18px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.green }}>Importación completa</span>
            <button onClick={() => setShowResult(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: 14 }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {importResult.totalFiles !== undefined && <span style={pill('#EEF2FF', '#4338CA')}>{importResult.processedFiles} de {importResult.totalFiles} archivos procesados</span>}
            {importResult.totalRows !== undefined && <span style={pill('#F3F4F6', C.text3)}>{importResult.totalRows} filas leídas</span>}
            {importResult.created !== undefined && <span style={pill(C.greenLight, C.green)}>{importResult.created} creados</span>}
            {importResult.updated !== undefined && <span style={pill(C.amberLight, C.amberDark)}>{importResult.updated} actualizados</span>}
            {importResult.imagesSaved !== undefined && <span style={pill('#EEF2FF', '#4338CA')}>{importResult.imagesSaved} imágenes guardadas</span>}
            {!!importResult.imagesRemoved && <span style={pill(C.redLight, C.red)}>{importResult.imagesRemoved} imágenes eliminadas</span>}
            {!!importResult.skipped && <span style={pill('#F3F4F6', C.text3)}>{importResult.skipped} omitidos</span>}
          </div>
          {!!importResult.files?.length && (
            <div style={{ display: 'grid', gap: 5, marginTop: 10 }}>
              {importResult.files.map(file => (
                <div key={file.fileName} style={{ fontSize: 11.5, color: C.text2 }}>
                  <strong>{file.fileName}</strong> → {file.supplier} · {file.currency} · {file.created} creados
                  {file.existingCount ? ` · ${file.existingCount} ya existían` : ''}
                  {file.duplicateRows ? ` · ${file.duplicateRows} repetidos` : ''}
                  {file.invalidRows ? ` · ${file.invalidRows} filas inválidas` : ''}
                </div>
              ))}
            </div>
          )}
          {!!importResult.failedFiles?.length && (
            <div style={{ marginTop: 10, color: C.red, fontSize: 11.5 }}>
              {importResult.failedFiles.map(file => (
                <div key={file.fileName}><strong>{file.fileName}:</strong> {file.error}</div>
              ))}
            </div>
          )}
          {!!importResult.unmatched?.length && (
            <div style={{ marginTop: 10 }}>
              <p style={{ fontSize: 12, color: C.text2, fontWeight: 600, margin: '0 0 4px' }}>
                Códigos no encontrados en el inventario ({importResult.unmatched.length}):
              </p>
              <p style={{ fontSize: 11.5, color: C.text3, margin: 0 }}>
                {importResult.unmatched.map(u => `${u.codigo} (×${u.cantidad})`).join(', ')}
              </p>
            </div>
          )}
          {importResult.header && (
            <p style={{ fontSize: 11.5, color: C.text3, marginTop: 10 }}>
              Datos informativos del pedido: {Object.entries(importResult.header).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'sin datos'}
            </p>
          )}
        </div>
      )}

      {/* Tabla unificada de productos */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <h3 style={{ ...sectionTitle, margin: 0 }}>
            Todos los productos{inventoryTotal ? <span style={{ fontFamily: ADMIN_FONT }}> ({inventoryTotal})</span> : ''}
          </h3>
          <SupplierToolbar
            supplierNames={inventorySuppliers}
            settings={supplierSettings}
            inventory={inventory}
            selectedSupplier={supplierFilter}
            usdArsRate={usdArsRate}
            onSelect={supplier => { setSupplier(supplier); setPage(1) }}
            onSave={handleSupplierCurrencySave}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {pendingStockCount > 0 && (
            <>
              <button
                type="button"
                onClick={() => setStockDrafts({})}
                disabled={stockSaving}
                style={{ ...outlineBtn, opacity: stockSaving ? 0.5 : 1 }}
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={handleSaveStockChanges}
                disabled={stockSaving}
                style={{ ...outlineBtn, borderColor: C.green, color: C.green, opacity: stockSaving ? 0.65 : 1 }}
              >
                {stockSaving ? 'Guardando...' : `Guardar stock (${pendingStockCount})`}
              </button>
            </>
          )}
          <button onClick={() => setAddOpen(true)} style={{ ...solidBtn, background: C.red, color: '#fff' }}>
            + Nuevo producto
          </button>
        </div>
      </div>

      {stockSaveError && (
        <DismissibleErrorNotice key={stockSaveError} marginBottom={16} fontSize={12.5}>
          {stockSaveError}
        </DismissibleErrorNotice>
      )}

      {inventoryError && (
        <DismissibleErrorNotice key={inventoryError} marginBottom={16}>
          {inventoryError} — asegurate de que el backend esté corriendo.
        </DismissibleErrorNotice>
      )}

      {selectedCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '11px 14px', marginBottom: 12, borderRadius: 9,
          border: `1px solid ${C.border}`, background: '#F8FAFC',
        }}>
          <strong style={{ fontSize: 12.5, color: C.ink }}>{selectedCount} seleccionado{selectedCount === 1 ? '' : 's'}</strong>
          {selectedCount < inventoryTotal && (
            <button type="button" onClick={selectAllFiltered} disabled={bulkSaving} style={{ ...outlineBtn, padding: '6px 10px' }}>
              Seleccionar los {inventoryTotal} resultados
            </button>
          )}
          <button type="button" onClick={() => setSelectedIds(new Set())} disabled={bulkSaving} style={{ ...outlineBtn, padding: '6px 10px' }}>
            Deseleccionar
          </button>
          <span style={{ width: 1, alignSelf: 'stretch', minHeight: 30, background: C.border }} />
          <select value={bulkAction} onChange={event => { setBulkAction(event.target.value); setBulkError('') }} disabled={bulkSaving} style={{ ...headerFilterControl, width: 170 }}>
            <option value="precio_venta">Precio de venta</option>
            <option value="precio_costo">Precio de costo</option>
            <option value="published">Publicar en tienda</option>
            <option value="unpublished">Quitar de tienda</option>
          </select>
          {(bulkAction === 'precio_venta' || bulkAction === 'precio_costo') && (
            <input
              type="number" min="0" step="0.01" placeholder="Precio común"
              value={bulkPrice} onChange={event => setBulkPrice(event.target.value)} disabled={bulkSaving}
              style={{ ...headerFilterControl, width: 140 }}
            />
          )}
          <button type="button" onClick={handleApplyBulkAction} disabled={bulkSaving} style={{ ...solidBtn, background: C.green, color: '#fff', opacity: bulkSaving ? 0.65 : 1 }}>
            {bulkSaving ? 'Aplicando...' : 'Aplicar'}
          </button>
          <button type="button" onClick={() => setBulkDeleteOpen(true)} disabled={bulkSaving} style={{ ...outlineBtn, marginLeft: 'auto', borderColor: C.red, color: C.red }}>
            Eliminar seleccionados
          </button>
        </div>
      )}

      {bulkError && (
        <DismissibleErrorNotice key={bulkError} marginBottom={12} fontSize={12.5}>
          {bulkError}
        </DismissibleErrorNotice>
      )}

      {!inventoryError && (
        <div style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, overflowX: 'auto' }}>
          <div style={{
                display: 'grid', gridTemplateColumns: '30px 56px minmax(250px, 1fr) 150px 160px 160px 180px 130px 120px', minWidth: 1310,
                gap: 8, padding: '10px 14px', borderBottom: `1px solid ${C.hairline}`, background: C.paper,
                alignItems: 'start',
              }}>
                <input
                  ref={selectPageRef}
                  type="checkbox"
                  checked={allResultsSelected}
                  onChange={toggleAllSelection}
                  disabled={!pageIds.length || bulkSaving}
                  aria-label={allResultsSelected ? 'Deseleccionar todos los resultados' : 'Seleccionar todos los resultados'}
                  title={allResultsSelected ? 'Deseleccionar todos los resultados' : `Seleccionar los ${inventoryTotal} resultados`}
                  style={{ width: 16, height: 16, marginTop: 2, accentColor: C.red, cursor: 'pointer' }}
                />
                <span style={{ ...lbl, paddingTop: 2 }}>Foto</span>
                <div style={{ display: 'grid', gap: 7 }}>
                  {sortHeader('product', 'Producto')}
                  <input
                    type="search"
                    placeholder="Código, nombre o descripción"
                    value={search}
                    onChange={event => { setSearch(event.target.value); setPage(1) }}
                    style={headerFilterControl}
                  />
                </div>
                <div style={{ display: 'grid', gap: 7 }}>
                  {sortHeader('supplier', 'Proveedor')}
                  <div style={{ ...headerFilterControl, display: 'flex', alignItems: 'center', color: supplierFilter === 'Todos' ? C.muted : C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {supplierFilter === 'Todos' ? 'Filtro arriba' : supplierFilter}
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 7 }}>
                  {sortHeader('cost', 'P. costo')}
                  <div style={headerRangeRow}>
                    <input type="number" min="0" placeholder="Mín." value={costMin} onChange={event => { setCostMin(event.target.value); setPage(1) }} style={headerFilterControl} />
                    <input type="number" min="0" placeholder="Máx." value={costMax} onChange={event => { setCostMax(event.target.value); setPage(1) }} style={headerFilterControl} />
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 7 }}>
                  {sortHeader('sale', 'P. venta')}
                  <div style={headerRangeRow}>
                    <input type="number" min="0" placeholder="Mín." value={saleMin} onChange={event => { setSaleMin(event.target.value); setPage(1) }} style={headerFilterControl} />
                    <input type="number" min="0" placeholder="Máx." value={saleMax} onChange={event => { setSaleMax(event.target.value); setPage(1) }} style={headerFilterControl} />
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 7 }}>
                  {sortHeader('stock', 'Stock')}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 0.8fr', gap: 4 }}>
                    <select value={stockStatus} onChange={event => { setStockStatus(event.target.value); setPage(1) }} style={headerFilterControl}>
                      <option value="Todos">Todos</option>
                      <option value="out">Sin stock</option>
                      <option value="low">Bajo (1-5)</option>
                      <option value="available">Con stock</option>
                    </select>
                    <input type="number" min="0" placeholder="Mín." value={stockMin} onChange={event => { setStockMin(event.target.value); setPage(1) }} style={headerFilterControl} />
                    <input type="number" min="0" placeholder="Máx." value={stockMax} onChange={event => { setStockMax(event.target.value); setPage(1) }} style={headerFilterControl} />
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 7 }}>
                  {sortHeader('published', 'Tienda')}
                  <select value={publicationFilter} onChange={event => { setPublicationFilter(event.target.value); setPage(1) }} style={headerFilterControl}>
                    <option value="Todos">Todos</option>
                    <option value="Publicados">Publicados</option>
                    <option value="Sin publicar">Sin publicar</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gap: 7 }}>
                  <span style={{ ...lbl, paddingTop: 2 }}>Acciones</span>
                  <button
                    type="button"
                    onClick={resetFilters}
                    disabled={!hasFilters}
                    style={{ ...outlineBtn, minHeight: 31, padding: '5px 8px', opacity: hasFilters ? 1 : 0.45 }}
                  >
                    Limpiar
                  </button>
                </div>
          </div>
          {inventoryLoading ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: C.muted, fontSize: 14 }}>Cargando...</div>
          ) : inventory.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: C.muted, fontSize: 14 }}>
              No se encontraron productos. Podés cambiar los filtros o usar “Limpiar”.
            </div>
          ) : (
            <>
              {inventory.map((p, i) => {
                const stockDraft = stockDrafts[p.id]
                const displayedStock = stockDraft?.value ?? p.stock
                const costArs = p.precio_costo != null ? Number(p.precio_costo) : p.precio_costo_usd != null ? Number(p.precio_costo_usd) * usdArsRate : null
                const costUsd = p.precio_costo_usd != null ? Number(p.precio_costo_usd) : p.precio_costo != null ? Number(p.precio_costo) / usdArsRate : null
                const saleArs = p.precio_venta != null ? Number(p.precio_venta) : null
                const saleUsd = p.precio_venta_usd != null ? Number(p.precio_venta_usd) : saleArs != null ? saleArs / usdArsRate : null
                return (
                <div
                  key={p.id}
                  onClick={() => openProduct(p)}
                  onMouseEnter={() => setHoveredProductId(p.id)}
                  onMouseLeave={() => setHoveredProductId(null)}
                  style={{
                    display: 'grid', gridTemplateColumns: '30px 56px minmax(250px, 1fr) 150px 160px 160px 180px 130px 120px', minWidth: 1310,
                    gap: 8, padding: '10px 14px', alignItems: 'center',
                    borderBottom: i < inventory.length - 1 ? `1px solid ${C.hairline}` : 'none',
                    background: selectedIds.has(p.id) ? '#FFF5F5' : hoveredProductId === p.id ? '#F9FAFB' : C.white,
                    cursor: 'pointer', transition: 'background 0.15s', outline: 'none',
                  }}
                >
                  <div onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleProductSelection(p.id)}
                      disabled={bulkSaving}
                      aria-label={`Seleccionar ${p.name || p.descripcion || p.codigo}`}
                      style={{ width: 16, height: 16, accentColor: C.red, cursor: 'pointer' }}
                    />
                  </div>
                  {p.image_url ? (
                    <img src={p.image_url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: `1px solid ${C.hairline}` }} />
                  ) : (
                    <div style={{ width: 44, height: 44, borderRadius: 6, background: C.hairline, display: 'grid', placeItems: 'center', color: C.muted, fontSize: 16 }}>□</div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name || p.descripcion || 'Sin nombre'}
                    </div>
                    <div style={{ fontSize: 10.5, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.codigo}{p.category ? ` · ${p.category}` : ''}
                    </div>
                  </div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: C.text3, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.supplier || 'OTRO'}</span>
                    <small style={pill(p.price_currency === 'USD' ? '#EEF2FF' : '#F3F4F6', p.price_currency === 'USD' ? '#4338CA' : C.text3)}>{p.price_currency || 'ARS'}</small>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', fontSize: 12.5, color: C.text2, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    <span>{costArs != null ? fmt(costArs) : '—'}</span>
                    {costUsd != null && <small style={{ color: C.muted, fontSize: 10.5 }}>{fmtUsd(costUsd)}</small>}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', fontSize: 13, fontWeight: 600, color: C.ink, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    <span>{saleArs != null ? fmt(saleArs) : '—'}</span>
                    {saleUsd != null && <small style={{ color: C.muted, fontSize: 10.5, fontWeight: 400 }}>{fmtUsd(saleUsd)}</small>}
                  </span>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    fontSize: 12, fontWeight: 500, color: C.text2,
                  }} title={stockDraft ? 'Cambio de stock pendiente de guardar' : 'Stock guardado'} onClick={event => event.stopPropagation()}>
                    <span aria-hidden="true" style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: stockDraft ? C.amber : displayedStock <= 0 ? C.red : displayedStock <= 5 ? C.amber : C.green,
                    }} />
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={displayedStock}
                      disabled={stockSaving}
                      aria-label={`Stock de ${p.name || p.descripcion || p.codigo}`}
                      onChange={event => queueStockValue(p, event.target.value)}
                      onBlur={() => restoreEmptyStockDraft(p)}
                      onKeyDown={event => {
                        event.stopPropagation()
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          event.currentTarget.blur()
                          handleSaveStockChanges()
                        }
                      }}
                      style={{
                        width: 78, height: 31, boxSizing: 'border-box', padding: '4px 7px',
                        border: `1px solid ${stockDraft ? C.amber : C.border}`, borderRadius: 6,
                        background: stockDraft ? C.amberLight : C.white, color: C.ink,
                        font: `600 12px ${ADMIN_FONT}`, textAlign: 'center', outline: 'none',
                      }}
                    />
                  </div>
                  <span style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    fontSize: 10.5, fontWeight: 500, color: C.text2,
                  }}>
                    <span aria-hidden="true" style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: p.published ? C.green : C.muted,
                    }} />
                    {p.published ? 'Publicado' : 'Borrador'}
                  </span>
                  <div
                    onClick={event => event.stopPropagation()}
                    onKeyDown={event => event.stopPropagation()}
                    style={{ display: 'flex', gap: 4, flexShrink: 0 }}
                  >
                    <TooltipIconButton
                      label="Editar producto"
                      color={C.amberDark}
                      disabled={stockSaving}
                      onClick={() => openProduct(p)}
                    >✎</TooltipIconButton>
                    <TooltipIconButton label="Eliminar producto" color={C.red} disabled={stockSaving} onClick={() => setConfirmId(p.id)}>✕</TooltipIconButton>
                  </div>
                </div>
                )
              })}
            </>
          )}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 16 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ ...outlineBtn, cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}>
            Anterior
          </button>
          <span style={{ fontSize: 12, color: C.text3 }}>Página {page} de {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ ...outlineBtn, cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.5 : 1 }}>
            Siguiente
          </button>
        </div>
      )}

      {(editItem || addOpen) && (
        <ProductModal
          product={addOpen ? null : draftFromInventoryRow(editItem)}
          onSave={handleSave}
          onClose={() => { setEditItem(null); setAddOpen(false) }}
        />
      )}

      {confirmId !== null && (
        <ConfirmModal
          message="¿Eliminar definitivamente este producto? También dejará de mostrarse en la tienda. Esta acción no se puede deshacer."
          onConfirm={() => handleDelete(confirmId)}
          onCancel={() => setConfirmId(null)}
        />
      )}

      {bulkDeleteOpen && (
        <ConfirmModal
          message={`¿Eliminar definitivamente ${selectedCount} producto${selectedCount === 1 ? '' : 's'}? También dejarán de mostrarse en la tienda. Esta acción no se puede deshacer.`}
          onConfirm={handleBulkDelete}
          onCancel={() => setBulkDeleteOpen(false)}
        />
      )}
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'overview',     label: 'Resumen',        Icon: BarChartIcon },
  { id: 'products',     label: 'Productos',      Icon: GridIcon },
  { id: 'categories',   label: 'Categorías',     Icon: FolderIcon },
  { id: 'store',        label: 'Tienda',         Icon: StoreIcon },
  { id: 'offers',       label: 'Ofertas',        Icon: TagIcon },
  { id: 'orders',       label: 'Pedidos',        Icon: ClipboardIcon },
]

export default function AdminDashboard() {
  const { products, updateProduct, deleteProduct, logout } = useAdmin()
  const navigate  = useNavigate()
  const [tab, setTab]           = useState('overview')
  const mainRef = useRef(null)

  function changeTab(nextTab) {
    setTab(nextTab)
    requestAnimationFrame(() => {
      mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  return (
    <div style={{
      display: 'flex', minHeight: '100vh',
      fontFamily: ADMIN_FONT,
      fontWeight: 400,
    }}>
      {/* ── Sidebar ───────────────────────────────────────── */}
      <aside style={{
        width: C.sidebar,
        background: C.white,
        borderRight: `1px solid ${C.border}`,
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100vh',
        flexShrink: 0,
      }}>
        {/* Brand */}
        <div style={{ padding: '18px 16px 16px', borderBottom: `1px solid ${C.hairline}` }}>
          <FenixLogo height={76} />
          <div style={{
            fontSize: 9,
            color: C.muted,
            letterSpacing: '0.18em',
            marginTop: 7,
            textTransform: 'uppercase',
            fontFamily: ADMIN_FONT,
          }}>
            Administración
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '9px 7px' }}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => changeTab(item.id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                padding: '8px 14px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                background: tab === item.id ? 'rgba(204,0,0,0.08)' : 'transparent',
                color: tab === item.id ? C.red : C.text3,
                fontSize: 12.5,
                fontWeight: tab === item.id ? 600 : 400,
                fontFamily: 'inherit',
                marginBottom: 2,
                transition: 'all 0.15s',
                textAlign: 'left',
                letterSpacing: '0.04em',
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Bottom actions */}
        <div style={{ padding: '9px 7px 18px', borderTop: `1px solid ${C.hairline}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button
            onClick={() => navigate('/')}
            style={{ ...sidebarAction, color: C.text3 }}
          >
            Ver tienda
          </button>
          <button
            onClick={logout}
            style={{ ...sidebarAction, color: C.red }}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────── */}
      <main ref={mainRef} style={{
        flex: 1,
        background: C.paper,
        minHeight: '100vh',
        padding: '28px 32px',
        overflow: 'auto',
      }}>
        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{
            fontFamily: ADMIN_FONT,
            fontSize: 27,
            fontWeight: 500,
            color: C.ink,
            margin: 0,
            letterSpacing: '0.01em',
          }}>
            {NAV_ITEMS.find(i => i.id === tab)?.label}
          </h1>
          <div style={{ width: 32, height: 3, background: C.red, borderRadius: 2, marginTop: 8 }} />
        </div>

        {/* Tab content */}
        {tab === 'overview' && (
          <OverviewDashboard products={products} onNavigate={changeTab} />
        )}
        {tab === 'products' && (
          <UnifiedProductsTab />
        )}
        {tab === 'categories' && (
          <CategoriesTab />
        )}
        {tab === 'store' && (
          <StoreTab
            products={products}
            onUpdate={updateProduct}
            onDelete={deleteProduct}
          />
        )}
        {tab === 'offers' && (
          <OffersTab
            products={products}
            onUpdate={updateProduct}
          />
        )}
        {tab === 'orders' && (
          <OrdersTab />
        )}
      </main>
    </div>
  )
}

const sidebarAction = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '7px 12px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: 11.5,
  fontFamily: 'inherit',
  borderRadius: 6,
  textAlign: 'left',
  letterSpacing: '0.04em',
  transition: 'color 0.15s',
}
