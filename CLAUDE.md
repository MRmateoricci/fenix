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
Cubre cuatro cosas a la vez:

1. **Inventario interno** — importación de listas de precios (XLSX/PDF), costos,
   márgenes, stock.
2. **Catálogo público** — la tienda que ve el cliente.
3. **Ventas online** — carrito, checkout con Mercado Pago, cotización de envío, pedidos.
4. **POS de mostrador** (`pos-frontend/`) — venta presencial en el local, app aparte
   que comparte el mismo backend y la misma base (ver 4.7).

Decisión de arquitectura central: **el catálogo público y el inventario son la misma
tabla `products`**. Un producto de inventario se "publica" completando las columnas de
catálogo (`name`, `category`, `image_url`…) y poniendo `published = true`. No hay
duplicación entre inventario y tienda.

---

## 2. Stack

**Frontend** — React 19, Vite 8, React Router 7, Tailwind 4, react-helmet-async.
Estilos mayormente inline con variables CSS (`var(--color-bg)`, `var(--font-serif)`).

**POS** (`pos-frontend/`) — proyecto Vite + React 19 **separado**, mismas versiones
de React Router y Tailwind 4 pero con clases utilitarias (no inline). Deploy propio en
Railway, subdominio propio, habla a la misma API. Ver 4.7.

**Backend** — Node 20+, Express 4, PostgreSQL (`pg`), ESM (`"type": "module"`).

**Servicios externos** — Mercado Pago (Checkout Pro), Nodemailer/Gmail SMTP,
Google Places API (reseñas), OAuth Google/Facebook, Andreani (tarifario manual,
integración API pendiente).

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
npm run db:seed:pos    # usuario admin inicial del POS (admin / admin123)

# POS — proyecto aparte, se corre por separado
cd pos-frontend && npm run dev   # (5174)
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
    admin/AnalyticsTab.jsx    Pestaña "Visitas" (analítica propia)
  config/ seo.js  shipping.js
  utils/ productVariants.js  analytics.js (beacon de visitas)

backend/
  index.js                   Monta los routers, sirve dist/
  db/schema.sql              Esquema completo, idempotente (IF NOT EXISTS)
  config/shipping.js         Zonas por CP + umbral de envío gratis
  routes/                    orders, products, catalog, shipping, coupons,
                             auth, reviews, googleReviews, stockAlerts,
                             favorites, newsletter, webhooks, subcategories,
                             productTypes, categoryCustomizations, analytics
  services/                  mercadopago, publicPricing, productsRepo,
                             stockReservation, productVariants, shippingQuotes,
                             correoArgentino, excelImport, cleosCatalogImport,
                             pdfInvoiceImport, catalogImageImport,
                             folderImageImport, coupons, mailer,
                             orderNotifications, reviewInvitations, analytics
  jobs/                      expireReservations, prunePageViews
  middleware/posAuth.js      JWT del POS (separado del admin/cliente)
  routes/pos/                auth, users, products, sales, settings, cash,
                             suppliers, purchases, supplierPayments, priceImports,
                             invoicing, fiscal — API del POS
  services/invoicePosFiscal.js  Emisión de factura de una venta del POS (Fase 5,
                             reusa invoiceService.js/invoiceFiscal.js/arcaWsfe.js)

