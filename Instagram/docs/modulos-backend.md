# Módulos del Backend

Todos los archivos del backend viven en `backend/src/`.

---

## Servicios (`services/`)

### `openaiService.js` — Generación de contenido con IA

El servicio central de IA. Se conecta a OpenAI o usa datos mock si no hay API key.

**Funciones principales:**

| Función | Qué hace |
|---------|----------|
| `generateImage(prompt, niche, tone)` | Llama a DALL-E 3 para generar imagen (1024×1024). Sin API key → devuelve una de 5 imágenes de muestra |
| `generateCaption(prompt, niche, tone, platform)` | GPT-4o genera caption + array de hashtags. Sin API key → devuelve caption de plantilla según niche |
| `improveCaption(caption, niche, tone)` | Toma una caption existente y la mejora con GPT-4o |
| `generateImageWithBrandProfile(prompt, brandProfile)` | Como `generateImage` pero el prompt incluye el estilo visual del Brand Profile |
| `generateCaptionWithBrandProfile(prompt, platform, brandProfile)` | Como `generateCaption` pero incluye el tono y voz del Brand Profile en el system prompt |

**Niches soportados con datos mock:**
`fitness`, `gastronomia`, `lifestyle`, `moda`, `tecnologia`, `general`

**Tonos disponibles:**
`casual`, `formal`, `inspiracional`, `humoristico`

---

### `metaService.js` — Publicación en Meta

Puente entre el sistema y la API de Meta (Instagram + Facebook).

**Funciones:**

| Función | Qué hace |
|---------|----------|
| `publishPost(post)` | Publica en todas las plataformas indicadas en `post.platforms` |
| `publishToInstagram(post)` | Sube imagen a Instagram Container API, luego la publica |
| `publishToFacebook(post)` | Publica en Facebook Page via Graph API |

**Modo simulación:** Sin credenciales reales (`META_ACCESS_TOKEN` vacío), el servicio simula la publicación con **90% de éxito** y devuelve un `metaPostId` ficticio. Incluye un delay aleatorio de 1-5 segundos para simular latencia real.

**Flujo real de Instagram:**
```
1. POST /v18.0/{ig-user-id}/media   ← crea container con imagen + caption
2. POST /v18.0/{ig-user-id}/media_publish  ← publica el container
```

---

### `schedulerService.js` — Publicación automática

Cron job que corre **cada minuto** en segundo plano.

**Lógica:**
1. Busca posts con `status = "scheduled"` y `scheduledAt <= now`
2. Toma máximo 5 posts por ciclo (para no sobrecargar)
3. Cambia status a `"publishing"` mientras procesa
4. Llama a `metaService.publishPost()`
5. Éxito → status `"published"`, guarda `publishedAt` y `metaPostId`
6. Fallo → incrementa `retryCount`. Si `retryCount < 3` → vuelve a `"scheduled"` con nuevo `scheduledAt` en 15 min. Si llegó a 3 → status `"failed"`
7. Registra cada acción en `PostLog`

**Al iniciar el servidor:** resetea posts que estén en `"publishing"` (quedaron atascados de una sesión anterior) de vuelta a `"scheduled"`.

---

### `profileAnalysisService.js` — Análisis de marca con IA

Analiza una cuenta para construir su Brand Profile.

**Funciones:**

| Función | Qué hace |
|---------|----------|
| `buildBrandProfile(accountId)` | Orquesta todo el análisis y guarda/actualiza el BrandProfile en DB |
| `fetchRealPosts(account)` | Intenta obtener los últimos posts reales vía Meta API |
| `generateMockPosts(account)` | Genera 9 captions demo si no hay datos reales |
| `analyzeVisualStyle(imageUrls)` | GPT-4o Vision analiza imágenes: colores, mood, estética, composición, iluminación |
| `analyzeCaptionStyle(captions)` | GPT-4o analiza captions: formalidad, emojis, humor, CTA, hashtags típicos |

