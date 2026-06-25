export type Platform = 'instagram' | 'facebook'

export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed'

export type PostTone = 'casual' | 'formal' | 'inspiracional' | 'humoristico'

export type AccountStatus = 'connected' | 'disconnected' | 'error'

export type LogLevel = 'info' | 'success' | 'warning' | 'error'

export interface Account {
  id: number
  name: string
  platform: Platform
  username: string | null
  page_id: string | null
  access_token: string | null
  status: AccountStatus
  avatar_color: string
  followers: number
  total_published?: number
  total_scheduled?: number
  created_at: string
  updated_at: string
}

export interface Post {
  id: number
  account_id: number | null
  platforms: Platform[]
  image_url: string | null
  caption: string | null
  hashtags: string[]
  scheduled_at: string | null
  published_at: string | null
  status: PostStatus
  meta_post_id: string | null
  tone: PostTone
  niche: string
  prompt: string | null
  error_message: string | null
  retry_count: number
  account_name?: string
  account_username?: string
  account_platform?: Platform
  avatar_color?: string
  created_at: string
  updated_at: string
  logs?: PostLog[]
}

export interface PostLog {
  id: number
  post_id: number
  action: string
  message: string
  level: LogLevel
  created_at: string
  // Joined fields
  caption?: string
  image_url?: string
  account_name?: string
  username?: string
  platform?: Platform
  avatar_color?: string
}

export interface DashboardStats {
  overview: {
    total: number
    scheduled: number
    published: number
    failed: number
    drafts: number
  }
  last7Days: Array<{ date: string; count: number }>
  accountStats: Array<{ platform: Platform; count: number; connected: number }>
}

export interface AIGenerationRequest {
  prompt?: string
  niche: string
  tone: PostTone
  platform?: Platform
  includeImage?: boolean
  includeCaption?: boolean
  accountId?: number
}

export interface BrandProfile {
  id: number
  account_id: number
  visual_style: {
    colors: string[]
    mood: string
    aesthetic: string
    composition: string
    lighting: string
  }
  content_themes: string[]
  tone_voice: {
    formality: string
    uses_emojis: boolean
    emoji_frequency: string
    humor_level: string
    cta_style: string
    language_style: string
    avg_length: string
  }
  typical_hashtags: string[]
  sample_captions: string[]
  reference_images: string[]
  posts_analyzed: number
  analyzed_at: string | null
  created_at: string
  updated_at: string
  is_mock?: boolean
}

export interface AIGenerationResult {
  image_url?: string
  image_prompt_used?: string
  image_is_mock?: boolean
  caption?: string
  hashtags?: string[]
  caption_is_mock?: boolean
}

export interface PhotoAnalysis {
  score: number
  product_detected: string
  strengths: string[]
  improvements: string[]
  tips: {
    lighting: string
    angle: string
    background: string
    styling: string
    editing: string
  }
}

export interface PhotoAnalysisResult {
  analysis: PhotoAnalysis
  suggested_caption: string
  suggested_hashtags: string[]
  enhanced_image_prompt: string
  is_mock: boolean
  error?: string
}

export interface CalendarDay {
  date: string
  posts: Post[]
}

export interface OptimalTime {
  weekly: Record<string, { instagram: string[]; facebook: string[] }>
  niche_specific: { best_days: string[]; peak: string }
}