pos-frontend/                App del POS, proyecto Vite separado (ver 4.7)
  src/
    context/AuthContext.jsx  Login + token del POS (no cookie)
    context/CashRegisterContext.jsx  Estado de la caja compartido (Fase 2)
    hooks/useProductCatalog.jsx  Cache local del catálogo (~40k productos)
    pages/POS.jsx            Pantalla principal de venta
    pages/Caja.jsx           Resumen, ingresos/egresos, cierre de caja
    pages/Sales.jsx  pages/admin/Users.jsx  pages/admin/Settings.jsx
    pages/admin/CashHistory.jsx  Historial de cajas cerradas (solo admin)
    pages/Suppliers.jsx  pages/SupplierDetail.jsx  pages/NewPurchase.jsx
                             Proveedores, cuenta corriente y compras (Fase 3, solo admin)
    pages/admin/PriceImport.jsx  pages/admin/BulkPriceIncrease.jsx
    pages/admin/PriceImportHistory.jsx
                             Importación de listas de precios y aumento % (Fase 4, solo admin)
    components/AfipStatusIndicator.jsx  components/InvoiceFields.jsx
    pages/admin/FiscalStatus.jsx
                             Facturación electrónica AFIP/ARCA (Fase 5) — ruta
                             `/admin/fiscal`, nav "AFIP"
    components/VatDeadlineBanner.jsx
    pages/admin/FiscalPanel.jsx  pages/admin/FiscalAnnualHistory.jsx
                             Panel de IVA: débito/crédito fiscal, saldo,
                             vencimientos, detalle e historial anual (Fase 6) —
                             rutas `/admin/panel-iva` y `/admin/panel-iva/anual`,
                             nav "Panel IVA". Deliberadamente separado de
                             FiscalStatus.jsx: ese es solo estado de conexión
                             AFIP, este es el saldo de IVA real del negocio —
                             no fusionar aunque el nombre "fiscal" se parezca.
```

Secciones del panel admin: Resumen · Productos · Categorías · Tienda · Ofertas ·
Cupones · Pedidos · Cuentas (solo lectura: cuentas de cliente + resumen de
actividad, `routes/customers.js`) · Visitas.

**Visitas** (`pages/admin/AnalyticsTab.jsx`, `routes/analytics.js`,
`services/analytics.js`): analítica propia, sin Google Analytics ni Plausible. El
frontend manda un beacon por cada cambio de ruta (`utils/analytics.js` +
`<TrackPageView />` en `App.jsx`) y el backend lo guarda en `page_views`. No se
guarda la IP: sólo un hash anónimo que rota cada día. Por eso **no existe
"personas únicas del período"** — sumar días contaría dos veces a quien vuelve.
`jobs/prunePageViews.js` borra lo de más de 180 días.

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
- Tarifas de envío → `SHIPPING_ZONES` + `SHIPPING_WEIGHT_TIERS` en el mismo
  archivo (zona × peso). El checkout tiene un espejo en `src/config/shipping.js`:
  todo cambio va en los dos.
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
- **Tarifario Andreani = zona × peso.** No hay zona "local": todo destino que
  podría contar como misma localidad entra como mínimo en la zona rosa. Tres
  zonas (`rosa` / `salmon` / `bordo`) resueltas por CP a nivel provincia
  (`PRICING_ZONE_RANGES`, best-effort en bordes provinciales) y nueve tramos de
  peso (`SHIPPING_WEIGHT_TIERS`). Los tramos **20–25 kg y más de 50 kg no
  cotizan**: Andreani no informó tarifa, se deriva a WhatsApp.
- **Fórmula:** `seguro = valor declarado × 0.02` (valor declarado = subtotal de
  productos con IVA, pre-cupón) → `subtotal = tarifa base + seguro` →
  `total = subtotal × 1.21`. El tarifario de Andreani viene sin IVA ni seguro.
- **Sin peso cargado en los productos se cotiza el tramo más barato** (0–1 kg),
  para no frenar la compra online. Cargar `weight_kg` real es tarea pendiente de
  datos. **No se calcula peso volumétrico** hoy (el tarifario Andreani es solo
  por peso real); sigue siendo deseable si se pasa a un cotizador propio —
  artefactos de iluminación son livianos y voluminosos.
- Los campos físicos ya existen en `products`: `length_cm`, `width_cm`,
  `height_cm`, `weight_kg`. Centímetros y kilogramos, sin excepción.
- **Días de tránsito ≠ zona de tarifa.** El precio va por las 3 zonas Andreani;
  la ventana de entrega se resuelve aparte, por una banda de CP más fina
  (`TRANSIT_BANDS` + `TRANSIT_OVERRIDES`), porque dentro de una misma zona una
  capital no tarda lo mismo que el interior. Son dos ejes; no recombinarlos.
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

### 4.7 POS de mostrador

- **Identidad separada del e-commerce.** `pos_users` es una tabla propia (usuario/
  contraseña, sin email ni OAuth). Login por **JWT en header `Authorization`**, no
  cookie — el POS vive en un subdominio propio y una cookie cruzaría dominios sin
  necesidad. Secreto propio: `POS_JWT_SECRET` (nunca reusar `JWT_SECRET` de clientes
  ni `ADMIN_SESSION_SECRET`). `requirePosAuth` relee `pos_users` en cada request —
  nunca confía solo en el payload del token — para que desactivar a un vendedor corte
  el acceso al instante y no cuando el token expire.
- **El POS sí lleva stock — pero solo para uso interno, no cambia la web.** Reactiva
  `products.stock` (la columna entera que ya existía pero estaba sin uso, ver 4.4)
  como contador real que el POS descuenta en cada venta. La tienda online sigue
  ignorando esa columna por completo y sigue usando solo `stock_inmediato`: nada de
  esto es visible ni afecta el checkout.
- **El descuento de stock nunca bloquea una venta**, ni con stock en 0: se registra
  igual y el número puede quedar negativo (ver A4 del pedido original). Por eso el
  POS reusa `services/productsRepo.js#applySaleDecrement` (el mismo mecanismo, no
  bloqueante, que ya usaba el import de reportes de venta del admin) y no
  `services/stockReservation.js#reserveStock`, que sí bloquea sin stock suficiente.
