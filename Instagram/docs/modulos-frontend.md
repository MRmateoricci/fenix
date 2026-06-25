# Módulos del Frontend

El frontend usa **Next.js 14 App Router**. Los archivos viven en `frontend/`.

---

## Páginas (`app/`)

### `/` — Dashboard
**Archivo:** `app/page.tsx`

Pantalla de inicio. Muestra un resumen del estado general de la cuenta.

**Componentes que carga:**
- `StatsGrid` — 5 tarjetas KPI: Total de posts, Programados, Publicados, Fallidos, Borradores
- `WeeklyChart` — Gráfico de barras con los posts de los últimos 7 días
- `MiniCalendar` — Mini calendario del mes actual con puntos en días con posts
- `UpcomingPosts` — Los próximos 5 posts programados con fecha y hora
- `QuickActions` — Botones de acceso rápido: "Crear contenido", "Ver calendario", "Nueva cuenta"

---

### `/accounts` — Gestión de cuentas
**Archivo:** `app/accounts/page.tsx`

Lista todas las cuentas vinculadas del usuario. Permite agregar, editar y eliminar cuentas.

**Componente principal:** `AccountManager`
- Muestra plataforma (ícono Instagram/Facebook), username, followers, posts count, status
- Botón "Conectar / Desconectar"
- Botón "Verificar token" → llama a `POST /api/accounts/:id/verify`
- Botón "Ver Brand Profile" → muestra análisis guardado o lanza nuevo análisis
- Botón "Analizar" → dispara `POST /api/brand-profile/:accountId/analyze`
- Formulario para crear/editar cuenta

---

### `/posts` — Lista de posts
**Archivo:** `app/posts/page.tsx`

Tabla con todos los posts. Permite filtrar, buscar y tomar acciones.

**Componente principal:** `PostsTable`
- Columnas: imagen (miniatura), caption (recortada), cuenta, plataforma, estado, fecha programada/publicada
- Filtros por status: Todos / Borrador / Programado / Publicado / Fallido
- Acciones por fila: Editar, Eliminar, Publicar ahora (si está en draft o scheduled)
- Al hacer clic en un post → abre detalle con logs de actividad

---

### `/content` — Creador de contenido con IA
**Archivo:** `app/content/page.tsx`

La pantalla más importante. Genera imágenes y captions usando IA y permite guardar o programar el resultado.

**Componentes:**
- `AIContentCreator` — formulario de generación
  - Selector de cuenta destino
  - Selector de niche (fitness, gastronomía, lifestyle, moda, tecnología, general)
  - Selector de tono (casual, formal, inspiracional, humorístico)
  - Selector de plataforma (Instagram, Facebook, ambas)
  - Prompt personalizado (opcional — si no se llena, el sistema genera uno automático)
  - Toggle: "Generar imagen" / "Generar caption"
  - Toggle: "Usar Brand Profile" (si la cuenta tiene uno analizado)
  - Botón "Generar" → llama a `POST /api/ai/generate`
  - Botón "Mejorar caption" → llama a `POST /api/ai/improve-caption`
  
- `PostPreview` — vista previa del contenido generado
  - Muestra imagen generada
  - Caption con hashtags
  - Permite editar texto antes de guardar
  - Botón "Guardar como borrador"
  - Botón "Programar" → abre date-picker para elegir fecha/hora
  - Botón "Publicar ahora"

---

### `/calendar` — Calendario editorial
**Archivo:** `app/calendar/page.tsx`

Vista mensual del calendario con los posts programados y publicados.

**Componente:** `EditorialCalendar`
- Vista de mes completo
- Cada día muestra los posts programados para ese día (miniatura + estado)
- Clic en un día → muestra lista de posts de ese día
- Navegación entre meses
- Código de colores: azul (programado), verde (publicado), rojo (fallido), gris (borrador)
- Datos obtenidos de `GET /api/analytics/calendar?year=&month=`

---

### `/logs` — Registro de actividad
**Archivo:** `app/logs/page.tsx`

Historial completo de todas las acciones del sistema.

**Componente:** `ActivityLog`
- Tabla de logs con: ícono de nivel, acción, mensaje, post relacionado, timestamp
- Filtros por nivel: Todos / Info / Success / Warning / Error
- Botón "Limpiar logs antiguos" → `DELETE /api/logs/cleanup`
- Se actualiza automáticamente al entrar a la página

---

### `/admin/users` — Gestión de usuarios (solo admin)
**Archivo:** `app/admin/users/page.tsx`

Panel exclusivo para administradores.

**Componente:** `UsersManager`
- Lista todos los usuarios registrados: nombre, email, rol, fecha de registro, cantidad de cuentas
- Botón eliminar usuario (con confirmación)
- Solo accesible si el usuario logueado tiene `role = "admin"`
- Si un creator intenta acceder → redirige al dashboard

---

### `/login` — Inicio de sesión
**Archivo:** `app/login/page.tsx`

Formulario de login/registro. Es la única página accesible sin autenticación.

- Tabs para cambiar entre "Iniciar sesión" y "Registrarse"
- Validación de campos en el frontend
- Al hacer login exitoso → guarda token en localStorage → redirige al dashboard
- Si ya hay token válido → redirige directamente al dashboard

---

## Componentes compartidos (`components/layout/`)

### `AppShell.tsx`
Wrapper principal de la app. Contiene el layout con sidebar y topbar. Verifica autenticación al cargar — si no hay token válido, redirige a `/login`.

### `Sidebar.tsx`
Barra de navegación lateral con links a todas las páginas. Muestra íconos + etiquetas. Resalta la página activa. En mobile colapsa.

### `TopBar.tsx`
Barra superior con: nombre del usuario logueado, avatar con color, menú desplegable (perfil, cerrar sesión).

---

## Estado global (`contexts/`)

### `AuthContext.tsx`
Context de React que maneja el estado de autenticación en toda la app.

- Almacena: `user` (datos del usuario), `token` (JWT)
- Expone: `login()`, `logout()`, `isAuthenticated`, `isAdmin`
- Al iniciar la app, intenta recuperar el token de localStorage y verificarlo con `GET /api/auth/me`
- Si el token expiró → limpia localStorage y redirige a login

---

## Cliente API (`lib/api.ts`)

Funciones tipadas para cada endpoint del backend. Todas inyectan automáticamente el header `Authorization: Bearer <token>`. Cada función tiene su tipo de retorno definido en `lib/types.ts`.

**Grupos de funciones:**
- `authApi` — login, register, getMe, getUsers, deleteUser
- `accountsApi` — list, get, create, update, delete, verify
- `postsApi` — list, get, create, update, delete, publish
- `aiApi` — generate, improveCaption, getSuggestions
- `analyticsApi` — getStats, getCalendar, getOptimalTimes
- `brandProfileApi` — get, analyze
- `logsApi` — list, cleanup

---

## Tipos TypeScript (`lib/types.ts`)

Interfaces para todos los modelos del sistema:
- `User`, `Account`, `Post`, `PostLog`, `BrandProfile`
- `GenerateContentRequest`, `GenerateContentResponse`
- `StatsResponse`, `CalendarDay`
- Enums: `Platform`, `PostStatus`, `UserRole`, `Tone`, `Niche`
