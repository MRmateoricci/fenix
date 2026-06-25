'use client'

import { useState } from 'react'
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, CheckCircle2 } from 'lucide-react'
import type { AIGenerationResult, Post } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Props {
  result: AIGenerationResult | null
  savedPost: Post | null
}

type PreviewMode = 'instagram' | 'facebook'

export function PostPreview({ result, savedPost }: Props) {
  const [mode, setMode] = useState<PreviewMode>('instagram')

  const showSavedBanner = !!savedPost
  const hasContent = !!result

  return (
    <div className="sticky top-0 space-y-4">
      {/* Saved notification */}
      {showSavedBanner && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 animate-fade-in">
          <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-emerald-300">
              {savedPost.status === 'scheduled' ? '¡Publicación programada!' : '¡Borrador guardado!'}
            </p>
            <p className="text-xs text-emerald-500/80">
              {savedPost.status === 'scheduled'
                ? `Programada para ${new Date(savedPost.scheduled_at!).toLocaleString('es-AR')}`
                : 'Guardado en borradores'}
            </p>
          </div>
        </div>
      )}

      <div className="card">
        {/* Selector de modo */}
        <div className="flex items-center gap-1 p-1 bg-surface-100 rounded-lg mb-5 border border-border-subtle">
          <button
            onClick={() => setMode('instagram')}
            style={{
              flex: 1,
              padding: '7px 0',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s',
              backgroundColor: mode === 'instagram' ? '#E8E8E4' : 'transparent',
              color: mode === 'instagram' ? '#0D0D0C' : '#888780',
            }}
          >
            📸 Instagram
          </button>
          <button
            onClick={() => setMode('facebook')}
            style={{
              flex: 1,
              padding: '7px 0',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s',
              backgroundColor: mode === 'facebook' ? '#E8E8E4' : 'transparent',
              color: mode === 'facebook' ? '#0D0D0C' : '#888780',
            }}
          >
            👥 Facebook
          </button>
        </div>

        {!hasContent ? (
          // Estado vacío
          <div className="aspect-[4/5] rounded-xl bg-surface-100 border border-dashed border-border flex flex-col items-center justify-center text-center p-6">
            <div className="w-12 h-12 rounded-xl bg-surface-300 flex items-center justify-center mb-3">
              <span className="text-2xl">{mode === 'instagram' ? '📸' : '👥'}</span>
            </div>
            <p className="text-sm font-medium text-slate-400">Preview de {mode === 'instagram' ? 'Instagram' : 'Facebook'}</p>
            <p className="text-xs text-slate-600 mt-1">El contenido generado aparecerá aquí</p>
          </div>
        ) : mode === 'instagram' ? (
          <InstagramPreview result={result} />
        ) : (
          <FacebookPreview result={result} />
        )}
      </div>
    </div>
  )
}

function InstagramPreview({ result }: { result: AIGenerationResult }) {
  const caption = result.caption || ''
  const hashtags = result.hashtags || []
  const fullText = hashtags.length > 0
    ? `${caption}\n\n${hashtags.map(h => `#${h}`).join(' ')}`
    : caption

  return (
    <div className="bg-white rounded-xl overflow-hidden text-gray-900 text-sm max-w-sm mx-auto shadow-xl shadow-black/20">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-rose-400" />
          <div>
            <p className="text-xs font-semibold text-gray-900">tu_cuenta</p>
            <p className="text-[10px] text-gray-500">Buenos Aires, Argentina</p>
          </div>
        </div>
        <MoreHorizontal size={18} className="text-gray-500" />
      </div>

      {/* Imagen */}
      <div className="aspect-square bg-gray-100 relative overflow-hidden">
        {result.image_url ? (
          <img
            src={result.image_url}
            alt="Preview"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-100">
            <span className="text-5xl">🖼️</span>
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="px-3 pt-2.5 pb-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Heart size={22} className="text-gray-700" />
            <MessageCircle size={22} className="text-gray-700" />
            <Send size={20} className="text-gray-700" />
          </div>
          <Bookmark size={22} className="text-gray-700" />
        </div>
        <p className="text-xs font-semibold mt-1.5">1,234 Me gusta</p>
      </div>

      {/* Caption */}
      <div className="px-3 pb-3">
        <p className="text-xs leading-relaxed text-gray-800 line-clamp-4">
          <span className="font-semibold">tu_cuenta </span>
          {fullText}
        </p>
        <p className="text-[10px] text-gray-400 mt-1.5 uppercase tracking-wide">Hace 2 minutos</p>
      </div>
    </div>
  )
}

function FacebookPreview({ result }: { result: AIGenerationResult }) {
  const caption = result.caption || ''
  const hashtags = result.hashtags || []

  return (
    <div className="bg-white rounded-xl overflow-hidden text-gray-900 text-sm max-w-sm mx-auto shadow-xl shadow-black/20">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
          M
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">Mi Marca</p>
          <p className="text-[11px] text-gray-500 flex items-center gap-1">
            Hace 3 minutos · 🌐
          </p>
        </div>
        <MoreHorizontal size={18} className="text-gray-500" />
      </div>

      {/* Texto */}
      <div className="px-4 pb-3">
        <p className="text-sm text-gray-800 leading-relaxed line-clamp-5">{caption}</p>
        {hashtags.length > 0 && (
          <p className="text-sm text-blue-600 mt-1">
            {hashtags.slice(0, 5).map(h => `#${h}`).join(' ')}
          </p>
        )}
      </div>

      {/* Imagen */}
      <div className="relative overflow-hidden" style={{ aspectRatio: '1.91/1' }}>
        {result.image_url ? (
          <img src={result.image_url} alt="Preview" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-blue-50">
            <span className="text-5xl">🖼️</span>
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
        <button className="text-xs text-gray-500 flex items-center gap-1 hover:bg-gray-100 px-2 py-1 rounded">
          👍 Me gusta
        </button>
        <button className="text-xs text-gray-500 flex items-center gap-1 hover:bg-gray-100 px-2 py-1 rounded">
          💬 Comentar
        </button>
        <button className="text-xs text-gray-500 flex items-center gap-1 hover:bg-gray-100 px-2 py-1 rounded">
          ↗ Compartir
        </button>
      </div>
    </div>
  )
}
