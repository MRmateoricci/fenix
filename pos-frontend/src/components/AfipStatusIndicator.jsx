import { useEffect, useState } from 'react'
import { api } from '../services/api'

// Se consulta al montar y después cada 5 minutos — FEDummy no hace falta
// pedirlo más seguido que eso para un indicador de "¿está caído o no?".
const POLL_INTERVAL_MS = 5 * 60 * 1000

const STATUS_STYLES = {
  ok: { label: 'AFIP ✓', className: 'bg-emerald-100 text-emerald-700' },
  down: { label: 'AFIP ✗', className: 'bg-red-100 text-red-700' },
  not_configured: { label: 'AFIP no configurado', className: 'bg-slate-200 text-slate-500' },
  checking: { label: 'AFIP…', className: 'bg-slate-100 text-slate-400' },
}

export default function AfipStatusIndicator() {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const result = await api.checkAfipStatus()
        if (!cancelled) setStatus(result.status)
      } catch {
        if (!cancelled) setStatus('down')
      }
    }

    check()
    const intervalId = setInterval(check, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [])

  const style = STATUS_STYLES[status] || STATUS_STYLES.checking
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}>
      {style.label}
    </span>
  )
}
