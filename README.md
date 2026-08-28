# Fénix Iluminación — ecommerce

Ecommerce full stack para Fénix Iluminación. Incluye catálogo público, carrito, checkout, pagos con Mercado Pago, retiro en local, envíos por zona, cuentas de clientes, favoritos, reseñas, alertas de stock, seguimiento de pedidos y un panel administrativo con gestión de inventario e importación de archivos.

El código contiene dos aplicaciones, pero se administran desde la raíz como una sola unidad:

- `frontend`: React 19 + Vite 8, ubicado en la raíz del repositorio.
- `backend`: Node.js + Express, ubicado en `backend/`.
- `PostgreSQL`: proceso separado en local y recurso independiente en Railway.

Un solo `npm install` instala las dependencias de ambas aplicaciones y `npm run dev` levanta frontend y backend al mismo tiempo. En producción, Express sirve el build de React, por lo que frontend y backend se despliegan juntos en un único servicio web.

> Este repositorio no usa Prisma. La estructura de la base de datos se administra con SQL directo en `backend/db/schema.sql`.

## Estado actual

El proyecto compila correctamente con Node.js 24. Para Vite 8 se necesita Node.js `20.19+` o `22.12+`.

La tienda puede ejecutarse localmente, pero para usar el checkout completo se necesita PostgreSQL y credenciales de Mercado Pago. Los correos y la futura integración con Correo Argentino son opcionales durante el desarrollo.

## Funcionalidades

### Tienda pública

- Inicio con categorías y productos destacados.
- Catálogo con productos publicados desde PostgreSQL.
- Detalle de producto, variantes y reseñas.
- Carrito persistido en `localStorage`.
- Checkout como invitado o como usuario registrado.
- Retiro en el local o envío según código postal.
- Pago online con Mercado Pago Checkout Pro.
- Transferencia bancaria configurable, con descuento, comprobante privado y aprobación manual.
- Reserva para pagar en el local al retirar.
- Confirmación y seguimiento mediante número de pedido `FX-XXXXXX`.
- Registro, inicio de sesión, perfil e historial de pedidos.
- Favoritos y avisos de reposición de stock.
- Páginas institucionales, FAQ, guías y sección para profesionales.

### Panel administrativo

- Resumen de ventas y productos.
- Listado y cambio de estado de pedidos.
- Cola de transferencias por revisar, con aprobación o rechazo manual.
- Alta, edición, publicación y eliminación de productos.
- Ajustes manuales de stock.
- Subida de imágenes de producto.
- Gestión del inventario interno y del catálogo público desde la misma tabla.
- Consulta de alertas de stock solicitadas por clientes.
- Importaciones de catálogo, precios, ventas y compras desde Excel.
- Lectura preliminar de facturas/remitos PDF con revisión antes de aplicar el stock.

## Arquitectura

```mermaid
flowchart LR
    B[Cliente / navegador]
    F[React + Vite]
    A[API Express]
    DB[(PostgreSQL)]
    MP[Mercado Pago]
    SMTP[Gmail SMTP]
    U[Archivos subidos]

    B --> F
    F -->|/api| A
    A --> DB
    A -->|crea preferencia| MP
    MP -->|webhook de pago| A
    A -.->|confirmaciones opcionales| SMTP
    A --> U
```

En desarrollo, Vite sirve el frontend en `http://localhost:5173` y redirige todas las llamadas `/api` al backend en `http://localhost:3001`. Por eso no hace falta definir `VITE_API_URL` localmente.

En producción, Vite genera `dist/` y el mismo proceso Express sirve esos archivos, las rutas de React Router, `/api/*` y `/uploads/*` desde un solo dominio. `VITE_API_URL` queda vacío porque el navegador llama a la API mediante rutas relativas del mismo origen.

## Flujo de una compra

```mermaid
sequenceDiagram
    participant C as Cliente
    participant R as React
    participant A as API Express
    participant D as PostgreSQL
    participant M as Mercado Pago

    C->>R: Agrega productos y completa checkout
    R->>A: POST /api/orders
    A->>D: Relee precios y valida productos
    A->>D: Reserva stock dentro de una transacción
    A->>D: Crea el pedido con snapshot de los items
    alt Mercado Pago
        A->>M: Crea preferencia de pago
        A-->>R: Devuelve checkoutUrl
        R->>M: Redirige al checkout
        M->>A: Webhook del pago
        A->>D: Actualiza el estado del pedido
    else Pago al retirar
        A-->>R: Devuelve número de reserva
    end
    R-->>C: Muestra confirmación y seguimiento
```

El backend no confía en el precio enviado por el navegador: vuelve a consultar cada producto en PostgreSQL, arma un snapshot del pedido y descuenta stock en una transacción. Si falta stock para cualquier ítem, revierte toda la operación.

Las reservas tienen vencimiento:

