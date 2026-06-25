'use client'

import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'

interface Props {
  data: Array<{ date: string; count: number }>
}

export function WeeklyChart({ data }: Props) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i)
    const dateStr = format(date, 'yyyy-MM-dd')
    const entry = data.find(d => d.date === dateStr)
    return {
      date: dateStr,
      label: format(date, 'EEE', { locale: es }),
      count: entry?.count ?? 0,
    }
  })

  const maxCount = Math.max(...days.map(d => d.count), 1)

  return (
    <div className="card h-full">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h3 style={{ fontSize: '13px', fontWeight: 500, color: '#F5F5F3' }}>Publicaciones esta semana</h3>
          <p style={{ fontSize: '11px', color: '#555552', marginTop: '2px' }}>
            Total: {days.reduce((s, d) => s + d.count, 0)} posts
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#E8E8E4' }} />
          <span style={{ fontSize: '11px', color: '#555552' }}>Publicadas</span>
        </div>
      </div>

      {/* Gráfico de barras */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '140px' }}>
        {days.map((day) => {
          const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0
          return (
            <div key={day.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              {/* Valor */}
              <span style={{ fontSize: '11px', fontWeight: 500, color: '#888780', opacity: day.count > 0 ? 1 : 0 }}>
                {day.count}
              </span>
              {/* Barra */}
              <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', height: '90px' }}>
                <div
                  style={{
                    width: '100%',
                    maxWidth: '28px',
                    borderRadius: '4px 4px 0 0',
                    backgroundColor: '#E8E8E4',
                    height: `${Math.max(3, height)}%`,
                    transition: 'height 0.3s ease',
                    opacity: day.count > 0 ? 1 : 0.12,
                  }}
                />
              </div>
              {/* Día */}
              <span style={{ fontSize: '11px', color: '#444441', textTransform: 'capitalize' }}>{day.label}</span>
            </div>
          )
        })}
      </div>

      {/* Línea base */}
      <div style={{ marginTop: '8px', height: '0.5px', backgroundColor: '#2C2C2A' }} />
    </div>
  )
}
