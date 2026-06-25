import { Send, Clock, CheckCircle2, XCircle, FileText } from 'lucide-react'

interface Props {
  stats?: {
    total: number
    scheduled: number
    published: number
    failed: number
    drafts: number
  }
}

const cards = [
  { key: 'scheduled' as const, label: 'Programadas', icon: Clock },
  { key: 'published' as const, label: 'Publicadas',  icon: CheckCircle2 },
  { key: 'failed'    as const, label: 'Fallidas',    icon: XCircle },
  { key: 'drafts'   as const, label: 'Borradores',  icon: FileText },
]

const cardStyle: React.CSSProperties = {
  backgroundColor: '#1C1C1A',
  border: '0.5px solid #2C2C2A',
  borderRadius: '12px',
  padding: '16px',
}

export function StatsGrid({ stats }: Props) {
  const total = stats?.total ?? 0

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {/* Total */}
      <div style={{ ...cardStyle, gridColumn: 'span 2 / span 2' }} className="lg:col-span-1">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: '11px', fontWeight: 500, color: '#444441', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Total</p>
            <p style={{ fontSize: '36px', fontWeight: 500, color: '#F5F5F3', lineHeight: 1 }}>{total}</p>
            <p style={{ fontSize: '11px', color: '#555552', marginTop: '6px' }}>publicaciones creadas</p>
          </div>
          <div style={{ width: '34px', height: '34px', borderRadius: '8px', backgroundColor: '#2C2C2A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Send size={15} style={{ color: '#444441' }} />
          </div>
        </div>
      </div>

      {/* Cards individuales */}
      {cards.map(({ key, label, icon: Icon }) => (
        <div key={key} style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '11px', fontWeight: 500, color: '#444441', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{label}</p>
              <p style={{ fontSize: '30px', fontWeight: 500, color: '#F5F5F3', lineHeight: 1 }}>{stats?.[key] ?? 0}</p>
            </div>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#2C2C2A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={14} style={{ color: '#444441' }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