**Estructura del BrandProfile guardado:**
```json
{
  "visualStyle": {
    "colorPalette": ["#2C3E50", "#E8F4FD"],
    "mood": "energético y motivacional",
    "aesthetic": "dinámico con alto contraste",
    "composition": "centrado con elementos de acción",
    "lighting": "artificial brillante"
  },
  "toneVoice": {
    "formality": "casual",
    "emojiUsage": "moderado",
    "humorLevel": "bajo",
    "ctaStyle": "imperativo directo",
    "language": "español"
  },
  "typicalHashtags": ["#fitness", "#entrenamiento", "#motivacion"],
  "sampleCaptions": ["..."],
  "postsAnalyzed": 9
}
```

---

### `antiSpamService.js` — Validación anti-spam

Previene la publicación excesiva que podría resultar en baneo de cuentas.

**Límites por plataforma:**

| Plataforma | Posts/día | Posts/hora | Intervalo mínimo |
|------------|-----------|------------|------------------|
| Instagram | 25 | 3 | 20 minutos |
| Facebook | 10 | 2 | 30 minutos |

**Funciones:**

| Función | Qué hace |
|---------|----------|
| `validateAntiSpam(accountId, scheduledAt, platforms)` | Revisa la DB y lanza error si se violan los límites |
| `validateHashtags(hashtags)` | Error si más de 30 hashtags; advertencia si más de 20 |

Se llama automáticamente al crear un post desde `routes/posts.js`.

---

## Rutas (`routes/`)

### `auth.js`

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| POST | `/login` | Público | Email + password → JWT token |
| POST | `/register` | Público | Crear cuenta creator |
| GET | `/me` | Auth | Datos del usuario logueado |
| GET | `/users` | Admin | Lista todos los usuarios |
| DELETE | `/users/:id` | Admin | Eliminar usuario |

---

### `accounts.js`

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| GET | `/` | Auth | Lista cuentas del usuario (con conteo de posts) |
| GET | `/:id` | Auth | Detalle de una cuenta |
| POST | `/` | Auth | Crear nueva cuenta |
| PUT | `/:id` | Auth | Actualizar cuenta |
| DELETE | `/:id` | Auth | Eliminar cuenta (cascada a posts y BrandProfile) |
| POST | `/:id/verify` | Auth | Verificar si el access token sigue activo |

---

### `posts.js`

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| GET | `/` | Auth | Lista posts (filtros: `status`, `account_id`, paginación) |
| GET | `/:id` | Auth | Post con sus logs |
| POST | `/` | Auth | Crear post (valida anti-spam) |
| PUT | `/:id` | Auth | Editar post |
| DELETE | `/:id` | Auth | Eliminar post |
| POST | `/:id/publish` | Auth | Publicar inmediatamente |

---

### `ai.js`

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| POST | `/generate` | Auth | Genera imagen + caption. Body: `{niche, tone, platform, prompt, includeImage, includeCaption, accountId}` |
| POST | `/improve-caption` | Auth | Mejora caption existente. Body: `{caption, niche, tone}` |
| GET | `/suggestions/:niche` | Auth | Ideas de contenido predefinidas por niche |

---

### `analytics.js`

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| GET | `/stats` | Auth | Total posts por estado + gráfico 7 días |
| GET | `/optimal-times` | Auth | Mejores horas para publicar por niche/día |
| GET | `/calendar` | Auth | Posts del mes en formato calendario (`?year=&month=`) |

---

### `brandProfile.js`

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| GET | `/:accountId` | Auth | Obtener BrandProfile guardado |
| POST | `/:accountId/analyze` | Auth | Disparar análisis completo con IA |

---

### `logs.js`

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| GET | `/` | Auth | Lista logs (filtro: `level`) |
| DELETE | `/cleanup` | Auth | Elimina logs de más de 30 días |

---

## Archivo principal: `index.js`

1. Carga variables de entorno
2. Inicializa Express con CORS, JSON parser y rutas
3. Arranca el servidor en el puerto configurado (`PORT=3001`)
4. Inicia el `schedulerService` en background

## Base de datos: `database.js`

1. Conecta Prisma a SQLite
2. Al iniciar, verifica si la DB ya tiene datos
3. Si está vacía → ejecuta el seed (crea admin + 4 cuentas + 8 posts demo)
