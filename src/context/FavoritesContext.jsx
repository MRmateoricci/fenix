import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from './AuthContext'

const FavoritesContext = createContext(null)

const API_BASE = import.meta.env.VITE_API_URL || ''

export function FavoritesProvider({ children }) {
  const { user } = useAuth()
  const [favoriteIds, setFavoriteIds] = useState(new Set())

  useEffect(() => {
    if (!user) {
      setFavoriteIds(new Set())
      return
    }
    fetch(`${API_BASE}/api/favorites`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => setFavoriteIds(new Set(rows.map((r) => r.productId))))
      .catch(() => setFavoriteIds(new Set()))
  }, [user])

  const isFavorite = useCallback((productId) => favoriteIds.has(productId), [favoriteIds])

  const toggleFavorite = useCallback(async (productId) => {
    if (!user) return
    const wasFavorite = favoriteIds.has(productId)

    setFavoriteIds((prev) => {
      const next = new Set(prev)
      if (wasFavorite) next.delete(productId)
      else next.add(productId)
      return next
    })

    try {
      if (wasFavorite) {
        const res = await fetch(`${API_BASE}/api/favorites/${productId}`, { method: 'DELETE', credentials: 'include' })
        if (!res.ok) throw new Error()
      } else {
        const res = await fetch(`${API_BASE}/api/favorites`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId }),
        })
        if (!res.ok) throw new Error()
      }
    } catch {
      // revierte el cambio optimista si la llamada falla
      setFavoriteIds((prev) => {
        const next = new Set(prev)
        if (wasFavorite) next.add(productId)
        else next.delete(productId)
        return next
      })
    }
  }, [user, favoriteIds])

  return (
    <FavoritesContext.Provider value={{ favoriteIds, isFavorite, toggleFavorite }}>
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext)
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider')
  return ctx
}
