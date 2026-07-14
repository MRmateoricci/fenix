import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdmin } from '../../context/AdminContext'
import { CATEGORY_NAV_LABEL, CATEGORY_SUBCATEGORIES, CABLE_TYPES } from '../../data/products'
import FenixLogo from '../../assets/FenixLogo'

// ── Paleta ────────────────────────────────────────────────────────────────────
const C = {
  dark:        '#1E1E1E',
  darkHover:   '#282828',
  paper:       '#F7F4EF',
  white:       '#FFFFFF',
  ink:         '#16110B',
  text2:       '#3A2E23',
  text3:       '#6B6051',
  muted:       '#9A917F',
  border:      '#E3DDD4',
  hairline:    '#EDE8E1',
  amber:       '#E0A24A',
  amberLight:  '#FEF6E4',
  amberDark:   '#B8821A',
  red:         '#CC0000',
  redLight:    '#FFF2F2',
  green:       '#1a7a3d',
  greenLight:  '#EBF7F0',
  sidebar:     240,
}

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
        background: value ? C.green : '#C9BFAF',
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

// ── ImageFileField — pegá un link (ej. foto de catálogo del proveedor) o
// subí un archivo, que se guarda en el servidor y devuelve una URL real.
// La subida de archivo necesita que el producto ya exista (tenga `id`): para
// uno nuevo todavía sin guardar, solo se puede pegar un link por ahora.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

