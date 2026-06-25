'use client'

import { useEffect, useState } from 'react'
import { analyticsApi, postsApi } from '@/lib/api'
import type { DashboardStats, Post } from '@/lib/types'
import { StatsGrid } from '@/components/dashboard/StatsGrid'
import { MiniCalendar } from '@/components/dashboard/MiniCalendar'
import { UpcomingPosts } from '@/components/dashboard/UpcomingPosts'
import { WeeklyChart } from '@/components/dashboard/WeeklyChart'
import { QuickActions } from '@/components/dashboard/QuickActions'

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [scheduledPosts, setScheduledPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [statsData, postsData] = await Promise.all([
          analyticsApi.stats(),
          postsApi.list({ status: 'scheduled', limit: 5 }),
        ])
        setStats(statsData)
        setScheduledPosts(postsData.posts)
      } catch (err) {
        console.error('Error cargando dashboard:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Cargando dashboard...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Acciones rápidas */}
      <QuickActions />

      {/* Estadísticas principales */}
      <StatsGrid stats={stats?.overview} />

      {/* Fila media: gráfico + calendario */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <WeeklyChart data={stats?.last7Days || []} />
        </div>
        <div>
          <MiniCalendar />
        </div>
      </div>

      {/* Próximas publicaciones */}
      <UpcomingPosts posts={scheduledPosts} />
    </div>
  )
}
