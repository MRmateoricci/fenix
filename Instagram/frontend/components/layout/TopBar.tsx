'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Bell, Plus, Search, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/':             { title: 'Dashboard',            subtitle: 'Resumen de actividad en redes sociales' },
  '/content':      { title: 'Crear Contenido',      subtitle: 'Generá imágenes y captions con IA' },
  '/calendar':     { title: 'Calendario Editorial', subtitle: 'Planificá tus publicaciones del mes' },
  '/posts':        { title: 'Publicaciones',        subtitle: 'Gestioná todos tus posts' },
  '/accounts':     { title: 'Cuentas Conectadas',   subtitle: 'Administrá tus cuentas de Instagram y Facebook' },
  '/logs':         { title: 'Actividad',            subtitle: 'Registro de todas las acciones del sistema' },
  '/admin/users':  { title: 'Gestión de Usuarios',  subtitle: 'Monitoreá todas las cuentas registradas' },
}

export function TopBar() {
  const pathname = usePathname()
  const { user } = useAuth()
  const page = pageTitles[pathname] || { title: 'Autopost', subtitle: '' }

  return (
    <header style={{ height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', backgroundColor: '#111110', borderBottom: '0.5px solid #1C1C1A', flexShrink: 0 }}>
      {/* Título de la página */}
      <div>
        <h1 style={{ fontSize: '13px', fontWeight: 500, color: '#F5F5F3', lineHeight: 1.2 }}>{page.title}</h1>
        {page.subtitle && <p style={{ fontSize: '11px', color: '#555552', marginTop: '1px' }}>{page.subtitle}</p>}
      </div>

      {/* Acciones */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Buscador */}
        <button style={{ display: 'none', alignItems: 'center', gap: '8px', padding: '6px 12px', backgroundColor: '#1C1C1A', border: '0.5px solid #2C2C2A', borderRadius: '8px', color: '#888780', fontSize: '12px', cursor: 'pointer' }}
          className="md:flex">
          <Search size={13} />
          <span>Buscar...</span>
        </button>

        {/* Notificaciones */}
        <button style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888780', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '8px', position: 'relative' }}>
          <Bell size={15} />
        </button>

        {/* "+ Nueva" */}
        <Link href="/content" className="btn-primary" style={{ fontSize: '13px', padding: '6px 12px', borderRadius: '8px' }}>
          <Plus size={13} />
          <span className="hidden sm:inline">Nueva</span>
        </Link>

        {/* Badge Admin */}
        {user?.role === 'admin' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', backgroundColor: '#1C1C1A', border: '0.5px solid #2C2C2A', borderRadius: '20px' }}>
            <ShieldCheck size={11} style={{ color: '#888780' }} />
            <span style={{ fontSize: '11px', fontWeight: 500, color: '#888780' }}>Admin</span>
          </div>
        )}

        {/* Avatar usuario */}
        <div style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: '#2C2C2A', border: '0.5px solid #3C3C3A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 500, color: '#F5F5F3' }}>
          {user?.name?.charAt(0).toUpperCase() || 'U'}
        </div>
      </div>
    </header>
  )
}