- Mercado Pago pendiente: 45 minutos.
- Transferencia sin comprobante: 72 horas por defecto; un comprobante en revisión detiene el vencimiento.
- Retiro con pago en el local: fecha de retiro más 2 días.

Un proceso interno revisa vencimientos cada 30 minutos. Los pedidos `expired`, `cancelled` o `payment_failed` reponen el stock una sola vez mediante `stock_released_at`.

## Tecnologías

| Área | Tecnología |
| --- | --- |
| Interfaz | React 19 |
| Desarrollo y build | Vite 8 |
| Rutas del navegador | React Router 7 |
| Estilos | CSS propio + Tailwind CSS 4 mediante Vite |
| SEO | React Helmet Async, `robots.txt` y `sitemap.xml` |
| API | Node.js, Express 4 |
| Base de datos | PostgreSQL + driver `pg` |
| Autenticación de clientes | JWT en cookie HTTP-only + bcrypt |
| Pagos | Mercado Pago Checkout Pro y webhooks |
| Correos | Nodemailer con Gmail SMTP |
| Archivos | Multer |
| Importaciones | SheetJS/XLSX y `pdf-parse` |

## Estructura del repositorio

```text
Fenix-web/
├── index.html                 # HTML de entrada de Vite
├── package.json               # Scripts unificados y dependencias del frontend
├── railway.json               # Build, migración, start y healthcheck en Railway
├── vite.config.js             # React, Tailwind y proxy /api local
├── public/                    # robots.txt y sitemap.xml
├── src/
│   ├── App.jsx                # Rutas públicas, privadas y administrativas
│   ├── main.jsx               # Montaje de React
│   ├── index.css              # Estilos globales
│   ├── assets/                # Logos e imágenes del sitio
│   ├── components/            # Navbar, footer, cards, carrito lateral, etc.
│   ├── config/                # SEO y copia frontend de zonas de envío
│   ├── context/               # Catálogo/admin, auth, carrito y favoritos
│   ├── data/                  # Categorías y catálogo histórico usado por seeds
│   └── pages/                 # Pantallas públicas, cuenta y panel admin
└── backend/
    ├── index.js               # Entrada de Express y montaje de rutas
    ├── package.json           # Dependencias y scripts del backend
    ├── .env.example           # Plantilla de variables de entorno
    ├── config/                # Zonas de envío y carpeta de uploads
    ├── db/
    │   ├── pool.js            # Pool PostgreSQL y ejecución del schema
    │   ├── schema.sql         # Tablas, índices, constraints y triggers
    │   ├── seedStorefront.js  # Migra el catálogo histórico a PostgreSQL
    │   └── seedDemoProducts.js# Productos de demostración
    ├── jobs/                  # Liberación periódica de reservas vencidas
    ├── middleware/            # Autenticación de clientes y administrador
    ├── routes/                # Endpoints HTTP
    └── services/              # Pagos, mail, stock e importadores
```

## Requisitos

- Node.js `20.19+` o `22.12+`.
- npm.
- PostgreSQL con permiso para crear la extensión `pgcrypto`.
- Credenciales de Mercado Pago para probar pagos reales o sandbox.
- Opcional: una cuenta Gmail con contraseña de aplicación para enviar correos.

En Windows conviene usar `npm.cmd` si PowerShell bloquea el script `npm.ps1` por la política de ejecución.

## Instalación local en Windows / PowerShell

### 1. Clonar y entrar al proyecto

```powershell
git clone <URL_DEL_REPOSITORIO>
Set-Location "Fenix-web"
```

### 2. Instalar todas las dependencias

```powershell
npm install
```

El `postinstall` de la raíz ejecuta automáticamente la instalación bloqueada de `backend/`. No hace falta entrar a esa carpeta ni ejecutar un segundo `npm install`.

En CI o después de clonar un lockfile ya actualizado se puede usar:

```powershell
npm.cmd ci
```

Ambos comandos terminan instalando las versiones registradas en los dos `package-lock.json`.

### 3. Crear la base PostgreSQL

Con PostgreSQL instalado y `psql` disponible:

```powershell
psql -U postgres -c "CREATE DATABASE fenix_db;"
```

También se puede crear `fenix_db` desde pgAdmin. El usuario elegido debe tener permisos sobre esa base y permiso para habilitar `pgcrypto`.

### 4. Crear el archivo de entorno

Desde la raíz:

```powershell
Copy-Item backend\.env.example backend\.env
```

Editar `backend/.env` y, como mínimo, configurar:

```dotenv
PORT=3001
DATABASE_URL=postgresql://postgres:TU_PASSWORD@localhost:5432/fenix_db
ADMIN_SECRET=reemplazar-por-una-contrasena-segura
ADMIN_SESSION_SECRET=reemplazar-por-otro-secreto-largo-y-aleatorio
JWT_SECRET=reemplazar-por-un-secreto-largo-y-aleatorio
APP_BASE_URL=http://localhost:3001
FRONTEND_BASE_URL=http://localhost:5173
```

