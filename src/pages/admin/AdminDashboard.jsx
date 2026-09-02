import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdmin } from '../../context/AdminContext'
import { getCategoryValue, getSubcategoryOptions, getProductTypeOptions } from '../../data/categoryTree'
import FenixLogo from '../../assets/FenixLogo'
import OverviewDashboard from './OverviewDashboard'
import AnalyticsTab from './AnalyticsTab'
import BackupsTab from './BackupsTab'
import { isPreparationOverdue, PREPARATION_ALERT_HOURS } from '../../utils/orderPreparation'

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
// Tonos de luz predeterminados que se pueden agregar con un clic (ver addTonePreset).
const TONE_PRESETS = [
  { name: 'Cálido', hex: '#F5D08A' },
  { name: 'Neutro', hex: '#FDF6E3' },
  { name: 'Frío',   hex: '#CFE8FF' },
]
// Colores predeterminados (típicos de cables) que se pueden agregar con un clic (ver addColorPreset).
const COLOR_PRESETS = [
  { name: 'Negro',  hex: '#000000' },
  { name: 'Rojo',   hex: '#FF0000' },
  { name: 'Azul',   hex: '#0000FF' },
  { name: 'Verde',  hex: '#008000' },
  { name: 'Blanco', hex: '#FFFFFF' },
  { name: 'Marrón', hex: '#8B4513' },
  { name: 'Amarillo', hex: '#FFFF00' },
  { name: 'Verde/Amarillo', hex: '#9ACD32' },
  { name: 'Gris', hex: '#808080' },
  { name: 'Naranja', hex: '#FFA500' },
  { name: 'Celeste', hex: '#00BFFF' },
  { name: 'Violeta', hex: '#800080' },
]


const fmt = n =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const fmtUsd = n =>
  `US$ ${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtPickupDate = (d) =>
  new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })

// La entrega es una ventana, no un día. Los pedidos anteriores al cambio sólo
// tienen el extremo inferior y se siguen mostrando con esa fecha sola.
const fmtVentanaEntrega = (order) => {
  const desde = order.estimated_delivery_date
  const hasta = order.estimated_delivery_max_date
  if (!desde) return null
  if (!hasta || String(desde).slice(0, 10) === String(hasta).slice(0, 10)) return fmtPickupDate(desde)
  return `${fmtPickupDate(desde)} - ${fmtPickupDate(hasta)}`
}

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

const TicketIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ flexShrink: 0 }}>
    <path d="M1.5 5.3c.9 0 1.6.7 1.6 1.7s-.7 1.7-1.6 1.7v2.6c0 .6.5 1.1 1.1 1.1h9.8c.6 0 1.1-.5 1.1-1.1V8.7c-.9 0-1.6-.7-1.6-1.7s.7-1.7 1.6-1.7V3.7c0-.6-.5-1.1-1.1-1.1H2.6c-.6 0-1.1.5-1.1 1.1z" strokeLinejoin="round"/>
    <line x1="6" y1="2.6" x2="6" y2="11.4" strokeDasharray="1.3 1.3" strokeLinecap="round"/>
  </svg>
)

const UsersIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ flexShrink: 0 }}>
    <circle cx="5.6" cy="4.4" r="2.5"/>
    <path d="M1 13.2c0-2.5 2.1-4.3 4.6-4.3s4.6 1.8 4.6 4.3" strokeLinecap="round"/>
    <path d="M10.4 2.3c1.4.2 2.4 1.4 2.4 2.8s-1 2.6-2.4 2.8M11.2 8.9c1.7.3 2.9 1.7 2.9 3.6" strokeLinecap="round"/>
  </svg>
)

const PulseIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ flexShrink: 0 }}>
    <path d="M0.8 7.5h3l2-4.5 2.5 9 2-4.5h3.1" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

// ── Toggle ────────────────────────────────────────────────────────────────────
// Genérico: se usa para publicar, etiquetar y activar cupones, no sólo para
// stock. No lleva `title` propio — cada uso ya tiene al lado un texto que dice
// en qué estado está, y un tooltip fijo terminaba contradiciéndolo. `label`
// existe sólo para el lector de pantalla, que sin eso lee un botón sin nombre.
function Toggle({ value, onChange, size = 'md', label }) {
  const w = size === 'sm' ? 32 : 40
  const h = size === 'sm' ? 18 : 22
  const d = size === 'sm' ? 14 : 18
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={Boolean(value)}
      aria-label={label}
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
function ConfirmModal({ message, onConfirm, onCancel, confirmLabel = 'Eliminar' }) {
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
            {confirmLabel}
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

// ── MultiImageField — galería de fotos del producto (además de la portada).
// Permite seleccionar varios archivos a la vez, reordenarlos y quitarlos.
function MultiImageField({ label, hint, value, onChange, productId }) {
  const inputRef = useRef(null)
  const { uploadProductImage } = useAdmin()
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const images = value || []

  const handleFiles = async (files) => {
    setError('')
    for (const file of files) {
      if (!file.type.startsWith('image/')) { setError('Todos los archivos deben ser imágenes'); return }
      if (file.size > MAX_IMAGE_BYTES) { setError('Cada imagen no puede pesar más de 8 MB'); return }
    }
    setUploading(true)
    try {
      const uploaded = []
      for (const file of files) {
        const { url } = await uploadProductImage(productId, file)
        uploaded.push(url)
      }
      onChange([...images, ...uploaded])
    } catch (err) {
      setError(err.message || 'No se pudo subir alguna imagen')
    } finally {
      setUploading(false)
    }
  }

  const removeAt = idx => onChange(images.filter((_, i) => i !== idx))
  const moveAt = (idx, dir) => {
    const next = idx + dir
    if (next < 0 || next >= images.length) return
    const copy = [...images]
    ;[copy[idx], copy[next]] = [copy[next], copy[idx]]
    onChange(copy)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {label && <label style={lbl}>{label}</label>}
      {hint && <p style={{ fontSize: 11.5, color: C.muted, margin: 0 }}>{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={e => {
          const files = Array.from(e.target.files || [])
          if (files.length) handleFiles(files)
          e.target.value = ''
        }}
      />
      {images.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {images.map((url, idx) => (
            <div key={url + idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div style={{ position: 'relative' }}>
                <img src={url} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: `1px solid ${C.border}`, display: 'block' }} />
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  aria-label="Quitar foto"
                  title="Quitar"
                  style={{
                    position: 'absolute', top: -7, right: -7, width: 18, height: 18, borderRadius: '50%',
                    border: `1px solid ${C.border}`, background: C.white, color: C.red, cursor: 'pointer',
                    fontSize: 10, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{ display: 'flex', gap: 2 }}>
                <button type="button" disabled={idx === 0} onClick={() => moveAt(idx, -1)} title="Mover antes" style={{ ...outlineBtn, padding: '1px 6px', fontSize: 9.5, opacity: idx === 0 ? 0.35 : 1, cursor: idx === 0 ? 'default' : 'pointer' }}>◀</button>
                <button type="button" disabled={idx === images.length - 1} onClick={() => moveAt(idx, 1)} title="Mover después" style={{ ...outlineBtn, padding: '1px 6px', fontSize: 9.5, opacity: idx === images.length - 1 ? 0.35 : 1, cursor: idx === images.length - 1 ? 'default' : 'pointer' }}>▶</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} style={{ ...outlineBtn, fontSize: 11.5, padding: '7px 12px', width: 'fit-content', opacity: uploading ? 0.6 : 1 }}>
        {uploading ? 'Subiendo...' : images.length ? '+ Agregar más fotos' : 'Subir fotos'}
      </button>
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

// Combina color + tono en una sola clave de fila para variant_stock: un
// producto puede tener color de carcasa y tono de luz (cálido/neutro/frío) a
// la vez, pero la matriz de stock sigue siendo 2D (fila × medida). Misma
// convención en backend/routes/orders.js y ProductDetail.jsx — si se cambia
// acá hay que cambiarla en los tres lados.
function combineVariantRowKey(colorName, toneName) {
  if (colorName && toneName) return `${colorName} / ${toneName}`
  return colorName || toneName || '_'
}

function VariantImageField({ value, onChange, code }) {
  const inputRef = useRef(null)
  const { uploadProductImage } = useAdmin()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const chooseFile = () => {
    if (!uploading) inputRef.current?.click()
  }
  const handleFile = async (file) => {
    setError('')
    if (!file?.type.startsWith('image/')) { setError('Elegí un archivo de imagen'); return }
    if (file.size > MAX_IMAGE_BYTES) { setError('La imagen no puede pesar más de 8 MB'); return }
    setUploading(true)
    try {
      // Sin productId: sube el archivo sin tocar la imagen principal.
      const { url } = await uploadProductImage(null, file)
      onChange(url)
    } catch (uploadError) {
      setError(uploadError.message || 'No se pudo subir')
    } finally {
      setUploading(false)
    }
  }

  return (
    <span style={{ position: 'relative', display: 'inline-grid', width: 46, height: 46 }} title={error || (value ? `Cambiar foto de ${code}` : `Agregar foto a ${code}`)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={event => {
          const file = event.target.files?.[0]
          if (file) handleFile(file)
          event.target.value = ''
        }}
      />
      <button
        type="button"
        onClick={chooseFile}
        disabled={uploading}
        aria-label={value ? `Cambiar foto de ${code}` : `Agregar foto a ${code}`}
        style={{
          width: 46, height: 46, padding: 0, overflow: 'hidden', cursor: uploading ? 'wait' : 'pointer',
          border: `1px ${value ? 'solid' : 'dashed'} ${error ? C.red : C.border}`,
          borderRadius: 7, background: '#F8FAFC', color: error ? C.red : C.muted,
          display: 'grid', placeItems: 'center', fontSize: 9, lineHeight: 1.1,
        }}
      >
        {uploading
          ? 'Subiendo…'
          : value
            ? <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span>{error ? 'Error' : '+ Foto'}</span>}
      </button>
      {value && !uploading && (
        <button
          type="button"
          onClick={event => { event.stopPropagation(); setError(''); onChange('') }}
          title="Quitar foto de la variante"
          aria-label={`Quitar foto de ${code}`}
          style={{
            position: 'absolute', top: -5, right: -5, width: 17, height: 17, padding: 0,
            border: '1px solid #fff', borderRadius: '50%', background: C.red, color: '#fff',
            display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 11, lineHeight: 1,
          }}
        >×</button>
      )}
    </span>
  )
}

function VariantColorField({ name, hex, code, onChange }) {
  const normalizedHex = String(hex || '#CCCCCC').toUpperCase()
  const selectedPreset = COLOR_PRESETS.find(preset =>
    preset.name.localeCompare(String(name || ''), 'es-AR', { sensitivity: 'base' }) === 0 &&
    preset.hex.toUpperCase() === normalizedHex
  )
  return (
    <span style={{ display: 'grid', gridTemplateColumns: 'minmax(72px,1fr) 76px 30px', gap: 4 }}>
      <input value={name} onChange={event => onChange({ name: event.target.value, hex: normalizedHex })} placeholder="Cualquiera" aria-label={`Nombre del color de ${code}`} style={{ ...inp, minWidth: 0, height: 32, padding: '5px 7px', fontSize: 10.5 }} />
      <select
        value={selectedPreset?.name || ''}
        onChange={event => {
          const preset = COLOR_PRESETS.find(item => item.name === event.target.value)
          if (preset) onChange({ name: preset.name, hex: preset.hex })
        }}
        aria-label={`Color predeterminado de ${code}`}
        title="Elegir un color predeterminado"
        style={{ ...inp, minWidth: 0, height: 32, padding: '4px 3px', fontSize: 9.5 }}
      >
        <option value="">Común</option>
        {COLOR_PRESETS.map(preset => <option key={preset.name} value={preset.name}>{preset.name}</option>)}
      </select>
      <input type="color" value={normalizedHex} onChange={event => onChange({ name, hex: event.target.value.toUpperCase() })} disabled={!String(name || '').trim()} aria-label={`Color visual de ${code}`} title={String(name || '').trim() ? 'Elegir un color personalizado' : 'Primero escribí o seleccioná el nombre del color'} style={{ width: 30, height: 32, padding: 2, border: `1px solid ${C.border}`, borderRadius: 6, background: C.white, cursor: String(name || '').trim() ? 'pointer' : 'not-allowed', opacity: String(name || '').trim() ? 1 : .45 }} />
    </span>
  )
}

function VariantToneField({ value, hex, code, onChange }) {
  const normalizedHex = String(hex || '#CCCCCC').toUpperCase()
  const selectedPreset = TONE_PRESETS.find(preset =>
    preset.name.localeCompare(String(value || ''), 'es-AR', { sensitivity: 'base' }) === 0 &&
    preset.hex.toUpperCase() === normalizedHex
  )
  return (
    <span style={{ display: 'grid', gridTemplateColumns: 'minmax(70px,1fr) 76px 30px', gap: 4 }}>
      <input
        value={value}
        onChange={event => onChange({ name: event.target.value, hex: normalizedHex })}
        placeholder="Cualquiera"
        aria-label={`Tono de ${code}`}
        style={{ ...inp, minWidth: 0, height: 32, padding: '5px 7px', fontSize: 10.5 }}
      />
      <select
        value={selectedPreset?.name || ''}
        onChange={event => {
          const preset = TONE_PRESETS.find(item => item.name === event.target.value)
          if (preset) onChange({ name: preset.name, hex: preset.hex })
        }}
        aria-label={`Tono predeterminado de ${code}`}
        title="Elegir un tono predeterminado"
        style={{ ...inp, minWidth: 0, height: 32, padding: '4px 3px', fontSize: 9.5 }}
      >
        <option value="">Elegir</option>
        {TONE_PRESETS.map(preset => <option key={preset.name} value={preset.name}>{preset.name}</option>)}
      </select>
      <input type="color" value={normalizedHex} onChange={event => onChange({ name: value, hex: event.target.value.toUpperCase() })} disabled={!String(value || '').trim()} aria-label={`Color visual del tono de ${code}`} title={String(value || '').trim() ? 'Elegir un color personalizado' : 'Primero escribí o seleccioná el nombre del tono'} style={{ width: 30, height: 32, padding: 2, border: `1px solid ${C.border}`, borderRadius: 6, background: C.white, cursor: String(value || '').trim() ? 'pointer' : 'not-allowed', opacity: String(value || '').trim() ? 1 : .45 }} />
    </span>
  )
}

function variantProductDataFromSource(source = {}, code = '') {
  return {
    codigo: code || source.codigo || '',
    name: source.name || source.descripcion || source.inventoryDescription || '',
    description: source.description_larga ?? source.description ?? source.descripcion ?? source.inventoryDescription ?? '',
    inventoryDescription: source.descripcion ?? source.inventoryDescription ?? '',
    grupo: source.grupo || '', subgrupo: source.subgrupo || '', medida: source.medida || '',
    supplier: source.supplier || '', category: source.category || '', subcategory: source.subcategory || '',
    watts: source.watts ?? '', amperes: source.amperes ?? '', colorTemp: source.color_temp ?? source.colorTemp ?? '',
    ipRating: source.ip_rating ?? source.ipRating ?? '', material: source.material || '',
    cableType: source.cable_type ?? source.cableType ?? '', productType: source.product_type ?? source.productType ?? '',
    lengthCm: source.length_cm ?? source.lengthCm ?? '', widthCm: source.width_cm ?? source.widthCm ?? '',
    heightCm: source.height_cm ?? source.heightCm ?? '', weightKg: source.weight_kg ?? source.weightKg ?? '',
    hoverImage: source.hover_image_url ?? source.hoverImage ?? '',
  }
}

function inheritingVariantProductData(source = {}, code = '') {
  return {
    ...variantProductDataFromSource(source, code),
    name: '', description: '', category: '', subcategory: '', productType: '',
  }
}

function VariantDetailsModal({ code, codeLocked = false, value, onChange, onClose }) {
  const data = { ...variantProductDataFromSource({}, code), ...(value || {}), codigo: codeLocked ? code : (value?.codigo || code || '') }
  const set = (field, nextValue) => onChange({ ...data, [field]: nextValue })
  const fields = [
    ['Nombre individual', 'name'], ['Categoría', 'category'], ['Subcategoría', 'subcategory'], ['Tipo de producto', 'productType'],
    ['Grupo / marca', 'grupo'], ['Subgrupo', 'subgrupo'], ['Medida original', 'medida'], ['Proveedor', 'supplier'],
    ['Potencia (W)', 'watts', 'number'], ['Corriente (A)', 'amperes', 'number'], ['Temperatura de color (K)', 'colorTemp', 'number'], ['Protección IP', 'ipRating'], ['Material', 'material'],
    ['Tipo de cable', 'cableType'], ['Largo envío (cm)', 'lengthCm', 'number'], ['Ancho envío (cm)', 'widthCm', 'number'],
    ['Alto envío (cm)', 'heightCm', 'number'], ['Peso (kg)', 'weightKg', 'number'],
  ]
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(17,24,39,.58)', display: 'grid', placeItems: 'center', padding: 18 }}>
      <div style={{ width: 'min(820px,96vw)', maxHeight: '90vh', overflow: 'auto', background: C.white, borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,.28)' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${C.border}`, background: C.white }}>
          <div><strong style={{ color: C.ink }}>Datos individuales de la variante</strong><div style={{ color: C.muted, fontSize: 11, marginTop: 3 }}>{data.codigo || 'Sin código'}</div></div>
          <button type="button" onClick={onClose} style={outlineBtn}>Cerrar</button>
        </div>
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
          <p style={{ gridColumn: 'span 2', margin: 0, color: C.muted, fontSize: 11, lineHeight: 1.45 }}>Los campos públicos que queden vacíos heredan la información general compartida del producto.</p>
          <label style={lbl}>Código de la variante<input value={data.codigo} disabled={codeLocked} onChange={event => set('codigo', event.target.value.toUpperCase())} style={{ ...inp, marginTop: 5, ...(codeLocked ? { opacity: .65, cursor: 'not-allowed' } : {}) }} /></label>
          <div style={{ alignSelf: 'end', color: C.muted, fontSize: 10.5, paddingBottom: 10 }}>{codeLocked ? 'El código proviene de la asociación con el proveedor.' : 'Identificador único de esta presentación.'}</div>
          <label style={{ ...lbl, gridColumn: 'span 2' }}>Descripción individual<textarea value={data.description} onChange={event => set('description', event.target.value)} rows={4} style={{ ...inp, marginTop: 5, resize: 'vertical' }} /></label>
          <label style={{ ...lbl, gridColumn: 'span 2' }}>Descripción de inventario<textarea value={data.inventoryDescription} onChange={event => set('inventoryDescription', event.target.value)} rows={2} style={{ ...inp, marginTop: 5, resize: 'vertical' }} /></label>
          {fields.map(([label, field, type]) => <label key={field} style={lbl}>{label}<input type={type || 'text'} min={type === 'number' ? 0 : undefined} step="any" value={data[field] ?? ''} onChange={event => set(field, event.target.value)} style={{ ...inp, marginTop: 5 }} /></label>)}
        </div>
      </div>
    </div>
  )
}

function priceWithIva(priceWithTax, salePrice) {
  if (priceWithTax !== '' && priceWithTax != null && Number.isFinite(Number(priceWithTax))) {
    return Math.round(Number(priceWithTax) * 100) / 100
  }
  if (salePrice === '' || salePrice == null || !Number.isFinite(Number(salePrice))) return ''
  return Math.round(Number(salePrice) * 1.21 * 100) / 100
}

function splitVariantRulesBySupplierCode(rules, colorOptions = [], product = {}) {
  return (Array.isArray(rules) ? rules : []).flatMap(rule => {
    const supplierCodes = [...new Set((rule.supplierCodes || []).filter(Boolean))]
    const measure = parseMergeMeasure(rule.size)
    const savedColor = (Array.isArray(colorOptions) ? colorOptions : []).find(option =>
      String(option?.name || '').localeCompare(String(rule.color || ''), 'es-AR', { sensitivity: 'base' }) === 0
    )
    const savedTone = (Array.isArray(product.tones) ? product.tones : []).find(option =>
      String(option?.name || '').localeCompare(String(rule.tone || ''), 'es-AR', { sensitivity: 'base' }) === 0
    )
    const editable = {
      ...rule,
      color: rule.color || '', size: rule.size || '', tone: rule.tone || '', image: rule.image || '',
      colorHex: rule.colorHex || savedColor?.hex || '#CCCCCC',
      toneHex: rule.toneHex || savedTone?.hex || '#CCCCCC',
      productData: { ...variantProductDataFromSource(product, supplierCodes[0]), ...(rule.productData || {}) },
      sizeValue: measure.value || (!measure.unit ? rule.size || '' : ''), sizeUnit: measure.unit,
      precio_costo: rule.precio_costo ?? '', precio_venta: rule.precio_venta ?? '',
      precio_iva: rule.precio_iva ?? '', stock: rule.stock ?? '',
    }
    if (supplierCodes.length <= 1) return [{ ...editable, supplierCodes }]
    return supplierCodes.map((code, codeIndex) => ({
      ...editable,
      id: codeIndex === 0 ? editable.id : `split-${editable.id || 'rule'}-${codeIndex}`,
      supplierCodes: [code], productData: { ...editable.productData, codigo: code },
      // El stock compartido no se puede repartir con seguridad: queda en la
      // primera fila y las adicionales empiezan en cero para revisión manual.
      stock: codeIndex === 0 ? editable.stock : 0,
    }))
  })
}

function ensureCoverVariant(rules) {
  const list = Array.isArray(rules) ? rules : []
  if (!list.length) return list
  const explicitIndex = list.findIndex(rule => rule.isCover)
  const coverIndex = explicitIndex >= 0
    ? explicitIndex
    : Math.max(0, list.findIndex(rule => rule.image))
  return list.map((rule, index) => ({ ...rule, isCover: index === coverIndex }))
}

function legacyVariantRulesFromProduct(product = {}) {
  const colors = (product.colors || []).filter(option => option?.name)
  const sizes = (product.sizes || []).filter(option => option?.label)
  const tones = (product.tones || []).filter(option => option?.name)
  if (!colors.length && !sizes.length && !tones.length) return []
  const colorValues = colors.length ? colors : [null]
  const sizeValues = sizes.length ? sizes : [null]
  const toneValues = tones.length ? tones : [null]
  const hasExactStock = Object.keys(product.variantStock || {}).length > 0
  const rules = []
  for (const color of colorValues) for (const size of sizeValues) for (const tone of toneValues) {
    const sale = size?.price ?? tone?.price ?? color?.price ?? product.price ?? ''
    const tax = size?.priceWithTax ?? tone?.priceWithTax ?? color?.priceWithTax ?? priceWithIva('', sale)
    const cost = size?.priceCost ?? tone?.priceCost ?? color?.priceCost ?? product.priceCost ?? ''
    const rowKey = combineVariantRowKey(color?.name, tone?.name)
    const stock = hasExactStock ? Number(product.variantStock?.[rowKey]?.[size?.label || '_'] ?? 0) : null
    const measure = parseMergeMeasure(size?.label || product.medida || '')
    rules.push({
      id: `legacy-${rules.length}-${Date.now()}`, supplierCodes: [],
      color: color?.name || '', colorHex: color?.hex || '#CCCCCC', tone: tone?.name || '', toneHex: tone?.hex || '#CCCCCC',
      size: size?.label || '', sizeValue: measure.value, sizeUnit: measure.unit,
      image: size?.image || tone?.image || color?.image || '',
      precio_costo: cost, precio_venta: sale, precio_iva: tax, stock,
      productData: inheritingVariantProductData(product),
    })
  }
  if (!hasExactStock) {
    rules.unshift({
      id: `legacy-stock-${Date.now()}`, supplierCodes: [], color: '', colorHex: '#CCCCCC', tone: '', toneHex: '#CCCCCC',
      size: '', sizeValue: '', sizeUnit: '', image: '', precio_costo: '', precio_venta: '', precio_iva: '',
      stock: product.stock ?? 0, productData: inheritingVariantProductData(product), isStockFallback: true,
    })
  }
  return rules
}

function baseVariantRuleFromProduct(product = {}) {
  const measure = parseMergeMeasure(product.medida || '')
  return {
    id: `base-${Date.now()}`,
    isBase: true,
    isCover: true,
    supplierCodes: [],
    color: '', colorHex: '#CCCCCC', tone: '', toneHex: '#CCCCCC',
    size: product.medida || '', sizeValue: measure.value, sizeUnit: measure.unit,
    image: product.image || product.image_url || '',
    precio_costo: product.priceCost ?? product.precio_costo ?? '',
    precio_venta: product.price ?? product.precio_venta ?? '',
    precio_iva: product.priceWithTax ?? product.precio_iva ?? '',
    stock: product.stock ?? 0,
    productData: inheritingVariantProductData(product, product.codigo || ''),
  }
}

const EMPTY = {
  codigo: '', supplier: 'OTRO', inventoryDescription: '', grupo: '', subgrupo: '', medida: '',
  priceCost: '', priceWithTax: '',
  name: '', category: '', subcategory: '', productType: '',
  price: '', originalPrice: '',
  description: '', image: '', hoverImage: '', galleryImages: [],
  watts: '', amperes: '',
  lengthCm: '', widthCm: '', heightCm: '', weightKg: '',
  stock: '', colors: [], sizes: [], tones: [], variantStock: {}, variantRules: [],
  published: true, isNew: false, bestSeller: false, stockInmediato: false, diasEntregaPedido: '',
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
    subgrupo:    inv.subgrupo || '',
    medida:      inv.medida || '',
    priceCost:   inv.precio_costo ?? '',
    priceWithTax: priceWithIva(inv.precio_iva, inv.precio_venta),
    name:        inv.name || inv.descripcion || '',
    description: inv.description_larga || inv.descripcion || '',
    category:    inv.category || guessCategory(inv.grupo, inv.subgrupo),
    subcategory: inv.subcategory || '',
    price:       inv.precio_venta ?? inv.precio_costo ?? '',
    originalPrice: inv.original_price ?? '',
    stock:       inv.stock ?? '',

    image:       inv.image_url || '',
    hoverImage:  inv.hover_image_url || '',
    galleryImages: Array.isArray(inv.gallery_images) ? inv.gallery_images : [],
    colorTemp:   inv.color_temp,
    ipRating:    inv.ip_rating,
    watts:       inv.watts,
    amperes:     inv.amperes,
    material:    inv.material,
    productType: inv.product_type || inv.cable_type || '',
    lengthCm:    inv.length_cm ?? '',
    widthCm:     inv.width_cm ?? '',
    heightCm:    inv.height_cm ?? '',
    weightKg:    inv.weight_kg ?? '',
    colors:      inv.color_options || [],
    sizes:       inv.size_options || [],
    tones:       inv.tone_options || [],
    variantStock: inv.variant_stock || {},
    variantRules: conPriceSourceIndex(inv.variant_rules || []),
    published:   Boolean(inv.published),
    isNew:       Boolean(inv.is_new),
    bestSeller:  Boolean(inv.best_seller),
    stockInmediato: Boolean(inv.stock_inmediato),
    diasEntregaPedido: inv.dias_entrega_pedido ?? '',
  }
}

// El backend guarda a quién sigue cada variante por id; el editor trabaja con el
// índice de la fila, porque una variante recién agregada todavía no tiene id.
function conPriceSourceIndex(rules) {
  const indicePorId = new Map(rules.map((rule, index) => [rule.id, index]))
  return rules.map(rule => ({
    ...rule,
    priceSourceIndex: rule.priceSourceRuleId != null && indicePorId.has(rule.priceSourceRuleId)
      ? indicePorId.get(rule.priceSourceRuleId)
      : null,
    priceSourcePercent: rule.priceSourcePercent == null ? 0 : Number(rule.priceSourcePercent),
  }))
}

// Al borrar una fila los índices se corren: sin reasignarlos, una variante que
// seguía a la tercera pasaría a seguir a otra distinta sin aviso.
function remapPriceSourceIndexes(rules, removedIndex) {
  return rules.map(rule => {
    const source = rule.priceSourceIndex
    if (source == null) return rule
    if (source === removedIndex) return { ...rule, priceSourceIndex: null, priceSourcePercent: 0 }
    return { ...rule, priceSourceIndex: source > removedIndex ? source - 1 : source }
  })
}

// Precio que va a quedar guardado para una variante que sigue a otra. Se calcula
// también acá para que el admin lo vea antes de guardar, no después de importar.
function precioDerivado(valorOrigen, percent) {
  const base = Number(valorOrigen)
  if (valorOrigen === '' || valorOrigen == null || !Number.isFinite(base)) return ''
  const factor = 1 + (Number(percent) || 0) / 100
  if (!Number.isFinite(factor) || factor <= 0) return ''
  return Math.round(base * factor * 100) / 100
}

function toUnifiedProductPayload(data) {
  const payload = {
    codigo: data.codigo,
    supplier: data.supplier || 'OTRO',
    descripcion: data.inventoryDescription || null,
    grupo: data.grupo || null,
    subgrupo: data.subgrupo || null,
    medida: data.medida || null,
    precio_costo: data.priceCost,
    precio_venta: data.price,
    precio_iva: data.priceWithTax,
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
    gallery_images: Array.isArray(data.galleryImages) ? data.galleryImages.filter(Boolean) : [],
    color_options: data.colors || [],
    size_options: data.sizes || [],
    tone_options: data.tones || [],
    variant_stock: data.variantStock || {},
    color_temp: data.colorTemp || null,
    ip_rating: data.ipRating || null,
    watts: data.watts === '' || data.watts == null ? null : Number(data.watts),
    amperes: data.amperes === '' || data.amperes == null ? null : Number(data.amperes),
    material: data.material || null,
    published: Boolean(data.published),
    is_new: Boolean(data.isNew),
    best_seller: Boolean(data.bestSeller),
    stock_inmediato: Boolean(data.stockInmediato),
    dias_entrega_pedido: data.diasEntregaPedido === '' || data.diasEntregaPedido == null ? null : Number(data.diasEntregaPedido),
  }
  if (data.stock !== undefined) payload.stock = data.stock === '' ? 0 : Number(data.stock)
  return payload
}