- **El stock por variante (`product_variant_rules.stock`) no se escribe desde el
  POS.** Tiene un `CHECK >= 0` en la base; el POS solo lo muestra a modo informativo.
  El trigger `sync_single_base_variant` (espeja `products.stock` en la variante única
  de un producto agrupado) usa `GREATEST(NEW.stock, 0)` por esto mismo — antes de ese
  fix, **cualquier** descuento de stock que dejara un producto de una sola variante en
  negativo rompía (bug preexistente, no solo del POS: afectaba también
  `/api/products/:id/adjust-stock` y `/stock/batch` del admin).
- **Precio del POS = precio público de la web**, resuelto server-side con
  `publicPricing.js` igual que el checkout (nunca se confía en el precio que mande
  el navegador — el cache local del POS puede tener hasta ~2-3 minutos de atraso).
- **Un producto sin precio cargado (`resolvePublicPrice` devuelve `null`) no se puede
  vender — nunca tratar ese `null` como $0.** Pasa seguido: es inventario recién
  importado de una lista de proveedor y todavía sin precificar. `POST /api/pos/sales`
  rechaza la venta entera si algún ítem resuelve en `null`; el frontend ya lo frena
  antes, mostrando "Sin precio" en la búsqueda y el selector de variante.
- **Cache de catálogo en el navegador.** `GET /api/pos/products/catalog` trae los
  ~40.000 productos una vez al loguearse (gzip); `GET /api/pos/products/catalog/
  updated?since=` refresca solo lo cambiado cada 2.5 min. `GET /api/pos/products/
  search` es *fallback* de servidor (índice GIN `idx_products_search`) solo mientras
  ese cache inicial no terminó de bajar.
- Si se agrega un campo de descuento nuevo: hoy es **porcentaje o monto fijo**,
  mutuamente excluyentes (`discountPercent` XOR `discountAmount` en `POST /api/pos/
  sales`) — no combinarlos en el mismo request.

**Caja (Fase 2):**

- **Una caja física por local, no una por vendedor.** Cualquiera que esté en el
  mostrador la abre y la cierra; no hay "mi caja" vs "tu caja". Se impone con un
  índice único parcial en la base (`uq_pos_cash_registers_one_open`), no solo con
  una validación en el código — dos terminales no pueden abrir caja a la vez aunque
  golpeen el endpoint al mismo tiempo.
