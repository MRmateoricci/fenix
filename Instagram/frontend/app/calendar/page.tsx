'use client'

import { useState, useEffect } from 'react'
import { analyticsApi } from '@/lib/api'
import type { Post } from '@/lib/types'
import { EditorialCalendar } from '@/components/calendar/EditorialCalendar'

export default function CalendarPage() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [byDay, setByDay] = useState<Record<string, Post[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    analyticsApi.calendar(year, month)
      .then(data => setByDay(data.byDay))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [year, month])

  return (
    <div className="animate-slide-up">
      <div className="page-header">
        <h1 className="page-title">Calendario Editorial</h1>
        <p className="page-subtitle">Planificá y organizá tus publicaciones del mes</p>
      </div>

      <EditorialCalendar
        year={year}
        month={month}
        byDay={byDay}
        loading={loading}
        onChangeMonth={(y, m) => { setYear(y); setMonth(m) }}
      />
    </div>
  )
}
