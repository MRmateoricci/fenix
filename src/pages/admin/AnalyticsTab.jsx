import { useCallback, useEffect, useMemo, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || ''

const C = {
  white: '#FFFFFF', ink: '#111827', text2: '#374151', text3: '#4B5563',
  muted: '#6B7280', border: '#DDE3EA', hairline: '#ECEFF3', soft: '#F7F8FA',
  red: '#CC0000', redLight: '#FDECEC', green: '#1A7A3D',
}

const RANGES = [
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
  { days: 90, label: '90 días' },
]

async function fetchSummary(days) {
  const res = await fetch(`${API_BASE}/api/analytics/summary?days=${days}`, {
    credentials: 'include',
  })
  if (res.status === 401) window.dispatchEvent(new Event('fenix-admin-unauthorized'))
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'No se pudo cargar el resumen de visitas')
  }
  return res.json()
}

const nf = new Intl.NumberFormat('es-AR')

// El backend manda 'YYYY-MM-DD'. Se parsea como fecha local para que la
// etiqueta del gráfico no se corra un día en zonas horarias detrás de UTC.
function parseDay(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const fmtDay = (iso) => parseDay(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
const fmtDayLong = (iso) => parseDay(iso).toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' })

function MetricCard({ label, value, detail, highlight }) {
  return (
    <div style={{
      background: highlight ? C.red : C.white,
      color: highlight ? '#fff' : C.ink,
      border: `1px solid ${highlight ? C.red : C.border}`,
      borderRadius: 10, padding: 16, minHeight: 104,
      boxShadow: '0 3px 14px rgba(15,23,42,.04)',
    }}>
      <div style={{ fontSize: 11, color: highlight ? 'rgba(255,255,255,.82)' : C.text3 }}>{label}</div>
      <strong style={{ display: 'block', margin: '10px 0 6px', fontSize: 26, letterSpacing: '-.025em' }}>
        {value}
      </strong>
      <div style={{ fontSize: 10.5, color: highlight ? 'rgba(255,255,255,.82)' : C.muted }}>{detail}</div>
    </div>
  )
}

function BarChart({ daily }) {
  const max = Math.max(...daily.map((d) => d.views), 1)
  // Con muchas barras se afinan y se sacan los redondeos para que no se pisen.
  const gap = daily.length > 45 ? 1 : daily.length > 20 ? 2 : 4

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap, height: 180,
        borderBottom: `1px solid ${C.hairline}`, padding: '0 2px',
      }}>
        {daily.map((day) => (
          <div
            key={day.date}
            title={`${fmtDayLong(day.date)}\n${nf.format(day.views)} visitas · ${nf.format(day.visitors)} personas`}
            style={{
              flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
              justifyContent: 'flex-end', alignItems: 'stretch', height: '100%',
            }}
          >
            <div style={{
              height: `${(day.views / max) * 100}%`,
              minHeight: day.views > 0 ? 2 : 0,
              background: C.red, borderRadius: gap > 1 ? '3px 3px 0 0' : 0,
              opacity: 0.88,
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, color: C.muted, fontSize: 10 }}>
        <span>{fmtDay(daily[0]?.date || '')}</span>
        {daily.length > 2 && <span>{fmtDay(daily[Math.floor(daily.length / 2)]?.date || '')}</span>}
        <span>{fmtDay(daily[daily.length - 1]?.date || '')}</span>
      </div>
    </div>
  )
}

function RankBars({ rows, labelKey, valueKey, valueSuffix, subLabelKey }) {
  const max = Math.max(...rows.map((r) => r[valueKey]), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map((row) => {
        const sub = subLabelKey && row[subLabelKey] && row[subLabelKey] !== row[labelKey]
          ? row[subLabelKey]
          : null
        return (
          <div key={row.path || row[labelKey]}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6, fontSize: 11.5 }}>
              <span style={{ minWidth: 0 }}>
                <span
                  title={sub ? `${row[labelKey]}\n${sub}` : row[labelKey]}
                  style={{
                    display: 'block', color: C.text2,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {row[labelKey]}
                </span>
                {sub && (
                  <span style={{
                    display: 'block', color: C.muted, fontSize: 10, marginTop: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {sub}
                  </span>
                )}
              </span>
              <strong style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                {nf.format(row[valueKey])}{valueSuffix ? ` ${valueSuffix}` : ''}
              </strong>
            </div>
            <div style={{ height: 8, background: C.hairline, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{
                width: `${(row[valueKey] / max) * 100}%`, height: '100%',
                background: `linear-gradient(90deg, ${C.red}, #E15B46)`, borderRadius: 10,
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

const panel = {
  background: C.white, border: `1px solid ${C.border}`, borderRadius: 10,
  padding: 18, boxShadow: '0 3px 14px rgba(15,23,42,.04)',
}
const panelTitle = { margin: '0 0 4px', font: '600 14px/1.2 var(--font-sans)', color: C.ink }
const panelSub = { margin: '0 0 16px', color: C.muted, fontSize: 11 }

export default function AnalyticsTab() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback((range) => {
    setLoading(true)
    fetchSummary(range)
      .then((summary) => { setData(summary); setError('') })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(days) }, [days, load])

  const rangeLabel = useMemo(
    () => RANGES.find((r) => r.days === days)?.label || `${days} días`,
    [days],
  )

  return (
    <div style={{ color: C.ink, fontFamily: 'var(--font-sans)' }}>
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap', marginBottom: 18,
      }}>
        <div>
          <p style={{
            margin: '0 0 3px', color: C.text3, fontSize: 11, textTransform: 'uppercase',
            letterSpacing: '.09em', fontWeight: 600,
          }}>
            Visitas a la tienda
          </p>
          <h2 style={{ margin: 0, font: '500 21px/1.15 var(--font-sans)' }}>Últimos {rangeLabel}</h2>
        </div>
        <div style={{ display: 'flex', gap: 6 }} role="group" aria-label="Período">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              style={{
                padding: '7px 12px', borderRadius: 7, fontSize: 11.5, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${days === r.days ? C.red : C.border}`,
                background: days === r.days ? C.redLight : C.white,
                color: days === r.days ? C.red : C.text2,
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" style={{
          background: C.white, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.red}`,
          borderRadius: 8, padding: '11px 14px', marginBottom: 16, color: C.ink, fontSize: 13,
        }}>
          {error}
          <button
            type="button"
            onClick={() => load(days)}
            style={{
              marginLeft: 12, border: 'none', background: 'none', color: C.red,
              fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
            }}
          >
            Reintentar
          </button>
        </div>
      )}

      {loading && !data ? (
        <div style={{ padding: '48px 20px', textAlign: 'center', color: C.muted, fontSize: 14 }}>
          Cargando visitas…
        </div>
      ) : data ? (
        <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12, marginBottom: 14,
          }}>
            <MetricCard
              label="Personas hoy"
              value={nf.format(data.today.visitors)}
              detail={`${nf.format(data.today.views)} páginas vistas hoy`}
              highlight
            />
            <MetricCard
              label={`Personas por día · prom. ${rangeLabel}`}
              value={nf.format(data.range.visitorsPerDay)}
              detail="Visitantes distintos por jornada"
            />
            <MetricCard
              label={`Visitas por día · prom. ${rangeLabel}`}
              value={nf.format(data.range.viewsPerDay)}
              detail="Páginas abiertas por jornada"
            />
            <MetricCard
              label={`Visitas totales · ${rangeLabel}`}
              value={nf.format(data.range.views)}
              detail="Suma de páginas vistas del período"
            />
          </div>

          <div style={{ ...panel, marginBottom: 14 }}>
            <h3 style={panelTitle}>Visitas por día</h3>
            <p style={panelSub}>
              Cada barra es un día. Pasá el mouse para ver el detalle.
            </p>
            <BarChart daily={data.daily} />
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14,
          }}>
            <div style={panel}>
              <h3 style={panelTitle}>Páginas más vistas</h3>
              <p style={panelSub}>En los últimos {rangeLabel}</p>
              {data.topPages.length ? (
                <RankBars rows={data.topPages} labelKey="label" valueKey="views" valueSuffix="visitas" subLabelKey="path" />
              ) : (
                <p style={{ color: C.muted, fontSize: 12 }}>Todavía no hay visitas registradas.</p>
              )}
            </div>

            <div style={panel}>
              <h3 style={panelTitle}>De dónde llega la gente</h3>
              <p style={panelSub}>Personas por origen · “Directo” = escribió la dirección o entró por un favorito</p>
              {data.topReferrers.length ? (
                <RankBars rows={data.topReferrers} labelKey="source" valueKey="visitors" valueSuffix="personas" />
              ) : (
                <p style={{ color: C.muted, fontSize: 12 }}>Todavía no hay datos de origen.</p>
              )}
            </div>
          </div>

          <p style={{ margin: '16px 2px 0', color: C.muted, fontSize: 10.5, lineHeight: 1.5 }}>
            No se guarda ninguna dirección IP ni dato personal. “Personas” cuenta visitantes
            distintos por día de forma anónima; el tráfico de buscadores y bots se descarta.
            Los datos se conservan {data.retentionDays} días.
          </p>
        </div>
      ) : null}
    </div>
  )
}