- **Sin caja abierta no se puede vender.** `POST /api/pos/sales` resuelve la caja
  abierta él mismo dentro de la misma transacción (nunca recibe un id de caja del
  cliente) y rechaza la venta si no hay ninguna. El frontend refleja esto en `/`
  (`RequireOpenCashRegister` en `App.jsx`): sin caja abierta, se ve el formulario de
  apertura en lugar del POS.
- **"Efectivo esperado" = fondo + ventas en efectivo + ingresos − egresos, sin restar
  descuento aparte.** Los montos en `pos_sale_payments` ya son post-descuento (el pago
  tiene que sumar el `total`, que ya sale con el descuento aplicado) — restar el
  descuento de nuevo sería contarlo dos veces.
- **Permisos:** abrir/cerrar caja, ver el resumen actual (`GET /cash/current`) y
  cargar/ver movimientos → cualquier usuario del POS logueado. `GET /cash/history` y
  `GET /cash/:id` (detalle de una caja puntual, para el historial) → **solo admin**,
  mismo criterio que `/api/pos/users`.
- **`CashRegisterContext` no se entera solo de las ventas.** Una venta se crea desde
  `POS.jsx`, que no pasa por ese contexto — así que `pages/Caja.jsx` vuelve a pedir
  `GET /cash/current` (`refresh()`) cada vez que se entra a la pantalla. Sin esto, el
  resumen mostrado quedaba con los números de la última acción de caja (abrir/cerrar/
  movimiento), no con las ventas hechas mientras tanto — bug real encontrado
  probando el flujo completo.
- Fuera de alcance (no implementado a propósito): facturación fiscal del POS (ya
  existe ARCA para pedidos online en `routes/arca.js`, pendiente conectar acá).

**Proveedores y compras (Fase 3):**

- **`pos_suppliers` no tiene relación con `products.supplier`.** Este último es texto
  libre que ya usan las listas de precios del admin (`services/excelImport.js`,
  `supplier-settings` en `routes/products.js`); `pos_suppliers` es una entidad propia
  con CUIT/contacto/cuenta corriente. Son dos "proveedor" independientes a propósito —
  no cruzarlos sin que lo pidan explícitamente, podría romper el import existente.
- **Todo el módulo (`/api/pos/suppliers`, `/purchases`, `/supplier-payments`) es
  admin-only**, tanto en el backend como en las rutas del frontend — es la cuenta
  corriente real con cada proveedor, no una tarea de mostrador.
- **El saldo nunca se guarda, siempre se calcula**: `SUM(compras.total) -
  SUM(pagos.amount)` en cada request (ver A5 del pedido original). Positivo = le
  debemos: negativo = a favor.
- **Una compra suma stock por `product_id` con el mismo patrón simple que ya usa
  `/api/products/:id/adjust-stock`** (`UPDATE products SET stock = stock + $1`), no
  `services/productsRepo.js#applyPurchaseIncrement` — ese helper es específico de la
  importación de "orden de compra KIAN" (upsert por código, crea productos, fuerza
  USD) y no encaja con sumar stock a un producto existente por UUID.
- **El saldo acumulado del historial (`GET /suppliers/:id/movements`) se computa con
  una window function sobre TODO el historial, antes de paginar** — si se calculara
  solo sobre la página pedida, el saldo acumulado de la página 2 en adelante
  arrancaría de cero.
- La fecha que ordena la cuenta corriente de un pago es `pos_supplier_payments.date`
  (puede cargarse con fecha pasada), no `created_at` (cuándo se tipeó). Las compras no
  tienen ese distingo: solo `created_at`, no hay backdating de compras en esta fase.

**Importación de precios (Fase 4):**

