'use client'

import { useState, useEffect } from 'react'
import { Instagram, Facebook, Plus, Trash2, CheckCircle2, AlertCircle, Loader2, Shield, Sparkles, Palette, ExternalLink, Key } from 'lucide-react'
import type { Account, Platform, BrandProfile } from '@/lib/types'
import { accountsApi, brandProfileApi } from '@/lib/api'
import { formatNumber, cn } from '@/lib/utils'

interface Props {
  accounts: Account[]
  loading: boolean
  onRefresh: () => void
}

export function AccountManager({ accounts, loading, onRefresh }: Props) {
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="space-y-5">
      {/* Banner informativo con instrucciones reales */}
      <div style={{ borderRadius: '12px', border: '0.5px solid #2C2C2A', backgroundColor: '#1C1C1A', overflow: 'hidden' }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle">
          <Key size={14} style={{ color: '#888780' }} />
          <p className="text-sm font-medium text-slate-200">Para publicar en cuentas reales necesitás:</p>
        </div>

        <div className="divide-y divide-border-subtle">
          {/* OpenAI */}
          <div className="flex items-start gap-3 px-4 py-3">
            <span className="text-base mt-0.5">🤖</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-300 mb-0.5">OpenAI API Key — para generar imagen y caption con IA</p>
              <p className="text-xs text-slate-500 mb-1.5">
                Creá una key en <span className="text-slate-400">platform.openai.com/api-keys</span> y pegala en <code className="bg-surface-300 px-1 rounded text-slate-300">backend/.env</code>:
              </p>
              <code style={{ fontSize: '11px', color: '#7cb87c', backgroundColor: '#0f1f0f', padding: '2px 8px', borderRadius: '4px', border: '0.5px solid #1a3a1a' }}>
                OPENAI_API_KEY=sk-proj-...
              </code>
            </div>
          </div>

          {/* Instagram */}
          <div className="flex items-start gap-3 px-4 py-3">
            <span className="text-base mt-0.5">📸</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-300 mb-0.5">Instagram Business — Page Access Token + IG Account ID</p>
              <ol className="text-xs text-slate-500 space-y-1 list-decimal list-inside mb-2">
                <li>Tu cuenta de Instagram debe ser <span className="text-slate-300">Business o Creator</span> (no personal)</li>
                <li>Vinculala a una <span className="text-slate-300">Página de Facebook</span></li>
                <li>Creá una App en <span className="text-slate-400">developers.facebook.com</span></li>
                <li>Generá un <span className="text-slate-300">Page Access Token</span> (de larga duración) con permisos: <code className="bg-surface-300 px-1 rounded">instagram_content_publish</code>, <code className="bg-surface-300 px-1 rounded">instagram_basic</code></li>
                <li>Obtené tu <span className="text-slate-300">Instagram Business Account ID</span> via <code className="bg-surface-300 px-1 rounded">GET /{`{page-id}`}?fields=instagram_business_account</code></li>
              </ol>
              <p className="text-xs text-slate-500">Al agregar la cuenta usá el <strong className="text-slate-300">Instagram Business Account ID</strong> como "ID de cuenta".</p>
            </div>
          </div>

          {/* Facebook */}
          <div className="flex items-start gap-3 px-4 py-3">
            <span className="text-base mt-0.5">👥</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-300 mb-0.5">Facebook — Page Access Token + Page ID</p>
              <ol className="text-xs text-slate-500 space-y-1 list-decimal list-inside">
                <li>Necesitás ser admin de una <span className="text-slate-300">Página de Facebook</span></li>
                <li>Generá un <span className="text-slate-300">Page Access Token</span> con permisos: <code className="bg-surface-300 px-1 rounded">pages_manage_posts</code>, <code className="bg-surface-300 px-1 rounded">pages_read_engagement</code></li>
                <li>El <span className="text-slate-300">Page ID</span> lo encontrás en Configuración → Información de la página</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      {/* Lista de cuentas */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="section-title mb-0">
            Cuentas ({accounts.length})
          </h3>
          <button onClick={() => setShowForm(v => !v)} className="btn-primary text-sm">
            <Plus size={15} />
            Agregar cuenta
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="animate-spin" style={{ color: '#888780' }} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {accounts.map(account => (
              <AccountCard key={account.id} account={account} onRefresh={onRefresh} />
            ))}

            {/* Placeholder de nueva cuenta */}
            <button
              onClick={() => setShowForm(true)}
              className="card border-dashed transition-all group min-h-[160px] flex flex-col items-center justify-center gap-3" style={{ borderStyle: 'dashed', borderColor: '#2C2C2A' }}
            >
              <div className="w-10 h-10 rounded-xl border border-border-subtle flex items-center justify-center transition-all" style={{ backgroundColor: '#2C2C2A' }}>
                <Plus size={18} style={{ color: '#555552' }} />
              </div>
              <p className="text-sm text-slate-500 group-hover:text-slate-300 transition-colors">Conectar nueva cuenta</p>
            </button>
          </div>
        )}
      </div>

      {/* Formulario de conexión */}
      {showForm && (
        <ConnectAccountForm
          onClose={() => setShowForm(false)}
          onConnected={onRefresh}
        />
      )}

      {/* Horarios óptimos */}
      <OptimalTimesPanel />
    </div>
  )
}

