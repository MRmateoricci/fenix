import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Instagram, Facebook, ImageOff } from 'lucide-react'
import type { Post } from '@/lib/types'
import { formatDate, getStatusConfig, cn } from '@/lib/utils'

interface Props {
  posts: Post[]
}

export function UpcomingPosts({ posts }: Props) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-title mb-0">Próximas publicaciones</h3>
        <Link href="/posts" style={{ fontSize: '12px', color: '#888780', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
          Ver todas <ArrowRight size={12} />
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-slate-500 text-sm">No hay publicaciones programadas</p>
          <Link href="/content" className="mt-3 btn-primary text-sm inline-flex">
            Crear publicación
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map(post => (
            <PostRow key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  )
}

function PostRow({ post }: { post: Post }) {
  const statusCfg = getStatusConfig(post.status)

  return (
    <div className="flex items-center gap-4 p-3 rounded-xl hover:bg-surface-300 transition-colors group">
      {/* Imagen */}
      <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-surface-400 border border-border-subtle">
        {post.image_url ? (
          <img
            src={post.image_url}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageOff size={16} className="text-slate-600" />
          </div>
        )}
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 truncate">
          {post.caption ? post.caption.slice(0, 70) + (post.caption.length > 70 ? '…' : '') : 'Sin caption'}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-slate-500">{post.account_username || post.account_name || 'Sin cuenta'}</span>
          <span className="text-slate-700">·</span>
          <span className="text-xs text-slate-500">{formatDate(post.scheduled_at)}</span>
        </div>
      </div>

      {/* Plataformas */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {post.platforms.map(p => (
          <span
            key={p}
            className={cn(
              'w-6 h-6 rounded-md flex items-center justify-center',
              p === 'instagram' ? 'bg-pink-500/15' : 'bg-blue-500/15'
            )}
          >
            {p === 'instagram'
              ? <Instagram size={13} className="text-pink-400" />
              : <Facebook size={13} className="text-blue-400" />
            }
          </span>
        ))}
      </div>

      {/* Estado */}
      <div className="badge" style={{ border: '0.5px solid', ...statusCfg.style }}>
        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', statusCfg.dot)} />
        {statusCfg.label}
      </div>
    </div>
  )
}
