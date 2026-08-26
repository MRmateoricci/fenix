# Fénix Electricidad e Iluminación — Contexto del proyecto

> Este archivo lo lee Claude Code automáticamente al iniciar cada sesión.
> Contiene contexto **estable**: arquitectura, convenciones y reglas.
> El registro de qué se hizo y cuándo va en `docs/ESTADO.md`.

---

## 1. Qué es esto

Tienda online + panel de administración para **Fénix Electricidad e Iluminación**,
casa de electricidad e iluminación en City Bell, La Plata (Argentina), en actividad
desde 1977.

El sistema reemplaza un flujo manual dependiente de listas de precios de proveedores.
Cubre tres cosas a la vez:

1. **Inventario interno** — importación de listas de precios (XLSX/PDF), costos,
   márgenes, stock.
2. **Catálogo público** — la tienda que ve el cliente.
3. **Ventas** — carrito, checkout con Mercado Pago, cotización de envío, pedidos.

Decisión de arquitectura central: **el catálogo público y el inventario son la misma
tabla `products`**. Un producto de inventario se "publica" completando las columnas de
catálogo (`name`, `category`, `image_url`…) y poniendo `published = true`. No hay
duplicación entre inventario y tienda.

---

## 2. Stack

**Frontend** — React 19, Vite 8, React Router 7, Tailwind 4, react-helmet-async.
Estilos mayormente inline con variables CSS (`var(--color-bg)`, `var(--font-serif)`).

**Backend** — Node 20+, Express 4, PostgreSQL (`pg`), ESM (`"type": "module"`).

**Servicios externos** — Mercado Pago (Checkout Pro), Nodemailer/Gmail SMTP,
Google Places API (reseñas), OAuth Google/Facebook, Correo Argentino (pendiente).

**Deploy** — Railway. Express sirve el `dist/` del frontend y la API desde un
único servicio, por eso `APP_BASE_URL` y `FRONTEND_BASE_URL` comparten dominio
en producción.

**Comandos**

```bash
npm run dev            # frontend (5173) + backend (3001) en paralelo
npm run build          # vite build
npm run db:migrate     # aplica backend/db/schema.sql (idempotente)
npm run db:seed        # datos de tienda
npm run db:seed:demo   # productos de ejemplo
```

---

## 3. Mapa del código

```
src/
  App.jsx                    Rutas
  components/
    ProductCard.jsx          Tarjeta de producto (badges, cuotas, precio)
    CartDrawer.jsx           Carrito lateral
    Navbar.jsx  Footer.jsx  SEO.jsx  WhatsAppFAB.jsx
  context/
    AdminContext.jsx         Productos + config de tienda (fuente del catálogo)
    CartContext.jsx  AuthContext.jsx  FavoritesContext.jsx
  data/
    categoryTree.js          Árbol de categorías por defecto
    heroSlides.js            Slides del carrusel del home
    products.js              Fallback estático
  pages/
    Home.jsx  Products.jsx  ProductDetail.jsx
    Cart.jsx  Checkout.jsx  OrderConfirmation.jsx  OrderTracking.jsx
    ProductosAPedido.jsx     Sección "a pedido"
    admin/AdminDashboard.jsx  ← 8.100+ líneas, leer con cuidado
  config/ seo.js  shipping.js
  utils/ productVariants.js

backend/
  index.js                   Monta los routers, sirve dist/
  db/schema.sql              Esquema completo, idempotente (IF NOT EXISTS)
  config/shipping.js         Zonas por CP + umbral de envío gratis
  routes/                    orders, products, catalog, shipping, coupons,
                             auth, reviews, googleReviews, stockAlerts,
                             favorites, newsletter, webhooks, subcategories,
                             productTypes, categoryCustomizations
  services/                  mercadopago, publicPricing, productsRepo,
                             stockReservation, productVariants, shippingQuotes,
                             correoArgentino, excelImport, cleosCatalogImport,
                             pdfInvoiceImport, catalogImageImport,
                             folderImageImport, coupons, mailer,
                             orderNotifications, reviewInvitations
```

Secciones del panel admin: Resumen · Productos · Categorías · Tienda · Ofertas ·
Cupones · Pedidos.

---

## 4. Reglas del proyecto

Estas reglas ya están aplicadas en el código. Respetarlas al agregar cosas nuevas.

### 4.1 Precios

- **La tienda publica siempre importes finales con IVA.** `publicPricing.js` es la
  autoridad; `IVA_MULTIPLIER = 1.21`. No recalcular IVA en el frontend.
- Productos en USD se convierten a ARS con `price_exchange_rate` antes de mostrarse.
- Los precios del carrito **se recalculan server-side** en el checkout. Nunca confiar
  en el monto que manda el cliente.

### 4.2 Fuente única de verdad

Los valores configurables viven en el **backend**, no hardcodeados en componentes:

- Envío gratis → `FREE_SHIPPING_THRESHOLD` en `backend/config/shipping.js`,
  configurable con la env var `ENVIO_GRATIS_MINIMO`. El frontend lo recibe de
  `GET /api/shipping/config`.
- Tarifas de envío → `SHIPPING_ZONES` en el mismo archivo.
- Proveedor de envío → env var `SHIPPING_PROVIDER` (`manual` | `correo_argentino`).

Si agregás un valor que el cliente pueda querer cambiar, va acá, no en el JSX.

### 4.3 Mercado Pago / cuotas

