import { createContext, useContext, useCallback, useEffect, useState } from 'react'
import { api, clearToken, getToken, setToken } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadFromToken = useCallback(async () => {
    if (!getToken()) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const { user: me } = await api.me()
      setUser(me)
    } catch {
      clearToken()
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFromToken()
    // El token puede volverse inválido en cualquier momento (turno vencido,
    // usuario desactivado por el admin desde otra terminal): api.js dispara
    // este evento apenas el backend responde 401.
    const onUnauthorized = () => setUser(null)
    window.addEventListener('fenix-pos-unauthorized', onUnauthorized)
    return () => window.removeEventListener('fenix-pos-unauthorized', onUnauthorized)
  }, [loadFromToken])

  const login = useCallback(async (username, password) => {
    const { token, user: loggedUser } = await api.login(username, password)
    setToken(token)
    setUser(loggedUser)
  }, [])

  const logout = useCallback(() => {
    api.logout().catch(() => {})
    clearToken()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
