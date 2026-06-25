'use client'

import { useState } from 'react'
import { Instagram, Facebook, ImageOff, Trash2, Send, Eye, AlertTriangle } from 'lucide-react'
import type { Post } from '@/lib/types'
import { postsApi } from '@/lib/api'
import { formatDate, getStatusConfig, cn, truncate } from '@/lib/utils'

interface Props {
  posts: Post[]
  loading: boolean
  onRefresh: () => void
}

export function PostsTable({ posts, loading, onRefresh }: Props) {
  const [publishing, setPublishing] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)

  async function handlePublish(id: number) {
    setPublishing(id)
    try {
      await postsApi.publish(id)
      onRefresh()
    } catch (err) {
      console.error(err)
    } finally {
      setPublishing(null)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar esta publicación?')) return
    setDeleting(id)
    try {
      await postsApi.delete(id)
      onRefresh()
    } catch (err) {
      console.error(err)
    } finally {
      setDeleting(null)
    }
  }

  if (loading) {
    return (
      <div className="card flex items-center justify-center h-48">
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#2C2C2A', borderTopColor: '#E8E8E4' }} />
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center h-48 text-center">
        <Send size={28} className="text-slate-700 mb-3" />
        <p className="text-slate-400 font-medium">No hay publicaciones</p>
        <p className="text-slate-600 text-sm mt-1">Creá tu primera publicación con IA</p>
      </div>
    )
  }

  return (
    <div className="card p-0 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border-subtle">
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Contenido</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Cuenta</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Plataformas</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Fecha</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {posts.map(post => {
            const statusCfg = getStatusConfig(post.status)
            return (
              <tr key={post.id} className="transition-colors group" style={{ borderBottom: '0.5px solid #1C1C1A' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#161614')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                {/* Contenido */}
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-surface-400 border border-border-subtle">
                      {post.image_url ? (
                        <img src={post.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageOff size={13} className="text-slate-600" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-slate-200 truncate max-w-[200px]">
                        {truncate(post.caption, 60) || <span className="italic text-slate-500">Sin caption</span>}
                      </p>
                      {post.error_message && (
                        <p className="text-xs text-red-400 flex items-center gap-1 mt-0.5">
                          <AlertTriangle size={10} />
                          {truncate(post.error_message, 40)}
                        </p>
                      )}
                    </div>
                  </div>
                </td>

                {/* Cuenta */}
                <td className="px-4 py-3 hidden sm:table-cell">
                  {post.account_username ? (
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ backgroundColor: post.avatar_color && post.avatar_color !== '#6366f1' ? post.avatar_color : '#2C2C2A' }}
                      >
                        {(post.account_name || 'A').charAt(0)}
                      </div>
                      <span className="text-xs text-slate-400">{post.account_username}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-600">—</span>
                  )}
                </td>

                {/* Plataformas */}
                <td className="px-4 py-3 hidden md:table-cell">
                  <div className="flex gap-1">
                    {post.platforms.map(p => (
                      <span
                        key={p}
                        className={cn(
                          'w-6 h-6 rounded flex items-center justify-center',
                          p === 'instagram' ? 'bg-pink-500/15' : 'bg-blue-500/15'
                        )}
                      >
                        {p === 'instagram'
                          ? <Instagram size={12} className="text-pink-400" />
                          : <Facebook size={12} className="text-blue-400" />
                        }
                      </span>
                    ))}
                  </div>
                </td>

                {/* Fecha */}
                <td className="px-4 py-3 hidden lg:table-cell">
                  <span className="text-xs text-slate-400">
                    {formatDate(post.scheduled_at || post.published_at)}
                  </span>
                </td>

                {/* Estado */}
                <td className="px-4 py-3">
                  <span className="badge" style={{ border: '0.5px solid', ...statusCfg.style }}>
                    <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', statusCfg.dot)} />
                    {statusCfg.label}
                  </span>
                </td>

                {/* Acciones */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {(post.status === 'draft' || post.status === 'scheduled' || post.status === 'failed') && (
                      <button
                        onClick={() => handlePublish(post.id)}
                        disabled={publishing === post.id}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                        title="Publicar ahora"
                      >
                        {publishing === post.id
                          ? <div className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" />
                          : <Send size={13} />
                        }
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(post.id)}
                      disabled={deleting === post.id}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
