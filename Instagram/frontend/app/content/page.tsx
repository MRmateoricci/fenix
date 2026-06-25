'use client'

import { useState } from 'react'
import { AIContentCreator } from '@/components/content/AIContentCreator'
import { PostPreview } from '@/components/content/PostPreview'
import type { AIGenerationResult, Post } from '@/lib/types'

export default function ContentPage() {
  const [generated, setGenerated] = useState<AIGenerationResult | null>(null)
  const [savedPost, setSavedPost] = useState<Post | null>(null)

  return (
    <div className="animate-slide-up">
      <div className="page-header">
        <h1 className="page-title">Crear Contenido con IA</h1>
        <p className="page-subtitle">Generá imagen, caption y hashtags optimizados para tu nicho</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Panel de creación — ocupa 3/5 en pantallas grandes */}
        <div className="xl:col-span-3">
          <AIContentCreator
            onGenerated={setGenerated}
            onSaved={setSavedPost}
          />
        </div>

        {/* Panel de preview — ocupa 2/5 */}
        <div className="xl:col-span-2">
          <PostPreview result={generated} savedPost={savedPost} />
        </div>
      </div>
    </div>
  )
}
