'use client'

import { useState, useEffect, useCallback } from 'react'
import { Users, Instagram, Trash2, ShieldCheck, User, RefreshCw, Loader2 } from 'lucide-react'
import { getToken } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

interface ManagedUser {
  id: number
  email: string
  name: string
  role: 'admin' | 'creator'
  createdAt: string
  _count: { accounts: number }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

export function UsersManager() {
  const { user } = useAuth()
  const router = useRouter()
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/auth/users`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setUsers(data)
    } catch {
      // token expirado o sin permiso
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user?.role !== 'admin') { router.replace('/'); return }
    fetchUsers()
  }, [user, router, fetchUsers])

  async function deleteUser(id: number) {
    if (!confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.')) return
    setDeletingId(id)
    try {
      await fetch(`${API_URL}/auth/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      setUsers(prev => prev.filter(u => u.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  const creators = users.filter(u => u.role === 'creator')
  const admins = users.filter(u => u.role === 'admin')

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard icon={Users} label="Total usuarios" value={users.length} />
        <StatCard icon={User} label="Creadores" value={creators.length} />
        <StatCard icon={ShieldCheck} label="Admins" value={admins.length} />
      </div>

      {/* Tabla de usuarios */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 500, color: '#F5F5F3' }}>Usuarios registrados</h2>
          <button onClick={fetchUsers} className="btn-ghost" title="Actualizar">
            <RefreshCw size={14} />
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
            <Loader2 size={22} className="animate-spin" style={{ color: '#888780' }} />
          </div>
        ) : users.length === 0 ? (
          <p style={{ color: '#555552', fontSize: '13px', textAlign: 'center', padding: '32px 0' }}>No hay usuarios registrados</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '0.5px solid #2C2C2A' }}>
                  <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 500, color: '#444441', paddingBottom: '10px', paddingRight: '16px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Usuario</th>
                  <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 500, color: '#444441', paddingBottom: '10px', paddingRight: '16px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Rol</th>
                  <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 500, color: '#444441', paddingBottom: '10px', paddingRight: '16px', textTransform: 'uppercase', letterSpacing: '0.06em' }} className="hidden sm:table-cell">Cuentas</th>
                  <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 500, color: '#444441', paddingBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }} className="hidden md:table-cell">Registrado</th>
                  <th style={{ paddingBottom: '10px' }} />
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="group" style={{ borderBottom: '0.5px solid #1C1C1A' }}>
                    <td style={{ padding: '12px 16px 12px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#2C2C2A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '11px', fontWeight: 500, color: '#F5F5F3' }}>
                            {u.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p style={{ fontSize: '13px', fontWeight: 500, color: '#F5F5F3' }}>{u.name}</p>
                          <p style={{ fontSize: '11px', color: '#555552' }}>{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px 12px 0' }}>
                      {u.role === 'admin' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '20px', backgroundColor: '#1C1C1A', border: '0.5px solid #2C2C2A', color: '#888780', fontSize: '11px', fontWeight: 500 }}>
                          <ShieldCheck size={10} />
                          Admin
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '20px', backgroundColor: '#1a2e1a', border: '0.5px solid #2a4a2a', color: '#7cb87c', fontSize: '11px', fontWeight: 500 }}>
                          <User size={10} />
                          Creador
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px 12px 0' }} className="hidden sm:table-cell">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#555552' }}>
                        <Instagram size={12} />
                        <span style={{ fontSize: '13px' }}>{u._count.accounts}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 0' }} className="hidden md:table-cell">
                      <span style={{ fontSize: '11px', color: '#555552' }}>
                        {new Date(u.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </td>
                    <td style={{ padding: '12px 0', textAlign: 'right' }}>
                      {u.role !== 'admin' && (
                        <button
                          onClick={() => deleteUser(u.id)}
                          disabled={deletingId === u.id}
                          className="opacity-0 group-hover:opacity-100"
                          style={{ padding: '6px', color: '#444441', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '6px', transition: 'color 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#b87c7c')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#444441')}
                          title="Eliminar usuario"
                        >
                          {deletingId === u.id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Trash2 size={13} />
                          }
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value }: {
  icon: React.ElementType
  label: string
  value: number
}) {
  return (
    <div style={{ backgroundColor: '#1C1C1A', border: '0.5px solid #2C2C2A', borderRadius: '12px', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#2C2C2A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} style={{ color: '#444441' }} />
        </div>
        <div>
          <p style={{ fontSize: '24px', fontWeight: 500, color: '#F5F5F3', lineHeight: 1 }}>{value}</p>
          <p style={{ fontSize: '11px', color: '#555552', marginTop: '2px' }}>{label}</p>
        </div>
      </div>
    </div>
  )
}
