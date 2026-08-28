import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || ''
const COLORS = {
  ink: '#111827',
  text: '#374151',
  muted: '#6B7280',
  border: '#DDE3EA',
  paper: '#FFFFFF',
  soft: '#F7F8FA',
  red: '#CC0000',
  redSoft: '#FDECEC',
  green: '#1A7A3D',
  greenSoft: '#EAF7EF',
  amber: '#9A6700',
  amberSoft: '#FFF7E6',
}

const PHASE_LABELS = {
  queued: 'En espera',
  database: 'Exportando PostgreSQL',
  indexing: 'Verificando archivos',
  archiving: 'Cifrando y empaquetando',
  assembling: 'Uniendo las partes subidas',
  decrypting: 'Descifrando backup',
  validating: 'Validando integridad',
  safety_backup: 'Creando backup preventivo',
  restoring_files: 'Restaurando archivos',
  restoring_database: 'Restaurando PostgreSQL',
  completed: 'Completado',
  failed: 'Falló',
}

function formatBytes(bytes) {
  const value = Number(bytes || 0)
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(2)} GB`
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}/api/admin/backups${path}`, {
    ...options,
    credentials: 'include',
  })
  if (response.status === 401) window.dispatchEvent(new Event('fenix-admin-unauthorized'))
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || 'No se pudo completar la operación')
  }
  if (response.status === 204) return null
  return response.json()
}

const buttonStyle = {
  border: 'none',
  borderRadius: 8,
  padding: '10px 14px',
  font: 'inherit',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}

function ConfigurationStatus({ status }) {
  const configuration = status?.configuration || {}
  const checks = [
    ['Base de datos', configuration.database],
    ['Cifrado', configuration.encryption],
    ['pg_dump', configuration.pgDump?.available],
    ['psql', configuration.psql?.available],
  ]
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {checks.map(([label, ready]) => (
        <span key={label} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 9px', borderRadius: 999,
          background: ready ? COLORS.greenSoft : COLORS.redSoft,
          color: ready ? COLORS.green : COLORS.red,
          fontSize: 11, fontWeight: 600,
        }}>
          <span aria-hidden="true">{ready ? '✓' : '×'}</span>{label}
        </span>
      ))}
    </div>
  )
}

