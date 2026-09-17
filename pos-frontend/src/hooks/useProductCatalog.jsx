import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api } from '../services/api'

const CatalogContext = createContext(null)

// El cache local se refresca solo, en segundo plano, cada 2.5 minutos — ni
// tan seguido como para recargar de más, ni tan espaciado como para que un
// cambio de precio en el admin tarde mucho en verse en el mostrador.
const SYNC_INTERVAL_MS = 150_000

export function CatalogProvider({ children }) {
  const [ready, setReady] = useState(false)
  const [count, setCount] = useState(0)
  const productsRef = useRef(new Map())
  const sinceRef = useRef(null)

  const applyBatch = useCallback((incoming, since) => {
    for (const product of incoming) productsRef.current.set(product.id, product)
    sinceRef.current = since
    setCount(productsRef.current.size)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadFull() {
      try {
        const { products, since } = await api.catalog()
        if (cancelled) return
        applyBatch(products, since)
        setReady(true)
      } catch {
        // El buscador cae al fallback de servidor mientras esto no esté listo;
        // el próximo ciclo de sync lo vuelve a intentar.
      }
    }

    async function syncUpdates() {
      if (!sinceRef.current) return
      try {
        const { products, since } = await api.catalogUpdated(sinceRef.current)
        if (cancelled) return
        if (products.length) applyBatch(products, since)
        else sinceRef.current = since
      } catch {
        // Se reintenta en el próximo ciclo; el cache local sigue sirviendo.
      }
    }

    loadFull()
    const intervalId = setInterval(syncUpdates, SYNC_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [applyBatch])

  // Filtrar ~40.000 productos en memoria por substring es instantáneo — no
  // hace falta debounce ni índice: se llama en cada tecla.
  const searchLocal = useCallback((query, limit = 30) => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return []
    const results = []
    for (const product of productsRef.current.values()) {
      const haystack = `${product.nombre} ${product.codigo}`.toLowerCase()
      if (words.every(word => haystack.includes(word))) {
        results.push(product)
        if (results.length >= limit) break
      }
    }
    return results
  }, [])

  const getProduct = useCallback(id => productsRef.current.get(id) || null, [])

  return (
    <CatalogContext.Provider value={{ ready, count, searchLocal, getProduct }}>
      {children}
    </CatalogContext.Provider>
  )
}

export function useProductCatalog() {
  const ctx = useContext(CatalogContext)
  if (!ctx) throw new Error('useProductCatalog debe usarse dentro de CatalogProvider')
  return ctx
}
