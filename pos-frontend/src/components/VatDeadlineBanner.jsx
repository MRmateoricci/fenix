import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'

// Vencimientos no cambian de un minuto a otro — a diferencia del estado de
// AFIP (AfipStatusIndicator) no hace falta pollear cada 5 minutos, alcanza
// con revisar cada tanto mientras la pestaña sigue abierta.
const POLL_INTERVAL_MS = 30 * 60 * 1000

const dateLabel = iso => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function VatDeadlineBanner({ isAdmin }) {
  const [deadline, setDeadline] = useState(null)

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false

    async function check() {
      try {
        const result = await api.getUpcomingVatDeadline()
        if (!cancelled) setDeadline(result.deadline)
      } catch {
        if (!cancelled) setDeadline(null)
      }
    }

    check()
    const intervalId = setInterval(check, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [isAdmin])

  if (!isAdmin || !deadline) return null
  if (!deadline.overdue && !deadline.urgent) return null

  const period = `${String(deadline.month).padStart(2, '0')}/${deadline.year}`
  const className = deadline.overdue
    ? 'bg-red-600 text-white'
    : 'bg-amber-400 text-amber-950'

  const message = deadline.overdue
    ? `IVA de ${period} vencido el ${dateLabel(deadline.deadlineDate)} sin presentar`
    : `IVA de ${period} vence el ${dateLabel(deadline.deadlineDate)} (en ${deadline.daysRemaining} día${deadline.daysRemaining === 1 ? '' : 's'})`

  return (
    <Link
      to="/admin/panel-iva"
      className={`flex items-center justify-center gap-2 px-4 py-1.5 text-sm font-medium ${className}`}
    >
      {message} — ver panel fiscal
    </Link>
  )
}
