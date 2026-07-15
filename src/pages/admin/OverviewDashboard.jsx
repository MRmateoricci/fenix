import { useEffect, useMemo } from 'react'
import { useAdmin } from '../../context/AdminContext'

const C = {
  white: '#FFFFFF', paper: '#FFFFFF', ink: '#111827', text2: '#374151',
  text3: '#4B5563', muted: '#6B7280', border: '#DDE3EA', hairline: '#ECEFF3',
  red: '#CC0000', redLight: '#FDECEC', amber: '#E0A24A', amberLight: '#FFF7E6',
  amberDark: '#B8821A', green: '#1A7A3D', greenLight: '#EAF7EF', blue: '#CC0000',
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const ACTIVE_STATUSES = ['paid', 'preparing', 'shipped']
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

function sameMonth(date, reference) {
  if (!date) return false
  const parsed = new Date(date)
  return parsed.getFullYear() === reference.getFullYear() && parsed.getMonth() === reference.getMonth()
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

function MetricCard({ label, value, detail, trend, type, tone }) {
  const trendPositive = trend != null && trend >= 0
  return (
    <div className="adm-metric-card" style={{ '--metric-tone': tone }}>
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
    </div>
  )
}

function StatusBadge({ status }) {
  const style = STATUS_STYLE[status] || { bg: '#F3F4F6', color: C.text3 }
  return <span className="adm-status" style={{ background: style.bg, color: style.color }}>{STATUS_LABEL[status] || status}</span>
}

export default function OverviewDashboard({ products, onNavigate }) {
  const { orders, fetchOrders } = useAdmin()

  useEffect(() => { fetchOrders({ limit: 500 }) }, [fetchOrders])

  const data = useMemo(() => {
    const now = new Date()
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const monthSales = orders.filter((order) => sameMonth(order.paid_at, now))
    const previousSales = orders.filter((order) => sameMonth(order.paid_at, previousMonth))
    const monthOrders = orders.filter((order) => sameMonth(order.created_at, now))
    const revenue = monthSales.reduce((sum, order) => sum + Number(order.total_amount || 0), 0)
    const previousRevenue = previousSales.reduce((sum, order) => sum + Number(order.total_amount || 0), 0)
    const averageTicket = monthSales.length ? revenue / monthSales.length : 0
    const previousAverage = previousSales.length ? previousRevenue / previousSales.length : 0
    const pendingDelivery = orders.filter((order) => ACTIVE_STATUSES.includes(order.status))
    const reservations = orders.filter((order) => order.status === 'reserved')
    const lowStock = products.filter((product) => product.inStock && product.stock != null && product.stock <= 5)
    const outOfStock = products.filter((product) => !product.inStock)
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const dailyRevenue = Array.from({ length: daysInMonth }, () => 0)

    monthSales.forEach((order) => {
      dailyRevenue[new Date(order.paid_at).getDate() - 1] += Number(order.total_amount || 0)
    })

    const categoryMap = new Map()
    monthSales.forEach((order) => {
      ;(order.items || []).forEach((item) => {
        const category = item.category || 'Sin categoría'
        categoryMap.set(category, (categoryMap.get(category) || 0) + (Number(item.price) || 0) * (Number(item.quantity) || 0))
      })
    })

    const statusGroups = [
      { label: 'Entregados', color: C.green, count: monthOrders.filter((order) => order.status === 'delivered').length },
      { label: 'En preparación', color: C.blue, count: monthOrders.filter((order) => ACTIVE_STATUSES.includes(order.status)).length },
      { label: 'Pendientes', color: C.amber, count: monthOrders.filter((order) => ['pending_payment', 'reserved'].includes(order.status)).length },
      { label: 'Cancelados', color: C.red, count: monthOrders.filter((order) => ['cancelled', 'payment_failed', 'expired'].includes(order.status)).length },
    ]

    return {
      now, monthSales, monthOrders, revenue, averageTicket, pendingDelivery, reservations,
      lowStock, outOfStock, dailyRevenue, statusGroups,
      revenueTrend: percentageChange(revenue, previousRevenue),
      ordersTrend: percentageChange(monthSales.length, previousSales.length),
      ticketTrend: percentageChange(averageTicket, previousAverage),
      topProducts: computeTopProducts(monthSales),
      categorySales: [...categoryMap.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5),
      recentOrders: [...orders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6),
    }
  }, [orders, products])

  const chartWidth = 900
  const chartHeight = 230
  const chartPad = 18
  const maxDaily = Math.max(...data.dailyRevenue, 1)
  const chartPoints = data.dailyRevenue.map((value, index) => ({
    x: chartPad + (index / Math.max(data.dailyRevenue.length - 1, 1)) * (chartWidth - chartPad * 2),
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
  const monthLabel = `${MONTHS[data.now.getMonth()]} ${data.now.getFullYear()}`

  return (
    <div className="adm-overview">
      <div className="adm-overview-intro">
        <div>
          <p>Rendimiento de la tienda</p>
          <h2>{monthLabel}</h2>
        </div>
        <span>Datos actualizados con los últimos pedidos registrados</span>
      </div>

      <div className="adm-metric-grid">
        <MetricCard label="Facturación del mes" value={fmt(data.revenue)} trend={data.revenueTrend} detail="Sin comparación anterior" type="revenue" tone={C.red} />
        <MetricCard label="Pedidos pagados" value={data.monthSales.length} trend={data.ordersTrend} detail="Pedidos confirmados este mes" type="orders" tone={C.green} />
        <MetricCard label="Ticket promedio" value={fmt(data.averageTicket)} trend={data.ticketTrend} detail="Promedio por pedido pagado" type="ticket" tone={C.amber} />
        <MetricCard label="Requieren gestión" value={data.pendingDelivery.length + data.reservations.length} detail={`${data.reservations.length} reservas y ${data.pendingDelivery.length} por entregar`} type="pending" tone={C.blue} />
      </div>

      <div className="adm-overview-grid adm-overview-grid--wide">
        <Panel title="Evolución de ventas" subtitle={`Facturación diaria de ${monthLabel}`} action={<span className="adm-panel-summary">Pico: {fmt(maxDaily === 1 ? 0 : maxDaily)}</span>}>
          <div className="adm-sales-chart">
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" role="img" aria-label="Facturación diaria del mes">
              {[0.25, 0.5, 0.75, 1].map((part) => <line key={part} x1={chartPad} x2={chartWidth - chartPad} y1={chartHeight - chartPad - part * (chartHeight - chartPad * 2)} y2={chartHeight - chartPad - part * (chartHeight - chartPad * 2)} />)}
              <path d={areaPath} className="adm-chart-area" />
              <path d={linePath} className="adm-chart-line" />
            </svg>
            <div className="adm-chart-labels"><span>Día 1</span><span>Día 8</span><span>Día 15</span><span>Día 22</span><span>Fin de mes</span></div>
          </div>
        </Panel>

        <Panel title="Estado de pedidos" subtitle="Pedidos creados durante el mes">
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
        <Panel title="Productos más vendidos" subtitle="Ranking por unidades vendidas este mes" action={<button className="adm-link-btn" onClick={() => onNavigate('products')}>Ver productos →</button>}>
          {data.topProducts.length ? (
            <div className="adm-top-products">
              <div className="adm-table-head"><span>#</span><span>Producto</span><span>Vendidos</span><span>Facturación</span></div>
              {data.topProducts.map((product, index) => (
                <div className="adm-product-row" key={`${product.name}-${index}`}>
                  <span>{index + 1}</span><div><strong>{product.name}</strong><small>{product.category}</small></div><b>{product.units}</b><b>{fmt(product.revenue)}</b>
                </div>
              ))}
            </div>
          ) : <EmptyState text="Todavía no hay ventas pagadas este mes." />}
        </Panel>

        <Panel title="Ventas por categoría" subtitle="Facturación de productos del mes">
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

        <Panel title="Atención requerida" subtitle="Pendientes operativos e inventario">
          <div className="adm-attention-list">
            <AttentionItem label="Pedidos por entregar" value={data.pendingDelivery.length} tone={C.blue} onClick={() => onNavigate('orders')} />
            <AttentionItem label="Reservas para retirar" value={data.reservations.length} tone={C.amber} onClick={() => onNavigate('orders')} />
            <AttentionItem label="Productos con stock bajo" value={data.lowStock.length} tone={C.amberDark} onClick={() => onNavigate('products')} />
            <AttentionItem label="Productos sin stock" value={data.outOfStock.length} tone={C.red} onClick={() => onNavigate('products')} />
          </div>
        </Panel>
      </div>

      <style>{`
        .adm-overview { color:${C.ink}; font-family:Arial,Helvetica,sans-serif; font-weight:400; }
        .adm-overview button,.adm-overview input,.adm-overview select { font-family:inherit; }
        .adm-overview-intro { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; margin:-8px 0 18px; }
        .adm-overview-intro p { margin:0 0 3px; color:${C.text3}; font-size:11px; text-transform:uppercase; letter-spacing:.09em; font-weight:600; }
        .adm-overview-intro h2 { margin:0; font:500 21px/1.15 Arial,Helvetica,sans-serif; }
        .adm-overview-intro > span { color:${C.muted}; font-size:11px; }
        .adm-metric-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-bottom:14px; }
        .adm-metric-card,.adm-overview-panel { background:${C.white}; border:1px solid ${C.border}; border-radius:10px; box-shadow:0 3px 14px rgba(15,23,42,.04); }
        .adm-metric-card { min-height:124px; padding:16px; position:relative; overflow:hidden; }
        .adm-metric-card:after { content:''; position:absolute; left:0; right:0; bottom:0; height:3px; background:var(--metric-tone); }
        .adm-metric-top { display:flex; justify-content:space-between; align-items:center; color:${C.text3}; font-size:11px; }
        .adm-metric-icon { width:34px; height:34px; border-radius:9px; display:grid; place-items:center; color:var(--metric-tone); background:color-mix(in srgb,var(--metric-tone) 10%, white); }
        .adm-metric-icon svg { width:17px; height:17px; fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
        .adm-metric-card > strong { display:block; margin:10px 0 7px; font:600 clamp(21px,2vw,27px)/1 Arial,Helvetica,sans-serif; letter-spacing:-.025em; }
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
        .adm-panel-head h2 { margin:0; font:600 14px/1.2 Arial,Helvetica,sans-serif; }
        .adm-panel-head p { margin:5px 0 0; color:${C.muted}; font-size:11px; }
        .adm-panel-summary { color:${C.text3}; font-size:11px; padding:5px 9px; background:${C.paper}; border-radius:20px; white-space:nowrap; }
        .adm-link-btn { border:0; background:none; color:${C.red}; font-size:11px; font-weight:600; white-space:nowrap; }
        .adm-sales-chart { height:230px; }
        .adm-sales-chart svg { display:block; width:100%; height:200px; overflow:visible; }
        .adm-sales-chart line { stroke:${C.hairline}; stroke-width:1; stroke-dasharray:4 5; }
        .adm-chart-line { fill:none; stroke:${C.red}; stroke-width:3; vector-effect:non-scaling-stroke; stroke-linecap:round; stroke-linejoin:round; }
        .adm-chart-area { fill:rgba(204,0,0,.07); }
        .adm-chart-labels { display:flex; justify-content:space-between; color:${C.muted}; font-size:10px; padding:5px 10px 0; }
        .adm-status-layout { min-height:230px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:18px; }
        .adm-donut { width:128px; height:128px; border-radius:50%; display:grid; place-items:center; position:relative; }
        .adm-donut:after { content:''; position:absolute; inset:23px; background:${C.white}; border-radius:50%; }
        .adm-donut div { position:relative; z-index:1; display:flex; flex-direction:column; align-items:center; }
        .adm-donut strong { font:600 21px/1 Arial,Helvetica,sans-serif; }
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
        .adm-product-row b { font:600 11.5px Arial,Helvetica,sans-serif; }
        .adm-category-bars { display:flex; flex-direction:column; gap:14px; padding-top:3px; }
        .adm-category-bars > div > div { display:flex; justify-content:space-between; gap:10px; margin-bottom:7px; font-size:11px; }
        .adm-category-bars strong { font:600 10.5px Arial,Helvetica,sans-serif; }
        .adm-category-bars i { display:block; height:9px; background:${C.hairline}; border-radius:10px; overflow:hidden; }
        .adm-category-bars i b { display:block; height:100%; background:linear-gradient(90deg,${C.red},#E15B46); border-radius:10px; }
        .adm-order-head,.adm-order-row { display:grid; grid-template-columns:minmax(170px,1fr) 110px 130px 70px; gap:12px; align-items:center; }
        .adm-order-head { color:${C.muted}; font-size:10px; padding-bottom:9px; border-bottom:1px solid ${C.hairline}; }
        .adm-order-row { min-height:48px; border-bottom:1px solid ${C.hairline}; font-size:10.5px; }
        .adm-order-row:last-child { border-bottom:0; }
        .adm-order-row > div { min-width:0; display:flex; flex-direction:column; }
        .adm-order-row > div strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }
        .adm-order-row small,.adm-order-row > span:last-child { color:${C.muted}; font-size:10.5px; }
        .adm-order-row > b { font:600 11px Arial,Helvetica,sans-serif; }
        .adm-status { justify-self:start; padding:4px 8px; border-radius:20px; font-size:9.5px; font-weight:600; white-space:nowrap; }
        .adm-attention-list { display:flex; flex-direction:column; gap:8px; }
        .adm-attention-item { width:100%; display:grid; grid-template-columns:10px 1fr auto 12px; align-items:center; gap:9px; padding:11px 10px; border:1px solid ${C.hairline}; border-radius:8px; background:${C.paper}; color:${C.text2}; text-align:left; }
        .adm-attention-item i { width:8px; height:8px; border-radius:50%; }
        .adm-attention-item span { font-size:11.5px; }
        .adm-attention-item strong { font:600 14px Arial,Helvetica,sans-serif; }
        .adm-attention-item b { color:${C.muted}; font-size:14px; }
        .adm-empty { min-height:110px; display:grid; place-items:center; color:${C.muted}; font-size:11px; text-align:center; }
        @media (max-width:1200px) { .adm-metric-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .adm-overview-grid--wide { grid-template-columns:1fr; } }
        @media (max-width:720px) { .adm-overview-intro { align-items:flex-start; flex-direction:column; } .adm-metric-grid { grid-template-columns:1fr; } .adm-table-head,.adm-product-row { grid-template-columns:24px minmax(150px,1fr) 70px; } .adm-table-head span:last-child,.adm-product-row > b:last-child { display:none; } .adm-recent-orders { overflow-x:auto; } .adm-order-head,.adm-order-row { min-width:620px; } }
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
