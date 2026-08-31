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

  const refreshUser = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' })
    const data = res.ok ? await res.json() : null
    setUser(data?.user ?? null)
    return data?.user ?? null
  }, [])

  useEffect(() => {
    refreshUser()
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false))
  }, [refreshUser])

  const register = useCallback(async ({ email, password, firstName, lastName, phone, dni, subscribeNewsletter }) => {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, firstName, lastName, phone, dni, subscribeNewsletter }),
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

  const verifyEmail = useCallback(async (token) => {
    const res = await fetch(`${API_BASE}/api/auth/verify-email`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    if (!res.ok) throw new Error(await parseError(res))
    await refreshUser()
  }, [refreshUser])

  const resendVerificationEmail = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/auth/resend-verification`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!res.ok) throw new Error(await parseError(res))
    return res.json()
  }, [])

  return (
    <AuthContext.Provider value={{
      user, authLoading, isAuthenticated: !!user,
      register, login, logout, updateProfile, refreshUser,
      verifyEmail, resendVerificationEmail,
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