Para crear un `JWT_SECRET` aleatorio desde Node:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 5. Aplicar el esquema

Desde la raíz:

```powershell
npm run db:migrate
```

Este comando ejecuta todo `backend/db/schema.sql`. Crea tablas, índices, restricciones y triggers. No usa Prisma ni Alembic.

### 6. Cargar productos iniciales

Hay dos semillas opcionales e idempotentes por código:

```powershell
# Catálogo histórico definido en src/data/products.js
npm run db:seed

# Ocho productos adicionales de demostración
npm run db:seed:demo
```

La tienda pública solo muestra productos con `published = true`. Sin una semilla o productos creados/publicados desde el panel, el catálogo aparecerá vacío.

### 7. Levantar backend y frontend

Desde la raíz, en una sola terminal:

```powershell
npm run dev
```

El comando muestra los logs de ambos procesos con los prefijos `FRONTEND` y `BACKEND`. Al detenerlo con `Ctrl+C`, finalizan los dos.

Abrir:

- Tienda: `http://localhost:5173`
- Panel: `http://localhost:5173/admin/login`
- Salud del backend: `http://localhost:3001/api/health`

## Variables de entorno

### Backend: `backend/.env`

| Variable | Requerida | Uso |
| --- | --- | --- |
| `PORT` | No | Puerto de Express. Predeterminado: `3001`. |
| `NODE_ENV` | En producción | Activa SSL de PostgreSQL y cookies `Secure`/`SameSite=None`. |
| `DATABASE_URL` | Sí | Cadena de conexión PostgreSQL. |
| `ADMIN_SECRET` | Sí para el panel | Contraseña validada exclusivamente por el backend al iniciar sesión. |
| `ADMIN_SESSION_SECRET` | Sí para el panel | Firma la cookie HTTP-only administrativa de ocho horas. |
| `JWT_SECRET` | Sí | Firma las sesiones de clientes por 30 días. |
| `MP_ACCESS_TOKEN` | Para Mercado Pago | Token de la aplicación de Mercado Pago. |
| `MP_WEBHOOK_SECRET` | Producción | Verifica la firma HMAC de los webhooks. Si falta, la validación se omite. |
| `APP_BASE_URL` | Para Mercado Pago | URL pública del backend usada en `notification_url`. |
| `FRONTEND_BASE_URL` | Sí | Origen CORS permitido y base de las URLs de retorno de Mercado Pago. |
| `UPLOADS_DIR` | No | Carpeta de imágenes. Predeterminado: `backend/public/uploads`. |
| `TRANSFER_PROOFS_DIR` | En producción | Volumen privado para comprobantes; nunca debe estar bajo `/uploads`. |
| `BACKUPS_DIR` | Para backups | Carpeta temporal/persistente de archivos `.fenix`; debe estar fuera de uploads y comprobantes. |
| `BACKUP_ENCRYPTION_KEY` | Para backups | Clave de al menos 32 caracteres que cifra y autentica cada backup. Sin ella no se puede restaurar. |
| `PG_DUMP_PATH` | No | Ejecutable `pg_dump`; predeterminado: `pg_dump`. |
| `PSQL_PATH` | No | Ejecutable `psql`; predeterminado: `psql`. |
| `BACKUP_MAX_UPLOAD_BYTES` | No | Tamaño máximo de un backup subido para restaurar; predeterminado: 10 GiB. |
| `GMAIL_USER` | No | Cuenta emisora de Gmail/Workspace. |
| `GMAIL_APP_PASSWORD` | No | Contraseña de aplicación de Google. |
| `ADMIN_NOTIFICATION_EMAIL` | No | Destinatario interno de nuevas compras/reservas. |
| `CORREO_ARGENTINO_API_URL` | Todavía no funcional | Reservada para la integración futura. |
| `CORREO_ARGENTINO_CLIENT_ID` | Todavía no funcional | Reservada para la integración futura. |
| `CORREO_ARGENTINO_CLIENT_SECRET` | Todavía no funcional | Reservada para la integración futura. |

Si Gmail no está configurado, el pedido se crea igual y el backend solo registra una advertencia. El correo es deliberadamente “best effort”.

La integración real de Correo Argentino todavía está pendiente en `backend/services/correoArgentino.js`. Hoy siempre se utiliza una estimación de 5 días hábiles del transportista más 3 días hábiles de margen interno.

### Frontend: `.env.local` opcional

Con el despliegue unificado no hace falta crear este archivo: Vite usa el proxy `/api` en desarrollo y Express sirve frontend y API bajo el mismo dominio en producción.

`VITE_API_URL` se necesita únicamente si en el futuro se vuelve a separar el backend en otro dominio:

```dotenv
VITE_API_URL=https://api.ejemplo.com
```

`VITE_API_URL` se incorpora durante el build; cambiarla después requiere volver a ejecutar `npm run build`.

