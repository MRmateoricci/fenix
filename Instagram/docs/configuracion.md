# Configuración y Puesta en Marcha

---

## Requisitos

- Node.js 18+ 
- npm 9+
- (Opcional) Cuenta de OpenAI con API key
- (Opcional) App de Meta Developers configurada

---

## Levantar el proyecto

### Backend

```bash
cd backend
npm install
npx prisma generate      # genera el cliente Prisma
npx prisma db push        # crea la base de datos SQLite
npm run dev               # levanta en http://localhost:3001
```

Al iniciar por primera vez, la base de datos se puebla automáticamente con datos demo (4 cuentas, 8 posts, usuario admin).

### Frontend

```bash
cd frontend
npm install
npm run dev               # levanta en http://localhost:3000
```

---

## Variables de entorno

### Backend — `backend/.env`

| Variable | Descripción | Default/Demo |
|----------|-------------|--------------|
| `PORT` | Puerto del servidor Express | `3001` |
| `NODE_ENV` | Entorno | `development` |
| `DATABASE_URL` | Ruta a la base de datos SQLite | `file:./data/database.db` |
| `JWT_SECRET` | Clave secreta para firmar tokens JWT | Debe cambiarse en prod |
| `OPENAI_API_KEY` | API key de OpenAI | **Opcional** — sin ella usa datos mock |
| `META_APP_ID` | ID de la app de Meta Developers | **Opcional** — sin ella simula publicaciones |
| `META_APP_SECRET` | Secreto de la app de Meta | **Opcional** |
| `META_ACCESS_TOKEN` | Token de acceso de larga duración | **Opcional** |
| `META_PAGE_ID` | ID de la página de Facebook | **Opcional** |
| `META_INSTAGRAM_ACCOUNT_ID` | ID de la cuenta profesional de Instagram | **Opcional** |

**Copia de ejemplo:**
```bash
cp backend/.env.example backend/.env
```

### Frontend — `frontend/.env.local`

| Variable | Descripción | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | URL base del backend | `http://localhost:3001/api` |

**Copia de ejemplo:**
```bash
cp frontend/.env.local.example frontend/.env.local
```

---

## Credenciales demo (sin configuración real)

El sistema funciona completamente en modo demo:

| Rol | Email | Contraseña |
|-----|-------|------------|
| Admin | `admin@socialpilot.ai` | `admin123` |

En modo demo:
- Las imágenes generadas son fotos de muestra de Unsplash
- Los captions se generan desde plantillas por niche
- Las publicaciones en Meta se simulan con 90% de éxito
- Los tokens de las cuentas son ficticios

---

## Conectar OpenAI (para IA real)

1. Crear cuenta en [platform.openai.com](https://platform.openai.com)
2. Crear una API key en "API Keys"
3. Agregar en `backend/.env`:
   ```
   OPENAI_API_KEY=sk-proj-...
   ```
4. Reiniciar el backend

Con esto activo, `generateImage` usa DALL-E 3 y `generateCaption` usa GPT-4o.

---

## Conectar Meta API (para publicar real)

1. Crear app en [developers.facebook.com](https://developers.facebook.com)
2. Agregar producto "Instagram Graph API" y "Pages API"
3. Configurar permisos: `instagram_basic`, `instagram_content_publish`, `pages_manage_posts`
4. Generar un Long-Lived Token para tu página
5. Agregar en `backend/.env`:
   ```
   META_APP_ID=123456789
   META_APP_SECRET=abcdef...
   META_ACCESS_TOKEN=EAABwz...
   META_PAGE_ID=987654321
   META_INSTAGRAM_ACCOUNT_ID=111222333
   ```
6. Reiniciar el backend

---

## Comandos útiles

```bash
# Ver la base de datos en interfaz web
cd backend && npx prisma studio

# Resetear la base de datos y re-poblar con datos demo
cd backend && npx prisma db push --force-reset && npm run dev

# Ver logs del scheduler en tiempo real
# (aparecen en la consola del backend)

# Build de producción del frontend
cd frontend && npm run build && npm start

# Checar errores de TypeScript en frontend
cd frontend && npm run type-check
```

---

## Estructura de archivos de configuración

```
backend/
├── .env                    ← Variables privadas (NO commitear)
├── .env.example            ← Plantilla pública
├── prisma/schema.prisma    ← Esquema de la DB
└── prisma/data/database.db ← Archivo SQLite (NO commitear)

frontend/
├── .env.local              ← Variables privadas (NO commitear)
├── .env.local.example      ← Plantilla pública
├── next.config.js          ← Configuración de Next.js
└── tailwind.config.ts      ← Configuración de Tailwind CSS
```
