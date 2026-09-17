import { useEffect, useState } from 'react'
import { api } from '../../services/api'

// No hay formulario para cargar CUIT/certificado acá a propósito: esos datos
// ya viven en las variables de entorno que usa toda la empresa (compartidas
// con la facturación de la web) — exponerlos como editables desde el POS
// crearía dos lugares gestionando la misma identidad fiscal ante AFIP. Esta
// pantalla es solo de estado y prueba de conexión.
const STATUS_LABELS = {
  ok: { text: 'Conectado', className: 'text-emerald-600' },
  down: { text: 'AFIP no responde', className: 'text-red-600' },
  not_configured: { text: 'No configurado', className: 'text-slate-500' },
}

export default function FiscalStatus() {
  const [result, setResult] = useState(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')

  async function check() {
    setChecking(true)
    setError('')
    try {
      setResult(await api.checkAfipStatus())
    } catch (err) {
      setError(err.message)
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => { check() }, [])

  const status = result ? STATUS_LABELS[result.status] || STATUS_LABELS.down : null

  return (
    <div className="mx-auto max-w-lg overflow-y-auto p-6">
      <h1 className="mb-4 text-xl font-bold text-slate-800">Estado fiscal (AFIP)</h1>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        {checking && !result ? (
          <p className="text-slate-400">Consultando...</p>
        ) : result ? (
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Estado</span>
              <span className={`font-semibold ${status.className}`}>{status.text}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Entorno</span>
              <span className="font-medium text-slate-800">
                {result.environment === 'production' ? 'Producción' : 'Homologación'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Punto de venta (POS)</span>
              <span className="font-medium text-slate-800">{result.pointOfSale ?? 'No configurado'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Facturación automática online</span>
              <span className="font-medium text-slate-800">{result.autoInvoiceEnabled ? 'Activada' : 'Desactivada'}</span>
            </div>
            {result.error && <p className="mt-1 text-xs text-slate-400">{result.error}</p>}
          </div>
        ) : (
          <p className="text-red-600">{error}</p>
        )}

        <button
          onClick={check}
          disabled={checking}
          className="mt-4 w-full rounded-md bg-slate-900 py-2 font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {checking ? 'Probando...' : 'Probar conexión con AFIP'}
        </button>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        El CUIT, certificado, condición fiscal y punto de venta se configuran por variables de
        entorno del servidor (compartidas con la facturación de la web) — no desde acá.
      </p>
    </div>
  )
}