## Scripts disponibles

### Comandos principales desde la raíz

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Levanta Vite y Express juntos, ambos con recarga automática. |
| `npm run dev:frontend` | Levanta solamente Vite. |
| `npm run dev:backend` | Levanta solamente Express con `node --watch`. |
| `npm.cmd run build` | Genera el frontend de producción en `dist/`. |
| `npm start` | Inicia Express; con `NODE_ENV=production` sirve también `dist/`. |
| `npm.cmd run preview` | Sirve localmente el contenido de `dist/`. |
| `npm run db:migrate` | Aplica `backend/db/schema.sql`. |
| `npm run db:seed` | Carga el catálogo histórico. |
| `npm run db:seed:demo` | Carga los productos de demostración. |

### Comandos internos desde `backend/`

| Comando | Descripción |
| --- | --- |
| `npm.cmd run dev` | Ejecuta Express con `node --watch`. |
| `npm.cmd start` | Ejecuta Express sin watcher. |
| `npm.cmd run db:migrate` | Aplica `db/schema.sql` a `DATABASE_URL`. |
| `npm.cmd run db:seed` | Carga el catálogo histórico. |
| `npm.cmd run db:seed:demo` | Carga productos de demostración. |

PostgreSQL continúa siendo un proceso/recurso separado. `npm run dev` coordina únicamente las dos aplicaciones Node del repositorio.

## Base de datos

### Tablas principales

| Tabla | Responsabilidad |
| --- | --- |
| `products` | Inventario interno y catálogo público. `published` determina si aparece en la tienda. |
| `orders` | Pedidos, datos de entrega, pago, snapshot de ítems y control de reservas. |
| `users` | Cuentas de clientes, datos de contacto y estado de verificación del email. |
| `email_verification_tokens` | Enlaces de un solo uso y vencimiento para confirmar el email. |
| `favorites` | Relación entre usuarios y productos favoritos. |
| `reviews` | Calificación y comentario, una reseña por usuario/producto entregado. |
| `stock_alerts` | Solicitudes de aviso cuando vuelve el stock. Admite invitados. |

`products` cumple dos funciones para evitar catálogos duplicados:

- Campos internos: `codigo`, proveedor derivado, costos, precios, stock, grupo y subgrupo.
- Campos de tienda: `name`, `category`, imágenes, descripción, variantes y `published`.

Los pedidos guardan los productos en `items` como JSONB. Es un snapshot: aunque después cambie el nombre o precio del producto, el pedido conserva lo comprado en ese momento.

Las reseñas requieren una cuenta con email confirmado y al menos un pedido en estado `delivered` que contenga el producto. Al marcar un pedido como entregado se envía, una sola vez, un correo con enlaces directos para reseñar sus productos.

### Estados de pedido

- `pending_payment`: se reservó stock y falta confirmar Mercado Pago.
- `paid`: pago aprobado.
- `reserved`: retiro reservado para pagar en el local.
- `preparing`: pedido en preparación.
- `shipped`: pedido despachado.
- `delivered`: pedido entregado.
- `cancelled`: cancelado; libera stock.
- `payment_failed`: pago rechazado o cancelado; libera stock.
- `expired`: venció la reserva; libera stock.

## Rutas principales del frontend

| Ruta | Pantalla |
| --- | --- |
| `/` | Inicio |
| `/products` | Catálogo |
| `/products/:id` | Detalle de producto |
| `/cart` | Carrito |
| `/checkout` | Checkout |
| `/order-confirmation` | Resultado de compra/reserva |
| `/track-order` | Seguimiento público |
| `/login` / `/register` | Acceso de clientes |
| `/verify-email` | Confirmación del email mediante token |
| `/account` | Perfil autenticado |
| `/favorites` | Favoritos autenticados |
| `/orders` | Historial autenticado |
| `/admin/login` | Acceso administrativo |
| `/admin` | Panel administrativo |

## API HTTP

La API responde JSON, salvo la descarga/servicio de archivos estáticos en `/uploads`.

### Públicas

- `GET /api/health`
- `GET /api/catalog`
- `GET /api/catalog/:id`
- `GET /api/reviews/:productId`
- `GET /api/shipping/estimate?postalCode=1894&service=clasico`
- `GET /api/shipping/estimate?postalCode=5000&service=expreso&packageType=large`
- `POST /api/orders`
- `POST /api/auth/verify-email`
- `GET /api/orders/public/:id`
- `GET /api/orders/track/:orderNumber`
- `POST /api/stock-alerts`
- `POST /api/webhooks/mercadopago`

### Clientes autenticados

La sesión se guarda en la cookie HTTP-only `fenix_session`.

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `PATCH /api/auth/me`
- `POST /api/auth/resend-verification`
- `GET /api/orders/mine`
- `GET`, `POST` y `DELETE /api/favorites`
- `POST` y `DELETE /api/reviews`; publicar exige email confirmado y compra entregada

