import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const STORAGE_AUTH     = 'fenix_admin_session'
const ADMIN_PASSWORD   = 'fenix2024'
const API_BASE         = import.meta.env.VITE_API_URL || ''

export const AdminContext = createContext(null)

// El catálogo público (`products`, forma camelCase: name/price/image/...) vive
// en la misma tabla que el Inventario (backend, snake_case: precio_venta/
// image_url/...) — este mapeo traduce lo que arma ProductModal antes de
// mandarlo a createInventoryItem/updateInventoryItem.
function toBackendPayload(p) {
  const out = {}
  if ('name' in p)          out.name              = p.name
  if ('category' in p)      out.category          = p.category
  if ('subcategory' in p)   out.subcategory       = p.subcategory
  if ('description' in p)   out.description_larga = p.description
  if ('price' in p)         out.precio_venta      = p.price
  if ('originalPrice' in p) out.original_price    = p.originalPrice ?? null
  if ('image' in p)         out.image_url         = p.image
  if ('hoverImage' in p)    out.hover_image_url    = p.hoverImage
  if ('colors' in p)        out.color_options      = p.colors
  if ('sizes' in p)         out.size_options       = p.sizes
  if ('colorTemp' in p)     out.color_temp         = p.colorTemp
  if ('ipRating' in p)      out.ip_rating          = p.ipRating
  if ('watts' in p)         out.watts              = p.watts
  if ('material' in p)      out.material           = p.material
  if ('cableType' in p)     out.cable_type         = p.cableType
  if ('published' in p)     out.published          = p.published
  // El backend solo tiene `stock` (entero) — inStock es stock > 0 derivado al
  // leer. Si viene stock explícito se usa tal cual; si solo viene el toggle
  // inStock, se traduce a un stock mínimo (1) o a 0.
  if ('stock' in p)        out.stock = Number(p.stock) || 0
  else if ('inStock' in p) out.stock = p.inStock ? 1 : 0
  return out
}