- **Pipeline propio, en paralelo al del admin.** El e-commerce ya tenía uno completo
  (`services/excelImport.js` + `productsRepo.js#applyPriceUpdates` + `/api/products/
  import/prices/*`), pero está atado a crear productos, `supplier_product_mappings` y
  variantes por color/medida — carga que no corresponde para "actualizar el precio de
  un producto que ya existe, matcheado por código". Sí se reusan sus utilidades puras
  (`toNumber`, `normalizeCodigo`, `readPriceWorkbook` de `excelImport.js`) — no hacía
  falta reescribirlas.
- **El precio importado puede venir neto o con IVA incluido — depende del proveedor,
  no hay una convención fija.** Por eso el mapeo de columnas incluye un toggle
  explícito ("¿el precio incluye IVA?"). Sea cual sea el origen, `pos_price_import_
  details.old_price`/`new_price` **siempre** representan el neto (`precio_venta`):
  la conversión pasa una sola vez, al construir el detalle, así aplicar no necesita
  volver a mirar de dónde vino el número.
- **Aplicar siempre escribe `precio_venta` Y recalcula `precio_iva` juntos**
  (`precio_iva = precio_venta × 1.21`), nunca uno solo. `resolvePublicPrice` prioriza
  `precio_iva` si existe — tocar solo `precio_venta` y dejar un `precio_iva` viejo
  cargado de antes significa que el precio público **no cambia**, en silencio.
- **Los productos en USD (`price_currency = 'USD'`) quedan afuera de los dos flujos**
  (import de Excel y aumento porcentual), marcados `skipped_currency`. Tocar
  `precio_venta` (ARS) no cambiaría nada visible en ellos porque `resolvePublicPrice`
  prioriza los campos `_usd` — mezclar la conversión de moneda acá se sale del
  alcance de esta fase.
- **Un import de archivo y un aumento porcentual son la misma cosa después del
  preview**: ambos quedan en `pos_price_imports`/`pos_price_import_details` como "un
  lote de cambios propuesto, pendiente de aplicar o cancelar". Por eso `/:id/apply` y
  `/:id/cancel` son un solo endpoint genérico para los dos `kind` — no hace falta
  duplicar esa lógica para el aumento porcentual.
- **`pos_price_import_details` guarda TODAS las filas en el preview, no solo una
  muestra** — aplicar nunca vuelve a parsear el Excel ni recalcula nada, solo lee las
  filas ya guardadas con `status = 'matched'`. También es lo que permite restaurar un
  precio a mano si hace falta: cada fila conserva el `old_price` real.
- **`filters.supplier`/`filters.category` del aumento porcentual son texto libre**
  (`products.supplier`/`products.category`), no ids — no existe una tabla de
  categorías ni de proveedor con id en `products` (`GET /bulk-increase/filters` los
  expone). Un aumento porcentual sin ningún filtro se rechaza a propósito: repreciar
  todo el catálogo sin querer es un error caro.

**Facturación electrónica AFIP/ARCA (Fase 5):**

- **No hay una integración AFIP nueva — se reusa la del e-commerce, entera.** ARCA ya
  estaba implementado completo (`services/arcaAuth.js`/`arcaWsfe.js`/`arcaParameters.js`/
  `arcaTaxpayerRegistry.js` + `invoiceService.js`/`invoiceFiscal.js`/`invoicePdf.js`),
  probado contra homologación real (ver docs/ESTADO.md). **No se instaló
  `@afipsdk/afip.js` ni ninguna librería nueva** — hubiera significado dos sistemas
  gestionando el mismo CUIT/certificado ante AFIP, con riesgo real de numeración
  duplicada. `services/invoicePosFiscal.js#createInvoiceForPosSale` es la única pieza
  nueva: mismo esqueleto que `invoiceService.js#createInvoiceForOrder` (mismo lock de
  secuencia, misma tabla `invoices`), pero arma la fila desde `pos_sales` en vez de
  `orders`. Los pasos de persistencia (`persistProcessing`, `persistAuthorized`,
  `persistRejected`, `persistUncertain`, `consultUncertain`, `sendRequest`,
  `advisoryLock`/`Unlock`) están **exportados desde `invoiceService.js` y reusados tal
  cual** — son genéricos sobre una fila de `invoices`, no les importa si viene de un
  pedido o de una venta. `createInvoiceForOrder` en sí **no se tocó**.
