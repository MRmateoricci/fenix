import { useEffect, useRef, useState } from 'react'
import { api } from '../services/api'

// Facturación de mostrador. El caso normal es "el cliente pide factura":
// el vendedor tipea el CUIT y listo — se consulta el padrón de ARCA (mismo
// /cuit-lookup que antes usaba el botón "Buscar" de InvoiceFields) y la
// condición + tipo de comprobante (A o B, según corresponda) se resuelven
// solos. Sin CUIT cargado no hay factura: esa es la señal de "no se va a
// generar ninguna factura", no un checkbox aparte.
//
// Dos atajos cubren lo que el CUIT automático no puede resolver:
// - Consumidor Final con DNI (no tiene CUIT, pide Factura B igual).
// - "Otra condición": Responsable Inscripto / Monotributo / Exento a mano,
//   para cuando el vendedor ya sabe la condición del cliente y no hace falta
//   consultar ARCA, o cuando el padrón (ws_sr_constancia_inscripcion) está
//   caído — es un servicio de ARCA aparte del catálogo de condiciones IVA,
//   que sale de un cache de 12hs y sigue funcionando aunque el padrón no
//   responda (ver arcaParameters.js#getInvoiceOptions).
const MANUAL_CATEGORIES = [
  { value: 'registered', label: 'Responsable Inscripto' },
  { value: 'monotributo', label: 'Monotributo' },
  { value: 'exempt', label: 'Exento' },
]

