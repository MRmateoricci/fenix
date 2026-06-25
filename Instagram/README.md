# SocialPilot AI — Automatización de Publicaciones para Instagram y Facebook

Sistema completo de automatización de redes sociales con generación de contenido por IA.

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 14 + TypeScript + Tailwind CSS |
| Backend | Node.js + Express.js |
| Base de datos | SQLite (dev) / PostgreSQL (prod) |
| Scheduler | node-cron |
| IA | OpenAI API (DALL-E 3 + GPT-4o) |
| Social APIs | Meta Graph API (stub) |

## Estructura del Proyecto

```
Instagram/
├── frontend/          # Next.js 14 App
│   ├── app/           # App Router (páginas)
│   ├── components/    # Componentes React
│   └── lib/           # Utilidades y tipos
├── backend/           # Express API
│   ├── src/
│   │   ├── routes/    # Endpoints REST
│   │   ├── services/  # Lógica de negocio
│   │   └── middleware/
│   └── data/          # SQLite database (auto-generado)
└── README.md
```

## Instalación y Ejecución

### Prerrequisitos
- Node.js 18+
- npm o yarn

### 1. Clonar y configurar el backend

```bash
cd backend
npm install
cp .env.example .env
# Editar .env con tus credenciales (opcional para demo)
npm run dev
```

El backend arranca en `http://localhost:3001`

### 2. Configurar y arrancar el frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

El frontend arranca en `http://localhost:3000`

### 3. Seed de datos demo

Al iniciar el backend por primera vez, se cargan automáticamente datos de ejemplo.

## Variables de Entorno

### Backend (`backend/.env`)
```env
PORT=3001
OPENAI_API_KEY=           # Para generación real con IA
META_APP_ID=              # Meta App ID
META_APP_SECRET=          # Meta App Secret
META_ACCESS_TOKEN=        # Token de acceso Meta
```

### Frontend (`frontend/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

## Módulos del Sistema

1. **Dashboard** — Estadísticas, calendario mini y actividad reciente
2. **Creador de Contenido** — Generación IA de imagen + caption + hashtags
3. **Calendario Editorial** — Vista mensual con publicaciones programadas
4. **Publicaciones** — Lista completa con filtros y acciones
5. **Cuentas** — Gestión de cuentas conectadas de Instagram y Facebook
6. **Logs** — Registro de actividad en tiempo real

## Notas

- Sin credenciales de OpenAI, el sistema devuelve contenido de ejemplo
- Sin credenciales de Meta, las publicaciones quedan en estado simulado
- La base de datos SQLite se crea automáticamente en `backend/data/`
