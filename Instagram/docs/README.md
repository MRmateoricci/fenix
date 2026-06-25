# SocialPilot AI — Documentación del Proyecto

**Automatización inteligente de redes sociales con IA**

---

## ¿Qué hace este proyecto?

SocialPilot AI es una plataforma web completa que permite **gestionar, generar y publicar contenido en Instagram y Facebook** de forma automática. Combina inteligencia artificial (OpenAI) con las APIs de Meta para crear imágenes, redactar captions y programar publicaciones sin intervención manual.

Funciona igual con o sin credenciales reales — si no hay API keys, usa datos de demostración y simula las publicaciones.

---

## Índice de la documentación

| Archivo | Contenido |
|---------|-----------|
| [arquitectura.md](arquitectura.md) | Stack tecnológico, diagrama de capas, cómo se comunican frontend y backend |
| [perfiles.md](perfiles.md) | Qué es un perfil/cuenta, sus estados, el Brand Profile y los datos demo |
| [modulos-backend.md](modulos-backend.md) | Cada servicio, ruta y middleware del backend explicado en detalle |
| [modulos-frontend.md](modulos-frontend.md) | Cada página y componente del frontend con su función |
| [flujos.md](flujos.md) | Los flujos principales: generar contenido, programar y publicar un post |
| [configuracion.md](configuracion.md) | Variables de entorno, cómo levantar el proyecto, credenciales demo |

---

## Resumen rápido del stack

- **Frontend:** Next.js 14 + TypeScript + Tailwind CSS
- **Backend:** Node.js + Express.js
- **Base de datos:** SQLite (dev) / PostgreSQL (prod) vía Prisma ORM
- **IA:** OpenAI API — DALL-E 3 (imágenes) + GPT-4o (textos)
- **Redes sociales:** Meta Graph API (Instagram + Facebook)
- **Scheduler:** node-cron (verifica posts a publicar cada minuto)

---

## Acceso rápido al proyecto

| Servicio | URL |
|----------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:3001/api |

**Usuario administrador demo:**
- Email: `admin@socialpilot.ai`
- Contraseña: `admin123`
