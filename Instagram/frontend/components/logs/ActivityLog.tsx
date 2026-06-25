import type { PostLog } from '@/lib/types'
import { getLogLevelConfig, formatDateRelative, cn } from '@/lib/utils'
import { Instagram, Facebook, ImageOff, ScrollText } from 'lucide-react'

interface Props {
  logs: PostLog[]
  loading: boolean
}

const ACTION_LABELS: Record<string, string> = {
  PUBLISHED:  'Publicación enviada',
  FAILED:     'Publicación fallida',
  SCHEDULED:  'Publicación programada',
  CREATED:    'Borrador creado',
  RETRY:      'Reintentando publicación',
  PROCESSING: 'Procesando publicación',
}

export function ActivityLog({ logs, loading }: Props) {
  if (loading) {
    return (
      <div className="card flex items-center justify-center h-48">
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#2C2C2A', borderTopColor: '#E8E8E4' }} />
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center h-48">
        <ScrollText size={28} className="text-slate-700 mb-3" />
        <p className="text-slate-400 font-medium">Sin actividad registrada</p>
      </div>
    )
  }

  return (
    <div className="card p-0 overflow-hidden">
      {/* Header de la tabla */}
      <div className="px-5 py-3 border-b border-border-subtle grid grid-cols-[auto_1fr_auto_auto] gap-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
        <span>Nivel</span>
        <span>Mensaje</span>
        <span className="hidden sm:block">Cuenta</span>
        <span>Tiempo</span>
      </div>

      <div className="divide-y divide-border-subtle">
        {logs.map(log => {
          const lvl = getLogLevelConfig(log.level)
          const actionLabel = ACTION_LABELS[log.action] || log.action

          return (
            <div
              key={log.id}
              className="px-5 py-3 grid grid-cols-[auto_1fr_auto_auto] gap-4 items-center hover:bg-surface-200/50 transition-colors"
            >
              {/* Nivel */}
              <div className={cn(
                'w-7 h-7 rounded-lg flex items-center justify-center text-sm border',
                lvl.bg, lvl.border
              )}>
                <span className={cn('text-xs font-bold', lvl.color)}>{lvl.icon}</span>
              </div>

              {/* Mensaje */}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('text-xs font-semibold', lvl.color)}>{actionLabel}</span>
                  {log.post_id && (
                    <span className="text-xs text-slate-600">#{log.post_id}</span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5 truncate">{log.message}</p>
                {log.caption && (
                  <p className="text-xs text-slate-600 truncate mt-0.5">
                    "{log.caption.slice(0, 60)}{log.caption.length > 60 ? '…' : ''}"
                  </p>
                )}
              </div>

              {/* Cuenta */}
              <div className="hidden sm:flex items-center gap-1.5 min-w-[100px]">
                {log.platform ? (
                  <>
                    <div className={cn(
                      'w-5 h-5 rounded flex items-center justify-center',
                      log.platform === 'instagram' ? 'bg-pink-500/15' : 'bg-blue-500/15'
                    )}>
                      {log.platform === 'instagram'
                        ? <Instagram size={11} className="text-pink-400" />
                        : <Facebook size={11} className="text-blue-400" />
                      }
                    </div>
                    <span className="text-xs text-slate-500 truncate max-w-[80px]">{log.username || log.account_name}</span>
                  </>
                ) : (
                  <span className="text-xs text-slate-600">—</span>
                )}
              </div>

              {/* Tiempo */}
              <span className="text-xs text-slate-500 whitespace-nowrap">
                {formatDateRelative(log.created_at)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
