import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)

const API_BASE = import.meta.env.VITE_API_URL || ''

async function parseError(res) {
  const data = await res.json().catch(() => ({}))
  return data.error || 'Ocurrió un error inesperado'
}

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' })
      .then(res => (res.ok ? res.json() : null))
      .then(data => setUser(data?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false))
  }, [])

  const register = useCallback(async ({ email, password, firstName, lastName, phone }) => {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, firstName, lastName, phone }),
    })
    if (!res.ok) throw new Error(await parseError(res))
    const { user } = await res.json()
    setUser(user)
    return user
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) throw new Error(await parseError(res))
    const { user } = await res.json()
    setUser(user)
    return user
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' })
    } finally {
      setUser(null)
    }
  }, [])

  const updateProfile = useCallback(async (changes) => {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    })
    if (!res.ok) throw new Error(await parseError(res))
    const { user } = await res.json()
    setUser(user)
    return user
  }, [])

  return (
    <AuthContext.Provider value={{
      user, authLoading, isAuthenticated: !!user,
      register, login, logout, updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