function AccountCard({ account, onRefresh }: { account: Account; onRefresh: () => void }) {
  const [verifying, setVerifying] = useState(false)
  const [verified, setVerified] = useState<boolean | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [brandProfile, setBrandProfile] = useState<BrandProfile | null | undefined>(undefined)

  useEffect(() => {
    brandProfileApi.get(account.id)
      .then(d => setBrandProfile(d.profile))
      .catch(() => setBrandProfile(null))
  }, [account.id])

  async function handleVerify() {
    setVerifying(true)
    try {
      const res = await accountsApi.verify(account.id)
      setVerified(res.valid)
    } finally {
      setVerifying(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`¿Desconectar "${account.name}"?`)) return
    setDeleting(true)
    try {
      await accountsApi.delete(account.id)
      onRefresh()
    } finally {
      setDeleting(false)
    }
  }

  async function handleAnalyze() {
    setAnalyzing(true)
    try {
      const res = await brandProfileApi.analyze(account.id)
      setBrandProfile(res.profile)
    } finally {
      setAnalyzing(false)
    }
  }

  const isConnected = account.status === 'connected'
  const PlatformIcon = account.platform === 'instagram' ? Instagram : Facebook
  const hasProfile = brandProfile != null
  const analyzedDaysAgo = brandProfile?.analyzed_at
    ? Math.floor((Date.now() - new Date(brandProfile.analyzed_at).getTime()) / (1000 * 60 * 60 * 24))
    : null

  return (
    <div className="card group relative">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg"
            style={{ backgroundColor: account.avatar_color }}
          >
            {account.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200">{account.name}</p>
            <p className="text-xs text-slate-500">{account.username || 'Sin usuario'}</p>
          </div>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-surface-100 rounded-lg px-3 py-2 text-center">
          <p className="text-lg font-bold text-slate-200">{account.total_published ?? 0}</p>
          <p className="text-[10px] text-slate-500">Publicadas</p>
        </div>
        <div className="bg-surface-100 rounded-lg px-3 py-2 text-center">
          <p className="text-lg font-bold text-blue-400">{account.total_scheduled ?? 0}</p>
          <p className="text-[10px] text-slate-500">Programadas</p>
        </div>
      </div>

      {/* Brand Profile badge o botón de análisis */}
      {brandProfile === undefined ? null : hasProfile ? (
        <div className="mb-4 p-3 rounded-xl" style={{ backgroundColor: '#1C1C1A', border: '0.5px solid #2C2C2A' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Palette size={12} style={{ color: '#888780' }} />
              <span className="text-xs font-semibold" style={{ color: '#F5F5F3' }}>Perfil de Marca IA</span>
            </div>
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="text-[10px] flex items-center gap-1 transition-colors" style={{ color: '#555552' }}
            >
              {analyzing ? <Loader2 size={10} className="animate-spin" /> : null}
              {analyzedDaysAgo === 0 ? 'hoy' : analyzedDaysAgo === 1 ? 'hace 1 día' : `hace ${analyzedDaysAgo}d`} · Re-analizar
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {brandProfile.visual_style?.colors?.slice(0, 3).map((color, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-surface-300 text-slate-400 border border-border-subtle">
                {color}
              </span>
            ))}
            {brandProfile.visual_style?.aesthetic && (
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: '#2C2C2A', color: '#888780', border: '0.5px solid #3C3C3A' }}>
                {brandProfile.visual_style.aesthetic}
              </span>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          className="w-full mb-4 flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed transition-all" style={{ borderColor: '#2C2C2A', color: '#555552', backgroundColor: 'transparent', fontSize: '12px', cursor: 'pointer' }}
        >
          {analyzing ? (
            <><Loader2 size={12} className="animate-spin" /> Analizando perfil...</>
          ) : (
            <><Sparkles size={12} /> Analizar Perfil con IA</>
          )}
        </button>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-border-subtle">
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-5 h-5 rounded flex items-center justify-center',
            account.platform === 'instagram' ? 'bg-pink-500/15' : 'bg-blue-500/15'
          )}>
            <PlatformIcon size={12} className={account.platform === 'instagram' ? 'text-pink-400' : 'text-blue-400'} />
          </div>
          <span className={cn(
            'flex items-center gap-1 text-xs font-medium',
            isConnected ? 'text-emerald-400' : 'text-slate-500'
          )}>
            {isConnected
              ? <><CheckCircle2 size={11} /> Conectado</>
              : <><AlertCircle size={11} /> Desconectado</>
            }
          </span>
        </div>

        <button
          onClick={handleVerify}
          disabled={verifying}
          className="text-xs flex items-center gap-1 transition-colors" style={{ color: '#555552' }}
        >
          {verifying
            ? <Loader2 size={11} className="animate-spin" />
            : verified === true
              ? <CheckCircle2 size={11} className="text-emerald-400" />
              : verified === false
                ? <AlertCircle size={11} className="text-red-400" />
                : null
          }
          Verificar
        </button>
      </div>
    </div>
  )
}

function ConnectAccountForm({ onClose, onConnected }: { onClose: () => void; onConnected: () => void }) {
  const [platform, setPlatform] = useState<Platform>('instagram')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [pageId, setPageId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await accountsApi.create({
        name, platform, username,
        page_id: pageId || undefined,
        access_token: accessToken || undefined,
      })
      onConnected()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al conectar cuenta')
    } finally {
      setSaving(false)
    }
  }

  const pageIdLabel = platform === 'instagram' ? 'Instagram Business Account ID' : 'Facebook Page ID'
  const pageIdPlaceholder = platform === 'instagram' ? '17841400000000000' : '123456789012345'

  return (
    <div className="card" style={{ borderColor: '#2C2C2A' }}>
      <h3 className="text-sm font-semibold text-slate-200 mb-4">Conectar nueva cuenta</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Plataforma */}
        <div>
          <label className="label">Plataforma</label>
          <div className="flex gap-3">
            {(['instagram', 'facebook'] as Platform[]).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-all',
                  platform === p
                    ? p === 'instagram'
                      ? 'bg-pink-500/15 border-pink-500/40 text-pink-300'
                      : 'bg-blue-500/15 border-blue-500/40 text-blue-300'
                    : 'bg-surface-100 border-border-subtle text-slate-400 hover:text-slate-300'
                )}
              >
                {p === 'instagram' ? <Instagram size={15} /> : <Facebook size={15} />}
                <span className="capitalize">{p}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Nombre de la cuenta *</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Mi Marca" required />
          </div>
          <div>
            <label className="label">Usuario / Handle</label>
            <input className="input" value={username} onChange={e => setUsername(e.target.value)} placeholder="@usuario" />
          </div>
        </div>

        <div>
          <label className="label">
            {pageIdLabel} <span className="text-slate-600">(necesario para publicar)</span>
          </label>
          <input
            className="input font-mono text-xs"
            value={pageId}
            onChange={e => setPageId(e.target.value)}
            placeholder={pageIdPlaceholder}
          />
          <p className="text-xs text-slate-600 mt-1">
            {platform === 'instagram'
              ? 'Obtenelo via Graph API: GET /{page-id}?fields=instagram_business_account'
              : 'Lo encontrás en Configuración → Información de la página de Facebook'}
          </p>
        </div>

        <div>
          <label className="label">
            Page Access Token <span className="text-slate-600">(necesario para publicar)</span>
          </label>
          <input
            className="input font-mono text-xs"
            value={accessToken}
            onChange={e => setAccessToken(e.target.value)}
            placeholder="EAABsm..."
            type="password"
          />
          <p className="text-xs text-slate-600 mt-1">
            Token de larga duración con permisos de publicación. Generalo en Meta for Developers.
          </p>
        </div>

        {!accessToken && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-surface-100 border border-border-subtle text-xs text-slate-500">
            <Shield size={12} className="flex-shrink-0" />
            Sin token → la cuenta queda en modo demo (simulará las publicaciones)
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400 flex items-center gap-2">
            <AlertCircle size={14} /> {error}
          </p>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">
            Cancelar
          </button>
          <button type="submit" disabled={saving || !name} className="btn-primary flex-1 justify-center">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {accessToken ? 'Conectar cuenta real' : 'Agregar en demo'}
          </button>
        </div>
      </form>
    </div>
  )
}

function OptimalTimesPanel() {
  const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
  const times = {
    instagram: ['08:00', '09:00', '09:00', '08:00', '09:00', '10:00', '11:00'],
    facebook:  ['13:00', '14:00', '13:00', '14:00', '13:00', '12:00', '13:00'],
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <CheckCircle2 size={16} style={{ color: '#888780' }} />
        <h3 className="section-title mb-0">Horarios óptimos para publicar</h3>
        <span className="text-xs text-slate-500 ml-auto">Basado en estudios 2024-25</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="text-left py-2 pr-4 text-slate-500 font-medium">Día</th>
              <th className="text-left py-2 px-3 text-pink-400 font-medium">
                <span className="flex items-center gap-1"><Instagram size={11} /> Instagram</span>
              </th>
              <th className="text-left py-2 px-3 text-blue-400 font-medium">
                <span className="flex items-center gap-1"><Facebook size={11} /> Facebook</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {days.map((day, i) => (
              <tr key={day} className="border-b border-border-subtle/50 hover:bg-surface-200/50 transition-colors">
                <td className="py-2.5 pr-4 text-slate-400 font-medium">{day}</td>
                <td className="py-2.5 px-3">
                  <span className="bg-pink-500/10 text-pink-400 px-2 py-0.5 rounded-full">{times.instagram[i]}</span>
                </td>
                <td className="py-2.5 px-3">
                  <span className="bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full">{times.facebook[i]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-600 mt-3">
        💡 Los mejores días son martes, miércoles y jueves. Conectá tus métricas reales de Meta para obtener datos personalizados.
      </p>
    </div>
  )
}
