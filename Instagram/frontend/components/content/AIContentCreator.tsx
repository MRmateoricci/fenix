'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Sparkles, Image as ImageIcon, Type, Hash, Calendar,
  ChevronDown, Loader2, CheckCircle2, AlertCircle, Clock, Palette,
  Upload, Camera, Star, TrendingUp, Lightbulb, X, RefreshCw,
  CheckCircle, AlertTriangle
} from 'lucide-react'
import { aiApi, postsApi, accountsApi, brandProfileApi, analyticsApi } from '@/lib/api'
import type { AIGenerationResult, Account, PostTone, Platform, BrandProfile, PhotoAnalysisResult } from '@/lib/types'
import { TONES, NICHES, cn } from '@/lib/utils'

interface Props {
  onGenerated: (result: AIGenerationResult) => void
  onSaved: (post: import('@/lib/types').Post) => void
}

type Step = 'config' | 'generating' | 'review' | 'schedule'
type ImageMode = 'ai' | 'upload'

export function AIContentCreator({ onGenerated, onSaved }: Props) {
  const [step, setStep] = useState<Step>('config')
  const [imageMode, setImageMode] = useState<ImageMode>('ai')
  const [accounts, setAccounts] = useState<Account[]>([])

  // Form state
  const [niche, setNiche] = useState('general')
  const [tone, setTone] = useState<PostTone>('casual')
  const [prompt, setPrompt] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(['instagram'])
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null)

  // Upload mode state
  const [uploadedImage, setUploadedImage] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [photoAnalysis, setPhotoAnalysis] = useState<PhotoAnalysisResult | null>(null)
  const [generatingEnhanced, setGeneratingEnhanced] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Generated state
  const [result, setResult] = useState<AIGenerationResult | null>(null)
  const [editedCaption, setEditedCaption] = useState('')
  const [editedHashtags, setEditedHashtags] = useState<string[]>([])

  // Schedule state
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('12:00')
  const [optimalTimes, setOptimalTimes] = useState<{ best_days: string[]; peak: string; slots: string[] } | null>(null)

  // UI state
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [brandProfile, setBrandProfile] = useState<BrandProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(false)

  useEffect(() => {
    accountsApi.list().then(d => {
      const connected = d.accounts.filter(a => a.status === 'connected')
      setAccounts(connected)
      if (connected.length > 0) setSelectedAccount(connected[0].id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (niche) {
      aiApi.suggestions(niche).then(d => setSuggestions(d.suggestions)).catch(() => {})
    }
  }, [niche])

  useEffect(() => {
    if (!selectedAccount) { setBrandProfile(null); return }
    setLoadingProfile(true)
    brandProfileApi.get(selectedAccount)
      .then(d => setBrandProfile(d.profile))
      .catch(() => setBrandProfile(null))
      .finally(() => setLoadingProfile(false))
  }, [selectedAccount])

  // Fetch optimal times when user reaches the schedule step
  useEffect(() => {
    if (step !== 'schedule') return
    analyticsApi.optimalTimes(niche).then(data => {
      const sched = data.schedule as {
        weekly: Record<string, { instagram: string[]; facebook: string[] }>
        niche_specific: { best_days: string[]; peak: string }
      }
      const platform = selectedPlatforms[0] || 'instagram'
      const bestDays = sched.niche_specific?.best_days || []
      const peak = sched.niche_specific?.peak || ''
      // collect the peak-slot times for the best days on the selected platform
      const slots: string[] = []
      bestDays.forEach(day => {
        const daySlots = sched.weekly[day]?.[platform as 'instagram' | 'facebook'] || []
        daySlots.forEach(t => { if (!slots.includes(t)) slots.push(t) })
      })
      setOptimalTimes({ best_days: bestDays, peak, slots: slots.slice(0, 4) })
    }).catch(() => {})
  }, [step, niche, selectedPlatforms])

  // Return the next date string (YYYY-MM-DD) for a given Spanish day name
  function nextDateForDay(dayName: string): string {
    const map: Record<string, number> = {
      lunes: 1, martes: 2, miercoles: 3, jueves: 4,
      viernes: 5, sabado: 6, domingo: 0,
    }
    const target = map[dayName.toLowerCase()]
    if (target === undefined) return ''
    const today = new Date()
    const todayDay = today.getDay()
    let diff = target - todayDay
    if (diff <= 0) diff += 7
    const next = new Date(today)
    next.setDate(today.getDate() + diff)
    return next.toISOString().split('T')[0]
  }

  function applyOptimalSlot(day: string, time: string) {
    setScheduledDate(nextDateForDay(day))
    setScheduledTime(time)
  }

  // ── File upload handlers ─────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    loadFile(file)
    e.target.value = ''
  }

  function loadFile(file: File) {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => setUploadedImage(reader.result as string)
    reader.readAsDataURL(file)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave() {
    setIsDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) loadFile(file)
  }

  function switchMode(mode: ImageMode) {
    setImageMode(mode)
    if (mode === 'ai') { setUploadedImage(null); setPhotoAnalysis(null) }
    if (mode === 'upload') { setResult(null); setPhotoAnalysis(null) }
  }

  // ── AI handlers ──────────────────────────────────────────────────────────────

  async function handleGenerate() {
    setStep('generating')
    setError('')
    try {
      const res = await aiApi.generate({
        niche, tone, prompt: prompt || undefined,
        platform: selectedPlatforms[0],
        includeImage: true,
        includeCaption: true,
        accountId: brandProfile && selectedAccount ? selectedAccount : undefined,
      })
      setResult(res)
      setEditedCaption(res.caption || '')
      setEditedHashtags(res.hashtags || [])
      onGenerated(res)
      setStep('review')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al generar contenido')
      setStep('config')
    }
  }

  async function handleAnalyzePhoto() {
    if (!uploadedImage) return
    setStep('generating')
    setError('')
    try {
      const analysis = await aiApi.analyzePhoto({
        image_base64: uploadedImage,
        niche, tone,
        platform: selectedPlatforms[0],
      })
      setPhotoAnalysis(analysis)
      setEditedCaption(analysis.suggested_caption || '')
      setEditedHashtags(analysis.suggested_hashtags || [])
      const fakeResult: AIGenerationResult = {
        image_url: uploadedImage,
        image_is_mock: false,
        caption: analysis.suggested_caption,
        hashtags: analysis.suggested_hashtags,
      }
      setResult(fakeResult)
      onGenerated(fakeResult)
      setStep('review')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al analizar la foto')
      setStep('config')
    }
  }

  async function handleEnhancePhoto() {
    if (!photoAnalysis?.enhanced_image_prompt) return
    setGeneratingEnhanced(true)
    try {
      const res = await aiApi.generate({
        niche, tone,
        prompt: photoAnalysis.enhanced_image_prompt,
        platform: selectedPlatforms[0],
        includeImage: true,
        includeCaption: false,
      })
      setResult(prev => prev ? { ...prev, image_url: res.image_url, image_is_mock: res.image_is_mock } : res)
    } catch {
      // silent — keep original
    } finally {
      setGeneratingEnhanced(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const scheduledAt = scheduledDate
        ? new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString()
        : null

      const imageUrl = imageMode === 'upload' && uploadedImage && result?.image_url === uploadedImage
        ? undefined  // don't persist base64 blob — no real URL yet
        : result?.image_url || undefined

      const post = await postsApi.create({
        account_id: selectedAccount || undefined,
        platforms: selectedPlatforms,
        image_url: imageUrl,
        caption: editedCaption,
        hashtags: editedHashtags,
        scheduled_at: scheduledAt || undefined,
        tone,
        niche,
        prompt: prompt || undefined,
      })
      onSaved(post)
      setStep('config')
      setResult(null)
      setPrompt('')
      setUploadedImage(null)
      setPhotoAnalysis(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const togglePlatform = (p: Platform) => {
    setSelectedPlatforms(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    )
  }

  const removeHashtag = (tag: string) =>
    setEditedHashtags(prev => prev.filter(h => h !== tag))

  const addHashtag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const val = (e.target as HTMLInputElement).value.trim().replace(/^#/, '')
      if (val && !editedHashtags.includes(val)) {
        setEditedHashtags(prev => [...prev, val]);
        (e.target as HTMLInputElement).value = ''
      }
    }
  }

  const minDate = new Date().toISOString().split('T')[0]

  // ── Score color helper ────────────────────────────────────────────────────────

  function scoreColor(score: number) {
    if (score >= 8) return '#4ade80'
    if (score >= 5) return '#fb923c'
    return '#f87171'
  }

  return (
    <div className="card space-y-0">
      {/* Steps indicator */}
      <div className="flex items-center gap-3 mb-6 pb-5 border-b border-border-subtle">
        {(['config', 'review', 'schedule'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div style={{
              width: '24px', height: '24px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', fontWeight: 500,
              backgroundColor: step === s ? '#E8E8E4'
                : (step === 'review' && s === 'config') || (step === 'schedule' && s !== 'schedule')
                  ? '#1a2e1a' : '#2C2C2A',
              color: step === s ? '#0D0D0C'
                : (step === 'review' && s === 'config') || (step === 'schedule' && s !== 'schedule')
                  ? '#7cb87c' : '#444441',
            }}>
              {(step === 'review' && s === 'config') || (step === 'schedule' && s !== 'schedule')
                ? <CheckCircle2 size={14} />
                : i + 1}
            </div>
            <span className={cn(
              'text-xs font-medium',
              step === s ? 'text-slate-200' : 'text-slate-500'
            )}>
              {s === 'config' ? 'Configurar' : s === 'review' ? 'Revisar' : 'Programar'}
            </span>
            {i < 2 && <div className="w-8 h-px bg-border-subtle" />}
          </div>
        ))}
      </div>

      {/* STEP 1: Configuración */}
      {step === 'config' && (
        <div className="space-y-5">

          {/* Mode toggle */}
          <div>
            <label className="label">Modo de imagen</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { mode: 'ai' as ImageMode, icon: Sparkles, label: 'Generar con IA', desc: 'DALL-E 3 crea la imagen' },
                { mode: 'upload' as ImageMode, icon: Upload, label: 'Subir mi foto', desc: 'IA analiza y mejora la tuya' },
              ].map(({ mode, icon: Icon, label, desc }) => (
                <button
                  key={mode}
                  onClick={() => switchMode(mode)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 12px', borderRadius: '8px', textAlign: 'left',
                    border: '0.5px solid', cursor: 'pointer', transition: 'all 0.1s',
                    backgroundColor: imageMode === mode ? '#2C2C2A' : 'transparent',
                    borderColor: imageMode === mode ? '#3C3C3A' : '#2C2C2A',
                  }}
                >
                  <Icon size={15} style={{ color: imageMode === mode ? '#E8E8E4' : '#555552', flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 500, color: imageMode === mode ? '#F5F5F3' : '#888780' }}>{label}</p>
                    <p style={{ fontSize: '11px', color: '#555552' }}>{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Nicho */}
          <div>
            <label className="label">Nicho / Industria</label>
            <div className="grid grid-cols-3 gap-2">
              {NICHES.map(n => (
                <button
                  key={n.value}
                  onClick={() => setNiche(n.value)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 12px', borderRadius: '8px', fontSize: '13px',
                    border: '0.5px solid',
                    cursor: 'pointer', transition: 'all 0.1s',
                    backgroundColor: niche === n.value ? '#2C2C2A' : 'transparent',
                    borderColor: niche === n.value ? '#3C3C3A' : '#2C2C2A',
                    color: niche === n.value ? '#F5F5F3' : '#888780',
                    fontWeight: niche === n.value ? 500 : 400,
                  }}
                >
                  <span>{n.emoji}</span>
                  <span className="truncate">{n.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tono */}
          <div>
            <label className="label">Tono de comunicación</label>
            <div className="grid grid-cols-2 gap-2">
              {TONES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setTone(t.value as PostTone)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 12px', borderRadius: '8px', textAlign: 'left',
                    border: '0.5px solid', cursor: 'pointer', transition: 'all 0.1s',
                    backgroundColor: tone === t.value ? '#2C2C2A' : 'transparent',
                    borderColor: tone === t.value ? '#3C3C3A' : '#2C2C2A',
                  }}
                >
                  <span style={{ fontSize: '18px' }}>{t.emoji}</span>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 500, color: tone === t.value ? '#F5F5F3' : '#888780' }}>{t.label}</p>
                    <p style={{ fontSize: '11px', color: '#555552' }}>{t.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Content: text prompt (AI mode) or image upload (upload mode) */}
          {imageMode === 'ai' ? (
            <div>
              <label className="label">
                Descripción del contenido <span className="text-slate-600">(opcional)</span>
              </label>
              <textarea
                className="input resize-none h-24"
                placeholder={`Ej: "Foto de un plato de pasta casera con salsa de tomate fresco, fondo rústico con madera y hierbas frescas"...`}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
              />
              {suggestions.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-slate-500 mb-1.5">Ideas para tu nicho:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.slice(0, 3).map(s => (
                      <button
                        key={s}
                        onClick={() => setPrompt(s)}
                        className="text-xs px-2.5 py-1 rounded-full bg-surface-300 text-slate-400 hover:text-slate-200 hover:bg-surface-400 border border-border-subtle transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="label">Tu foto</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              {uploadedImage ? (
                <div className="relative rounded-xl overflow-hidden border border-border-subtle" style={{ aspectRatio: '4/3' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={uploadedImage} alt="Foto subida" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 hover:bg-black/40 transition-all flex items-center justify-center opacity-0 hover:opacity-100 gap-3">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 text-slate-900 text-xs font-medium"
                    >
                      <Camera size={13} /> Cambiar foto
                    </button>
                    <button
                      onClick={() => setUploadedImage(null)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/80 text-white text-xs font-medium"
                    >
                      <X size={13} /> Quitar
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  style={{
                    border: `1.5px dashed ${isDragging ? '#888780' : '#3C3C3A'}`,
                    borderRadius: '12px', padding: '32px 24px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                    cursor: 'pointer', transition: 'all 0.15s',
                    backgroundColor: isDragging ? '#1C1C1A' : 'transparent',
                  }}
                >
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '10px',
                    backgroundColor: '#2C2C2A', border: '0.5px solid #3C3C3A',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Upload size={20} style={{ color: '#555552' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: '13px', color: '#888780', fontWeight: 500 }}>
                      Arrastrá o hacé clic para subir tu foto
                    </p>
                    <p style={{ fontSize: '11px', color: '#444441', marginTop: '4px' }}>
                      JPG, PNG, WEBP · hasta 10MB
                    </p>
                  </div>
                </div>
              )}
              {uploadedImage && (
                <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                  <Sparkles size={11} />
                  La IA analizará tu foto y te dará recomendaciones para mejorarla
                </p>
              )}
            </div>
          )}

          {/* Plataformas */}
          <div>
            <label className="label">Publicar en</label>
            <div className="flex gap-3">
              {(['instagram', 'facebook'] as Platform[]).map(p => (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all',
                    selectedPlatforms.includes(p)
                      ? p === 'instagram'
                        ? 'bg-pink-500/15 border-pink-500/40 text-pink-300'
                        : 'bg-blue-500/15 border-blue-500/40 text-blue-300'
                      : 'bg-surface-100 border-border-subtle text-slate-500 hover:text-slate-300'
                  )}
                >
                  <span>{p === 'instagram' ? '📸' : '👥'}</span>
                  <span className="capitalize">{p}</span>
                  {selectedPlatforms.includes(p) && <CheckCircle2 size={13} />}
                </button>
              ))}
            </div>
          </div>

          {/* Cuenta */}
          {accounts.length > 0 && (
            <div>
              <label className="label">Cuenta</label>
              <select
                className="input"
                value={selectedAccount || ''}
                onChange={e => setSelectedAccount(Number(e.target.value))}
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.platform})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Brand Profile banner (AI mode only) */}
          {imageMode === 'ai' && selectedAccount && (
            <div className={cn(
              'flex items-start gap-2.5 p-3 rounded-xl border text-xs transition-all',
              loadingProfile
                ? 'bg-surface-200 border-border-subtle text-slate-500'
                : brandProfile
                  ? ''
                  : 'bg-surface-100 border-border-subtle'
            )}>
              {loadingProfile ? (
                <><Loader2 size={13} className="animate-spin mt-0.5 flex-shrink-0" /><span className="text-slate-500">Cargando perfil de marca...</span></>
              ) : brandProfile ? (
                <>
                  <Palette size={13} style={{ color: '#888780', marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: 500, color: '#F5F5F3' }}>Usando perfil de marca de la cuenta</p>
                    <p className="text-slate-400 mt-0.5">
                      Estética <span className="text-slate-300">{brandProfile.visual_style?.aesthetic}</span>
                      {' · '}Tono <span className="text-slate-300">{brandProfile.tone_voice?.formality}</span>
                      {' · '}{brandProfile.posts_analyzed} posts analizados
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Sparkles size={13} className="text-slate-500 mt-0.5 flex-shrink-0" />
                  <p className="text-slate-500">
                    Sin perfil de marca — andá a <span className="text-slate-300">Cuentas</span> y hacé clic en "Analizar Perfil con IA" para personalizar la generación.
                  </p>
                </>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle size={15} />
              {error}
            </div>
          )}

          {imageMode === 'ai' ? (
            <button
              onClick={handleGenerate}
              disabled={selectedPlatforms.length === 0}
              className="btn-primary w-full justify-center py-3 text-sm font-semibold"
            >
              <Sparkles size={16} />
              Generar con IA
            </button>
          ) : (
            <button
              onClick={handleAnalyzePhoto}
              disabled={!uploadedImage || selectedPlatforms.length === 0}
              className="btn-primary w-full justify-center py-3 text-sm font-semibold"
              style={{ opacity: !uploadedImage ? 0.5 : 1 }}
            >
              <Camera size={16} />
              Analizar foto con IA
            </button>
          )}
        </div>
      )}

      {/* STEP: Generando */}
      {step === 'generating' && (
        <div style={{ padding: '64px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '14px', backgroundColor: '#2C2C2A', border: '0.5px solid #3C3C3A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader2 size={24} className="animate-spin" style={{ color: '#888780' }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#F5F5F3', fontWeight: 500, fontSize: '14px' }}>
              {imageMode === 'upload' ? 'Analizando tu foto con IA...' : 'Generando contenido con IA...'}
            </p>
            <p style={{ color: '#555552', fontSize: '12px', marginTop: '4px' }}>
              {imageMode === 'upload' ? 'GPT-4o Vision está examinando tu foto' : brandProfile ? 'DALL-E 3 + GPT-4o · usando tu estilo de marca' : 'DALL-E 3 + GPT-4o están trabajando'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginTop: '8px' }}>
            {(imageMode === 'upload'
              ? [{ icon: Camera, label: 'Análisis' }, { icon: TrendingUp, label: 'Tips' }, { icon: Hash, label: 'Hashtags' }]
              : [{ icon: ImageIcon, label: 'Imagen' }, { icon: Type, label: 'Caption' }, { icon: Hash, label: 'Hashtags' }]
            ).map(({ icon: Icon, label }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '0.5px solid #2C2C2A', backgroundColor: '#1C1C1A' }}>
                  <Icon size={16} style={{ color: '#888780' }} />
                </div>
                <span style={{ fontSize: '11px', color: '#555552' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2: Revisión */}
      {step === 'review' && result && (
        <div className="space-y-5">
          {result.image_is_mock && imageMode === 'ai' && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
              <AlertCircle size={13} />
              Imagen de demo — configurá OPENAI_API_KEY para generar imágenes reales
            </div>
          )}

          {/* Photo analysis panel (upload mode only) */}
          {imageMode === 'upload' && photoAnalysis && (
            <div className="space-y-3">
              {photoAnalysis.is_mock && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                  <AlertCircle size={13} />
                  Análisis de demo — configurá OPENAI_API_KEY para análisis real con GPT-4o Vision
                </div>
              )}

              {/* Image preview + score */}
              <div className="rounded-xl overflow-hidden border border-border-subtle" style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.image_url || ''}
                  alt="Tu foto"
                  style={{ width: '100%', maxHeight: '220px', objectFit: 'cover', display: 'block' }}
                />
                {/* Score badge */}
                <div style={{
                  position: 'absolute', top: '10px', right: '10px',
                  backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: '8px',
                  padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px',
                  border: `1px solid ${scoreColor(photoAnalysis.analysis.score)}33`,
                }}>
                  <Star size={12} style={{ color: scoreColor(photoAnalysis.analysis.score) }} />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: scoreColor(photoAnalysis.analysis.score) }}>
                    {photoAnalysis.analysis.score}/10
                  </span>
                </div>
              </div>

              {/* Product detected */}
              <div style={{
                padding: '10px 12px', borderRadius: '8px',
                backgroundColor: '#1C1C1A', border: '0.5px solid #2C2C2A',
              }}>
                <p style={{ fontSize: '11px', color: '#555552', marginBottom: '2px' }}>Producto detectado</p>
                <p style={{ fontSize: '13px', color: '#F5F5F3', fontWeight: 500 }}>
                  {photoAnalysis.analysis.product_detected}
                </p>
              </div>

              {/* Strengths */}
              {photoAnalysis.analysis.strengths.length > 0 && (
                <div style={{ padding: '10px 12px', borderRadius: '8px', backgroundColor: '#0f1f0f', border: '0.5px solid #1a3a1a' }}>
                  <p style={{ fontSize: '11px', color: '#4ade80', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 500 }}>
                    <CheckCircle size={11} /> Puntos fuertes
                  </p>
                  <ul className="space-y-1">
                    {photoAnalysis.analysis.strengths.map((s, i) => (
                      <li key={i} style={{ fontSize: '12px', color: '#86efac', paddingLeft: '8px', borderLeft: '2px solid #166534' }}>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Improvements */}
              {photoAnalysis.analysis.improvements.length > 0 && (
                <div style={{ padding: '10px 12px', borderRadius: '8px', backgroundColor: '#1f1500', border: '0.5px solid #3a2a00' }}>
                  <p style={{ fontSize: '11px', color: '#fb923c', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 500 }}>
                    <AlertTriangle size={11} /> Para mejorar
                  </p>
                  <ul className="space-y-1">
                    {photoAnalysis.analysis.improvements.map((s, i) => (
                      <li key={i} style={{ fontSize: '12px', color: '#fdba74', paddingLeft: '8px', borderLeft: '2px solid #7c3a00' }}>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Tips */}
              <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#1C1C1A', border: '0.5px solid #2C2C2A' }}>
                <p style={{ fontSize: '11px', color: '#888780', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 500 }}>
                  <Lightbulb size={11} /> Recomendaciones del fotógrafo IA
                </p>
                <div className="space-y-3">
                  {[
                    { key: 'lighting', label: 'Iluminación', emoji: '💡' },
                    { key: 'angle', label: 'Ángulo', emoji: '📐' },
                    { key: 'background', label: 'Fondo', emoji: '🖼️' },
                    { key: 'styling', label: 'Estilismo', emoji: '✨' },
                    { key: 'editing', label: 'Edición', emoji: '🎨' },
                  ].map(({ key, label, emoji }) => (
                    <div key={key}>
                      <p style={{ fontSize: '11px', color: '#888780', marginBottom: '2px' }}>{emoji} {label}</p>
                      <p style={{ fontSize: '12px', color: '#C5C5C1', lineHeight: '1.5' }}>
                        {photoAnalysis.analysis.tips[key as keyof typeof photoAnalysis.analysis.tips]}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Enhance button */}
              <button
                onClick={handleEnhancePhoto}
                disabled={generatingEnhanced}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: '8px', padding: '9px 16px', borderRadius: '8px',
                  border: '0.5px solid #3C3C3A', backgroundColor: '#2C2C2A',
                  color: '#E8E8E4', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                  opacity: generatingEnhanced ? 0.6 : 1, transition: 'all 0.1s',
                }}
              >
                {generatingEnhanced
                  ? <><Loader2 size={14} className="animate-spin" /> Generando versión mejorada...</>
                  : <><RefreshCw size={14} /> Generar versión mejorada con IA (DALL-E)</>
                }
              </button>
            </div>
          )}

          {/* Caption editable */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">Caption</label>
              <span className="text-xs text-slate-500">{editedCaption.length} caracteres</span>
            </div>
            <textarea
              className="input resize-none h-32 text-sm leading-relaxed"
              value={editedCaption}
              onChange={e => setEditedCaption(e.target.value)}
            />
          </div>

          {/* Hashtags editables */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">Hashtags</label>
              <span className={cn('text-xs', editedHashtags.length > 30 ? 'text-red-400' : 'text-slate-500')}>
                {editedHashtags.length}/30
              </span>
            </div>
            <div className="bg-surface-100 border border-border-subtle rounded-lg p-3 min-h-[80px]">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {editedHashtags.map(tag => (
                  <span
                    key={tag}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '20px', backgroundColor: '#2C2C2A', color: '#888780', fontSize: '12px', border: '0.5px solid #3C3C3A', cursor: 'pointer' }}
                    onClick={() => removeHashtag(tag)}
                  >
                    #{tag} ×
                  </span>
                ))}
              </div>
              <input
                className="w-full bg-transparent text-sm text-slate-400 placeholder-slate-600 outline-none"
                placeholder="Escribí un hashtag y presioná Enter..."
                onKeyDown={addHashtag}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setStep('config'); setResult(null); setPhotoAnalysis(null) }}
              className="btn-secondary flex-1 justify-center"
            >
              {imageMode === 'upload' ? 'Cambiar foto' : 'Regenerar'}
            </button>
            <button
              onClick={() => setStep('schedule')}
              className="btn-primary flex-1 justify-center"
            >
              Continuar <ChevronDown size={15} className="rotate-[-90deg]" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Programar */}
      {step === 'schedule' && (
        <div className="space-y-5">
          <div className="p-4 rounded-xl bg-surface-100 border border-border-subtle">
            <p className="text-sm font-medium text-slate-300 mb-1">Contenido listo para publicar</p>
            <p className="text-xs text-slate-500 line-clamp-2">{editedCaption}</p>
            <p style={{ fontSize: '11px', color: '#888780', marginTop: '4px' }}>#{editedHashtags.slice(0, 3).join(' #')}...</p>
          </div>

          {/* Optimal times recommendation */}
          {optimalTimes && (
            <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: '#1C1C1A', border: '0.5px solid #2C2C2A' }}>
              <p style={{ fontSize: '11px', color: '#888780', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 500 }}>
                <TrendingUp size={11} style={{ color: '#4ade80' }} />
                Mejores horarios para tu nicho · {selectedPlatforms[0]}
              </p>

              {/* Best days chips */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {optimalTimes.best_days.map(day => (
                  <span
                    key={day}
                    style={{
                      padding: '2px 8px', borderRadius: '20px', fontSize: '11px',
                      backgroundColor: '#1a2e1a', color: '#86efac',
                      border: '0.5px solid #166534', textTransform: 'capitalize',
                    }}
                  >
                    {day}
                  </span>
                ))}
                {optimalTimes.peak && (
                  <span style={{
                    padding: '2px 8px', borderRadius: '20px', fontSize: '11px',
                    backgroundColor: '#1f1500', color: '#fbbf24',
                    border: '0.5px solid #78350f',
                  }}>
                    Pico: {optimalTimes.peak}
                  </span>
                )}
              </div>

              {/* Quick-fill slot buttons */}
              <p style={{ fontSize: '10px', color: '#555552', marginBottom: '6px' }}>
                Hacé clic para auto-completar fecha y hora:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {optimalTimes.best_days.flatMap(day =>
                  optimalTimes.slots.slice(0, 2).map(time => ({
                    day, time, key: `${day}-${time}`,
                    label: `${day.charAt(0).toUpperCase() + day.slice(1)} · ${time}`,
                  }))
                ).slice(0, 6).map(({ key, day, time, label }) => (
                  <button
                    key={key}
                    onClick={() => applyOptimalSlot(day, time)}
                    style={{
                      padding: '4px 10px', borderRadius: '6px', fontSize: '11px',
                      backgroundColor: '#2C2C2A', cursor: 'pointer', transition: 'all 0.1s',
                      fontWeight: scheduledDate === nextDateForDay(day) && scheduledTime === time ? 600 : 400,
                      borderColor: scheduledDate === nextDateForDay(day) && scheduledTime === time ? '#4ade80' : '#3C3C3A',
                      border: `0.5px solid ${scheduledDate === nextDateForDay(day) && scheduledTime === time ? '#4ade80' : '#3C3C3A'}`,
                      color: scheduledDate === nextDateForDay(day) && scheduledTime === time ? '#4ade80' : '#C5C5C1',
                    } as React.CSSProperties}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="label flex items-center gap-2">
              <Calendar size={14} />
              Fecha y hora de publicación
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                className="input"
                min={minDate}
                value={scheduledDate}
                onChange={e => setScheduledDate(e.target.value)}
              />
              <input
                type="time"
                className="input"
                value={scheduledTime}
                onChange={e => setScheduledTime(e.target.value)}
              />
            </div>
            {!scheduledDate && (
              <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
                <Clock size={11} />
                Sin fecha → se guarda como borrador
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle size={15} />
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep('review')} className="btn-secondary flex-1 justify-center">
              Atrás
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex-1 justify-center"
            >
              {saving ? (
                <><Loader2 size={15} className="animate-spin" /> Guardando...</>
              ) : scheduledDate ? (
                <><Calendar size={15} /> Programar</>
              ) : (
                'Guardar borrador'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
