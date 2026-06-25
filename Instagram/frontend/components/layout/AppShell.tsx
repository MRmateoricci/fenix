'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

const PUBLIC_PATHS = ['/login']

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  const isPublic = PUBLIC_PATHS.includes(pathname)

  useEffect(() => {
    if (loading) return
    if (!user && !isPublic) {
      router.replace('/login')
    } else if (user && isPublic) {
      router.replace('/')
    }
  }, [user, loading, isPublic, router])

  // Página pública (login): sin shell
  if (isPublic) {
    return <>{children}</>
  }

  // Cargando sesión
  if (loading || !user) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin" style={{ color: '#888780' }} />
      </div>
    )
  }

  // App completa con sidebar
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}
