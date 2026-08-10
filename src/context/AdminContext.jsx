import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { buildCategoryTree } from '../data/categoryTree'

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
  if ('variantStock' in p)  out.variant_stock      = p.variantStock
  if ('colorTemp' in p)     out.color_temp         = p.colorTemp
  if ('ipRating' in p)      out.ip_rating          = p.ipRating
  if ('watts' in p)         out.watts              = p.watts
  if ('material' in p)      out.material           = p.material
  if ('productType' in p)   out.product_type       = p.productType || null
  if ('cableType' in p)     out.cable_type         = p.cableType
  if ('lengthCm' in p)      out.length_cm           = p.lengthCm
  if ('widthCm' in p)       out.width_cm            = p.widthCm
  if ('heightCm' in p)      out.height_cm           = p.heightCm
  if ('weightKg' in p)      out.weight_kg           = p.weightKg
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

  // ── Inventario interno (catálogo de proveedores, DB) ─────────────────────
  const [inventory, setInventory]               = useState([])
  const [inventoryTotal, setInventoryTotal]      = useState(0)
  const [inventorySuppliers, setInventorySuppliers] = useState([])
  const [inventoryLoading, setInventoryLoading]  = useState(false)
  const [inventoryError, setInventoryError]      = useState(null)
  const [importResult, setImportResult]          = useState(null)
  const [importLoading, setImportLoading]        = useState(false)
  const [importError, setImportError]            = useState(null)
  const [currencySettings, setCurrencySettings]  = useState({ usdArsRate: 1510, updatedAt: null })
  const [supplierSettings, setSupplierSettings]  = useState([])
  const [subcategories, setSubcategories]        = useState([])
  const [productTypes, setProductTypes]          = useState([])

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
      setInventorySuppliers(data.suppliers || [])
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

  const fetchInventorySelectionIds = useCallback(async (filters = {}) => {
    const params = new URLSearchParams(filters).toString()
    const res = await fetch(`${API_BASE}/api/products/selection/ids${params ? `?${params}` : ''}`, {
      headers: { 'x-admin-token': ADMIN_PASSWORD },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudieron seleccionar los productos')
    return data.ids || []
  }, [])

  const applyInventoryBatch = useCallback(async (ids, action, changes = undefined) => {
    const res = await fetch(`${API_BASE}/api/products/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': ADMIN_PASSWORD },
      body: JSON.stringify({ ids, action, ...(changes ? { changes } : {}) }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo completar la acción masiva')
    return data
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

  // ── uploadProductImage — con ID edita; sin ID prepara una foto para un alta
  const uploadProductImage = useCallback(async (id, file) => {
    const formData = new FormData()
    formData.append('file', file)
    const endpoint = id
      ? `${API_BASE}/api/products/${id}/image`
      : `${API_BASE}/api/products/image`
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'x-admin-token': ADMIN_PASSWORD },
      body: formData,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo subir la imagen')
    return data
  }, [])

  // Guarda varios ajustes juntos y sincroniza las dos vistas locales del mismo
  // producto sin volver a descargar toda la tabla.
  const adjustInventoryStocks = useCallback(async (changes) => {
    const res = await fetch(`${API_BASE}/api/products/stock/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': ADMIN_PASSWORD },
      body: JSON.stringify({ changes }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudieron guardar los cambios de stock')

    const updated = new Map((data.products || []).map(product => [product.id, product]))
    setInventory(current => current.map(product => updated.get(product.id) || product))
    setProducts(current => current.map(product => {
      const saved = updated.get(product.id)
      return saved ? { ...product, stock: saved.stock, inStock: saved.stock > 0 } : product
    }))
    return data.products || []
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
  const fetchCurrencySettings = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/products/currency-settings`, {
      headers: { 'x-admin-token': ADMIN_PASSWORD },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo cargar la cotizacion')
    setCurrencySettings(data)
    return data
  }, [])

  const updateCurrencySettings = useCallback(async (usdArsRate) => {
    const res = await fetch(`${API_BASE}/api/products/currency-settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': ADMIN_PASSWORD },
      body: JSON.stringify({ usdArsRate }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo guardar la cotizacion')
    setCurrencySettings(data)
    return data
  }, [])

  const fetchInventoryItem = useCallback(async (id) => {
    const res = await fetch(`${API_BASE}/api/products/${id}`, {
      headers: { 'x-admin-token': ADMIN_PASSWORD },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo cargar el producto')
    return data
  }, [])

  const fetchSupplierSettings = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/products/supplier-settings`, {
      headers: { 'x-admin-token': ADMIN_PASSWORD },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudieron cargar los proveedores')
    setSupplierSettings(data.suppliers || [])
    return data.suppliers || []
  }, [])

  const updateSupplierCurrency = useCallback(async (supplier, currency) => {
    const res = await fetch(`${API_BASE}/api/products/supplier-settings/${encodeURIComponent(supplier)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': ADMIN_PASSWORD },
      body: JSON.stringify({ currency }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo actualizar la moneda del proveedor')
    setSupplierSettings(current => current.some(item => item.supplier === supplier)
      ? current.map(item => (
        item.supplier === supplier ? { ...item, currency: data.currency, configured: true, productCount: data.productCount } : item
      ))
      : [...current, { supplier, currency: data.currency, configured: true, productCount: data.productCount }]
    )
    return data
  }, [])

  // ── fetchSubcategories/fetchProductTypes + create/delete ─────────────────
  // Subcategorías (nivel 2) y tipos/clasificación (nivel 3) que el admin agrega
  // a mano, además del árbol "de fábrica" (src/data/categoryTree.js). La
  // lectura es pública (la usan el mega-menú del header y /products, no solo
  // el admin) — se trae al montar la app, sin esperar a que haya sesión.
  const fetchSubcategories = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/subcategories`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudieron cargar las subcategorías')
    setSubcategories(data)
    return data
  }, [])

  const createSubcategory = useCallback(async (category, name) => {
    const res = await fetch(`${API_BASE}/api/subcategories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': ADMIN_PASSWORD },
      body: JSON.stringify({ category, name }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo crear la subcategoría')
    setSubcategories(current => [...current, data])
    return data
  }, [])

  const deleteSubcategory = useCallback(async (id) => {
    const res = await fetch(`${API_BASE}/api/subcategories/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': ADMIN_PASSWORD },
    })
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'No se pudo eliminar la subcategoría')
    }
    setSubcategories(current => current.filter(s => s.id !== id))
  }, [])

  const fetchProductTypes = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/product-types`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudieron cargar los tipos de producto')
    setProductTypes(data)
    return data
  }, [])

  const createProductType = useCallback(async (category, subcategory, name) => {
    const res = await fetch(`${API_BASE}/api/product-types`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': ADMIN_PASSWORD },
      body: JSON.stringify({ category, subcategory, name }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo crear el tipo de producto')
    setProductTypes(current => [...current, data])
    return data
  }, [])

  const deleteProductType = useCallback(async (id) => {
    const res = await fetch(`${API_BASE}/api/product-types/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': ADMIN_PASSWORD },
    })
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'No se pudo eliminar el tipo de producto')
    }
    setProductTypes(current => current.filter(t => t.id !== id))
  }, [])

  useEffect(() => {
    fetchSubcategories().catch(() => {})
    fetchProductTypes().catch(() => {})
  }, [fetchSubcategories, fetchProductTypes])

  // Si esta pestaña quedó abierta desde antes (ej. el header en una pestaña,
  // el admin en otra) y se cargó una subcategoría/tipo nuevo en otro lado, al
  // volver a esta pestaña se refrescan para que el mega-menú del header no
  // quede desactualizado sin recargar la página a mano.
  useEffect(() => {
    const onFocus = () => {
      fetchSubcategories().catch(() => {})
      fetchProductTypes().catch(() => {})
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [fetchSubcategories, fetchProductTypes])

  // Árbol de categorías "en vivo": el estático de categoryTree.js + lo que el
  // admin haya agregado. Lo usan el mega-menú, /products y el panel de admin.
  const categoryTree = useMemo(
    () => buildCategoryTree(subcategories, productTypes),
    [subcategories, productTypes]
  )

  useEffect(() => {
    if (isAdmin) {
      fetchCurrencySettings().catch(() => {})
      fetchSupplierSettings().catch(() => {})
    }
  }, [isAdmin, fetchCurrencySettings, fetchSupplierSettings])

  const parsePriceFile = useCallback(async (file, supplier) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('supplier', supplier)
    const res = await fetch(`${API_BASE}/api/products/import/prices/parse`, {
      method: 'POST',
      headers: { 'x-admin-token': ADMIN_PASSWORD },
      body: formData,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo leer la lista de precios')
    if (data.usdArsRate) setCurrencySettings(current => ({ ...current, usdArsRate: data.usdArsRate }))
    return data
  }, [])

  const uploadPriceFiles = useCallback(async (files) => {
    setImportLoading(true)
    setImportError(null)
    try {
      const formData = new FormData()
      for (const file of files) formData.append('files', file)
      const res = await fetch(`${API_BASE}/api/products/import/prices/bulk`, {
        method: 'POST',
        headers: { 'x-admin-token': ADMIN_PASSWORD },
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudieron importar las listas de precios')
      if (data.exchangeRate) {
        setCurrencySettings(current => ({ ...current, usdArsRate: data.exchangeRate }))
      }
      fetchSupplierSettings().catch(() => {})
      setImportResult(data)
      return data
    } catch (err) {
      setImportError(err.message)
      throw err
    } finally {
      setImportLoading(false)
    }
  }, [fetchSupplierSettings])

  const rematchPriceLines = useCallback(async (lines, supplier) => {
    const res = await fetch(`${API_BASE}/api/products/import/prices/rematch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': ADMIN_PASSWORD },
      body: JSON.stringify({ lines, supplier }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudieron volver a asociar los códigos')
    return data
  }, [])

  const applyPriceUpdates = useCallback(async (actions, supplier) => {
    setImportLoading(true)
    setImportError(null)
    try {
      const res = await fetch(`${API_BASE}/api/products/import/prices/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': ADMIN_PASSWORD },
        body: JSON.stringify({ actions, supplier }),
      })
      const data = await res.json()
      if (!res.ok) {
        const error = new Error(data.error || 'No se pudieron actualizar los precios')
        error.code = data.code || null
        error.conflicts = Array.isArray(data.conflicts) ? data.conflicts : []
        throw error
      }
      setImportResult(data)
      return data
    } catch (err) {
      setImportError(err.message)
      throw err
    } finally {
      setImportLoading(false)
    }
  }, [])

  const searchProducts = useCallback(async (query, filters = {}) => {
    if (!query || query.trim().length < 2) return []
    const params = new URLSearchParams({ search: query.trim(), limit: 8, ...filters }).toString()
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

  // Catálogo visual CLEOS: primero devuelve productos e imágenes para revisar,
  // y recién después crea/actualiza los seleccionados.
  const parseCleosCatalogPdf = useCallback(async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${API_BASE}/api/products/import/cleos/parse`, {
      method: 'POST',
      headers: { 'x-admin-token': ADMIN_PASSWORD },
      body: formData,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo leer el catálogo CLEOS')
    return data
  }, [])

  const uploadCleosPreviewImage = useCallback(async (importId, file) => {
    const formData = new FormData()
    formData.append('importId', importId)
    formData.append('file', file)
    const res = await fetch(`${API_BASE}/api/products/import/cleos/image`, {
      method: 'POST',
      headers: { 'x-admin-token': ADMIN_PASSWORD },
      body: formData,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo subir la imagen')
    return data
  }, [])

  const applyCleosCatalogProducts = useCallback(async (importId, actions) => {
    setImportLoading(true)
    setImportError(null)
    try {
      const res = await fetch(`${API_BASE}/api/products/import/cleos/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': ADMIN_PASSWORD },
        body: JSON.stringify({ importId, actions }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo importar el catálogo CLEOS')
      setImportResult(data)
      return data
    } catch (err) {
      setImportError(err.message)
      throw err
    } finally {
      setImportLoading(false)
    }
  }, [])

  const parseCatalogImagesPdf = useCallback(async (file, supplier) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('supplier', supplier)
    const res = await fetch(`${API_BASE}/api/products/import/catalog-images/parse`, {
      method: 'POST',
      headers: { 'x-admin-token': ADMIN_PASSWORD },
      body: formData,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo leer el catálogo con imágenes')
    return data
  }, [])

  const uploadCatalogPreviewImage = useCallback(async (importId, file) => {
    const formData = new FormData()
    formData.append('importId', importId)
    formData.append('file', file)
    const res = await fetch(`${API_BASE}/api/products/import/catalog-images/image`, {
      method: 'POST',
      headers: { 'x-admin-token': ADMIN_PASSWORD },
      body: formData,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo subir la imagen')
    return data
  }, [])

  const applyCatalogImages = useCallback(async (importId, supplier, actions) => {
    setImportLoading(true)
    setImportError(null)
    try {
      const res = await fetch(`${API_BASE}/api/products/import/catalog-images/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': ADMIN_PASSWORD },
        body: JSON.stringify({ importId, supplier, actions }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudieron guardar las imágenes')
      setImportResult(data)
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
      inventory, inventoryTotal, inventorySuppliers, inventoryLoading, inventoryError,
      importResult, importLoading, importError,
      currencySettings, fetchCurrencySettings, updateCurrencySettings,
      supplierSettings, fetchSupplierSettings, updateSupplierCurrency,
      subcategories, fetchSubcategories, createSubcategory, deleteSubcategory,
      productTypes, fetchProductTypes, createProductType, deleteProductType,
      categoryTree,
      fetchInventory, fetchInventoryItem, createInventoryItem, updateInventoryItem, deleteInventoryItem,
      fetchInventorySelectionIds, applyInventoryBatch,
      adjustInventoryStocks, uploadInventoryFile, uploadProductImage,
      parsePriceFile, uploadPriceFiles, rematchPriceLines, applyPriceUpdates,
      searchProducts, parseInvoicePdf, applyInvoiceLines,
      parseCleosCatalogPdf, uploadCleosPreviewImage, applyCleosCatalogProducts,
      parseCatalogImagesPdf, uploadCatalogPreviewImage, applyCatalogImages,
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