### Administración

Estas rutas requieren la cookie HTTP-only obtenida mediante `POST /api/admin/session`:

- `GET /api/orders`
- `GET /api/orders/:id`
- `PATCH /api/orders/:id/status`
- `GET /api/stock-alerts`
- CRUD y ajuste de stock bajo `/api/products`
- Subida de imágenes en `/api/products/:id/image`
- Importaciones bajo `/api/products/import/*`

## Catálogo e importaciones

El panel acepta estos flujos:

| Tipo | Endpoint | Efecto |
| --- | --- | --- |
| Catálogo Huergui | `/api/products/import/catalog` | Crea/actualiza descripción, grupo, subgrupo y medida. |
| Vista previa de precios proveedor | `/api/products/import/prices/parse` | Extrae precios y propone coincidencias sin modificar la DB. |
| Alta masiva de precios proveedor | `/api/products/import/prices/bulk` | Recibe varios Excel, toma el proveedor del nombre de cada archivo y crea borradores no publicados. |
| Moneda por proveedor | `GET /api/products/supplier-settings` y `PATCH /api/products/supplier-settings/:supplier` | Permite elegir ARS/USD y recalcula todos los precios del proveedor. |
| Reasociación de códigos de precios | `/api/products/import/prices/rematch` | Recalcula coincidencias después de un reemplazo masivo de códigos. |
| Confirmación de precios proveedor | `/api/products/import/prices/apply` | Aplica las filas revisadas, asociadas o marcadas como producto nuevo. |
| Venta POS | `/api/products/import/sale` | Descuenta unidades vendidas. |
| Compra KIAN | `/api/products/import/purchase` | Incrementa stock y registra precio USD. |
| Factura/remito PDF | `/api/products/import/invoice/parse` | Extrae líneas y propone coincidencias sin modificar la DB. |
| Confirmación de PDF | `/api/products/import/invoice/apply` | Aplica las líneas revisadas por el administrador. |
| Vista previa de imágenes de catálogo | `/api/products/import/catalog-images/parse` | Recibe proveedor y PDF, extrae fotos y propone productos existentes sin modificar la DB. |
| Imagen alternativa de catálogo | `/api/products/import/catalog-images/image` | Sube una foto alternativa dentro de una revisión pendiente. |
| Confirmación de imágenes de catálogo | `/api/products/import/catalog-images/apply` | Actualiza únicamente `image_url` en las asociaciones confirmadas del proveedor. |
| Catálogo CLEOS PDF | `/api/products/import/cleos/parse` | Extrae productos, precios e imágenes y muestra una vista previa editable. |
| Imagen de revisión CLEOS | `/api/products/import/cleos/image` | Sube una imagen alternativa antes de confirmar la importación. |
| Confirmación CLEOS | `/api/products/import/cleos/apply` | Crea o actualiza solamente los productos aceptados y guarda sus imágenes. |

Las planillas se procesan en memoria con un límite de 15 MB y los PDF con un límite de 50 MB. Las imágenes aceptadas son JPEG, PNG, WebP o GIF, con un límite de 8 MB.

La tarjeta “Precios proveedor” permite seleccionar varios archivos o una carpeta
completa. Admite XLS/XLSX, detecta las columnas por sus encabezados, usa el nombre
del archivo sin extensión como proveedor y crea los productos nuevos con
`published = false`. Los códigos que ya existen no se modifican, salvo aquellos
que tengan una asociación confirmada con una variante: esos actualizan el color
o medida correspondiente sin volver a crear un producto separado. Si el nombre del
archivo contiene “DOLARES”, “DÓLARES” o “USD”, los importes se convierten a ARS con
la cotización administrativa vigente y también se conserva el costo original USD.
La moneda puede corregirse luego desde la tarjeta “Proveedor y moneda”. Esa
elección se reutiliza en las próximas importaciones del proveedor y tiene
prioridad sobre el nombre del archivo. Los valores fuente USD se conservan en
columnas separadas; la administración, el catálogo público, las variantes y el
checkout reciben siempre el importe final convertido a ARS.

