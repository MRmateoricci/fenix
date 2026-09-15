import { useState } from 'react'
import { CODE_AFFIX_MAX_LENGTH, buildSheetSelection, excelColumnLabel, previewCodeAffixes, priceColumnFields, sheetSelectionError } from '../../utils/priceSheetSelection'

export default function PriceSheetMappingModal({ setup, defaultCurrency = 'ARS', defaultCodeAffixes = {}, busy, error, onContinue, onClose, theme: C }) {
  const [sheets, setSheets] = useState(() => setup.draftSheets || setup.data.files.flatMap(file => file.sheets.map(sheet => ({
    ...sheet, fileIndex: file.fileIndex, fileName: file.fileName, currency: sheet.currency || defaultCurrency,
    codeStripPrefix: defaultCodeAffixes.codeStripPrefix || '', codeAddPrefix: defaultCodeAffixes.codeAddPrefix || '',
  }))))
  const [activeIndex, setActiveIndex] = useState(0)
  const [sampleLimits, setSampleLimits] = useState({})
  const active = sheets[activeIndex]
  const selected = sheets.filter(sheet => sheet.selected)
  const invalid = selected.filter(sheet => sheetSelectionError(sheet))
  const patch = update => setSheets(current => current.map((sheet, index) => index === activeIndex ? { ...sheet, ...update } : sheet))
  const input = { width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 6, background: C.white, color: C.ink }
  const button = { padding: '9px 13px', border: `1px solid ${C.border}`, borderRadius: 6, background: C.white, color: C.ink, cursor: 'pointer' }
  const header = active?.sampleRows[active.headerRow - 1] || []
  const displayRows = active?.sampleDisplayRows || active?.sampleRows || []
  const sampleLimit = sampleLimits[activeIndex] || 25
  const sample = displayRows.slice(active?.headerRow || 0, (active?.headerRow || 0) + sampleLimit)
  const hasMoreSample = !!active && active.headerRow + sample.length < displayRows.length
  const affixesActive = !!active && Boolean(String(active.codeStripPrefix || '').trim() || String(active.codeAddPrefix || '').trim())
  const sampleCode = active && active.columns.codeIndex >= 0
    ? sample.map(row => String(row[active.columns.codeIndex] ?? '').trim()).find(Boolean) || ''
    : ''
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2600, background: 'rgba(17,24,39,.62)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="price-sheet-title" style={{ width: 'min(1150px, 97vw)', maxHeight: '94vh', display: 'flex', flexDirection: 'column', background: C.white, color: C.ink, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: 20, borderBottom: `1px solid ${C.border}` }}>
          <h2 id="price-sheet-title" style={{ margin: '0 0 6px', fontSize: 19 }}>Elegir hojas y columnas</h2>
          <p style={{ margin: 0, fontSize: 13, color: C.text2 }}>Proveedor: <strong>{setup.supplier}</strong>. Revisá las sugerencias y elegí qué significa cada columna. Después vas a ver los productos y cambios antes de confirmar.</p>
        </div>
        <div style={{ overflow: 'auto', padding: 18, flex: 1 }}>
          {!!setup.data.failedFiles?.length && <div style={{ color: C.red, marginBottom: 12 }}>{setup.data.failedFiles.map((file, index) => <div key={index}>{file.fileName}: {file.error}</div>)}</div>}
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 230px', maxWidth: 340 }}>
              <strong style={{ fontSize: 13 }}>{selected.length} de {sheets.length} hojas seleccionadas</strong>
              <div style={{ margin: '8px 0', display: 'flex', gap: 6 }}>
                <button type="button" style={button} disabled={busy} onClick={() => setSheets(current => current.map(sheet => ({ ...sheet, selected: true })))}>Todas</button>
                <button type="button" style={button} disabled={busy} onClick={() => setSheets(current => current.map(sheet => ({ ...sheet, selected: false })))}>Ninguna</button>
              </div>
              {sheets.map((sheet, index) => <div key={`${sheet.fileIndex}:${sheet.sheetName}`} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 9, marginBottom: 5, border: `1px solid ${index === activeIndex ? C.dark : C.border}`, borderRadius: 7, background: index === activeIndex ? '#F3F4F6' : C.white }}>
                <input type="checkbox" aria-label={`Importar ${sheet.sheetName} de ${sheet.fileName}`} checked={sheet.selected} disabled={busy} onChange={event => setSheets(current => current.map((item, i) => i === index ? { ...item, selected: event.target.checked } : item))} />
                <button type="button" onClick={() => setActiveIndex(index)} style={{ border: 0, background: 'none', textAlign: 'left', flex: 1, minWidth: 0, cursor: 'pointer', color: C.ink }}>
                  <strong style={{ display: 'block', overflowWrap: 'anywhere' }}>{sheet.sheetName}</strong>
                  <span style={{ display: 'block', color: C.muted, fontSize: 11, overflowWrap: 'anywhere' }}>{sheet.fileName}</span>
                  <span style={{ display: 'block', fontSize: 11, marginTop: 4, color: sheetSelectionError(sheet) ? C.amberDark : C.text2 }}>{sheetSelectionError(sheet) ? 'Requiere asignar columnas' : `${sheet.currency} · columnas asignadas`}{!sheet.selected ? ' · no se importará' : ''}</span>
                </button>
              </div>)}
            </div>
            {active && <fieldset disabled={busy} style={{ flex: '3 1 480px', minWidth: 0, margin: 0, padding: 0, border: 0 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>{active.sheetName}</h3>
              {!!active.error && <p style={{ fontSize: 12, padding: 10, background: C.amberLight, color: C.amberDark }}>Detección inicial: {active.error} Podés asignar las columnas manualmente. Si el código y el precio están en filas diferentes, primero reorganizá esa hoja para que cada producto ocupe una fila.</p>}
              <details style={{ marginBottom: 14, fontSize: 12 }}>
                <summary style={{ cursor: 'pointer' }}>Ver celdas originales y elegir la fila de encabezados</summary>
                <div style={{ overflow: 'auto', maxHeight: 250, marginTop: 8 }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead><tr><th>Fila</th>{Array.from({ length: active.columnCount }, (_, index) => <th key={index} style={{ padding: 6 }}>{excelColumnLabel(index)}</th>)}</tr></thead>
                    <tbody>{active.sampleRows.map((row, index) => <tr key={index} style={{ background: active.headerRow === index + 1 ? '#EEF2FF' : C.white }}>
                      <td><button type="button" title={`Usar fila ${index + 1} como encabezados`} onClick={() => patch({ headerRow: index + 1 })} style={{ ...button, padding: 5 }}>{index + 1}</button></td>
                      {Array.from({ length: active.columnCount }, (_, column) => <td key={column} style={{ padding: 6, border: `1px solid ${C.border}`, minWidth: 70, maxWidth: 300, overflowWrap: 'anywhere' }}>{String(displayRows[index]?.[column] ?? row[column] ?? '')}</td>)}
                    </tr>)}</tbody>
                  </table>
                </div>
              </details>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                <label style={{ fontSize: 12 }}>Fila de encabezados
                  <input type="number" min={1} max={active.rowCount} value={active.headerRow} onChange={event => patch({ headerRow: Number(event.target.value) })} style={input} />
                </label>
                <label style={{ fontSize: 12 }}>Moneda para celdas sin indicación
                  <select value={active.currency} onChange={event => patch({ currency: event.target.value })} style={input}>
                    <option value="ARS">Pesos argentinos (ARS)</option><option value="USD">Dólares (USD)</option>
                  </select>
                </label>
              </div>
              <p style={{ margin: '6px 0 14px', fontSize: 12, color: C.muted }}>{active.currencyHint} Los precios se toman tal como figuran; no se descuenta IVA ni se convierte un precio por metro a precio por rollo.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                <label style={{ fontSize: 12 }}>Quitar del inicio del código
                  <input type="text" maxLength={CODE_AFFIX_MAX_LENGTH} value={active.codeStripPrefix || ''} onChange={event => patch({ codeStripPrefix: event.target.value })} placeholder="Ej.: CA-" style={input} />
                </label>
                <label style={{ fontSize: 12 }}>Agregar al inicio del código
                  <input type="text" maxLength={CODE_AFFIX_MAX_LENGTH} value={active.codeAddPrefix || ''} onChange={event => patch({ codeAddPrefix: event.target.value })} placeholder="Ej.: CA-" style={input} />
                </label>
              </div>
              <p style={{ margin: '6px 0 14px', fontSize: 12, color: affixesActive ? C.text2 : C.muted }}>
                {affixesActive
                  ? <>Los códigos de esta hoja se leen ajustados{sampleCode ? <>: <code>{sampleCode.toUpperCase()}</code> → <code>{previewCodeAffixes(sampleCode, active) || '(vacío)'}</code></> : ''}. Así se comparan con tus productos y así quedan los que se creen. Se recuerda para la próxima lista de {setup.supplier}.</>
                  : 'Si el proveedor usa otra convención de códigos que tus productos (por ejemplo, tus productos tienen "CA-" adelante y la lista no), ajustalo acá para que coincidan en vez de crearse de nuevo.'}
              </p>
              {!!active.warnings?.length && <div style={{ padding: 10, marginBottom: 12, background: C.amberLight, color: C.amberDark, fontSize: 12 }}>{active.warnings.map((warning, index) => <div key={index}>{warning}</div>)}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
                {priceColumnFields.map(([field, label]) => <label key={field} style={{ fontSize: 12 }}>{label}
                  <select value={active.columns[field]} onChange={event => patch({ columns: { ...active.columns, [field]: Number(event.target.value) } })} style={input}>
                    <option value={-1}>{field === 'codeIndex' ? 'Elegir columna' : 'No importar este campo'}</option>
                    {Array.from({ length: active.columnCount }, (_, index) => <option key={index} value={index}>{excelColumnLabel(index)} — {String(header[index] ?? '').trim() || 'Sin título'}</option>)}
                  </select>
                </label>)}
              </div>
              {!!sheetSelectionError(active) && <p role="status" style={{ color: C.red, fontSize: 12 }}>{sheetSelectionError(active)}</p>}
              <p style={{ fontSize: 12, color: C.text2 }}><strong>Se leerá hasta la fila {active.rowCount}, aunque haya filas vacías o títulos entre productos.</strong> Esta tabla es solo una muestra; “Revisar productos” muestra todos los resultados. Las filas sin código o sin precio se detallarán como inválidas.</p>
              <p style={{ fontSize: 12, color: C.muted }}>{sample.length ? `Mostrando filas ${active.headerRow + 1} a ${active.headerRow + sample.length} de ${active.rowCount}.` : 'No hay filas disponibles en esta muestra.'} La muestra permite explorar las primeras {active.sampleRows.length} filas del Excel.</p>
              <div style={{ overflowX: 'auto', maxHeight: 240 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead><tr>{['Fila', ...priceColumnFields.map(([, label]) => label)].map(label => <th key={label} style={{ padding: 7, textAlign: 'left', borderBottom: `1px solid ${C.border}` }}>{label}</th>)}</tr></thead>
                  <tbody>{sample.map((row, index) => <tr key={index}><td style={{ padding: 7 }}>{active.headerRow + index + 1}</td>{priceColumnFields.map(([field]) => <td key={field} style={{ padding: 7, borderBottom: `1px solid ${C.border}` }}>{String(row[active.columns[field]] ?? '—')}</td>)}</tr>)}</tbody>
                </table>
              </div>
              {hasMoreSample && <button type="button" style={{ ...button, marginTop: 8 }} onClick={() => setSampleLimits(current => ({ ...current, [activeIndex]: sampleLimit + 25 }))}>Ver más filas de la muestra</button>}
              {active.headerRow >= active.sampleRows.length && <p style={{ fontSize: 12 }}>La muestra abarca las primeras 100 filas. La vista previa leerá todos los productos desde la fila elegida.</p>}
            </fieldset>}
          </div>
          {!!error && <div role="alert" style={{ marginTop: 12, color: C.red, whiteSpace: 'pre-wrap', fontSize: 13 }}>{error}</div>}
        </div>
        <div style={{ padding: '14px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, fontSize: 12, color: C.muted }}>{invalid.length ? `${invalid.length} hojas seleccionadas necesitan corregir su configuración.` : 'Solo se leerán las hojas marcadas. Aún no se guardarán cambios.'}</span>
          <button type="button" style={button} onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" style={{ ...button, background: C.dark, color: C.white, opacity: busy || !selected.length || invalid.length ? 0.5 : 1 }} disabled={busy || !selected.length || !!invalid.length} onClick={() => onContinue(buildSheetSelection(sheets), sheets)}>{busy ? 'Preparando vista previa...' : 'Revisar productos'}</button>
        </div>
      </div>
    </div>
  )
}
