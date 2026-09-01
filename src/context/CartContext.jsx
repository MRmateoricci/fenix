import { createContext, useContext, useReducer, useEffect, useState } from 'react'

const CartContext = createContext(null)

const STORAGE_KEY = 'fenix_cart'
const API_BASE = import.meta.env.VITE_API_URL || ''

// Dos líneas de carrito son "la misma" si comparten producto, color, tono y
// medida elegidos. Productos sin color/tono/medida (undefined/null) siguen
// matcheando como antes.
const sameLine = (a, b) =>
  a.id === b.id &&
  (a.color ?? null) === (b.color ?? null) &&
  (a.size ?? null) === (b.size ?? null) &&
  (a.tone ?? null) === (b.tone ?? null)

function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.find(item => sameLine(item, action.product))
      if (existing) {
        return state.map(item =>
          sameLine(item, action.product)
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...state, { ...action.product, quantity: 1 }]
    }
    case 'REMOVE_ITEM':
      return state.filter(item => !sameLine(item, action))
    case 'UPDATE_QUANTITY':
      if (action.quantity <= 0) {
        return state.filter(item => !sameLine(item, action))
      }
      return state.map(item =>
        sameLine(item, action) ? { ...item, quantity: action.quantity } : item
      )
    case 'CLEAR_CART':
      return []
    case 'LOAD_CART':
      return action.items
    default:
      return state
  }
}

export function CartProvider({ children }) {
  const [items, dispatch] = useReducer(cartReducer, [], () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
  const [lastAdded, setLastAdded] = useState(null)
  // Umbral y zonas de envío gratis: nunca hardcodeados en el frontend, se
  // reciben del backend (única fuente de verdad, configurable por env var).
  const [shippingConfig, setShippingConfig] = useState(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // storage quota exceeded — ignore
    }
  }, [items])

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/shipping/config`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setShippingConfig(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  function addItem(product) {
    dispatch({ type: 'ADD_ITEM', product })
    setLastAdded({ ...product, notificationId: Date.now() })
  }

  function removeItem(id, color = null, size = null, tone = null) {
    dispatch({ type: 'REMOVE_ITEM', id, color, size, tone })
  }

  function updateQuantity(id, color, size, quantity, tone = null) {
    dispatch({ type: 'UPDATE_QUANTITY', id, color, size, quantity, tone })
  }

  function clearCart() {
    dispatch({ type: 'CLEAR_CART' })
  }

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  // Peso total para la vista previa del envío. El carrito viejo (guardado antes
  // de cargar weight_kg) suma 0 y el tarifario cae al tramo más barato; POST
  // /api/orders vuelve a sumar el peso contra la DB, igual que el precio.
  const totalWeight = items.reduce((sum, item) => sum + (Number(item.weightKg) || 0) * item.quantity, 0)

  return (
    <CartContext.Provider value={{
      items, addItem, removeItem, updateQuantity, clearCart, totalItems, totalPrice, totalWeight,
      lastAdded, dismissAddedNotification: () => setLastAdded(null),
      shippingConfig,
    }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
