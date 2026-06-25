'use client'

import { useState, useEffect, useCallback } from 'react'
import { logsApi } from '@/lib/api'
import type { PostLog } from '@/lib/types'
import { ActivityLog } from '@/components/logs/ActivityLog'
import { RefreshCw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const LEVEL_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'success', label: 'Exitosos' },
  { value: 'error', label: 'Errores' },
  { value: 'warning', label: 'Advertencias' },
  { value: 'info', label: 'Info' },
]

export default function LogsPage() {
  const [logs, setLogs] = useState<PostLog[]>([])
  const [total, setTotal] = useState(0)
  const [level, setLevel] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const load = useCallback(() => {
    setLoading(true)
    logsApi.list({ level: level || undefined, limit: 100 })
      .then(d => { setLogs(d.logs); setTotal(d.total) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [level, refreshKey])

  useEffect(() => { load() }, [load])

  async function handleCleanup() {
    if (!confirm('¿Eliminar logs de más de 30 días?')) return
    await logsApi.cleanup()
    setRefreshKey(k => k + 1)
  }

  return (
    <div className="animate-slide-up space-y-5">
      <div className="flex items-center justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Actividad del Sistema</h1>
          <p className="page-subtitle">{total} registros totales</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleCleanup} className="btn-ghost text-sm text-red-400 hover:text-red-300">
            <Trash2 size={14} />
            <span className="hidden sm:inline">Limpiar logs</span>
          </button>
          <button onClick={() => setRefreshKey(k => k + 1)} className="btn-ghost">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filtros por nivel */}
      <div className="flex items-center gap-2 flex-wrap">
        {LEVEL_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setLevel(f.value)}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: level === f.value ? 500 : 400,
              border: '0.5px solid',
              cursor: 'pointer',
              transition: 'all 0.1s',
              backgroundColor: level === f.value ? '#E8E8E4' : 'transparent',
              color: level === f.value ? '#0D0D0C' : '#888780',
              borderColor: level === f.value ? '#E8E8E4' : '#2C2C2A',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ActivityLog logs={logs} loading={loading} />
    </div>
  )
}