- **`invoices`/`invoice_jobs` ahora aceptan `order_id` O `pos_sale_id`, nunca los dos
  ni ninguno** (CHECK `invoices_source_check`/`invoice_jobs_source_check`). Se extendió
  la tabla existente en vez de crear una `pos_invoices` paralela — evita duplicar ~15
  columnas (CAE, vencimiento, desglose de IVA, snapshots) ya probadas.
- **El punto de venta del POS es una env var propia, `ARCA_POS_PTO_VTA`, sin fallback al
  de la web (`ARCA_PTO_VTA`).** Decisión explícita del dueño: hasta que Fara habilite un
  punto de venta nuevo en el sitio de AFIP para el mostrador, facturar desde el POS
  falla con un error claro en vez de compartir numeración con la web sin que se haya
  decidido así. `config/arca.js#getArcaConfig` acepta `pointOfSaleEnvVar` para esto.
- **No hay pantalla para cargar CUIT/certificado/condición fiscal desde el POS, a
  propósito.** Esos datos ya viven en variables de entorno compartidas por toda la
  empresa (una sola identidad fiscal ante AFIP); `/admin/fiscal` es *solo* estado
  (entorno, punto de venta, auto-facturación) y "Probar conexión" (FEDummy) — nunca un
  formulario editable. Antes de esta fase **no existía ningún endpoint HTTP** para
  FEDummy (solo un script de línea de comandos, `scripts/testArca.js`).
- **El vendedor nunca elige "Factura A/B/C" directamente.** Elige la *condición del
  cliente* (Consumidor Final, Responsable Inscripto, Monotributo...); el tipo de
  comprobante lo deriva el backend (`invoiceFiscal.js#determineVoucherType`, el mismo
  que ya usa el checkout de la web) — evita que se arme una combinación que ARCA
  rechazaría.
- **La factura se intenta DESPUÉS de confirmar la venta (`COMMIT`), nunca dentro de la
  misma transacción** — es una llamada de red lenta a un servidor de terceros, y el
  stock ya se descontó. Mismo criterio que ya usa `mercadopagoPayments.js` con el
  webhook de MP. Si ARCA falla, la venta queda registrada igual, `is_invoiced` marca la
  intención, y el detalle de la venta ofrece "Reintentar emisión".
- **No hay credenciales de homologación de ARCA en el `.env` de desarrollo local** — la
  emisión real solo se probó (y se puede seguir probando) en el entorno donde ya están
  cargadas (Railway/staging). Todo lo demás (UI, validaciones, manejo de error, que la
  venta se registre igual si ARCA falla) sí se prueba acá.

**Panel fiscal (Fase 6):**

- **El débito fiscal es de TODO el negocio, no solo del POS.** `fetchVatDebit` en
  `backend/routes/pos/fiscal.js` suma `invoices.imp_iva` sin filtrar por `pos_sale_id`
  vs `order_id` — el saldo de IVA que ve el dueño tiene que ser el real ante AFIP,
  no un recorte artificial por canal de venta. Decisión confirmada explícitamente con
  el dueño, la consigna original lo dejaba ambiguo. El crédito fiscal, en cambio, sale
  solo de `pos_purchases` (`vat_21` + `vat_10_5` donde `has_invoice = TRUE`): las
  compras del negocio hoy sólo se cargan desde el POS, no hay un flujo de compras en
  el e-commerce.
