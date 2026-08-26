import { useEffect, useMemo, useState } from 'react'
import { useAdmin } from '../../context/AdminContext'

const C = {
  white: '#FFFFFF', paper: '#FFFFFF', ink: '#111827', text2: '#374151',
  text3: '#4B5563', muted: '#6B7280', border: '#DDE3EA', hairline: '#ECEFF3',
  red: '#CC0000', redLight: '#FDECEC', amber: '#E0A24A', amberLight: '#FFF7E6',
  amberDark: '#B8821A', green: '#1A7A3D', greenLight: '#EAF7EF', blue: '#CC0000',
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const ACTIVE_STATUSES = ['paid', 'preparing', 'shipped']
const PAID_STATUSES = [...ACTIVE_STATUSES, 'delivered']
const STATUS_LABEL = {
  pending_payment: 'Pago pendiente', reserved: 'Reservado', paid: 'Pagado',
  preparing: 'Preparando', shipped: 'En camino', delivered: 'Entregado',
  cancelled: 'Cancelado', payment_failed: 'Pago rechazado', expired: 'Vencido',
}
const STATUS_STYLE = {
  pending_payment: { bg: C.amberLight, color: C.amberDark },
  reserved: { bg: C.amberLight, color: C.amberDark },
  paid: { bg: C.greenLight, color: C.green },
  preparing: { bg: C.redLight, color: C.red },
  shipped: { bg: C.redLight, color: C.red },
  delivered: { bg: C.greenLight, color: '#14532D' },
  cancelled: { bg: C.redLight, color: C.red },
  payment_failed: { bg: C.redLight, color: C.red },
  expired: { bg: C.redLight, color: C.red },
}

const fmt = (number) => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
}).format(Number(number) || 0)

const fmtShortDate = (date) => new Date(date).toLocaleDateString('es-AR', {
  day: '2-digit', month: 'short',
})

function inPeriod(date, mode, year, month) {
  if (!date) return false
  if (mode === 'all') return true
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime()) || parsed.getFullYear() !== year) return false
  return mode === 'year' || parsed.getMonth() === month
}

function getSaleDate(order) {
  if (order.paid_at) return order.paid_at
  return PAID_STATUSES.includes(order.status) ? (order.updated_at || order.created_at) : null
}

function getPreviousPeriod(mode, year, month) {
  if (mode === 'month') {
    const previous = new Date(year, month - 1, 1)
    return { year: previous.getFullYear(), month: previous.getMonth() }
  }
  if (mode === 'year') return { year: year - 1, month }
  return null
}

function percentageChange(current, previous) {
  if (!previous) return null
  return ((current - previous) / previous) * 100
}

function computeTopProducts(sales, limit = 6) {
  const products = new Map()
  sales.forEach((order) => {
    ;(order.items || []).forEach((item) => {
      const key = item.id || item.name
      const current = products.get(key) || { name: item.name, category: item.category || 'Sin categoría', units: 0, revenue: 0 }
      current.units += Number(item.quantity) || 0
      current.revenue += (Number(item.price) || 0) * (Number(item.quantity) || 0)
      products.set(key, current)
    })
  })
  return [...products.values()].sort((a, b) => b.units - a.units).slice(0, limit)
}

function Panel({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`adm-overview-panel ${className}`}>
      <div className="adm-panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function MetricIcon({ type }) {
  const paths = {
    revenue: <><path d="M12 3v18M16.5 7H9.8a3.3 3.3 0 0 0 0 6.6h4.4a3.3 3.3 0 0 1 0 6.6H7" /></>,
    orders: <><path d="M6 7h12l-1 13H7L6 7Z" /><path d="M9 7a3 3 0 0 1 6 0" /></>,
    ticket: <><path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h5" /></>,
    pending: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[type]}</svg>
}