function ProductModal({ product, onSave, onClose, onVariantsChanged, publishOnSave = false }) {
  const { currencySettings, categoryTree, updateProductVariantRules, detachProductVariant } = useAdmin()
  const isNew = !product
  const [form, setForm] = useState(() => {
    if (isNew) return { ...EMPTY, variantRules: [baseVariantRuleFromProduct()] }
    const storedRules = splitVariantRulesBySupplierCode(product.variantRules, product.colors, product)
    const legacyRules = legacyVariantRulesFromProduct(product)
    const variantRules = ensureCoverVariant(storedRules.length ? storedRules : legacyRules.length ? legacyRules : [baseVariantRuleFromProduct(product)])
    if (variantRules.length && product.image && !variantRules.some(rule => rule.image)) {
      variantRules[0] = { ...variantRules[0], image: product.image }
    }
    return {
    ...EMPTY, ...product,
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
    tones:         product.tones || [],
    variantStock:  product.variantStock || {},
    variantRules,
  }})
  const hasGroupedRules = form.variantRules.length > 0
  const hadCombinedSupplierCodes = (product?.variantRules || []).some(rule => (rule.supplierCodes || []).length > 1)
  const [useVariantStock, setUseVariantStock] = useState(
    () => Object.keys(product?.variantStock || {}).length > 0
  )
  const initialFormSnapshotRef = useRef(JSON.stringify(form))
  const initialUseVariantStockRef = useRef(useVariantStock)
  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(form) !== initialFormSnapshotRef.current || useVariantStock !== initialUseVariantStockRef.current,
    [form, useVariantStock]
  )

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const willBePublished = publishOnSave || form.published
  let groupedConflict = null
  for (let left = 0; left < form.variantRules.length && !groupedConflict; left++) {
    for (let right = left + 1; right < form.variantRules.length; right++) {
      if (mergeRuleSpecificity(form.variantRules[left]) === mergeRuleSpecificity(form.variantRules[right]) &&
          mergeRulesOverlap(form.variantRules[left], form.variantRules[right])) {
        groupedConflict = [left, right]
        break
      }
    }
  }
  const groupedConflictCodes = groupedConflict
    ? groupedConflict.map(index => form.variantRules[index]?.supplierCodes?.[0]).filter(Boolean)
    : []
  const groupedGridColumns = 'minmax(205px,1.25fr) 142px 190px 190px 90px 90px 82px 60px 58px'
  const ruleNumbers = field => form.variantRules
    .map(rule => rule[field])
    .filter(value => value !== '' && value != null)
    .map(Number)
    .filter(value => Number.isFinite(value) && value >= 0)
  const minRuleValue = field => {
    const values = ruleNumbers(field)
    return values.length ? Math.min(...values) : ''
  }
  const variantSummary = {
    cost: minRuleValue('precio_costo'),
    sale: minRuleValue('precio_venta'),
    tax: (() => {
      const values = form.variantRules
        .map(rule => priceWithIva(rule.precio_iva, rule.precio_venta))
        .filter(value => value !== '' && value != null)
        .map(Number)
        .filter(value => Number.isFinite(value) && value >= 0)
      return values.length ? Math.min(...values) : ''
    })(),
    stock: form.variantRules.reduce((total, rule) => total + Math.max(0, Number(rule.stock) || 0), 0),
  }
  const variantCode = rule => String(rule.supplierCodes?.[0] || rule.productData?.codigo || '').trim()
  const allVariantsHaveCode = form.variantRules.every(rule => variantCode(rule))
  const valid = form.variantRules.length > 0 && allVariantsHaveCode && !groupedConflict &&
    (!willBePublished || (form.name.trim() && variantSummary.sale > 0))
  const subOptions = getSubcategoryOptions(form.category, categoryTree).map(node => node.label)
  const typeOptions = getProductTypeOptions(form.category, form.subcategory, categoryTree).map(node => node.label)
  const categoryOptions = categoryTree.map(node => ({ value: getCategoryValue(node), label: node.label }))
  const usdArsRate = Number(currencySettings.usdArsRate) || 1510

  const setColor = (idx, key, value) => setForm(f => ({
    ...f,
    colors: f.colors.map((c, i) => i === idx ? { ...c, [key]: value } : c),
  }))
  // El primer color que se agrega arranca con la imagen principal ya cargada
  // (representa el aspecto "de base" del producto, ej. blanco): si no se
  // replica acá, esa imagen deja de verse en la tienda en cuanto se suma
  // cualquier otro color, porque el selector solo muestra colores cargados.
  const addColor = () => setForm(f => ({
    ...f,
    colors: [...f.colors, {
      name: '', hex: '#000000',
      image: f.colors.length === 0 ? f.image : '',
      price: '',
    }],
  }))
  const removeColor = (idx) => setForm(f => ({ ...f, colors: f.colors.filter((_, i) => i !== idx) }))
  // Agrega un color predeterminado (Negro/Rojo/Azul/...) si todavía no está cargado.
  const addColorPreset = (preset) => setForm(f => {
    const already = f.colors.some(c => c.name?.trim().toLowerCase() === preset.name.toLowerCase())
    if (already) return f
    return {
      ...f,
      colors: [...f.colors, {
        name: preset.name, hex: preset.hex,
        image: f.colors.length === 0 ? f.image : '',
        price: '',
      }],
    }
  })

  const setSize = (idx, key, value) => setForm(f => ({
    ...f,
    sizes: f.sizes.map((s, i) => i === idx ? { ...s, [key]: value } : s),
  }))
  const addSize = () => setForm(f => ({ ...f, sizes: [...f.sizes, { label: '', price: '' }] }))
  const removeSize = (idx) => setForm(f => ({ ...f, sizes: f.sizes.filter((_, i) => i !== idx) }))

  const setTone = (idx, key, value) => setForm(f => ({
    ...f,
    tones: f.tones.map((t, i) => i === idx ? { ...t, [key]: value } : t),
  }))
  const addTone = () => setForm(f => ({ ...f, tones: [...f.tones, { name: '', hex: '#F5D08A', price: '' }] }))
  const removeTone = (idx) => setForm(f => ({ ...f, tones: f.tones.filter((_, i) => i !== idx) }))
  // Agrega un tono predeterminado (Cálido/Neutro/Frío) si todavía no está cargado.
  const addTonePreset = (preset) => setForm(f => {
    const already = f.tones.some(t => t.name?.trim().toLowerCase() === preset.name.toLowerCase())
    if (already) return f
    return { ...f, tones: [...f.tones, { name: preset.name, hex: preset.hex, price: '' }] }
  })

  // Stock por combinación exacta color×tono×medida. Filas = combinación de
  // color y tono (ver combineVariantRowKey — una sola fila implícita '_' si
  // el producto no tiene ninguno de los dos), columnas = medidas (o una sola
  // columna implícita '_' si no tiene medidas).
  const filledColorNames = form.colors.map(c => c.name).filter(Boolean)
  const filledSizeLabels = form.sizes.map(s => s.label).filter(Boolean)
  const filledToneNames = form.tones.map(t => t.name).filter(Boolean)
  const colorRowKeys = filledColorNames.length ? filledColorNames : ['']
  const toneRowKeys = filledToneNames.length ? filledToneNames : ['']
  const variantRows = colorRowKeys.flatMap(color => toneRowKeys.map(tone => combineVariantRowKey(color, tone)))
  const variantCols = filledSizeLabels.length ? filledSizeLabels : ['_']
  const setVariantCell = (rowKey, colKey, value) => setForm(f => ({
    ...f,
    variantStock: {
      ...f.variantStock,
      [rowKey]: { ...(f.variantStock[rowKey] || {}), [colKey]: value },
    },
  }))
  const setGroupedRule = (index, field, value) => setForm(current => ({
    ...current,
    variantRules: current.variantRules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, [field]: value } : rule),
  }))
  const setGroupedMeasure = (index, field, value) => setForm(current => ({
    ...current,
    variantRules: current.variantRules.map((rule, ruleIndex) => {
      if (ruleIndex !== index) return rule
      const next = { ...rule, [field]: value }
      next.size = formatMergeMeasure(next.sizeValue, next.sizeUnit)
      return next
    }),
  }))
  const addGroupedRule = () => setForm(current => ({
    ...current,
    variantRules: [...current.variantRules, {
      id: `manual-${Date.now()}`, supplierCodes: [], color: '', colorHex: '#CCCCCC', size: '', sizeValue: '', sizeUnit: '', tone: '', toneHex: '#CCCCCC',
      productData: { ...inheritingVariantProductData(product || current), codigo: '' }, image: '',
      isCover: false,
      precio_costo: '', precio_venta: '', precio_iva: '', stock: 0,
      priceSourceIndex: null, priceSourcePercent: 0,
    }],
  }))
  const removeGroupedRule = index => setForm(current => ({
    ...current,
    variantRules: current.variantRules.length <= 1
      ? current.variantRules
      : ensureCoverVariant(remapPriceSourceIndexes(
        current.variantRules.filter((_, ruleIndex) => ruleIndex !== index),
        index
      )),
  }))
  const variantStockTotal = Object.values(form.variantStock)
    .flatMap(row => Object.values(row || {}))
    .reduce((sum, v) => sum + (Number(v) || 0), 0)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [variantDetailsIndex, setVariantDetailsIndex] = useState(null)
  const [detachCandidate, setDetachCandidate] = useState(null)
  const [detaching, setDetaching] = useState(false)
  const [discardChangesOpen, setDiscardChangesOpen] = useState(false)
  const didSaveRef = useRef(false)

  useEffect(() => {
    if (!hasUnsavedChanges || didSaveRef.current) return undefined

    const warnBeforeUnload = event => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [hasUnsavedChanges])

  const requestClose = () => {
    if (saving || detaching) return
    if (hasUnsavedChanges) {
      setDiscardChangesOpen(true)
      return
    }
    onClose()
  }

  const handleDetachVariant = async () => {
    if (!detachCandidate || detaching) return
    setDetaching(true)
    setSaveError('')
    try {
      await detachProductVariant(product.id, detachCandidate.id)
      try {
        await onVariantsChanged?.()
      } catch {
        // La separación ya fue confirmada por el servidor; el próximo refresco
        // recuperará la lista aunque falle esta actualización visual inmediata.
      }
      setDetachCandidate(null)
      onClose()
    } catch (error) {
      setSaveError(error.message || 'No se pudo separar la variante')
      setDetachCandidate(null)
    } finally {
      setDetaching(false)
    }
  }

  const handleSave = async () => {
    if (!valid || saving) return
    setSaving(true)
    setSaveError('')
    const primaryRule = form.variantRules[0]
    const coverRule = form.variantRules.find(rule => rule.isCover) || primaryRule
    const primaryData = primaryRule?.productData || {}
    const out = { ...form }
    out.codigo = form.codigo.trim() || variantCode(primaryRule)
    out.supplier = String(primaryData.supplier || form.supplier || 'OTRO').trim().toUpperCase()
    out.inventoryDescription = String(primaryData.inventoryDescription || form.inventoryDescription || '').trim()
    out.lengthCm = primaryData.lengthCm === '' || primaryData.lengthCm == null ? null : Number(primaryData.lengthCm)
    out.widthCm = primaryData.widthCm === '' || primaryData.widthCm == null ? null : Number(primaryData.widthCm)
    out.heightCm = primaryData.heightCm === '' || primaryData.heightCm == null ? null : Number(primaryData.heightCm)
    out.weightKg = primaryData.weightKg === '' || primaryData.weightKg == null ? null : Number(primaryData.weightKg)
    out.watts = primaryData.watts === '' || primaryData.watts == null ? null : Number(primaryData.watts)
    out.amperes = primaryData.amperes === '' || primaryData.amperes == null ? null : Number(primaryData.amperes)
    out.priceCost = variantSummary.cost === '' ? null : variantSummary.cost
    out.price = variantSummary.sale === '' ? null : variantSummary.sale
    out.priceWithTax = variantSummary.tax === '' ? null : variantSummary.tax
    out.stock = variantSummary.stock

    out.image = coverRule?.image || primaryRule?.image || form.image || null
    // El hover identifica visualmente al producto en el listado. Las variantes
    // conservan su imagen principal propia, pero comparten esta segunda imagen.
    out.hoverImage = form.hoverImage || null
    out.originalPrice = form.originalPrice ? Number(form.originalPrice) : null
    if (publishOnSave) out.published = true
    out.colors = form.colors.filter(c => c.name?.trim()).map(c => ({ ...c, price: c.price === '' || c.price == null ? null : Number(c.price) }))
    out.sizes  = form.sizes.filter(s => s.label.trim()).map(s => ({ ...s, price: s.price === '' || s.price == null ? null : Number(s.price) }))
    out.tones  = form.tones.filter(t => t.name?.trim()).map(t => ({ ...t, price: t.price === '' || t.price == null ? null : Number(t.price) }))

    out.variantStock = {}
    try {
      const savedProduct = await onSave(out)
      const productId = product?.id || savedProduct?.id
      if (!productId) throw new Error('El producto se creó pero no se recibió su identificador')
      await updateProductVariantRules(productId, out.variantRules)
      await onVariantsChanged?.()
      didSaveRef.current = true
      onClose()
    } catch (error) {
      setSaveError(error.message || 'No se pudieron guardar los cambios')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onMouseDown={event => { if (event.target === event.currentTarget) requestClose() }}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontFamily: ADMIN_FONT, fontSize: 22, color: C.ink, margin: 0, fontWeight: 500 }}>
              {publishOnSave ? 'Configurar y publicar' : isNew ? 'Nuevo producto' : 'Editar producto'}
            </h2>
            {hasUnsavedChanges && (
              <span role="status" style={{ padding: '4px 9px', borderRadius: 999, background: C.amberLight, color: C.amberDark, fontSize: 10.5, fontWeight: 700 }}>
                Cambios sin guardar
              </span>
            )}
          </div>
          <button onClick={requestClose} disabled={saving || detaching} aria-label="Cerrar editor" style={{ background: 'none', border: 'none', cursor: saving || detaching ? 'not-allowed' : 'pointer', color: C.text3, fontSize: 18, lineHeight: 1, opacity: saving || detaching ? .5 : 1 }}>✕</button>
        </div>

        <div className="adm-product-modal__body" style={{ overflowY: 'auto', padding: '24px 28px', flex: 1, minHeight: 0 }}>
        <div className="adm-product-modal__columns">
          <section className="adm-product-modal__section">
          <h3 style={{ ...sectionTitle, margin: '0 0 8px' }}>Resumen calculado</h3>
          <p style={{ fontSize: 11, color: C.muted, margin: '0 0 14px', lineHeight: 1.45 }}>
            Los códigos, precios, stock, imágenes y características se cargan en las variantes. Este resumen se actualiza automáticamente.
          </p>
          <div className="adm-product-modal__fields">
            <FormField label="Cantidad de variantes" value={String(form.variantRules.length)} onChange={() => {}} disabled />
            <FormField label="Stock total" value={String(variantSummary.stock)} onChange={() => {}} disabled />
            <FormField label="Costo mínimo (calculado)" value={variantSummary.cost} onChange={() => {}} type="number" disabled />
            <FormField label="Precio desde (calculado)" value={variantSummary.sale} onChange={() => {}} type="number" disabled />
            <FormField label="IVA mínimo (calculado)" value={variantSummary.tax} onChange={() => {}} type="number" disabled />
            <div style={{ gridColumn: 'span 2', color: C.muted, fontSize: 11.5 }}>
              Equivalentes con US$ 1 = {fmt(usdArsRate)}: costo {variantSummary.cost !== '' ? fmtUsd(Number(variantSummary.cost) / usdArsRate) : '—'} · venta {variantSummary.sale !== '' ? fmtUsd(Number(variantSummary.sale) / usdArsRate) : '—'} · con IVA {variantSummary.tax !== '' ? fmtUsd(Number(variantSummary.tax) / usdArsRate) : '—'}
            </div>
          </div>
          </section>

          <section className="adm-product-modal__section adm-product-modal__section--store">
            <h3 style={{ ...sectionTitle, margin: '0 0 8px' }}>Información general compartida</h3>
            <p style={{ fontSize: 11, color: C.muted, margin: '0 0 14px', lineHeight: 1.45 }}>
              Estos datos identifican al grupo en la tienda. Cada variante puede sobrescribir su ficha desde “Editar detalles”.
            </p>
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
              {categoryOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
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

          <div style={{ gridColumn: 'span 2' }}>
            <ImageFileField
              label="Imagen hover del producto (opcional)"
              value={form.hoverImage}
              onChange={value => set('hoverImage', value)}
              productId={product?.id}
            />
            <p style={{ fontSize: 11, color: C.muted, margin: '5px 0 0', lineHeight: 1.45 }}>
              Reemplaza la imagen activa al pasar el cursor sobre la tarjeta del producto, sin importar qué variante esté seleccionada.
            </p>
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            <MultiImageField
              label="Galería de fotos (opcional)"
              hint="Se muestran como miniaturas debajo de la foto principal en la página del producto."
              value={form.galleryImages}
              onChange={value => set('galleryImages', value)}
              productId={product?.id}
            />
          </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={lbl}>Visibilidad en la tienda</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 38 }}>
                  {!publishOnSave && <Toggle value={form.published} onChange={v => set('published', v)} label="Publicar en la tienda" />}
                  {publishOnSave && <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: C.green }} />}
                  <span style={{ fontSize: 13, color: willBePublished ? C.green : C.text3, fontWeight: 600 }}>
                    {publishOnSave ? 'Se publicará al guardar' : form.published ? 'Publicado' : 'Sin publicar (borrador)'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={lbl}>Etiqueta "Nuevo"</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 38 }}>
                  <Toggle value={form.isNew} onChange={v => set('isNew', v)} label={'Etiqueta "Nuevo"'} />
                  <span style={{ fontSize: 13, color: form.isNew ? C.green : C.text3, fontWeight: 600 }}>
                    {form.isNew ? 'Se muestra en la tarjeta' : 'No se muestra'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={lbl}>Etiqueta "Más vendido"</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 38 }}>
                  <Toggle value={form.bestSeller} onChange={v => set('bestSeller', v)} label={'Etiqueta "Más vendido"'} />
                  <span style={{ fontSize: 13, color: form.bestSeller ? C.green : C.text3, fontWeight: 600 }}>
                    {form.bestSeller ? 'Se muestra en la tarjeta' : 'No se muestra'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={lbl}>Stock inmediato</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 38 }}>
                  <Toggle value={form.stockInmediato} onChange={v => set('stockInmediato', v)} label="Stock inmediato" />
                  <span style={{ fontSize: 13, color: form.stockInmediato ? C.green : C.text3, fontWeight: 600 }}>
                    {form.stockInmediato
                      ? `Está en el local — despacho en ${currencySettings.diasDespachoInmediato ?? 1} día(s)`
                      : `Se pide al proveedor — ${form.diasEntregaPedido || currencySettings.diasReposicion || 3} día(s)`}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: C.muted }}>
                  Todo lo publicado se puede comprar. Esto sólo cambia el plazo que ve el
                  cliente. Para sacar un producto de venta, despublicalo.
                </span>
                {/* El override sólo aplica a lo que hay que reponer: si está en
                    el local, el plazo es el de despacho de la tienda. */}
                {!form.stockInmediato && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                    <label style={lbl}>Plazo de reposición (días hábiles)</label>
                    <input
                      type="number" min="1" step="1"
                      value={form.diasEntregaPedido}
                      onChange={e => set('diasEntregaPedido', e.target.value)}
                      placeholder={`Default de la tienda: ${currencySettings.diasReposicion || 3}`}
                      style={{ ...inp, maxWidth: 240 }}
                    />
                    <span style={{ fontSize: 11, color: C.muted }}>
                      Sólo para el proveedor que tarda distinto al resto. Vacío = default
                      de la tienda ({currencySettings.diasReposicion || 3} días).
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {isNew && !hasGroupedRules && <>
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

          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            {COLOR_PRESETS.map(preset => {
              const already = form.colors.some(c => c.name?.trim().toLowerCase() === preset.name.toLowerCase())
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => addColorPreset(preset)}
                  disabled={already}
                  style={{
                    ...outlineBtn, padding: '5px 12px', fontSize: 11,
                    display: 'flex', alignItems: 'center', gap: 6,
                    opacity: already ? 0.5 : 1, cursor: already ? 'default' : 'pointer',
                  }}
                >
                  <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: '50%', background: preset.hex, border: `1px solid ${C.border}` }} />
                  {already ? `${preset.name} agregado` : preset.name}
                </button>
              )
            })}
          </div>

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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <ImageFileField
                      compact
                      value={c.image}
                      onChange={value => setColor(idx, 'image', value)}
                      productId={product?.id}
                    />
                    {form.image && c.image !== form.image && (
                      <button
                        type="button"
                        onClick={() => setColor(idx, 'image', form.image)}
                        style={{
                          background: 'none', border: 'none', padding: 0,
                          fontSize: 10.5, fontFamily: ADMIN_FONT, color: C.text3,
                          textDecoration: 'underline', textAlign: 'left', cursor: 'pointer',
                        }}
                      >
                        Usar imagen principal
                      </button>
                    )}
                  </div>
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

        {/* Variantes de tono (luz cálida/neutra/fría, típico de focos y reflectores) */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={lbl}>Tonos (opcional)</label>
            <button type="button" onClick={addTone} style={{ ...outlineBtn, padding: '5px 12px', fontSize: 11 }}>
              + Agregar tono
            </button>
          </div>
          <p style={{ fontSize: 11.5, color: C.muted, margin: '0 0 10px' }}>
            Para focos, reflectores y otros productos de luz: cargá los tonos disponibles (ej: Cálido, Neutro, Frío) y el comprador va a poder elegir uno en la página del producto. Es un eje aparte del color (un producto puede tener color de carcasa y tono de luz al mismo tiempo). Si le cargás un precio a un tono, ese precio reemplaza al precio de venta cuando el comprador elige ese tono; si lo dejás vacío, usa el precio de venta normal.
          </p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {TONE_PRESETS.map(preset => {
              const already = form.tones.some(t => t.name?.trim().toLowerCase() === preset.name.toLowerCase())
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => addTonePreset(preset)}
                  disabled={already}
                  style={{
                    ...outlineBtn, padding: '5px 12px', fontSize: 11,
                    display: 'flex', alignItems: 'center', gap: 6,
                    opacity: already ? 0.5 : 1, cursor: already ? 'default' : 'pointer',
                  }}
                >
                  <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: '50%', background: preset.hex, border: `1px solid ${C.border}` }} />
                  {already ? `${preset.name} agregado` : preset.name}
                </button>
              )
            })}
          </div>

          {form.tones.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 }}>
              {form.tones.map((t, idx) => (
                <div key={idx} style={{
                  display: 'grid', gridTemplateColumns: '38px minmax(120px, 1fr) 120px auto', gap: 8, alignItems: 'center',
                  padding: 8, background: C.white, border: `1px solid ${C.border}`, borderRadius: 6,
                }}>
                  <input
                    type="color"
                    value={t.hex || '#F5D08A'}
                    onChange={e => setTone(idx, 'hex', e.target.value)}
                    title="Color representativo del tono"
                    style={{ width: 34, height: 34, padding: 0, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    value={t.name}
                    onChange={e => setTone(idx, 'name', e.target.value)}
                    placeholder="Nombre (ej: Cálido)"
                    style={inp}
                  />
                  <input
                    type="number"
                    min={0}
                    value={t.price ?? ''}
                    onChange={e => setTone(idx, 'price', e.target.value)}
                    placeholder="Precio propio"
                    title="Precio de venta propio de este tono (ARS). Vacío = usa el precio de venta del producto."
                    style={inp}
                  />
                  <button
                    type="button"
                    onClick={() => removeTone(idx)}
                    aria-label="Quitar tono"
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
        </>}

        {(
          <div style={{ marginTop: 18, padding: 14, border: `1px solid ${C.border}`, borderRadius: 10, background: '#F8FAFC' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
              <div>
                <label style={{ ...lbl, color: C.ink }}>Variantes</label>
                <p style={{ fontSize: 11, color: C.muted, margin: '4px 0 0', lineHeight: 1.4 }}>
                  La tienda sólo permite combinaciones cubiertas por estas filas. Cada variante concentra código, Color + Tono + Medida, ficha individual, precio, foto y stock; “Cualquiera” funciona como comodín para ese atributo. Marcá “Portada” en la variante que debe verse primero en el listado y en la ficha.
                </p>
              </div>
              <button type="button" onClick={addGroupedRule} style={{ ...outlineBtn, padding: '5px 10px', fontSize: 10.5, whiteSpace: 'nowrap' }}>+ Agregar variante</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 1180 }}>
                <div style={{ display: 'grid', gridTemplateColumns: groupedGridColumns, gap: 7, padding: '5px 7px', fontSize: 9.5, color: C.text3, fontWeight: 700, textTransform: 'uppercase' }}>
                  <span>Variante / código</span><span>Medida</span><span>Color</span><span>Tono</span>
                  <span>Precio s/IVA</span><span>Precio c/IVA</span><span>Costo</span><span>Stock</span><span />
                </div>
                {form.variantRules.map((rule, index) => {
                  const specificity = mergeRuleSpecificity(rule)
                  const inConflict = groupedConflict?.includes(index)
                  const hasSupplierCode = Boolean(rule.supplierCodes?.length)
                  const displayedCode = variantCode(rule)
                  return (
                    <div key={rule.id || index} style={{ display: 'grid', gridTemplateColumns: groupedGridColumns, gap: 7, alignItems: 'center', padding: 7, border: `1px solid ${inConflict ? C.red : C.border}`, borderRadius: 7, background: C.white, marginBottom: 5 }}>
                      <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
                        <VariantImageField
                          value={rule.image}
                          code={rule.supplierCodes?.[0] || `variante ${index + 1}`}
                          onChange={value => setGroupedRule(index, 'image', value)}
                        />
                        <span style={{ minWidth: 0, display: 'grid', gap: 5, fontSize: 10.5, color: C.ink }}>
                          {hasSupplierCode
                            ? <strong title={displayedCode} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayedCode}</strong>
                            : <input
                                value={rule.productData?.codigo || ''}
                                onChange={event => setGroupedRule(index, 'productData', { ...(rule.productData || {}), codigo: event.target.value.toUpperCase() })}
                                placeholder="Código *"
                                aria-label={`Código de variante ${index + 1}`}
                                style={{ ...inp, minWidth: 0, height: 26, padding: '3px 6px', fontSize: 10 }}
                              />}
                          <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 7 }}>
                            <small style={{ color: index === 0 || specificity === 3 ? C.green : C.muted, fontSize: 9, fontWeight: 600 }}>{index === 0 ? 'Variante base' : specificity === 3 ? 'Exacta' : `Fallback · ${specificity}/3`}</small>
                            <label title="Esta variante será la imagen inicial del listado y de la ficha" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: rule.isCover ? C.red : C.text3, fontSize: 9, fontWeight: 700, cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name={`cover-variant-${product?.id || 'new'}`}
                                checked={Boolean(rule.isCover)}
                                onChange={() => setForm(current => ({
                                  ...current,
                                  variantRules: current.variantRules.map((item, ruleIndex) => ({ ...item, isCover: ruleIndex === index })),
                                }))}
                                style={{ margin: 0 }}
                              />
                              Portada
                            </label>
                          </span>
                          <button type="button" onClick={() => setVariantDetailsIndex(index)} style={{ border: 'none', background: 'none', padding: 0, color: '#2563EB', cursor: 'pointer', textAlign: 'left', fontSize: 9.5 }}>Editar detalles</button>
                          {!hasSupplierCode && (
                            <PriceFollowField
                              rules={form.variantRules}
                              index={index}
                              onChange={(sourceIndex, percent) => setForm(current => ({
                                ...current,
                                variantRules: current.variantRules.map((item, ruleIndex) => ruleIndex === index
                                  ? { ...item, priceSourceIndex: sourceIndex, priceSourcePercent: sourceIndex == null ? 0 : percent }
                                  : item),
                              }))}
                            />
                          )}
                        </span>
                      </span>
                      <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 64px', gap: 5 }}>
                        <input inputMode="decimal" value={rule.sizeValue ?? ''} onChange={event => setGroupedMeasure(index, 'sizeValue', event.target.value)} placeholder="Cantidad" aria-label="Cantidad de la medida" style={{ ...inp, minWidth: 0, height: 32, padding: '5px 7px', fontSize: 10.5 }} />
                        <select value={rule.sizeUnit ?? ''} onChange={event => setGroupedMeasure(index, 'sizeUnit', event.target.value)} aria-label="Unidad de medida" style={{ ...inp, minWidth: 0, height: 32, padding: '5px 4px', fontSize: 10.5 }}>
                          <option value="">Unidad</option>
                          {MEASURE_UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                        </select>
                      </span>
                      <VariantColorField
                        name={rule.color}
                        hex={rule.colorHex}
                        code={rule.supplierCodes?.[0] || `variante ${index + 1}`}
                        onChange={color => setForm(current => ({
                          ...current,
                          variantRules: current.variantRules.map((item, ruleIndex) => ruleIndex === index ? { ...item, color: color.name, colorHex: color.hex } : item),
                        }))}
                      />
                      <VariantToneField
                        value={rule.tone}
                        hex={rule.toneHex}
                        code={rule.supplierCodes?.[0] || `variante ${index + 1}`}
                        onChange={tone => setForm(current => ({
                          ...current,
                          variantRules: current.variantRules.map((item, ruleIndex) => ruleIndex === index ? { ...item, tone: tone.name, toneHex: tone.hex } : item),
                        }))}
                      />
                      {(() => {
                        // Una variante que sigue a otra muestra el precio ya calculado y
                        // no se edita: el número lo manda la variante de origen.
                        const origen = rule.priceSourceIndex == null ? null : form.variantRules[rule.priceSourceIndex]
                        const derivado = campo => precioDerivado(
                          campo === 'precio_iva' ? priceWithIva(origen?.precio_iva, origen?.precio_venta) : origen?.[campo],
                          rule.priceSourcePercent
                        )
                        const estiloDerivado = { ...inp, height: 32, padding: '5px 7px', fontSize: 10.5, background: C.paper, color: C.text3, cursor: 'not-allowed' }
                        const campoPrecio = (campo, valorPropio, etiqueta) => origen
                          ? <input type="number" readOnly value={derivado(campo)} aria-label={`${etiqueta} (sigue a otra variante)`} title={`Lo define ${String(origen.supplierCodes?.[0] || origen.productData?.codigo || 'la variante seguida')}`} style={estiloDerivado} />
                          : <input type="number" min="0" value={valorPropio} onChange={event => setGroupedRule(index, campo, event.target.value)} aria-label={etiqueta} style={{ ...inp, height: 32, padding: '5px 7px', fontSize: 10.5 }} />
                        return (
                          <>
                            {campoPrecio('precio_venta', rule.precio_venta, 'Precio de venta')}
                            {campoPrecio('precio_iva', priceWithIva(rule.precio_iva, rule.precio_venta), 'Precio con IVA')}
                            {campoPrecio('precio_costo', rule.precio_costo, 'Precio de costo')}
                          </>
                        )
                      })()}
                      <input type="number" min="0" step="1" value={rule.stock} onChange={event => setGroupedRule(index, 'stock', event.target.value)} aria-label="Stock" style={{ ...inp, height: 32, padding: '5px 7px', fontSize: 10.5 }} />
                      {hasSupplierCode && form.variantRules.length > 1
                        ? <button type="button" onClick={() => setDetachCandidate(rule)} disabled={saving || detaching} title="Sacar del grupo y crear un producto individual" style={{ ...outlineBtn, height: 27, padding: '3px 6px', color: C.red, borderColor: '#FCA5A5', fontSize: 9.5 }}>Separar</button>
                        : <button type="button" onClick={() => removeGroupedRule(index)} disabled={form.variantRules.length === 1} title={form.variantRules.length === 1 ? 'El producto debe conservar al menos una variante' : 'Eliminar variante'} aria-label="Eliminar variante" style={{ ...iconBtn, width: 26, height: 26, color: C.red, opacity: form.variantRules.length === 1 ? .35 : 1, cursor: form.variantRules.length === 1 ? 'not-allowed' : 'pointer' }}>×</button>}
                    </div>
                  )
                })}
                {!form.variantRules.length && <div style={{ padding: '18px 8px', color: C.red, fontSize: 11.5 }}>El producto necesita al menos una variante.</div>}
              </div>
            </div>
            {hadCombinedSupplierCodes && <div style={{ marginTop: 8, color: C.muted, fontSize: 10.5 }}>Se separaron automáticamente los códigos que estaban juntos. Diferenciá sus atributos y revisá el stock antes de guardar.</div>}
            {!allVariantsHaveCode && <div style={{ marginTop: 8, color: C.red, fontSize: 10.5 }}>Todas las variantes necesitan un código. Completá el campo “Código” de cada fila.</div>}
            {groupedConflict && <div style={{ marginTop: 8, color: C.red, fontSize: 10.5 }}>
              {groupedConflictCodes.length === 2
                ? <>Los códigos <strong>{groupedConflictCodes[0]}</strong> y <strong>{groupedConflictCodes[1]}</strong> quedarían como la misma variante y el sistema no sabría qué precio usar. Diferencialos completando Medida, Color o Tono.</>
                : <>Estas filas quedarían como la misma variante y el sistema no sabría qué precio usar. Diferencialas completando Medida, Color o Tono.</>}
            </div>}
          </div>
        )}

        {/* Stock por combinación exacta color×tono×medida */}
        {isNew && (form.colors.length > 0 || form.sizes.length > 0 || form.tones.length > 0) && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Toggle value={useVariantStock} onChange={setUseVariantStock} label="Cargar stock por color/tono/medida" />
              <label style={lbl}>Cargar stock por color/tono/medida</label>
            </div>
            <p style={{ fontSize: 11.5, color: C.muted, margin: '0 0 10px' }}>
              Si lo activás, cargás una cantidad para cada combinación exacta (ej: Negro + Cálido + medida 10) y el campo "Stock" de arriba pasa a ser la suma de todas. Si lo dejás apagado, seguís usando un único número de stock para todo el producto, como siempre.
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

        {form.variantRules[0]?.image && (
          <div style={{ marginTop: 16 }}>
            <label style={lbl}>Vista previa</label>
            <img
              src={form.variantRules[0].image}
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
          {saveError
            ? <span style={{ marginRight: 'auto', alignSelf: 'center', color: C.red, fontSize: 11.5 }}>{saveError}</span>
            : hasUnsavedChanges && <span style={{ marginRight: 'auto', alignSelf: 'center', color: C.amberDark, fontSize: 11.5 }}>Guardá los cambios para que se reflejen en la tienda.</span>}
          <button onClick={requestClose} disabled={saving || detaching} style={{ ...outlineBtn, opacity: saving || detaching ? .5 : 1 }}>Cancelar</button>
          <button
            onClick={handleSave}
            disabled={!valid || saving}
            style={{ ...solidBtn, background: valid && !saving ? C.red : '#ddd', color: valid && !saving ? '#fff' : '#aaa', cursor: valid && !saving ? 'pointer' : 'not-allowed' }}
          >
            {saving ? 'Guardando...' : publishOnSave ? 'Publicar producto' : isNew ? '+ Agregar producto' : 'Guardar cambios'}
          </button>
        </div>
        {detachCandidate && (
          <ConfirmModal
            message={<>Se creará un producto individual con el código <strong>{detachCandidate.supplierCodes?.[0]}</strong>, conservando su foto, medida, precios, costo y stock. La variante se quitará del grupo y este editor se cerrará. Los cambios que todavía no guardaste en otras filas no se aplicarán.</>}
            confirmLabel={detaching ? 'Separando...' : 'Separar producto'}
            onConfirm={handleDetachVariant}
            onCancel={() => { if (!detaching) setDetachCandidate(null) }}
          />
        )}
        {discardChangesOpen && (
          <ConfirmModal
            message="Hay cambios sin guardar. Si cerrás ahora, la tienda seguirá mostrando la información anterior."
            confirmLabel="Descartar cambios"
            onConfirm={onClose}
            onCancel={() => setDiscardChangesOpen(false)}
          />
        )}
        {variantDetailsIndex != null && form.variantRules[variantDetailsIndex] && (
          <VariantDetailsModal
            code={form.variantRules[variantDetailsIndex].supplierCodes?.[0] || form.variantRules[variantDetailsIndex].productData?.codigo || ''}
            codeLocked={Boolean(form.variantRules[variantDetailsIndex].supplierCodes?.length)}
            value={form.variantRules[variantDetailsIndex].productData}
            onChange={productData => setGroupedRule(variantDetailsIndex, 'productData', productData)}
            onClose={() => setVariantDetailsIndex(null)}
          />
        )}
      </div>
    </div>
  )
}

// ── OverviewTab ───────────────────────────────────────────────────────────────
const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const PENDING_DELIVERY_STATUSES = ['paid', 'preparing', 'shipped']

function OverviewTab({ products }) {
  const { orders, fetchOrders, updateOrderStatus, categoryTree } = useAdmin()
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [statusToast, setStatusToast] = useState(null)

  useEffect(() => {
    fetchOrders({ limit: 200 })
  }, [fetchOrders])

  useEffect(() => {
    if (!statusToast) return undefined
    const timeout = setTimeout(() => setStatusToast(null), 3800)
    return () => clearTimeout(timeout)
  }, [statusToast])

  // La tienda ya no cuenta unidades: lo que se mide es cuánto del catálogo se
  // puede despachar enseguida. "A reposición" no es una alarma — es el caso
  // normal — así que no se pinta de rojo como el viejo "Sin stock".
  const inmediatos  = products.filter(p => p.stockInmediato).length
  const aReposicion = products.length - inmediatos
  const withOffer   = products.filter(p => p.originalPrice).length

  const byCat = categoryTree.map(node => {
    const cat = getCategoryValue(node)
    const items = products.filter(p => p.category === cat)
    return { cat, label: node.label, count: items.length, inmediatos: items.filter(p => p.stockInmediato).length }
  })

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
    const order = orders.find(item => item.id === id)
    try {
      await updateOrderStatus(id, status)
      fetchOrders({ limit: 200 })
      setStatusToast({
        message: `Pedido #${order?.order_number || id}: estado cambiado a ${STATUS_LABEL[status] || status}`,
        tone: 'success', id: Date.now(),
      })
    } catch (error) {
      setStatusToast({ message: error.message || 'No se pudo actualizar el estado del pedido', tone: 'error', id: Date.now() })
      throw error
    }
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
      {statusToast && (
        <div role="status" aria-live="polite" style={{
          position: 'fixed', top: 18, right: 20, zIndex: 3200,
          maxWidth: 'min(410px, calc(100vw - 40px))',
          background: statusToast.tone === 'error' ? '#991b1b' : '#166534', color: '#fff',
          borderRadius: 9, padding: '11px 14px', boxShadow: '0 12px 30px rgba(15,23,42,.28)',
          display: 'flex', alignItems: 'center', gap: 12,
          fontSize: 12.5, fontWeight: 700, animation: 'fnx-notice-in .2s ease-out both',
        }}>
          <span style={{ flex: 1 }}>{statusToast.message}</span>
          <button type="button" aria-label="Cerrar notificación" onClick={() => setStatusToast(null)} style={{ border: 0, background: '#fff', color: '#111827', borderRadius: 5, width: 23, height: 23, cursor: 'pointer', fontWeight: 900 }}>×</button>
        </div>
      )}
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
        <StatCard label="Entrega inmediata" value={inmediatos} accent={C.green} />
        <StatCard label="A reposición" value={aReposicion} accent={C.border} />
        <StatCard label="Con oferta" value={withOffer} accent={C.amber} />
      </div>

      <h3 style={sectionTitle}>Productos por categoría</h3>
      <div style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        {byCat.map(({ cat, label, count, inmediatos }, i) => (
          <div key={cat} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: i < byCat.length - 1 ? `1px solid ${C.hairline}` : 'none',
          }}>
            <span style={{ fontSize: 14, color: C.ink }}>{label}</span>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: C.text3 }}>{count} productos</span>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                background: inmediatos === 0 ? C.border : C.greenLight,
                color: inmediatos === 0 ? C.text3 : C.green,
              }}>
                {inmediatos}/{count} inmediatos
              </span>
            </div>
          </div>
        ))}
      </div>

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
function BankTransferSettingsCard() {
  const { bankTransferSettings, fetchBankTransferSettings, updateBankTransferSettings } = useAdmin()
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchBankTransferSettings()
      .then(setForm)
      .catch(error => setMessage(error.message))
  }, [fetchBankTransferSettings])

  useEffect(() => {
    if (bankTransferSettings) setForm(bankTransferSettings)
  }, [bankTransferSettings])

  if (!form) return <div style={{ marginBottom: 20 }}>Cargando configuración de transferencia…</div>
  const change = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const save = async event => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const saved = await updateBankTransferSettings({
        ...form,
        cbu: String(form.cbu || '').replace(/\D/g, ''),
        discountPercent: Number(form.discountPercent),
        expiryHours: Number(form.expiryHours),
      })
      setForm(saved)
      setMessage('Configuración bancaria guardada.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 14 }}>
        <div><h2 style={{ margin: 0, fontSize: 17 }}>Transferencia bancaria</h2><p style={{ margin: '4px 0 0', color: C.muted, fontSize: 12 }}>Cuenta receptora, descuento y plazo para cargar comprobantes.</p></div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700 }}><input type="checkbox" checked={form.enabled} onChange={event => change('enabled', event.target.checked)} /> Habilitada</label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12 }}>
        <label style={lbl}>CBU (22 dígitos)<input style={{ ...inp, marginTop: 5 }} inputMode="numeric" maxLength={22} value={form.cbu || ''} onChange={event => change('cbu', event.target.value.replace(/\D/g, ''))} /></label>
        <label style={lbl}>Alias<input style={{ ...inp, marginTop: 5 }} maxLength={80} value={form.alias || ''} onChange={event => change('alias', event.target.value)} /></label>
        <label style={lbl}>Titular<input style={{ ...inp, marginTop: 5 }} maxLength={160} value={form.accountHolder || ''} onChange={event => change('accountHolder', event.target.value)} /></label>
        <label style={lbl}>Descuento (%)<input style={{ ...inp, marginTop: 5 }} type="number" min="0" max="99.99" step="0.01" value={form.discountPercent} onChange={event => change('discountPercent', event.target.value)} /></label>
        <label style={lbl}>Vigencia (horas)<input style={{ ...inp, marginTop: 5 }} type="number" min="1" max="720" step="1" value={form.expiryHours} onChange={event => change('expiryHours', event.target.value)} /></label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 15 }}><button type="submit" disabled={saving} style={{ ...solidBtn, background: C.red, color: '#fff' }}>{saving ? 'Guardando…' : 'Guardar configuración'}</button>{message && <span style={{ color: message.includes('guardada') ? C.green : C.red, fontSize: 12 }}>{message}</span>}</div>
    </form>
  )
}