function ImageFileField({ label, value, onChange, productId }) {
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
      <label style={lbl}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Pegá el link de la foto (ej. catálogo del proveedor)"
        style={inp}
      />
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {value && (
          <img
            src={value} alt=""
            style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: `1px solid ${C.border}`, flexShrink: 0 }}
          />
        )}
        {productId ? (
          <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} style={{ ...outlineBtn, fontSize: 11.5, padding: '7px 12px', opacity: uploading ? 0.6 : 1 }}>
            {uploading ? 'Subiendo...' : 'o subir un archivo'}
          </button>
        ) : (
          <span style={{ fontSize: 11, color: C.muted }}>Guardá el producto para poder subir un archivo</span>
        )}
        {value && (
          <button type="button" onClick={() => onChange('')} style={{ ...outlineBtn, fontSize: 11.5, padding: '7px 12px', color: C.red }}>
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
  name: '', category: CATS[0], subcategory: '',
  price: '', originalPrice: '',
  description: '', image: '', hoverImage: '',
  inStock: true, stock: '', colors: [], sizes: [],
  published: true,
}

// Arma un borrador de producto de tienda a partir de una fila de Inventario
// (usado por "Publicar en tienda" en la pestaña Inventario).
function draftFromInventoryRow(inv) {
  return {
    ...EMPTY,
    id:          inv.id,
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
    cableType:   inv.cable_type,
    colors:      inv.color_options || [],
    sizes:       inv.size_options || [],
    // El botón que abre este borrador se llama "Publicar en tienda" — arranca
    // en ON aunque la fila todavía no esté publicada, para que sea un solo
    // click. El admin lo puede apagar a mano si en realidad quiere guardar
    // como borrador sin publicar todavía.
    published:   true,
  }
}

function ProductModal({ product, onSave, onClose }) {
  const isNew = !product
  const [form, setForm] = useState(() => isNew ? EMPTY : {
    ...product,
    price:         String(product.price ?? ''),
    originalPrice: String(product.originalPrice ?? ''),
    stock:         String(product.stock ?? ''),
    colors:        product.colors || [],
    sizes:         product.sizes || [],
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const valid = form.name.trim() && form.price && Number(form.price) > 0
  const subOptions = CATEGORY_SUBCATEGORIES[form.category]
    || [...new Set(Object.values(CATEGORY_SUBCATEGORIES).flat())]

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

  const applyInventoryMatch = (inv) => setForm(f => ({
    ...f,
    name:        f.name.trim() ? f.name : (inv.descripcion || f.name),
    description: f.description.trim() ? f.description : (inv.descripcion || f.description),
    category:    (f.category && f.category !== CATS[0]) ? f.category : guessCategory(inv.grupo, inv.subgrupo),
    price:       inv.precio_venta != null ? String(inv.precio_venta) : (inv.precio_costo != null ? String(inv.precio_costo) : f.price),
    stock:       inv.stock != null ? String(inv.stock) : f.stock,
    inStock:     inv.stock != null ? inv.stock > 0 : f.inStock,
  }))

  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!valid || saving) return
    const out = { ...form, price: Number(form.price) }
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
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: C.paper, borderRadius: 12,
        width: '100%', maxWidth: 640,
        maxHeight: '92vh', overflowY: 'auto',
        padding: 32, boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: C.ink, margin: 0, fontWeight: 400 }}>
            {isNew ? 'Nuevo producto' : 'Editar producto'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <InventoryLookup onSelect={applyInventoryMatch} />
          <FormField label="Nombre del producto *" value={form.name} onChange={v => set('name', v)} span={2} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={lbl}>Categoría *</label>
            <input
              list="category-options"
              value={form.category}
              onChange={e => set('category', e.target.value)}
              placeholder="ej: Electricidad"
              style={inp}
            />
            <datalist id="category-options">
              {CATS.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={lbl}>Subcategoría</label>
            <select value={form.subcategory} onChange={e => set('subcategory', e.target.value)} style={inp}>
              <option value="">Sin subcategoría</option>
              {subOptions.map(s => <option key={s} value={s}>{s}</option>)}
              {form.subcategory && !subOptions.includes(form.subcategory) && (
                <option value={form.subcategory}>{form.subcategory} (actual)</option>
              )}
            </select>
          </div>
          {form.subcategory === 'Cables Normalizados' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={lbl}>Tipo de cable</label>
              <select value={form.cableType || ''} onChange={e => set('cableType', e.target.value)} style={inp}>
                <option value="">Sin especificar</option>
                {CABLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}
          <FormField label="Precio (ARS) *" value={form.price} onChange={v => set('price', v)} type="number" placeholder="28900" />
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

          <FormField label="Cantidad en stock (opcional)" value={form.stock} onChange={v => set('stock', v)} type="number" placeholder="Dejar vacío si no se controla" />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={lbl}>Disponibilidad</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 38 }}>
              <Toggle value={form.inStock} onChange={v => set('inStock', v)} />
              <span style={{ fontSize: 13, color: form.inStock ? C.green : C.red, fontWeight: 600 }}>
                {form.inStock ? 'En stock' : 'Sin stock'}
              </span>
            </div>
          </div>

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
                  display: 'grid', gridTemplateColumns: '38px 1fr 2fr auto', gap: 8, alignItems: 'center',
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
                    type="text"
                    value={c.image}
                    onChange={e => setColor(idx, 'image', e.target.value)}
                    placeholder="URL de la foto en este color"
                    style={inp}
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
      <div style={{ fontSize: 26, fontWeight: 700, color: C.ink, fontFamily: "'Hanken Grotesk', sans-serif", lineHeight: 1 }}>{value}</div>
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
          <div style={{ fontSize: 34, fontWeight: 700, color: C.ink, fontFamily: "'Inter', system-ui, sans-serif", lineHeight: 1 }}>
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
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.ink, fontFamily: 'monospace', flexShrink: 0 }}>
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
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.ink, fontFamily: 'monospace', flexShrink: 0 }}>
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
                    fontSize: 11, fontWeight: 700,
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
                  fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
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
          <span style={pill('#F3F0EB', C.text3)}>{products.length} productos</span>
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
              display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
              borderBottom: i < filtered.length - 1 ? `1px solid ${C.hairline}` : 'none',
              background: hoveredRow === p.id ? '#FAFAF8' : 'transparent',
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
              <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{fmt(p.price)}</div>
              {p.originalPrice && (
                <div style={{ fontSize: 11, color: C.text3, textDecoration: 'line-through' }}>{fmt(p.originalPrice)}</div>
              )}
              {p.originalPrice && (
                <span style={{
                  fontSize: 10, fontWeight: 700, background: C.amberLight, color: C.amberDark,
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
          Ofertas activas{activeOffers.length > 0 ? <span style={{ fontFamily: "'Inter', system-ui, sans-serif" }}> ({activeOffers.length})</span> : ''}
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
                <div style={{ fontSize: 14, fontWeight: 700, color: C.red }}>{fmt(p.price)}</div>
                <div style={{ fontSize: 12, color: C.text3, textDecoration: 'line-through' }}>{fmt(p.originalPrice)}</div>
              </div>
              <span style={{
                fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 20,
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
  padding: '8px 12px',
  fontSize: 13,
  color: C.ink,
  background: C.white,
  fontFamily: "'Hanken Grotesk', 'Inter', sans-serif",
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  appearance: 'none',
}
const lbl = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.1em',
  color: C.text3,
  textTransform: 'uppercase',
}
const solidBtn = {
  padding: '8px 18px',
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 700,
  fontFamily: "'Hanken Grotesk', 'Inter', sans-serif",
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
  width: 30, height: 30,
  borderRadius: 6, border: 'none',
  cursor: 'pointer', fontSize: 14,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'inherit',
  transition: 'opacity 0.15s',
}
const sectionTitle = {
  fontFamily: "'Cormorant Garamond', serif",
  fontSize: 19,
  fontWeight: 400,
  color: C.ink,
  margin: '0 0 14px',
  letterSpacing: '0.01em',
}
const pill = (bg, color) => ({
  fontSize: 12,
  fontWeight: 600,
  padding: '4px 12px',
  borderRadius: 20,
  background: bg,
  color,
  letterSpacing: '0.02em',
})

// ── OrdersTab ─────────────────────────────────────────────────────────────────

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
  pending_payment: { bg: '#FEF6E4', color: '#B8821A' },
  reserved:        { bg: '#FEF6E4', color: '#B8821A' },
  paid:            { bg: '#EBF7F0', color: '#1a7a3d' },
  preparing:       { bg: '#EFF6FF', color: '#1D4ED8' },
  shipped:         { bg: '#F5F3FF', color: '#7C3AED' },
  delivered:       { bg: '#EBF7F0', color: '#14532d' },
  cancelled:       { bg: '#FFF2F2', color: '#CC0000' },
  payment_failed:  { bg: '#FFF2F2', color: '#CC0000' },
  expired:         { bg: '#FFF2F2', color: '#CC0000' },
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
  const s = STATUS_STYLE[status] || { bg: '#F3F0EB', color: '#6B6051' }
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
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
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: C.ink, margin: '4px 0 0', fontWeight: 400 }}>
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
              <p style={{ fontSize: 13, fontWeight: 700, color: C.ink, flexShrink: 0 }}>{fmt(item.subtotal)}</p>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 18px', borderTop: `1px solid ${C.hairline}` }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Total</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>{fmt(order.total_amount)}</span>
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

function OrdersTab() {
  const { orders, ordersTotal, ordersLoading, ordersError, fetchOrders, updateOrderStatus } = useAdmin()
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch]             = useState('')
  const [selectedOrder, setSelectedOrder] = useState(null)

  useEffect(() => {
    const filters = {}
    if (statusFilter !== 'all') filters.status = statusFilter
    if (search.trim()) filters.search = search.trim()
    fetchOrders(filters)
  }, [statusFilter, search, fetchOrders])

  async function handleStatusChange(id, status) {
    await updateOrderStatus(id, status)
    // Refresca con los filtros actuales
    const filters = {}
    if (statusFilter !== 'all') filters.status = statusFilter
    if (search.trim()) filters.search = search.trim()
    fetchOrders(filters)
  }

  return (
    <div>
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
        {ordersLoading ? 'Cargando...' : `${ordersTotal} pedido${ordersTotal !== 1 ? 's' : ''}`}
      </p>

      {/* ── Error ── */}
      {ordersError && (
        <div style={{ background: '#FFF2F2', border: `1px solid ${C.red}`, borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: C.red, fontSize: 13 }}>
          {ordersError} — asegurate de que el backend esté corriendo.
        </div>
      )}

      {/* ── Tabla ── */}
      {!ordersLoading && !ordersError && (
        <div style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          {orders.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: C.muted, fontSize: 14 }}>
              No hay pedidos que coincidan con el filtro.
            </div>
          ) : (
            <>
              {/* Header de tabla */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '110px 130px 1fr 150px 90px 120px 80px',
                gap: 8, padding: '10px 16px',
                borderBottom: `1px solid ${C.hairline}`,
                background: C.paper,
              }}>
                {['Número', 'Fecha', 'Cliente', 'Email', 'Total', 'Estado', 'Acción'].map((h) => (
                  <span key={h} style={{ ...lbl }}>{h}</span>
                ))}
              </div>

              {orders.map((order, i) => (
                <div
                  key={order.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '110px 130px 1fr 150px 90px 120px 80px',
                    gap: 8, padding: '12px 16px', alignItems: 'center',
                    borderBottom: i < orders.length - 1 ? `1px solid ${C.hairline}` : 'none',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#FAFAF8')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.ink, fontFamily: 'monospace' }}>
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
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
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
    </div>
  )
}

function StockAlertsTab({ products }) {
  const { stockAlerts, stockAlertsLoading, stockAlertsError, fetchStockAlerts } = useAdmin()

  useEffect(() => {
    fetchStockAlerts()
  }, [fetchStockAlerts])

  function productName(productId) {
    return products.find((p) => p.id === productId)?.name || `Producto #${productId}`
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
        {stockAlertsLoading ? 'Cargando...' : `${stockAlerts.length} aviso${stockAlerts.length !== 1 ? 's' : ''}`}
      </p>

      {stockAlertsError && (
        <div style={{ background: '#FFF2F2', border: `1px solid ${C.red}`, borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: C.red, fontSize: 13 }}>
          {stockAlertsError} — asegurate de que el backend esté corriendo.
        </div>
      )}

      {!stockAlertsLoading && !stockAlertsError && (
        <div style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          {stockAlerts.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: C.muted, fontSize: 14 }}>
              Todavía no hay pedidos de aviso de stock.
            </div>
          ) : (
            <>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 150px',
                gap: 8, padding: '10px 16px',
                borderBottom: `1px solid ${C.hairline}`, background: C.paper,
              }}>
                {['Producto', 'Email', 'Fecha'].map((h) => (
                  <span key={h} style={{ ...lbl }}>{h}</span>
                ))}
              </div>

              {stockAlerts.map((alert, i) => (
                <div
                  key={alert.id}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr 150px',
                    gap: 8, padding: '12px 16px', alignItems: 'center',
                    borderBottom: i < stockAlerts.length - 1 ? `1px solid ${C.hairline}` : 'none',
                  }}
                >
                  <span style={{ fontSize: 13, color: C.ink, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {productName(alert.product_id)}
                  </span>
                  <span style={{ fontSize: 12, color: C.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {alert.email}
                  </span>
                  <span style={{ fontSize: 11, color: C.text3 }}>
                    {fmtDate(alert.created_at)}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
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

const BellIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ flexShrink: 0 }}>
    <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M13.73 21a2 2 0 01-3.46 0" strokeLinecap="round"/>
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
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: C.ink, margin: 0, fontWeight: 400 }}>
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
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: C.ink, margin: 0, fontWeight: 400 }}>
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

// ── InventoryTab ──────────────────────────────────────────────────────────────
const SUPPLIER_FILTERS = ['Todos', 'ALCIDES', 'KIAN', 'OTRO']
const INV_PAGE_SIZE = 50

function InventoryTab() {
  const {
    inventory, inventoryTotal, inventoryLoading, inventoryError,
    importResult, importLoading, importError,
    fetchInventory, createInventoryItem, updateInventoryItem, deleteInventoryItem,
    adjustInventoryStock, uploadInventoryFile, updateProduct,
    parseInvoicePdf, applyInvoiceLines,
  } = useAdmin()

  const [search, setSearch]           = useState('')
  const [supplierFilter, setSupplier] = useState('Todos')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [page, setPage]               = useState(1)
  const [editItem, setEditItem]       = useState(null)
  const [addOpen, setAddOpen]         = useState(false)
  const [confirmId, setConfirmId]     = useState(null)
  const [publishItem, setPublishItem] = useState(null)
  const [showResult, setShowResult]   = useState(false)
  const [invoiceParsing, setInvoiceParsing] = useState(false)
  const [invoiceError, setInvoiceError]     = useState(null)
  const [invoiceParsed, setInvoiceParsed]   = useState(null)

  useEffect(() => {
    const filters = { page, limit: INV_PAGE_SIZE }
    if (search.trim()) filters.search = search.trim()
    if (supplierFilter !== 'Todos') filters.supplier = supplierFilter
    if (lowStockOnly) filters.lowStock = 'true'
    fetchInventory(filters)
  }, [page, search, supplierFilter, lowStockOnly, fetchInventory])

  useEffect(() => {
    if (importResult) setShowResult(true)
  }, [importResult])

  const totalPages = Math.max(1, Math.ceil(inventoryTotal / INV_PAGE_SIZE))

  async function handleUpload(type, file) {
    try {
      await uploadInventoryFile(type, file)
      setPage(1)
      const filters = { page: 1, limit: INV_PAGE_SIZE }
      if (search.trim()) filters.search = search.trim()
      if (supplierFilter !== 'Todos') filters.supplier = supplierFilter
      if (lowStockOnly) filters.lowStock = 'true'
      fetchInventory(filters)
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
    setPage(1)
    fetchInventory({ page: 1, limit: INV_PAGE_SIZE })
  }

  async function handleAdjust(id, delta) {
    await adjustInventoryStock(id, delta)
    fetchInventory({
      page, limit: INV_PAGE_SIZE,
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(supplierFilter !== 'Todos' ? { supplier: supplierFilter } : {}),
      ...(lowStockOnly ? { lowStock: 'true' } : {}),
    })
  }

  async function handleSave(payload) {
    if (addOpen) await createInventoryItem(payload)
    else await updateInventoryItem(editItem.id, payload)
    fetchInventory({ page, limit: INV_PAGE_SIZE })
  }

  async function handleDelete(id) {
    await deleteInventoryItem(id)
    setConfirmId(null)
    fetchInventory({ page, limit: INV_PAGE_SIZE })
  }

  return (
    <div style={{ fontFamily: "'Hanken Grotesk', 'Inter', sans-serif" }}>
      {/* Carga de excel */}
      <h3 style={sectionTitle}>Importar desde Excel</h3>
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

      {importError && (
        <div style={{ background: C.redLight, border: `1px solid ${C.red}`, borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: C.red, fontSize: 13 }}>
          {importError}
        </div>
      )}

      {showResult && importResult && (
        <div style={{ background: C.greenLight, border: `1px solid ${C.green}`, borderRadius: 8, padding: '14px 18px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.green }}>Importación completa</span>
            <button onClick={() => setShowResult(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: 14 }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {importResult.totalRows !== undefined && <span style={pill('#F3F0EB', C.text3)}>{importResult.totalRows} filas leídas</span>}
            {importResult.created !== undefined && <span style={pill(C.greenLight, C.green)}>{importResult.created} creados</span>}
            {importResult.updated !== undefined && <span style={pill(C.amberLight, C.amberDark)}>{importResult.updated} actualizados</span>}
            {!!importResult.skipped && <span style={pill('#F3F0EB', C.text3)}>{importResult.skipped} omitidos</span>}
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

      {/* Tabla de inventario */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <h3 style={{ ...sectionTitle, margin: 0 }}>
          Inventario{inventoryTotal ? <span style={{ fontFamily: "'Inter', system-ui, sans-serif" }}> ({inventoryTotal})</span> : ''}
        </h3>
        <button onClick={() => setAddOpen(true)} style={{ ...solidBtn, background: C.red, color: '#fff' }}>
          + Nuevo producto
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Buscar por código o descripción..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          style={{ ...inp, flex: 1, minWidth: 200 }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SUPPLIER_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => { setSupplier(s); setPage(1) }}
              style={{
                padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontSize: 11, fontFamily: 'inherit', fontWeight: 600, letterSpacing: '0.04em',
                background: supplierFilter === s ? C.red : C.hairline,
                color: supplierFilter === s ? '#fff' : C.text2,
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.text2, cursor: 'pointer' }}>
          <input type="checkbox" checked={lowStockOnly} onChange={e => { setLowStockOnly(e.target.checked); setPage(1) }} />
          Solo stock bajo
        </label>
      </div>

      {inventoryError && (
        <div style={{ background: C.redLight, border: `1px solid ${C.red}`, borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: C.red, fontSize: 13 }}>
          {inventoryError} — asegurate de que el backend esté corriendo.
        </div>
      )}

      {!inventoryError && (
        <div style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          {inventoryLoading ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: C.muted, fontSize: 14 }}>Cargando...</div>
          ) : inventory.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: C.muted, fontSize: 14 }}>
              No se encontraron productos.
            </div>
          ) : (
            <>
              <div style={{
                display: 'grid', gridTemplateColumns: '130px 1fr 130px 90px 90px 90px 70px 168px',
                gap: 8, padding: '10px 16px', borderBottom: `1px solid ${C.hairline}`, background: C.paper,
              }}>
                {['Código', 'Descripción', 'Grupo/Subgrupo', 'P. costo', 'P. venta', 'P. c/IVA', 'Stock', 'Acciones'].map(h => (
                  <span key={h} style={lbl}>{h}</span>
                ))}
              </div>
              {inventory.map((p, i) => (
                <div
                  key={p.id}
                  style={{
                    display: 'grid', gridTemplateColumns: '130px 1fr 130px 90px 90px 90px 70px 168px',
                    gap: 8, padding: '12px 16px', alignItems: 'center',
                    borderBottom: i < inventory.length - 1 ? `1px solid ${C.hairline}` : 'none',
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.ink, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.codigo}
                  </span>
                  <span style={{ fontSize: 13, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.descripcion || '—'}
                  </span>
                  <span style={{ fontSize: 12, color: C.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[p.grupo, p.subgrupo].filter(Boolean).join(' · ') || '—'}
                  </span>
                  <span style={{ fontSize: 12.5, color: C.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.precio_costo != null ? fmt(p.precio_costo) : '—'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.precio_venta != null ? fmt(p.precio_venta) : '—'}
                  </span>
                  <span style={{ fontSize: 12.5, color: C.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.precio_iva != null ? fmt(p.precio_iva) : '—'}
                  </span>
                  <span style={{
                    fontSize: 12, fontWeight: 700, textAlign: 'center', padding: '3px 8px', borderRadius: 20,
                    background: p.stock <= 0 ? C.redLight : p.stock <= 5 ? C.amberLight : C.greenLight,
                    color: p.stock <= 0 ? C.red : p.stock <= 5 ? C.amberDark : C.green,
                  }}>
                    {p.stock}
                  </span>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button onClick={() => handleAdjust(p.id, -1)} title="Restar 1" style={{ ...iconBtn, width: 24, height: 24, background: C.hairline, color: C.text2 }}>−</button>
                    <button onClick={() => handleAdjust(p.id, 1)} title="Sumar 1" style={{ ...iconBtn, width: 24, height: 24, background: C.hairline, color: C.text2 }}>+</button>
                    <button onClick={() => setEditItem(p)} title="Editar" style={{ ...iconBtn, width: 24, height: 24, background: C.amberLight, color: C.amberDark }}>✎</button>
                    <button
                      onClick={() => setPublishItem(p)}
                      title={p.published ? 'Publicado en la tienda — editar' : 'Publicar en tienda'}
                      style={{ ...iconBtn, width: 24, height: 24, background: p.published ? C.greenLight : C.hairline, color: p.published ? C.green : C.text2 }}
                    >
                      ↑
                    </button>
                    <button onClick={() => setConfirmId(p.id)} title="Eliminar" style={{ ...iconBtn, width: 24, height: 24, background: C.redLight, color: C.red }}>✕</button>
                  </div>
                </div>
              ))}
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
        <InventoryProductModal
          product={addOpen ? null : editItem}
          onSave={handleSave}
          onClose={() => { setEditItem(null); setAddOpen(false) }}
        />
      )}

      {publishItem && (
        <ProductModal
          product={draftFromInventoryRow(publishItem)}
          onSave={async (data) => {
            await updateProduct(publishItem.id, data)
            fetchInventory({
              page, limit: INV_PAGE_SIZE,
              ...(search.trim() ? { search: search.trim() } : {}),
              ...(supplierFilter !== 'Todos' ? { supplier: supplierFilter } : {}),
              ...(lowStockOnly ? { lowStock: 'true' } : {}),
            })
          }}
          onClose={() => setPublishItem(null)}
        />
      )}

      {confirmId !== null && (
        <ConfirmModal
          message="¿Eliminar este producto del inventario? Esta acción no se puede deshacer."
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
  { id: 'stockAlerts',  label: 'Avisos de stock', Icon: BellIcon },
  { id: 'inventory',    label: 'Inventario',     Icon: BoxIcon },
]

export default function AdminDashboard() {
  const { products, updateProduct, addProduct, deleteProduct, logout } = useAdmin()
  const navigate  = useNavigate()
  const [tab, setTab]           = useState('products')

  return (
    <div style={{
      display: 'flex', minHeight: '100vh',
      fontFamily: "'Hanken Grotesk', 'Inter', system-ui, sans-serif",
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
        <div style={{ padding: '24px 18px 20px', borderBottom: `1px solid ${C.hairline}` }}>
          <FenixLogo height={90} />
          <div style={{
            fontSize: 9,
            color: C.muted,
            letterSpacing: '0.18em',
            marginTop: 10,
            textTransform: 'uppercase',
            fontFamily: "'Hanken Grotesk', sans-serif",
          }}>
            Administración
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px' }}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                padding: '10px 16px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                background: tab === item.id ? 'rgba(204,0,0,0.08)' : 'transparent',
                color: tab === item.id ? C.red : C.text3,
                fontSize: 13,
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
        <div style={{ padding: '12px 8px 24px', borderTop: `1px solid ${C.hairline}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
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
      <main style={{
        flex: 1,
        background: C.paper,
        minHeight: '100vh',
        padding: '36px 40px',
        overflow: 'auto',
      }}>
        {/* Page header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 32,
            fontWeight: 400,
            color: C.ink,
            margin: 0,
            letterSpacing: '0.01em',
          }}>
            {NAV_ITEMS.find(i => i.id === tab)?.label}
          </h1>
          <div style={{ width: 36, height: 3, background: C.red, borderRadius: 2, marginTop: 10 }} />
        </div>

        {/* Tab content */}
        {tab === 'overview' && (
          <OverviewTab products={products} />
        )}
        {tab === 'products' && (
          <ProductsTab
            products={products}
            onUpdate={updateProduct}
            onAdd={addProduct}
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
        {tab === 'stockAlerts' && (
          <StockAlertsTab products={products} />
        )}
        {tab === 'inventory' && (
          <InventoryTab />
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
  padding: '8px 14px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'inherit',
  borderRadius: 6,
  textAlign: 'left',
  letterSpacing: '0.04em',
  transition: 'color 0.15s',
}