export function AdminProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(() =>
    localStorage.getItem(STORAGE_AUTH) === 'true'
  )

  // ── Catálogo público (products) ──────────────────────────────────────────
  // Vive en la base de datos (misma tabla que Inventario, filtrada por
  // published = true) — se trae de /api/catalog, sin auth, al montar.
  const [products, setProducts]         = useState([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [productsError, setProductsError]     = useState(null)

  // ── Pedidos ───────────────────────────────────────────────────────────────
  const [orders, setOrders]             = useState([])
  const [ordersTotal, setOrdersTotal]   = useState(0)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError]   = useState(null)

  // ── Avisos de stock ───────────────────────────────────────────────────────
  const [stockAlerts, setStockAlerts]         = useState([])
  const [stockAlertsLoading, setStockAlertsLoading] = useState(false)
  const [stockAlertsError, setStockAlertsError]     = useState(null)

  // ── Inventario interno (catálogo de proveedores, DB) ─────────────────────
  const [inventory, setInventory]               = useState([])
  const [inventoryTotal, setInventoryTotal]      = useState(0)
  const [inventoryLoading, setInventoryLoading]  = useState(false)
  const [inventoryError, setInventoryError]      = useState(null)
  const [importResult, setImportResult]          = useState(null)
  const [importLoading, setImportLoading]        = useState(false)
  const [importError, setImportError]            = useState(null)

  // ── fetchCatalog — trae el catálogo público publicado (sin auth) ─────────
  const fetchCatalog = useCallback(async () => {
    setProductsLoading(true)
    setProductsError(null)
    try {
      const res = await fetch(`${API_BASE}/api/catalog`)
      if (!res.ok) throw new Error('Error al cargar el catálogo')
      setProducts(await res.json())
    } catch (err) {
      setProductsError(err.message)
    } finally {
      setProductsLoading(false)
    }
  }, [])

  useEffect(() => { fetchCatalog() }, [fetchCatalog])

  const login = (pwd) => {
    if (pwd === ADMIN_PASSWORD) {
      localStorage.setItem(STORAGE_AUTH, 'true')
      setIsAdmin(true)
      return true
    }
    return false
  }

  const logout = () => {
    localStorage.removeItem(STORAGE_AUTH)
    setIsAdmin(false)
  }

  // ── fetchOrders — lista pedidos desde la API ──────────────────────────────
  const fetchOrders = useCallback(async (filters = {}) => {
    setOrdersLoading(true)
    setOrdersError(null)
    try {
      const params = new URLSearchParams(filters).toString()
      const res = await fetch(`${API_BASE}/api/orders${params ? `?${params}` : ''}`, {
        headers: { 'x-admin-token': ADMIN_PASSWORD },
      })
      if (!res.ok) throw new Error('Error al cargar pedidos')
      const data = await res.json()
      setOrders(data.orders || [])
      setOrdersTotal(data.total || 0)
      return data
    } catch (err) {
      setOrdersError(err.message)
      return { orders: [], total: 0 }
    } finally {
      setOrdersLoading(false)
    }
  }, [])

  // ── updateOrderStatus — cambia el estado de un pedido ────────────────────
  const updateOrderStatus = useCallback(async (id, status) => {
    try {
      const res = await fetch(`${API_BASE}/api/orders/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': ADMIN_PASSWORD,
        },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('No se pudo actualizar el estado')
      const updated = await res.json()
      setOrders((prev) => prev.map((o) => o.id === id ? { ...o, ...updated } : o))
      return updated
    } catch (err) {
      throw err
    }
  }, [])

  // ── fetchStockAlerts — lista avisos de "notificame stock" desde la API ────
  const fetchStockAlerts = useCallback(async (filters = {}) => {
    setStockAlertsLoading(true)
    setStockAlertsError(null)
    try {
      const params = new URLSearchParams(filters).toString()
      const res = await fetch(`${API_BASE}/api/stock-alerts${params ? `?${params}` : ''}`, {
        headers: { 'x-admin-token': ADMIN_PASSWORD },
      })
      if (!res.ok) throw new Error('Error al cargar los avisos de stock')
      const data = await res.json()
      setStockAlerts(data)
      return data
    } catch (err) {
      setStockAlertsError(err.message)
      return []
    } finally {
      setStockAlertsLoading(false)
    }
  }, [])

  // ── fetchInventory — lista el inventario interno (paginado) ──────────────
  const fetchInventory = useCallback(async (filters = {}) => {
    setInventoryLoading(true)
    setInventoryError(null)
    try {
      const params = new URLSearchParams(filters).toString()
      const res = await fetch(`${API_BASE}/api/products${params ? `?${params}` : ''}`, {
        headers: { 'x-admin-token': ADMIN_PASSWORD },
      })
      if (!res.ok) throw new Error('Error al cargar el inventario')
      const data = await res.json()
      setInventory(data.products || [])
      setInventoryTotal(data.total || 0)
      return data
    } catch (err) {
      setInventoryError(err.message)
      return { products: [], total: 0 }
    } finally {
      setInventoryLoading(false)
    }
  }, [])

  // ── createInventoryItem / updateInventoryItem / deleteInventoryItem ──────
  const createInventoryItem = useCallback(async (payload) => {
    const res = await fetch(`${API_BASE}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': ADMIN_PASSWORD },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo crear el producto')
    return data
  }, [])

  const updateInventoryItem = useCallback(async (id, changes) => {
    const res = await fetch(`${API_BASE}/api/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': ADMIN_PASSWORD },
      body: JSON.stringify(changes),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el producto')
    return data
  }, [])

  const deleteInventoryItem = useCallback(async (id) => {
    const res = await fetch(`${API_BASE}/api/products/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': ADMIN_PASSWORD },
    })
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'No se pudo eliminar el producto')
    }
  }, [])

  // ── updateProduct / addProduct / deleteProduct — panel "Productos": editan
  // el mismo registro de Inventario, mapeando la forma del catálogo público
  // (name/price/image/...) a la del backend (name/precio_venta/image_url/...)
  // y refrescando el catálogo publicado al terminar. "Eliminar" acá nunca
  // borra el registro de Inventario (tiene historial de stock real) — solo lo
  // despublica.
  const updateProduct = useCallback(async (id, changes) => {
    await updateInventoryItem(id, toBackendPayload(changes))
    await fetchCatalog()
  }, [updateInventoryItem, fetchCatalog])

  const addProduct = useCallback(async (product) => {
    await createInventoryItem(toBackendPayload({ published: true, ...product }))
    await fetchCatalog()
  }, [createInventoryItem, fetchCatalog])

  const deleteProduct = useCallback(async (id) => {
    await updateInventoryItem(id, { published: false })
    await fetchCatalog()
  }, [updateInventoryItem, fetchCatalog])

  // ── uploadProductImage — sube un archivo de foto para un producto ya guardado
  const uploadProductImage = useCallback(async (id, file) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${API_BASE}/api/products/${id}/image`, {
      method: 'POST',
      headers: { 'x-admin-token': ADMIN_PASSWORD },
      body: formData,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo subir la imagen')
    return data
  }, [])

  // ── adjustInventoryStock — ajuste manual +/- (nunca clampea a 0) ─────────
  const adjustInventoryStock = useCallback(async (id, delta) => {
    const res = await fetch(`${API_BASE}/api/products/${id}/adjust-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': ADMIN_PASSWORD },
      body: JSON.stringify({ delta }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo ajustar el stock')
    return data
  }, [])

  // ── uploadInventoryFile — sube uno de los 4 excel de inventario ──────────
  const uploadInventoryFile = useCallback(async (type, file) => {
    setImportLoading(true)
    setImportError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${API_BASE}/api/products/import/${type}`, {
        method: 'POST',
        headers: { 'x-admin-token': ADMIN_PASSWORD },
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo importar el archivo')
      setImportResult(data)
      return data
    } catch (err) {
      setImportError(err.message)
      throw err
    } finally {
      setImportLoading(false)
    }
  }, [])

  // ── searchProducts — búsqueda liviana para el matching de factura PDF ────
  const searchProducts = useCallback(async (query) => {
    if (!query || query.trim().length < 2) return []
    const params = new URLSearchParams({ search: query.trim(), limit: 8 }).toString()
    const res = await fetch(`${API_BASE}/api/products?${params}`, {
      headers: { 'x-admin-token': ADMIN_PASSWORD },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.products || []
  }, [])

  // ── parseInvoicePdf / applyInvoiceLines — factura o remito de compra en PDF ─
  const parseInvoicePdf = useCallback(async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${API_BASE}/api/products/import/invoice/parse`, {
      method: 'POST',
      headers: { 'x-admin-token': ADMIN_PASSWORD },
      body: formData,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo leer el PDF')
    return data
  }, [])

  const applyInvoiceLines = useCallback(async (actions) => {
    setImportLoading(true)
    setImportError(null)
    try {
      const res = await fetch(`${API_BASE}/api/products/import/invoice/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': ADMIN_PASSWORD },
        body: JSON.stringify({ actions }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo aplicar la factura')
      setImportResult({ fileType: 'invoice', ...data })
      return data
    } catch (err) {
      setImportError(err.message)
      throw err
    } finally {
      setImportLoading(false)
    }
  }, [])

  return (
    <AdminContext.Provider value={{
      isAdmin, products, productsLoading, productsError, fetchCatalog,
      login, logout,
      updateProduct, addProduct, deleteProduct,
      orders, ordersTotal, ordersLoading, ordersError,
      fetchOrders, updateOrderStatus,
      stockAlerts, stockAlertsLoading, stockAlertsError,
      fetchStockAlerts,
      inventory, inventoryTotal, inventoryLoading, inventoryError,
      importResult, importLoading, importError,
      fetchInventory, createInventoryItem, updateInventoryItem, deleteInventoryItem,
      adjustInventoryStock, uploadInventoryFile, uploadProductImage,
      searchProducts, parseInvoicePdf, applyInvoiceLines,
    }}>
      {children}
    </AdminContext.Provider>
  )
}

export function useAdmin() {
  const ctx = useContext(AdminContext)
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider')
  return ctx
}