La revisión de precios permite editar costo, venta y precio con IVA; elegir ARS
o USD para toda la planilla o por fila; desmarcar filas; y asociar manualmente
un código desconocido a cualquier producto existente. Para cada código sin
coincidencia muestra primero los tres productos más similares con su miniatura,
permite desplegar más candidatos o buscar, y también crear un borrador nuevo sin
imagen. Las asociaciones pueden quitarse para volver a los candidatos; además,
la revisión ofrece seleccionar todo, deseleccionar todo y aceptar en bloque las
recomendaciones sin repetir el mismo producto. Cuando varias filas representan
colores distintos, pueden asignarse al mismo producto marcándolas como variantes:
cada color conserva nombre, código de proveedor y precio propio dentro de
`color_options`. Si dos o más códigos comparten la misma base y solamente cambia
un sufijo de color conocido (`-WW`, `-CW`, `-N`, `-W`, `-B`, entre otros), la vista
previa los agrupa, recomienda el producto base y completa automáticamente el
nombre y tono del color (`-N` significa Neutral white). Los grupos que requieren
asignación o correcciones aparecen primero; el resto se ordena por posible
producto o familia, y los códigos de cada bloque se muestran alfabéticamente. La revisión ocupa la
pantalla completa y separa los precios en secciones: primero los que requieren
atención, luego las familias de colores contraíbles y finalmente los demás
productos listos. Cada sección permite expandir o contraer todos sus grupos.
Los conflictos se muestran tanto en el encabezado del grupo como en cada fila.
Las filas desmarcadas pasan a una sección visible `Deseleccionados`, desde donde
pueden volver a incluirse sin buscarlas dentro de otra familia.
Cuando una fila permite inferir el color, cada producto recomendado incluye un
atajo `Como <color>` que lo asigna directamente como variante, incluso si ese
producto ya está usado por otra fila, sin activar manualmente la opción de
repetir producto. Las otras filas del mismo producto cuyo color pueda inferirse
también se convierten automáticamente en variantes.
La cabecera permite aplicar reemplazos literales masivos de código —por ejemplo,
`CCL-` por `CL-` solamente al inicio—, informa cuántas filas serán afectadas y
vuelve a ejecutar las asociaciones contra todo el catálogo; el reemplazo puede
quedar vacío para eliminar un prefijo. Antes de elegir el archivo se indica su
proveedor. Cada confirmación guarda en `supplier_product_mappings` la relación
entre proveedor, código original del XLS, producto y color, y las cargas futuras
reutilizan esa relación antes de calcular similitudes. La comparación exacta de
códigos ignora espacios. La selección ARS/USD se presenta como un control
segmentado compacto tanto a nivel de planilla como por fila.
La tienda muestra el precio del color elegido y el backend lo
vuelve a validar al crear el pedido. La cotización USD/ARS se
guarda en `store_settings` (valor inicial: 1510) mediante
`GET/PATCH /api/products/currency-settings`. Los precios públicos y los cobros
siguen expresados en ARS, mientras el administrador ve también su equivalente
en USD.

La tarjeta “Catálogo con imágenes” exige elegir primero un proveedor. Para CLEOS
reutiliza su extractor específico; para el resto aplica una lectura genérica que
busca códigos de productos de ese proveedor y relaciona cada uno con la imagen
más cercana en la página. La revisión muestra la foto propuesta, el producto de
destino y su imagen actual. Las asociaciones incorrectas pueden buscarse y
corregirse manualmente dentro del mismo proveedor. Nada cambia hasta confirmar y,
si no se prepara una unión o eliminación, la confirmación sólo reemplaza
`image_url`: no modifica precios, stock, textos ni el estado de publicación. Las
fotos o asociaciones no seleccionadas se omiten.
Durante esa misma revisión se pueden seleccionar dos productos y preparar una
unión rápida como variantes de color o medida. Se elige cuál queda y se completa
el código base final y el valor de ambos; el producto absorbido se elimina al
confirmar, pero los códigos originales, el stock y los precios individuales
(ARS y USD) se conservan en la variante. Las
asociaciones de la lista de precios se trasladan al producto principal para que
las cargas futuras continúen actualizando el color o la medida correctos. También
se puede preparar la eliminación directa de un producto duplicado y deshacerla
antes de confirmar. Imágenes, uniones y eliminaciones se aplican juntas dentro de
la misma transacción.

## Envíos

El costo se cotiza con `backend/services/shippingQuotes.js`. Por defecto usa
`SHIPPING_PROVIDER=manual` y las tarifas temporales de
`backend/config/shipping.js`; el checkout conserva una copia en
`src/config/shipping.js` para mostrar la cotización sin demoras.

Las tarifas manuales vigentes son:

| Alcance | Códigos postales | Clásico | Expreso |
| --- | --- | ---: | ---: |
| Local | 1894 | $12.020 | $13.219 |
| Nacional estándar | 1000, 2000, 5000, 7600 | $15.957 | $21.941 |
| Nacional grande (60 × 40 × 30 cm) | Se activa al informar paquete grande | $33.069 | $46.546 |

Los archivos que contienen el tarifario son:

- `src/config/shipping.js`, para mostrar la estimación en la interfaz.
- `backend/config/shipping.js`, para recalcular y validar el costo de forma segura.

Todo cambio manual debe aplicarse en ambos archivos. El backend vuelve a cotizar
y es la autoridad final al crear el pedido; nunca acepta el precio enviado por
el navegador.

El cliente puede elegir envío clásico o expreso. Si el código postal no coincide,
el checkout deriva la consulta a WhatsApp. La tarifa grande ya está contemplada
por el cotizador, pero requiere que el catálogo o el futuro proveedor informe
las dimensiones reales del paquete.

