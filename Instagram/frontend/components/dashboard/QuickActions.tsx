import Link from 'next/link'
import { Sparkles, CalendarDays, Clock, TrendingUp } from 'lucide-react'

const actions = [
  { href: '/content',  icon: Sparkles,    label: 'Crear con IA',     desc: 'Genera imagen + caption' },
  { href: '/calendar', icon: CalendarDays, label: 'Ver Calendario',   desc: 'Planificá el mes' },
  { href: '/posts',    icon: Clock,        label: 'Programadas',      desc: 'Revisar próximas' },
  { href: '/accounts', icon: TrendingUp,   label: 'Horarios óptimos', desc: 'Mejor momento para publicar' },
]

const cardStyle: React.CSSProperties = {
  display: 'block',
  backgroundColor: '#1C1C1A',
  border: '0.5px solid #2C2C2A',
  borderRadius: '12px',
  padding: '16px',
  textDecoration: 'none',
  transition: 'border-color 0.15s',
}

export function QuickActions() {
  return (
    <div>
      <p style={{ fontSize: '11px', fontWeight: 500, color: '#444441', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
        Acciones rápidas
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {actions.map(({ href, icon: Icon, label, desc }) => (
          <Link
            key={href}
            href={href}
            style={cardStyle}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#3C3C3A')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#2C2C2A')}
          >
            <Icon size={18} style={{ color: '#888780', marginBottom: '10px' }} />
            <p style={{ fontSize: '13px', fontWeight: 500, color: '#F5F5F3' }}>{label}</p>
            <p style={{ fontSize: '11px', color: '#888780', marginTop: '3px' }}>{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