- **node-postgres devuelve las columnas `DATE` como objeto `Date` de JS en huso
  LOCAL del proceso, no como string.** `pos_vat_deadlines.deadline_date` pasa por
  `normalizeDeadlineRow()` (en `fiscal.js`) inmediatamente después de cada consulta,
  usando los getters **locales** de `Date` (`getFullYear`/`getMonth`/`getDate`, no los
  `UTC*`) para reconstruir el `'YYYY-MM-DD'` — son el mismo huso que usó `pg` para
  construir el objeto, así el round-trip es exacto sin importar en qué huso corra el
  proceso (dev en Windows, Railway en producción). Comparar ese campo con `<` contra
  un string, o interpolarlo en un template literal, rompía en silencio (`daysRemaining`
  daba `null` en vez del número real). Se descartó reconfigurar el parser de `pg`
  globalmente (`pg.types.setTypeParser(1082, …)`) porque afectaría columnas `DATE` sin
  auditar en el resto del backend (`orders.pickup_date`, `invoices.fecha_comprobante`,
  `pos_purchases.invoice_date`) — el fix queda contenido a este módulo. Si se agrega
  una tabla nueva con columnas `DATE` que via el `pool` compartido, aplicar el mismo
  patrón, no asumir que `pg` ya devuelve string.
- **El vencimiento es una aproximación editable, no el calendario oficial de AFIP.**
  `approximateDeadline()` calcula el 3er lunes hábil del mes siguiente al período,
  corrido `cuitEnding` días hábiles — no hay forma de consultar el calendario real
  desde acá. `PUT /deadlines` corrige la fecha a mano y marca "presentado"; el frontend
  avisa cuando una fecha sigue siendo `computed` (sin corregir). Reusa `ARCA_CUIT`, el
  mismo env var de la Fase 5 — sin ese CUIT el panel sigue mostrando los números de IVA,
  solo la tarjeta de vencimiento queda vacía con un aviso, nunca rompe la pantalla.
- **`FiscalPanel.jsx`/`FiscalAnnualHistory.jsx` (rutas `/admin/panel-iva*`) son
  deliberadamente una pantalla distinta de `FiscalStatus.jsx` (`/admin/fiscal`, Fase
  5).** Esa es solo el estado de conexión con AFIP ("¿está caído o no?"); esta es el
  saldo de IVA real del negocio. Se nombraron distinto en el nav ("AFIP" vs "Panel
  IVA") a propósito — no fusionarlas aunque las dos digan "fiscal".
- Sin `charting library` nueva: la barra comparativa débito/crédito del historial
  anual es un `<div>` con `width` proporcional al máximo del año, no un componente de
  gráficos — no justificaba la dependencia para una sola barra por mes.

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
- Cotización de envío Andreani por zona y peso, con seguro e IVA
- POS de mostrador (Fase 1) — login propio, venta con ticket/descuento/pago mixto,
  cache de catálogo en el navegador, sección Ventas y admin de usuarios/config
- Caja del POS (Fase 2) — apertura/cierre, control de efectivo esperado vs contado,
  ingresos/egresos extra, historial de cajas cerradas (solo admin)
- Proveedores del POS (Fase 3) — cuenta corriente con saldo calculado en tiempo real,
  compras con y sin factura (con desglose de IVA), pagos, historial con saldo
  acumulado — todo admin-only, entidad propia sin relación con `products.supplier`
- Importación de precios del POS (Fase 4) — subir Excel/CSV con mapeo de columnas
  manual, vista previa con pestañas (cambios/no encontrados/sin cambio/en USD),
  aumento porcentual por proveedor/categoría/selección manual, historial unificado
  — pipeline propio, en paralelo al de `excelImport.js` que ya usa el admin
- Facturación electrónica del POS (Fase 5) — emisión de factura desde una venta de
  mostrador, PDF con QR, indicador de estado AFIP, reintento si falla — reusa entera
  la integración ARCA/WSFEv1 que ya factura los pedidos online, no una nueva
- Panel fiscal de IVA (Fase 6) — débito/crédito fiscal de todo el negocio (web + POS),
  saldo, vencimiento estimado y editable, historial anual con barra comparativa,
  detalle de ventas/compras facturadas o no, banner de vencimiento próximo/vencido en
  el header — pantalla propia, distinta del estado de conexión AFIP de la Fase 5

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
