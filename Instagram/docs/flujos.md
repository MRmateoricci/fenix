# Flujos Principales del Sistema

---

## Flujo 1: Generar y programar contenido con IA

Este es el flujo más importante del sistema.

```
Usuario en /content
        │
        ▼
Selecciona: cuenta, niche, tono, plataforma, prompt (opcional)
        │
        ▼
Activa toggle "Usar Brand Profile" (si tiene uno)
        │
        ▼
Click "Generar"
        │
        ▼
POST /api/ai/generate
{
  niche: "fitness",
  tone: "inspiracional",
  platform: "instagram",
  prompt: "rutina de mañana",
  includeImage: true,
  includeCaption: true,
  accountId: "abc123"  ← si tiene Brand Profile, se incluye
}
        │
        ▼
Backend (ai.js route):
  1. Busca BrandProfile del accountId (si se pasó)
  2. Construye prompt enriquecido con el estilo de la marca
  3. Llama openaiService.generateImage()  ← DALL-E 3
  4. Llama openaiService.generateCaption()  ← GPT-4o
  5. Retorna { imageUrl, caption, hashtags }
        │
        ▼
Frontend muestra PostPreview:
  - Imagen generada
  - Caption + hashtags editables
        │
        ├──── "Guardar borrador" ──────► POST /api/posts { status: "draft" }
        │
        ├──── "Publicar ahora" ────────► POST /api/posts { status: "published" }
        │                                 luego POST /api/posts/:id/publish
        │
        └──── "Programar" ────────────► Elige fecha/hora
                                         POST /api/posts {
                                           status: "scheduled",
                                           scheduledAt: "2025-06-10T15:00:00Z"
                                         }
```

---

## Flujo 2: Publicación automática (scheduler)

```
Cada minuto (cron job en schedulerService.js):

1. SELECT posts WHERE status="scheduled" AND scheduledAt <= NOW()
   LIMIT 5

2. Para cada post encontrado:
   
   UPDATE post SET status="publishing"
   
   metaService.publishPost(post)
     │
     ├── Plataforma = instagram?
     │     └── POST /v18.0/{ig-id}/media (crear container)
     │         POST /v18.0/{ig-id}/media_publish
     │
     └── Plataforma = facebook?
           └── POST /v18.0/{page-id}/feed
   
   ¿Éxito?
     │
     ├── SÍ: UPDATE status="published", publishedAt=NOW(), metaPostId=xxx
     │        INSERT PostLog { action: "PUBLISHED", level: "success" }
     │
     └── NO: retryCount++
              │
              ├── retryCount < 3:
              │     UPDATE status="scheduled", scheduledAt=NOW()+15min
              │     INSERT PostLog { action: "RETRY", level: "warning" }
              │
              └── retryCount >= 3:
                    UPDATE status="failed", errorMessage=error
                    INSERT PostLog { action: "FAILED", level: "error" }
```

---

## Flujo 3: Análisis de Brand Profile

```
Usuario en /accounts → clic "Analizar perfil" en una cuenta
        │
        ▼
POST /api/brand-profile/:accountId/analyze
        │
        ▼
profileAnalysisService.buildBrandProfile(accountId):
        │
        ▼
Intenta fetchRealPosts(account):
  └── GET Meta API: /{ig-id}/media?fields=media_url,caption...
      │
      ├── Funciona (hay token real) → usa posts reales
      └── Falla → generateMockPosts() → 9 captions demo por niche
        │
        ▼
analyzeVisualStyle(imageUrls):
  └── GPT-4o Vision: "Analiza estas imágenes, extrae paleta de colores,
       mood, estética, composición y tipo de iluminación"
  └── Retorna JSON estructurado
        │
        ▼
analyzeCaptionStyle(captions):
  └── GPT-4o: "Analiza estas captions, determina formalidad,
       uso de emojis, nivel de humor, estilo CTA, hashtags típicos"
  └── Retorna JSON estructurado
        │
        ▼
UPSERT BrandProfile en DB (crea o actualiza)
        │
        ▼
Frontend muestra el perfil analizado con badges y colores visuales
```

---

## Flujo 4: Publicación manual inmediata

```
Desde /posts o /content:
Usuario click "Publicar ahora" en un post
        │
        ▼
POST /api/posts/:id/publish
        │
        ▼
Backend route (posts.js):
  1. Busca el post por ID (verifica que pertenece al usuario)
  2. Llama metaService.publishPost(post)
  3. Si éxito → UPDATE status="published", publishedAt=NOW()
              → INSERT PostLog { action: "PUBLISHED" }
              → Retorna post actualizado
  4. Si error → UPDATE status="failed", errorMessage=error
             → INSERT PostLog { action: "FAILED" }
             → Retorna error 500
```

---

## Flujo 5: Anti-spam al crear un post

```
POST /api/posts (crear post con scheduledAt)
        │
        ▼
antiSpamService.validateAntiSpam(accountId, scheduledAt, platforms)
        │
        ├── Consulta DB: posts del mismo accountId en el mismo día
        ├── Consulta DB: posts del mismo accountId en la misma hora
        ├── Consulta DB: último post del mismo accountId
        │
        ├── ¿Más de 25 posts/día (Instagram)?  → Error 429
        ├── ¿Más de 3 posts/hora (Instagram)?   → Error 429
        ├── ¿Menos de 20 min desde último post? → Error 429
        │
        └── Todo OK → continúa con la creación del post
```

---

## Flujo 6: Autenticación

```
Usuario abre la app (cualquier página)
        │
        ▼
AppShell monta → AuthContext.init()
        │
        ├── ¿Hay token en localStorage?
        │     │
        │     ├── SÍ → GET /api/auth/me (verificar token)
        │     │         │
        │     │         ├── 200 OK → user válido, continúa
        │     │         └── 401 → token expirado → clearStorage → redirect /login
        │     │
        │     └── NO → redirect /login
        │
        ▼
Usuario en /login → ingresa email + password
        │
        ▼
POST /api/auth/login
  └── 200 OK: { token: "eyJ...", user: {...} }
        │
        ▼
localStorage.setItem("token", token)
localStorage.setItem("user", JSON.stringify(user))
        │
        ▼
redirect → /dashboard
```
