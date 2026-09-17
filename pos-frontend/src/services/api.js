const API_BASE = import.meta.env.VITE_API_URL || ''
const TOKEN_KEY = 'fenix_pos_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

// El POS no usa cookies (ver backend/middleware/posAuth.js): manda el JWT por
// header Authorization porque vive en un subdominio propio, separado del
// dominio del e-commerce/admin.
async function posFetch(path, options = {}) {
  const token = getToken()
  // FormData (subida de archivos) necesita que el navegador arme su propio
  // Content-Type con el boundary del multipart — forzarlo a JSON rompe el parseo.
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const headers = { ...(isFormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (response.status === 401) {
    clearToken()
    window.dispatchEvent(new Event('fenix-pos-unauthorized'))
  }
  return response
}

async function posJson(path, options) {
  const response = await posFetch(path, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Error de red')
  return data
}

// Para el PDF de la factura: la respuesta es binaria, no JSON.
async function posBlob(path) {
  const response = await posFetch(path)
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || 'Error de red')
  }
  return response.blob()
}

export const api = {
  login: (username, password) =>
    posJson('/api/pos/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => posJson('/api/pos/auth/me'),
  logout: () => posJson('/api/pos/auth/logout', { method: 'POST' }),

  catalog: () => posJson('/api/pos/products/catalog'),
  catalogUpdated: since => posJson(`/api/pos/products/catalog/updated?since=${encodeURIComponent(since)}`),
  search: q => posJson(`/api/pos/products/search?q=${encodeURIComponent(q)}`),
  getProductCost: id => posJson(`/api/pos/products/${id}/cost`),

  createSale: payload => posJson('/api/pos/sales', { method: 'POST', body: JSON.stringify(payload) }),
  listSales: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    return posJson(`/api/pos/sales?${query.toString()}`)
  },
  getSale: id => posJson(`/api/pos/sales/${id}`),

  listUsers: () => posJson('/api/pos/users'),
  createUser: payload => posJson('/api/pos/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateUser: (id, payload) => posJson(`/api/pos/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deactivateUser: id => posJson(`/api/pos/users/${id}`, { method: 'DELETE' }),

  getSettings: () => posJson('/api/pos/settings'),
  updateSettings: payload => posJson('/api/pos/settings', { method: 'PUT', body: JSON.stringify(payload) }),

  getCashCurrent: () => posJson('/api/pos/cash/current'),
  openCash: openingAmount => posJson('/api/pos/cash/open', { method: 'POST', body: JSON.stringify({ openingAmount }) }),
  closeCash: (actualCash, notes) =>
    posJson('/api/pos/cash/close', { method: 'POST', body: JSON.stringify({ actualCash, notes }) }),
  getCashHistory: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    return posJson(`/api/pos/cash/history?${query.toString()}`)
  },
  getCashDetail: id => posJson(`/api/pos/cash/${id}`),
  createCashMovement: (type, amount, reason) =>
    posJson('/api/pos/cash/movements', { method: 'POST', body: JSON.stringify({ type, amount, reason }) }),
  listCashMovements: () => posJson('/api/pos/cash/movements'),

  listSuppliers: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    return posJson(`/api/pos/suppliers?${query.toString()}`)
  },
  getSuppliersSummary: () => posJson('/api/pos/suppliers/summary'),
  getSupplier: id => posJson(`/api/pos/suppliers/${id}`),
  createSupplier: payload => posJson('/api/pos/suppliers', { method: 'POST', body: JSON.stringify(payload) }),
  updateSupplier: (id, payload) => posJson(`/api/pos/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deactivateSupplier: id => posJson(`/api/pos/suppliers/${id}`, { method: 'DELETE' }),
  getSupplierMovements: (id, params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    return posJson(`/api/pos/suppliers/${id}/movements?${query.toString()}`)
  },

  createPurchase: payload => posJson('/api/pos/purchases', { method: 'POST', body: JSON.stringify(payload) }),
  listPurchases: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    return posJson(`/api/pos/purchases?${query.toString()}`)
  },
  getPurchase: id => posJson(`/api/pos/purchases/${id}`),

  createSupplierPayment: payload => posJson('/api/pos/supplier-payments', { method: 'POST', body: JSON.stringify(payload) }),
  listSupplierPayments: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    return posJson(`/api/pos/supplier-payments?${query.toString()}`)
  },

  uploadPriceList: file => {
    const form = new FormData()
    form.append('file', file)
    return posJson('/api/pos/price-imports/upload', { method: 'POST', body: form })
  },
  previewPriceImport: (file, mapping) => {
    const form = new FormData()
    form.append('file', file)
    Object.entries(mapping).forEach(([key, value]) => { if (value != null) form.append(key, value) })
    return posJson('/api/pos/price-imports/preview', { method: 'POST', body: form })
  },
  getBulkIncreaseFilters: () => posJson('/api/pos/price-imports/bulk-increase/filters'),
  previewBulkIncrease: payload => posJson('/api/pos/price-imports/bulk-increase/preview', { method: 'POST', body: JSON.stringify(payload) }),
  applyPriceImport: id => posJson(`/api/pos/price-imports/${id}/apply`, { method: 'POST' }),
  cancelPriceImport: id => posJson(`/api/pos/price-imports/${id}/cancel`, { method: 'POST' }),
  listPriceImports: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    return posJson(`/api/pos/price-imports?${query.toString()}`)
  },
  getPriceImport: (id, params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    return posJson(`/api/pos/price-imports/${id}?${query.toString()}`)
  },

  getInvoicingOptions: () => posJson('/api/pos/invoicing/options'),
  cuitLookup: cuit => posJson('/api/pos/invoicing/cuit-lookup', { method: 'POST', body: JSON.stringify({ cuit }) }),
  checkAfipStatus: () => posJson('/api/pos/invoicing/check-status', { method: 'POST' }),
  emitInvoice: payload => posJson('/api/pos/invoicing/emit', { method: 'POST', body: JSON.stringify(payload) }),
  getSaleInvoice: saleId => posJson(`/api/pos/invoicing/${saleId}`),
  downloadInvoicePdf: saleId => posBlob(`/api/pos/invoicing/${saleId}/pdf`),

  getFiscalSummary: (year, month) => posJson(`/api/pos/fiscal/summary?year=${year}&month=${month}`),
  getFiscalMonthlyHistory: year => posJson(`/api/pos/fiscal/monthly-history?year=${year}`),
  getFiscalSalesDetail: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    return posJson(`/api/pos/fiscal/sales-detail?${query.toString()}`)
  },
  getFiscalPurchasesDetail: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    return posJson(`/api/pos/fiscal/purchases-detail?${query.toString()}`)
  },
  getUpcomingVatDeadline: () => posJson('/api/pos/fiscal/upcoming-deadline'),
  updateVatDeadline: payload => posJson('/api/pos/fiscal/deadlines', { method: 'PUT', body: JSON.stringify(payload) }),
}
