# Arquitectura del Proyecto

## Visión general

El proyecto está dividido en dos aplicaciones independientes que se comunican vía HTTP:

```
┌─────────────────────────────────────────────────────┐
│                    USUARIO / BROWSER                │
└──────────────────────┬──────────────────────────────┘
                       │  HTTP (localhost:3000)
┌──────────────────────▼──────────────────────────────┐
│              FRONTEND  (Next.js 14)                 │
│   - Páginas en app/                                 │
│   - Componentes en components/                      │
│   - Estado de auth en AuthContext                   │
│   - Cliente API en lib/api.ts                       │
└──────────────────────┬──────────────────────────────┘
                       │  REST API (localhost:3001/api)
                       │  Authorization: Bearer JWT
┌──────────────────────▼──────────────────────────────┐
│              BACKEND  (Express.js)                  │
│   - Rutas en src/routes/                            │
│   - Servicios en src/services/                      │
│   - Middleware: auth + errorHandler                 │
└──────┬───────────────┬──────────────────────────────┘
       │               │
┌──────▼──────┐  ┌─────▼────────────────────────────┐
│   SQLite DB │  │       APIS EXTERNAS               │
│  (Prisma)   │  │  - OpenAI (imágenes + captions)   │
└─────────────┘  │  - Meta Graph API (publicar)      │
                 └──────────────────────────────────┘
```

---

## Capas del backend

### 1. Rutas (`src/routes/`)
Reciben las peticiones HTTP, validan permisos, llaman a servicios y devuelven JSON.

| Archivo | Prefijo | Responsabilidad |
|---------|---------|-----------------|
| `auth.js` | `/api/auth` | Login, registro, gestión de usuarios |
| `accounts.js` | `/api/accounts` | CRUD de cuentas sociales |
| `posts.js` | `/api/posts` | CRUD de posts y publicación manual |
| `ai.js` | `/api/ai` | Generación de contenido con IA |
| `analytics.js` | `/api/analytics` | Estadísticas, calendario, horarios óptimos |
| `brandProfile.js` | `/api/brand-profile` | Análisis de perfil de marca |
| `logs.js` | `/api/logs` | Registro de actividad |

### 2. Middleware (`src/middleware/`)

- **`auth.js`** — Valida el JWT en el header `Authorization`. Expone `req.user` con los datos del usuario logueado. También tiene `requireAdmin` para rutas solo de administrador.
- **`errorHandler.js`** — Captura errores de forma centralizada y devuelve respuestas uniformes. Incluye `asyncWrapper` para evitar try/catch repetitivos en cada ruta.

### 3. Servicios (`src/services/`)
Lógica de negocio desacoplada de las rutas. Ver [modulos-backend.md](modulos-backend.md) para detalle.

---

## Base de datos (Prisma + SQLite)

El esquema vive en `backend/prisma/schema.prisma`. Los modelos principales son:

```
User  1──N  Account  1──N  Post  1──N  PostLog
                  │
                  └──1  BrandProfile
```

- **User** → persona que usa la plataforma (admin o creator)
- **Account** → cuenta de Instagram/Facebook vinculada a un User
- **Post** → publicación generada, con su estado (draft → scheduled → published/failed)
- **PostLog** → historial de cada acción sobre un post
- **BrandProfile** → perfil visual y de voz analizado con IA para cada cuenta

---

## Flujo de autenticación

1. Usuario hace POST `/api/auth/login` con email + password
2. Backend verifica password con bcrypt, genera JWT (expira en 7 días)
3. Frontend guarda el token en `localStorage`
4. Todas las peticiones siguientes incluyen `Authorization: Bearer <token>`
5. El middleware `requireAuth` decodifica el token y adjunta el usuario a `req.user`

---

## Scheduler automático

Un cron job dentro del backend corre **cada minuto** y:
1. Busca posts con `status = "scheduled"` cuyo `scheduledAt <= ahora`
2. Los intenta publicar vía Meta API (máx 5 por ciclo)
3. Si falla, reintenta hasta 3 veces (con 15 min de espera entre reintentos)
4. Actualiza el status a `published` o `failed` y registra el log
