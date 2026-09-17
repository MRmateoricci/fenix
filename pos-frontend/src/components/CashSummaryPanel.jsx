const money = value => Number(value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
const dateTime = value => new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })

const METHOD_LABELS = {
  efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito', transferencia: 'Transferencia', qr: 'QR',
}

function Row({ label, value, count, strong }) {
  return (
    <div className={`flex items-center justify-between py-1 ${strong ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
      <span>{label}{count != null ? ` (${count})` : ''}</span>
      <span>{money(value)}</span>
    </div>
  )
}

export default function CashSummaryPanel({ cashRegister, showTimeline = true }) {
  if (!cashRegister) return null
  const r = cashRegister

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-slate-500">
        Abierta por <span className="font-medium text-slate-700">{r.openedBy}</span> — {dateTime(r.openedAt)}
        {r.status === 'closed' && (
          <>
            <br />
            Cerrada por <span className="font-medium text-slate-700">{r.closedBy}</span> — {dateTime(r.closedAt)}
          </>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <Row label="Fondo de caja" value={r.openingAmount} />
        <div className="my-1 border-t border-slate-100" />
        {Object.entries(METHOD_LABELS).map(([key, label]) => (
          <Row key={key} label={`Ventas en ${label.toLowerCase()}`} value={r.salesByMethod[key].total} count={r.salesByMethod[key].count} />
        ))}
        <div className="my-1 border-t border-slate-100" />
        <Row label="Total ventas facturadas" value={r.invoiced.total} count={r.invoiced.count} />
        <Row label="Total ventas no facturadas" value={r.notInvoiced.total} count={r.notInvoiced.count} />
        <div className="my-1 border-t border-slate-100" />
        <Row label="Ingresos extra" value={r.movementsIn.total} count={r.movementsIn.count} />
        <Row label="Egresos extra" value={-r.movementsOut.total} count={r.movementsOut.count} />
      </div>

      <div className="rounded-lg border-2 border-slate-900 bg-slate-50 p-3">
        <Row label="Efectivo esperado en caja" value={r.expectedCash} strong />
      </div>

      {r.status === 'closed' && (
        <div className="rounded-lg border border-slate-200 p-3">
          <Row label="Efectivo real contado" value={r.actualCash} />
          <div className={`mt-1 text-center text-lg font-bold ${
            Math.abs(r.cashDifference) < 0.01 ? 'text-emerald-600' : r.cashDifference > 0 ? 'text-blue-600' : 'text-red-600'
          }`}>
            {Math.abs(r.cashDifference) < 0.01
              ? '✓ Caja cuadrada'
              : r.cashDifference > 0
              ? `⚠ Diferencia: +${money(r.cashDifference)} (sobra)`
              : `⚠ Diferencia: ${money(r.cashDifference)} (falta)`}
          </div>
          {r.notes && <p className="mt-2 text-sm italic text-slate-500">"{r.notes}"</p>}
        </div>
      )}

      {showTimeline && (
        <div>
          <p className="mb-1 text-sm font-medium text-slate-700">Movimientos del turno</p>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
            {!r.timeline.length && <p className="p-3 text-sm text-slate-400">Todavía no hay movimientos.</p>}
            {r.timeline.map(entry => (
              <div key={`${entry.kind}-${entry.id}`} className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
                <div>
                  {entry.kind === 'sale' ? (
                    <span>Venta #{entry.saleNumber} · {entry.userName}</span>
                  ) : (
                    <span className={entry.type === 'ingreso' ? 'text-emerald-700' : 'text-red-700'}>
                      {entry.type === 'ingreso' ? 'Ingreso' : 'Egreso'}: {entry.reason} · {entry.userName}
                    </span>
                  )}
                  <span className="ml-2 text-xs text-slate-400">{dateTime(entry.createdAt)}</span>
                </div>
                <span className={entry.kind === 'movement' && entry.type === 'egreso' ? 'text-red-600' : 'text-slate-700'}>
                  {entry.kind === 'movement' && entry.type === 'egreso' ? '-' : ''}{money(entry.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