- Se usa **Checkout Pro**. El sitio **nunca** ve el BIN de la tarjeta antes del
  checkout, así que no se puede consultar cuotas por banco/tarjeta desde una tarjeta
  de producto. Cualquier propuesta de "consultar la API de MP por producto" es
  inviable — no volver a proponerla.
- La UI muestra un único valor configurable de cuotas máximas. Redacción correcta:
  *"Hasta N cuotas sin interés según banco y tarjeta"*.
- Ese valor debe estar sincronizado con lo configurado en el panel de comerciante
  de MP. Si difieren, el cliente ve una promesa que el checkout no cumple.

### 4.4 Disponibilidad y variantes

- **La tienda no lleva stock.** El mismo inventario se vende en el mostrador y online
  sin POS que los sincronice, así que los números quedaban viejos en días. La
  disponibilidad es una bandera por producto: `products.stock_inmediato`.
- **Todo lo publicado es comprable.** La única palanca para sacar algo de venta es
  `published = false`. No agregar condiciones de compra basadas en cantidades.
- Lo único que cambia entre un producto y otro es el **plazo**: `dias_despacho_inmediato`
  si está en el local, `dias_entrega_pedido` ?? `dias_entrega_pedido_default` si hay que
  reponerlo. `routes/catalog.js` ya lo resuelve y lo expone como `diasEntrega` — no
  recombinar bandera + settings + override en el frontend.
- La redacción de plazos vive en `src/utils/plazoEntrega.js`. Usarla, no escribir
  frases nuevas: si cada pantalla redacta la suya, el cliente lee dos promesas
  distintas del mismo pedido.
- La disponibilidad es **por producto, no por variante**. No reconstruir una matriz de
  disponibilidad por color/medida/tono: es exactamente lo que se sacó.
- Los productos siguen teniendo tres ejes de variante (**color**, **medida**, **tono de
  luz**) para precio, imagen y ficha. `variant_stock` sigue existiendo en la base pero
  **sin uso**.
- `stockReservation.js` está **fuera de servicio**. Si alguna vez se reactiva, reserva y
  liberación se prenden **juntas**: con una sola de las dos, cada pedido cancelado
  descuadra el stock de forma permanente.

### 4.5 Envíos

- Origen: City Bell, CP 1896.
- 7 zonas por rango de CP cubriendo 1000–9999 sin huecos, más una tarifa plana de
  paquete grande (60×40×30 cm).
- Los campos físicos ya existen en `products`: `length_cm`, `width_cm`, `height_cm`,
  `weight_kg`. Centímetros y kilogramos, sin excepción.
- **Peso volumétrico es obligatorio** para cualquier cotizador real de esta categoría
  de producto (artefactos de iluminación son livianos y voluminosos). Sin dimensiones
  cargadas, ningún cotizador da un número confiable.
- El carrito no puede prometer envío gratis por zona: en ese momento todavía no se
  conoce el domicilio de entrega.

### 4.6 Estilo de código

- ESM en todos lados (`import`/`export`), nunca `require`.
- El esquema es **idempotente**: `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT
  EXISTS`. Las columnas nuevas se agregan al final con `ALTER TABLE ... IF NOT EXISTS`,
  nunca modificando el `CREATE TABLE` original.
- Toda columna nueva lleva un comentario SQL explicando **por qué** existe, no qué es.
- Naming: `snake_case` en la base y en la API interna, `camelCase` en el frontend. La
  conversión se hace en `routes/catalog.js` (salida) y `context/AdminContext.jsx` (entrada).
- Tests con el runner nativo de Node, convivviendo junto al archivo que prueban
  (`x.js` + `x.test.js`).
- Idioma: comentarios, textos de UI y mensajes de commit en **español**.

---

## 5. Antes de implementar cualquier cosa

**Buscá primero si ya existe.** El proyecto tiene más superficie de la que parece y
hay funcionalidad completa que no es obvia desde el nombre del archivo. Un
`grep -rn "<concepto>" src backend` antes de escribir código evita reimplementar.

Ejemplos de cosas que ya están hechas y podrían parecer pendientes:

- Disponibilidad por producto (`stock_inmediato`) — schema, admin, chip, filtro del
  catálogo y página `/entrega-inmediata`
- Cupones de descuento — tabla, endpoints, sección de admin
- Alertas de stock ("avisame cuando vuelva") — tabla y endpoints existen pero están
  **fuera de uso**: si todo lo publicado es comprable, no hay "vuelta" que avisar
- Reseñas propias **y** reseñas de Google Places
- Import de listas de precios desde XLSX y desde PDF de factura
- Import masivo de imágenes de catálogo con revisión y autoguardado de borrador
- Precio propio por color y por medida
- Envío gratis por umbral
- Cotización de envío por zona

---

## 6. Cómo trabajar en este repo

- **Un tema por vez.** No combinar cambios de checkout con cambios de home en la misma
  tanda.
- **Auditar antes de implementar.** Reportar qué se encontró y esperar confirmación
  antes de escribir código, salvo que el cambio sea trivial.
- **Declarar qué NO se toca.** Cada tarea debe listar explícitamente las áreas que
  quedan fuera de alcance.
- **Mobile no se verifica desde acá.** `resize_window` no es confiable:
  `window.innerWidth` sigue reportando ancho de escritorio después de redimensionar.
  Decir explícitamente que la verificación mobile queda pendiente en dispositivo real,
  nunca afirmar que el mobile quedó bien.
- **Actualizar `docs/ESTADO.md`** al cerrar una tanda de trabajo — no en cada prompt.
  Regla: si el cambio merece un commit con mensaje propio, merece una entrada.