Cuando estén disponibles las credenciales, implementar el adaptador marcado en
`backend/services/shippingQuotes.js`, configurar las variables
`CORREO_ARGENTINO_*` y cambiar `SHIPPING_PROVIDER` a `correo_argentino`. El resto
del checkout y la creación de órdenes mantienen el mismo contrato.

## Mercado Pago y webhooks en desarrollo

Mercado Pago necesita alcanzar una URL pública para enviar el webhook. Para una prueba local se puede exponer el backend con ngrok u otro túnel:

```powershell
ngrok http 3001
```

Después configurar, por ejemplo:

```dotenv
APP_BASE_URL=https://TU_SUBDOMINIO.ngrok-free.app
FRONTEND_BASE_URL=http://localhost:5173
MP_ACCESS_TOKEN=TEST-...
MP_WEBHOOK_SECRET=...
```

Mercado Pago no acepta `localhost` en `back_urls`. En desarrollo, el backend
usa `APP_BASE_URL` como retorno público y luego redirige el navegador a
`FRONTEND_BASE_URL`. La URL notificada será:

```text
https://TU_SUBDOMINIO.ngrok-free.app/api/webhooks/mercadopago
```

El checkout se selecciona según las credenciales: los access tokens `TEST-...`
usan sandbox y los tokens productivos `APP_USR-...` usan el checkout real,
aunque el backend esté ejecutándose localmente.

La firma configurada en `MP_WEBHOOK_SECRET` debe pertenecer al mismo modo y a
la misma aplicación que `MP_ACCESS_TOKEN`. Si la firma no coincide, el backend
consulta el pago por ID con el access token antes de actualizar el pedido, por
lo que nunca confía solamente en el contenido recibido por el webhook.

## Panel administrativo y seguridad

El panel envía la contraseña una sola vez a `POST /api/admin/session`. El backend valida `ADMIN_SECRET`, limita intentos fallidos por IP y emite una cookie HTTP-only, `SameSite=Strict`, firmada con `ADMIN_SESSION_SECRET`. La contraseña no se compila ni se guarda en el navegador. Las mutaciones administrativas también validan el origen.

También se deben usar secretos distintos a los valores de ejemplo, HTTPS y `MP_WEBHOOK_SECRET` obligatorio.

## Imágenes subidas

Por defecto se guardan en `backend/public/uploads` y Express las publica bajo `/uploads`.

En un hosting con filesystem efímero, como varias configuraciones de Railway o Render, hay que montar un volumen persistente y apuntar `UPLOADS_DIR` a ese volumen. Sin persistencia, las imágenes subidas se pierden al redesplegar o reiniciar la instancia.

Para una arquitectura escalable conviene reemplazar el disco local por almacenamiento de objetos como S3, Cloudinary o equivalente.

## Backups administrativos

El panel **Administración → Backups** genera archivos `.fenix` cifrados que incluyen:

- Un dump SQL completo de PostgreSQL.
- Las imágenes configuradas en `UPLOADS_DIR`.
- Los comprobantes privados de `TRANSFER_PROOFS_DIR`.
- Un manifiesto con tamaño y SHA-256 de cada archivo.

La restauración se sube en partes de 8 MiB, valida el cifrado y todos los hashes, crea un backup preventivo del estado actual y recién entonces reemplaza archivos y base de datos. El SQL se aplica con `psql --single-transaction` y `ON_ERROR_STOP`, por lo que un error revierte la transacción. Durante el intercambio final la API entra temporalmente en mantenimiento.

Para desarrollo se necesitan `pg_dump` y `psql` compatibles con el servidor PostgreSQL. Se puede generar una clave local con:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

La clave debe guardarse también fuera del servidor. Los backups almacenados en el mismo volumen son copias operativas, no copias externas: hay que descargarlos a otra computadora o almacenamiento independiente.

## Build y despliegue

