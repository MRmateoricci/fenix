'use client'

import { ChevronLeft, ChevronRight, Plus, Instagram, Facebook } from 'lucide-react'
import Link from 'next/link'
import type { Post } from '@/lib/types'
import { DAYS_ES, MONTHS_ES, getStatusConfig, cn } from '@/lib/utils'

interface Props {
  year: number
  month: number
  byDay: Record<string, Post[]>
  loading: boolean
  onChangeMonth: (year: number, month: number) => void
}

export function EditorialCalendar({ year, month, byDay, loading, onChangeMonth }: Props) {
  const today = new Date()
  const firstDay = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const blanks = Array(firstDay).fill(null)
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const prev = () => {
    if (month === 1) onChangeMonth(year - 1, 12)
    else onChangeMonth(year, month - 1)
  }
  const next = () => {
    if (month === 12) onChangeMonth(year + 1, 1)
    else onChangeMonth(year, month + 1)
  }

  const isToday = (d: number) =>
    d === today.getDate() && month === today.getMonth() + 1 && year === today.getFullYear()

  const isPast = (d: number) => {
    const date = new Date(year, month - 1, d)
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    return date < todayStart
  }

  const getDayKey = (d: number) =>
    `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  const totalByStatus = Object.values(byDay).flat().reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-4">
      {/* Controles del mes */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={prev} className="btn-ghost" style={{ padding: '6px' }}>
              <ChevronLeft size={16} />
            </button>
            <h2 style={{ fontSize: '16px', fontWeight: 500, color: '#F5F5F3' }}>
              {MONTHS_ES[month - 1]} {year}
            </h2>
            <button onClick={next} className="btn-ghost" style={{ padding: '6px' }}>
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => onChangeMonth(today.getFullYear(), today.getMonth() + 1)}
              style={{ fontSize: '12px', color: '#888780', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Hoy
            </button>
          </div>

          {/* Resumen del mes */}
          <div className="hidden sm:flex items-center gap-5">
            {[
              { key: 'published', label: 'Publicados', color: '#7cb87c' },
              { key: 'scheduled', label: 'Programados', color: '#888780' },
              { key: 'failed',    label: 'Fallidos',    color: '#b87c7c' },
            ].map(({ key, label, color }) => (
              <div key={key} style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '18px', fontWeight: 500, color, lineHeight: 1 }}>{totalByStatus[key] || 0}</p>
                <p style={{ fontSize: '11px', color: '#555552', marginTop: '2px' }}>{label}</p>
              </div>
            ))}
          </div>

          <Link href="/content" className="btn-primary" style={{ fontSize: '13px', padding: '6px 12px' }}>
            <Plus size={13} />
            Nueva
          </Link>
        </div>
      </div>

      {/* Grid del calendario */}
      <div className="card p-0 overflow-hidden">
        {/* Cabecera días */}
        <div className="grid grid-cols-7" style={{ borderBottom: '0.5px solid #2C2C2A' }}>
          {DAYS_ES.map(d => (
            <div key={d} style={{ padding: '10px 0', textAlign: 'center', fontSize: '11px', fontWeight: 500, color: '#444441', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Celdas */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '256px' }}>
            <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#2C2C2A', borderTopColor: '#E8E8E4' }} />
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {blanks.map((_, i) => (
              <div key={`b${i}`} style={{ minHeight: '100px', borderBottom: '0.5px solid #2C2C2A', borderRight: '0.5px solid #2C2C2A', backgroundColor: '#0D0D0C', opacity: 0.5 }} />
            ))}

            {days.map(d => {
              const key = getDayKey(d)
              const posts = byDay[key] || []
              const todayCell = isToday(d)
              const pastCell = isPast(d)

              return (
                <div
                  key={d}
                  style={{
                    minHeight: '100px',
                    borderBottom: '0.5px solid #2C2C2A',
                    borderRight: '0.5px solid #2C2C2A',
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    backgroundColor: todayCell ? 'rgba(232,232,228,0.03)' : 'transparent',
                  }}
                >
                  {/* Número del día */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{
                      width: '22px',
                      height: '22px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50%',
                      fontSize: '11px',
                      fontWeight: todayCell ? 500 : 400,
                      backgroundColor: todayCell ? '#E8E8E4' : 'transparent',
                      color: todayCell ? '#0D0D0C' : pastCell ? '#444441' : '#888780',
                    }}>
                      {d}
                    </span>
                    {!pastCell && (
                      <Link
                        href={`/content?date=${key}`}
                        style={{ width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', color: '#444441', textDecoration: 'none' }}
                      >
                        <Plus size={10} />
                      </Link>
                    )}
                  </div>

                  {/* Posts del día */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
                    {posts.slice(0, 3).map(post => (
                      <CalendarPostChip key={post.id} post={post} />
                    ))}
                    {posts.length > 3 && (
                      <p style={{ fontSize: '10px', color: '#555552', paddingLeft: '4px' }}>+{posts.length - 3} más</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Leyenda */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px', padding: '0 4px' }}>
        {[
          { status: 'published' as const, label: 'Publicado' },
          { status: 'scheduled' as const, label: 'Programado' },
          { status: 'draft'     as const, label: 'Borrador' },
          { status: 'failed'    as const, label: 'Fallido' },
        ].map(({ status, label }) => {
          const cfg = getStatusConfig(status)
          return (
            <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#555552' }}>
              <span className={cn('w-2 h-2 rounded-full', cfg.dot)} />
              {label}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CalendarPostChip({ post }: { post: Post }) {
  const cfg = getStatusConfig(post.status)
  const time = post.scheduled_at || post.published_at
  const timeStr = time ? new Date(time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '2px 6px',
      borderRadius: '4px',
      fontSize: '10px',
      fontWeight: 500,
      border: '0.5px solid',
      overflow: 'hidden',
      ...cfg.style,
    }}>
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', cfg.dot)} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {post.caption ? post.caption.slice(0, 20) : 'Sin caption'}
      </span>
      {timeStr && <span style={{ flexShrink: 0, opacity: 0.7 }}>{timeStr}</span>}
      <div style={{ flexShrink: 0, display: 'flex', gap: '2px' }}>
        {post.platforms?.includes('instagram') && <Instagram size={8} style={{ color: '#d4739a' }} />}
        {post.platforms?.includes('facebook') && <Facebook size={8} style={{ color: '#6a9fd8' }} />}
      </div>
    </div>
  )
}
