import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from '../services/api'

const CashRegisterContext = createContext(null)

// Estado de la caja física del local, compartido por todas las pantallas que
// lo necesitan (gate de /, pantalla de Caja, indicador en la barra de
// navegación) para no repetir el fetch en cada una.
export function CashRegisterProvider({ children }) {
  const [cashRegister, setCashRegister] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const { cashRegister: current } = await api.getCashCurrent()
      setCashRegister(current)
      return current
    } catch {
      setCashRegister(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const open = useCallback(
    async openingAmount => {
      const { cashRegister: opened } = await api.openCash(openingAmount)
      setCashRegister(opened)
      return opened
    },
    []
  )

  const close = useCallback(async (actualCash, notes) => {
    const { cashRegister: closed } = await api.closeCash(actualCash, notes)
    setCashRegister(null)
    return closed
  }, [])

  const addMovement = useCallback(async (type, amount, reason) => {
    const { cashRegister: updated } = await api.createCashMovement(type, amount, reason)
    setCashRegister(updated)
    return updated
  }, [])

  return (
    <CashRegisterContext.Provider value={{ cashRegister, loading, isOpen: cashRegister != null, refresh, open, close, addMovement }}>
      {children}
    </CashRegisterContext.Provider>
  )
}

export function useCashRegister() {
  const ctx = useContext(CashRegisterContext)
  if (!ctx) throw new Error('useCashRegister debe usarse dentro de CashRegisterProvider')
  return ctx
}
