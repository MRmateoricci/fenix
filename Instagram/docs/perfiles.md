# Perfiles / Cuentas

## ¿Qué es una "Cuenta" en este sistema?

Una **cuenta** (Account) representa un perfil de Instagram o Facebook que el sistema gestionará. Cada usuario de la plataforma puede tener múltiples cuentas vinculadas.

---

## Campos de una cuenta

| Campo | Descripción |
|-------|-------------|
| `name` | Nombre interno para identificar la cuenta (ej: "Cliente Fitness") |
| `platform` | `instagram` o `facebook` |
| `username` | Handle del perfil (ej: `@fitnessarg`) |
| `pageId` | ID de la página en Meta (necesario para publicar) |
| `accessToken` | Token de acceso de Meta API |
| `status` | `connected` (token válido) o `disconnected` (token expirado/inválido) |
| `followers` | Número de seguidores (informativo, actualizable manualmente) |
| `avatarColor` | Color HEX del avatar generado automáticamente |

---

## Estados de una cuenta

```
connected   ←──── token válido, puede publicar
disconnected ←─── token expirado o inválido, publicación bloqueada
```

El botón **"Verificar token"** hace una llamada de prueba a Meta API para confirmar si el token sigue activo.

---

## Cuentas demo (seed data)

Al iniciar el backend por primera vez, se crean automáticamente 4 cuentas de ejemplo:

### 1. Mi Marca Personal
- Plataforma: **Instagram**
- Seguidores: 12.400
- Estado: `connected`
- Niche: lifestyle / marca personal
- Uso: cuenta principal para demostrar funcionalidades

### 2. Mi Marca FB
- Plataforma: **Facebook**
- Seguidores: 8.200
- Estado: `connected`
- Uso: misma marca pero en Facebook, muestra el manejo multi-plataforma

### 3. Cliente Fitness
- Plataforma: **Instagram**
- Seguidores: 45.000
- Estado: `connected`
- Niche: fitness y entrenamiento
- Uso: simula una cuenta de cliente con mayor audiencia

### 4. Cliente Restaurant
- Plataforma: **Instagram**
- Seguidores: 3.100
- Estado: `disconnected` (token expirado a propósito)
- Niche: gastronomía
- Uso: demuestra el estado de cuenta desconectada y los errores de publicación

---

## Brand Profile (Perfil de Marca)

Cada cuenta puede tener un **Brand Profile** — un análisis automático generado por GPT-4o Vision que captura la identidad visual y comunicacional de la cuenta.

### ¿Para qué sirve?
Cuando se genera contenido con IA, el sistema puede usar el Brand Profile para que las imágenes y captions sean **consistentes con el estilo ya establecido** de la cuenta.

### ¿Qué analiza?

**Estilo visual** (analizado desde imágenes reales o de muestra):
- Paleta de colores dominante
- Estado de ánimo / mood (energético, tranquilo, premium, etc.)
- Estética (minimalista, colorida, oscura, cálida...)
- Composición típica (centrada, regla de tercios, flat lay...)
- Iluminación (natural, artificial, contrastada...)

**Estilo de texto/captions** (analizado desde publicaciones reales):
- Nivel de formalidad (casual, formal, intermedio)
- Uso de emojis (ninguno, moderado, frecuente)
- Nivel de humor
- Estilo de CTA (call-to-action): preguntas, imperativos, sutiles
- Idioma predominante
- Hashtags típicos de la cuenta

### Flujo de análisis

```
1. Clic en "Analizar perfil" en la página de la cuenta
2. Backend intenta obtener posts reales via Meta API
3. Si no hay credenciales reales → usa 9 captions demo generadas
4. GPT-4o Vision analiza imágenes → extrae estilo visual
5. GPT-4o analiza captions → extrae voz/tono
6. Se guarda el BrandProfile en la base de datos
7. Al generar contenido, se usa este perfil como contexto
```

---

## Roles de usuarios

El sistema tiene dos tipos de usuario:

### Creator (rol por defecto al registrarse)
- Ve y gestiona **solo sus propias cuentas y posts**
- No puede ver cuentas de otros usuarios
- Acceso a todas las funciones de contenido, calendario y análisis

### Admin
- Ve **todas las cuentas y posts** de todos los usuarios
- Acceso al panel `/admin/users` para gestionar usuarios
- Puede eliminar cuentas de creadores

---

## Acceso de seguridad a cuentas

El backend filtra automáticamente:
- **Creator:** `WHERE userId = req.user.id`
- **Admin:** sin filtro (ve todo)

Esto se aplica también a los posts — un creator no puede acceder a posts de cuentas que no le pertenecen, ni siquiera conociendo el ID del post.
