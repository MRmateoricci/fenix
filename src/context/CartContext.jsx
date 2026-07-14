import { createContext, useContext, useReducer, useEffect } from 'react'

const CartContext = createContext(null)

const STORAGE_KEY = 'fenix_cart'

// Dos líneas de carrito son "la misma" si comparten producto, color y medida
// elegidos. Productos sin color/medida (undefined/null) siguen matcheando
// como antes.
const sameLine = (a, b) =>
  a.id === b.id &&
  (a.color ?? null) === (b.color ?? null) &&
  (a.size ?? null) === (b.size ?? null)

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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // storage quota exceeded — ignore
    }
  }, [items])

  function addItem(product) {
    dispatch({ type: 'ADD_ITEM', product })
  }

  function removeItem(id, color = null, size = null) {
    dispatch({ type: 'REMOVE_ITEM', id, color, size })
  }

  function updateQuantity(id, color, size, quantity) {
    dispatch({ type: 'UPDATE_QUANTITY', id, color, size, quantity })
  }

  function clearCart() {
    dispatch({ type: 'CLEAR_CART' })
  }

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0)

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, totalItems, totalPrice }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
