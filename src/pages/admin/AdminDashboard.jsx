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

// ── FormField — input reutilizable para los modales de producto/inventario ──
// Definido a nivel de módulo (no dentro del componente que lo usa): si se
// redefine en cada render, React lo trata como un tipo de componente distinto
// y remonta el <input> en cada tecla, haciendo que pierda el foco todo el
// tiempo y parezca que "no deja escribir".
function FormField({ label, value, onChange, type = 'text', placeholder = '', span = 1 }) {
  return (
    <div style={{ gridColumn: `span ${span}`, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={lbl}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        min={type === 'number' ? 0 : undefined}
        style={inp}
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
// por el servidor. El producto debe existir para asociar el archivo a su ID.
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
        {productId ? (
          <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} style={{ ...outlineBtn, fontSize: compact ? 10.5 : 11.5, padding: compact ? '5px 8px' : '7px 12px', opacity: uploading ? 0.6 : 1 }}>
            {uploading ? 'Subiendo...' : 'Subir archivo'}
          </button>
        ) : (
          <span style={{ fontSize: compact ? 10 : 11, color: C.muted }}>Guardá primero el producto para subir la imagen</span>
        )}
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
// la tienda) — es solo un punto de partida, siempre editable a mano.
function guessCategory(grupo, subgrupo) {
  const text = `${grupo || ''} ${subgrupo || ''}`.toUpperCase()
  if (/LED|LAMPAR|LUMINAR|ILUMINA|REFLECTOR|APLIQUE|PLAFON/.test(text)) return 'Iluminación'
  if (/HERRAMIENT|TALADRO|PINZA|DESTORNILL|SOLDADOR|AMOLADORA|LLAVE/.test(text)) return 'Herramientas'
  if (/CONTACTOR|GUARDAMOTOR|VARIADOR|AUTOMAT|RELE|PLC/.test(text)) return 'Automatización Industrial'
  return 'Electricidad'
}

const EMPTY = {
  codigo: '', supplier: 'OTRO', inventoryDescription: '', grupo: '', subgrupoInterno: '', medida: '',
  priceCost: '', priceWithTax: '',
  name: '', category: CATS[0], subcategory: '', productType: '',
  price: '', originalPrice: '',
  description: '', image: '', hoverImage: '',
  inStock: true, stock: '', colors: [], sizes: [],
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
    grupo:       inv.grupo || '',
    subgrupoInterno: inv.subgrupo || '',
    medida:      inv.medida || '',
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
    colors:      inv.color_options || [],
    sizes:       inv.size_options || [],
    published:   Boolean(inv.published),
  }
}

function toUnifiedProductPayload(data) {
  return {
    codigo: data.codigo,
    supplier: data.supplier || 'OTRO',
    descripcion: data.inventoryDescription || null,
    grupo: data.grupo || null,
    subgrupo: data.subgrupoInterno || null,
    medida: data.medida || null,
    precio_costo: data.priceCost,
    precio_venta: data.price,
    precio_iva: data.priceWithTax,
    stock: data.stock === '' ? 0 : Number(data.stock),
    name: data.name?.trim() || null,
    category: data.category || null,
    subcategory: data.subcategory || null,
    product_type: data.productType || null,
    description_larga: data.description?.trim() || null,
    original_price: data.originalPrice ?? null,
    image_url: data.image || null,
    hover_image_url: data.hoverImage || null,
    color_options: data.colors || [],
    size_options: data.sizes || [],
    color_temp: data.colorTemp || null,
    ip_rating: data.ipRating || null,
    watts: data.watts || null,
    material: data.material || null,
    published: Boolean(data.published),
  }
}

function ProductModal({ product, onSave, onClose }) {
  const isNew = !product
  const [form, setForm] = useState(() => isNew ? EMPTY : {
    ...product,
    price:         String(product.price ?? ''),
    originalPrice: String(product.originalPrice ?? ''),
    priceCost:     String(product.priceCost ?? ''),
    priceWithTax:  String(product.priceWithTax ?? ''),
    stock:         String(product.stock ?? ''),
    colors:        product.colors || [],
    sizes:         product.sizes || [],
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const valid = form.codigo.trim() && (!form.published || (form.name.trim() && form.price && Number(form.price) > 0))
  const subOptions = getSubcategoryOptions(form.category).map(node => node.label)
  const typeOptions = getProductTypeOptions(form.category, form.subcategory).map(node => node.label)

  const setColor = (idx, key, value) => setForm(f => ({
    ...f,
    colors: f.colors.map((c, i) => i === idx ? { ...c, [key]: value } : c),
  }))
  const addColor = () => setForm(f => ({ ...f, colors: [...f.colors, { name: '', hex: '#000000', image: '' }] }))
  const removeColor = (idx) => setForm(f => ({ ...f, colors: f.colors.filter((_, i) => i !== idx) }))

  const setSize = (idx, key, value) => setForm(f => ({
    ...f,
    sizes: f.sizes.map((s, i) => i === idx ? { ...s, [key]: value } : s),
  }))
  const addSize = () => setForm(f => ({ ...f, sizes: [...f.sizes, { label: '' }] }))
  const removeSize = (idx) => setForm(f => ({ ...f, sizes: f.sizes.filter((_, i) => i !== idx) }))

  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!valid || saving) return
    const out = { ...form, price: form.price === '' ? null : Number(form.price) }
    out.codigo = form.codigo.trim()
    out.supplier = form.supplier.trim().toUpperCase() || 'OTRO'
    out.inventoryDescription = form.inventoryDescription.trim()
    out.grupo = form.grupo.trim()
    out.subgrupoInterno = form.subgrupoInterno.trim()
    out.medida = form.medida.trim()
    out.priceCost = form.priceCost === '' ? null : Number(form.priceCost)
    out.priceWithTax = form.priceWithTax === '' ? null : Number(form.priceWithTax)
    if (form.originalPrice) out.originalPrice = Number(form.originalPrice)
    else delete out.originalPrice
    if (form.stock !== '') {
      out.stock   = Number(form.stock)
      out.inStock = out.stock > 0
    } else {
      delete out.stock
    }
    out.colors = form.colors.filter(c => c.name.trim() && c.image.trim())
    out.sizes  = form.sizes.filter(s => s.label.trim())
    setSaving(true)
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
      <div style={{
        background: C.paper, borderRadius: 12,
        width: '100%', maxWidth: 780,
        maxHeight: '92vh', overflowY: 'auto',
        padding: 32, boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontFamily: ADMIN_FONT, fontSize: 22, color: C.ink, margin: 0, fontWeight: 500 }}>
            {isNew ? 'Nuevo producto' : 'Editar producto'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <h3 style={{ ...sectionTitle, gridColumn: 'span 2', margin: '0 0 2px' }}>Datos internos</h3>
          <FormField label="Código *" value={form.codigo} onChange={v => set('codigo', v)} placeholder="ej: ALC-PO043" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={lbl}>Proveedor</label>
            <input list="supplier-options" value={form.supplier} onChange={e => set('supplier', e.target.value)} placeholder="ej: ALCIDES" style={inp} />
            <datalist id="supplier-options">{SUPPLIER_FILTERS.filter(s => s !== 'Todos').map(s => <option key={s} value={s} />)}</datalist>
          </div>
          <FormField label="Descripción interna" value={form.inventoryDescription} onChange={v => set('inventoryDescription', v)} span={2} />
          <FormField label="Marca / grupo" value={form.grupo} onChange={v => set('grupo', v)} />
          <FormField label="Subgrupo interno" value={form.subgrupoInterno} onChange={v => set('subgrupoInterno', v)} />
          <FormField label="Medida" value={form.medida} onChange={v => set('medida', v)} />
          <FormField label="Stock" value={form.stock} onChange={v => set('stock', v)} type="number" />
          <FormField label="Precio costo" value={form.priceCost} onChange={v => set('priceCost', v)} type="number" />
          <FormField label="Precio de venta" value={form.price} onChange={v => set('price', v)} type="number" />
          <FormField label="Precio con IVA" value={form.priceWithTax} onChange={v => set('priceWithTax', v)} type="number" />

          <div style={{
            gridColumn: 'span 2', marginTop: 10, padding: 16,
            background: '#F9FAFB', border: `1px solid ${C.border}`, borderRadius: 8,
          }}>
            <h3 style={{ ...sectionTitle, margin: '0 0 14px' }}>Información para la tienda online</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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
                  <Toggle value={form.published} onChange={v => set('published', v)} />
                  <span style={{ fontSize: 13, color: form.published ? C.green : C.text3, fontWeight: 600 }}>
                    {form.published ? 'Publicado' : 'Sin publicar (borrador)'}
                  </span>
                </div>
              </div>
            </div>
          </div>
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
            Si cargás colores, el comprador va a poder elegir uno en la página del producto y la foto va a cambiar según el color seleccionado. Si no cargás ninguno, el producto se muestra con una sola foto fija.
          </p>

          {form.colors.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 }}>
              {form.colors.map((c, idx) => (
                <div key={idx} style={{
                  display: 'grid', gridTemplateColumns: '38px minmax(130px, 1fr) minmax(220px, 1.5fr) auto', gap: 8, alignItems: 'center',
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

        {/* Variantes de medida */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={lbl}>Medidas (opcional)</label>
            <button type="button" onClick={addSize} style={{ ...outlineBtn, padding: '5px 12px', fontSize: 11 }}>
              + Agregar medida
            </button>
          </div>
          <p style={{ fontSize: 11.5, color: C.muted, margin: '0 0 10px' }}>
            Si el producto viene en distintas medidas (ej: un cable de 5 m o de 10 m), cargalas acá y el comprador va a poder elegir una en la página del producto. Si no cargás ninguna, se vende con una sola medida fija.
          </p>

          {form.sizes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 }}>
              {form.sizes.map((s, idx) => (
                <div key={idx} style={{
                  display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center',
                  padding: 8, background: C.white, border: `1px solid ${C.border}`, borderRadius: 6,
                }}>
                  <input
                    type="text"
                    value={s.label}
                    onChange={e => setSize(idx, 'label', e.target.value)}
                    placeholder="Medida (ej: 5 m, 10 m, 2.5 mm)"
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

        {/* Actions */}
        <div style={{
          display: 'flex', gap: 10, justifyContent: 'flex-end',
          marginTop: 28, paddingTop: 20, borderTop: `1px solid ${C.border}`,
        }}>
          <button onClick={onClose} style={outlineBtn}>Cancelar</button>
          <button
            onClick={handleSave}
            disabled={!valid || saving}
            style={{ ...solidBtn, background: valid && !saving ? C.red : '#ddd', color: valid && !saving ? '#fff' : '#aaa', cursor: valid && !saving ? 'pointer' : 'not-allowed' }}
          >
            {saving ? 'Guardando...' : isNew ? '+ Agregar producto' : 'Guardar cambios'}
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

// ── ProductsTab ───────────────────────────────────────────────────────────────
function ProductsTab({ products, onUpdate, onAdd, onDelete }) {
  const [search, setSearch]     = useState('')
  const [catFilter, setCat]     = useState('Todas')
  const [editProduct, setEdit]  = useState(null)
  const [addOpen, setAddOpen]   = useState(false)
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

  return (
    <div>
      {/* Stats bar + add button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span style={pill('#F3F4F6', C.text3)}>{products.length} productos</span>
          {outOfStock > 0 && <span style={pill(C.redLight, C.red)}>{outOfStock} sin stock</span>}
          {withOffer > 0 && <span style={pill(C.amberLight, C.amberDark)}>{withOffer} con oferta</span>}
        </div>
        <button onClick={() => setAddOpen(true)} style={{ ...solidBtn, background: C.red, color: '#fff' }}>
          + Nuevo producto
        </button>
      </div>

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

            {/* Stock toggle + count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, minWidth: 120 }}>
              <Toggle
                size="sm"
                value={p.inStock}
                onChange={v => onUpdate(p.id, { inStock: v })}
              />
              <span style={{ fontSize: 12, color: p.inStock ? C.green : C.red, fontWeight: 600, width: 56 }}>
                {p.inStock ? 'En stock' : 'Sin stock'}
              </span>
              {p.stock !== undefined && (
                <input
                  type="number"
                  value={p.stock}
                  min={0}
                  onChange={e => {
                    const val = Number(e.target.value)
                    onUpdate(p.id, { stock: val, inStock: val > 0 })
                  }}
                  title="Cantidad en stock"
                  style={{
                    width: 52, border: `1px solid ${C.border}`, borderRadius: 5,
                    padding: '3px 6px', fontSize: 12, textAlign: 'center',
                    color: C.ink, background: C.paper, fontFamily: 'inherit',
                    outline: 'none',
                  }}
                />
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => setEdit(p)}
                title="Editar"
                style={{ ...iconBtn, background: C.amberLight, color: C.amberDark }}
              >
                ✎
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
      {(editProduct || addOpen) && (
        <ProductModal
          product={addOpen ? null : editProduct}
          onSave={addOpen ? onAdd : (data) => onUpdate(editProduct.id, data)}
          onClose={() => { setEdit(null); setAddOpen(false) }}
        />
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

function OperationalOrdersSection({ title, subtitle, orders, emptyText, type, onSelect }) {
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
                <button onClick={() => onSelect(order)}>Ver pedido</button>
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
        />
        <OperationalOrdersSection
          title="Retiros en el local"
          subtitle="Reservados o pagados pendientes de retiro"
          orders={pickupsToManage}
          emptyText="No hay retiros pendientes."
          type="pickup"
          onSelect={setSelectedOrder}
        />
      </div>

      <div className="adm-orders-history-head">
        <div>
          <h2>Todos los pedidos</h2>
          <p>Historial y búsqueda por estado</p>
        </div>
      </div>

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
                gridTemplateColumns: '110px 130px 1fr 150px 90px 120px 80px',
                gap: 8, padding: '8px 14px',
                borderBottom: `1px solid ${C.hairline}`,
                background: C.paper,
              }}>
                {['Número', 'Fecha', 'Cliente', 'Email', 'Total', 'Estado', 'Acción'].map((h) => (
                  <span key={h} style={{ ...lbl }}>{h}</span>
                ))}
              </div>

              {filteredOrders.map((order, i) => (
                <div
                  key={order.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '110px 130px 1fr 150px 90px 120px 80px',
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
                  <StatusBadge status={order.status} />
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
        .adm-work-order__footer button { border:0; border-radius:6px; padding:6px 11px; background:${C.dark}; color:#fff; cursor:pointer; font:600 10.5px ${ADMIN_FONT}; }
        .adm-work-order__footer button:hover { background:${C.darkHover}; }
        .adm-orders-history-head { margin-bottom:14px; }
        @media (max-width:980px) { .adm-work-queues { grid-template-columns:1fr; } }
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
function ImportUploadCard({ label, hint, disabled, onFile, accept = '.xls,.xlsx', busyLabel = 'Importando...' }) {
  const inputRef = useRef(null)
  return (
    <div style={{
      background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
      padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{label}</div>
      <p style={{ fontSize: 11.5, color: C.muted, margin: 0, minHeight: 28 }}>{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        style={{
          ...outlineBtn,
          fontSize: 11.5, padding: '7px 12px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {disabled ? busyLabel : 'Elegir archivo'}
      </button>
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
function CleosProductEditor({ product, onChange, importId, onUploadImage }) {
  const set = (changes) => onChange({ ...product, ...changes })
  const selectedImage = product.removeImage
    ? null
    : product.imageOptions.find(option => option.key === product.selectedImageKey)
  const imageInputRef = useRef(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState('')
  const subcategoryOptions = getSubcategoryOptions(product.category).map(node => node.label)

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

  const bulkSubcategoryOptions = getSubcategoryOptions(bulkCategory).map(node => node.label)
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
    fetchInventory, createInventoryItem, updateInventoryItem, deleteInventoryItem, fetchCatalog,
    adjustInventoryStocks, uploadInventoryFile,
    parseInvoicePdf, applyInvoiceLines,
    parseCleosCatalogPdf, uploadCleosPreviewImage, applyCleosCatalogProducts,
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
  const [cleosParsing, setCleosParsing]     = useState(false)
  const [cleosError, setCleosError]         = useState(null)
  const [cleosParsed, setCleosParsed]       = useState(null)
  const [stockDrafts, setStockDrafts]       = useState({})
  const [stockSaving, setStockSaving]       = useState(false)
  const [stockSaveError, setStockSaveError] = useState('')
  const [hoveredProductId, setHoveredProductId] = useState(null)

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

  const totalPages = Math.max(1, Math.ceil(inventoryTotal / INV_PAGE_SIZE))
  const pendingStockCount = Object.keys(stockDrafts).length

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

  async function handleInvoiceConfirm(actions) {
    await applyInvoiceLines(actions)
    await fetchCatalog()
    setPage(1)
    fetchInventory({ ...inventoryFilters, page: 1 })
  }

  async function handleCleosUpload(file) {
    setCleosError(null)
    setCleosParsing(true)
    try {
      const data = await parseCleosCatalogPdf(file)
      setCleosParsed(data)
    } catch (err) {
      setCleosError(err.message)
    } finally {
      setCleosParsing(false)
    }
  }

  async function handleCleosConfirm(importId, actions) {
    await applyCleosCatalogProducts(importId, actions)
    await fetchCatalog()
    setPage(1)
    fetchInventory({ ...inventoryFilters, page: 1 })
  }

  function queueStockChange(product, delta) {
    if (stockSaving) return
    setStockSaveError('')
    setStockDrafts(current => {
      const savedStock = Number(product.stock) || 0
      const draft = current[product.id]
      const nextValue = (draft?.value ?? savedStock) + delta
      const next = { ...current }
      if (nextValue === (draft?.base ?? savedStock)) delete next[product.id]
      else next[product.id] = { base: draft?.base ?? savedStock, value: nextValue }
      return next
    })
  }

  function openProduct(product) {
    const stockDraft = stockDrafts[product.id]
    setEditItem(stockDraft ? { ...product, stock: stockDraft.value } : product)
  }

  async function handleSaveStockChanges() {
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
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12, marginBottom: 20,
      }}>
        <ImportUploadCard
          label="Stock general"
          hint="Crea o actualiza código, descripción, grupo y subgrupo. No toca precios ni stock."
          disabled={importLoading}
          onFile={file => handleUpload('catalog', file)}
        />
        <ImportUploadCard
          label="Precios proveedor"
          hint="Actualiza precio costo, venta y con IVA por código."
          disabled={importLoading}
          onFile={file => handleUpload('prices', file)}
        />
        <ImportUploadCard
          label="Comprobante de venta en el local"
          hint="Descuenta stock por cada código vendido en el local."
          disabled={importLoading}
          onFile={file => handleUpload('sale', file)}
        />
        <ImportUploadCard
          label="Compra a proveedor (Excel o PDF)"
          hint="Suma stock por lo comprado: Excel de orden de compra (KIAN) o PDF de factura/remito de cualquier proveedor."
          accept=".xls,.xlsx,.pdf"
          disabled={importLoading || invoiceParsing}
          busyLabel={invoiceParsing ? 'Leyendo PDF...' : 'Importando...'}
          onFile={file => /\.pdf$/i.test(file.name) ? handleInvoiceUpload(file) : handleUpload('purchase', file)}
        />
        <ImportUploadCard
          label="Catálogo CLEOS con imágenes"
          hint="Lee la lista de precios PDF, extrae las fotos y permite aceptar, editar o descartar cada producto antes de guardarlo."
          accept=".pdf"
          disabled={importLoading || cleosParsing}
          busyLabel={cleosParsing ? 'Extrayendo productos...' : 'Importando...'}
          onFile={handleCleosUpload}
        />
      </div>

      {invoiceError && (
        <div style={{ background: C.redLight, border: `1px solid ${C.red}`, borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: C.red, fontSize: 13 }}>
          {invoiceError}
        </div>
      )}

      {invoiceParsed && (
        <InvoiceReviewModal
          parsed={invoiceParsed}
          onConfirm={handleInvoiceConfirm}
          onClose={() => setInvoiceParsed(null)}
        />
      )}

      {cleosError && (
        <div style={{ background: C.redLight, border: `1px solid ${C.red}`, borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: C.red, fontSize: 13 }}>
          {cleosError}
        </div>
      )}

      {cleosParsed && (
        <CleosReviewModal
          parsed={cleosParsed}
          onConfirm={handleCleosConfirm}
          onUploadImage={uploadCleosPreviewImage}
          onClose={() => setCleosParsed(null)}
        />
      )}

      {importError && (
        <div style={{ background: C.redLight, border: `1px solid ${C.red}`, borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: C.red, fontSize: 13 }}>
          {importError}
        </div>
      )}

      {showResult && importResult && (
        <div style={{ background: C.greenLight, border: `1px solid ${C.green}`, borderRadius: 8, padding: '14px 18px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.green }}>Importación completa</span>
            <button onClick={() => setShowResult(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: 14 }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {importResult.totalRows !== undefined && <span style={pill('#F3F4F6', C.text3)}>{importResult.totalRows} filas leídas</span>}
            {importResult.created !== undefined && <span style={pill(C.greenLight, C.green)}>{importResult.created} creados</span>}
            {importResult.updated !== undefined && <span style={pill(C.amberLight, C.amberDark)}>{importResult.updated} actualizados</span>}
            {importResult.imagesSaved !== undefined && <span style={pill('#EEF2FF', '#4338CA')}>{importResult.imagesSaved} imágenes guardadas</span>}
            {!!importResult.imagesRemoved && <span style={pill(C.redLight, C.red)}>{importResult.imagesRemoved} imágenes eliminadas</span>}
            {!!importResult.skipped && <span style={pill('#F3F4F6', C.text3)}>{importResult.skipped} omitidos</span>}
          </div>
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
        <h3 style={{ ...sectionTitle, margin: 0 }}>
          Todos los productos{inventoryTotal ? <span style={{ fontFamily: ADMIN_FONT }}> ({inventoryTotal})</span> : ''}
        </h3>
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
        <div style={{ background: C.redLight, border: `1px solid ${C.red}`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: C.red, fontSize: 12.5 }}>
          {stockSaveError}
        </div>
      )}

      {inventoryError && (
        <div style={{ background: C.redLight, border: `1px solid ${C.red}`, borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: C.red, fontSize: 13 }}>
          {inventoryError} — asegurate de que el backend esté corriendo.
        </div>
      )}

      {!inventoryError && (
        <div style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, overflowX: 'auto' }}>
          <div style={{
                display: 'grid', gridTemplateColumns: '56px minmax(250px, 1fr) 150px 160px 160px 180px 130px 120px', minWidth: 1270,
                gap: 8, padding: '10px 14px', borderBottom: `1px solid ${C.hairline}`, background: C.paper,
                alignItems: 'start',
              }}>
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
                  <select
                    value={supplierFilter}
                    onChange={event => { setSupplier(event.target.value); setPage(1) }}
                    style={headerFilterControl}
                  >
                    <option value="Todos">Todos</option>
                    {inventorySuppliers.map(supplier => <option key={supplier} value={supplier}>{supplier}</option>)}
                  </select>
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
                return (
                <div
                  key={p.id}
                  onClick={() => openProduct(p)}
                  onMouseEnter={() => setHoveredProductId(p.id)}
                  onMouseLeave={() => setHoveredProductId(null)}
                  style={{
                    display: 'grid', gridTemplateColumns: '56px minmax(250px, 1fr) 150px 160px 160px 180px 130px 120px', minWidth: 1270,
                    gap: 8, padding: '10px 14px', alignItems: 'center',
                    borderBottom: i < inventory.length - 1 ? `1px solid ${C.hairline}` : 'none',
                    background: hoveredProductId === p.id ? '#F9FAFB' : C.white,
                    cursor: 'pointer', transition: 'background 0.15s', outline: 'none',
                  }}
                >
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
                  <span style={{ fontSize: 11.5, color: C.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.supplier || 'OTRO'}
                  </span>
                  <span style={{ fontSize: 12.5, color: C.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.precio_costo != null
                      ? fmt(p.precio_costo)
                      : p.precio_costo_usd != null
                        ? `US$ ${Number(p.precio_costo_usd).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : '—'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.precio_venta != null ? fmt(p.precio_venta) : '—'}
                  </span>
                  <span style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    fontSize: 12, fontWeight: 500, color: C.text2,
                  }} title={stockDraft ? 'Cambio de stock pendiente de guardar' : 'Stock guardado'}>
                    <span aria-hidden="true" style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: stockDraft ? C.amber : displayedStock <= 0 ? C.red : displayedStock <= 5 ? C.amber : C.green,
                    }} />
                    {displayedStock}
                  </span>
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
                    <TooltipIconButton label="Restar stock" color={C.text3} disabled={stockSaving} onClick={() => queueStockChange(p, -1)}>−</TooltipIconButton>
                    <TooltipIconButton label="Sumar stock" color={C.green} disabled={stockSaving} onClick={() => queueStockChange(p, 1)}>+</TooltipIconButton>
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
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'overview',     label: 'Resumen',        Icon: BarChartIcon },
  { id: 'products',     label: 'Productos',      Icon: GridIcon },
  { id: 'offers',       label: 'Ofertas',        Icon: TagIcon },
  { id: 'orders',       label: 'Pedidos',        Icon: ClipboardIcon },
]

export default function AdminDashboard() {
  const { products, updateProduct, logout } = useAdmin()
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
