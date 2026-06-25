import { clsx, type ClassValue } from 'clsx'
import { format, formatDistanceToNow, isToday, isTomorrow, isYesterday } from 'date-fns'
import { es } from 'date-fns/locale'
import type { PostStatus, LogLevel } from './types'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

// Formatear fechas en español
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  if (isToday(date)) return `Hoy ${format(date, 'HH:mm')}`
  if (isTomorrow(date)) return `Mañana ${format(date, 'HH:mm')}`
  if (isYesterday(date)) return `Ayer ${format(date, 'HH:mm')}`
  return format(date, "d MMM, HH:mm", { locale: es })
}

export function formatDateRelative(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: es })
}

export function formatDateFull(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return format(new Date(dateStr), "EEEE d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })
}

// Colores y estilos por estado de publicación
export function getStatusConfig(status: PostStatus) {
  const configs = {
    draft:      { label: 'Borrador',   color: 'border', dot: 'bg-[#555552]',  style: { backgroundColor: '#1C1C1A', color: '#555552', borderColor: '#2C2C2A' } },
    scheduled:  { label: 'Programado', color: 'border', dot: 'bg-[#888780]',  style: { backgroundColor: '#1C1C1A', color: '#888780', borderColor: '#2C2C2A' } },
    publishing: { label: 'Publicando', color: 'border', dot: 'bg-[#888780]',  style: { backgroundColor: '#1C1C1A', color: '#888780', borderColor: '#2C2C2A' } },
    published:  { label: 'Publicado',  color: 'border', dot: 'bg-[#7cb87c]',  style: { backgroundColor: '#1a2e1a', color: '#7cb87c', borderColor: '#2a4a2a' } },
    failed:     { label: 'Fallido',    color: 'border', dot: 'bg-[#b87c7c]',  style: { backgroundColor: '#2e1a1a', color: '#b87c7c', borderColor: '#4a2a2a' } },
  }
  return configs[status] || configs.draft
}

// Colores por nivel de log
export function getLogLevelConfig(level: LogLevel) {
  const configs = {
    info:    { color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    icon: 'ℹ' },
    success: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: '✓' },
    warning: { color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/20',  icon: '⚠' },
    error:   { color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20',     icon: '✕' },
  }
  return configs[level] || configs.info
}

// Icono de plataforma
export function getPlatformConfig(platform: string) {
  if (platform === 'instagram') {
    return { label: 'Instagram', color: 'text-pink-400', bg: 'bg-pink-500/15' }
  }
  return { label: 'Facebook', color: 'text-blue-400', bg: 'bg-blue-500/15' }
}

// Truncar texto
export function truncate(str: string | null | undefined, len = 80): string {
  if (!str) return ''
  return str.length > len ? str.slice(0, len) + '…' : str
}

// Formatear número con K/M
export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

// Días del calendario en español
export const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
export const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// Tonos disponibles
export const TONES = [
  { value: 'casual',       label: 'Casual',        emoji: '😊', desc: 'Cercano y conversacional' },
  { value: 'inspiracional', label: 'Inspiracional', emoji: '✨', desc: 'Motivador y emotivo' },
  { value: 'formal',       label: 'Formal',        emoji: '💼', desc: 'Profesional y serio' },
  { value: 'humoristico',  label: 'Humorístico',   emoji: '😄', desc: 'Divertido y entretenido' },
] as const

// Nichos disponibles
export const NICHES = [
  { value: 'fitness',     label: 'Fitness & Gym',   emoji: '💪' },
  { value: 'gastronomia', label: 'Gastronomía',     emoji: '🍽️' },
  { value: 'lifestyle',   label: 'Lifestyle',       emoji: '🌿' },
  { value: 'moda',        label: 'Moda & Estilo',   emoji: '👗' },
  { value: 'tecnologia',  label: 'Tecnología',      emoji: '💻' },
  { value: 'general',     label: 'General',         emoji: '🌟' },
] as const