### Producción unificada

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start
```

Con `NODE_ENV=production`, Express sirve:

- La API bajo `/api/*`.
- Las imágenes bajo `/uploads/*`.
- Los archivos compilados de `dist/`.
- `dist/index.html` como fallback para las rutas de React Router.

### Railway: un servicio web más PostgreSQL

El archivo `railway.json` incluido configura automáticamente:

- Builder: Railpack.
- Build: `npm run build`.
- Pre-deploy: `npm run db:migrate`.
- Start: `npm start`.
- Healthcheck: `/api/health`.
- Reinicio ante fallos.

En Railway hay que crear:

1. Un servicio desde este repositorio, con Root Directory `/`.
2. Un recurso PostgreSQL dentro del mismo proyecto.

No hay que crear servicios Railway separados para frontend y backend.

Variables mínimas recomendadas en producción:

```dotenv
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
ADMIN_SECRET=...
ADMIN_SESSION_SECRET=...
JWT_SECRET=...
MP_ACCESS_TOKEN=...
MP_WEBHOOK_SECRET=...
APP_BASE_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
FRONTEND_BASE_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
UPLOADS_DIR=/ruta/persistente/uploads
TRANSFER_PROOFS_DIR=/ruta/persistente/transfer-proofs
```

`APP_BASE_URL` y `FRONTEND_BASE_URL` apuntan al mismo dominio porque la tienda y la API salen del mismo servicio. No se debe configurar `VITE_API_URL` en este despliegue.

Consideraciones de despliegue:

- Ejecutar la migración antes de recibir tráfico con una versión nueva.
- No ejecutar las semillas automáticamente en cada arranque.
- Configurar un volumen persistente para uploads o usar almacenamiento externo.
- Mantener `APP_BASE_URL` públicamente accesible para Mercado Pago.
- Configurar `FRONTEND_BASE_URL` sin `/` final y con el origen exacto permitido por CORS.
- Usar el HTTPS provisto por Railway para las cookies seguras.
- El trabajo de vencimiento de reservas corre dentro del servicio web; debe existir al menos una instancia activa.

No hay actualmente `Dockerfile`, `docker-compose.yml`, pipeline CI ni suite de tests automatizados. Railway usa la configuración de `railway.json` y Railpack.

## Verificaciones manuales recomendadas

### Compilación

```powershell
# Desde la raíz
npm.cmd run build
```

### Salud de la API

Con el backend levantado:

```powershell
Invoke-RestMethod http://localhost:3001/api/health
```

Respuesta esperada:

```json
{
  "ok": true,
  "env": "development"
}
```

### Recorrido mínimo

1. Aplicar el esquema y cargar una semilla.
2. Abrir `/products` y comprobar que llegan productos publicados.
3. Crear una cuenta y verificar `/account`.
4. Agregar un producto al carrito y recargar para comprobar persistencia.
5. Crear una reserva con retiro y pago en el local.
6. Buscarla desde `/track-order` mediante su número `FX-XXXXXX`.
7. Entrar a `/admin`, localizar el pedido y cambiar su estado.
8. Probar Mercado Pago con credenciales y usuario de prueba.
9. Verificar el webhook en los logs y el cambio del pedido a `paid`.

## Problemas frecuentes

### La tienda abre pero el catálogo está vacío

- Confirmar que el backend está levantado.
- Abrir `http://localhost:3001/api/health`.
- Aplicar `npm run db:migrate` desde la raíz.
- Ejecutar una semilla o publicar productos desde el panel.
- Revisar que `products.published` sea `true`.

### `DATABASE_URL` aparece indefinida o falla la conexión

Verificar que exista `backend/.env` y revisar usuario, contraseña, puerto y nombre de la base. Los scripts de la raíz ejecutan el backend con esa carpeta como directorio de trabajo, por lo que `dotenv` encuentra el archivo automáticamente.

### El panel abre pero devuelve `401 No autorizado`

Verificar que `ADMIN_SECRET` y `ADMIN_SESSION_SECRET` existan y que `FRONTEND_BASE_URL` coincida con el origen del navegador. Después de cambiar secretos hay que iniciar sesión nuevamente.

### El frontend no llega al backend en producción

- Confirmar que `NODE_ENV=production` esté configurado.
- Comprobar que el build generó `dist/`.
- No definir `VITE_API_URL` para el despliegue unificado.
- Configurar `APP_BASE_URL` y `FRONTEND_BASE_URL` con el mismo dominio público.
- Revisar `/api/health`, los logs y las cookies en las herramientas del navegador.

### Mercado Pago vuelve al sitio pero el pedido no cambia a pagado

- Confirmar que `APP_BASE_URL` sea pública.
- Revisar `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET`.
- Verificar la URL `/api/webhooks/mercadopago` en Mercado Pago.
- Revisar los logs del backend.
- No usar `localhost` como URL de webhook.

### Las imágenes desaparecen después de un deploy

La carpeta configurada en `UPLOADS_DIR` no es persistente. Montar un volumen o mover los archivos a almacenamiento externo.

### PowerShell bloquea `npm`

Usar el ejecutable de Windows:

```powershell
npm.cmd run dev
```

## Próximos pasos recomendados

1. Reemplazar la clave administrativa embebida por autenticación segura del lado del servidor.
2. Agregar tests de API y tests del flujo de checkout/stock.
3. Agregar un pipeline CI con build y pruebas antes de desplegar en Railway.
4. Implementar la llamada real a Correo Argentino.
5. Centralizar las zonas de envío para evitar mantener dos copias.
6. Mover las imágenes a almacenamiento persistente.
7. Dividir el bundle del panel y las páginas públicas con carga diferida.
8. Incorporar logs estructurados, monitoreo y alertas de errores.

## Licencia

El repositorio no declara actualmente una licencia. Agregar un archivo `LICENSE` antes de distribuirlo públicamente.