const STORE_PAGE_SIZE = 40

function StoreTab({ onUpdate, onDelete }) {
  const { fetchInventoryItem, fetchCatalog, fetchStoreProducts, categoryTree } = useAdmin()
  const categoryOptions = categoryTree.map(node => ({ value: getCategoryValue(node), label: node.label }))
  const [search, setSearch]     = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [catFilter, setCat]     = useState('Todas')
  const [imgFilter, setImgFilter] = useState('') // '' | 'true' | 'false'
  const [page, setPage]         = useState(1)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [pageData, setPageData] = useState({ items: [], total: 0, hasMore: false, inmediatos: 0, conOferta: 0 })
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [editProduct, setEdit]  = useState(null)
  const [publishCandidate, setPublishCandidate] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [loadingProductId, setLoadingProductId] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [confirmId, setConfirmId] = useState(null)
  const [hoveredRow, setHoveredRow] = useState(null)

  // Debounce de la búsqueda: recién dispara el fetch (y vuelve a la página 1)
  // cuando el usuario deja de tipear.
  useEffect(() => {
    const t = setTimeout(() => { setAppliedSearch(search); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    let cancelled = false
    setListLoading(true)
    setListError('')
    fetchStoreProducts({
      page,
      pageSize: STORE_PAGE_SIZE,
      search: appliedSearch,
      category: catFilter === 'Todas' ? '' : catFilter,
      conImagen: imgFilter,
    })
      .then(result => { if (!cancelled) setPageData(result) })
      .catch(err => { if (!cancelled) setListError(err.message || 'No se pudieron cargar los productos') })
      .finally(() => { if (!cancelled) setListLoading(false) })
    return () => { cancelled = true }
  }, [fetchStoreProducts, page, appliedSearch, catFilter, imgFilter, reloadNonce])

  const reload = () => setReloadNonce(n => n + 1)
  const changeCat = value => { setCat(value); setPage(1) }
  const changeImgFilter = value => { setImgFilter(value); setPage(1) }

  const items = pageData.items
  const totalPages = Math.max(1, Math.ceil(pageData.total / STORE_PAGE_SIZE))
  const rangeStart = pageData.total === 0 ? 0 : (page - 1) * STORE_PAGE_SIZE + 1
  const rangeEnd = (page - 1) * STORE_PAGE_SIZE + items.length

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
      <BankTransferSettingsCard />
      {/* Stats bar + add button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span style={pill('#F3F4F6', C.text3)}>{pageData.total} productos</span>
          {pageData.inmediatos > 0 && <span style={pill(C.greenLight, C.green)}>{pageData.inmediatos} con entrega inmediata</span>}
          {pageData.conOferta > 0 && <span style={pill(C.amberLight, C.amberDark)}>{pageData.conOferta} con oferta</span>}
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
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Buscar producto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inp, flex: 1, minWidth: 180 }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[{ value: 'Todas', label: 'Todas' }, ...categoryOptions].map(c => (
            <button
              key={c.value}
              onClick={() => changeCat(c.value)}
              style={{
                padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontSize: 11, fontFamily: 'inherit', fontWeight: 600,
                letterSpacing: '0.04em',
                background: catFilter === c.value ? C.red : C.hairline,
                color: catFilter === c.value ? '#fff' : C.text2,
                transition: 'all 0.15s',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filtro por imagen cargada */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: C.text3, fontWeight: 600, letterSpacing: '0.04em' }}>IMAGEN</span>
        {[{ value: '', label: 'Todas' }, { value: 'true', label: 'Con imagen' }, { value: 'false', label: 'Sin imagen' }].map(f => (
          <button
            key={f.value || 'all'}
            onClick={() => changeImgFilter(f.value)}
            style={{
              padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 11, fontFamily: 'inherit', fontWeight: 600, letterSpacing: '0.04em',
              background: imgFilter === f.value ? C.red : C.hairline,
              color: imgFilter === f.value ? '#fff' : C.text2,
              transition: 'all 0.15s',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {listError && (
        <DismissibleErrorNotice key={listError} marginBottom={16} fontSize={12.5}>{listError}</DismissibleErrorNotice>
      )}

      {/* Product list */}
      <div style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden', opacity: listLoading ? 0.6 : 1, transition: 'opacity 0.12s' }}>
        {listLoading && items.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: C.muted, fontSize: 14 }}>
            Cargando productos…
          </div>
        )}
        {!listLoading && items.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: C.muted, fontSize: 14 }}>
            No se encontraron productos.
          </div>
        )}
        {items.map((p, i) => (
          <div
            key={p.id}
            onMouseEnter={() => setHoveredRow(p.id)}
            onMouseLeave={() => setHoveredRow(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
              borderBottom: i < items.length - 1 ? `1px solid ${C.hairline}` : 'none',
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

            {/* Disponibilidad de referencia; se edita desde Productos. Un
                producto a reposición no es un problema, así que no va en rojo. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, minWidth: 110 }}>
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: p.stockInmediato ? C.green : C.border }} />
              <span style={{ fontSize: 12, color: p.stockInmediato ? C.green : C.text3, fontWeight: 600 }}>
                {p.stockInmediato ? 'Inmediata' : 'A reposición'}
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

      {/* Paginación */}
      {pageData.total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: C.text3 }}>
            Mostrando {rangeStart}–{rangeEnd} de {pageData.total}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || listLoading}
              style={{ ...solidBtn, background: C.hairline, color: C.text2, opacity: page <= 1 || listLoading ? 0.5 : 1 }}
            >
              ‹ Anterior
            </button>
            <span style={{ fontSize: 12, color: C.text3, fontWeight: 600 }}>Página {page} de {totalPages}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={!pageData.hasMore || listLoading}
              style={{ ...solidBtn, background: C.hairline, color: C.text2, opacity: !pageData.hasMore || listLoading ? 0.5 : 1 }}
            >
              Siguiente ›
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {(editProduct || publishCandidate) && (
        <ProductModal
          product={publishCandidate || editProduct}
          publishOnSave={Boolean(publishCandidate)}
          onSave={publishCandidate
            ? (formData) => onUpdate(publishCandidate.id, { ...formData, published: true }).then(() => { setPage(1); reload() })
            : (formData) => onUpdate(editProduct.id, formData).then(reload)}
          onVariantsChanged={fetchCatalog}
          onClose={() => { setEdit(null); setPublishCandidate(null) }}
        />
      )}

      {pickerOpen && (
        <StoreProductPicker onSelect={selectProductToPublish} onClose={() => setPickerOpen(false)} />
      )}

      {confirmId !== null && (
        <ConfirmModal
          message={`¿Quitar "${items.find(p => p.id === confirmId)?.name}" de la tienda? Deja de verse en el catálogo, pero se mantiene en el Inventario y podés volver a publicarlo cuando quieras.`}
          onConfirm={async () => {
            const wasLastOnPage = items.length === 1 && page > 1
            await onDelete(confirmId)
            setConfirmId(null)
            if (wasLastOnPage) setPage(p => Math.max(1, p - 1))
            else reload()
          }}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </div>
  )
}

// ── CategoriesTab ─────────────────────────────────────────────────────────────
// Administra los tres niveles que forman la navegación del catálogo: categoría
// principal, subcategoría y tipo. Lo que se crea acá se refleja en vivo en el
// mega-menú del header y en los filtros de /products (ver `categoryTree` en
// AdminContext y `buildCategoryTree` en data/categoryTree.js).
function CategoriesTab() {
  const {
    categoryTree,
    createSubcategory, updateSubcategory, deleteSubcategory,
    createProductType, updateProductType, deleteProductType,
    categoryCustomizations, saveCategoryCustomization,
  } = useAdmin()

  const categoryOptions = categoryTree.map(node => ({ value: getCategoryValue(node), label: node.label }))
  const [categoryName, setCategoryName] = useState('')
  const [savingCategory, setSavingCategory] = useState(false)
  const [subCategory, setSubCategory] = useState(categoryOptions[0]?.value || '')
  const [subName, setSubName]         = useState('')
  const [savingSub, setSavingSub]     = useState(false)
  const [typeCategory, setTypeCategory] = useState(categoryOptions[0]?.value || '')
  const [typeSubcategory, setTypeSubcategory] = useState('')
  const [typeName, setTypeName] = useState('')
  const [savingType, setSavingType] = useState(false)
  const [nameDrafts, setNameDrafts] = useState({})
  const [savingEdit, setSavingEdit] = useState('')
  const [savingHeader, setSavingHeader] = useState('')
  const [toast, setToast] = useState(null)
  const [openCategory, setOpenCategory] = useState(
    categoryTree[0]?._taxonomy?.category || getCategoryValue(categoryTree[0]) || ''
  )

  const notify = (message, tone = 'success') => setToast({ message, tone, id: Date.now() })

  useEffect(() => {
    if (!toast) return undefined
    const timeout = setTimeout(() => setToast(null), 3800)
    return () => clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    const values = categoryOptions.map(option => option.value)
    if (!values.includes(subCategory)) setSubCategory(values[0] || '')
    if (!values.includes(typeCategory)) setTypeCategory(values[0] || '')
  }, [categoryTree]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const identities = categoryTree.map(node => node._taxonomy?.category || getCategoryValue(node))
    if (openCategory && !identities.includes(openCategory)) setOpenCategory(identities[0] || '')
  }, [categoryTree, openCategory])

  const handleAddCategory = async (event) => {
    event.preventDefault()
    const trimmed = categoryName.trim()
    if (!trimmed) return
    if (categoryTree.some(node => node.label.toLocaleLowerCase('es') === trimmed.toLocaleLowerCase('es'))) {
      notify('Ya existe una categoría principal con ese nombre', 'error')
      return
    }
    setSavingCategory(true)
    try {
      await saveCategoryCustomization({
        level: 'category', category: trimmed,
        subcategory: '', name: '', label: trimmed, hidden: false,
      })
      setCategoryName('')
      setOpenCategory(trimmed)
      notify(`Categoría principal “${trimmed}” creada`)
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setSavingCategory(false)
    }
  }

  const handleAddSub = async (e) => {
    e.preventDefault()
    const trimmed = subName.trim()
    if (!trimmed) return
    setSavingSub(true)
    try {
      await createSubcategory(subCategory, trimmed)
      setSubName('')
      notify(`Subcategoría “${trimmed}” creada`)
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setSavingSub(false)
    }
  }

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
    setSavingType(true)
    try {
      await createProductType(typeCategory, typeSubcategory, trimmed)
      setTypeName('')
      notify(`Tipo “${trimmed}” creado`)
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setSavingType(false)
    }
  }

  const nodeKey = node => JSON.stringify(node._taxonomy)

  const handleSaveEdit = async (event, node) => {
    event?.preventDefault()
    event?.stopPropagation()
    const key = nodeKey(node)
    const name = (nameDrafts[key] ?? node.label).trim()
    if (!name || name === node.label) {
      setNameDrafts(current => {
        const next = { ...current }
        delete next[key]
        return next
      })
      return
    }
    const normalizedName = name.toLocaleLowerCase('es')
    const meta = node._taxonomy
    let siblings = []
    if (meta.level === 'category') siblings = categoryTree
    else if (meta.level === 'subcategory') siblings = categoryTree.find(category => category.children?.includes(node))?.children || []
    else siblings = categoryTree.flatMap(category => category.children || []).find(subcategory => subcategory.children?.includes(node))?.children || []
    if (siblings.some(sibling => sibling !== node && sibling.label.toLocaleLowerCase('es') === normalizedName)) {
      notify('Ya existe otro elemento con ese nombre en el mismo nivel', 'error')
      return
    }
    setSavingEdit(key)
    try {
      if (meta.source === 'custom' && meta.level === 'subcategory') await updateSubcategory(meta.id, name)
      else if (meta.source === 'custom' && meta.level === 'type') await updateProductType(meta.id, name)
      else await saveCategoryCustomization({ ...meta, source: undefined, label: name, hidden: false })
      setNameDrafts(current => {
        const next = { ...current }
        delete next[key]
        return next
      })
      notify(`Nombre cambiado a “${name}”`)
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setSavingEdit('')
    }
  }

  const handleDelete = async (event, node) => {
    event?.preventDefault()
    event?.stopPropagation()
    if (!window.confirm(`¿Borrar “${node.label}” de las categorías? Los productos no se borrarán.`)) return
    try {
      const meta = node._taxonomy
      if (meta.source === 'custom' && meta.level === 'subcategory') await deleteSubcategory(meta.id)
      else if (meta.source === 'custom' && meta.level === 'type') await deleteProductType(meta.id)
      else await saveCategoryCustomization({ ...meta, source: undefined, hidden: true })
      notify(`“${node.label}” fue eliminado`)
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  const restoreCustomization = async item => {
    try {
      await saveCategoryCustomization({
        level: item.level, category: item.category,
        subcategory: item.subcategory, name: item.name, hidden: false,
      })
      notify(`“${item.label || item.name || item.category}” fue restaurado`)
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  const handleHeaderVisibility = async (event, node) => {
    event.preventDefault()
    event.stopPropagation()
    const key = nodeKey(node)
    const showInHeader = event.target.checked
    setSavingHeader(key)
    try {
      const meta = node._taxonomy
      await saveCategoryCustomization({
        level: 'category', category: meta.category || getCategoryValue(node),
        subcategory: '', name: '', showInHeader,
      })
      notify(`“${node.label}” ${showInHeader ? 'se mostrará' : 'ya no se mostrará'} en el header`)
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setSavingHeader('')
    }
  }

  const actionButton = (background, color) => ({
    border: 'none', borderRadius: 6, background, color, cursor: 'pointer',
    fontSize: 11.5, fontWeight: 700, padding: '6px 9px', lineHeight: 1,
  })

  const renderName = (node, compact = false) => {
    const key = nodeKey(node)
    const value = nameDrafts[key] ?? node.label
    const changed = value.trim() !== node.label && Boolean(value.trim())
    return (
      <form
        className={`fnx-category-name${compact ? ' fnx-category-name--compact' : ''}`}
        onSubmit={event => handleSaveEdit(event, node)}
        onClick={event => event.stopPropagation()}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flex: compact ? '0 1 auto' : 1, minWidth: 0 }}
      >
        <input
          aria-label={`Editar ${node.label}`}
          title="Escribí para cambiar el nombre y presioná Enter para guardar"
          value={value}
          size={compact ? Math.max(5, Math.min(value.length + 1, 30)) : undefined}
          onChange={event => setNameDrafts(current => ({ ...current, [key]: event.target.value }))}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              setNameDrafts(current => {
                const next = { ...current }
                delete next[key]
                return next
              })
              event.currentTarget.blur()
            }
          }}
          onFocus={event => { event.currentTarget.style.borderColor = '#94a3b8' }}
          onBlur={event => { event.currentTarget.style.borderColor = compact ? 'transparent' : C.hairline }}
          style={{
            minWidth: compact ? 50 : 120, width: compact ? 'auto' : '100%', maxWidth: compact ? 280 : 520,
            border: `1px solid ${compact ? 'transparent' : C.hairline}`, borderRadius: 6,
            outline: 'none', background: compact ? 'transparent' : '#fff', color: C.ink,
            padding: compact ? '2px 1px' : '6px 8px', font: 'inherit',
            fontSize: compact ? 12 : 13, fontWeight: 700,
          }}
        />
        {changed && (
          <button
            type="submit"
            disabled={savingEdit === key}
            title="Guardar nombre"
            aria-label={`Guardar ${value}`}
            style={{
              border: 'none', borderRadius: 5, background: '#166534', color: '#fff',
              width: 22, height: 22, padding: 0, cursor: 'pointer', fontSize: 13,
              fontWeight: 900, lineHeight: 1, flexShrink: 0,
            }}
          >
            {savingEdit === key ? '…' : '✓'}
          </button>
        )}
      </form>
    )
  }

  const renderActions = (node, compact = false) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: compact ? 5 : 10, flexShrink: 0 }}>
      {node._taxonomy?.level === 'category' && (
        <label
          title="Mostrar esta categoría como acceso rápido en el header de la tienda"
          onClick={event => event.stopPropagation()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.text2, fontSize: 11.5, fontWeight: 700, cursor: savingHeader === nodeKey(node) ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}
        >
          <input
            type="checkbox"
            checked={Boolean(node.showInHeader)}
            disabled={savingHeader === nodeKey(node)}
            onChange={event => handleHeaderVisibility(event, node)}
            style={{ width: 15, height: 15, margin: 0, accentColor: C.red, cursor: 'pointer' }}
          />
          En header
        </label>
      )}
      <button
      className={`fnx-category-delete${compact ? ' fnx-category-delete--compact' : ''}`}
      type="button"
      onClick={event => handleDelete(event, node)}
      title={`Eliminar ${node.label}`}
      aria-label={`Eliminar ${node.label}`}
      style={{
        border: 'none', borderRadius: 6, background: C.redLight, color: '#b91c1c', cursor: 'pointer',
        width: compact ? 24 : 'auto', height: compact ? 24 : 'auto',
        padding: compact ? 0 : '6px 9px', fontSize: compact ? 16 : 11.5, fontWeight: 700,
        lineHeight: 1, flexShrink: 0,
      }}
    >
      {compact ? '×' : 'Eliminar'}
      </button>
    </span>
  )

  const hiddenItems = categoryCustomizations.filter(item => item.hidden)

  return (
    <div className="fnx-categories-tab" style={{ maxWidth: 1320 }}>
      <style>{`
        .fnx-category-create-grid,
        .fnx-subcategory-list { scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; }
        .fnx-category-create-card input,
        .fnx-category-create-card select { padding: 6px 8px !important; }
        .fnx-mobile-swipe-hint { display: none; }
        @media (max-width: 720px) {
          .fnx-category-create { max-width: none !important; margin-bottom: 16px !important; }
          .fnx-category-create-header { padding: 11px 12px !important; }
          .fnx-category-create-header p { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .fnx-mobile-swipe-hint {
            display: block; color: #475569; font-size: 11px; font-weight: 700; margin-top: 5px;
          }
          .fnx-category-create-grid {
            display: flex !important; overflow-x: auto; overscroll-behavior-x: contain;
            scroll-snap-type: x mandatory; padding: 10px !important; gap: 9px !important;
          }
          .fnx-category-create-card {
            flex: 0 0 min(82vw, 300px); scroll-snap-align: start; padding: 10px !important;
          }
          .fnx-category-create-card__heading { margin-bottom: 8px !important; }
          .fnx-category-tree-header { align-items: center !important; }
          .fnx-category-tree-header p { display: none; }
          .fnx-category-summary { padding: 9px 10px !important; }
          .fnx-category-summary__content { width: calc(100% - 17px) !important; gap: 5px !important; }
          .fnx-category-summary__main { gap: 5px !important; }
          .fnx-category-summary__folder { display: none !important; }
          .fnx-category-name:not(.fnx-category-name--compact) input {
            min-width: 0 !important; padding: 5px 6px !important;
          }
          .fnx-category-count { padding: 3px 6px !important; font-size: 10px !important; white-space: nowrap; }
          .fnx-category-delete:not(.fnx-category-delete--compact) {
            width: 26px !important; height: 26px !important; padding: 0 !important;
            overflow: hidden; font-size: 0 !important;
          }
          .fnx-category-delete:not(.fnx-category-delete--compact)::after { content: '×'; font-size: 17px; }
          .fnx-category-children { padding: 8px !important; }
          .fnx-subcategory-list {
            display: grid !important; grid-auto-flow: column; grid-auto-columns: min(82vw, 310px);
            overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x mandatory;
            gap: 8px !important; padding-bottom: 4px;
          }
          .fnx-subcategory-card { scroll-snap-align: start; align-self: start; }
          .fnx-subcategory-label { display: none !important; }
        }
      `}</style>
      {toast && (
        <div role="status" aria-live="polite" style={{
          position: 'fixed', top: 18, right: 20, zIndex: 2500, maxWidth: 'min(390px, calc(100vw - 40px))',
          background: toast.tone === 'error' ? '#991b1b' : '#166534', color: '#fff',
          borderRadius: 9, padding: '11px 14px', boxShadow: '0 12px 30px rgba(15,23,42,.28)',
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 12.5, fontWeight: 700,
          animation: 'fnx-notice-in .2s ease-out both',
        }}>
          <span style={{ flex: 1 }}>{toast.message}</span>
          <button type="button" aria-label="Cerrar notificación" onClick={() => setToast(null)} style={{ border: 0, background: '#fff', color: '#111827', borderRadius: 5, width: 23, height: 23, cursor: 'pointer', fontWeight: 900 }}>×</button>
        </div>
      )}

      <section className="fnx-category-create" style={{ width: '100%', maxWidth: 1040, background: C.white, border: `1px solid ${C.border}`, borderRadius: 11, marginBottom: 18, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
        <div className="fnx-category-create-header" style={{ padding: '12px 14px', borderBottom: `1px solid ${C.hairline}` }}>
          <h3 style={{ ...sectionTitle, margin: 0 }}>Agregar al catálogo</h3>
          <p style={{ fontSize: 12.5, color: C.muted, margin: '4px 0 0', lineHeight: 1.45 }}>
            Elegí el nivel que necesitás. Para crear una subcategoría o un tipo, primero seleccioná dónde debe aparecer.
          </p>
          <span className="fnx-mobile-swipe-hint">Deslizá para ver los 3 niveles →</span>
        </div>
        <div className="fnx-category-create-grid" style={{ padding: 10, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', alignItems: 'start', gap: 10, background: '#f8fafc' }}>
          <form className="fnx-category-create-card" onSubmit={handleAddCategory} style={{ background: '#fff', border: `1px solid ${C.border}`, borderTop: `3px solid ${C.red}`, borderRadius: 8, padding: 11 }}>
            <div className="fnx-category-create-card__heading" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 24, height: 24, borderRadius: '50%', background: C.red, color: '#fff', fontSize: 12, fontWeight: 800 }}>1</span>
              <div><strong style={{ display: 'block', fontSize: 13.5 }}>Categoría principal</strong><span style={{ color: C.muted, fontSize: 11.5 }}>Primer nivel del menú</span></div>
            </div>
            <label style={{ display: 'block', fontSize: 11.5, color: C.text3, fontWeight: 700, marginBottom: 5 }}>Nombre de la categoría</label>
            <input value={categoryName} onChange={event => setCategoryName(event.target.value)} placeholder="Ej. Domótica" maxLength={100} style={{ ...inp, width: '100%', boxSizing: 'border-box', marginBottom: 10 }} />
            <button type="submit" disabled={savingCategory || !categoryName.trim()} style={{ ...solidBtn, width: '100%', justifyContent: 'center', background: categoryName.trim() ? C.red : '#9ca3af' }}>{savingCategory ? 'Guardando...' : 'Agregar categoría'}</button>
          </form>

          <form className="fnx-category-create-card" onSubmit={handleAddSub} style={{ background: '#fff', border: `1px solid ${C.border}`, borderTop: '3px solid #475569', borderRadius: 8, padding: 11 }}>
            <div className="fnx-category-create-card__heading" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 24, height: 24, borderRadius: '50%', background: '#475569', color: '#fff', fontSize: 12, fontWeight: 800 }}>2</span>
              <div><strong style={{ display: 'block', fontSize: 13.5 }}>Subcategoría</strong><span style={{ color: C.muted, fontSize: 11.5 }}>Segundo nivel del menú</span></div>
            </div>
            <label style={{ display: 'block', fontSize: 11.5, color: C.text3, fontWeight: 700, marginBottom: 5 }}>Dentro de</label>
            <select value={subCategory} onChange={event => setSubCategory(event.target.value)} style={{ ...inp, width: '100%', marginBottom: 9 }}>{categoryOptions.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}</select>
            <label style={{ display: 'block', fontSize: 11.5, color: C.text3, fontWeight: 700, marginBottom: 5 }}>Nombre de la subcategoría</label>
            <input value={subName} onChange={event => setSubName(event.target.value)} placeholder="Ej. Sensores" maxLength={150} style={{ ...inp, width: '100%', boxSizing: 'border-box', marginBottom: 10 }} />
            <button type="submit" disabled={savingSub || !subName.trim() || !subCategory} style={{ ...solidBtn, width: '100%', justifyContent: 'center', background: subName.trim() && subCategory ? C.red : '#9ca3af' }}>{savingSub ? 'Guardando...' : 'Agregar subcategoría'}</button>
          </form>

          <form className="fnx-category-create-card" onSubmit={handleAddType} style={{ background: '#fff', border: `1px solid ${C.border}`, borderTop: '3px solid #94a3b8', borderRadius: 8, padding: 11 }}>
            <div className="fnx-category-create-card__heading" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 24, height: 24, borderRadius: '50%', background: '#64748b', color: '#fff', fontSize: 12, fontWeight: 800 }}>3</span>
              <div><strong style={{ display: 'block', fontSize: 13.5 }}>Tipo o clasificación</strong><span style={{ color: C.muted, fontSize: 11.5 }}>Tercer nivel del menú</span></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
              <label style={{ display: 'block', fontSize: 11.5, color: C.text3, fontWeight: 700 }}>Categoría<select value={typeCategory} onChange={event => setTypeCategory(event.target.value)} style={{ ...inp, width: '100%', marginTop: 5 }}>{categoryOptions.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
              <label style={{ display: 'block', fontSize: 11.5, color: C.text3, fontWeight: 700 }}>Subcategoría<select value={typeSubcategory} onChange={event => setTypeSubcategory(event.target.value)} style={{ ...inp, width: '100%', marginTop: 5 }}><option value="" disabled>{typeSubcategoryOptions.length ? 'Elegí una' : 'Sin opciones'}</option>{typeSubcategoryOptions.map(subcategory => <option key={subcategory} value={subcategory}>{subcategory}</option>)}</select></label>
            </div>
            <label style={{ display: 'block', fontSize: 11.5, color: C.text3, fontWeight: 700, margin: '9px 0 5px' }}>Nombre del tipo</label>
            <input value={typeName} onChange={event => setTypeName(event.target.value)} placeholder="Ej. Movimiento" maxLength={150} style={{ ...inp, width: '100%', boxSizing: 'border-box', marginBottom: 10 }} />
            <button type="submit" disabled={savingType || !typeName.trim() || !typeSubcategory} style={{ ...solidBtn, width: '100%', justifyContent: 'center', background: typeName.trim() && typeSubcategory ? C.red : '#9ca3af' }}>{savingType ? 'Guardando...' : 'Agregar tipo'}</button>
          </form>
        </div>
      </section>

      <div className="fnx-category-tree-header" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 12 }}>
        <div>
          <h3 style={{ ...sectionTitle, margin: 0 }}>Organización del catálogo</h3>
          <p style={{ fontSize: 12.5, color: C.muted, margin: '4px 0 0', lineHeight: 1.45 }}>Abrí una categoría para ver su contenido. Podés cambiar cualquier nombre y guardar con Enter o con ✓.</p>
        </div>
        {hiddenItems.length > 0 && (
          <details style={{ position: 'relative' }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: C.text2, padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 7, background: '#fff' }}>Ver eliminados ({hiddenItems.length})</summary>
            <div style={{ position: 'absolute', right: 0, top: 38, zIndex: 20, width: 'min(360px, calc(100vw - 48px))', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 9, boxShadow: '0 12px 28px rgba(15,23,42,.18)', padding: 8 }}>
              {hiddenItems.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderBottom: `1px solid ${C.hairline}` }}>
                  <span style={{ flex: 1, minWidth: 0 }}><strong style={{ display: 'block', fontSize: 12 }}>{item.label || item.name || item.category}</strong><small style={{ color: C.muted, textTransform: 'capitalize' }}>{item.level === 'type' ? 'Tipo' : item.level === 'subcategory' ? 'Subcategoría' : 'Categoría principal'}</small></span>
                  <button type="button" onClick={() => restoreCustomization(item)} style={actionButton('#1f2937', '#fff')}>Restaurar</button>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {categoryTree.map(catNode => {
          const cat = getCategoryValue(catNode)
          const categoryIdentity = catNode._taxonomy?.category || cat
          const subNodes = catNode.children || []
          const typeCount = subNodes.reduce((total, subNode) => total + (subNode.children?.length || 0), 0)
          const isOpen = openCategory === categoryIdentity
          return (
            <details key={categoryIdentity} open={isOpen} style={{ background: C.white, borderRadius: 10, border: `1px solid ${isOpen ? '#cbd5e1' : C.border}`, boxShadow: isOpen ? '0 3px 12px rgba(15,23,42,.06)' : 'none', overflow: 'hidden' }}>
              <summary
                onClick={event => {
                  if (event.target.closest('input, button, form')) return
                  event.preventDefault()
                  setOpenCategory(current => current === categoryIdentity ? '' : categoryIdentity)
                }}
                className="fnx-category-summary"
                style={{ padding: '10px 12px', cursor: 'pointer', background: isOpen ? '#f8fafc' : '#fff' }}
              >
                <span className="fnx-category-summary__content" style={{ display: 'inline-flex', width: 'calc(100% - 20px)', alignItems: 'center', justifyContent: 'space-between', gap: 10, verticalAlign: 'middle' }}>
                  <span className="fnx-category-summary__main" style={{ display: 'flex', flex: 1, minWidth: 0, alignItems: 'center', gap: 9 }}>
                    <span className="fnx-category-summary__folder" style={{ color: C.red, display: 'grid', placeItems: 'center' }}><FolderIcon /></span>
                    {renderName(catNode)}
                    <span className="fnx-category-count" style={{ flexShrink: 0, color: C.muted, background: '#e2e8f0', borderRadius: 20, padding: '3px 8px', fontSize: 11, fontWeight: 700 }}>{subNodes.length} subcat. · {typeCount} tipos</span>
                  </span>
                  {renderActions(catNode)}
                </span>
              </summary>
              <div className="fnx-category-children" style={{ borderTop: `1px solid ${C.hairline}`, padding: '10px 12px 12px', background: '#fbfcfd' }}>
                {subNodes.length === 0 ? <div style={{ fontSize: 12.5, color: C.muted, border: `1px dashed ${C.border}`, borderRadius: 8, padding: 14, textAlign: 'center', background: '#fff' }}>Esta categoría todavía no tiene subcategorías. Podés agregar la primera desde el bloque superior.</div> : <div className="fnx-subcategory-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {subNodes.map(subNode => {
                    const typeNodes = subNode.children || []
                    return (
                      <div className="fnx-subcategory-card" key={`${subNode._taxonomy?.source}-${subNode._taxonomy?.id || subNode._taxonomy?.name}`} style={{ border: `1px solid ${C.hairline}`, borderLeft: '3px solid #94a3b8', borderRadius: 8, padding: '9px 10px', background: '#fff' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ display: 'flex', flex: 1, minWidth: 0, alignItems: 'center', gap: 8 }}>
                            <span className="fnx-subcategory-label" style={{ color: C.muted, fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>Subcategoría</span>
                            {renderName(subNode)}
                            <span style={{ flexShrink: 0, color: C.muted, fontSize: 11 }}>{typeNodes.length} {typeNodes.length === 1 ? 'tipo' : 'tipos'}</span>
                          </span>
                          {renderActions(subNode)}
                        </div>
                        {typeNodes.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 9, paddingTop: 9, borderTop: `1px solid ${C.hairline}` }}>
                            {typeNodes.map(typeNode => {
                              return (
                                <span key={`${typeNode._taxonomy?.source}-${typeNode._taxonomy?.id || `${typeNode._taxonomy?.subcategory}-${typeNode._taxonomy?.name}`}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#f1f5f9', color: '#111827', border: '1px solid #e2e8f0', borderRadius: 7, padding: '4px 5px 4px 9px' }}>
                                  {renderName(typeNode, true)}{renderActions(typeNode, true)}
                                </span>
                              )
                            })}
                          </div>
                        ) : <div style={{ color: C.muted, fontSize: 11.5, marginTop: 7 }}>Sin tipos cargados.</div>}
                      </div>
                    )
                  })}
                </div>}
              </div>
            </details>
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

// "Hace cuánto" se responde de un vistazo; una fecha suelta obliga a restar.
// Pasado el mes la fecha vuelve a ser más informativa que el conteo de días.
function fmtDesdeCarga(iso) {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return null
  // Días de calendario, no períodos de 24 h: una carga de ayer a las 23 h es
  // "ayer" desde que arranca el día, no recién a las 23 h de hoy.
  const aMedianoche = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dias = Math.round((aMedianoche(new Date()) - aMedianoche(fecha)) / 86400000)
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 30) return `hace ${dias} días`
  return fecha.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

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

const INVOICE_LABEL = {
  not_applicable: 'No aplica',
  needs_data: 'Faltan datos',
  pending: 'Pendiente',
  processing: 'Procesando',
  uncertain: 'Incierta',
  authorized: 'Autorizada',
  rejected: 'Rechazada',
  error: 'Error',
}

const INVOICE_STYLE = {
  not_applicable: { bg: '#F3F4F6', color: C.text3 },
  needs_data: { bg: '#FFF7E6', color: '#9A6700' },
  pending: { bg: '#EFF6FF', color: '#1D4ED8' },
  processing: { bg: '#EFF6FF', color: '#1D4ED8' },
  uncertain: { bg: '#FFF7E6', color: '#9A6700' },
  authorized: { bg: '#EAF7EF', color: '#166534' },
  rejected: { bg: '#FDECEC', color: '#991B1B' },
  error: { bg: '#FDECEC', color: '#991B1B' },
}
const INVOICE_ICON = {
  needs_data: '⚠ ', pending: '⚠ ', processing: '⚠ ', uncertain: '⚠ ',
  rejected: '❌ ', error: '❌ ', authorized: '✓ ',
}

function InvoiceBadge({ order }) {
  const status = order.invoice_display_status || 'not_applicable'
  const style = INVOICE_STYLE[status] || INVOICE_STYLE.not_applicable
  return (
    <span style={{ ...pill(style.bg, style.color), whiteSpace: 'nowrap' }}>
      {order.invoice_overdue ? '⚠ ' : (INVOICE_ICON[status] || '')}{INVOICE_LABEL[status] || status}
    </span>
  )
}

function OrderDetailModal({ order, onClose, onStatusChange, onInvoice, onInvoicePdf,
  onTransferReview, onTransferProof, invoiceSaving = false }) {
  const [newStatus, setNewStatus] = useState(order.status)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [invoiceError, setInvoiceError] = useState('')

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

  async function handleInvoice() {
    setInvoiceError('')
    try {
      await onInvoice?.(order)
    } catch (error) {
      setInvoiceError(error.message || 'No se pudo facturar el pedido.')
    }
  }

  async function handleInvoicePdf(inline) {
    setInvoiceError('')
    try {
      await onInvoicePdf?.(order, inline)
    } catch (error) {
      setInvoiceError(error.message || 'No se pudo abrir la factura.')
    }
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

        {order.payment_method === 'bank_transfer' && (
          <div style={{ background: C.white, borderRadius: 8, border: `1px solid ${order.transfer_status === 'pending_review' ? C.amber : C.border}`, padding: '14px 18px', marginBottom: 14 }}>
            <p style={lbl}>Transferencia bancaria</p>
            <p style={{ margin: '7px 0 0', fontSize: 13 }}>Importe esperado: <strong>{fmt(order.total_amount)}</strong></p>
            <p style={{ margin: '5px 0 0', fontSize: 12 }}>Estado: <strong>{order.transfer_status || 'awaiting_proof'}</strong></p>
            {order.transfer_payer_account_holder && <p style={{ margin: '5px 0 0', fontSize: 12 }}>Titular de origen informado: <strong>{order.transfer_payer_account_holder}</strong></p>}
            {order.transfer_rejection_reason && <p style={{ margin: '5px 0 0', fontSize: 12, color: C.red }}>Motivo anterior: {order.transfer_rejection_reason}</p>}
            {(order.transfer_history || []).filter(item => item.status === 'rejected').map(item => <p key={item.attempt} style={{ margin: '5px 0 0', fontSize: 11, color: C.text3 }}>Intento {item.attempt} rechazado: {item.rejectionReason}</p>)}
            {order.transfer_submission_id && <button type="button" onClick={() => onTransferProof?.(order)} style={{ ...outlineBtn, marginTop: 10 }}>Descargar {order.transfer_proof_original_name || 'comprobante'}</button>}
            {order.transfer_status === 'pending_review' && <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" onClick={() => onTransferReview?.(order, 'approve')} style={{ ...solidBtn, background: C.green, color: '#fff' }}>Confirmar pago</button>
              <button type="button" onClick={() => onTransferReview?.(order, 'reject')} style={{ ...outlineBtn, color: C.red, borderColor: C.red }}>Rechazar</button>
            </div>}
          </div>
        )}

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
            <>
              <p style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>
                {order.payment_method === 'pay_in_store' ? 'Pago en el local' : 'Pago online'}
                {order.pickup_date ? ` · Retira el ${fmtPickupDate(order.pickup_date)}` : ''}
              </p>
              {(order.pickup_person_name || order.pickup_person_last_name) && (
                <p style={{ fontSize: 12, color: C.ink, fontWeight: 600, marginTop: 4 }}>
                  Retira: {[order.pickup_person_name, order.pickup_person_last_name].filter(Boolean).join(' ')}
                </p>
              )}
            </>
          )}
          {order.delivery_type === 'delivery' && order.estimated_delivery_date && (
            <p style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>
              Entrega estimada: {fmtVentanaEntrega(order)}
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
          {Number(order.transfer_discount_amount) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 18px', color: C.green, fontSize: 12 }}><span>Descuento por transferencia</span><strong>-{fmt(order.transfer_discount_amount)}</strong></div>}
        </div>

        {(order.invoice_display_status !== 'not_applicable' || order.invoice_id) && (
          <div style={{
            background: order.invoice_overdue ? '#FFF7ED' : C.white,
            borderRadius: 8,
            border: `1px solid ${order.invoice_overdue ? '#FDBA74' : C.border}`,
            padding: '14px 18px',
            marginBottom: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <p style={lbl}>Factura electrónica</p>
              <InvoiceBadge order={order} />
            </div>
            {order.invoice_overdue && <p style={{ margin: '9px 0 0', color: '#9A3412', fontSize: 12, fontWeight: 700 }}>Pago aprobado hace más de 24 horas sin factura autorizada.</p>}
            <p style={{ margin: '9px 0 0', fontSize: 11, color: C.text3 }}>
              Pago: {order.payment_method === 'bank_transfer' ? `transferencia ${order.transfer_status || 'pendiente'}` : `Mercado Pago ${order.mp_status || 'sin estado'}`}
            </p>
            {order.invoice_id && <p style={{ margin: '4px 0 0', fontSize: 11, color: C.text3 }}>Punto de venta: {order.invoice_pto_vta} · Tipo: {order.invoice_cbte_tipo}</p>}
            {order.invoice_cbte_numero && <p style={{ margin: '4px 0 0', fontSize: 12, color: C.ink }}>Comprobante {String(order.invoice_pto_vta).padStart(5, '0')}-{String(order.invoice_cbte_numero).padStart(8, '0')}</p>}
            {order.invoice_cae && <p style={{ margin: '4px 0 0', fontSize: 11, color: C.text3 }}>CAE: {order.invoice_cae} · Vence: {String(order.invoice_cae_expiration_date || '').slice(0, 10)}</p>}
            {order.invoice_last_attempt_origin && <p style={{ margin: '4px 0 0', fontSize: 11, color: C.text3 }}>Último intento: {order.invoice_last_attempt_origin} · {Number(order.invoice_attempt_count || 0)} intento(s)</p>}
            {order.invoice_attempt_updated_at && <p style={{ margin: '4px 0 0', fontSize: 11, color: C.text3 }}>Fecha del intento: {fmtDate(order.invoice_attempt_updated_at)}</p>}
            {order.invoice_last_error_message && <p style={{ margin: '8px 0 0', color: C.red, fontSize: 12 }}>{order.invoice_last_error_code}: {order.invoice_last_error_message}</p>}
            {Array.isArray(order.invoice_errors) && order.invoice_errors.slice(0, 3).map((item, index) => (
              <p key={`invoice-error-${index}`} style={{ margin: '6px 0 0', color: C.red, fontSize: 12 }}>{item.code ? `${item.code}: ` : ''}{item.message}</p>
            ))}
            {Array.isArray(order.invoice_observations) && order.invoice_observations.slice(0, 3).map((item, index) => (
              <p key={`invoice-observation-${index}`} style={{ margin: '6px 0 0', color: '#9A6700', fontSize: 12 }}>Observación {item.code ? `${item.code}: ` : ''}{item.message}</p>
            ))}
            {order.invoice_display_status === 'needs_data' && <p style={{ margin: '8px 0 0', color: C.text3, fontSize: 12 }}>El cliente debe confirmar sus datos fiscales antes de emitir.</p>}
            {order.invoice_display_status === 'rejected' && <p style={{ margin: '8px 0 0', color: C.red, fontSize: 12 }}>ARCA rechazó el comprobante. Se deben corregir los datos fiscales antes de un nuevo intento.</p>}
            {invoiceError && <p style={{ margin: '8px 0 0', color: C.red, fontSize: 12 }}>{invoiceError}</p>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {order.invoice_display_status === 'authorized' ? (
                <>
                  <button type="button" onClick={() => handleInvoicePdf(true)} style={{ ...outlineBtn, color: C.ink }}>Ver factura</button>
                  <button type="button" onClick={() => handleInvoicePdf(false)} style={{ ...solidBtn, background: C.dark, color: '#fff' }}>Descargar factura</button>
                </>
              ) : (
                ((order.payment_method === 'mercadopago' && order.mp_status === 'approved')
                || (order.payment_method === 'bank_transfer' && order.transfer_status === 'approved'))
                && ['paid', 'preparing', 'shipped', 'delivered'].includes(order.status)
                && order.invoice_data_confirmed_at
                && order.invoice_display_status !== 'rejected'
                && <button type="button" onClick={handleInvoice} disabled={invoiceSaving} style={{ ...solidBtn, background: C.red, color: '#fff' }}>{invoiceSaving ? 'Facturando...' : 'Facturar ahora'}</button>
              )}
            </div>
          </div>
        )}

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
  const [nowMs, setNowMs] = useState(() => Date.now())
  const overdueCount = orders.filter(order => isPreparationOverdue(order, nowMs)).length

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  return (
    <section className={`adm-work-queue adm-work-queue--${type}`}>
      <div className="adm-work-queue__head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span>{orders.length}</span>
      </div>

      {overdueCount > 0 && (
        <div className="adm-work-queue__preparation-alert" role="status">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          <span>
            {overdueCount === 1
              ? `1 pedido lleva más de ${PREPARATION_ALERT_HOURS} horas pagado. Hay que comenzar a prepararlo.`
              : `${overdueCount} pedidos llevan más de ${PREPARATION_ALERT_HOURS} horas pagados. Hay que comenzar a prepararlos.`}
          </span>
        </div>
      )}

      {orders.length === 0 ? (
        <div className="adm-work-queue__empty">{emptyText}</div>
      ) : (
        <div className="adm-work-queue__list">
          {orders.map((order) => {
            const preparationOverdue = isPreparationOverdue(order, nowMs)
            return (
            <article className={`adm-work-order${preparationOverdue ? ' is-preparation-overdue' : ''}`} key={order.id}>
              <div className="adm-work-order__top">
                <strong>#{order.order_number}</strong>
                <StatusBadge status={order.status} />
              </div>
              <div className="adm-work-order__customer">{order.customer_name}</div>
              {order.created_at && (
                <div className="adm-work-order__created-at">Pedido realizado: {fmtDate(order.created_at)}</div>
              )}
              {preparationOverdue && (
                <div className="adm-work-order__preparation-alert">
                  <span aria-hidden="true">!</span>
                  <strong>Hace más de {PREPARATION_ALERT_HOURS} horas que está pagado. Pasalo a Preparando.</strong>
                </div>
              )}
              <div className="adm-work-order__destination">
                {type === 'delivery' ? (
                  <>
                    <b>Enviar a</b>
                    <span>{order.address || 'Dirección sin completar'}{order.city ? `, ${order.city}` : ''}{order.postal_code ? ` (CP ${order.postal_code})` : ''}</span>
                    {order.estimated_delivery_date && <small>Entrega estimada: {fmtVentanaEntrega(order)}</small>}
                  </>
                ) : (
                  <>
                    <b>Retiro en el local</b>
                    <span>{order.pickup_date ? `Retira el ${fmtPickupDate(order.pickup_date)}` : 'Fecha de retiro sin definir'}</span>
                    {(order.pickup_person_name || order.pickup_person_last_name) && (
                      <span>Persona autorizada: {[order.pickup_person_name, order.pickup_person_last_name].filter(Boolean).join(' ')}</span>
                    )}
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
            )
          })}
        </div>
      )}
    </section>
  )
}

// ── CouponsTab ────────────────────────────────────────────────────────────────
const EMPTY_COUPON_FORM = { code: '', type: 'percentage', value: '', minPurchase: '', usageLimit: '', oncePerCustomer: false, expiresAt: '' }

function CouponsTab() {
  const { coupons, couponsLoading, couponsError, fetchCoupons, createCoupon, updateCoupon, deleteCoupon } = useAdmin()
  const [form, setForm]       = useState(EMPTY_COUPON_FORM)
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState('')
  const [msg, setMsg]         = useState('')
  const [busyIds, setBusyIds] = useState(() => new Set())

  useEffect(() => { fetchCoupons() }, [fetchCoupons])

  const notify = (text) => {
    setMsg(text)
    setTimeout(() => setMsg(''), 3000)
  }

  const setBusy = (id, busy) => setBusyIds(current => {
    const next = new Set(current)
    if (busy) next.add(id); else next.delete(id)
    return next
  })

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')
    const code = form.code.trim().toUpperCase()
    const value = Number(form.value)
    if (!code) return setFormError('Ingresá un código')
    if (!Number.isFinite(value) || value <= 0) return setFormError('El valor debe ser mayor a 0')
    if (form.type === 'percentage' && value > 100) return setFormError('El porcentaje no puede superar 100')

    setCreating(true)
    try {
      await createCoupon({
        code,
        type: form.type,
        value,
        minPurchase: form.minPurchase || null,
        usageLimit: form.usageLimit || null,
        perCustomerLimit: form.oncePerCustomer ? 1 : null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      })
      setForm(EMPTY_COUPON_FORM)
      notify(`✓ Cupón "${code}" creado.`)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function toggleActive(coupon) {
    setBusy(coupon.id, true)
    try {
      await updateCoupon(coupon.id, { active: !coupon.active })
    } catch (err) {
      notify(err.message)
    } finally {
      setBusy(coupon.id, false)
    }
  }

  async function handleDelete(coupon) {
    if (!window.confirm(`¿Eliminar el cupón "${coupon.code}"? Esta acción no se puede deshacer.`)) return
    setBusy(coupon.id, true)
    try {
      await deleteCoupon(coupon.id)
      notify(`Cupón "${coupon.code}" eliminado.`)
    } catch (err) {
      notify(err.message)
      setBusy(coupon.id, false)
    }
  }

  return (
    <div>
      <h3 style={sectionTitle}>Crear cupón</h3>
      <form onSubmit={handleCreate} style={{
        background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
        padding: '20px 24px', marginBottom: 28,
      }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 160 }}>
            <label style={lbl}>Código</label>
            <input
              type="text"
              value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
              placeholder="BIENVENIDA10"
              style={{ ...inp, textTransform: 'uppercase' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 140 }}>
            <label style={lbl}>Tipo</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={inp}>
              <option value="percentage">Porcentaje</option>
              <option value="fixed">Monto fijo</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 120 }}>
            <label style={lbl}>{form.type === 'percentage' ? 'Valor (%)' : 'Valor ($)'}</label>
            <input
              type="number" min="0" step={form.type === 'percentage' ? '1' : '0.01'}
              value={form.value}
              onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
              placeholder={form.type === 'percentage' ? '10' : '5000'}
              style={inp}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 140 }}>
            <label style={lbl}>Compra mínima (opcional)</label>
            <input
              type="number" min="0" step="0.01"
              value={form.minPurchase}
              onChange={e => setForm(f => ({ ...f, minPurchase: e.target.value }))}
              placeholder="$0"
              style={inp}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 120 }}>
            <label style={lbl}>Límite de usos (opcional)</label>
            <input
              type="number" min="1" step="1"
              value={form.usageLimit}
              onChange={e => setForm(f => ({ ...f, usageLimit: e.target.value }))}
              placeholder="Ilimitado"
              style={inp}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 150 }}>
            <label style={lbl}>Uso por cliente</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: C.ink, cursor: 'pointer', minHeight: 33 }}>
              <input
                type="checkbox"
                checked={form.oncePerCustomer}
                onChange={e => setForm(f => ({ ...f, oncePerCustomer: e.target.checked }))}
              />
              Uno por cliente
            </label>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 160 }}>
            <label style={lbl}>Vence (opcional)</label>
            <input
              type="date"
              value={form.expiresAt}
              onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
              style={inp}
            />
          </div>
          <button type="submit" disabled={creating} style={{ ...solidBtn, background: C.red, color: C.white, opacity: creating ? 0.6 : 1 }}>
            {creating ? 'Creando...' : 'Crear cupón'}
          </button>
        </div>
        {formError && <p style={{ color: C.red, fontSize: 12, margin: '12px 0 0' }}>{formError}</p>}
        {msg && <p style={{ color: C.green, fontSize: 12, margin: '12px 0 0' }}>{msg}</p>}
      </form>

      <h3 style={sectionTitle}>
        Cupones{coupons.length > 0 ? <span style={{ fontFamily: ADMIN_FONT }}> ({coupons.length})</span> : ''}
      </h3>
      {couponsError && <p style={{ color: C.red, fontSize: 12.5 }}>{couponsError}</p>}
      {couponsLoading ? (
        <p style={{ color: C.muted, fontSize: 13 }}>Cargando cupones...</p>
      ) : coupons.length === 0 ? (
        <div style={{
          background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
          padding: '32px 20px', textAlign: 'center', color: C.muted, fontSize: 14,
        }}>
          No hay cupones creados todavía.
        </div>
      ) : (
        <div style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          {coupons.map((c, i) => {
            const expired = c.expires_at && new Date(c.expires_at) < new Date()
            const limitReached = c.usage_limit != null && c.times_used >= c.usage_limit
            return (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
                borderBottom: i < coupons.length - 1 ? `1px solid ${C.hairline}` : 'none',
                opacity: busyIds.has(c.id) ? 0.5 : 1,
              }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, letterSpacing: '0.03em' }}>{c.code}</div>
                  <div style={{ fontSize: 12, color: C.text3 }}>
                    {c.type === 'percentage' ? `${Number(c.value)}% de descuento` : `${fmt(Number(c.value))} de descuento`}
                    {c.min_purchase != null ? ` · mín. ${fmt(Number(c.min_purchase))}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: C.text3, minWidth: 90, textAlign: 'right' }}>
                  {c.times_used}{c.usage_limit != null ? ` / ${c.usage_limit}` : ''} usos
                </div>
                {c.per_customer_limit != null && (
                  <span style={pill(C.hairline, C.text3)}>
                    {c.per_customer_limit === 1 ? '1 por cliente' : `${c.per_customer_limit} por cliente`}
                  </span>
                )}
                <div style={{ fontSize: 12, color: expired ? C.red : C.text3, minWidth: 110, textAlign: 'right' }}>
                  {c.expires_at ? `Vence ${new Date(c.expires_at).toLocaleDateString('es-AR')}` : 'Sin vencimiento'}
                </div>
                {(expired || limitReached) && (
                  <span style={pill(C.redLight, C.red)}>{expired ? 'Vencido' : 'Sin usos'}</span>
                )}
                <Toggle value={c.active} onChange={() => toggleActive(c)} size="sm" label={`Activar cupón ${c.code}`} />
                <button
                  onClick={() => handleDelete(c)}
                  title="Eliminar cupón"
                  style={{ ...iconBtn, background: C.redLight, color: C.red, flexShrink: 0 }}
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── CustomersTab ──────────────────────────────────────────────────────────────
// Solo lectura: lista las cuentas creadas (registro con email + OAuth) y un
// resumen de actividad por cuenta. Editar o borrar cuentas se hace desde la
// base, no desde acá. El backend nunca manda el hash de contraseña.
function customerFullName(c) {
  return `${c.firstName || ''} ${c.lastName || ''}`.trim() || '(sin nombre)'
}

function CustomerDetailField({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={lbl}>{label}</span>
      <span style={{ fontSize: 12.5, color: C.text2 }}>{children || '—'}</span>
    </div>
  )
}

function CustomersTab() {
  const { customers, customersLoading, customersError, fetchCustomers } = useAdmin()
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => { fetchCustomers() }, [fetchCustomers])

  const term = search.trim().toLowerCase()
  const visible = term
    ? customers.filter(c =>
        customerFullName(c).toLowerCase().includes(term) ||
        (c.email || '').toLowerCase().includes(term) ||
        (c.phone || '').toLowerCase().includes(term))
    : customers

  const stats = {
    total: customers.length,
    verificadas: customers.filter(c => c.emailVerified).length,
    conPedido: customers.filter(c => c.ordersCount > 0).length,
    newsletter: customers.filter(c => c.newsletterSubscribed).length,
  }

  const shortDate = (iso) => iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null

  return (
    <div>
      <h3 style={sectionTitle}>
        Cuentas{customers.length > 0 ? <span style={{ fontFamily: ADMIN_FONT }}> ({customers.length})</span> : ''}
      </h3>

      {!customersLoading && customers.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          {[
            ['Total', stats.total],
            ['Con email verificado', stats.verificadas],
            ['Con al menos un pedido', stats.conPedido],
            ['Suscriptas al newsletter', stats.newsletter],
          ].map(([label, value]) => (
            <div key={label} style={{
              background: C.white, border: `1px solid ${C.border}`, borderRadius: 10,
              padding: '10px 16px', minWidth: 130,
            }}>
              <div style={{ fontSize: 20, fontWeight: 600, color: C.ink }}>{value}</div>
              <div style={{ fontSize: 10.5, color: C.muted, letterSpacing: '0.04em' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxWidth: 320, marginBottom: 16 }}>
        <label htmlFor="customers-search" style={lbl}>Buscar por nombre, email o teléfono</label>
        <input
          id="customers-search"
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Ej: ana@..."
          style={inp}
        />
      </div>

      {customersError && <p style={{ color: C.red, fontSize: 12.5 }}>{customersError}</p>}

      {customersLoading ? (
        <p style={{ color: C.muted, fontSize: 13 }}>Cargando cuentas...</p>
      ) : customers.length === 0 ? (
        <div style={{
          background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
          padding: '32px 20px', textAlign: 'center', color: C.muted, fontSize: 14,
        }}>
          Todavía no hay cuentas creadas.
        </div>
      ) : visible.length === 0 ? (
        <p style={{ color: C.muted, fontSize: 13 }}>Ninguna cuenta coincide con “{search}”.</p>
      ) : (
        <div style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          {visible.map((c, i) => {
            const open = expandedId === c.id
            return (
              <div key={c.id} style={{ borderBottom: i < visible.length - 1 ? `1px solid ${C.hairline}` : 'none' }}>
                <button
                  type="button"
                  onClick={() => setExpandedId(open ? null : c.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                    padding: '14px 20px', background: open ? C.hairline : 'transparent',
                    border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{customerFullName(c)}</div>
                    <div style={{ fontSize: 12, color: C.text3, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {c.email}
                      {c.emailVerified
                        ? <span style={pill(C.greenLight, C.green)}>Verificada</span>
                        : <span style={pill(C.amberLight, C.amberDark)}>Sin verificar</span>}
                      {c.newsletterSubscribed && <span style={pill(C.hairline, C.text3)}>Newsletter</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: C.text3, minWidth: 90, textAlign: 'right' }}>
                    {c.phone || '—'}
                  </div>
                  <div style={{ fontSize: 12, color: C.text3, minWidth: 90, textAlign: 'right' }}>
                    {c.city || '—'}
                  </div>
                  <div style={{ fontSize: 12, color: C.text3, minWidth: 80, textAlign: 'right' }}>
                    Alta {shortDate(c.createdAt)}
                  </div>
                  <div style={{ fontSize: 12, color: C.text3, minWidth: 70, textAlign: 'right' }}>
                    {c.ordersCount} pedido{c.ordersCount === 1 ? '' : 's'}
                  </div>
                  <span style={{ fontSize: 11, color: C.muted, width: 14, textAlign: 'center' }}>{open ? '▲' : '▼'}</span>
                </button>

                {open && (
                  <div style={{
                    padding: '16px 20px 20px', background: C.white,
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14,
                    borderTop: `1px solid ${C.hairline}`,
                  }}>
                    <CustomerDetailField label="Nombre">{customerFullName(c)}</CustomerDetailField>
                    <CustomerDetailField label="Email">{c.email}</CustomerDetailField>
                    <CustomerDetailField label="Teléfono">{c.phone}</CustomerDetailField>
                    <CustomerDetailField label="Domicilio">{c.address}</CustomerDetailField>
                    <CustomerDetailField label="Ciudad">{c.city}</CustomerDetailField>
                    <CustomerDetailField label="Código postal">{c.postalCode}</CustomerDetailField>
                    <CustomerDetailField label="Alta de la cuenta">{fmtDate(c.createdAt)}</CustomerDetailField>
                    <CustomerDetailField label="Última actualización">{fmtDate(c.updatedAt)}</CustomerDetailField>
                    <CustomerDetailField label="Email verificado">
                      {c.emailVerified ? (c.emailVerifiedAt ? fmtDate(c.emailVerifiedAt) : 'Sí') : 'No'}
                    </CustomerDetailField>
                    <CustomerDetailField label="Newsletter">{c.newsletterSubscribed ? 'Suscripta' : 'No'}</CustomerDetailField>
                    <CustomerDetailField label="Pedidos">
                      {c.ordersCount} en total · {c.paidOrdersCount} pago{c.paidOrdersCount === 1 ? '' : 's'}
                    </CustomerDetailField>
                    <CustomerDetailField label="Total gastado (pedidos pagos)">{fmt(c.totalSpent)}</CustomerDetailField>
                    <CustomerDetailField label="Última compra">{c.lastOrderAt ? fmtDate(c.lastOrderAt) : 'Sin pedidos'}</CustomerDetailField>
                    <CustomerDetailField label="Favoritos">{c.favoritesCount}</CustomerDetailField>
                    <CustomerDetailField label="Reseñas">{c.reviewsCount}</CustomerDetailField>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function OrdersTab() {
  const {
    orders, ordersTotal, invoiceSummary, ordersLoading, ordersError,
    fetchOrders, updateOrderStatus, issueInvoiceAsAdmin, openAdminInvoicePdf,
    reviewBankTransfer, downloadBankTransferProof,
  } = useAdmin()
  const [statusFilter, setStatusFilter] = useState('all')
  const [invoiceFilter, setInvoiceFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [transferFilter, setTransferFilter] = useState('all')
  const [search, setSearch]             = useState('')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [updatingOrderIds, setUpdatingOrderIds] = useState(() => new Set())
  const [invoicingOrderIds, setInvoicingOrderIds] = useState(() => new Set())
  const [quickStatusError, setQuickStatusError] = useState('')
  const [statusToast, setStatusToast] = useState(null)

  const notifyStatus = (message, tone = 'success') => {
    setStatusToast({ message, tone, id: Date.now() })
  }

  useEffect(() => {
    if (!statusToast) return undefined
    const timeout = setTimeout(() => setStatusToast(null), 3800)
    return () => clearTimeout(timeout)
  }, [statusToast])

  useEffect(() => {
    fetchOrders({ all: true })
  }, [fetchOrders])

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase()
    return orders.filter((order) => {
      if (statusFilter !== 'all' && order.status !== statusFilter) return false
      if (paymentFilter !== 'all' && order.payment_method !== paymentFilter) return false
      const transferState = order.transfer_status || 'awaiting_proof'
      if (transferFilter !== 'all' && (order.payment_method !== 'bank_transfer' || transferState !== transferFilter)) return false
      const invoiceStatus = order.invoice_display_status || 'not_applicable'
      const needsAttention = ((order.payment_method === 'mercadopago' && order.mp_status === 'approved')
        || (order.payment_method === 'bank_transfer' && order.transfer_status === 'approved'))
        && ['paid', 'preparing', 'shipped', 'delivered'].includes(order.status)
        && invoiceStatus !== 'authorized'
      if (invoiceFilter === 'attention' && !needsAttention) return false
      if (invoiceFilter === 'overdue' && !order.invoice_overdue) return false
      if (invoiceFilter === 'without_invoice' && (!needsAttention || order.invoice_id)) return false
      if (!['all', 'attention', 'overdue', 'without_invoice'].includes(invoiceFilter) && invoiceStatus !== invoiceFilter) return false
      if (!term) return true
      return [order.customer_name, order.customer_email, order.order_number]
        .some((value) => String(value || '').toLowerCase().includes(term))
    })
  }, [orders, search, statusFilter, invoiceFilter, paymentFilter, transferFilter])

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

  const transfersToReview = useMemo(() => orders.filter(order =>
    order.payment_method === 'bank_transfer' && order.transfer_status === 'pending_review'
  ), [orders])

  async function handleTransferReview(order, action) {
    let reason
    if (action === 'approve') {
      if (!window.confirm(`Confirmá que ingresaron exactamente ${fmt(order.total_amount)} para el pedido #${order.order_number}.`)) return
    } else {
      reason = window.prompt('Motivo del rechazo (obligatorio):', '')
      if (reason == null) return
    }
    try {
      await reviewBankTransfer(order.transfer_submission_id, action, reason, action === 'approve' ? order.total_amount : undefined)
      const data = await fetchOrders({ all: true })
      setSelectedOrder(data.orders?.find(item => item.id === order.id) || null)
      notifyStatus(action === 'approve' ? 'Transferencia aprobada.' : 'Transferencia rechazada.')
    } catch (error) {
      notifyStatus(error.message, 'error')
    }
  }

  async function handleTransferProof(order) {
    try {
      await downloadBankTransferProof(order.transfer_submission_id, order.transfer_proof_original_name)
    } catch (error) {
      notifyStatus(error.message, 'error')
    }
  }

  async function handleStatusChange(id, status) {
    const order = orders.find(item => item.id === id)
    try {
      await updateOrderStatus(id, status)
      fetchOrders({ all: true })
      notifyStatus(`Pedido #${order?.order_number || id}: estado cambiado a ${STATUS_LABEL[status] || status}`)
    } catch (error) {
      notifyStatus(error.message || 'No se pudo actualizar el estado del pedido', 'error')
      throw error
    }
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
      notifyStatus(`Pedido #${order.order_number}: estado cambiado a ${STATUS_LABEL[status] || status}`)
    } catch (error) {
      setQuickStatusError(error.message || 'No se pudo actualizar el estado del pedido.')
      notifyStatus(error.message || 'No se pudo actualizar el estado del pedido', 'error')
    } finally {
      setUpdatingOrderIds((current) => {
        const next = new Set(current)
        next.delete(order.id)
        return next
      })
    }
  }

  async function handleInvoice(order) {
    if (invoicingOrderIds.has(order.id)) return
    setInvoicingOrderIds((current) => new Set(current).add(order.id))
    try {
      const result = await issueInvoiceAsAdmin(order.id)
      const data = await fetchOrders({ all: true })
      const updated = data.orders?.find((item) => item.id === order.id)
      if (updated) setSelectedOrder(updated)
      notifyStatus(result.invoice?.status === 'authorized'
        ? `Factura del pedido #${order.order_number} autorizada.`
        : `Intento de factura del pedido #${order.order_number} finalizado.`)
    } catch (error) {
      await fetchOrders({ all: true })
      notifyStatus(error.message || 'No se pudo facturar el pedido', 'error')
      throw error
    } finally {
      setInvoicingOrderIds((current) => {
        const next = new Set(current)
        next.delete(order.id)
        return next
      })
    }
  }

  async function handleInvoicePdf(order, inline) {
    await openAdminInvoicePdf(order.id, order.order_number, { inline })
  }

  return (
    <div>
      {statusToast && (
        <div role="status" aria-live="polite" style={{
          position: 'fixed', top: 18, right: 20, zIndex: 3200,
          maxWidth: 'min(410px, calc(100vw - 40px))',
          background: statusToast.tone === 'error' ? '#991b1b' : '#166534', color: '#fff',
          borderRadius: 9, padding: '11px 14px', boxShadow: '0 12px 30px rgba(15,23,42,.28)',
          display: 'flex', alignItems: 'center', gap: 12,
          fontSize: 12.5, fontWeight: 700, animation: 'fnx-notice-in .2s ease-out both',
        }}>
          <span style={{ flex: 1 }}>{statusToast.message}</span>
          <button
            type="button"
            aria-label="Cerrar notificación"
            onClick={() => setStatusToast(null)}
            style={{ border: 0, background: '#fff', color: '#111827', borderRadius: 5, width: 23, height: 23, cursor: 'pointer', fontWeight: 900 }}
          >
            ×
          </button>
        </div>
      )}
      <div className="adm-work-queues">
        <section className="adm-work-queue" style={{ borderTop: `3px solid ${C.amber}`, gridColumn: '1 / -1' }}>
          <header className="adm-work-queue__head"><div><h2>Transferencias por revisar</h2><p>Verificá el ingreso bancario antes de confirmar el pago.</p></div><span>{transfersToReview.length}</span></header>
          <div className="adm-work-queue__list">
            {!transfersToReview.length && <p className="adm-work-queue__empty">No hay comprobantes pendientes.</p>}
            {transfersToReview.map(order => <button type="button" key={order.id} onClick={() => setSelectedOrder(order)} style={{ width: '100%', border: 0, borderBottom: `1px solid ${C.hairline}`, background: C.white, padding: '12px 18px', display: 'grid', gridTemplateColumns: '110px 1fr 1fr 110px', gap: 10, textAlign: 'left', cursor: 'pointer' }}>
              <strong>#{order.order_number}</strong><span>{order.customer_name}</span><span>{order.transfer_payer_account_holder}</span><strong>{fmt(order.total_amount)}</strong>
            </button>)}
          </div>
        </section>
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

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        <button
          type="button"
          aria-pressed={invoiceFilter === 'attention'}
          onClick={() => setInvoiceFilter(invoiceFilter === 'attention' ? 'all' : 'attention')}
          style={{
            padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
            fontSize: 11, fontFamily: 'inherit', fontWeight: 600, letterSpacing: '0.02em',
            color: invoiceFilter === 'attention' ? C.white : C.text2,
            background: invoiceFilter === 'attention' ? C.dark : C.hairline,
          }}
        >
          Facturas pendientes {Number(invoiceSummary?.pending || 0)}
        </button>
        <button
          type="button"
          aria-pressed={invoiceFilter === 'overdue'}
          onClick={() => setInvoiceFilter(invoiceFilter === 'overdue' ? 'all' : 'overdue')}
          style={{
            padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
            fontSize: 11, fontFamily: 'inherit', fontWeight: 600, letterSpacing: '0.02em',
            color: invoiceFilter === 'overdue' ? C.white : C.text2,
            background: invoiceFilter === 'overdue' ? C.dark : C.hairline,
          }}
        >
          Más de 24 h {Number(invoiceSummary?.overdue || 0)}
        </button>
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

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <label style={{ ...lbl, minWidth: 220 }}>Medio de pago
            <select value={paymentFilter} onChange={event => setPaymentFilter(event.target.value)} style={{ ...inp, display: 'block', marginTop: 5 }}>
              <option value="all">Todos</option><option value="mercadopago">Mercado Pago</option><option value="bank_transfer">Transferencia bancaria</option>
            </select>
          </label>
          <label style={{ ...lbl, minWidth: 220 }}>Estado de transferencia
            <select value={transferFilter} onChange={event => setTransferFilter(event.target.value)} style={{ ...inp, display: 'block', marginTop: 5 }}>
              <option value="all">Todos</option><option value="awaiting_proof">Esperando comprobante</option><option value="pending_review">Pendiente de revisión</option><option value="rejected">Rechazada</option><option value="approved">Aprobada</option>
            </select>
          </label>
        </div>
        <label style={{ ...lbl, display: 'block', marginBottom: 5 }}>Estado de factura</label>
        <select value={invoiceFilter} onChange={(event) => setInvoiceFilter(event.target.value)} style={{ ...inp, maxWidth: 250 }}>
          <option value="all">Todas</option>
          <option value="attention">Pendientes de atención</option>
          <option value="overdue">Demoradas más de 24 h</option>
          <option value="needs_data">Faltan datos</option>
          <option value="pending">Pendiente</option>
          <option value="processing">Procesando</option>
          <option value="uncertain">Incierta</option>
          <option value="rejected">Rechazada</option>
          <option value="error">Error</option>
          <option value="without_invoice">Sin factura</option>
          <option value="authorized">Autorizada</option>
        </select>
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
                gridTemplateColumns: '105px 120px 1fr 140px 85px 115px 160px 70px',
                gap: 8, padding: '8px 14px',
                borderBottom: `1px solid ${C.hairline}`,
                background: C.paper,
              }}>
                {['Número', 'Fecha', 'Cliente', 'Email', 'Total', 'Factura', 'Estado rápido', 'Acción'].map((h) => (
                  <span key={h} style={{ ...lbl }}>{h}</span>
                ))}
              </div>

              {filteredOrders.map((order, i) => (
                <div
                  key={order.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '105px 120px 1fr 140px 85px 115px 160px 70px',
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
                  <InvoiceBadge order={order} />
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
          onInvoice={handleInvoice}
          onInvoicePdf={handleInvoicePdf}
          onTransferReview={handleTransferReview}
          onTransferProof={handleTransferProof}
          invoiceSaving={invoicingOrderIds.has(selectedOrder.id)}
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
        .adm-work-queue__preparation-alert { display:flex; align-items:flex-start; gap:9px; padding:10px 18px; border-bottom:1px solid #F3D18C; background:${C.amberLight}; color:#805B12; font-size:11.5px; font-weight:650; line-height:1.45; }
        .adm-work-queue__preparation-alert svg { flex:0 0 auto; margin-top:1px; }
        .adm-work-queue__list { max-height:440px; overflow-y:auto; }
        .adm-work-queue__empty { padding:30px 18px; text-align:center; color:${C.muted}; font-size:12px; }
        .adm-work-order { padding:14px 18px; border-bottom:1px solid ${C.hairline}; }
        .adm-work-order.is-preparation-overdue { padding-left:14px; border-left:4px solid ${C.amber}; background:#FFFCF5; }
        .adm-work-order:last-child { border-bottom:0; }
        .adm-work-order__top,.adm-work-order__footer { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .adm-work-order__top > strong { color:${C.ink}; font:600 12px ${ADMIN_FONT}; }
        .adm-work-order__customer { margin-top:8px; color:${C.ink}; font-size:13px; font-weight:600; }
        .adm-work-order__created-at { margin-top:3px; color:${C.muted}; font-size:10px; line-height:1.35; }
        .adm-work-order__preparation-alert { display:flex; align-items:center; gap:7px; margin-top:8px; color:#805B12; font-size:10.5px; }
        .adm-work-order__preparation-alert > span { width:17px; height:17px; display:grid; place-items:center; flex:0 0 auto; border-radius:50%; background:${C.amber}; color:#fff; font-size:11px; font-weight:900; }
        .adm-work-order__preparation-alert strong { font-weight:700; }
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

// Sube carpetas de imágenes de a tandas en vez de mandarlas en un solo POST
// (con 300+ fotos un único request se pasaba de la RAM del server con
// memoryStorage). Todas las tandas reusan el mismo importId así las imágenes
// caen en la misma revisión.
const FOLDER_IMAGES_BATCH_SIZE = 10

// Debe ser <= al límite del servidor (IMAGE_UPLOAD_MAX_BYTES en
// backend/routes/products.js). Cuando multer detecta una foto que supera su
// límite corta el parseo a mitad de la subida — el navegador lo ve como
// conexión cortada ("Failed to fetch"), no como un error prolijo. Filtramos
// acá antes de mandar nada para que una foto pesada nunca llegue a cortarla.
const FOLDER_IMAGES_MAX_FILE_BYTES = 20 * 1024 * 1024

// ── ImportUploadCard ─────────────────────────────────────────────────────────
// Resumen de la última carga de lista de un proveedor. Contesta la pregunta que
// no se puede responder mirando los productos: si una lista sin aumentos se subió
// o no, porque en ese caso ningún `price_updated_at` se movió.
function LastImportNote({ supplier, settings, align = 'left' }) {
  if (!supplier) return null
  const setting = settings.find(item => item.supplier === supplier)
  const base = { fontSize: 10, lineHeight: 1.4, marginTop: 4, textAlign: align }
  if (!setting?.lastImport) {
    return <div style={{ ...base, color: C.muted }}>Sin cargas registradas todavía.</div>
  }
  const { at, created, updated, unchanged, pendingVariant } = setting.lastImport
  const cambios = [
    updated ? `${updated} actualizados` : null,
    created ? `${created} nuevos` : null,
    !updated && !created && unchanged ? 'sin cambios de precio' : null,
  ].filter(Boolean).join(' · ')
  return (
    <div style={{ ...base, color: C.text3 }}>
      Última carga <strong style={{ color: C.ink }}>{fmtDesdeCarga(at)}</strong>
      {cambios ? ` · ${cambios}` : ''}
      {pendingVariant ? (
        <span style={{ color: '#9A3412' }}> · {pendingVariant} quedaron esperando variante</span>
      ) : ''}
    </div>
  )
}

// Control de "esta variante sigue el precio de aquella". Aparece solo en las
// variantes sin código de proveedor: son las que el negocio agrega a mano y que
// ninguna lista de precios va a actualizar nunca.
function PriceFollowField({ rules, index, onChange }) {
  const rule = rules[index]
  // Solo se puede seguir a una variante con precio propio: prohibir cadenas
  // descarta los ciclos y deja el recálculo en una sola pasada.
  const opciones = rules
    .map((item, itemIndex) => ({ item, itemIndex }))
    .filter(({ item, itemIndex }) => itemIndex !== index && item.priceSourceIndex == null)
  const siguiendo = rule.priceSourceIndex != null
  // Si otras variantes ya siguen a esta, no puede pasar a seguir a una tercera:
  // sería una cadena, y la resolución exige que el origen tenga precio propio.
  const esOrigenDeOtras = rules.some((item, itemIndex) => itemIndex !== index && item.priceSourceIndex === index)
  if (esOrigenDeOtras) {
    return <small style={{ fontSize: 9, color: C.muted }}>Otras variantes siguen su precio</small>
  }
  if (!opciones.length) return null

  const etiqueta = ({ item, itemIndex }) =>
    String(item.supplierCodes?.[0] || item.productData?.codigo || '').trim() || `Variante ${itemIndex + 1}`

  return (
    <span style={{ display: 'grid', gap: 3 }}>
      <select
        value={siguiendo ? String(rule.priceSourceIndex) : ''}
        onChange={event => onChange(event.target.value === '' ? null : Number(event.target.value), rule.priceSourcePercent)}
        aria-label={`Origen del precio de la variante ${index + 1}`}
        title="El proveedor no manda esta variante. Si sigue a otra, se actualiza sola con cada lista de precios."
        style={{ ...inp, minWidth: 0, height: 24, padding: '2px 4px', fontSize: 9.5 }}
      >
        <option value="">Precio propio</option>
        {opciones.map(opcion => (
          <option key={opcion.itemIndex} value={opcion.itemIndex}>Sigue a {etiqueta(opcion)}</option>
        ))}
      </select>
      {siguiendo && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <input
            inputMode="decimal"
            value={rule.priceSourcePercent ?? 0}
            onChange={event => onChange(rule.priceSourceIndex, event.target.value)}
            aria-label={`Porcentaje sobre la variante seguida, variante ${index + 1}`}
            title="0 = mismo precio. 15 = 15% más caro. Se admiten negativos."
            style={{ ...inp, minWidth: 0, width: 46, height: 22, padding: '2px 4px', fontSize: 9.5 }}
          />
          <small style={{ fontSize: 9, color: C.muted }}>% sobre esa</small>
        </span>
      )}
    </span>
  )
}

function ImportUploadCard({
  label, hint, disabled, onFile, onFiles, accept = '.xls,.xlsx', busyLabel = 'Importando...',
  children = null, multiple = false, allowDirectory = false,
}) {
  const inputRef = useRef(null)
  const directoryInputRef = useRef(null)
  const handleSelection = (fileList) => {
    const acceptLower = String(accept).toLowerCase()
    const matcher = acceptLower.includes('.pdf')
      ? /\.pdf$/i
      : acceptLower.includes('image/')
        ? /\.(jpe?g|png|webp|gif)$/i
        : /\.(xlsx|xls)$/i
    const files = [...(fileList || [])].filter(file => matcher.test(file.name))
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

// Los dos plazos que definen todo lo que la tienda le promete al cliente. Van
// juntos en una tarjeta porque sólo tienen sentido comparados entre sí, y
// porque el backend los valida como par.
function DeliveryDefaultCard({ settings, onSave }) {
  const [inmediato, setInmediato] = useState(String(settings.diasDespachoInmediato ?? 1))
  const [reposicion, setReposicion] = useState(String(settings.diasReposicion ?? 3))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setInmediato(String(settings.diasDespachoInmediato ?? 1))
    setReposicion(String(settings.diasReposicion ?? 3))
  }, [settings.diasDespachoInmediato, settings.diasReposicion])

  const save = async () => {
    const diasDespachoInmediato = Math.trunc(Number(inmediato))
    const diasReposicion = Math.trunc(Number(reposicion))
    if (!Number.isFinite(diasDespachoInmediato) || diasDespachoInmediato < 0) {
      setMessage('El despacho inmediato no puede ser negativo.'); return
    }
    if (!Number.isFinite(diasReposicion) || diasReposicion <= 0) {
      setMessage('Ingresá un plazo de reposición válido.'); return
    }
    if (diasDespachoInmediato > diasReposicion) {
      setMessage('El despacho inmediato no puede tardar más que la reposición.'); return
    }
    setSaving(true)
    setMessage('')
    try {
      await onSave({ diasDespachoInmediato, diasReposicion })
      setMessage('Plazos guardados.')
    } catch (err) {
      setMessage(err.message || 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>Plazos de entrega</div>
      <p style={{ fontSize: 10.5, color: C.muted, margin: 0 }}>Días hábiles antes de despachar, según si el producto está en el local o hay que pedirlo.</p>
      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        <label style={{ fontSize: 10.5, color: C.muted, minWidth: 74 }}>En el local</label>
        <input type="number" min="0" step="1" value={inmediato} onChange={event => { setInmediato(event.target.value); setMessage('') }} aria-label="Días hábiles de despacho con stock inmediato" style={{ ...inp, minWidth: 0 }} />
      </div>
      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        <label style={{ fontSize: 10.5, color: C.muted, minWidth: 74 }}>Reposición</label>
        <input type="number" min="1" step="1" value={reposicion} onChange={event => { setReposicion(event.target.value); setMessage('') }} aria-label="Días hábiles de reposición del proveedor" style={{ ...inp, minWidth: 0 }} />
        <button type="button" onClick={save} disabled={saving} style={{ ...outlineBtn, padding: '5px 9px', whiteSpace: 'nowrap' }}>{saving ? 'Guardando...' : 'Guardar'}</button>
      </div>
      <div style={{ minHeight: 14, fontSize: 10.5, color: message.includes('guardados') ? C.green : C.red }}>
        {message || `${Math.trunc(Number(inmediato)) || 0} días si está · ${Math.trunc(Number(reposicion)) || 3} si hay que pedirlo`}
      </div>
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
      const skipped = Number(result.skippedCount || 0)
      setMessage(`${result.productCount} productos pasaron a ${currency}.${skipped ? ` ${skipped} mantuvieron su moneda por tener una excepción propia.` : ''}`)
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
      {selectedName && <SupplierImportHistory supplier={selectedName} settings={settings} />}
      {message && <span style={{ fontSize: 10.5, color: message.includes('pasaron') ? C.green : C.red }}>{message}</span>}
    </div>
  )
}

// El resumen de la última carga viaja con supplierSettings; el detalle completo
// se pide recién al abrirlo, que es cuando la pregunta es "¿cuál de todas subí?".
function SupplierImportHistory({ supplier, settings }) {
  const { fetchSupplierImports } = useAdmin()
  const contenedor = useRef(null)
  const [open, setOpen] = useState(false)
  const [imports, setImports] = useState(null)
  const [error, setError] = useState('')

  const setting = settings.find(item => item.supplier === supplier)
  const ultimaCarga = setting?.lastImport?.at || null

  useEffect(() => { setOpen(false); setImports(null); setError('') }, [supplier])
  // Una importación nueva deja el detalle viejo: se descarta para que al reabrirlo
  // aparezca la carga que se acaba de hacer.
  useEffect(() => { setImports(null) }, [ultimaCarga])

  useEffect(() => {
    if (!open) return undefined
    const alClickear = (event) => {
      if (!contenedor.current?.contains(event.target)) setOpen(false)
    }
    const alTeclear = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', alClickear)
    document.addEventListener('keydown', alTeclear)
    return () => {
      document.removeEventListener('mousedown', alClickear)
      document.removeEventListener('keydown', alTeclear)
    }
  }, [open])

  useEffect(() => {
    if (!open || imports) return undefined
    let vigente = true
    fetchSupplierImports(supplier)
      .then(data => { if (vigente) setImports(data) })
      .catch(err => { if (vigente) setError(err.message || 'No se pudo cargar el historial') })
    return () => { vigente = false }
  }, [open, imports, supplier, fetchSupplierImports])

  const desde = ultimaCarga ? fmtDesdeCarga(ultimaCarga) : null

  return (
    <div ref={contenedor} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        title={`Cargas de lista de precios de ${supplier}`}
        style={{ ...outlineBtn, padding: '6px 9px', fontSize: 10.5, color: C.text3 }}
      >
        Precios: {desde || 'sin cargas'}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 40, width: 340, maxHeight: 300, overflowY: 'auto', background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: '0 12px 30px rgba(0,0,0,.14)' }}>
          <div style={{ padding: '9px 11px', borderBottom: `1px solid ${C.hairline}`, fontSize: 11, fontWeight: 600, color: C.ink }}>
            Cargas de lista · {supplier}
          </div>
          {error && <div style={{ padding: '10px 11px', fontSize: 10.5, color: C.red }}>{error}</div>}
          {!error && !imports && <div style={{ padding: '10px 11px', fontSize: 10.5, color: C.muted }}>Cargando...</div>}
          {!error && imports?.length === 0 && (
            <div style={{ padding: '10px 11px', fontSize: 10.5, color: C.muted }}>
              Todavía no se subió ninguna lista de este proveedor.
            </div>
          )}
          {!error && imports?.map(item => (
            <div key={item.id} style={{ padding: '9px 11px', borderBottom: `1px solid ${C.hairline}`, fontSize: 10.5, color: C.text2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ color: C.ink }}>{fmtDate(item.at)}</strong>
                <span style={{ color: C.muted }}>{item.totalRows} filas</span>
              </div>
              <div style={{ marginTop: 3, color: C.muted }}>
                {[
                  item.updated ? `${item.updated} actualizados` : null,
                  item.created ? `${item.created} nuevos` : null,
                  item.unchanged ? `${item.unchanged} sin cambios` : null,
                ].filter(Boolean).join(' · ') || 'No cambió ningún precio'}
                {item.pendingVariant ? (
                  <span style={{ color: '#9A3412' }}> · {item.pendingVariant} esperando variante</span>
                ) : ''}
              </div>
              <div style={{ marginTop: 2, color: C.text3, wordBreak: 'break-word' }}>
                {item.fileNames.join(', ') || 'Sin nombre de archivo'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CleosProductEditor({ product, onChange, importId, onUploadImage }) {
  const { categoryTree } = useAdmin()
  const categoryOptions = categoryTree.map(node => ({ value: getCategoryValue(node), label: node.label }))
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
              {categoryOptions.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}
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
  const categoryOptions = categoryTree.map(node => ({ value: getCategoryValue(node), label: node.label }))
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
              {categoryOptions.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}
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
  const [mergeDraft, setMergeDraft] = useState(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [replaceDetectedOnChoose, setReplaceDetectedOnChoose] = useState(false)
  const selectedProducts = row.selectedProducts || []
  const pendingMerges = row.pendingMerges || []
  const pendingDeletes = row.pendingDeletes || []

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
  const recommendedCode = String(row.detectedCode || nearbyCodeCandidates[0] || '').trim()

  const openProductSearch = () => {
    setCodeError('')
    setResults([])
    setQuery(recommendedCode)
    setReplaceDetectedOnChoose(false)
    setLoading(recommendedCode.length >= 2)
    setOpen(true)
  }

  const closeProductSearch = () => {
    setOpen(false)
    setQuery('')
    setResults([])
    setLoading(false)
    setCodeError('')
    setReplaceDetectedOnChoose(false)
  }

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

  const choose = (product, selectedCode = query.trim() || row.detectedCode, replaceDetectedCode = false) => {
    const selectedProduct = {
      id: product.id,
      codigo: product.codigo,
      name: product.name || null,
      descripcion: product.descripcion || null,
      image_url: product.image_url || null,
      medida: product.medida || null,
    }
    const nextProducts = selectedProducts.some(selected => selected.id === product.id)
      ? selectedProducts
      : [...selectedProducts, selectedProduct]
    onChange({
      ...row,
      detectedCode: replaceDetectedCode
        ? (selectedCode || product.codigo)
        : (row.detectedCode || selectedCode || product.codigo),
      selectedProducts: nextProducts,
      accepted: Boolean(nextProducts.length && row.selectedImageKey),
    })
    setOpen(false)
    setQuery('')
    setResults([])
    setCodeError('')
    setReplaceDetectedOnChoose(false)
  }

  const removeProduct = (productId) => {
    const nextProducts = selectedProducts.filter(product => product.id !== productId)
    onChange({
      ...row,
      selectedProducts: nextProducts,
      accepted: Boolean(nextProducts.length && row.selectedImageKey && row.accepted),
    })
  }

  const variantGuess = (product, variantType) => {
    if (variantType === 'size') return product?.medida || ''
    return inferPriceColor(product?.codigo, product?.descripcion || product?.name).name || ''
  }

  const suggestedBaseCode = (leftCode, rightCode) => {
    const left = String(leftCode || '').trim().toUpperCase()
    const right = String(rightCode || '').trim().toUpperCase()
    let index = 0
    while (index < left.length && index < right.length && left[index] === right[index]) index++
    const common = left.slice(0, index).replace(/[-_/\s]+$/, '')
    return common.length >= 3 ? common : left
  }

  const startMerge = (source) => {
    const target = selectedProducts.find(product => product.id !== source.id)
    if (!target) return
    const sourceColor = inferPriceColor(source.codigo, source.descripcion || source.name)
    const targetColor = inferPriceColor(target.codigo, target.descripcion || target.name)
    setMergeDraft({
      sourceProductId: source.id,
      targetProductId: target.id,
      baseCode: suggestedBaseCode(target.codigo, source.codigo),
      variantType: 'color',
      targetValue: targetColor.name || '',
      sourceValue: sourceColor.name || '',
      targetHex: targetColor.hex || '#CCCCCC',
      sourceHex: sourceColor.hex || '#CCCCCC',
    })
    setDeleteConfirmId(null)
  }

  const changeMergeType = (variantType) => {
    if (!mergeDraft) return
    const source = selectedProducts.find(product => product.id === mergeDraft.sourceProductId)
    const target = selectedProducts.find(product => product.id === mergeDraft.targetProductId)
    setMergeDraft({
      ...mergeDraft,
      variantType,
      targetValue: variantGuess(target, variantType),
      sourceValue: variantGuess(source, variantType),
    })
  }

  const changeMergeTarget = (targetProductId) => {
    const target = selectedProducts.find(product => product.id === targetProductId)
    const source = selectedProducts.find(product => product.id === mergeDraft?.sourceProductId)
    const guessedColor = inferPriceColor(target?.codigo, target?.descripcion || target?.name)
    setMergeDraft(current => ({
      ...current,
      targetProductId,
      baseCode: suggestedBaseCode(target?.codigo, source?.codigo),
      targetValue: variantGuess(target, current.variantType),
      targetHex: guessedColor.hex || '#CCCCCC',
    }))
  }

  const saveMerge = () => {
    if (!mergeDraft?.baseCode.trim() || !mergeDraft?.targetValue.trim() || !mergeDraft?.sourceValue.trim()) return
    const source = selectedProducts.find(product => product.id === mergeDraft.sourceProductId)
    const target = selectedProducts.find(product => product.id === mergeDraft.targetProductId)
    if (!source || !target || source.id === target.id) return
    const merge = {
      ...mergeDraft,
      baseCode: mergeDraft.baseCode.trim().toUpperCase(),
      targetValue: mergeDraft.targetValue.trim(),
      sourceValue: mergeDraft.sourceValue.trim(),
      targetCode: target.codigo,
      sourceCode: source.codigo,
      sourceProduct: source,
    }
    const nextProducts = selectedProducts.filter(product => product.id !== source.id)
    onChange({
      ...row,
      selectedProducts: nextProducts,
      pendingMerges: [...pendingMerges, merge],
      accepted: Boolean(nextProducts.length && row.selectedImageKey),
    })
    setMergeDraft(null)
  }

  const queueDelete = (product) => {
    const nextProducts = selectedProducts.filter(selected => selected.id !== product.id)
    onChange({
      ...row,
      selectedProducts: nextProducts,
      pendingDeletes: [...pendingDeletes, { productId: product.id, product }],
      accepted: Boolean(nextProducts.length && row.selectedImageKey && row.accepted),
    })
    setDeleteConfirmId(null)
    setMergeDraft(null)
  }

  const undoMerge = (index) => {
    const merge = pendingMerges[index]
    onChange({
      ...row,
      selectedProducts: merge?.sourceProduct ? [...selectedProducts, merge.sourceProduct] : selectedProducts,
      pendingMerges: pendingMerges.filter((_, mergeIndex) => mergeIndex !== index),
    })
  }

  const undoDelete = (index) => {
    const deletion = pendingDeletes[index]
    onChange({
      ...row,
      selectedProducts: deletion?.product ? [...selectedProducts, deletion.product] : selectedProducts,
      pendingDeletes: pendingDeletes.filter((_, deleteIndex) => deleteIndex !== index),
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
        choose(exact, code, true)
        return
      }
      setOpen(true)
      setQuery(code)
      setResults(found)
      setReplaceDetectedOnChoose(true)
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
            <div key={product.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px', border: `1px solid ${C.dark}`, borderRadius: 7, background: C.dark, color: C.white, fontSize: 11.5 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>{product.codigo}</strong> — {product.name || product.descripcion || 'Sin descripción'}
              </span>
              {selectedProducts.length > 1 && (
                <button
                  type="button"
                  onClick={() => startMerge(product)}
                  title={`Unir ${product.codigo} dentro de otro producto seleccionado`}
                  style={{ ...outlineBtn, padding: '3px 7px', fontSize: 9.5, color: C.dark, borderColor: C.white, background: C.white }}
                >
                  Unir
                </button>
              )}
              {deleteConfirmId === product.id ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <button type="button" onClick={() => queueDelete(product)} style={{ ...outlineBtn, padding: '3px 7px', fontSize: 9.5, color: C.white, borderColor: C.red, background: C.red }}>Sí, eliminar</button>
                  <button type="button" onClick={() => setDeleteConfirmId(null)} style={{ ...outlineBtn, padding: '3px 7px', fontSize: 9.5, color: C.dark, borderColor: C.white, background: C.white }}>No</button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => { setDeleteConfirmId(product.id); setMergeDraft(null) }}
                  title={`Eliminar ${product.codigo} al confirmar`}
                  style={{ border: `1px solid ${C.red}`, borderRadius: 5, background: C.red, color: C.white, cursor: 'pointer', fontSize: 9.5, padding: '3px 7px' }}
                >
                  Eliminar
                </button>
              )}
              <button
                type="button"
                onClick={() => removeProduct(product.id)}
                aria-label={`Quitar ${product.codigo}`}
                title="Quitar producto"
                style={{ border: `1px solid ${C.white}`, borderRadius: 5, background: C.white, color: C.dark, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '2px 5px' }}
              >
                ×
              </button>
            </div>
          )) : (
            <span style={pill(C.red, C.white)}>Sin producto asociado</span>
          )}
          <button type="button" onClick={openProductSearch} style={{ ...outlineBtn, justifySelf: 'start', padding: '5px 9px', fontSize: 10.5 }}>
            {selectedProducts.length ? 'Agregar otro producto' : 'Buscar producto'}
          </button>
          {mergeDraft && (
            <div style={{ padding: 11, border: `1px solid ${C.dark}`, borderRadius: 8, background: C.dark, color: C.white, boxShadow: '0 6px 18px rgba(17, 24, 39, 0.18)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <strong style={{ fontSize: 11.5, color: C.white }}>Crear un producto base con variantes</strong>
                <button type="button" onClick={() => setMergeDraft(null)} style={{ border: `1px solid ${C.white}`, borderRadius: 5, background: C.white, cursor: 'pointer', color: C.dark, lineHeight: 1, padding: '3px 6px' }}>×</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '145px minmax(0, 1fr)', gap: 7, alignItems: 'center' }}>
                <label style={{ fontSize: 10.5, color: '#E5E7EB' }}>Tomar datos generales de</label>
                <select
                  value={mergeDraft.targetProductId}
                  onChange={event => changeMergeTarget(event.target.value)}
                  title="Define de qué producto se conservan el nombre, descripción, categoría e información general. Los dos códigos originales serán variantes."
                  style={{ ...inp, padding: '6px 7px', fontSize: 11 }}
                >
                  {selectedProducts.filter(product => product.id !== mergeDraft.sourceProductId).map(product => (
                    <option key={product.id} value={product.id}>{product.codigo}</option>
                  ))}
                </select>
                <label style={{ fontSize: 10.5, color: '#E5E7EB' }}>Código del producto unificado</label>
                <input
                  value={mergeDraft.baseCode}
                  maxLength={64}
                  onChange={event => setMergeDraft(current => ({ ...current, baseCode: event.target.value.toUpperCase() }))}
                  placeholder="Ej: FE-AP-121"
                  style={{ ...inp, padding: '6px 7px', fontSize: 11 }}
                />
                <label style={{ fontSize: 10.5, color: '#E5E7EB' }}>Tipo de variantes</label>
                <div style={{ display: 'flex', gap: 5 }}>
                  <button type="button" onClick={() => changeMergeType('color')} style={{ ...outlineBtn, padding: '4px 8px', fontSize: 10, borderColor: mergeDraft.variantType === 'color' ? C.red : C.white, background: mergeDraft.variantType === 'color' ? C.red : C.white, color: mergeDraft.variantType === 'color' ? C.white : C.dark }}>Colores</button>
                  <button type="button" onClick={() => changeMergeType('size')} style={{ ...outlineBtn, padding: '4px 8px', fontSize: 10, borderColor: mergeDraft.variantType === 'size' ? C.red : C.white, background: mergeDraft.variantType === 'size' ? C.red : C.white, color: mergeDraft.variantType === 'size' ? C.white : C.dark }}>Medidas</button>
                </div>
                <label style={{ fontSize: 10.5, color: '#E5E7EB' }}>Valor de {selectedProducts.find(product => product.id === mergeDraft.targetProductId)?.codigo}</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {mergeDraft.variantType === 'color' && <input type="color" value={mergeDraft.targetHex} onChange={event => setMergeDraft(current => ({ ...current, targetHex: event.target.value }))} style={{ width: 34, height: 31, padding: 1, border: `1px solid ${C.border}`, borderRadius: 5 }} />}
                  <input value={mergeDraft.targetValue} onChange={event => setMergeDraft(current => ({ ...current, targetValue: event.target.value }))} placeholder={mergeDraft.variantType === 'color' ? 'Ej: Blanco' : 'Ej: 10 cm'} style={{ ...inp, padding: '6px 7px', fontSize: 11, flex: 1 }} />
                </div>
                <label style={{ fontSize: 10.5, color: '#E5E7EB' }}>Valor de {selectedProducts.find(product => product.id === mergeDraft.sourceProductId)?.codigo}</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {mergeDraft.variantType === 'color' && <input type="color" value={mergeDraft.sourceHex} onChange={event => setMergeDraft(current => ({ ...current, sourceHex: event.target.value }))} style={{ width: 34, height: 31, padding: 1, border: `1px solid ${C.border}`, borderRadius: 5 }} />}
                  <input value={mergeDraft.sourceValue} onChange={event => setMergeDraft(current => ({ ...current, sourceValue: event.target.value }))} placeholder={mergeDraft.variantType === 'color' ? 'Ej: Negro' : 'Ej: 20 cm'} style={{ ...inp, padding: '6px 7px', fontSize: 11, flex: 1 }} />
                </div>
              </div>
              <p style={{ fontSize: 10, lineHeight: 1.4, color: '#D1D5DB', margin: '8px 0' }}>
                Se creará el producto base <strong style={{ color: C.white }}>{mergeDraft.baseCode || 'código pendiente'}</strong>. Tanto {selectedProducts.find(product => product.id === mergeDraft.targetProductId)?.codigo} como {selectedProducts.find(product => product.id === mergeDraft.sourceProductId)?.codigo} quedarán dentro como variantes con sus códigos y precios propios.
              </p>
              <button type="button" disabled={!mergeDraft.baseCode.trim() || !mergeDraft.targetValue.trim() || !mergeDraft.sourceValue.trim()} onClick={saveMerge} style={{ ...solidBtn, padding: '6px 10px', fontSize: 10.5, background: C.red, color: C.white }}>Preparar unión</button>
            </div>
          )}
          {pendingMerges.map((merge, index) => (
            <div key={`${merge.sourceProductId}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px', border: `1px solid ${C.dark}`, borderRadius: 7, background: '#374151', color: C.white, fontSize: 10.5 }}>
              <span style={{ flex: 1 }}><strong>{merge.targetCode}</strong> y <strong>{merge.sourceCode}</strong> quedarán como variantes del producto base <strong>{merge.baseCode}</strong>.</span>
              <button type="button" onClick={() => undoMerge(index)} style={{ ...outlineBtn, padding: '3px 7px', fontSize: 9.5, background: C.white, color: C.dark, borderColor: C.white }}>Deshacer</button>
            </div>
          ))}
          {pendingDeletes.map((deletion, index) => (
            <div key={`${deletion.productId}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px', border: `1px solid ${C.red}`, borderRadius: 7, background: C.red, color: C.white, fontSize: 10.5 }}>
              <span style={{ flex: 1 }}><strong>{deletion.product?.codigo}</strong> se eliminará al confirmar.</span>
              <button type="button" onClick={() => undoDelete(index)} style={{ ...outlineBtn, padding: '3px 7px', fontSize: 9.5, color: C.dark, borderColor: C.white, background: C.white }}>Deshacer</button>
            </div>
          ))}
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
        <button type="button" onClick={closeProductSearch} style={{ ...outlineBtn, padding: '5px 9px', fontSize: 10.5 }}>Cancelar</button>
      </div>
      <div style={{ display: 'grid', gap: 3, marginTop: results.length ? 7 : 0 }}>
        {recommendedCode && normalizeCode(query) === normalizeCode(recommendedCode) && (
          <span style={{ fontSize: 10.5, fontWeight: 700, color: C.ink, padding: '4px 2px' }}>
            Recomendados según el código leído: {recommendedCode}
          </span>
        )}
        {codeError && <span style={{ fontSize: 10.5, color: C.amberDark, padding: '4px 2px' }}>{codeError}</span>}
        {results.map(product => (
          <button
            type="button"
            key={product.id}
            disabled={selectedProducts.some(selected => selected.id === product.id)}
            onClick={() => choose(product, query.trim(), replaceDetectedOnChoose)}
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
      pendingMerges: draftEntry?.pendingMerges || [],
      pendingDeletes: draftEntry?.pendingDeletes || [],
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
  const pendingMerges = rows.flatMap(row => row.pendingMerges || [])
  const pendingDeletes = rows.flatMap(row => row.pendingDeletes || [])
  const removedProductIds = new Set([
    ...pendingMerges.map(merge => merge.sourceProductId),
    ...pendingDeletes.map(deletion => deletion.productId),
  ])
  const acceptedAssociations = accepted.flatMap(row => row.selectedProducts.map(product => ({
    productId: product.id,
    selectedImageKey: row.selectedImageKey,
  }))).filter(action => !removedProductIds.has(action.productId))
  const changeCount = acceptedAssociations.length + pendingMerges.length + pendingDeletes.length
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
        if (row.accepted || row.selectedProducts.length || row.pendingMerges?.length || row.pendingDeletes?.length) {
          entries[row.key] = {
            selectedProducts: row.selectedProducts,
            selectedImageKey: row.selectedImageKey,
            accepted: row.accepted,
            pendingMerges: row.pendingMerges || [],
            pendingDeletes: row.pendingDeletes || [],
          }
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
      pendingMerges: [],
      pendingDeletes: [],
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
    if (!acceptedAssociations.length && !pendingMerges.length && !pendingDeletes.length) {
      setError('Seleccioná al menos una imagen, unión o eliminación válida.')
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
      await onConfirm(parsed.importId, parsed.supplier, acceptedAssociations, pendingMerges, pendingDeletes)
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
                Se extrajeron propuestas de {parsed.pageCount} páginas. Nada se modifica hasta confirmar; también podés unir variantes o eliminar productos duplicados.
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
            {!!pendingMerges.length && <span style={pill(C.dark, C.white)}>{pendingMerges.length} uniones preparadas</span>}
            {!!pendingDeletes.length && <span style={pill(C.red, C.white)}>{pendingDeletes.length} eliminaciones preparadas</span>}
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
              : <span style={{ color: C.muted, fontSize: 11.5 }}>Se aplicarán {acceptedAssociations.length} imágenes, {pendingMerges.length} uniones y {pendingDeletes.length} eliminaciones.</span>}
          </div>
          <div style={{ display: 'flex', gap: 9 }}>
            <button type="button" onClick={onClose} disabled={submitting} style={outlineBtn}>Cancelar</button>
            <button type="button" onClick={handleConfirm} disabled={submitting || !changeCount} style={{ ...solidBtn, background: changeCount ? C.red : '#ddd', color: changeCount ? '#fff' : '#aaa', cursor: changeCount && !submitting ? 'pointer' : 'not-allowed' }}>
              {submitting ? 'Guardando...' : `Confirmar cambios (${changeCount})`}
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

function mergeRuleSpecificity(rule) {
  return ['color', 'size', 'tone'].reduce((total, key) => total + (rule[key]?.trim() ? 1 : 0), 0)
}

function mergeRulesOverlap(left, right) {
  const same = (a, b) => String(a || '').localeCompare(String(b || ''), 'es-AR', { sensitivity: 'base' }) === 0
  return ['color', 'size', 'tone'].every(key => !left[key]?.trim() || !right[key]?.trim() || same(left[key], right[key]))
}

const MEASURE_UNITS = ['mm', 'cm', 'm', 'mm²', 'cm²', 'm²', 'pulg']

function parseMergeMeasure(rawValue, description = '') {
  const raw = String(rawValue || '').trim()
  const normalized = raw.replace(/\s+/g, '').replace(/2$/i, '²')
  const direct = normalized.match(/^(\d+(?:[.,]\d+)?)(mm²|cm²|m²|mm|cm|m|pulg)$/i)
  let value = direct?.[1]?.replace(',', '.') || (raw.match(/^\d+(?:[.,]\d+)?/)?.[0] || '').replace(',', '.')
  let unit = direct?.[2]?.toLowerCase() || ''
  if (unit) unit = unit.replace('2', '²')

  // En cables la columna puede traer "10MM", mientras la descripción aclara
  // "10 MM2". Esa mención más precisa define que se trata de una sección.
  const measures = [...String(description || '').matchAll(/(\d+(?:[.,]\d+)?)\s*(mm2|cm2|m2|mm²|cm²|m²|mm|cm|m|pulg)/gi)]
  const described = measures.find(match => !value || Number(match[1].replace(',', '.')) === Number(value))
  if (described) {
    value ||= described[1].replace(',', '.')
    const describedUnit = described[2].toLowerCase().replace('2', '²')
    if (describedUnit.includes('²') || !unit) unit = describedUnit
  }
  return { value, unit: MEASURE_UNITS.includes(unit) ? unit : '' }
}

function formatMergeMeasure(value, unit) {
  const normalized = String(value || '').trim().replace(',', '.')
  if (!normalized) return ''
  const numeric = Number(normalized)
  const displayValue = Number.isFinite(numeric) ? String(numeric) : normalized
  return unit ? `${displayValue} ${unit}` : displayValue
}

function ProductMergeModal({ preview, onConfirm, onClose }) {
  const products = preview.products || []
  const existingGroup = products.find(product => product.isGrouped)
  const [baseProductId, setBaseProductId] = useState(existingGroup?.id || products[0]?.id || '')
  const base = products.find(product => product.id === baseProductId) || products[0]
  const suggestedPrefix = products.map(product => String(product.codigo || '').toUpperCase()).reduce((prefix, code) => {
    let index = 0
    while (index < prefix.length && index < code.length && prefix[index] === code[index]) index++
    return prefix.slice(0, index).replace(/[-_/\s]+$/, '')
  }, String(products[0]?.codigo || '').toUpperCase())
  const [generalName, setGeneralName] = useState(base?.name || base?.descripcion || '')
  const [generalCode, setGeneralCode] = useState(existingGroup?.codigo || `${suggestedPrefix || 'GRUPO'}-GRP`)
  const sourceProducts = products.filter(product => !(product.id === baseProductId && product.isGrouped))
  const existingRuleRows = existingGroup ? (existingGroup.variant_rules || []).map(rule => {
    const codes = Array.isArray(rule.supplierCodes) ? rule.supplierCodes.filter(Boolean) : []
    const codigo = codes.join(', ') || 'Regla manual'
    return {
      rowKey: `rule:${rule.id}`,
      productId: existingGroup.id,
      variantRuleId: rule.id,
      codigo,
      description: `${existingGroup.name || existingGroup.descripcion || existingGroup.codigo} · Variante actual`,
      product: { ...existingGroup, codigo, image_url: rule.image || existingGroup.image_url },
      rule,
      isExisting: true,
    }
  }) : []
  const reviewRows = [
    ...existingRuleRows,
    ...sourceProducts.map(product => ({
      rowKey: `product:${product.id}`,
      productId: product.id,
      codigo: product.codigo,
      description: product.name || product.descripcion,
      product,
      rule: null,
      isExisting: false,
    })),
  ]
  const [assignments, setAssignments] = useState(() => Object.fromEntries(reviewRows.map(row => {
    const source = row.rule || row.product
    const measure = parseMergeMeasure(row.rule?.size ?? row.product.medida, `${row.product.name || ''} ${row.product.descripcion || ''}`)
    const savedColor = (existingGroup?.color_options || []).find(option =>
      String(option?.name || '').localeCompare(String(row.rule?.color || ''), 'es-AR', { sensitivity: 'base' }) === 0
    )
    const savedTone = (existingGroup?.tone_options || []).find(option =>
      String(option?.name || '').localeCompare(String(row.rule?.tone || ''), 'es-AR', { sensitivity: 'base' }) === 0
    )
    return [row.rowKey, {
      rowKey: row.rowKey,
      productId: row.productId,
      ...(row.variantRuleId ? { variantRuleId: row.variantRuleId } : {}),
      color: row.rule?.color || '', colorHex: row.rule?.colorHex || savedColor?.hex || '#CCCCCC',
      tone: row.rule?.tone || '', toneHex: row.rule?.toneHex || savedTone?.hex || '#CCCCCC',
      sizeValue: measure.value, sizeUnit: measure.unit,
      productData: { ...variantProductDataFromSource(row.product, row.codigo), ...(row.rule?.productData || {}) },
      precioVenta: source.precio_venta ?? '',
      precioIva: priceWithIva(source.precio_iva, source.precio_venta),
      stock: source.stock ?? 0,
    }]
  })))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [detailsRowKey, setDetailsRowKey] = useState(null)
  const activeRules = reviewRows.map(row => {
    const assignment = assignments[row.rowKey]
    return assignment ? { ...assignment, size: formatMergeMeasure(assignment.sizeValue, assignment.sizeUnit) } : null
  }).filter(Boolean)
  const invalidValues = activeRules.some(rule =>
    (rule.precioVenta !== '' && (!Number.isFinite(Number(rule.precioVenta)) || Number(rule.precioVenta) < 0)) ||
    (rule.precioIva !== '' && (!Number.isFinite(Number(rule.precioIva)) || Number(rule.precioIva) < 0)) ||
    !Number.isInteger(Number(rule.stock)) || Number(rule.stock) < 0
  )
  let conflict = null
  for (let left = 0; left < activeRules.length && !conflict; left++) {
    for (let right = left + 1; right < activeRules.length; right++) {
      if (mergeRuleSpecificity(activeRules[left]) === mergeRuleSpecificity(activeRules[right]) && mergeRulesOverlap(activeRules[left], activeRules[right])) {
        conflict = [activeRules[left].rowKey, activeRules[right].rowKey]
        break
      }
    }
  }
  const conflictingCodes = conflict?.map(rowKey =>
    reviewRows.find(row => row.rowKey === rowKey)?.codigo || 'Sin código'
  )
  const setAssignment = (id, field, value) => setAssignments(current => ({
    ...current, [id]: { ...current[id], [field]: value },
  }))
  const setSalePrice = (id, value) => setAssignments(current => {
    const rule = current[id]
    const followedCalculatedIva = rule.precioIva === '' ||
      Number(rule.precioIva) === Number(priceWithIva('', rule.precioVenta))
    return {
      ...current,
      [id]: {
        ...rule,
        precioVenta: value,
        precioIva: followedCalculatedIva ? priceWithIva('', value) : rule.precioIva,
      },
    }
  })
  const submit = async () => {
    if (!generalName.trim() || !generalCode.trim() || conflict || invalidValues || saving) return
    setSaving(true)
    setError('')
    try {
      await onConfirm({
        productIds: products.map(product => product.id), baseProductId,
        generalName: generalName.trim(), generalCode: generalCode.trim().toUpperCase(),
        assignments: activeRules,
      })
    } catch (err) {
      setError(err.message || 'No se pudieron unir los productos')
      setSaving(false)
    }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2400, background: 'rgba(17,24,39,.62)', display: 'grid', placeItems: 'center', padding: 18 }}>
      <div style={{ width: 'min(1240px, 96vw)', maxHeight: '92vh', overflow: 'auto', background: C.white, borderRadius: 12, boxShadow: '0 24px 70px rgba(0,0,0,.3)' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: C.white, borderBottom: `1px solid ${C.border}` }}>
          <div><strong style={{ fontSize: 16, color: C.ink }}>Unir productos</strong><div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>{products.length} registros de {preview.supplier}</div></div>
          <button type="button" onClick={onClose} disabled={saving} style={outlineBtn}>Cerrar</button>
        </div>
        <div style={{ padding: 20, display: 'grid', gap: 18 }}>
          <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.45 }}>
            El producto general nuevo se guardará sin publicar.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            <label style={lbl}>Tomar datos generales de<select value={baseProductId} disabled={Boolean(existingGroup)} onChange={event => setBaseProductId(event.target.value)} style={{ ...inp, marginTop: 6 }}>
              {products.map(product => <option key={product.id} value={product.id}>{product.codigo} — {product.name || product.descripcion}</option>)}
            </select></label>
            <label style={lbl}>Nombre general<input value={generalName} maxLength={200} onChange={event => setGeneralName(event.target.value)} placeholder="Cable Tipo Taller Argenplas 4" style={{ ...inp, marginTop: 6 }} /></label>
            <label style={lbl}>Código general nuevo<input value={generalCode} maxLength={64} onChange={event => setGeneralCode(event.target.value.toUpperCase())} placeholder="ARG-T4-GRP" style={{ ...inp, marginTop: 6 }} /></label>
          </div>
          {existingGroup && <div style={{ fontSize: 11.5, color: '#4338CA', background: '#EEF2FF', borderRadius: 7, padding: '9px 11px' }}>Se muestran las {existingRuleRows.length} variantes actuales de <strong>{existingGroup.codigo}</strong> junto con {sourceProducts.length === 1 ? 'la variante nueva' : `las ${sourceProducts.length} variantes nuevas`}. Revisá toda la configuración antes de unir.</div>}
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 1280 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(230px,1.35fr) 180px 190px 190px 105px 105px 76px', gap: 8, padding: '7px 9px', color: C.text3, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>
                <span>Producto y código</span><span>Medida</span><span>Color</span><span>Tono</span><span>Precio s/IVA</span><span>Precio c/IVA</span><span>Stock</span>
              </div>
              {reviewRows.map(row => {
                const rule = assignments[row.rowKey]
                const inConflict = conflict?.includes(row.rowKey)
                return <div key={row.rowKey} style={{ display: 'grid', gridTemplateColumns: 'minmax(230px,1.35fr) 180px 190px 190px 105px 105px 76px', gap: 8, alignItems: 'center', padding: 9, border: `1px solid ${inConflict ? C.red : C.border}`, borderRadius: 8, marginBottom: 7, background: C.white }}>
                  <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 9, fontSize: 11.5 }}>
                    <ProductThumb product={row.product} size={44} />
                    <span style={{ minWidth: 0 }}>
                      <strong style={{ display: 'block', color: C.ink }}>{row.codigo}</strong>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.muted }}>{row.description}</span>
                      <button type="button" onClick={() => setDetailsRowKey(row.rowKey)} style={{ border: 'none', background: 'none', padding: '3px 0 0', color: '#2563EB', cursor: 'pointer', fontSize: 10 }}>Revisar todos los datos</button>
                    </span>
                  </span>
                  <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 76px', gap: 5 }}>
                    <input inputMode="decimal" value={rule.sizeValue} onChange={event => setAssignment(row.rowKey, 'sizeValue', event.target.value)} placeholder="Cualquiera" aria-label={`Valor de medida de ${row.codigo}`} style={{ ...inp, minWidth: 0, padding: '7px 8px', fontSize: 11 }} />
                    <select value={rule.sizeUnit} onChange={event => setAssignment(row.rowKey, 'sizeUnit', event.target.value)} aria-label={`Unidad de medida de ${row.codigo}`} style={{ ...inp, minWidth: 0, padding: '7px 5px', fontSize: 11 }}>
                      <option value="">Unidad</option>
                      {MEASURE_UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                    </select>
                  </span>
                  <VariantColorField
                    name={rule.color}
                    hex={rule.colorHex}
                    code={row.codigo}
                    onChange={color => setAssignments(current => ({
                      ...current,
                      [row.rowKey]: { ...current[row.rowKey], color: color.name, colorHex: color.hex },
                    }))}
                  />
                  <VariantToneField
                    value={rule.tone}
                    hex={rule.toneHex}
                    code={row.codigo}
                    onChange={tone => setAssignments(current => ({
                      ...current,
                      [row.rowKey]: { ...current[row.rowKey], tone: tone.name, toneHex: tone.hex },
                    }))}
                  />
                  <input type="number" min="0" step="0.01" value={rule.precioVenta} onChange={event => setSalePrice(row.rowKey, event.target.value)} aria-label={`Precio sin IVA de ${row.codigo}`} title="Al cambiarlo, el precio con IVA se recalcula mientras no haya sido editado manualmente." style={{ ...inp, padding: '7px 8px', fontSize: 11 }} />
                  <input type="number" min="0" step="0.01" value={rule.precioIva} onChange={event => setAssignment(row.rowKey, 'precioIva', event.target.value)} aria-label={`Precio con IVA de ${row.codigo}`} style={{ ...inp, padding: '7px 8px', fontSize: 11 }} />
                  <input type="number" min="0" step="1" value={rule.stock} onChange={event => setAssignment(row.rowKey, 'stock', event.target.value)} aria-label={`Stock de ${row.codigo}`} style={{ ...inp, padding: '7px 8px', fontSize: 11 }} />
                </div>
              })}
            </div>
          </div>
          {conflict && (
            <div style={{ color: C.red, fontSize: 12 }}>
              Los códigos <strong>{conflictingCodes[0]}</strong> y <strong>{conflictingCodes[1]}</strong> quedarían como la misma variante y el sistema no sabría qué precio usar. Diferencialos completando Medida, Color o Tono.
            </div>
          )}
          {invalidValues && <div style={{ color: C.red, fontSize: 12 }}>Revisá los precios y el stock: los precios no pueden ser negativos y el stock debe ser un número entero mayor o igual a cero.</div>}
          {error && <DismissibleErrorNotice key={error}>{error}</DismissibleErrorNotice>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
            <button type="button" onClick={onClose} disabled={saving} style={outlineBtn}>Cancelar</button>
            <button type="button" onClick={submit} disabled={saving || conflict || invalidValues || !generalName.trim() || !generalCode.trim()} style={{ ...solidBtn, background: C.red, color: C.white, opacity: saving || conflict || invalidValues ? .6 : 1 }}>{saving ? 'Uniendo...' : `Unir ${products.length} productos`}</button>
          </div>
        </div>
        {detailsRowKey && assignments[detailsRowKey] && (
          <VariantDetailsModal
            code={reviewRows.find(row => row.rowKey === detailsRowKey)?.codigo || ''}
            value={assignments[detailsRowKey].productData}
            onChange={productData => setAssignment(detailsRowKey, 'productData', productData)}
            onClose={() => setDetailsRowKey(null)}
          />
        )}
      </div>
    </div>
  )
}

const BULK_PRICE_STATUS = {
  create: { label: 'Crear', color: C.green, background: C.greenLight },
  update: { label: 'Actualizar', color: C.amberDark, background: C.amberLight },
  unchanged: { label: 'Sin cambios', color: '#0369A1', background: '#E0F2FE' },
  skipped: { label: 'Omitir', color: C.text3, background: '#F3F4F6' },
  duplicate: { label: 'Repetido', color: '#4338CA', background: '#EEF2FF' },
  variant: { label: 'Elegí la variante', color: '#9A3412', background: '#FFEDD5' },
  invalid: { label: 'Inválido', color: C.red, background: C.redLight },
}

// Variantes que la importación no va a tocar. No son filas del Excel, así que no
// entran en la tabla de abajo: van acá arriba, donde se decide si confirmar.
function StaleVariantsNotice({ staleVariants, count, aplicado = false }) {
  const [abierto, setAbierto] = useState(false)
  if (!count) return null
  const aMano = staleVariants.reduce(
    (total, item) => total + item.variants.filter(variant => variant.hechaAMano).length, 0
  )
  return (
    <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 7, background: '#FEF3C7', color: '#92400E', fontSize: 11.5 }}>
      {count === 1 ? '1 variante' : `${count} variantes`} de los productos de esta lista
      {aplicado ? ' no se actualizaron' : ' no se van a actualizar'}
      {aMano ? ` (${aMano === 1 ? '1 hecha a mano' : `${aMano} hechas a mano`})` : ''}.
      {' '}Quedan con el precio que tienen hoy. Si alguna tendría que seguir a otra variante,
      configurala en la ficha del producto con <strong>Sigue a</strong> y se actualiza sola de acá en adelante.
      <button
        type="button"
        onClick={() => setAbierto(actual => !actual)}
        style={{ display: 'block', marginTop: 5, border: 'none', background: 'none', padding: 0, color: '#92400E', fontSize: 10.5, textDecoration: 'underline', cursor: 'pointer' }}
      >
        {abierto ? 'Ocultar el detalle' : 'Ver cuáles'}
      </button>
      {abierto && (
        <div style={{ marginTop: 7, display: 'grid', gap: 7, maxHeight: 220, overflowY: 'auto' }}>
          {staleVariants.map(item => (
            <div key={item.productId} style={{ background: C.white, borderRadius: 6, padding: '7px 9px' }}>
              <strong style={{ color: C.ink, fontSize: 10.5 }}>{item.productCode}</strong>
              <span style={{ color: C.muted, fontSize: 10.5 }}> · {item.productName}</span>
              <div style={{ display: 'grid', gap: 2, marginTop: 4 }}>
                {item.variants.map(variant => (
                  <div key={variant.id} style={{ fontSize: 10, color: C.text2 }}>
                    <strong>{variant.codigo || variant.label}</strong>
                    {variant.codigo && variant.label !== variant.codigo ? ` · ${variant.label}` : ''}
                    {variant.precioIva != null ? ` · sigue en ${fmt(variant.precioIva)}` : ''}
                    {variant.updatedAt ? ` desde el ${new Date(variant.updatedAt).toLocaleDateString('es-AR')}` : ''}
                    {variant.hechaAMano
                      ? <span style={{ color: '#92400E' }}> · sin código de proveedor</span>
                      : <span style={{ color: C.muted }}> · no vino en esta lista</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Celda "Producto destino" de la vista previa de precios. Es el único momento en
// que se pueden corregir las dos formas en que un código deja de apuntar bien:
// el proveedor lo renombró (sale como alta y duplicaría el producto) o apunta a
// un producto agrupado sin decir a qué variante corresponde.
function PriceTargetCell({ row, supplier, canMap, busy, onMap }) {
  const { searchProducts } = useAdmin()
  const [picking, setPicking] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!picking || query.trim().length < 2) { setResults([]); return undefined }
    setSearching(true)
    let vigente = true
    const timeout = setTimeout(async () => {
      const encontrados = await searchProducts(query, { supplier })
      if (!vigente) return
      setResults(encontrados)
      setSearching(false)
    }, 300)
    return () => { vigente = false; clearTimeout(timeout) }
  }, [picking, query, supplier, searchProducts])

  const closePicker = () => { setPicking(false); setQuery(''); setResults([]) }
  const choose = (productId) => { closePicker(); onMap(row.codigo, productId) }

  const linkBtn = {
    border: 'none', background: 'none', padding: 0, marginTop: 5,
    color: C.text3, fontSize: 10, textDecoration: 'underline', cursor: 'pointer',
  }
  const candidateBtn = (highlighted) => ({
    display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
    padding: '5px 7px', borderRadius: 6, fontSize: 10.5, lineHeight: 1.35,
    border: `1px solid ${highlighted ? C.green : C.border}`,
    background: highlighted ? C.greenLight : C.white,
    color: highlighted ? C.green : C.text2,
  })

  if (row.status !== 'create') {
    if (!row.targetCode) return <span style={{ color: C.muted }}>—</span>
    return (
      <>
        <strong style={{ display: 'block', color: C.ink }}>{row.targetCode}</strong>
        <span style={{ display: 'block', marginTop: 3, color: C.muted }}>
          {row.targetName}{row.variant ? ` · ${row.variant}` : ''}
        </span>
        {canMap && busy && <div style={{ marginTop: 5, fontSize: 10, color: C.muted }}>Guardando...</div>}
        {canMap && !busy && !!row.groupedTarget && (
          <div style={{ display: 'grid', gap: 3, marginTop: 6 }}>
            {row.groupedTarget.rules.map(rule => (
              <button
                type="button"
                key={rule.id}
                onClick={() => onMap(row.codigo, row.targetProductId, rule.id)}
                title={`${row.codigo} pasa a actualizar el precio de esta variante en cada lista futura`}
                style={candidateBtn(false)}
              >
                <strong>{rule.label}</strong>
                <span style={{ display: 'block', color: C.muted }}>
                  {rule.precioIva != null ? fmt(rule.precioIva) : rule.precioVenta != null ? fmt(rule.precioVenta) : 'Sin precio'}
                </span>
              </button>
            ))}
          </div>
        )}
        {canMap && !busy && !row.groupedTarget && row.matchType === 'saved' && (
          <button type="button" onClick={() => onMap(row.codigo, null)} style={linkBtn}>
            Quitar la asociación guardada
          </button>
        )}
      </>
    )
  }

  return (
    <>
      <span style={{ color: C.muted }}>Producto nuevo sin publicar</span>
      {canMap && busy && <div style={{ marginTop: 5, fontSize: 10, color: C.muted }}>Asociando...</div>}
      {canMap && !busy && !picking && (
        <>
          {!!row.suggestions?.length && (
            <div style={{ display: 'grid', gap: 3, marginTop: 6 }}>
              {row.suggestions.map(product => (
                <button
                  type="button"
                  key={product.id}
                  onClick={() => choose(product.id)}
                  title={`Los precios de ${row.codigo} van a ${product.codigo} en vez de crear un producto nuevo`}
                  style={candidateBtn(product.renamed)}
                >
                  <strong>{product.renamed ? `¿Es ${product.codigo}?` : product.codigo}</strong>
                  <span style={{ display: 'block', color: product.renamed ? C.green : C.muted, opacity: product.renamed ? .85 : 1 }}>
                    {product.nombre}{product.renamed ? '' : ` · ${product.similarity}%`}
                    {product.published === false ? ' · borrador' : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setPicking(true)} style={linkBtn}>
            {row.suggestions?.length ? 'Buscar otro producto' : 'Asociar a un producto existente'}
          </button>
        </>
      )}
      {canMap && !busy && picking && (
        <div style={{ marginTop: 6 }}>
          <input
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Código o nombre..."
            aria-label={`Buscar el producto al que corresponde ${row.codigo}`}
            style={{ ...inp, padding: '5px 7px', fontSize: 11 }}
          />
          {searching && <span style={{ fontSize: 10, color: C.muted }}>Buscando...</span>}
          {!searching && !!results.length && (
            <div style={{ display: 'grid', gap: 3, marginTop: 5, maxHeight: 150, overflowY: 'auto' }}>
              {results.map(product => (
                <button type="button" key={product.id} onClick={() => choose(product.id)} style={candidateBtn(false)}>
                  <strong>{product.codigo}</strong>
                  <span style={{ display: 'block', color: C.muted }}>{product.name || product.descripcion || 'Sin descripción'}</span>
                </button>
              ))}
            </div>
          )}
          {!searching && query.trim().length >= 2 && !results.length && (
            <span style={{ fontSize: 10, color: C.muted }}>Sin resultados en {supplier}.</span>
          )}
          <button type="button" onClick={closePicker} style={linkBtn}>Cancelar</button>
        </div>
      )}
    </>
  )
}

function BulkPriceReviewModal({ preview, supplier = '', saving = false, readOnly = false, error = '', onConfirm, onCurrencyOverride, onMapCode, onClose }) {
  const initialFilter = preview.updated ? 'update' : preview.created ? 'create' : preview.unchanged ? 'unchanged' : 'all'
  const [filter, setFilter] = useState(initialFilter)
  const [search, setSearch] = useState('')
  const [savingCurrencyKey, setSavingCurrencyKey] = useState(null)
  const [savingMappingKey, setSavingMappingKey] = useState(null)
  const [overrideError, setOverrideError] = useState('')
  const rows = useMemo(() => (preview.files || []).flatMap(file =>
    (file.items || []).map((item, index) => ({
      ...item,
      fileName: file.fileName,
      supplier: file.supplier,
      fileCurrency: file.currency,
      rowKey: `${file.fileName}:${index}:${item.status}:${item.codigo || item.rowNumber || ''}`,
    }))
  ), [preview.files])
  const normalizedSearch = search.trim().toLocaleLowerCase('es-AR')
  const visibleRows = rows.filter(row => {
    if (filter !== 'all' && row.status !== filter) return false
    if (!normalizedSearch) return true
    return [row.codigo, row.descripcion, row.targetCode, row.targetName, row.supplier, row.reason]
      .some(value => String(value || '').toLocaleLowerCase('es-AR').includes(normalizedSearch))
  })
  const renameCandidates = rows.filter(row => row.status === 'create' && row.suggestions?.length).length
  const statusCounts = rows.reduce((counts, row) => {
    counts[row.status] = (counts[row.status] || 0) + 1
    return counts
  }, {})
  const priceText = (value, currency) => {
    if (value == null) return '—'
    return currency === 'USD' ? fmtUsd(value) : fmt(value)
  }
  const canOverrideCurrency = !readOnly && typeof onCurrencyOverride === 'function'
  const canMapCodes = !readOnly && typeof onMapCode === 'function' && Boolean(supplier)
  async function handleMapCode(row, productId, variantRuleId = null) {
    if (savingMappingKey) return
    setOverrideError('')
    setSavingMappingKey(row.rowKey)
    try {
      await onMapCode(row.codigo, productId, variantRuleId)
    } catch (err) {
      setOverrideError(err.message || 'No se pudo asociar el código con el producto')
    } finally {
      setSavingMappingKey(null)
    }
  }
  async function handleCurrencyOverride(row, currency) {
    if (savingCurrencyKey) return
    setOverrideError('')
    setSavingCurrencyKey(row.rowKey)
    try {
      await onCurrencyOverride(row.codigo, currency)
    } catch (err) {
      setOverrideError(err.message || 'No se pudo guardar la moneda de este código')
    } finally {
      setSavingCurrencyKey(null)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2600, background: 'rgba(17,24,39,.62)', display: 'grid', placeItems: 'center', padding: 18 }}>
      <div style={{ width: 'min(1380px, 97vw)', height: 'min(900px, 94vh)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.white, borderRadius: 12, boxShadow: '0 24px 70px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start', padding: '17px 20px', borderBottom: `1px solid ${C.border}` }}>
          <div>
            <strong style={{ display: 'block', fontSize: 17, color: C.ink }}>{readOnly ? 'Detalle de la importación' : 'Vista previa de listas de precios'}</strong>
            <span style={{ display: 'block', marginTop: 4, fontSize: 11.5, color: C.muted }}>
              {readOnly ? 'Este es el comprobante de lo procesado.' : 'Revisá altas, cambios y omisiones. Nada se modifica hasta confirmar.'}
            </span>
          </div>
          <button type="button" onClick={onClose} disabled={saving} style={outlineBtn}>Cerrar</button>
        </div>

        <div style={{ padding: '14px 20px 12px', borderBottom: `1px solid ${C.border}`, background: '#FAFBFC' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={pill('#EEF2FF', '#4338CA')}>{preview.processedFiles} de {preview.totalFiles} archivos</span>
            <span style={pill('#F3F4F6', C.text3)}>{preview.totalRows} filas leídas</span>
            <span style={pill(C.greenLight, C.green)}>{preview.created || 0} a crear</span>
            <span style={pill(C.amberLight, C.amberDark)}>{preview.updated || 0} a actualizar</span>
            {!!preview.pendingVariant && <span style={pill('#FFEDD5', '#9A3412')}>{preview.pendingVariant} esperando variante</span>}
            {!!preview.unchanged && <span style={pill('#E0F2FE', '#0369A1')}>{preview.unchanged} sin cambios</span>}
            <span style={pill('#F3F4F6', C.text3)}>{preview.skipped || 0} omitidas</span>
            <span style={{ marginLeft: 'auto', color: C.muted, fontSize: 11 }}>Cotización: US$ 1 = {fmt(preview.exchangeRate)}</span>
          </div>
          {!!preview.pendingVariant && (
            <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 7, background: '#FFEDD5', color: '#9A3412', fontSize: 11.5 }}>
              {preview.pendingVariant === 1
                ? '1 código apunta a un producto agrupado sin decir a qué variante corresponde.'
                : `${preview.pendingVariant} códigos apuntan a productos agrupados sin decir a qué variante corresponden.`}
              {' '}Filtrá por <strong>Falta elegir variante</strong> y elegí a cuál va cada uno. Hasta entonces no se actualizan:
              escribir ese precio en la ficha general dejaría la tarjeta mostrando un importe que el checkout no cobra.
            </div>
          )}
          <StaleVariantsNotice
            staleVariants={preview.staleVariants || []}
            count={preview.staleVariantCount || 0}
            aplicado={readOnly}
          />
          {!!renameCandidates && (
            <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 7, background: C.amberLight, color: C.amberDark, fontSize: 11.5 }}>
              {renameCandidates === 1
                ? '1 alta se parece a un producto que ya tenés cargado.'
                : `${renameCandidates} altas se parecen a productos que ya tenés cargados.`}
              {' '}Filtrá por <strong>Creaciones</strong> y asociá las que sean el mismo artículo con otro código: si las creás quedan duplicadas y el producto original se queda con el precio viejo.
            </div>
          )}
          {!!preview.failedFiles?.length && (
            <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 7, background: C.redLight, color: C.red, fontSize: 11.5 }}>
              {preview.failedFiles.map(file => <div key={file.fileName}><strong>{file.fileName}:</strong> {file.error}</div>)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
            {[
              ['all', 'Todos', rows.length],
              ['update', 'Actualizaciones', statusCounts.update || 0],
              ['create', 'Creaciones', statusCounts.create || 0],
              ['variant', 'Falta elegir variante', statusCounts.variant || 0],
              ['unchanged', 'Sin cambios', statusCounts.unchanged || 0],
              ['skipped', 'Omitidos', statusCounts.skipped || 0],
              ['duplicate', 'Repetidos', statusCounts.duplicate || 0],
              ['invalid', 'Inválidos', statusCounts.invalid || 0],
            ].map(([value, label, count]) => (
              <button key={value} type="button" onClick={() => setFilter(value)} style={{ ...outlineBtn, padding: '6px 9px', fontSize: 10.5, background: filter === value ? C.dark : C.white, borderColor: filter === value ? C.dark : C.border, color: filter === value ? C.white : C.text2 }}>
                {label} ({count})
              </button>
            ))}
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar código, producto o proveedor..." aria-label="Buscar en la vista previa" style={{ ...inp, width: 280, marginLeft: 'auto', padding: '7px 9px', fontSize: 11 }} />
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', minWidth: 1040, borderCollapse: 'collapse', fontSize: 11.5 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: C.white }}>
              <tr style={{ color: C.text3, textAlign: 'left', borderBottom: `1px solid ${C.border}` }}>
                {['Acción', 'Archivo / proveedor', 'Código de lista', 'Producto destino', 'Cambios de precio', 'Motivo / detalle'].map(label => (
                  <th key={label} style={{ padding: '9px 10px', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(row => {
                const status = BULK_PRICE_STATUS[row.status] || BULK_PRICE_STATUS.skipped
                const changed = (row.changes || []).filter(change => change.changed)
                return (
                  <tr key={row.rowKey} style={{ borderBottom: `1px solid ${C.hairline}`, verticalAlign: 'top' }}>
                    <td style={{ padding: 10 }}><span style={pill(status.background, status.color)}>{status.label}</span></td>
                    <td style={{ padding: 10, maxWidth: 190 }}>
                      <strong title={row.fileName} style={{ display: 'block', color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.fileName}</strong>
                      <span style={{ display: 'block', color: C.muted, marginTop: 3 }}>{row.supplier} · {row.fileCurrency}</span>
                    </td>
                    <td style={{ padding: 10, maxWidth: 230 }}>
                      <strong style={{ color: C.ink, fontFamily: 'monospace' }}>{row.codigo || `Fila ${row.rowNumber}`}</strong>
                      {row.descripcion && <span title={row.descripcion} style={{ display: 'block', marginTop: 3, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.descripcion}</span>}
                      {canOverrideCurrency && row.codigo && !['invalid', 'duplicate'].includes(row.status) && (
                        row.currency !== row.fileCurrency ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5 }}>
                            <span style={pill('#FEF3C7', '#92400E')}>Excepción: {row.currency}</span>
                            <button
                              type="button"
                              disabled={savingCurrencyKey === row.rowKey}
                              onClick={() => handleCurrencyOverride(row, null)}
                              style={{ border: 'none', background: 'none', padding: 0, color: C.muted, fontSize: 10, textDecoration: 'underline', cursor: 'pointer' }}
                            >
                              {savingCurrencyKey === row.rowKey ? '...' : 'Quitar'}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={savingCurrencyKey === row.rowKey}
                            onClick={() => handleCurrencyOverride(row, row.fileCurrency === 'USD' ? 'ARS' : 'USD')}
                            title="Este código se leerá siempre en esta moneda para este proveedor, aunque el resto del excel esté en otra."
                            style={{ display: 'block', marginTop: 5, fontSize: 9.5, padding: '2px 6px', borderRadius: 5, border: `1px solid ${C.border}`, background: C.white, color: C.text3, cursor: 'pointer' }}
                          >
                            {savingCurrencyKey === row.rowKey ? 'Guardando...' : `Marcar código en ${row.fileCurrency === 'USD' ? 'ARS' : 'USD'}`}
                          </button>
                        )
                      )}
                    </td>
                    <td style={{ padding: 10, maxWidth: 230 }}>
                      <PriceTargetCell
                        row={row}
                        supplier={supplier || row.supplier}
                        canMap={canMapCodes && !['invalid', 'duplicate'].includes(row.status) && Boolean(row.codigo)}
                        busy={savingMappingKey === row.rowKey}
                        onMap={(codigo, productId, variantRuleId) => handleMapCode(row, productId, variantRuleId)}
                      />
                    </td>
                    <td style={{ padding: 10, minWidth: 260 }}>
                      {(row.changes || []).length ? (row.changes || []).map(change => (
                        <div key={change.field} style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 6, marginBottom: 3, color: change.changed ? C.text2 : C.muted }}>
                          <span>{change.label}</span>
                          <span>{row.status === 'create' ? priceText(change.next, row.currency) : <>{priceText(change.previous, row.currency)} <strong style={{ color: change.changed ? status.color : C.muted }}>→ {priceText(change.next, row.currency)}</strong></>}</span>
                        </div>
                      )) : <span style={{ color: C.muted }}>—</span>}
                    </td>
                    <td style={{ padding: 10, color: row.status === 'invalid' ? C.red : C.text3, maxWidth: 250 }}>
                      {row.reason || (
                        row.status === 'update' ? `${changed.length} ${changed.length === 1 ? 'campo cambia' : 'campos cambian'}`
                          : row.status === 'create' ? (
                            row.suggestions?.some(product => product.renamed)
                              ? 'El proveedor pudo haber renombrado este código. Revisá el candidato antes de crear un duplicado.'
                              : row.suggestions?.length
                                ? 'Se creará como borrador. Hay productos parecidos por si es un código renombrado.'
                                : 'Se creará como borrador.'
                          ) : '—'
                      )}
                    </td>
                  </tr>
                )
              })}
              {!visibleRows.length && <tr><td colSpan="6" style={{ padding: 28, textAlign: 'center', color: C.muted }}>No hay filas para este filtro.</td></tr>}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 20px', borderTop: `1px solid ${C.border}`, background: C.white }}>
          <span style={{ color: (error || overrideError) ? C.red : C.muted, fontSize: 11.5 }}>{error || overrideError || `${visibleRows.length} de ${rows.length} filas visibles`}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {!readOnly && <button type="button" onClick={onClose} disabled={saving} style={outlineBtn}>Cancelar</button>}
            {!readOnly && <button type="button" onClick={onConfirm} disabled={saving || !(preview.created || preview.updated)} style={{ ...solidBtn, background: C.green, color: C.white, opacity: saving || !(preview.created || preview.updated) ? .55 : 1 }}>
              {saving ? 'Importando...' : `Confirmar ${Number(preview.created || 0) + Number(preview.updated || 0)} cambios`}
            </button>}
            {readOnly && <button type="button" onClick={onClose} style={{ ...solidBtn, background: C.dark, color: C.white }}>Cerrar detalle</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

function FolderImageProductPicker({ row, supplier, onChange }) {
  const { searchProducts } = useAdmin()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) { setResults([]); return undefined }
    setLoading(true)
    const timeout = setTimeout(async () => {
      setResults(await searchProducts(query, { supplier }))
      setLoading(false)
    }, 300)
    return () => clearTimeout(timeout)
  }, [query, supplier, searchProducts])

  const choose = (product) => {
    onChange({
      ...row,
      match: { id: product.id, codigo: product.codigo, name: product.name, image_url: product.image_url || null },
      accepted: true,
    })
    setQuery('')
    setResults([])
  }

  return (
    <div>
      <input
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder="Buscar producto por código o nombre..."
        style={{ ...inp, padding: '6px 8px', fontSize: 11.5 }}
      />
      {loading && <span style={{ fontSize: 10.5, color: C.muted }}>Buscando...</span>}
      {!loading && !!results.length && (
        <div style={{ display: 'grid', gap: 3, marginTop: 6, maxHeight: 140, overflowY: 'auto' }}>
          {results.map(product => (
            <button
              type="button"
              key={product.id}
              onClick={() => choose(product)}
              style={{ border: 0, background: C.paper, borderRadius: 5, padding: '6px 8px', textAlign: 'left', cursor: 'pointer', color: C.text2, fontSize: 11 }}
            >
              <strong>{product.codigo}</strong> — {product.name || product.descripcion || 'Sin descripción'}
            </button>
          ))}
        </div>
      )}
      {!loading && query.trim().length >= 2 && !results.length && (
        <span style={{ fontSize: 10.5, color: C.muted }}>No se encontraron productos.</span>
      )}
    </div>
  )
}

function FolderImageReviewRow({ row, supplier, onChange }) {
  const set = changes => onChange({ ...row, ...changes })
  const image = row.imageOptions[0]

  return (
    <div style={{ border: `1px solid ${row.accepted ? C.border : C.hairline}`, borderRadius: 10, padding: 13, opacity: row.accepted ? 1 : 0.72 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: C.ink }}>
          <input
            type="checkbox"
            checked={row.accepted}
            disabled={!row.match}
            onChange={event => set({ accepted: event.target.checked })}
          />
          {row.accepted ? 'Aplicar esta imagen' : 'No aplicar'}
        </label>
        <span style={pill('#F3F4F6', C.text3)}>{row.originalName}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 130px) minmax(0, 1fr)', gap: 15 }}>
        <div style={{ aspectRatio: '1 / 1', border: `1px solid ${C.border}`, borderRadius: 8, background: '#F4F4F4', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={image.url} alt={row.originalName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>

        <div style={{ minWidth: 0 }}>
          {row.match ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              {row.match.image_url && (
                <img src={row.match.image_url} alt={`Imagen actual de ${row.match.codigo}`} style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 5, background: '#fff', border: `1px solid ${C.border}`, flexShrink: 0 }} />
              )}
              <div style={{ fontSize: 11.5, color: C.text2, minWidth: 0 }}>
                Va a <strong>{row.match.codigo}</strong> — {row.match.name || 'sin nombre'}
                {row.match.image_url && <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>Reemplaza la imagen actual del producto</div>}
              </div>
              <button type="button" onClick={() => set({ match: null, accepted: false })} style={{ ...outlineBtn, padding: '4px 8px', fontSize: 10, marginLeft: 'auto', flexShrink: 0 }}>Cambiar</button>
            </div>
          ) : (
            <>
              {row.detectedCode && (
                <p style={{ fontSize: 10.5, color: C.amberDark, margin: '0 0 6px' }}>
                  No se encontró ningún producto con el código "{row.detectedCode}". Buscalo a mano:
                </p>
              )}
              <FolderImageProductPicker row={row} supplier={supplier} onChange={onChange} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function FolderImagesReviewModal({ parsed, onConfirm, onClose }) {
  const [rows, setRows] = useState(() => parsed.products.map((row, index) => ({
    ...row,
    key: `${index}-${row.originalName}`,
    accepted: Boolean(row.match),
  })))
  const [query, setQuery] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [duplicates, setDuplicates] = useState([])
  const [highlightKey, setHighlightKey] = useState(null)
  const [scrollTarget, setScrollTarget] = useState(null)
  const rowRefs = useRef({})

  const updateRow = (key, next) => setRows(current => current.map(row => row.key === key ? next : row))
  const acceptedRows = rows.filter(row => row.accepted && row.match && row.selectedImageKey)
  const unmatchedCount = rows.filter(row => !row.match).length
  const visibleRows = rows.filter(row => {
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    return `${row.originalName} ${row.detectedCode || ''} ${row.match?.codigo || ''} ${row.match?.name || ''}`.toLowerCase().includes(needle)
  })

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
    if (!acceptedRows.length) {
      setError('Seleccioná al menos una imagen para aplicar.')
      return
    }
    const productIds = acceptedRows.map(row => row.match.id)
    const seenIds = new Set()
    const duplicateIds = new Set()
    productIds.forEach(id => {
      if (seenIds.has(id)) duplicateIds.add(id)
      seenIds.add(id)
    })
    if (duplicateIds.size) {
      const dupInfo = Array.from(duplicateIds).map(productId => {
        const dupRows = acceptedRows.filter(row => row.match.id === productId)
        return { productId, codigo: dupRows[0]?.match?.codigo || productId, rowKeys: dupRows.map(row => row.key) }
      })
      setDuplicates(dupInfo)
      setError(`Hay ${dupInfo.length} producto${dupInfo.length > 1 ? 's' : ''} con más de una imagen asociada: ${dupInfo.map(d => d.codigo).join(', ')}. Dejá seleccionada sólo la imagen correcta en cada uno.`)
      return
    }
    setSubmitting(true)
    try {
      await onConfirm(parsed.importId, parsed.supplier, acceptedRows.map(row => ({ productId: row.match.id, selectedImageKey: row.selectedImageKey })))
      onClose()
    } catch (confirmError) {
      setError(confirmError.message || 'No se pudieron guardar las imágenes')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: C.paper, borderRadius: 12, width: '100%', maxWidth: 900, height: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
        <div style={{ padding: '22px 26px 17px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 15 }}>
            <div>
              <h2 style={{ fontFamily: ADMIN_FONT, fontSize: 21, color: C.ink, margin: 0, fontWeight: 500 }}>Revisar imágenes de {parsed.supplier}</h2>
              <p style={{ fontSize: 11.5, color: C.muted, margin: '6px 0 0' }}>
                Se subieron {rows.length} imágenes. Sólo se muestran y se pueden asignar productos de {parsed.supplier}. Nada se modifica hasta confirmar.
              </p>
            </div>
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: 18 }}>×</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar archivo o producto..." style={{ ...inp, padding: '7px 9px', fontSize: 11.5, flex: '1 1 280px', maxWidth: 430 }} />
            <span style={pill(C.greenLight, C.green)}>{acceptedRows.length} listas para aplicar</span>
            {!!unmatchedCount && <span style={pill(C.amberLight, C.amberDark)}>{unmatchedCount} sin producto</span>}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 26px', display: 'grid', gap: 10 }}>
          {visibleRows.map(row => (
            <div
              key={row.key}
              ref={el => { rowRefs.current[row.key] = el }}
              style={highlightKey === row.key ? { borderRadius: 10, boxShadow: `0 0 0 3px ${C.red}`, transition: 'box-shadow 0.2s' } : undefined}
            >
              <FolderImageReviewRow row={row} supplier={parsed.supplier} onChange={next => updateRow(row.key, next)} />
            </div>
          ))}
          {!visibleRows.length && <p style={{ fontSize: 11.5, color: C.muted }}>No hay filas que coincidan con la búsqueda.</p>}
        </div>

        {error && (
          <div style={{ margin: '14px 26px 0' }}>
            <p style={{ fontSize: 12, color: C.red, margin: 0 }}>{error}</p>
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
                        Ir a imagen {index + 1}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '16px 26px', borderTop: `1px solid ${C.border}` }}>
          <button type="button" onClick={onClose} disabled={submitting} style={outlineBtn}>Cancelar</button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || !acceptedRows.length}
            style={{ ...solidBtn, background: C.green, color: C.white, opacity: submitting || !acceptedRows.length ? 0.55 : 1 }}
          >
            {submitting ? 'Guardando...' : `Confirmar ${acceptedRows.length} imagen${acceptedRows.length === 1 ? '' : 'es'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function UnifiedProductsTab() {
  const {
    inventory, inventoryTotal, inventorySuppliers, inventoryLoading, inventoryError,
    importResult, importLoading, importError,
    currencySettings, updateCurrencySettings, updateDeliverySettings,
    supplierSettings, updateSupplierCurrency,
    setPriceCodeCurrency, clearPriceCodeCurrency,
    setPriceCodeMapping, clearPriceCodeMapping,
    fetchInventory, fetchInventoryItem, createInventoryItem, updateInventoryItem, updateProductCurrency, deleteInventoryItem, fetchCatalog,
    fetchInventorySelectionIds, applyInventoryBatch,
    previewProductMerge, mergeInventoryProducts,
    adjustInventoryStocks, uploadInventoryFile,
    previewPriceFiles, uploadPriceFiles,
    parseInvoicePdf, applyInvoiceLines,
    parseCatalogImagesPdf, uploadCatalogPreviewImage, applyCatalogImages,
    parseFolderImages, applyFolderImages,
    categoryTree,
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
  const [priceSupplier, setPriceSupplier]   = useState('')
  const [pricePreview, setPricePreview]     = useState(null)
  const [pricePreviewError, setPricePreviewError] = useState('')
  const [resultDetailOpen, setResultDetailOpen] = useState(false)
  const [catalogSupplier, setCatalogSupplier] = useState('')
  const [catalogParsing, setCatalogParsing]   = useState(false)
  const [catalogError, setCatalogError]       = useState(null)
  const [catalogParsed, setCatalogParsed]     = useState(null)
  const [folderImagesSupplier, setFolderImagesSupplier] = useState('')
  const [folderImagesParsing, setFolderImagesParsing]   = useState(false)
  const [folderImagesProgress, setFolderImagesProgress] = useState(null)
  const [folderImagesError, setFolderImagesError]       = useState(null)
  const [folderImagesParsed, setFolderImagesParsed]     = useState(null)
  const [stockDrafts, setStockDrafts]       = useState({})
  const [stockSaving, setStockSaving]       = useState(false)
  const [stockSaveError, setStockSaveError] = useState('')
  const [hoveredProductId, setHoveredProductId] = useState(null)
  const [currencyTogglingId, setCurrencyTogglingId] = useState(null)
  const [selectedIds, setSelectedIds]       = useState(() => new Set())
  const [bulkAction, setBulkAction]         = useState('precio_venta')
  const [bulkPrice, setBulkPrice]           = useState('')
  const [bulkCategory, setBulkCategory]     = useState('')
  const [bulkSubcategory, setBulkSubcategory] = useState('')
  const [bulkSaving, setBulkSaving]         = useState(false)
  const [bulkError, setBulkError]           = useState('')
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [mergePreview, setMergePreview] = useState(null)
  const [mergeLoading, setMergeLoading] = useState(false)
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
    if (!importResult) return undefined
    setShowResult(true)
    const timeout = setTimeout(() => setShowResult(false), 8000)
    return () => clearTimeout(timeout)
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
  const bulkCategoryOptions = categoryTree.map(node => ({ value: getCategoryValue(node), label: node.label }))
  const bulkSubcategoryOptions = getSubcategoryOptions(bulkCategory, categoryTree).map(node => node.label)

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

  async function handlePriceFileUpload(file) {
    if (!priceSupplier) {
      setPricePreviewError('Elegí el proveedor antes de subir la lista de precios.')
      return
    }
    setPricePreviewError('')
    setPriceParsing(true)
    try {
      const files = [file]
      const data = await previewPriceFiles(files, priceSupplier)
      setPricePreview({ data, files, supplier: priceSupplier })
    } catch (err) {
      setPricePreviewError(err.message || 'No se pudo preparar la vista previa')
    } finally {
      setPriceParsing(false)
    }
  }

  async function handlePriceFilesConfirm() {
    if (!pricePreview) return
    setPricePreviewError('')
    try {
      await uploadPriceFiles(pricePreview.files, pricePreview.supplier)
      setPricePreview(null)
      await fetchCatalog()
      setPage(1)
      await fetchInventory({ ...inventoryFilters, page: 1 })
    } catch (err) {
      setPricePreviewError(err.message || 'No se pudieron importar las listas')
    }
  }

  async function handlePriceCodeCurrency(codigo, currency) {
    if (!pricePreview) return
    if (currency) await setPriceCodeCurrency(pricePreview.supplier, codigo, currency)
    else await clearPriceCodeCurrency(pricePreview.supplier, codigo)
    const data = await previewPriceFiles(pricePreview.files, pricePreview.supplier)
    setPricePreview(current => (current ? { ...current, data } : current))
  }

  // Asociar o desasociar recalcula la vista previa entera: la fila deja de ser
  // un alta y pasa a mostrar el diferencial de precios contra el producto real.
  async function handlePriceCodeMapping(codigo, productId, variantRuleId = null) {
    if (!pricePreview) return
    if (productId) await setPriceCodeMapping(pricePreview.supplier, codigo, productId, variantRuleId)
    else await clearPriceCodeMapping(pricePreview.supplier, codigo)
    const data = await previewPriceFiles(pricePreview.files, pricePreview.supplier)
    setPricePreview(current => (current ? { ...current, data } : current))
  }

  async function handleSupplierCurrencySave(supplier, currency) {
    const result = await updateSupplierCurrency(supplier, currency)
    await fetchCatalog()
    setPage(1)
    await fetchInventory({ ...inventoryFilters, supplier, page: 1 })
    return result
  }

  async function handleProductCurrencyToggle(product) {
    if (currencyTogglingId) return
    setBulkError('')
    setCurrencyTogglingId(product.id)
    const nextCurrency = product.price_currency === 'USD' ? 'ARS' : 'USD'
    try {
      await updateProductCurrency(product.id, nextCurrency)
      await fetchInventory(inventoryFilters)
    } catch (err) {
      setBulkError(err.message || 'No se pudo cambiar la moneda del producto')
    } finally {
      setCurrencyTogglingId(null)
    }
  }

  async function handleCurrencyRateSave(rate) {
    const result = await updateCurrencySettings(rate)
    await fetchCatalog()
    await fetchInventory(inventoryFilters)
    return result
  }

  async function handleDeliveryDefaultSave(plazos) {
    const result = await updateDeliverySettings(plazos)
    await fetchCatalog()
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

  async function handleCatalogImagesConfirm(importId, supplier, actions, merges, deletes) {
    await applyCatalogImages(importId, supplier, actions, merges, deletes)
    await fetchCatalog()
    setPage(1)
    fetchInventory({ ...inventoryFilters, page: 1 })
  }

  // Un lote puede fallar por un corte de conexión puntual (proxy, wifi) y no
  // porque el archivo esté mal — reintentamos antes de abortar todo el import.
  async function parseFolderImagesBatchWithRetry(batch, supplier, importId, attempts = 4) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await parseFolderImages(batch, supplier, importId)
      } catch (err) {
        const isNetworkError = err instanceof TypeError || /fetch|network/i.test(err.message || '')
        if (!isNetworkError || attempt === attempts) throw err
        await new Promise(resolve => setTimeout(resolve, attempt * 1200))
      }
    }
  }

  async function handleFolderImagesUpload(rawFiles) {
    if (!folderImagesSupplier) {
      setFolderImagesError('Elegí el proveedor antes de subir las imágenes.')
      return
    }
    const oversized = rawFiles.filter(file => file.size > FOLDER_IMAGES_MAX_FILE_BYTES)
    const files = rawFiles.filter(file => file.size <= FOLDER_IMAGES_MAX_FILE_BYTES)
    const maxMb = Math.round(FOLDER_IMAGES_MAX_FILE_BYTES / (1024 * 1024))
    if (!files.length) {
      setFolderImagesError(`Todas las fotos pesan más de ${maxMb}MB, achicalas antes de subirlas.`)
      return
    }
    setFolderImagesError(oversized.length
      ? `Se omitieron ${oversized.length} foto${oversized.length > 1 ? 's' : ''} por pesar más de ${maxMb}MB: ${oversized.slice(0, 5).map(f => f.name).join(', ')}${oversized.length > 5 ? '…' : ''}. Achicalas y subilas aparte.`
      : null)
    setFolderImagesParsing(true)
    setFolderImagesProgress({ done: 0, total: files.length })
    try {
      let importId
      let supplierProductCount = 0
      let allRows = []
      for (let i = 0; i < files.length; i += FOLDER_IMAGES_BATCH_SIZE) {
        const batch = files.slice(i, i + FOLDER_IMAGES_BATCH_SIZE)
        const data = await parseFolderImagesBatchWithRetry(batch, folderImagesSupplier, importId)
        importId = data.importId
        supplierProductCount = data.supplierProductCount
        allRows = allRows.concat(data.products)
        setFolderImagesProgress({ done: Math.min(i + FOLDER_IMAGES_BATCH_SIZE, files.length), total: files.length })
      }
      setFolderImagesParsed({
        importId,
        supplier: folderImagesSupplier,
        supplierProductCount,
        products: allRows,
        matchedCount: allRows.filter(row => row.match).length,
        unmatchedCount: allRows.filter(row => !row.match).length,
      })
    } catch (err) {
      setFolderImagesError(err.message)
    } finally {
      setFolderImagesParsing(false)
      setFolderImagesProgress(null)
    }
  }

  async function handleFolderImagesConfirm(importId, supplier, actions) {
    await applyFolderImages(importId, supplier, actions)
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

  async function openProduct(product) {
    const stockDraft = stockDrafts[product.id]
    try {
      const detail = Number(product.variant_rule_count) > 0 ? await fetchInventoryItem(product.id) : product
      setEditItem(stockDraft ? { ...detail, stock: stockDraft.value } : detail)
    } catch (err) {
      setBulkError(err.message || 'No se pudo cargar el producto')
    }
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
    const savedProduct = addOpen
      ? await createInventoryItem(payload)
      : await updateInventoryItem(editItem.id, payload)
    if (editItem?.id) {
      setStockDrafts(current => {
        const next = { ...current }
        delete next[editItem.id]
        return next
      })
    }
    await fetchCatalog()
    fetchInventory(inventoryFilters)
    return savedProduct
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
        : bulkAction === 'stock_inmediato_on'
          ? { stock_inmediato: true }
          : bulkAction === 'stock_inmediato_off'
            ? { stock_inmediato: false }
            : bulkAction === 'category'
              ? { category: bulkCategory, subcategory: bulkSubcategory || null }
              : { [bulkAction]: Number(bulkPrice) }

    if ((bulkAction === 'precio_venta' || bulkAction === 'precio_costo') && (bulkPrice === '' || !Number.isFinite(Number(bulkPrice)) || Number(bulkPrice) < 0)) {
      setBulkError('Ingresá un precio válido mayor o igual a cero.')
      return
    }

    if (bulkAction === 'category' && !bulkCategory) {
      setBulkError('Elegí una categoría.')
      return
    }

    setBulkSaving(true)
    setBulkError('')
    try {
      await applyInventoryBatch([...selectedIds], 'update', changes)
      setBulkPrice('')
      setBulkCategory('')
      setBulkSubcategory('')
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

  async function openMerge() {
    if (selectedCount < 2 || mergeLoading) return
    setMergeLoading(true)
    setBulkError('')
    try {
      setMergePreview(await previewProductMerge([...selectedIds]))
    } catch (err) {
      setBulkError(err.message || 'No se pudo preparar la unión')
    } finally {
      setMergeLoading(false)
    }
  }

  async function confirmMerge(payload) {
    await mergeInventoryProducts(payload)
    setMergePreview(null)
    await refreshAfterBulkAction()
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
        gap: 8, marginBottom: 16,
      }}>
        {/* Importaciones temporalmente ocultas: stock general, ventas del local y compras a proveedor. */}
        <ImportUploadCard
          label="Precios proveedor"
          hint="Elegí el proveedor y subí un Excel. Primero vas a revisar qué se crea y qué precios cambian antes de confirmar."
          disabled={importLoading || priceParsing || !priceSupplier}
          busyLabel={priceParsing ? 'Procesando precios...' : !priceSupplier ? 'Elegí un proveedor' : 'Importando...'}
          onFile={handlePriceFileUpload}
        >
          <select
            value={priceSupplier}
            onChange={event => { setPriceSupplier(event.target.value); setPricePreviewError('') }}
            aria-label="Proveedor de la lista de precios"
            style={{ ...inp, padding: '6px 8px', fontSize: 11, marginTop: 2 }}
          >
            <option value="">Seleccionar proveedor...</option>
            {[...new Set([
              ...inventorySuppliers,
              ...supplierSettings.map(setting => setting.supplier),
            ].filter(Boolean))].sort(PRICE_CODE_COLLATOR.compare).map(supplier => (
              <option key={supplier} value={supplier}>{supplier}</option>
            ))}
          </select>
          <LastImportNote supplier={priceSupplier} settings={supplierSettings} />
        </ImportUploadCard>
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
        <ImportUploadCard
          label="Imágenes por carpeta"
          hint="Elegí el proveedor y una carpeta con fotos (o varios archivos sueltos) de ese proveedor. Nombrá cada imagen con el código del producto — vas a revisar el emparejamiento antes de guardar."
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          allowDirectory
          disabled={importLoading || folderImagesParsing || !folderImagesSupplier}
          busyLabel={
            folderImagesParsing
              ? (folderImagesProgress ? `Leyendo ${folderImagesProgress.done}/${folderImagesProgress.total}...` : 'Leyendo imágenes...')
              : !folderImagesSupplier ? 'Elegí un proveedor' : 'Importando...'
          }
          onFiles={handleFolderImagesUpload}
        >
          <select
            value={folderImagesSupplier}
            onChange={event => { setFolderImagesSupplier(event.target.value); setFolderImagesError(null) }}
            aria-label="Proveedor de las imágenes"
            style={{ ...inp, padding: '6px 8px', fontSize: 11, marginTop: 2 }}
          >
            <option value="">Seleccionar proveedor...</option>
            {[...inventorySuppliers].sort(PRICE_CODE_COLLATOR.compare).map(supplier => (
              <option key={supplier} value={supplier}>{supplier}</option>
            ))}
          </select>
        </ImportUploadCard>
        <CurrencySettingsCard settings={currencySettings} onSave={handleCurrencyRateSave} />
        <DeliveryDefaultCard settings={currencySettings} onSave={handleDeliveryDefaultSave} />
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

      {folderImagesError && (
        <DismissibleErrorNotice key={folderImagesError}>
          {folderImagesError}
        </DismissibleErrorNotice>
      )}

      {folderImagesParsed && (
        <FolderImagesReviewModal
          parsed={folderImagesParsed}
          onConfirm={handleFolderImagesConfirm}
          onClose={() => setFolderImagesParsed(null)}
        />
      )}

      {importError && (
        <DismissibleErrorNotice key={importError}>
          {importError}
        </DismissibleErrorNotice>
      )}

      {pricePreview && (
        <BulkPriceReviewModal
          preview={pricePreview.data}
          saving={importLoading}
          error={pricePreviewError}
          onConfirm={handlePriceFilesConfirm}
          onCurrencyOverride={handlePriceCodeCurrency}
          onMapCode={handlePriceCodeMapping}
          supplier={pricePreview.supplier}
          onClose={() => { if (!importLoading) { setPricePreview(null); setPricePreviewError('') } }}
        />
      )}

      {resultDetailOpen && importResult?.files?.some(file => file.items?.length) && (
        <BulkPriceReviewModal
          preview={importResult}
          readOnly
          onClose={() => setResultDetailOpen(false)}
        />
      )}

      {showResult && importResult && (
        <div
          className="adm-import-toast"
          role="status"
          aria-live="polite"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: C.green }}>
              <span className="adm-import-toast__check" aria-hidden="true">✓</span>
              Importación completa
            </span>
            <button
              type="button"
              onClick={() => setShowResult(false)}
              aria-label="Cerrar notificación"
              className="adm-import-toast__close"
            >✕</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {importResult.totalFiles !== undefined && <span style={pill('#EEF2FF', '#4338CA')}>{importResult.processedFiles} de {importResult.totalFiles} archivos procesados</span>}
            {importResult.totalRows !== undefined && <span style={pill('#F3F4F6', C.text3)}>{importResult.totalRows} filas leídas</span>}
            {importResult.created !== undefined && <span style={pill(C.greenLight, C.green)}>{importResult.created} creados</span>}
            {importResult.updated !== undefined && <span style={pill(importResult.fileType === 'catalog-images' ? C.white : C.amberLight, importResult.fileType === 'catalog-images' ? C.dark : C.amberDark)}>{importResult.updated} actualizados</span>}
            {!!importResult.pendingVariant && <span style={pill('#FFEDD5', '#9A3412')}>{importResult.pendingVariant} esperando variante</span>}
            {!!importResult.unchanged && <span style={pill('#E0F2FE', '#0369A1')}>{importResult.unchanged} sin cambios</span>}
            {importResult.imagesSaved !== undefined && <span style={pill(importResult.fileType === 'catalog-images' ? C.white : '#EEF2FF', importResult.fileType === 'catalog-images' ? C.dark : '#4338CA')}>{importResult.imagesSaved} imágenes guardadas</span>}
            {!!importResult.merged && <span style={pill(C.dark, C.white)}>{importResult.merged} productos unidos</span>}
            {!!importResult.deleted && <span style={pill(C.red, C.white)}>{importResult.deleted} productos eliminados</span>}
            {!!importResult.imagesRemoved && <span style={pill(C.redLight, C.red)}>{importResult.imagesRemoved} imágenes eliminadas</span>}
            {!!importResult.skipped && <span style={pill('#F3F4F6', C.text3)}>{importResult.skipped} omitidos</span>}
          </div>
          {!!importResult.files?.length && (
            <div style={{ display: 'grid', gap: 5, marginTop: 10 }}>
              {importResult.files.map(file => (
                <div key={file.fileName} style={{ fontSize: 11.5, color: C.text2 }}>
                  <strong>{file.fileName}</strong> → {file.supplier} · {file.currency} · {file.created} creados
                  {file.updated ? ` · ${file.updated} actualizados` : ''}
                  {file.unchanged ? ` · ${file.unchanged} sin cambios` : ''}
                  {file.pendingVariant ? ` · ${file.pendingVariant} esperando variante` : ''}
                  {file.existingCount ? ` · ${file.existingCount} ya existían` : ''}
                  {file.duplicateRows ? ` · ${file.duplicateRows} repetidos` : ''}
                  {file.invalidRows ? ` · ${file.invalidRows} filas inválidas` : ''}
                </div>
              ))}
            </div>
          )}
          {importResult.files?.some(file => file.items?.length) && (
            <button
              type="button"
              onClick={() => setResultDetailOpen(true)}
              style={{ ...outlineBtn, marginTop: 10, padding: '6px 9px', background: C.white, borderColor: C.green, color: C.green, fontSize: 10.5 }}
            >
              Ver detalle de creaciones y actualizaciones
            </button>
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
          <span className="adm-import-toast__timer" aria-hidden="true" />
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
            <option value="stock_inmediato_on">Marcar entrega inmediata</option>
            <option value="stock_inmediato_off">Quitar entrega inmediata</option>
            <option value="category">Cambiar categoría</option>
          </select>
          {(bulkAction === 'precio_venta' || bulkAction === 'precio_costo') && (
            <input
              type="number" min="0" step="0.01" placeholder="Precio común"
              value={bulkPrice} onChange={event => setBulkPrice(event.target.value)} disabled={bulkSaving}
              style={{ ...headerFilterControl, width: 140 }}
            />
          )}
          {bulkAction === 'category' && (
            <>
              <select
                value={bulkCategory}
                onChange={event => { setBulkCategory(event.target.value); setBulkSubcategory('') }}
                disabled={bulkSaving}
                style={{ ...headerFilterControl, width: 170 }}
              >
                <option value="">Elegí categoría</option>
                {bulkCategoryOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <select
                value={bulkSubcategory}
                onChange={event => setBulkSubcategory(event.target.value)}
                disabled={bulkSaving || !bulkCategory}
                style={{ ...headerFilterControl, width: 170 }}
              >
                <option value="">Sin subcategoría</option>
                {bulkSubcategoryOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </>
          )}
          <button type="button" onClick={handleApplyBulkAction} disabled={bulkSaving} style={{ ...solidBtn, background: C.green, color: '#fff', opacity: bulkSaving ? 0.65 : 1 }}>
            {bulkSaving ? 'Aplicando...' : 'Aplicar'}
          </button>
          <button type="button" onClick={openMerge} disabled={bulkSaving || mergeLoading || selectedCount < 2} style={{ ...solidBtn, background: C.dark, color: C.white, opacity: mergeLoading ? .65 : 1 }}>
            {mergeLoading ? 'Preparando...' : 'Unir productos'}
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
                      {Number(p.variant_rule_count) === 1 ? ' · Variante base' : Number(p.variant_rule_count) > 1 ? ` · ${p.variant_rule_count} variantes` : ''}
                    </div>
                  </div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: C.text3, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.supplier || 'OTRO'}</span>
                    <button
                      type="button"
                      onClick={event => { event.stopPropagation(); handleProductCurrencyToggle(p) }}
                      disabled={currencyTogglingId === p.id}
                      title="Este código quedó cargado en la moneda equivocada. Tocá para reinterpretarlo y recordar la moneda correcta para este proveedor."
                      style={{ ...pill(p.price_currency === 'USD' ? '#EEF2FF' : '#F3F4F6', p.price_currency === 'USD' ? '#4338CA' : C.text3), border: 'none', cursor: 'pointer', opacity: currencyTogglingId === p.id ? 0.55 : 1 }}
                    >
                      {currencyTogglingId === p.id ? '...' : (p.price_currency || 'ARS')}
                    </button>
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
                      disabled={stockSaving || Number(p.variant_rule_count) > 0}
                      aria-label={`Stock de ${p.name || p.descripcion || p.codigo}`}
                      onChange={event => { if (!Number(p.variant_rule_count)) queueStockValue(p, event.target.value) }}
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
                        background: Number(p.variant_rule_count) > 0 ? C.paper : stockDraft ? C.amberLight : C.white, color: C.ink,
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
          onVariantsChanged={async () => {
            await fetchCatalog()
            await fetchInventory(inventoryFilters)
          }}
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

      {mergePreview && (
        <ProductMergeModal preview={mergePreview} onConfirm={confirmMerge} onClose={() => setMergePreview(null)} />
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
  { id: 'coupons',      label: 'Cupones',        Icon: TicketIcon },
  { id: 'orders',       label: 'Pedidos',        Icon: ClipboardIcon },
  { id: 'customers',    label: 'Cuentas',        Icon: UsersIcon },
  { id: 'analytics',    label: 'Visitas',        Icon: PulseIcon },
  { id: 'backups',      label: 'Backups',        Icon: FolderIcon },
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
    <div className="fnx-admin-shell" style={{
      display: 'flex', minHeight: '100vh',
      fontFamily: ADMIN_FONT,
      fontWeight: 400,
    }}>
      <style>{`
        .fnx-admin-nav { scrollbar-width: none; }
        .fnx-admin-nav::-webkit-scrollbar { display: none; }
        @media (max-width: 720px) {
          .fnx-admin-shell { display: block !important; }
          .fnx-admin-sidebar {
            width: 100% !important; height: auto !important; position: sticky !important;
            top: 0; z-index: 100; border-right: 0 !important; border-bottom: 1px solid #DDE3EA;
          }
          .fnx-admin-brand, .fnx-admin-bottom-actions { display: none !important; }
          .fnx-admin-nav {
            display: flex; overflow-x: auto; overscroll-behavior-x: contain;
            gap: 4px; padding: 7px 8px !important; background: #fff;
          }
          .fnx-admin-nav button {
            width: auto !important; flex: 0 0 auto; margin: 0 !important;
            padding: 8px 12px !important; white-space: nowrap;
          }
          .fnx-admin-main {
            width: 100%; min-width: 0; box-sizing: border-box;
            padding: 16px 12px 24px !important; overflow: visible !important;
          }
          .fnx-admin-page-header { margin-bottom: 16px !important; }
          .fnx-admin-page-header h1 { font-size: 23px !important; }
        }
      `}</style>
      {/* ── Sidebar ───────────────────────────────────────── */}
      <aside className="fnx-admin-sidebar" style={{
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
        <div className="fnx-admin-brand" style={{ padding: '18px 16px 16px', borderBottom: `1px solid ${C.hairline}` }}>
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
        <nav className="fnx-admin-nav" style={{ flex: 1, padding: '9px 7px' }}>
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
        <div className="fnx-admin-bottom-actions" style={{ padding: '9px 7px 18px', borderTop: `1px solid ${C.hairline}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
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
      <main className="fnx-admin-main" ref={mainRef} style={{
        flex: 1,
        background: C.paper,
        minHeight: '100vh',
        padding: '28px 32px',
        overflow: 'auto',
      }}>
        {/* Page header */}
        <div className="fnx-admin-page-header" style={{ marginBottom: 24 }}>
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
        {tab === 'coupons' && (
          <CouponsTab />
        )}
        {tab === 'orders' && (
          <OrdersTab />
        )}
        {tab === 'customers' && (
          <CustomersTab />
        )}
        {tab === 'analytics' && (
          <AnalyticsTab />
        )}
        {tab === 'backups' && (
          <BackupsTab />
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
