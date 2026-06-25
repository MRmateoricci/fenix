'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Sparkles, CalendarDays, Send,
  Users, ScrollText, ChevronRight, LogOut,
  ShieldCheck
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

const creatorNav = [
  { href: '/',         icon: LayoutDashboard, label: 'Dashboard',       section: 'main' },
  { href: '/content',  icon: Sparkles,        label: 'Crear Contenido', section: 'main' },
  { href: '/calendar', icon: CalendarDays,    label: 'Calendario',      section: 'main' },
  { href: '/posts',    icon: Send,            label: 'Publicaciones',   section: 'main' },
  { href: '/accounts', icon: Users,           label: 'Mis Cuentas',     section: 'config' },
  { href: '/logs',     icon: ScrollText,      label: 'Actividad',       section: 'config' },
]

const adminNav = [
  { href: '/',           icon: LayoutDashboard, label: 'Dashboard',       section: 'main' },
  { href: '/content',    icon: Sparkles,        label: 'Crear Contenido', section: 'main' },
  { href: '/calendar',   icon: CalendarDays,    label: 'Calendario',      section: 'main' },
  { href: '/posts',      icon: Send,            label: 'Publicaciones',   section: 'main' },
  { href: '/accounts',   icon: Users,           label: 'Cuentas',         section: 'config' },
  { href: '/logs',       icon: ScrollText,      label: 'Actividad',       section: 'config' },
  { href: '/admin/users', icon: ShieldCheck,    label: 'Usuarios',        section: 'admin' },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const router = useRouter()

  const navItems = user?.role === 'admin' ? adminNav : creatorNav

  function handleLogout() {
    logout()
    router.replace('/login')
  }

  return (
    <aside style={{ width: '232px', flexShrink: 0, display: 'flex', flexDirection: 'column', backgroundColor: '#111110', borderRight: '0.5px solid #1C1C1A' }}>
      {/* Logo */}
      <div style={{ height: '56px', display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '0.5px solid #1C1C1A' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ backgroundColor: '#0D0D0C', borderRadius: '10px', padding: '6px', lineHeight: 0 }}>
            <svg width="32" height="32" viewBox="0 0 80 80" fill="none">
              <rect width="80" height="80" rx="20" fill="white"/>
              <path d="M18 58L40 16L62 58H50L40 34L30 58H18Z" fill="#0D0D0C"/>
              <rect x="30" y="44" width="20" height="6" fill="white"/>
            </svg>
          </div>
          <span style={{ fontSize: '15px', fontWeight: 500, color: '#F5F5F3', letterSpacing: '-0.2px' }}>Autopost</span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1px' }}>
        <p style={{ padding: '0 10px', fontSize: '10px', fontWeight: 500, color: '#444441', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px', marginTop: '4px' }}>
          Principal
        </p>

        {navItems.filter(i => i.section === 'main').map(item => (
          <NavItem key={item.href} item={item} active={pathname === item.href} />
        ))}

        <p style={{ padding: '0 10px', fontSize: '10px', fontWeight: 500, color: '#444441', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px', marginTop: '20px' }}>
          Configuración
        </p>

        {navItems.filter(i => i.section === 'config').map(item => (
          <NavItem key={item.href} item={item} active={pathname === item.href} />
        ))}

        {user?.role === 'admin' && (
          <>
            <p style={{ padding: '0 10px', fontSize: '10px', fontWeight: 500, color: '#444441', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px', marginTop: '20px' }}>
              Admin
            </p>
            {navItems.filter(i => i.section === 'admin').map(item => (
              <NavItem key={item.href} item={item} active={pathname === item.href} />
            ))}
          </>
        )}
      </nav>

      {/* Footer */}
      <div style={{ padding: '12px 10px', borderTop: '0.5px solid #1C1C1A', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Scheduler status */}
        <div style={{ borderRadius: '10px', backgroundColor: '#1a2e1a', border: '0.5px solid #2a4a2a', padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#7cb87c' }} />
            <span style={{ fontSize: '11px', fontWeight: 500, color: '#7cb87c' }}>Scheduler activo</span>
          </div>
          <p style={{ fontSize: '11px', color: '#4a7a4a', lineHeight: '1.4' }}>
            Verificando publicaciones cada minuto.
          </p>
        </div>

        {/* User info + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 4px' }}>
          <div style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: '#2C2C2A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: '11px', fontWeight: 500, color: '#F5F5F3' }}>
              {user?.name?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '12px', fontWeight: 500, color: '#F5F5F3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</p>
            <p style={{ fontSize: '10px', color: '#555552', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.role === 'admin' ? 'Administrador' : 'Creador'}
            </p>
          </div>
          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            style={{ color: '#444441', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '6px', display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#b87c7c')}
            onMouseLeave={e => (e.currentTarget.style.color = '#444441')}
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  )
}

function NavItem({ item, active }: { item: typeof creatorNav[0]; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 10px',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: active ? 500 : 400,
        textDecoration: 'none',
        transition: 'all 0.1s',
        backgroundColor: active ? '#1C1C1A' : 'transparent',
        color: active ? '#F5F5F3' : '#888780',
      }}
    >
      <Icon size={15} style={{ color: active ? '#F5F5F3' : '#555552', flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{item.label}</span>
      {active && <ChevronRight size={12} style={{ color: '#444441' }} />}
    </Link>
  )
}
