import type {
  Post, Account, DashboardStats, AIGenerationRequest,
  AIGenerationResult, PostStatus, BrandProfile, PhotoAnalysisResult
} from './types'
import { getToken } from './auth'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    ...init,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Error ${res.status}`)
  }
  return res.json()
}

// ── Posts ─────────────────────────────────────────────────────────────────────

export const postsApi = {
  list: (params?: { status?: PostStatus; account_id?: number; limit?: number }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return request<{ posts: Post[]; total: number }>(`/posts${qs}`)
  },
  get: (id: number) => request<Post>(`/posts/${id}`),
  create: (data: Partial<Post>) => request<Post>('/posts', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Post>) =>
    request<Post>(`/posts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request<{ message: string }>(`/posts/${id}`, { method: 'DELETE' }),
  publish: (id: number) =>
    request<{ success: boolean; message: string }>(`/posts/${id}/publish`, { method: 'POST' }),
}

// ── Accounts ──────────────────────────────────────────────────────────────────

export const accountsApi = {
  list: () => request<{ accounts: Account[] }>('/accounts'),
  get: (id: number) => request<Account>(`/accounts/${id}`),
  create: (data: Partial<Account>) =>
    request<Account>('/accounts', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Account>) =>
    request<Account>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request<{ message: string }>(`/accounts/${id}`, { method: 'DELETE' }),
  verify: (id: number) =>
    request<{ valid: boolean; message: string }>(`/accounts/${id}/verify`, { method: 'POST' }),
}

// ── AI ────────────────────────────────────────────────────────────────────────

export const aiApi = {
  generate: (data: AIGenerationRequest) =>
    request<AIGenerationResult>('/ai/generate', { method: 'POST', body: JSON.stringify(data) }),
  improveCaption: (data: { caption: string; niche?: string; tone?: string }) =>
    request<{ caption: string }>('/ai/improve-caption', { method: 'POST', body: JSON.stringify(data) }),
  suggestions: (niche: string) =>
    request<{ niche: string; suggestions: string[] }>(`/ai/suggestions/${niche}`),
  analyzePhoto: (data: { image_base64: string; niche?: string; tone?: string; platform?: string }) =>
    request<PhotoAnalysisResult>('/ai/analyze-photo', { method: 'POST', body: JSON.stringify(data) }),
}

// ── Brand Profile ─────────────────────────────────────────────────────────────

export const brandProfileApi = {
  get: (accountId: number) =>
    request<{ profile: BrandProfile | null }>(`/brand-profile/${accountId}`),
  analyze: (accountId: number) =>
    request<{ profile: BrandProfile; message: string }>(
      `/brand-profile/${accountId}/analyze`,
      { method: 'POST' }
    ),
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export const analyticsApi = {
  stats: () => request<DashboardStats>('/analytics/stats'),
  optimalTimes: (niche?: string) =>
    request<{ schedule: { weekly: Record<string, unknown> } }>(`/analytics/optimal-times${niche ? `?niche=${niche}` : ''}`),
  calendar: (year: number, month: number) =>
    request<{ year: number; month: number; byDay: Record<string, Post[]> }>(
      `/analytics/calendar?year=${year}&month=${month}`
    ),
}

// ── Logs ──────────────────────────────────────────────────────────────────────

export const logsApi = {
  list: (params?: { level?: string; limit?: number; offset?: number }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return request<{ logs: import('./types').PostLog[]; total: number }>(`/logs${qs}`)
  },
  cleanup: () => request<{ message: string; deleted: number }>('/logs/cleanup', { method: 'DELETE' }),
}
