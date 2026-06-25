'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { analyticsApi } from '@/lib/api'
import { DAYS_ES, MONTHS_ES, cn } from '@/lib/utils'

export function MiniCalendar() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [markedDays, setMarkedDays] = useState<Set<number>>(new Set())

  useEffect(() => {
    analyticsApi.calendar(year, month).then(data => {
      const days = Object.keys(data.byDay).map(d => new Date(d).getDate())
      setMarkedDays(new Set(days))
    }).catch(() => {})
  }, [year, month])

  const firstDay = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const blanks = Array(firstDay).fill(null)
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const prev = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const next = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const isToday = (d: number) =>
    d === today.getDate() && month === today.getMonth() + 1 && year === today.getFullYear()

  return (
    <div className="card h-full">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 500, color: '#F5F5F3' }}>
          {MONTHS_ES[month - 1]} {year}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button onClick={prev} style={{ width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', color: '#888780', background: 'none', border: 'none', cursor: 'pointer' }}>
            <ChevronLeft size={13} />
          </button>
          <button onClick={next} style={{ width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', color: '#888780', background: 'none', border: 'none', cursor: 'pointer' }}>
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Días de la semana */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_ES.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 500, color: '#444441', padding: '4px 0' }}>{d}</div>
        ))}
      </div>

      {/* Días del mes */}
      <div className="grid grid-cols-7 gap-0.5">
        {blanks.map((_, i) => <div key={`b${i}`} />)}
        {days.map(d => (
          <button
            key={d}
            style={{
              aspectRatio: '1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
              fontSize: '11px',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              fontWeight: isToday(d) ? 500 : 400,
              backgroundColor: isToday(d) ? '#E8E8E4' : 'transparent',
              color: isToday(d) ? '#0D0D0C' : markedDays.has(d) ? '#F5F5F3' : '#555552',
              transition: 'background-color 0.1s',
            }}
          >
            {d}
            {markedDays.has(d) && !isToday(d) && (
              <span style={{ position: 'absolute', bottom: '2px', left: '50%', transform: 'translateX(-50%)', width: '3px', height: '3px', borderRadius: '50%', backgroundColor: '#E8E8E4' }} />
            )}
          </button>
        ))}
      </div>

      {/* Leyenda */}
      <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '0.5px solid #2C2C2A', display: 'flex', alignItems: 'center', gap: '16px', fontSize: '11px', color: '#555552' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#E8E8E4', display: 'inline-block' }} />
          Con publicaciones
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#E8E8E4', display: 'inline-block', opacity: 0.5 }} />
          Hoy
        </div>
      </div>
    </div>
  )
}