function JobCard({ job }) {
  const failed = job.status === 'failed'
  const complete = job.status === 'completed'
  return (
    <div style={{ border: `1px solid ${failed ? '#E9BABA' : COLORS.border}`, borderRadius: 10, padding: 14, background: COLORS.paper }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <strong style={{ color: COLORS.ink, fontSize: 12.5 }}>
          {job.kind === 'restore' ? 'Restauración' : 'Creación de backup'}
        </strong>
        <span style={{ color: failed ? COLORS.red : complete ? COLORS.green : COLORS.muted, fontSize: 11, fontWeight: 600 }}>
          {PHASE_LABELS[job.phase] || job.phase}
        </span>
      </div>
      <div style={{ height: 7, borderRadius: 999, background: '#ECEFF3', overflow: 'hidden' }}>
        <div style={{
          width: `${Math.max(0, Math.min(100, Number(job.progress || 0)))}%`,
          height: '100%',
          background: failed ? COLORS.red : complete ? COLORS.green : '#2563EB',
          transition: 'width .25s ease',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 7, color: COLORS.muted, fontSize: 10.5 }}>
        <span>{formatDate(job.createdAt)}</span><span>{job.progress || 0}%</span>
      </div>
      {job.error && <p style={{ margin: '10px 0 0', color: COLORS.red, fontSize: 11.5 }}>{job.error}</p>}
      {job.safetyBackupFileName && (
        <p style={{ margin: '10px 0 0', color: COLORS.text, fontSize: 11.5 }}>
          Backup preventivo: <strong>{job.safetyBackupFileName}</strong>
        </p>
      )}
    </div>
  )
}

export default function BackupsTab() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [selectedStored, setSelectedStored] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const fileInputRef = useRef(null)

  const loadStatus = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    try {
      const data = await apiRequest('/')
      setStatus(data)
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])
  useEffect(() => {
    const hasActiveJob = status?.operation || status?.jobs?.some(job => ['queued', 'running'].includes(job.status))
    if (!hasActiveJob) return undefined
    const timer = window.setInterval(() => loadStatus({ quiet: true }), 2000)
    return () => window.clearInterval(timer)
  }, [status?.operation, status?.jobs, loadStatus])

  const visibleJobs = useMemo(() => (status?.jobs || []).slice(0, 5), [status?.jobs])
  const busy = Boolean(status?.operation || submitting)

  async function createBackup() {
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      await apiRequest('/', { method: 'POST' })
      setMessage('El backup comenzó. Podés seguir el progreso desde esta pantalla.')
      await loadStatus({ quiet: true })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function resetRestoreForm() {
    setSelectedFile(null)
    setSelectedStored('')
    setPassword('')
    setConfirmation('')
    setUploadProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function restoreStoredBackup() {
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      await apiRequest(`/files/${encodeURIComponent(selectedStored)}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, confirmation }),
      })
      setMessage('La restauración comenzó. El sistema entrará en mantenimiento durante la etapa final.')
      resetRestoreForm()
      await loadStatus({ quiet: true })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function uploadAndRestore() {
    if (!selectedFile) return
    setSubmitting(true)
    setError('')
    setMessage('')
    setUploadProgress(0)
    try {
      const chunkBytes = status.chunkBytes
      const totalChunks = Math.ceil(selectedFile.size / chunkBytes)
      const upload = await apiRequest('/restore-uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: selectedFile.name,
          totalSize: selectedFile.size,
          totalChunks,
          password,
          confirmation,
        }),
      })

      for (let index = 0; index < totalChunks; index += 1) {
        const start = index * chunkBytes
        const chunk = selectedFile.slice(start, Math.min(selectedFile.size, start + chunkBytes))
        await apiRequest(`/restore-uploads/${upload.id}/chunks/${index}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: chunk,
        })
        setUploadProgress(Math.round(((index + 1) / totalChunks) * 100))
      }

      await apiRequest(`/restore-uploads/${upload.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, confirmation }),
      })
      setMessage('El archivo se subió y la restauración comenzó.')
      resetRestoreForm()
      await loadStatus({ quiet: true })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteBackup() {
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      await apiRequest(`/files/${encodeURIComponent(deleteTarget)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword, confirmation: deleteConfirmation }),
      })
      setMessage('El backup fue eliminado del servidor. La copia que hayas descargado no se modifica.')
      setDeleteTarget('')
      setDeletePassword('')
      setDeleteConfirmation('')
      await loadStatus({ quiet: true })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <p style={{ color: COLORS.muted, fontSize: 12 }}>Cargando configuración de backups…</p>

  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: 980 }}>
      {error && <div style={{ padding: 12, borderRadius: 9, color: COLORS.red, background: COLORS.redSoft, fontSize: 12 }}>{error}</div>}
      {message && <div style={{ padding: 12, borderRadius: 9, color: COLORS.green, background: COLORS.greenSoft, fontSize: 12 }}>{message}</div>}

      <section style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 18, background: COLORS.paper }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, color: COLORS.ink, fontSize: 17 }}>Protección del sistema</h2>
            <p style={{ margin: '6px 0 12px', color: COLORS.muted, fontSize: 11.5, lineHeight: 1.6, maxWidth: 620 }}>
              Cada backup incluye PostgreSQL, imágenes de productos y comprobantes de transferencia. El archivo queda cifrado y debe descargarse fuera del servidor.
            </p>
            <ConfigurationStatus status={status} />
            {status?.storage && (
              <p style={{ margin: '10px 0 0', color: COLORS.muted, fontSize: 10.5 }}>
                Espacio disponible: {formatBytes(status.storage.freeBytes)} de {formatBytes(status.storage.totalBytes)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={createBackup}
            disabled={!status?.configured || busy}
            style={{ ...buttonStyle, color: '#fff', background: !status?.configured || busy ? '#9CA3AF' : COLORS.red }}
          >
            {status?.operation?.kind === 'backup' ? 'Creando backup…' : 'Crear backup completo'}
          </button>
        </div>
        {!status?.configured && (
          <p style={{ margin: '14px 0 0', color: COLORS.amber, background: COLORS.amberSoft, padding: 10, borderRadius: 8, fontSize: 11.5 }}>
            Completá la configuración indicada antes de generar o restaurar backups.
          </p>
        )}
      </section>

      {visibleJobs.length > 0 && (
        <section>
          <h2 style={{ color: COLORS.ink, fontSize: 14, margin: '0 0 9px' }}>Actividad reciente</h2>
          <div style={{ display: 'grid', gap: 9 }}>{visibleJobs.map(job => <JobCard key={job.id} job={job} />)}</div>
        </section>
      )}

      <section style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 18, background: COLORS.paper }}>
        <h2 style={{ margin: 0, color: COLORS.ink, fontSize: 16 }}>Backups disponibles</h2>
        <p style={{ color: COLORS.muted, fontSize: 11.5, margin: '5px 0 14px' }}>
          Descargá cada archivo a otra computadora o almacenamiento externo. No uses el volumen como única copia.
        </p>
        {!status?.backups?.length ? (
          <div style={{ padding: 20, textAlign: 'center', borderRadius: 9, background: COLORS.soft, color: COLORS.muted, fontSize: 12 }}>
            Todavía no se generaron backups desde el sistema.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {status.backups.map(backup => (
              <div key={backup.fileName} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                padding: 12, border: `1px solid ${COLORS.border}`, borderRadius: 9,
              }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ display: 'block', color: COLORS.ink, fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>{backup.fileName}</strong>
                  <span style={{ color: COLORS.muted, fontSize: 10.5 }}>
                    {formatDate(backup.createdAt)} · {formatBytes(backup.size)} · {backup.type === 'pre_restore' ? 'Preventivo' : 'Manual'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
                  <a
                    href={`${API_BASE}/api/admin/backups/files/${encodeURIComponent(backup.fileName)}`}
                    style={{ ...buttonStyle, padding: '7px 10px', color: COLORS.text, background: COLORS.soft, textDecoration: 'none' }}
                  >
                    Descargar
                  </a>
                  <button
                    type="button"
                    disabled={busy || !backup.validHeader}
                    onClick={() => { setSelectedStored(backup.fileName); setSelectedFile(null); setConfirmation(''); setPassword('') }}
                    style={{ ...buttonStyle, padding: '7px 10px', color: COLORS.red, background: COLORS.redSoft }}
                  >
                    Restaurar
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => { setDeleteTarget(backup.fileName); setDeletePassword(''); setDeleteConfirmation('') }}
                    style={{ ...buttonStyle, padding: '7px 10px', color: COLORS.muted, background: COLORS.paper, border: `1px solid ${COLORS.border}` }}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {deleteTarget && (
          <div style={{ marginTop: 12, padding: 13, borderRadius: 9, background: COLORS.amberSoft }}>
            <strong style={{ color: COLORS.amber, fontSize: 12 }}>Eliminar del servidor</strong>
            <p style={{ color: COLORS.text, fontSize: 11.5, margin: '5px 0 10px', overflowWrap: 'anywhere' }}>{deleteTarget}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(180px, 1fr)', gap: 9 }}>
              <input
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={event => setDeletePassword(event.target.value)}
                placeholder="Contraseña administrativa"
                style={{ border: `1px solid ${COLORS.border}`, borderRadius: 7, padding: 9, font: 'inherit', fontSize: 11.5 }}
              />
              <input
                value={deleteConfirmation}
                onChange={event => setDeleteConfirmation(event.target.value)}
                placeholder="Escribí ELIMINAR"
                style={{ border: `1px solid ${COLORS.border}`, borderRadius: 7, padding: 9, font: 'inherit', fontSize: 11.5 }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button type="button" onClick={() => setDeleteTarget('')} disabled={submitting} style={{ ...buttonStyle, color: COLORS.text, background: COLORS.paper }}>Cancelar</button>
              <button
                type="button"
                onClick={deleteBackup}
                disabled={submitting || !deletePassword || deleteConfirmation.trim().toUpperCase() !== 'ELIMINAR'}
                style={{ ...buttonStyle, color: '#fff', background: COLORS.red, opacity: submitting || !deletePassword || deleteConfirmation.trim().toUpperCase() !== 'ELIMINAR' ? 0.5 : 1 }}
              >
                Eliminar backup
              </button>
            </div>
          </div>
        )}
      </section>

      <section style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 18, background: COLORS.paper }}>
        <h2 style={{ margin: 0, color: COLORS.ink, fontSize: 16 }}>Recuperar desde un archivo</h2>
        <p style={{ color: COLORS.muted, fontSize: 11.5, lineHeight: 1.6, margin: '5px 0 14px' }}>
          La restauración reemplaza la base de datos y los archivos actuales. Antes de hacerlo, el sistema generará automáticamente un backup preventivo.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".fenix,application/octet-stream"
          disabled={busy || !status?.configured}
          onChange={event => { setSelectedFile(event.target.files?.[0] || null); setSelectedStored(''); setUploadProgress(0) }}
          style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 10, fontSize: 11.5 }}
        />
        {(selectedFile || selectedStored) && (
          <div style={{ marginTop: 14, padding: 14, borderRadius: 9, background: COLORS.redSoft }}>
            <strong style={{ color: COLORS.red, fontSize: 12 }}>Confirmación requerida</strong>
            <p style={{ color: COLORS.text, fontSize: 11.5, margin: '5px 0 10px' }}>
              {selectedFile ? `${selectedFile.name} (${formatBytes(selectedFile.size)})` : selectedStored}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(180px, 1fr)', gap: 9 }}>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="Contraseña administrativa"
                style={{ border: `1px solid ${COLORS.border}`, borderRadius: 7, padding: 9, font: 'inherit', fontSize: 11.5 }}
              />
              <input
                value={confirmation}
                onChange={event => setConfirmation(event.target.value)}
                placeholder="Escribí RESTAURAR"
                style={{ border: `1px solid ${COLORS.border}`, borderRadius: 7, padding: 9, font: 'inherit', fontSize: 11.5 }}
              />
            </div>
            {submitting && selectedFile && (
              <div style={{ marginTop: 10 }}>
                <div style={{ height: 6, background: '#F3CACA', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${uploadProgress}%`, background: COLORS.red }} />
                </div>
                <span style={{ color: COLORS.muted, fontSize: 10.5 }}>Subida: {uploadProgress}%</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button type="button" disabled={submitting} onClick={resetRestoreForm} style={{ ...buttonStyle, color: COLORS.text, background: COLORS.paper }}>Cancelar</button>
              <button
                type="button"
                disabled={submitting || !password || confirmation.trim().toUpperCase() !== 'RESTAURAR'}
                onClick={selectedFile ? uploadAndRestore : restoreStoredBackup}
                style={{ ...buttonStyle, color: '#fff', background: COLORS.red, opacity: submitting || !password || confirmation.trim().toUpperCase() !== 'RESTAURAR' ? 0.5 : 1 }}
              >
                {submitting ? 'Procesando…' : 'Restaurar sistema'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