function MetricCard({ label, value, detail, trend, type, tone, onClick }) {
  const trendPositive = trend != null && trend >= 0
  const Component = onClick ? 'button' : 'div'
  return (
    <Component
      className={`adm-metric-card${onClick ? ' adm-metric-card--clickable' : ''}`}
      style={{ '--metric-tone': tone }}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
    >
      <div className="adm-metric-top">
        <span>{label}</span>
        <span className="adm-metric-icon"><MetricIcon type={type} /></span>
      </div>
      <strong>{value}</strong>
      <div className="adm-metric-detail">
        {trend == null ? detail : (
          <><span style={{ color: trendPositive ? C.green : C.red }}>{trendPositive ? '↗' : '↘'} {Math.abs(trend).toFixed(1)}%</span> vs. mes anterior</>
        )}
      </div>
    </Component>
  )
}

function StatusBadge({ status }) {
  const style = STATUS_STYLE[status] || { bg: '#F3F4F6', color: C.text3 }
  return <span className="adm-status" style={{ background: style.bg, color: style.color }}>{STATUS_LABEL[status] || status}</span>
}

export default function OverviewDashboard({ products, onNavigate }) {
  const { orders, fetchOrders } = useAdmin()
  const [currentDate] = useState(() => new Date())
  const [periodMode, setPeriodMode] = useState('month')
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth())

  useEffect(() => { fetchOrders({ all: true }) }, [fetchOrders])

  const availableYears = useMemo(() => {
    const years = new Set([currentDate.getFullYear()])
    orders.forEach((order) => {
      ;[order.created_at, getSaleDate(order)].forEach((date) => {
        if (!date) return
        const year = new Date(date).getFullYear()
        if (Number.isFinite(year)) years.add(year)
      })
    })
    return [...years].sort((a, b) => b - a)
  }, [orders, currentDate])

  const data = useMemo(() => {
    const previousPeriod = getPreviousPeriod(periodMode, selectedYear, selectedMonth)
    const periodSales = orders.filter((order) => inPeriod(getSaleDate(order), periodMode, selectedYear, selectedMonth))
    const previousSales = previousPeriod
      ? orders.filter((order) => inPeriod(getSaleDate(order), periodMode, previousPeriod.year, previousPeriod.month))
      : []
    const periodOrders = orders.filter((order) => inPeriod(order.created_at, periodMode, selectedYear, selectedMonth))
    const revenue = periodSales.reduce((sum, order) => sum + Number(order.total_amount || 0), 0)
    const previousRevenue = previousSales.reduce((sum, order) => sum + Number(order.total_amount || 0), 0)
    const averageTicket = periodSales.length ? revenue / periodSales.length : 0
    const previousAverage = previousSales.length ? previousRevenue / previousSales.length : 0
    const ordersToShip = orders.filter((order) =>
      order.delivery_type === 'delivery' && ACTIVE_STATUSES.includes(order.status)
    )
    const pickupsToManage = orders.filter((order) =>
      order.delivery_type === 'pickup'
      && ['reserved', ...ACTIVE_STATUSES].includes(order.status)
    )
    // Ya no se cuentan unidades. Lo único accionable del catálogo es cuánto
    // está publicado sin poder despacharse enseguida: no es un error, pero le
    // dice al dueño cuánto de su vidriera depende del proveedor.
    const aReposicion = products.filter((product) => !product.stockInmediato)
    let chartValues
    let chartLabels
    if (periodMode === 'month') {
      const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate()
      chartValues = Array.from({ length: daysInMonth }, () => 0)
      periodSales.forEach((order) => {
        chartValues[new Date(getSaleDate(order)).getDate() - 1] += Number(order.total_amount || 0)
      })
      chartLabels = ['Día 1', 'Día 8', 'Día 15', 'Día 22', 'Fin de mes']
    } else if (periodMode === 'year') {
      chartValues = Array.from({ length: 12 }, () => 0)
      periodSales.forEach((order) => {
        chartValues[new Date(getSaleDate(order)).getMonth()] += Number(order.total_amount || 0)
      })
      chartLabels = ['Ene', 'Mar', 'May', 'Jul', 'Sep', 'Nov', 'Dic']
    } else {
      const firstYear = Math.min(...availableYears)
      chartValues = availableYears.slice().sort((a, b) => a - b).map((year) =>
        periodSales
          .filter((order) => new Date(getSaleDate(order)).getFullYear() === year)
          .reduce((sum, order) => sum + Number(order.total_amount || 0), 0)
      )
      chartLabels = availableYears.slice().sort((a, b) => a - b).map(String)
      if (!chartValues.length) {
        chartValues = [0]
        chartLabels = [String(firstYear)]
      }
    }

    const categoryMap = new Map()
    periodSales.forEach((order) => {
      ;(order.items || []).forEach((item) => {
        const category = item.category || 'Sin categoría'
        categoryMap.set(category, (categoryMap.get(category) || 0) + (Number(item.price) || 0) * (Number(item.quantity) || 0))
      })
    })

    const statusGroups = [
      { label: 'Entregados', color: C.green, count: periodOrders.filter((order) => order.status === 'delivered').length },
      { label: 'En preparación', color: C.blue, count: periodOrders.filter((order) => ACTIVE_STATUSES.includes(order.status)).length },
      { label: 'Pendientes', color: C.amber, count: periodOrders.filter((order) => ['pending_payment', 'reserved'].includes(order.status)).length },
      { label: 'Cancelados', color: C.red, count: periodOrders.filter((order) => ['cancelled', 'payment_failed', 'expired'].includes(order.status)).length },
    ]

    return {
      periodSales, periodOrders, revenue, averageTicket, ordersToShip, pickupsToManage,
      aReposicion, chartValues, chartLabels, statusGroups,
      revenueTrend: percentageChange(revenue, previousRevenue),
      ordersTrend: percentageChange(periodSales.length, previousSales.length),
      ticketTrend: percentageChange(averageTicket, previousAverage),
      topProducts: computeTopProducts(periodSales),
      categorySales: [...categoryMap.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5),
      recentOrders: [...periodOrders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6),
    }
  }, [orders, products, periodMode, selectedYear, selectedMonth, availableYears])

  const chartWidth = 900
  const chartHeight = 230
  const chartPad = 18
  const maxDaily = Math.max(...data.chartValues, 1)
  const chartPoints = data.chartValues.map((value, index) => ({
    x: chartPad + (index / Math.max(data.chartValues.length - 1, 1)) * (chartWidth - chartPad * 2),
    y: chartHeight - chartPad - (value / maxDaily) * (chartHeight - chartPad * 2),
  }))
  const linePath = chartPoints.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
  const areaPath = `${linePath} L ${chartWidth - chartPad} ${chartHeight - chartPad} L ${chartPad} ${chartHeight - chartPad} Z`
  const statusTotal = data.statusGroups.reduce((sum, group) => sum + group.count, 0)
  let angle = 0
  const donutGradient = statusTotal
    ? `conic-gradient(${data.statusGroups.map((group) => {
        const start = angle
        angle += (group.count / statusTotal) * 360
        return `${group.color} ${start}deg ${angle}deg`
      }).join(', ')})`
    : `conic-gradient(${C.hairline} 0deg 360deg)`
  const maxCategory = Math.max(...data.categorySales.map((item) => item.amount), 1)
  const periodLabel = periodMode === 'month'
    ? `${MONTHS[selectedMonth]} ${selectedYear}`
    : periodMode === 'year' ? `Año ${selectedYear}` : 'Todo el tiempo'
  const comparisonDetail = periodMode === 'all' ? 'Acumulado histórico' : 'Sin comparación anterior'
  const salesChartSubtitle = periodMode === 'month'
    ? `Facturación diaria de ${periodLabel}`
    : periodMode === 'year' ? `Facturación mensual de ${selectedYear}` : 'Facturación anual histórica'

  return (
    <div className="adm-overview">
      <div className="adm-overview-intro">
        <div>
          <p>Rendimiento de la tienda</p>
          <h2>{periodLabel}</h2>
        </div>
        <div className="adm-period-controls" aria-label="Período del resumen">
          <label>
            <span>Período</span>
            <select value={periodMode} onChange={(event) => setPeriodMode(event.target.value)}>
              <option value="month">Mes</option>
              <option value="year">Año</option>
              <option value="all">Todo el tiempo</option>
            </select>
          </label>
          {periodMode === 'month' && (
            <label>
              <span>Mes</span>
              <select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>
                {MONTHS.map((month, index) => <option value={index} key={month}>{month}</option>)}
              </select>
            </label>
          )}
          {periodMode !== 'all' && (
            <label>
              <span>Año</span>
              <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
                {availableYears.map((year) => <option value={year} key={year}>{year}</option>)}
              </select>
            </label>
          )}
        </div>
      </div>

      <div className="adm-metric-grid">
        <MetricCard label="Facturación del período" value={fmt(data.revenue)} trend={periodMode === 'all' ? null : data.revenueTrend} detail={comparisonDetail} type="revenue" tone={C.red} />
        <MetricCard label="Pedidos pagados" value={data.periodSales.length} trend={periodMode === 'all' ? null : data.ordersTrend} detail={periodMode === 'all' ? comparisonDetail : 'Pedidos confirmados en el período'} type="orders" tone={C.green} />
        <MetricCard label="Ticket promedio" value={fmt(data.averageTicket)} trend={periodMode === 'all' ? null : data.ticketTrend} detail={periodMode === 'all' ? comparisonDetail : 'Promedio por pedido pagado'} type="ticket" tone={C.amber} />
        <MetricCard
          label="Requieren gestión"
          value={data.ordersToShip.length + data.pickupsToManage.length}
          detail={`${data.ordersToShip.length} para enviar y ${data.pickupsToManage.length} retiros`}
          type="pending"
          tone={C.blue}
          onClick={() => onNavigate('orders')}
        />
      </div>

      <div className="adm-overview-grid adm-overview-grid--wide">
        <Panel title="Evolución de ventas" subtitle={salesChartSubtitle} action={<span className="adm-panel-summary">Pico: {fmt(maxDaily === 1 ? 0 : maxDaily)}</span>}>
          <div className="adm-sales-chart">
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" role="img" aria-label={salesChartSubtitle}>
              {[0.25, 0.5, 0.75, 1].map((part) => <line key={part} x1={chartPad} x2={chartWidth - chartPad} y1={chartHeight - chartPad - part * (chartHeight - chartPad * 2)} y2={chartHeight - chartPad - part * (chartHeight - chartPad * 2)} />)}
              <path d={areaPath} className="adm-chart-area" />
              <path d={linePath} className="adm-chart-line" />
            </svg>
            <div className="adm-chart-labels">{data.chartLabels.map((label) => <span key={label}>{label}</span>)}</div>
          </div>
        </Panel>

        <Panel title="Estado de pedidos" subtitle={`Pedidos creados en ${periodLabel.toLowerCase()}`}>
          <div className="adm-status-layout">
            <div className="adm-donut" style={{ background: donutGradient }}><div><strong>{statusTotal}</strong><span>pedidos</span></div></div>
            <div className="adm-status-list">
              {data.statusGroups.map((group) => (
                <div key={group.label}><span className="adm-status-dot" style={{ background: group.color }} /><span>{group.label}</span><strong>{group.count}</strong></div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <div className="adm-overview-grid adm-overview-grid--wide">
        <Panel title="Productos más vendidos" subtitle="Ranking por unidades vendidas en el período" action={<button className="adm-link-btn" onClick={() => onNavigate('products')}>Ver productos →</button>}>
          {data.topProducts.length ? (
            <div className="adm-top-products">
              <div className="adm-table-head"><span>#</span><span>Producto</span><span>Vendidos</span><span>Facturación</span></div>
              {data.topProducts.map((product, index) => (
                <div className="adm-product-row" key={`${product.name}-${index}`}>
                  <span>{index + 1}</span><div><strong>{product.name}</strong><small>{product.category}</small></div><b>{product.units}</b><b>{fmt(product.revenue)}</b>
                </div>
              ))}
            </div>
          ) : <EmptyState text="No hay ventas pagadas en el período seleccionado." />}
        </Panel>

        <Panel title="Ventas por categoría" subtitle="Facturación de productos del período">
          {data.categorySales.length ? (
            <div className="adm-category-bars">
              {data.categorySales.map((item) => (
                <div key={item.category}><div><span>{item.category}</span><strong>{fmt(item.amount)}</strong></div><i><b style={{ width: `${(item.amount / maxCategory) * 100}%` }} /></i></div>
              ))}
            </div>
          ) : <EmptyState text="Sin ventas para comparar categorías." />}
        </Panel>
      </div>

      <div className="adm-overview-grid adm-overview-grid--wide">
        <Panel title="Pedidos recientes" subtitle="Últimas operaciones registradas" action={<button className="adm-link-btn" onClick={() => onNavigate('orders')}>Ver pedidos →</button>}>
          {data.recentOrders.length ? (
            <div className="adm-recent-orders">
              <div className="adm-order-head"><span>Cliente</span><span>Total</span><span>Estado</span><span>Fecha</span></div>
              {data.recentOrders.map((order) => (
                <div className="adm-order-row" key={order.id}>
                  <div><strong>{order.customer_name}</strong><small>#{order.order_number}</small></div><b>{fmt(order.total_amount)}</b><StatusBadge status={order.status} /><span>{fmtShortDate(order.created_at)}</span>
                </div>
              ))}
            </div>
          ) : <EmptyState text="Todavía no hay pedidos registrados." />}
        </Panel>

        <Panel title="Atención requerida" subtitle="Pendientes operativos y disponibilidad">
          <div className="adm-attention-list">
            <AttentionItem label="Pedidos a enviar" value={data.ordersToShip.length} tone={C.blue} onClick={() => onNavigate('orders')} />
            <AttentionItem label="Retiros en el local" value={data.pickupsToManage.length} tone={C.amber} onClick={() => onNavigate('orders')} />
            <AttentionItem label="Productos a reposición" value={data.aReposicion.length} tone={C.amberDark} onClick={() => onNavigate('products')} />
          </div>
        </Panel>
      </div>

      <style>{`
        .adm-overview { color:${C.ink}; font-family:var(--font-sans); font-weight:400; }
        .adm-overview button,.adm-overview input,.adm-overview select { font-family:inherit; }
        .adm-overview-intro { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; margin:-8px 0 18px; }
        .adm-overview-intro p { margin:0 0 3px; color:${C.text3}; font-size:11px; text-transform:uppercase; letter-spacing:.09em; font-weight:600; }
        .adm-overview-intro h2 { margin:0; font:500 21px/1.15 var(--font-sans); }
        .adm-period-controls { display:flex; align-items:flex-end; justify-content:flex-end; gap:8px; flex-wrap:wrap; }
        .adm-period-controls label { display:flex; flex-direction:column; gap:4px; color:${C.muted}; font-size:9px; text-transform:uppercase; letter-spacing:.06em; font-weight:600; }
        .adm-period-controls select { min-width:112px; height:34px; padding:0 30px 0 10px; color:${C.text2}; background:${C.white}; border:1px solid ${C.border}; border-radius:7px; font-size:11px; font-weight:500; text-transform:none; letter-spacing:0; outline:none; }
        .adm-period-controls select:focus { border-color:${C.red}; box-shadow:0 0 0 2px ${C.redLight}; }
        .adm-metric-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-bottom:14px; }
        .adm-metric-card,.adm-overview-panel { background:${C.white}; border:1px solid ${C.border}; border-radius:10px; box-shadow:0 3px 14px rgba(15,23,42,.04); }
        .adm-metric-card { min-height:124px; padding:16px; position:relative; overflow:hidden; display:block; width:100%; color:inherit; text-align:left; font-family:inherit; appearance:none; }
        .adm-metric-card--clickable { cursor:pointer; transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease; }
        .adm-metric-card--clickable:hover { transform:translateY(-2px); box-shadow:0 8px 22px rgba(15,23,42,.09); border-color:color-mix(in srgb,var(--metric-tone) 38%, ${C.border}); }
        .adm-metric-card--clickable:focus-visible { outline:2px solid var(--metric-tone); outline-offset:3px; }
        .adm-metric-card:after { content:''; position:absolute; left:0; right:0; bottom:0; height:3px; background:var(--metric-tone); }
        .adm-metric-top { display:flex; justify-content:space-between; align-items:center; color:${C.text3}; font-size:11px; }
        .adm-metric-icon { width:34px; height:34px; border-radius:9px; display:grid; place-items:center; color:var(--metric-tone); background:color-mix(in srgb,var(--metric-tone) 10%, white); }
        .adm-metric-icon svg { width:17px; height:17px; fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
        .adm-metric-card > strong { display:block; margin:10px 0 7px; font:600 clamp(21px,2vw,27px)/1 var(--font-sans); letter-spacing:-.025em; }
        .adm-metric-detail { color:${C.muted}; font-size:10.5px; }
        .adm-metric-detail span { font-weight:600; margin-right:4px; }
        .adm-metric-card:first-child { background:${C.red}; border-color:${C.red}; color:#fff; }
        .adm-metric-card:first-child:after { background:rgba(255,255,255,.35); }
        .adm-metric-card:first-child .adm-metric-top,.adm-metric-card:first-child .adm-metric-detail { color:rgba(255,255,255,.82); }
        .adm-metric-card:first-child .adm-metric-detail span { color:#fff !important; }
        .adm-metric-card:first-child .adm-metric-icon { color:#fff; background:rgba(255,255,255,.14); }
        .adm-overview-grid { display:grid; gap:14px; margin-bottom:14px; }
        .adm-overview-grid--wide { grid-template-columns:minmax(0,2fr) minmax(290px,1fr); }
        .adm-overview-panel { padding:18px; min-width:0; }
        .adm-panel-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:16px; }
        .adm-panel-head h2 { margin:0; font:600 14px/1.2 var(--font-sans); }
        .adm-panel-head p { margin:5px 0 0; color:${C.muted}; font-size:11px; }
        .adm-panel-summary { color:${C.text3}; font-size:11px; padding:5px 9px; background:${C.paper}; border-radius:20px; white-space:nowrap; }
        .adm-link-btn { border:0; background:none; color:${C.red}; font-size:11px; font-weight:600; white-space:nowrap; }
        .adm-sales-chart { height:230px; }
        .adm-sales-chart svg { display:block; width:100%; height:200px; overflow:visible; }
        .adm-sales-chart line { stroke:${C.hairline}; stroke-width:1; stroke-dasharray:4 5; }
        .adm-chart-line { fill:none; stroke:${C.red}; stroke-width:3; vector-effect:non-scaling-stroke; stroke-linecap:round; stroke-linejoin:round; }
        .adm-chart-area { fill:rgba(204,0,0,.07); }
        .adm-chart-labels { display:flex; justify-content:space-between; gap:8px; color:${C.muted}; font-size:10px; padding:5px 10px 0; }
        .adm-status-layout { min-height:230px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:18px; }
        .adm-donut { width:128px; height:128px; border-radius:50%; display:grid; place-items:center; position:relative; }
        .adm-donut:after { content:''; position:absolute; inset:23px; background:${C.white}; border-radius:50%; }
        .adm-donut div { position:relative; z-index:1; display:flex; flex-direction:column; align-items:center; }
        .adm-donut strong { font:600 21px/1 var(--font-sans); }
        .adm-donut span { color:${C.muted}; font-size:10px; margin-top:5px; }
        .adm-status-list { width:100%; display:grid; gap:7px; }
        .adm-status-list > div { display:grid; grid-template-columns:10px 1fr auto; align-items:center; gap:8px; color:${C.text3}; font-size:11px; }
        .adm-status-list strong { color:${C.ink}; }
        .adm-status-dot { width:8px; height:8px; border-radius:50%; }
        .adm-table-head,.adm-product-row { display:grid; grid-template-columns:28px minmax(180px,1fr) 90px 120px; gap:12px; align-items:center; }
        .adm-table-head { color:${C.muted}; font-size:10px; padding:0 0 9px; border-bottom:1px solid ${C.hairline}; }
        .adm-product-row { padding:10px 0; border-bottom:1px solid ${C.hairline}; font-size:11.5px; }
        .adm-product-row:last-child { border-bottom:0; }
        .adm-product-row > span { color:${C.muted}; }
        .adm-product-row div { min-width:0; display:flex; flex-direction:column; }
        .adm-product-row div strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12.5px; }
        .adm-product-row small { color:${C.muted}; font-size:10.5px; margin-top:2px; }
        .adm-product-row b { font:600 11.5px var(--font-sans); }
        .adm-category-bars { display:flex; flex-direction:column; gap:14px; padding-top:3px; }
        .adm-category-bars > div > div { display:flex; justify-content:space-between; gap:10px; margin-bottom:7px; font-size:11px; }
        .adm-category-bars strong { font:600 10.5px var(--font-sans); }
        .adm-category-bars i { display:block; height:9px; background:${C.hairline}; border-radius:10px; overflow:hidden; }
        .adm-category-bars i b { display:block; height:100%; background:linear-gradient(90deg,${C.red},#E15B46); border-radius:10px; }
        .adm-order-head,.adm-order-row { display:grid; grid-template-columns:minmax(170px,1fr) 110px 130px 70px; gap:12px; align-items:center; }
        .adm-order-head { color:${C.muted}; font-size:10px; padding-bottom:9px; border-bottom:1px solid ${C.hairline}; }
        .adm-order-row { min-height:48px; border-bottom:1px solid ${C.hairline}; font-size:10.5px; }
        .adm-order-row:last-child { border-bottom:0; }
        .adm-order-row > div { min-width:0; display:flex; flex-direction:column; }
        .adm-order-row > div strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }
        .adm-order-row small,.adm-order-row > span:last-child { color:${C.muted}; font-size:10.5px; }
        .adm-order-row > b { font:600 11px var(--font-sans); }
        .adm-status { justify-self:start; padding:4px 8px; border-radius:20px; font-size:9.5px; font-weight:600; white-space:nowrap; }
        .adm-attention-list { display:flex; flex-direction:column; gap:8px; }
        .adm-attention-item { width:100%; display:grid; grid-template-columns:10px 1fr auto 12px; align-items:center; gap:9px; padding:11px 10px; border:1px solid ${C.hairline}; border-radius:8px; background:${C.paper}; color:${C.text2}; text-align:left; }
        .adm-attention-item i { width:8px; height:8px; border-radius:50%; }
        .adm-attention-item span { font-size:11.5px; }
        .adm-attention-item strong { font:600 14px var(--font-sans); }
        .adm-attention-item b { color:${C.muted}; font-size:14px; }
        .adm-empty { min-height:110px; display:grid; place-items:center; color:${C.muted}; font-size:11px; text-align:center; }
        @media (max-width:1200px) { .adm-metric-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .adm-overview-grid--wide { grid-template-columns:1fr; } }
        @media (max-width:720px) { .adm-overview-intro { align-items:flex-start; flex-direction:column; } .adm-period-controls { justify-content:flex-start; width:100%; } .adm-period-controls label { flex:1; } .adm-period-controls select { width:100%; min-width:0; } .adm-metric-grid { grid-template-columns:1fr; } .adm-table-head,.adm-product-row { grid-template-columns:24px minmax(150px,1fr) 70px; } .adm-table-head span:last-child,.adm-product-row > b:last-child { display:none; } .adm-recent-orders { overflow-x:auto; } .adm-order-head,.adm-order-row { min-width:620px; } }
      `}</style>
    </div>
  )
}

function EmptyState({ text }) {
  return <div className="adm-empty">{text}</div>
}

function AttentionItem({ label, value, tone, onClick }) {
  return <button className="adm-attention-item" onClick={onClick}><i style={{ background: tone }} /><span>{label}</span><strong>{value}</strong><b>›</b></button>
}
