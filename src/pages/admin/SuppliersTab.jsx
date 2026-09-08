import { Fragment, useEffect, useMemo, useState } from 'react'
import { useAdmin } from '../../context/AdminContext'
import './SuppliersTab.css'

const number = value => Number(value || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })
const money = value => Number(value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
const date = value => value ? new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }) : 'Sin registro'
const daysAgo = value => {
  if (!value) return ''
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000))
  return days === 0 ? 'Hace menos de un día' : `Hace ${days} día${days === 1 ? '' : 's'}`
}

function SupplierDetail({ supplier, onOpenProducts }) {
  const { fetchSupplierImports } = useAdmin()
  const [imports, setImports] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setImports(null)
    setError('')
    fetchSupplierImports(supplier.supplier).then(data => { if (active) setImports(data) })
      .catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [supplier.supplier, fetchSupplierImports, retry])
  return <div className="supplier-detail">
    <div className="supplier-detail-heading">
      <div><h2>{supplier.supplier}</h2><p>Inventario actual y últimas cargas de precios.</p></div>
      <button type="button" onClick={() => onOpenProducts(supplier.supplier)}>Ver productos y cargar precios</button>
    </div>
    <dl className="supplier-detail-metrics">
      {[
        ['Publicados', number(supplier.publishedCount)], ['Borradores', number(supplier.draftCount)],
        ['Productos sin stock', number(supplier.outOfStockCount)], ['Unidades en stock', number(supplier.stockUnits)],
        ['Productos en USD', number(supplier.usdCount)], ['Último cambio de precio', date(supplier.lastPriceChangeAt)],
        ['Última venta del período', date(supplier.lastSaleAt)],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    {supplier.inferredLines > 0 && <p className="supplier-note">En {number(supplier.inferredLines)} líneas de pedidos anteriores, el proveedor se atribuye según el producto actual porque no quedó guardado al comprar.</p>}
    <h3>Historial de listas de precios</h3>
    {error ? <div role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Reintentar</button></div>
      : imports === null ? <p role="status">Cargando historial…</p>
      : !imports.length ? <p>No hay cargas registradas para este proveedor.</p>
      : <div className="supplier-history">{imports.map(item => <article key={item.id}>
        <strong>{date(item.at)}</strong>
        <p>{number(item.created)} creados · {number(item.updated)} actualizados · {number(item.unchanged)} sin cambios · {number(item.skipped)} omitidos</p>
        {!!item.pendingVariant && <p className="supplier-pending">{number(item.pendingVariant)} códigos pendientes de asignar a una variante.</p>}
        <p className="supplier-files">{item.fileNames.join(' · ')}</p>
      </article>)}</div>}
  </div>
}

export default function SuppliersTab({ onOpenProducts }) {
  const { fetchSupplierReport } = useAdmin()
  const [period, setPeriod] = useState('30')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('supplier')
  const [refresh, setRefresh] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setData(null)
    setExpanded(null)
    fetchSupplierReport(period).then(result => { if (active) setData(result) })
      .catch(err => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [period, refresh, fetchSupplierReport])

  const visible = useMemo(() => (data?.suppliers || [])
    .filter(supplier => supplier.supplier.toLocaleLowerCase('es-AR').includes(search.trim().toLocaleLowerCase('es-AR')))
    .filter(supplier => filter !== 'missing' || !supplier.lastImport)
    .sort((a, b) => {
      if (sort === 'oldest') return new Date(a.lastImport?.at || 0) - new Date(b.lastImport?.at || 0) || a.supplier.localeCompare(b.supplier, 'es')
      if (sort !== 'supplier') return b[sort] - a[sort] || a.supplier.localeCompare(b.supplier, 'es')
      return a.supplier.localeCompare(b.supplier, 'es')
    }), [data, search, filter, sort])

  return <div className="suppliers-tab">
    <div className="suppliers-heading">
      <p>Seguí las listas de precios, el inventario y las ventas de cada proveedor.</p>
      <button type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)}>{loading ? 'Actualizando…' : 'Actualizar datos'}</button>
    </div>
    <div className="suppliers-toolbar">
      <label>Buscar proveedor<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nombre del proveedor" /></label>
      <label>Ventas del período<select value={period} onChange={event => setPeriod(event.target.value)}>
        <option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option><option value="365">Últimos 365 días</option><option value="all">Todo el historial</option>
      </select></label>
      <label>Listas de precios<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Todos los proveedores</option><option value="missing">Sin cargas registradas</option></select></label>
      <label>Ordenar por<select value={sort} onChange={event => setSort(event.target.value)}><option value="supplier">Nombre</option><option value="oldest">Carga más antigua primero</option><option value="productCount">Más productos</option><option value="orderCount">Más pedidos</option><option value="salesAmount">Mayor importe vendido</option></select></label>
    </div>
    {loading && <p role="status" className="suppliers-state">Cargando proveedores…</p>}
    {error && <div role="alert" className="suppliers-error">{error} <button type="button" onClick={() => setRefresh(value => value + 1)}>Reintentar</button></div>}
    {data && <>
      <div className="suppliers-metrics">
        {[
          ['Proveedores', number(data.totals.suppliers), `${number(data.totals.withoutImports)} sin cargas registradas`],
          ['Productos', number(data.totals.products), 'Inventario actual, incluidos borradores'],
          ['Pedidos con ventas', number(data.totals.orders), 'Pedidos únicos del período'],
          ['Importe de productos', money(data.totals.salesAmount), 'ARS · ventas del período'],
        ].map(([label, value, note]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}
      </div>
      <p className="supplier-note">La última lista cargada incluye importaciones sin aumentos. Las ventas cuentan pedidos pagados, en preparación, enviados y entregados. Los importes corresponden a productos, antes de descuentos generales y sin envío. Un pedido puede incluir varios proveedores.</p>
      <p className="suppliers-count">{visible.length} de {data.suppliers.length} proveedores · Datos actualizados: {date(data.generatedAt)}</p>
      {!visible.length ? <p className="suppliers-state">{data.suppliers.length ? 'No hay proveedores que coincidan con los filtros.' : 'Todavía no hay proveedores registrados. Aparecerán al cargar productos o listas de precios.'}</p> :
        <div className="suppliers-table-wrap"><table className="suppliers-table">
          <thead><tr>{['Proveedor', 'Última lista cargada', 'Productos', 'Pedidos', 'Unidades vendidas', 'Importe de productos (ARS)', ''].map((label, index) => <th key={index} scope="col">{label}</th>)}</tr></thead>
          <tbody>{visible.map(supplier => <Fragment key={supplier.supplier}>
            <tr>
              <th scope="row">{supplier.supplier}</th>
              <td>{supplier.lastImport ? <><strong>{date(supplier.lastImport.at)}</strong><small>{daysAgo(supplier.lastImport.at)}</small>{!!supplier.lastImport.pendingVariant && <small className="supplier-pending">{number(supplier.lastImport.pendingVariant)} variantes pendientes</small>}</> : <span className="supplier-empty-badge">Sin cargas registradas</span>}</td>
              <td><strong>{number(supplier.productCount)}</strong><small>{number(supplier.publishedCount)} publicados</small></td>
              <td>{number(supplier.orderCount)}</td><td>{number(supplier.unitsSold)}</td><td>{money(supplier.salesAmount)}</td>
              <td><button type="button" aria-expanded={expanded === supplier.supplier} aria-label={`Ver detalle de ${supplier.supplier}`} onClick={() => setExpanded(current => current === supplier.supplier ? null : supplier.supplier)}>{expanded === supplier.supplier ? 'Cerrar detalle' : 'Ver detalle'}</button></td>
            </tr>
            {expanded === supplier.supplier && <tr><td colSpan={7}><SupplierDetail supplier={supplier} onOpenProducts={onOpenProducts} /></td></tr>}
          </Fragment>)}</tbody>
        </table></div>}
    </>}
  </div>
}
