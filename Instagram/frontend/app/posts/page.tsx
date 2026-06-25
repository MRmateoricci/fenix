'use client'

import { useState, useEffect, useCallback } from 'react'
import { postsApi } from '@/lib/api'
import type { Post, PostStatus } from '@/lib/types'
import { PostsTable } from '@/components/posts/PostsTable'
import { Filter, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const FILTERS: { value: PostStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'scheduled', label: 'Programadas' },
  { value: 'published', label: 'Publicadas' },
  { value: 'draft', label: 'Borradores' },
  { value: 'failed', label: 'Fallidas' },
]

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [filter, setFilter] = useState<PostStatus | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = filter !== 'all' ? { status: filter as PostStatus } : {}
      const data = await postsApi.list(params)
      setPosts(data.posts)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [filter, refreshKey])

  useEffect(() => { load() }, [load])

  return (
    <div className="animate-slide-up space-y-5">
      <div className="flex items-center justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Publicaciones</h1>
          <p className="page-subtitle">Gestioná todas tus publicaciones</p>
        </div>
        <Link href="/content" className="btn-primary text-sm">
          + Nueva
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={13} style={{ color: '#444441' }} />
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: filter === f.value ? 500 : 400,
              border: '0.5px solid',
              cursor: 'pointer',
              transition: 'all 0.1s',
              backgroundColor: filter === f.value ? '#E8E8E4' : 'transparent',
              color: filter === f.value ? '#0D0D0C' : '#888780',
              borderColor: filter === f.value ? '#E8E8E4' : '#2C2C2A',
            }}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="ml-auto btn-ghost py-1.5"
          title="Actualizar"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <PostsTable
        posts={posts}
        loading={loading}
        onRefresh={() => setRefreshKey(k => k + 1)}
      />
    </div>
  )
}