export default function QuickInvoiceCuit({ invoiceReceiver, onInvoiceReceiverChange, isInvoiced, onIsInvoicedChange }) {
  const [mode, setMode] = useState('quick') // quick | consumer_final | manual
  const [manualCategory, setManualCategory] = useState('registered')
  const [status, setStatus] = useState('idle') // idle | loading | ok | error
  const [errorMessage, setErrorMessage] = useState('')
  const [options, setOptions] = useState(null)
  const [optionsError, setOptionsError] = useState('')
  const lastLookedUp = useRef('')

  const digits = String(invoiceReceiver.docNumber || '').replace(/\D/g, '').slice(0, 11)

  // Búsqueda automática del modo rápido.
  useEffect(() => {
    if (mode !== 'quick') return
    if (digits.length !== 11) {
      lastLookedUp.current = ''
      setStatus('idle')
      setErrorMessage('')
      if (isInvoiced) onIsInvoicedChange(false)
      return
    }
    if (digits === lastLookedUp.current) return
    lastLookedUp.current = digits
    let cancelled = false
    setStatus('loading')
    setErrorMessage('')
    const timer = setTimeout(() => {
      api.cuitLookup(digits)
        .then(profile => {
          if (cancelled) return
          setStatus('ok')
          onInvoiceReceiverChange({
            docType: 80,
            docNumber: digits,
            customerName: profile.name,
            vatConditionId: profile.vatConditionId,
            vatConditionDescription: profile.vatConditionDescription,
            invoiceClass: profile.invoiceClass,
          })
          onIsInvoicedChange(true)
        })
        .catch(err => {
          if (cancelled) return
          setStatus('error')
          setErrorMessage(err.message)
          onIsInvoicedChange(false)
        })
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits, mode])

  // Las condiciones IVA (para los atajos manuales) se piden una sola vez, al
  // entrar a cualquiera de los dos modos que las necesita.
  useEffect(() => {
    if (mode === 'quick' || options || optionsError) return
    api.getInvoicingOptions()
      .then(setOptions)
      .catch(err => setOptionsError(err.message))
  }, [mode, options, optionsError])

  function handleCuitChange(raw) {
    const clean = raw.replace(/\D/g, '').slice(0, 11)
    onInvoiceReceiverChange({ docType: 80, docNumber: clean, customerName: '', vatConditionId: null })
  }

  function enterMode(nextMode) {
    setMode(nextMode)
    setStatus('idle')
    setErrorMessage('')
    if (nextMode === 'consumer_final') {
      onInvoiceReceiverChange({ docType: 96, docNumber: '', customerName: '' })
      onIsInvoicedChange(false)
    } else if (nextMode === 'manual') {
      // Si ya había un CUIT tipeado en el modo rápido (ej. porque el padrón
      // no pudo verificarlo), se mantiene para no hacerlo escribir de nuevo.
      onInvoiceReceiverChange({ docType: 80, docNumber: digits, customerName: '', vatConditionId: null })
      onIsInvoicedChange(false)
    } else {
      onInvoiceReceiverChange({})
      onIsInvoicedChange(false)
      lastLookedUp.current = ''
    }
  }

  function conditionFor(category) {
    return options?.vatConditions?.find(c => c.category === category) || null
  }

  function handleConsumerFinalField(field, value) {
    const clean = field === 'docNumber' ? value.replace(/\D/g, '').slice(0, 8) : value
    const condition = conditionFor('consumer_final')
    const next = { ...invoiceReceiver, docType: 96, [field]: clean, vatConditionId: condition?.id ?? null }
    onInvoiceReceiverChange(next)
    onIsInvoicedChange(Boolean(next.docNumber?.trim()))
  }

  function handleManualField(field, value) {
    const clean = field === 'docNumber' ? value.replace(/\D/g, '').slice(0, 11) : value
    const condition = conditionFor(manualCategory)
    const next = { ...invoiceReceiver, docType: 80, [field]: clean, vatConditionId: condition?.id ?? null }
    onInvoiceReceiverChange(next)
    onIsInvoicedChange(Boolean(next.docNumber?.length === 11 && next.customerName?.trim()))
  }

  function handleManualCategoryChange(category) {
    setManualCategory(category)
    const condition = conditionFor(category)
    const next = { ...invoiceReceiver, vatConditionId: condition?.id ?? null }
    onInvoiceReceiverChange(next)
    onIsInvoicedChange(Boolean(next.docNumber?.length === 11 && next.customerName?.trim()))
  }

  if (mode === 'consumer_final') {
    return (
      <div className="mb-3">
        <button type="button" onClick={() => enterMode('quick')} className="mb-2 text-xs text-slate-400 underline">
          ← Volver
        </button>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          DNI del cliente
          <input
            inputMode="numeric"
            value={invoiceReceiver.docNumber || ''}
            onChange={e => handleConsumerFinalField('docNumber', e.target.value)}
            placeholder="Sin puntos"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Nombre (opcional)
          <input
            value={invoiceReceiver.customerName || ''}
            onChange={e => handleConsumerFinalField('customerName', e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        {isInvoiced && <p className="mt-1 text-xs text-emerald-700">Se emite Factura B a nombre del cliente.</p>}
      </div>
    )
  }

  if (mode === 'manual') {
    const resolvedCondition = conditionFor(manualCategory)
    return (
      <div className="mb-3">
        <button type="button" onClick={() => enterMode('quick')} className="mb-2 text-xs text-slate-400 underline">
          ← Volver
        </button>
        {optionsError && (
          <p className="mb-2 text-xs text-red-600">No se pudieron cargar las condiciones fiscales: {optionsError}</p>
        )}
        {!options && !optionsError && <p className="mb-2 text-xs text-slate-400">Cargando condiciones fiscales...</p>}
        {options && (
          <>
            <div className="mb-2 flex gap-1">
              {MANUAL_CATEGORIES.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => handleManualCategoryChange(c.value)}
                  className={`rounded-md border px-2 py-1 text-xs font-medium ${
                    manualCategory === c.value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-600'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              CUIT
              <input
                inputMode="numeric"
                value={digits}
                onChange={e => handleManualField('docNumber', e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Nombre / Razón social
              <input
                value={invoiceReceiver.customerName || ''}
                onChange={e => handleManualField('customerName', e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            {isInvoiced && resolvedCondition && (
              <p className="mt-1 text-xs text-emerald-700">Se emite Factura {resolvedCondition.invoiceClass}.</p>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="mb-3">
      <label className="mb-1 block text-sm font-medium text-slate-700">
        CUIT (si pide factura)
      </label>
      <input
        inputMode="numeric"
        value={digits}
        onChange={e => handleCuitChange(e.target.value)}
        placeholder="Sin CUIT no se emite factura"
        className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
      />
      {status === 'loading' && <p className="mt-1 text-xs text-slate-400">Verificando CUIT en AFIP...</p>}
      {status === 'ok' && (
        <p className="mt-1 text-xs text-emerald-700">
          {invoiceReceiver.customerName} — {invoiceReceiver.vatConditionDescription} → se emite Factura {invoiceReceiver.invoiceClass}
        </p>
      )}
      {status === 'error' && (
        <p className="mt-1 text-xs text-red-600">{errorMessage} La venta se registra igual, sin factura.</p>
      )}
      <div className="mt-1 flex gap-3">
        <button type="button" onClick={() => enterMode('consumer_final')} className="text-xs text-slate-400 underline">
          Consumidor Final con DNI
        </button>
        <button type="button" onClick={() => enterMode('manual')} className="text-xs text-slate-400 underline">
          Otra condición (CUIT manual)
        </button>
      </div>
    </div>
  )
}
