# Estado del sistema — Fénix Web

> Bitácora de qué está hecho, qué falta y por qué se tomaron ciertas decisiones.
> El contexto estable (arquitectura, reglas, convenciones) vive en `CLAUDE.md`.
>
> **Cuándo actualizar:** al cerrar una tanda de trabajo, no en cada prompt.
> Si el cambio merece un commit con mensaje propio, merece una entrada acá.
> Un ajuste de padding, no.

**Última actualización:** 1 de septiembre de 2026
**Commit de referencia:** `053fb0f` + merge de `main` remoto (`ac3cb33`) + cambios locales de esta tanda

---

## Estado general

| Área | Estado | Nota |
|---|---|---|
| Catálogo público | ✅ Funcionando | Falta terminar de cargar productos |
| Panel de administración | ✅ Funcionando | 9 secciones (Cuentas es solo lectura; Visitas y Resumen son analítica) |
| Importación de listas de precios | ✅ Funcionando | XLSX + PDF de factura |
| Importación de imágenes de catálogo | ✅ Funcionando | Con revisión y borrador |
| Variantes (color × medida × tono) | ✅ Funcionando | Precio e imagen por combinación; el stock por celda quedó sin uso |
| Carrito y checkout | ✅ Funcionando | Mercado Pago + transferencia manual + datos fiscales A/B/C |
| Transferencia bancaria | ✅ Implementada | Descuento configurable, comprobante privado y validación manual |
| Cotización de envío | 🟡 Provisorio | Tarifario Andreani manual: zona × peso + seguro + IVA **+ recargo fijo $4.000** · plazos de tránsito propios (Shipnow) · falta cargar peso real en productos |
| Envío gratis por monto | ✅ Funcionando | Umbral por env var (`ENVIO_GRATIS_MINIMO`) |
| Envío gratis por localidad | ✅ Funcionando | City Bell, Gonnet y Villa Elisa (CP 1896/1897/1894), sin mínimo ni tope de peso |
| Cupones de descuento | ✅ Funcionando | |
| Cuentas de cliente | ✅ Funcionando | Email · OAuth Google/Facebook oculto hasta configurarlo · sección **Cuentas** (solo lectura) en el panel |
| Pedidos y seguimiento | ✅ Funcionando | Con notificaciones por mail |
| Reseñas | ✅ Funcionando | Propias + Google Places |
| Alertas de stock | ⚪ Fuera de uso | Tabla y endpoints intactos, formulario retirado de la ficha |
| Newsletter | ✅ Funcionando | |
| Disponibilidad y plazos | ✅ Funcionando | Reemplazó al control de stock y a "productos a pedido" — ver detalle abajo |
| SEO | ✅ Funcionando | Helmet + sitemap + robots |
| Facturación electrónica ARCA | 🟡 Implementada, producción bloqueada | A/B para RI y C para Monotributo; falta confirmar habilitación A real de Fenix |
| Analítica de visitas | ✅ Funcionando | Propia, sin servicio externo · pestaña **Visitas** en el panel · sin IP ni cookies |

---

## Envío gratis en City Bell / Gonnet / Villa Elisa + recargo fijo $4.000 (2026-09-01)

**Qué se pidió:** que los envíos a City Bell, Gonnet y Villa Elisa sean gratis
(mostrando "Gratis" al ingresar el CP y anunciándolo en la barra de arriba), y
que a todos los demás códigos postales se les sume $4.000 de envío.

**Cómo quedó:**

- `backend/config/shipping.js` (autoridad) + espejo `src/config/shipping.js`:
  - `FREE_SHIPPING_POSTAL_CODES = [1894, 1896, 1897]` — se chequea **antes** de
    zona y peso, así que un pedido pesado a esas localidades igual va gratis
    (incluye los tramos 20–25 kg y +50 kg que normalmente derivan a WhatsApp).
    El 1897 arrastra a Joaquín Gorina, pegada a Gonnet: se acepta.
  - `SHIPPING_SURCHARGE` (`ENVIO_RECARGO_FIJO`, default 4000) — se suma al costo
    final del envío, **después** del seguro y el IVA (decisión comercial, no es
    impuesto). No aplica a las localidades sin cargo.
  - `FREE_SHIPPING_LOCALITIES` — nombres para mostrar, servidos por
    `GET /api/shipping/config`.
- `backend/routes/orders.js` y `routes/shipping.js`: `freeShipping` ahora es
  `qualifiesForFreeShipping(...) || isFreeShippingPostalCode(...)`.
- `src/components/AnnouncementBar.jsx`: slide nuevo *"ENVÍO GRATIS EN CITY BELL,
  GONNET Y VILLA ELISA"* (mobile: *"…EN CITY BELL Y ZONA"*), con las localidades
  del backend.
- `src/pages/Policy.jsx`: sección "Envío sin cargo en la zona" en la política de
  envíos.
- Tests de `backend/config/shipping.test.js` actualizados (montos + recargo +
  casos de localidad gratis).

**Fuera de alcance:** días de tránsito (`TRANSIT_BANDS`), carrito (no promete
gratis por zona porque no conoce el domicilio), retiro en local, Mercado Pago.

## Retorno de Mercado Pago sin pagar + contacto por WhatsApp (2026-09-01)

**Síntoma:** al tocar *Pagar con Mercado Pago* y volver con el botón *atrás* del
navegador sin pagar, el `MpReturnGuard` mandaba a `/order-confirmation?status=pending`
("Pago en proceso"). Esa pantalla no ofrecía forma de retomar el pago —sólo
*Volver al inicio*— y el pedido quedaba `pending_payment` hasta vencer a los 45 min.
El texto "tu pago está siendo procesado" era falso: no había pago en curso.

**Fix:**

- `src/App.jsx` — `MpReturnGuard`: un retorno abandonado (hay `fenix_pending_order_id`
  y no se pasó por la confirmación) ahora redirige a `/checkout?payment=failure&orderId=X`,
  no a la confirmación. Con `binary_mode` un pago real nunca queda pendiente: si
  hubiera resuelto, MP lo habría traído por su propia `back_url`. Reusa el flujo de
  reintento que ya existía para el rechazo (formulario precargado desde
  `fenix_checkout_payment_draft` o `/api/orders/mine/:id/retry-data`, paso de pago,
  aviso "Pago no efectuado"). El pedido viejo lo vence `expireReservations`.
- `src/pages/OrderConfirmation.jsx` — el bloque "¿Tenés preguntas sobre tu pedido?"
  linkeaba a Instagram hardcodeado; ahora abre WhatsApp con
  `seoCfg.business.whatsapp` y el número de orden en el texto, igual que
  `OrderTracking.jsx`.

**Fuera de alcance:** las `back_urls` del backend, `binary_mode`, el job de
vencimiento y el checkout en sí. El texto de contacto de la rama `isFailed` de
`OrderConfirmation` (que no muestra el bloque) quedó sin tocar.

---

## Fecha de retiro con piso real de preparación (2026-09-01)

**Síntoma:** un pedido de un producto sin stock inmediato (reposición del
proveedor: varios días hábiles) le mostraba al cliente "retiralo mañana". El
selector "Fecha de retiro" del checkout tenía `min` fijo en mañana y no miraba
el plazo del carrito; el backend sólo validaba que la fecha existiera.

**Fix:**

- `src/utils/plazoEntrega.js` — nuevos helpers de días hábiles: `sumarDiasHabiles`,
  `fechaRetiroMinima` (piso = mañana aunque el carrito no tenga plazo),
  `fechaISOLocal` (para el `min` del `<input type="date">`, sin desfasaje UTC),
  `retiroDemasiadoTemprano` y `textoRetiroDisponible` (redacción compartida, no
  frases nuevas por pantalla).
- `src/pages/Checkout.jsx` — el picker de retiro usa `fechaRetiroMinima(handlingDays)`
  como `min`, muestra "Disponible para retirar a partir del…" y `validateStep2`
  rechaza una fecha anterior al piso. `handlingDays` se re-lee del catálogo
  (`useAdmin().products`, ya resuelto contra los settings actuales) y no del
  snapshot del carrito: ese quedaba viejo si el carrito venía de otra sesión o
  si cambió "Plazos de entrega" después de agregar el producto (era la causa de
  que dejara elegir "mañana"). Un carrito abierto en otra pestaña necesita
  recargar para ver el catálogo nuevo; el backend rechaza igual la fecha imposible.
- `backend/routes/orders.js` — `POST /api/orders` revalida la fecha de retiro
  server-side contra el mismo piso (el `min` del navegador se puede saltar),
  usando `itemsSnapshot[].diasEntregaPedido` ya resuelto contra la DB.
- `backend/services/businessDays.js` — nuevo, `isBusinessDay` + `addBusinessDays`
  extraídos de `correoArgentino.js` para que la estimación de envío y la
  validación de retiro cuenten los días igual.

**Fuera de alcance:** el valor de reposición por defecto de la tienda
(`store_settings.dias_entrega_pedido_default`, hoy 8) — es config del panel, no
código. El bloque de checkout multi-paso viejo (`{false && …}` en `Checkout.jsx`)
quedó sin tocar. Días hábiles no contemplan feriados (no hay calendario cargado).

## Analítica de visitas propia — pestaña "Visitas" en el panel (2026-09-01)

El dueño pidió ver cuánta gente entra a la web por día. En vez de sumar Google
Analytics o Plausible (otra cuenta, otro login para el dueño, datos afuera), se
hizo propio y queda dentro del panel.

- **Medición**: `src/utils/analytics.js` + `<TrackPageView />` en `App.jsx` (dentro
  de `Layout`, así `/admin` nunca se registra). En cada cambio de ruta manda un
  beacon `POST /api/analytics/collect` con `keepalive`, fire-and-forget: si falla
  no molesta al visitante ni frena la navegación.
- **Privacidad**: no se guarda la IP. `page_views.visitor_hash` es
  `SHA-256(sal_del_día + IP + user-agent)` y la sal rota cada día → sirve para
  contar visitantes únicos dentro de la jornada sin identificar a nadie ni cruzar
  días. Sal opcional `ANALYTICS_SALT` (si falta usa `ADMIN_SESSION_SECRET`). Sin
  cookies nuevas, no hace falta cartel de cookies.
- **Bots**: `isBotUserAgent` filtra buscadores, monitores y unfurl de links
  (WhatsApp/redes). `is_bot` se guarda y el resumen los excluye.
- **Resumen** (`GET /api/analytics/summary?days=`, admin): serie diaria (con
  huecos en cero), top de páginas, top de orígenes ("Directo" = sin referrer) y
  promedios por día. Agrupa por día calendario de Argentina
  (`AT TIME ZONE 'America/Argentina/Buenos_Aires'`), no de UTC. **No hay "personas
  únicas del período"**: el hash rota a diario, sumar días contaría dos veces a
  quien vuelve. Lo sólido es el promedio de personas/día.
- **Retención**: `backend/jobs/prunePageViews.js` borra las filas de más de
  `RETENTION_DAYS` (180) una vez por día. La tabla es solo-append con PK entera
  (no UUID) para no fragmentar el índice.
- **Migración**: `npm run db:migrate` crea `page_views`. Nada que configurar en
  Railway salvo, opcionalmente, `ANALYTICS_SALT`.
- **Fuera de alcance**: no se tocó checkout, pedidos, precios, envíos, Mercado
  Pago ni el Resumen de ventas (`OverviewDashboard`). Verificación del panel en
  mobile pendiente en dispositivo real.

---

## Mega-menú del header: se abre por click, no por hover (2026-09-01)

- El panel de categorías del header dejaba de abrirse solo al pasar el mouse. Ahora
  se abre únicamente por click: el botón **Categoría** hace toggle y cada atajo
  (Electricidad, Iluminación, Herramientas, Automatización) abre el panel en esa
  categoría (segundo click sobre el mismo atajo lo cierra) en vez de navegar.
- Como los atajos ya no navegan directo, el panel suma un enlace **"Ver todo
  {categoría} →"** arriba de las columnas de subcategorías para entrar a la sección
  completa. Cerrar por click-afuera / `Escape` ya existía.
- Se eliminó todo el andamiaje de hover: `onMouseEnter`/`onMouseLeave` del `<nav>`,
  del botón, de los atajos y del panel, más el timer `categoryCloseTimer` y
  `scheduleCategoryClose`. En el panel abierto se mantiene el hover sobre la columna
  izquierda para previsualizar subcategorías (no abre nada, el panel ya está abierto).
- Sin cambios en el menú mobile (tiene su propio drill-down por tap) ni en el
  buscador ni en el dropdown de cuenta. Frontend compila.
- Pendiente: verificación en dispositivo móvil real.
- **Merge con `main` remoto:** los atajos del header ya no son la lista fija
  `NAV_ITEMS` sino las categorías con `showInHeader` (checkbox del panel,
  `headerCategories()` + `visibleHeaderCategories`). El gesto sigue siendo solo
  click: se descartó el `onMouseEnter` que traía esa rama en cada atajo y en el
  link de Contacto.

## Tarifario de envío Andreani: zona × peso + seguro + IVA (2026-09-01)

Reemplazo del tarifario manual anterior (7 zonas por CP con precio fijo por
servicio) por el esquema de Andreani.

- **Zonas**: de 7 pasa a 3 (`rosa` / `salmon` / `bordo`), definidas por
  provincia y resueltas por CP con `PRICING_ZONE_RANGES` (mapa a nivel provincia,
  best-effort en bordes, gapless 1000–9999). Se elimina la zona "local": todo
  entra como mínimo en rosa.
- **Peso**: nuevo eje. `SHIPPING_WEIGHT_TIERS` (9 tramos) elige la tarifa base
  según el peso total del pedido (suma de `weight_kg` × cantidad, recalculada
  server-side en `POST /api/orders`). **20–25 kg y >50 kg no cotizan** →
  WhatsApp. Sin pesos cargados → tramo 0–1 kg (decisión de negocio para no
  frenar la compra). No se calcula peso volumétrico.
- **Fórmula**: `seguro = valor declarado (subtotal productos c/IVA, pre-cupón) ×
  0.02` → `subtotal = base + seguro` → `total = subtotal × 1.21`. El tarifario
  Andreani viene sin IVA ni seguro; ambos se agregan en `getManualShippingQuote`.
- **Días de tránsito**: se mantienen en su propia tabla fina (`TRANSIT_BANDS`,
  ex `TRANSIT_BUSINESS_DAYS`, 7 bandas de CP) en vez de colapsarse a las 3 zonas
  — colapsarlas ensancharía todas las ventanas de entrega. Los valores en días
  no cambian.
- **Eliminado**: `LARGE_PACKAGE_RATE` / `packageType`, `getShippingForCP` del
  backend (era código muerto), restos de precios `expreso` por zona.
- **Frontend**: los items del carrito llevan `weightKg`; `CartContext` expone
  `totalWeight`; el checkout lo manda a `GET /api/shipping/estimate` (`&weight=`)
  y a la copia local `src/config/shipping.js`. `subtotal` del estimate hace de
  valor declarado.
- Tests: `backend/config/shipping.test.js`.
- **Pendiente**: cargar `weight_kg` real en los productos; integración con la API
  de Andreani.

## Sección Cuentas en el panel (solo lectura) (2026-09-01)

- Nueva sección **Cuentas** en el panel: lista todas las cuentas de cliente
  (registro con email + OAuth Google/Facebook) con buscador por nombre/email/
  teléfono, cuatro contadores arriba (total, verificadas, con pedidos, newsletter)
  y una fila expandible por cuenta con el detalle completo.
- Backend: `GET /api/customers` (`routes/customers.js`), protegido con
  `requireAdmin`. Una query con `LATERAL` agrega por cuenta: pedidos totales y
  pagos, total gastado (pedidos con `paid_at`), última compra, favoritos, reseñas
  y si el email está en `newsletter_subscribers`. `password_hash` **nunca** sale
  del backend (`mapCustomerRow` lo omite; hay test que lo verifica).
- Frontend: `AdminContext` expone `customers` + `fetchCustomers`; `CustomersTab`
  filtra client-side sobre la lista cargada.
- **Solo lectura**: no se puede editar ni borrar cuentas desde el panel. Sin
  export CSV. Sin cambios de esquema (todo el dato ya existía).
- Tests: `backend/routes/customers.test.js` (`mapCustomerRow`, `buildCustomerSearch`).
  Frontend compila.
- Datos de ejemplo: `node db/seedDemoCustomers.js` crea 6 cuentas demo (dominio
  `demo.fenix.test`, pedidos `DEMO-C-*`); `--clean` las borra. No siembra reseñas
  (son públicas).
- Pendiente: verificación en dispositivo móvil real.

## Acceso de clientes reorganizado (2026-08-31)

- La pantalla separa en dos columnas a clientes registrados y nuevos clientes, con contexto sobre cada acción y un acceso destacado al registro.
- El formulario incorporó etiquetas visibles, indicación de campos obligatorios, opción para mostrar la contraseña y recuperación junto al botón principal.
- La creación de cuenta comparte la misma jerarquía visual, divide datos personales y credenciales, y valida la confirmación de la contraseña antes de enviarla.
- El registro admite DNI opcional (7 u 8 dígitos) y una casilla de suscripción al newsletter desmarcada por defecto. El backend persiste el DNI y, con consentimiento, agrega el correo a `newsletter_subscribers` sin duplicarlo y dentro de la misma transacción que crea la cuenta.
- La disposición pasa a una sola columna en pantallas angostas; la comprobación en un dispositivo móvil real queda pendiente.
- La pantalla muestra únicamente el acceso con correo y contraseña.
- Se ocultaron el separador y los botones de Google y Facebook hasta que sus credenciales OAuth estén configuradas. Las rutas del backend permanecen intactas para una futura habilitación.
- Requiere ejecutar la migración idempotente de `backend/db/schema.sql`. Frontend compilado y suite backend aprobada: 180 pruebas, 1 integración PostgreSQL omitida sin `TEST_DATABASE_URL`.

## Variante de portada elegible (2026-08-31)

- Cada producto agrupado permite marcar una única fila como **Portada** desde la tabla de variantes. La elección se persiste en `product_variant_rules.is_cover`, protegida por un índice único parcial por producto.
- La tienda abre tanto la tarjeta como la ficha con la foto y los selectores de esa variante. Al guardar también se sincroniza `products.image_url`, para que buscador, SEO y vistas sin resolución de variantes usen la misma portada.
- Los productos existentes conservan su comportamiento hasta volver a guardarlos; el editor propone como portada la primera variante que tenga foto cuando todavía no existe una elección persistida.
- La etiqueta **Variante base** no se cambió: hoy significa solamente “primera regla recibida”, ordenada por `created_at`. No se ordena por precio. Puede cambiar al borrar, separar, unir o recrear reglas; el precio “desde” sí se calcula aparte como el mínimo, lo que puede hacer parecer que ambos conceptos están relacionados.
- Requiere ejecutar la migración idempotente de `backend/db/schema.sql`. Frontend compilado; suite backend y tests públicos de variantes aprobados.

## Imagen hover general del producto (2026-08-30)

- La imagen hover se configura una sola vez en **Información general compartida**; dejó de presentarse como un dato individual de cada variante.
- En las tarjetas del catálogo reemplaza a la imagen activa al pasar el cursor aunque el producto tenga variantes. Si el cliente elige un color mientras mantiene el cursor dentro, la foto principal de ese color toma prioridad hasta que salga de la tarjeta; al volver a entrar se habilita nuevamente el hover general.
- No se modificaron las imágenes principales por variante ni la galería de la ficha. Frontend compilado y suite backend verificada: 180 pruebas aprobadas, 1 integración PostgreSQL omitida sin `TEST_DATABASE_URL`.
- Pendiente: verificación del gesto y la presentación en un dispositivo móvil real.

## Sección Tienda del panel paginada + filtro por imagen (2026-08-30)

- La sección **Tienda** del panel ya no baja los ~3600 productos publicados de una: `GET /api/catalog` acepta `?page=&pageSize=&search=&category=&conImagen=` y responde `{ items, total, page, pageSize, hasMore, inmediatos, conOferta }`. Sin `page` sigue devolviendo el array completo que usa la tienda pública — sin cambios ahí.
- El panel trae 40 por página con controles Anterior/Siguiente y "mostrando X–Y de Z". Búsqueda (con debounce) y categoría pasan al servidor y vuelven a la página 1.
- Nuevo filtro **Imagen: Todas / Con imagen / Sin imagen** (`image_url` no vacío) para revisar qué falta cargar.
- Las píldoras de arriba (total, entrega inmediata, con oferta) se cuentan en el backend sobre todo lo publicado, no sobre el filtro activo.
- `AdminContext` expone `fetchStoreProducts`; el catálogo público sigue cargándose entero (fuera de alcance esta tanda). Tests de `buildCatalogFilters` agregados. Frontend compila.
- Pendiente: verificación en dispositivo móvil real.

## Categorías principales y administración más clara (2026-08-28)

- El panel permite crear categorías principales además de subcategorías y tipos, reutilizando las personalizaciones persistidas del árbol.
- Las categorías nuevas quedan disponibles de inmediato en el menú público, los filtros y los selectores del administrador.
- La carga se presenta como un flujo explícito de tres niveles y el árbol muestra jerarquía, cantidades, campos editables y acciones con nombre.
- En pantallas chicas, la navegación del administrador pasa a una barra superior y tanto las altas como las subcategorías abiertas usan carruseles horizontales con encastre, evitando columnas excesivamente largas.
- Se agregaron pruebas del armado, renombre y ocultamiento de categorías principales personalizadas. Frontend compilado correctamente.

## Transferencia bancaria con validación manual (2026-08-26)

- El checkout ofrece transferencia solamente cuando CBU, alias y titular están completos y el medio fue habilitado desde **Tienda**.
- El backend calcula primero el descuento sobre productos, luego el cupón y finalmente suma el envío. El pedido congela cuenta, porcentaje, vigencia e importe.
- Los comprobantes JPG, PNG o PDF se validan por firma, admiten hasta 10 MB y se guardan fuera de `/uploads` en `TRANSFER_PROOFS_DIR`.
- Invitados reciben un token aleatorio del que solo se persiste el hash; usuarios registrados acceden desde Mi cuenta.
- La cola de **Pedidos** permite descargar, aprobar o rechazar. Solo la aprobación específica mueve el pedido a `paid`, consume el cupón una vez y habilita notificación y facturación.
- El panel usa una cookie HTTP-only de ocho horas firmada con `ADMIN_SESSION_SECRET`; la contraseña ya no forma parte del bundle React.
- Para desplegar: migrar, configurar ambos secretos/volumen, cargar la cuenta bancaria y hacer una prueba de rechazo, reenvío y aprobación antes de habilitarla.
- Pendiente operativo: integración PostgreSQL cuando exista `TEST_DATABASE_URL` y validación visual final en un dispositivo móvil real.

---

## Detalle por área

### Catálogo e inventario

Una sola tabla `products` para inventario interno y catálogo público. Se publica
completando las columnas de catálogo y poniendo `published = true`.

Ejes de producto disponibles: `color_options`, `size_options`, `tone_options`
(tono de luz), con `variant_stock` (JSONB) para stock por combinación exacta y
precio propio opcional por color y por medida.

Campos físicos ya en el esquema y usados por el cotizador: `length_cm`,
`width_cm`, `height_cm`, `weight_kg`.

**Falta:** poblar peso (y dimensiones) en los productos reales. El cotizador
Andreani va por peso: sin `weight_kg` cargado, todo cotiza en el tramo más
barato (0–1 kg).

**Galería de fotos (2026-08-20):** `products.gallery_images` (JSONB, default
`[]`) guarda fotos adicionales del producto, en orden. Es una galería única por
producto — no varía por color/tono/medida, a diferencia de `image_url` (portada)
y de la imagen individual por variante (`product_variant_rules.image_url`).
Se carga en el admin con selector de archivos múltiple, reordenar y quitar
(`MultiImageField` en `AdminDashboard.jsx`) y se muestra como tira de miniaturas
debajo de la foto principal en `ProductDetail.jsx` (clic en una miniatura cambia
la imagen grande; cambiar de variante vuelve a la miniatura 0).

**Acción masiva "Cambiar categoría" (2026-08-20):** en Productos, permite
reasignar categoría/subcategoría a los productos seleccionados en una sola
transacción (`POST /api/products/batch`, acción `category`), sumada a las
acciones de precio/publicación/"a pedido" que ya existían.

### Disponibilidad y plazos de entrega

**La tienda no lleva stock.** El mismo inventario físico se vende en el mostrador
y online sin POS que los sincronice, así que cualquier número quedaba viejo en
días — y stock equivocado es peor que no tener stock: bloquea ventas posibles o
promete lo que no está. Con reposición de proveedor de ~3 días, lo único que el
cliente necesita saber es el plazo de entrega.

**Todo lo publicado se puede comprar.** La única palanca para sacar algo de venta
es `published = false`.

| Marca | Qué significa | Plazo que ve el cliente |
|---|---|---|
| `stock_inmediato = true` | Está en el local | `store_settings.dias_despacho_inmediato` (default 1) |
| `stock_inmediato = false` | Se pide al proveedor | `products.dias_entrega_pedido` ?? `store_settings.dias_entrega_pedido_default` (default 3) |

- `products.stock_inmediato BOOLEAN NOT NULL DEFAULT FALSE`, con backfill único
  `stock > 0 → TRUE` dentro del mismo `IF` que crea la columna (final de `schema.sql`)
- `store_settings.dias_despacho_inmediato` nuevo; `dias_entrega_pedido_default`
  se reusó como "días de reposición" en vez de crear otra columna con el mismo número
- `routes/catalog.js` resuelve el plazo en SQL y lo expone como `stockInmediato` /
  `diasEntrega`: ningún componente combina bandera + settings + override por su cuenta
- La disponibilidad es **por producto, no por variante**. A 3 días de reposición no
  vale la pena una matriz que nadie va a poder mantener
- `src/utils/plazoEntrega.js` es la única redacción de plazos, compartida por ficha,
  carrito, drawer y checkout, para que no digan cosas distintas del mismo pedido
- La estimación de entrega ya no suma un buffer fijo: `estimateDeliveryDate` recibe
  el mayor plazo de preparación del carrito (máximo, nunca suma — se despacha junto)

**Qué se apagó, sin borrar nada:**

- `stock`, `variant_stock` y `product_variant_rules.stock` quedan en la base, con el
  `stock` plano todavía editable desde el inventario del admin
- `stockReservation.js` quedó fuera de servicio con un encabezado que lo explica.
  Reserva y liberación se apagaron **juntas**: con una sola de las dos, cada pedido
  cancelado descuadra el stock de forma permanente. Si se reactiva, se reactivan juntas
- `jobs/expireReservations.js` sigue venciendo pedidos colgados, ya sin liberar stock
- El formulario de "avisame cuando vuelva" salió de la ficha; la tabla `stock_alerts`
  y sus endpoints quedan intactos

**Dónde se ve un plazo (2026-08-26, ajuste posterior):** en ningún lugar de la
navegación. Ni chip en la tarjeta, ni chip ni línea en la ficha, ni aviso en el
carrito o el drawer. Antes de conocer el domicilio cualquier número es incompleto,
y adelantarlo espanta compras que igual llegaban a tiempo.

Quedan exactamente dos lugares:

1. **Checkout con envío** — dentro de "Entrega estimada: <fecha>", que ya combina
   preparación + correo. No se repite el plazo suelto al lado: serían dos números
   distintos diciendo lo mismo.
2. **Checkout con retiro en local** — una línea con el plazo de preparación, porque
   ahí no hay fecha de envío que lo cubra.

Más el resumen del pedido ya hecho (`OrderItemsBlock`), donde el cliente ya compró
y necesita saber cuándo lo tiene.

`schema.org` sigue pasando a `InStock` / `BackOrder`. La marca `stock_inmediato`
se sigue exponiendo de forma agrupada: página `/entrega-inmediata` (era
`/productos-a-pedido`, huérfana; ahora linkeada desde el footer, con la ruta vieja
redirigiendo) y filtro "solo entrega inmediata" en el catálogo.

**Pendiente:** verificación en mobile en dispositivo real (no confiable con
`resize_window` en este proyecto). Aplicar el schema en producción (`npm run
db:migrate`) — no se corrió desde acá.

### Precios

`services/publicPricing.js` es la autoridad. Todo precio publicado es final con IVA
(`IVA_MULTIPLIER = 1.21`). Soporte de productos en USD con conversión por
`price_exchange_rate` (fallback 1510 ARS/USD).

Fuentes de precio soportadas: `catalog`, `price_list`, `sale`, `purchase`, `manual`.

### Importación de listas de precios

- XLSX genérico (`excelImport.js`)
- Catálogo Cleos (`cleosCatalogImport.js`)
- PDF de factura (`pdfInvoiceImport.js`, con `pdf-parse` + `pdfjs-dist`)
- Imágenes desde catálogo paginado, hasta 800 páginas (`catalogImageImport.js`)
- Imágenes desde carpeta (`folderImageImport.js`)

`supplier_product_mappings` guarda las asociaciones código-proveedor ↔ producto ya
confirmadas, así una relación se revisa una sola vez.

Desde la vista previa se puede corregir a qué apunta cada código, sin salir de la
importación:

- Un código que el proveedor renombró (`ALC40` → `AL-C40`) sale como alta. La
  vista previa propone el producto original y con un clic queda asociado.
- Un código que apunta a un producto agrupado sin decir a qué variante
  corresponde no se aplica: aparece como **Falta elegir variante** hasta que se
  elija una.

Las dos decisiones quedan guardadas en `supplier_product_mappings`
(`product_id` y `variant_rule_id`), así la lista siguiente ya las reconoce.

Las variantes que la lista no toca se avisan **antes** de confirmar, con el
detalle de cuáles y desde cuándo tienen ese precio. Una variante puede declarar
que **sigue el precio de otra** del mismo producto (`price_source_rule_id` +
`price_source_percent`): esas se recalculan solas y no aparecen en el aviso.

`supplier_price_imports` registra cada carga confirmada, con sus archivos y
contadores. El resumen de la última viaja en `GET /api/products/supplier-settings`
y el historial completo en `GET /api/products/supplier-settings/:supplier/imports`.

### Envíos

**Ventana de entrega, no una fecha (2026-08-26).** El checkout dice "Llega entre
el 3 y el 8 de septiembre", no "Entrega estimada: 3 de septiembre". El tránsito
varía según la localidad exacta dentro de cada zona de CP y esa granularidad no
se conoce desde el código postal: un día exacto es precisión inventada, y la
fecha inventada es la que después genera el reclamo.

- `TRANSIT_BANDS` en `backend/config/shipping.js`: `{ min, max }` de días
  hábiles por **banda de CP** (7 bandas finas, distintas de las 3 zonas de
  tarifa), con los valores del tarifario de tránsito de Shipnow (que da capital
  y "otras zonas" por provincia). El `min` es la capital más rápida de la banda,
  el `max` la localidad más lenta. Precio y tránsito son dos ejes separados: el
  precio va por zona Andreani, el tránsito por esta banda más fina.
- Se resuelve **por CP, no por la provincia del formulario**: `provincia` es un
  input de texto libre ("Bs As", "caba", "Buenos aires"); el CP ya está validado
  y es el mismo dato con el que se cotiza el precio.
- Buenos Aires y CABA no están en ese tarifario (se despacha desde City Bell):
  Gran La Plata 1-3, CABA y GBA 2-3, interior de BA 3-5.
- `TRANSIT_OVERRIDES` cubre destinos que romperían el rango de su zona. Hoy sólo
  Tierra del Fuego (CP 9400-9499, 12-14 días): dentro de Patagonia dejaría a toda
  la región mostrando "entre 3 y 14 días", que no le sirve a nadie.
- El plazo de preparación se suma a **los dos extremos** — ocurre antes del envío
  en cualquier escenario.
- `orders.estimated_delivery_max_date` guarda el extremo superior;
  `estimated_delivery_date` pasó a ser el inferior. Los pedidos anteriores tienen
  NULL en la nueva y se siguen mostrando con su fecha única, en la web, el mail y
  el admin.

**`expreso` está fuera de circulación (2026-08-26).** Sin una API de envíos real
no había con qué justificar que llegara antes: mostraba la misma ventana de
entrega que el clásico, por más plata. `SHIPPING_SERVICES` quedó en `['clasico']`
y con eso deja de cotizarse, validarse y ofrecerse.

- El tarifario Andreani (2026-09-01) es zona × peso, sin precio por servicio:
  reactivar `expreso` implicaría un tarifario separado, no una columna más.
- Con un solo servicio el checkout **no muestra selector** — elegir entre una
  opción no es elegir. El costo se sigue mostrando como fila informativa. El
  selector vuelve solo cuando la lista tenga más de un elemento.
- `normalizeShippingService()` cubre el reintento de pedidos viejos: un pedido
  guardado como `expreso` llenaría el formulario con un servicio que el backend
  después rechaza. Cae al vigente.
- Los pedidos históricos conservan `shipping_service = 'expreso'` y se muestran
  tal cual en el mail, el admin y el detalle del pedido.


**Estado actual: tarifario Andreani manual = zona × peso** (`backend/config/shipping.js`,
espejo en `src/config/shipping.js` — todo cambio va en los dos).

**Zonas** (`PRICING_ZONE_RANGES`, resueltas por CP a nivel provincia, cubren
1000–9999 sin huecos; best-effort en bordes provinciales). No hay zona "local":
todo entra como mínimo en rosa.

| Zona | Provincias |
|---|---|
| rosa | Buenos Aires, CABA, Córdoba, Santa Fe, Entre Ríos, Santiago del Estero, San Luis, La Pampa |
| salmón | Formosa, Chaco, Corrientes, Misiones, Tucumán, Catamarca, La Rioja, San Juan, Mendoza, Neuquén, Río Negro |
| bordó | Jujuy, Salta, Chubut, Santa Cruz, Tierra del Fuego |

**Tramos de peso** (`SHIPPING_WEIGHT_TIERS`, tarifa base sin IVA ni seguro): 0–1,
1–2, 2–3, 3–5, 5–10, 10–15, 15–20, 25–35, 35–50 kg. **20–25 kg y >50 kg no
cotizan** (Andreani no informó): se deriva a WhatsApp. Sin `weight_kg` cargado se
usa el tramo más barato (0–1 kg).

**Fórmula:** `seguro = valor declarado × 0.02` (valor declarado = subtotal de
productos con IVA, pre-cupón) → `subtotal = base + seguro` → `total = subtotal × 1.21`.

**Envío gratis:** `FREE_SHIPPING_THRESHOLD`, default 100.000, configurable con
`ENVIO_GRATIS_MINIMO`. Aplica a todo el país. El frontend no tiene el valor
hardcodeado, lo recibe de `GET /api/shipping/config`.

**Pendiente:**
- Cargar peso (y dimensiones) reales en los productos — hoy todo cotiza en el
  tramo 0–1 kg mientras `weight_kg` esté vacío.
- Integración real con la API de Andreani. El adaptador está previsto en
  `services/shippingQuotes.js`; debe respetar el contrato de
  `getManualShippingQuote` (CP + peso + valor declarado → costo final).

### Pagos

Mercado Pago Checkout Pro (`services/mercadopago.js`, `mercadopagoPayments.js`).
Webhook en `/api/webhooks` con validación de firma (`MP_WEBHOOK_SECRET`), recibiendo
el body raw antes del `express.json()`.

**Rechazos de pago (2026-08-24):** Mercado Pago devuelve a la etapa de pago del checkout,
que restaura formulario, receptor fiscal, direcciones, cupón y carrito, verifica el pago contra la API privada y
libera el stock mediante la conciliación existente. Si el retorno no trae
`payment_id`, se resuelve el pago desde `merchant_order_id`; las preferencias
nuevas usan modo binario para que el intento sea aprobado o rechazado, no pendiente.
Los estados técnicos
`pending_payment`, `payment_failed` y `expired` no se muestran como pedidos en Mi
cuenta. El intento permanece en la base para auditoría/webhooks, pero no avanza como
pedido comercial. Los cupones nuevos se contabilizan una sola vez al aprobarse el
pago; la migración marca los pedidos históricos para no contarlos nuevamente.

**Cuotas — fuente de verdad (2026-08-18):** `backend/config/payments.js` define
`CUOTAS = [{cantidad:3, minimo:0}, {cantidad:6, minimo:500000}]` y
`getApplicableInstallments(subtotal)`, servido en `GET /api/payments/config`.
Lo consume hoy la `AnnouncementBar` (ver más abajo).

**Pendiente / a revisar:**
1. `ProductCard.jsx:30` **sigue** con `const INSTALLMENTS = 6` hardcodeado y
   dividiendo el precio por 6 sin mirar el mínimo — muestra "Hasta 6 cuotas sin
   interés de $X" en productos de cualquier monto (ej. $974 → "de $162"). Es el
   mismo bug que motivó crear `payments.js`, pero **la migración de las tarjetas
   queda pendiente como tarea aparte** (no se tocó en este lote a pedido explícito).
2. `ProductDetail.jsx` **no muestra ningún mensaje de cuotas**, siendo la página de
   mayor conversión.
3. Verificar que los tramos de `payments.js` estén efectivamente activados en el
   panel de comerciante de MP y que coincidan con lo que promete la UI.

### Facturación electrónica ARCA

Integración WSAA + WSFEv1 con estrategia según emisor y receptor: un Responsable
Inscripto emite A/ALEY o B; Monotributo y Exento conservan Factura C. Las consultas
productivas están permitidas, pero `FECAESolicitar` continúa bloqueado mientras
`ARCA_PRODUCTION_ENABLED=false`.

**Implementado:**

- Configuración central en `backend/config/arca.js`: endpoints, CUIT, punto de venta,
  certificado, clave, datos del emisor y concepto. Para Responsable Inscripto,
  `ARCA_A_AUTHORIZATION_MODE` es obligatorio y no asume `standard`
- WSAA con TRA firmado mediante OpenSSL, caché en memoria para el servidor y caché
  local persistente para reutilizar el TA entre scripts Node. Incluye renovación
  anticipada y lock entre procesos; los secretos y el CMS se redactan en errores y logs
- Cliente WSFEv1 con `FEDummy`, puntos de venta, catálogos paramétricos, último
  autorizado, consulta de comprobante y solicitud de CAE
- Agente TLS exclusivo para WSFE producción: admite el DHE 1024 del servidor legacy
  manteniendo TLS 1.2, AES-GCM y validación de certificado, sin bajar OpenSSL global
- Caché PostgreSQL de parámetros ARCA, separada por ambiente y CUIT, con fallback a
  la última respuesta válida
- Datos fiscales del receptor capturados durante checkout. Pedidos históricos deben
  confirmarlos antes de emitir; el DNI dejó de bloquear el carrito
- Factura A consulta el CUIT mediante `ws_sr_constancia_inscripcion/getPersona_v2`:
  completa razón social y condición fiscal, y el backend repite la validación antes
  de guardar el pedido. La carga manual aparece sólo ante una indisponibilidad técnica
  del padrón; un CUIT inexistente, inactivo o no habilitado para A se rechaza
- Pedidos invitados reclamables únicamente por una cuenta verificada con el mismo email
- Tabla `invoices`, snapshots inmutables y estados `pending`, `processing`,
  `uncertain`, `authorized`, `rejected` y `error`
- Locks consultivos por pedido y por `(CUIT, punto de venta, tipo)`. El número se toma
  de `FECompUltimoAutorizado` y se persiste antes de llamar a `FECAESolicitar`
- Validación estricta con `FEParamGetPtosVenta`; únicamente en homologación, su error
  `602` habilita un fallback a `FECompUltimoAutorizado` para la combinación configurada
- Recuperación de timeouts con `FECompConsultar`: solamente el código `602` se toma
  como comprobante inexistente; el request fallido nunca reenvía automáticamente
- Endpoints privados para confirmar receptor, emitir, consultar estado y descargar PDF
- Intento inmediato del comprobante fiscal determinado dentro de la conciliación segura de un pago
  `approved` de Mercado Pago, con límite de espera de 20 segundos. Cualquier falla
  ARCA se aísla del pago, pedido, stock, envío y respuesta `200` del webhook
- Servicio único `attemptInvoiceForOrder()` para webhook, cliente, admin y script;
  conserva los locks, idempotencia y recuperación con `FECompConsultar`
- `invoice_jobs` retenida sólo como auditoría del último intento, cantidad, origen y
  error sanitizado. No existe cola, worker, cron, scheduler ni polling de facturas
- Pedidos pagos sin datos fiscales quedan visibles como `needs_data` y no llaman a
  ARCA; cliente o admin pueden intentar manualmente después de confirmar los datos
- Panel admin con estado fiscal, alerta de más de 24 horas, contadores/filtros,
  “Facturar ahora” para pagos MP aprobados y acceso privado al PDF autorizado
- Feature flag independiente `ARCA_AUTO_INVOICE_ENABLED`; en producción exige además
  `ARCA_PRODUCTION_ENABLED=true`
- PDF A/B/C en memoria con neto, IVA, total, condiciones fiscales y QR oficial ARCA,
  sin archivos públicos ni nueva solicitud de CAE
- Scripts manuales para WSAA/FEDummy, puntos de venta, parámetros, último autorizado
  y primera factura. Los scripts de consulta muestran que no emiten; el de CAE exige
  confirmación distinta por ambiente y, en producción, también el flag de emisión
- Los precios finales persistidos son la fuente fiscal. La regla global histórica
  del 21 % quedó centralizada; A/B guardan neto, IVA y desglose, y validan el ID de
  alícuota mediante `FEParamGetTiposIva`
- Documentación operativa en `backend/docs/ARCA.md`

**Verificado:**

- WSAA de homologación autenticó correctamente
- `FEDummy`: `AppServer`, `DbServer` y `AuthServer` respondieron `OK`
- 101 pruebas de backend pasan; la prueba descartable de constraints y concurrencia
  queda omitida claramente cuando no existe `TEST_DATABASE_URL`
- Los cuatro scripts ARCA ejecutados en procesos consecutivos reutilizan el TA y no
  reciben `coe.alreadyAuthenticated`. `FEParamGetPtosVenta` responde actualmente
  código `602`; en homologación la combinación punto 2 / Factura C se valida con
  `FECompUltimoAutorizado`, que antes de la primera emisión respondió `0`
- Build de producción del frontend correcto
- Certificado y private key continúan ignorados por Git y no están trackeados
- Factura C de homologación 00002-00000001 autorizada con CAE; repetir el pedido
  devolvió la misma factura sin solicitar otro comprobante
- Producción segura: WSAA autenticó, `FEDummy` respondió `OK/OK/OK`, parámetros
  respondieron, los puntos 1 y 3 figuran CAE/RI no bloqueados y el último autorizado
  del punto 3 es `0` tanto para Factura A (1) como B (6)

**Pendiente antes de producción:** aplicar la columna `invoices.iva_breakdown`, confirmar
en ARCA el modo A real de Fenix, completar razón social/IIBB y comprobar que el catálogo real no contiene otras
alícuotas, ejecutar solo las consultas productivas seguras y validar el punto de venta
3. Después, autorizar manualmente una única factura real con la automatización apagada.

### Cuentas, pedidos y comunicación

- Registro con email + verificación, recuperación de contraseña, OAuth Google/Facebook
- Favoritos, historial de pedidos, seguimiento por número de pedido
- Mails transaccionales vía Gmail SMTP: confirmación de pedido, verificación de cuenta,
  invitación a dejar reseña, aviso al admin de pedido nuevo
- Alertas de stock: fuera de uso desde el cambio de modelo de disponibilidad — si todo
  lo publicado es comprable, no hay "vuelta" que avisar. Tabla y endpoints intactos
- Reseñas propias moderables + reseñas reales de Google Places (límite de 5 de la API)

### Expiración de pedidos

`jobs/expireReservations.js` marca como `expired` los pedidos de retiro sin pagar
y los de Mercado Pago abandonados. Ya no libera stock — ver *Disponibilidad y
plazos de entrega*.

### Barra de anuncios (announcement bar)

`src/components/AnnouncementBar.jsx`, montada como primer hijo del `Layout`
público (`src/App.jsx`), arriba del navbar y **no sticky**: scrollea y
desaparece. No aparece en `/admin`. Los cuatro mensajes avanzan juntos en una
cinta horizontal continua y sin cortes. El único control visible permite pausar
o reanudar el movimiento; `prefers-reduced-motion` sigue respetado.

Sin valores hardcodeados: el umbral de envío gratis sale de
`shippingConfig.freeShippingThreshold` (`useCart()`, ya alimentado por
`GET /api/shipping/config`) y las cuotas de `GET /api/payments/config`
(`backend/config/payments.js`, nuevo — ver "Pagos" arriba).

Links: envío → `/policies/shipping` (página real). Cuotas → `/faq#medios-de-pago`
(anchor nuevo agregado a esa pregunta puntual del FAQ). Retiro en local →
`/#contacto`, la sección ya existente en el home.

**Deuda técnica introducida a propósito, documentada y no resuelta acá:**

1. **Navbar sigue `fixed`, no `sticky`.** Para que la announcement bar (no
   sticky) empuje visualmente al navbar sin convertirlo a `sticky` — eso
   rompería el offset de todas las páginas, el mega-menú de categorías y el
   arranque del hero, y es su propio refactor — el navbar quedó `fixed` con
   `top: ANNOUNCEMENT_BAR_HEIGHT` (36px) y un `transform: translateY()`
   animado por scroll (rAF, sin tocar `top` por frame) que lo desliza hasta
   quedar pegado a 0. Constantes compartidas en `src/config/layout.js`
   (`NAVBAR_HEIGHT`, `ANNOUNCEMENT_BAR_HEIGHT`, `PAGE_CONTENT_OFFSET`).
   Migrar el navbar a `sticky` de verdad sigue pendiente como tarea propia.
2. `FAQ.jsx` ganó un `id` (`medios-de-pago`) en la pregunta de medios de pago
   para el link de la barra, pero el acordeón sigue cerrado por defecto: quien
   entra desde ese link ve la pregunta cerrada, no la respuesta expandida.
   Auto-abrir ese ítem al llegar por anchor quedó fuera de este lote.

---

## Pendientes priorizados

1. **Confirmar la habilitación A real de Fenix** y configurar
   `ARCA_A_AUTHORIZATION_MODE` sin asumir `standard`
2. Completar razón social/IIBB y confirmar la única alícuota del catálogo; el
   PERÍODO DESDE ya quedó fijado en `2024-01`
3. Aplicar la migración de `invoices.iva_breakdown`
4. Ejecutar las pruebas PostgreSQL descartables de facturación con `TEST_DATABASE_URL`
5. **Cargar peso (y dimensiones)** en los productos reales — sin `weight_kg` el
   cotizador Andreani cotiza todo en el tramo 0–1 kg
6. **Cuotas**: migrar `ProductCard.jsx` y agregar el mensaje en `ProductDetail` para
   que consuman `GET /api/payments/config` en lugar del `INSTALLMENTS = 6` hardcodeado
7. **Verificar cuotas sin interés** activas en el panel de MP
8. **Navbar `fixed` → `sticky`**: refactor propio (offsets de todas las páginas,
   mega-menú, arranque del hero) postergado al agregar la `AnnouncementBar`, que
   por ahora simula el efecto con `transform` por scroll — ver detalle arriba
9. **Terminar de poblar el catálogo** con productos e imágenes
10. Credenciales / API de Andreani y activación del adaptador real en `shippingQuotes.js`
11. Refactor de `AdminDashboard.jsx` (8.100+ líneas en un solo archivo)
12. Definir exclusiones de envío gratis, si las hubiera
13. Habilitar cantidad > 1 en el selector de `ProductDetail` para items a pedido

---

## Bitácora

### 2026-09-01 · Login del panel roto cuando Vite cambia de puerto

En desarrollo, si el 5173 quedaba ocupado por una corrida vieja, Vite arrancaba en
5174 y el login del panel devolvía "Contraseña incorrecta" — que en realidad era un
**403 de CORS**: el backend sólo aceptaba como origen `localhost:5173` y `:4173`, y
el formulario ([AdminLogin.jsx](../src/pages/admin/AdminLogin.jsx)) muestra el mismo
mensaje ante cualquier respuesta que no sea 2xx.

`isDevLocalhostOrigin()` en `backend/config/cors.js` ahora acepta cualquier puerto de
`localhost` / `127.0.0.1` / `[::1]` mientras `NODE_ENV !== 'production'`. Se aplica en
los dos lugares que filtran origen: el delegate de CORS y `trustedMutationOrigin` de
`middleware/requireAdmin.js` (que si no, bloquearía cada guardado del panel desde el
puerto "equivocado"). En producción no cambia nada: el origen sigue teniendo que
estar en la lista explícita.

### 2026-08-26 · Variantes que el proveedor no lista: precio derivado y aviso

Un producto agrupado puede tener variantes que el negocio agrega a mano y que
ninguna lista de precios va a actualizar nunca. La importación las ignoraba en
silencio: no salían como omitidas ni como error, simplemente no se evaluaban,
porque la vista previa recorre las filas del Excel y no las variantes del
producto.

El daño no es sólo que quedaran viejas. Con una brida de 5 a 9 pulgadas donde el
proveedor lista hasta la de 8, un aumento del 20% deja la de 9 más barata que la
de 7. Dos aumentos, más barata que la de 6. La tarjeta no se rompe (sigue siendo
el mínimo), pero la escalera de precios entre medidas se invierte.

Dos cosas, que se complementan:

**Precio derivado.** Una variante sin código de proveedor puede seguir el precio
de otra del mismo producto, con un porcentaje encima (0 = el mismo precio, se
admiten negativos). Se guarda en `price_source_rule_id` y `price_source_percent`.
`applyDerivedVariantPrices()` recalcula todas las derivadas del producto de una
pasada, y corre tanto al importar una lista como al editar precios a mano.

Se prohíben las cadenas: el origen tiene que tener precio propio. Eso descarta
los ciclos sin necesidad de detectarlos y deja el recálculo en una sola pasada.
Tampoco puede seguir a otra una variante que sí tiene código de proveedor: la
derivación pisaría el precio real de la lista en cada carga.

**Aviso en la vista previa.** Antes de confirmar se listan las variantes que la
importación no va a tocar, separando las hechas a mano de las que tienen código
pero no vinieron en ese archivo, con su precio actual y desde cuándo lo tienen.
Las derivadas quedan fuera del aviso: se actualizan solas.

### 2026-08-26 · Historial de cargas de lista por proveedor

No había forma de saber cuándo se había subido la lista de un proveedor.
`products.price_updated_at` parecía la respuesta pero no lo es: solo se mueve en
los productos cuyo precio efectivamente cambió, así que una lista que el
proveedor mandó sin aumentos no dejaba rastro. Justo el caso en que la pregunta
"¿esto ya lo subí?" no se puede contestar de memoria.

`supplier_price_imports` guarda una fila por carga confirmada — proveedor,
archivos, filas leídas, creados, actualizados, sin cambios, omitidos, los que
quedaron esperando variante y la cotización usada.

Se escribe **dentro de la misma transacción** que aplica los precios: una carga
aplicada pero no registrada sería peor que no tener historial, porque el
historial afirmaría que nunca se subió. Railway corre `db:migrate` como
`preDeployCommand`, así que la tabla existe antes de que arranque el código.

En el panel aparece en dos lugares: la tarjeta "Precios proveedor" muestra la
última carga del proveedor elegido antes de subir nada, y la barra de proveedor
de la tabla de productos abre el historial completo.

### 2026-08-26 · La vista previa de precios corrige a qué producto va cada código

Dos formas silenciosas de romper el catálogo al subir una lista de precios, las
dos detectables recién cuando ya habían pasado.

**Código renombrado.** `priceCodeKey` solo normaliza espacios, así que `ALC40` y
`AL-C40` eran artículos distintos. Confirmar la vista previa creaba un borrador
sin foto y dejaba el original publicado con el precio viejo. Ahora las altas
traen candidatos del mismo proveedor: primero la coincidencia por código
normalizado sin puntuación (que es lo que cambia en casi todo renombre real) y
después un ranking por similitud. Si dos productos colapsan al mismo código
normalizado la pista es ambigua y no se marca ninguno como seguro.

**Producto agrupado sin variante asignada.** El checkout resuelve el precio por
regla de variante (`orders.js`) y la tarjeta publica `products.precio_*`, que
`recomputeGroupedProduct` mantiene como el mínimo de las variantes. Escribir ahí
un precio suelto rompía ese invariante: la tarjeta mostraba un importe que el
checkout no cobraba. Esas filas ya no se aplican — quedan en **Falta elegir
variante** hasta que se indique a cuál corresponde el código.

Se descartó la idea de reportar como error que dos variantes tengan precios
distintos: la misma lámpara de 15 W y de 20 W vale distinto, y eso es correcto.

Endpoints nuevos: `PUT`/`DELETE
/api/products/supplier-settings/:supplier/mappings/:codigo`.

### 2026-08-26 · Se retira el envío expreso

Con el tarifario manual, expreso y clásico mostraban la misma ventana de entrega:
el cliente pagaba más por la misma fecha. Se retira hasta tener una API de envíos
que confirme un tránsito distinto.

Se apagó desde `SHIPPING_SERVICES` en vez de borrar la columna de precios, así
volver a prenderlo es una línea. Lo que sí hubo que agregar es
`normalizeShippingService()`: un pedido viejo guardado como `expreso` reconstruía
el checkout con ese valor y el POST siguiente lo rechazaba.

### 2026-08-26 · Entrega como ventana, con tránsito real por zona

El checkout prometía un día exacto calculado con un tránsito fijo de 5 días para
todo el país. Ahora muestra "Llega entre el X y el Y", con los días hábiles de
tránsito del tarifario de Shipnow por zona de CP (ver *Envíos*).

Dos decisiones que valen la pena recordar: el plazo se resuelve por CP y no por
el campo `provincia` (que es texto libre y no se puede parsear con confianza), y
Tierra del Fuego quedó como excepción explícita porque sus 12-14 días arrastraban
el rango de toda la Patagonia.

**Pendiente relacionado:** medir el tiempo real de despacho (pago → estado
`shipped`) para saber si el plazo de preparación configurado a mano se parece a
la realidad. Hoy es un número que el dueño estima, sin nada que lo contraste.

### 2026-08-26 · La tienda deja de llevar stock

Decisión del dueño: el inventario físico se vende en el mostrador y online sin POS
que los sincronice, y el proveedor repone en ~3 días. Llevar stock por SKU (y peor,
por color × medida × tono) era imposible de mantener, y un número viejo bloquea
ventas o promete lo que no está.

Se invirtió el eje: `a_pedido` era una excepción sobre el stock; ahora
`stock_inmediato` es la marca primaria y el stock desapareció de la venta. Todo lo
publicado es comprable; lo único que cambia entre un producto y otro es el plazo.

Se apagaron **juntas** la reserva y la liberación de stock — con una sola de las
dos, cada pedido cancelado descuadra el stock para siempre. `stockReservation.js`,
las columnas de stock y `stock_alerts` quedan en su lugar, sin uso y documentados.

De regalo: `/productos-a-pedido` (huérfana, nunca linkeada) pasó a ser
`/entrega-inmediata`, y el filtro "solo disponibles" del catálogo pasó a "solo
entrega inmediata" — mismo mecanismo, sentido comercial opuesto. También salió del
código el `STOCK_BUFFER_BUSINESS_DAYS = 3` hardcodeado que se sumaba a *toda*
estimación de entrega.

### 2026-08-24 · Consulta de CUIT para Factura A

El checkbox `Necesito factura A` ya no obliga al comprador a conocer su condición IVA.
Al completar un CUIT válido, el checkout consulta el padrón oficial de ARCA, muestra
razón social y condición como datos verificados y el servidor repite esa consulta al
crear el pedido para no confiar en valores del navegador. Los tickets WSAA se separan
por servicio y el endpoint público tiene límite por IP, caché breve y respuesta sin
caché HTTP. Ante caída técnica se habilita la carga manual; los rechazos fiscales no
tienen fallback. WSDL oficial y firma de la operación verificados; la prueba completa
local quedó pendiente porque WSAA homologación rechazó el certificado configurado como
no emitido por una AC de confianza. Debe corregirse el certificado del ambiente y
autorizar `ws_sr_constancia_inscripcion` antes de considerar operativa la consulta real.
Build de producción y suite backend: 129 tests pasan, 1 PostgreSQL omitido.

### 2026-08-24 · Checkout fiscal simplificado y retiro por otra persona

El checkout separa visualmente contacto, entrega, destinatario y facturación. Para
consumidor final solicita solamente DNI o CUIT y resuelve internamente documento y
condición fiscal. El checkbox `Necesito factura A` muestra CUIT y resuelve razón social
y condición IVA compatible mediante el padrón. La dirección de facturación usa un único checkbox para reutilizar la
dirección de entrega.

En retiros se incorporó `Otra persona retirará el pedido`, con nombre y apellido
condicionales. La persona autorizada queda persistida, vuelve con el borrador tras
un pago rechazado y se muestra en el detalle administrativo, Mi cuenta y los correos
de confirmación. Las columnas nuevas son nullable para conservar pedidos históricos.
Verificado con 121 tests de backend aprobados (uno PostgreSQL omitido por falta de
`TEST_DATABASE_URL`), 3 tests focalizados del mapeo fiscal y build productivo de
Vite exitoso. Mobile real queda pendiente de verificación en dispositivo físico.

### 2026-08-24 · Pago rechazado permanece en checkout

El retorno `failure` de Checkout Pro ahora apunta a `/checkout`. El formulario
completo se autoguarda en `sessionStorage` con cada cambio, incluidos receptor fiscal
y dirección de facturación; al volver se conserva también el carrito y una
notificación flotante, con el mismo lenguaje visual del aviso de producto agregado,
informa el rechazo desde la parte superior. El navegador
reconcilia el `payment_id` o, cuando Mercado Pago lo devuelve nulo, el pago asociado
al `merchant_order_id` con el backend para no
confiar en la URL y para liberar inmediatamente el stock; el webhook sigue siendo el
respaldo. Para intentos anteriores sin borrador, una cuenta autenticada recupera el
formulario desde un endpoint privado que valida la pertenencia del pedido; DNI y
domicilios no se agregaron al endpoint público. Preferencias anteriores que todavía
vuelvan a `order-confirmation` se redirigen al mismo flujo, y el puente de desarrollo
admite también `/checkout`.

Mi cuenta lista y permite abrir únicamente pedidos confirmados. Los intentos fallidos
siguen disponibles internamente para conciliación y auditoría, sin aparecer como
“no pagados”. Además, el uso de cupón dejó de incrementarse al crear el intento y se
registra idempotentemente al aprobar el pago (`coupon_usage_counted_at`). Verificado
con 115 tests de backend aprobados (uno PostgreSQL omitido por falta de
`TEST_DATABASE_URL`) y build productivo de Vite exitoso. La ampliación para
`merchant_order_id` quedó verificada con 120 tests aprobados (uno PostgreSQL omitido)
y build productivo de Vite exitoso. Mobile real queda pendiente
de verificación en dispositivo físico.

### 2026-08-19 · Fix: "Failed to fetch" al importar carpetas grandes de imágenes

`Imágenes por carpeta` (admin → Productos) tiraba "Failed to fetch" en Railway
al subir una carpeta con 300+ fotos. Causa: `uploadFolderImages` (multer) usaba
`memoryStorage`, así que bufferizaba las imágenes enteras de toda la carpeta en
RAM antes de que el handler corriera — con 300+ fotos de celular eso son
cientos de MB a >1GB en simultáneo, suficiente para tirar el proceso a mitad
de la subida (el navegador ve la conexión cortada, no un error HTTP prolijo).
Además, mandar esa cantidad de datos en un único POST corre riesgo de superar
timeouts (Node o el proxy de Railway).

Fix con dos partes:
- `uploadFolderImages` pasó a `diskStorage`: cada archivo se escribe a disco a
  medida que llega en vez de acumularse en RAM. La ruta ahora resuelve
  `importId`/`previewDir` en un middleware previo al multer (necesario porque
  el `destination` de multer corre antes de que exista `req.body`), y ese
  `importId` viaja por query string (`?importId=...`).
- El frontend (`handleFolderImagesUpload` en `AdminDashboard.jsx`) ahora sube
  la carpeta de a tandas de 25 fotos, reutilizando el mismo `importId` para
  que todas terminen en la misma revisión — evita tanto el pico de RAM como
  el request larguísimo de un solo POST. Se agregó feedback de progreso
  ("Leyendo 75/300...") en el botón.

Archivos: `backend/routes/products.js`, `backend/services/folderImageImport.js`,
`src/context/AdminContext.jsx`, `src/pages/admin/AdminDashboard.jsx`. No se tocó
`catalog-images` (import de catálogo con imágenes, un solo archivo por vez) ni
ningún otro importador.

**Update mismo día:** probado en producción con carpetas reales, el error
seguía apareciendo (primero cerca de la foto 70, después de la 80 con lotes
más chicos + reintentos). El diagnóstico de RAM/timeout de arriba era
parcialmente cierto pero no era la causa de este caso puntual — los logs de
Railway mostraron el motivo real: `MulterError: File too large`
(`LIMIT_FILE_SIZE`, límite configurado en 8MB). Fotos de celular actuales
pesan más de 8MB; cuando multer detecta una foto que supera el límite corta
el parseo **a mitad de la subida** (con el navegador todavía mandando datos),
lo que el navegador reporta como "Failed to fetch" en vez de un error
prolijo — por eso achicar el tamaño de lote no cambiaba nada, el corte pasa
apenas llega la foto pesada.

Fix real: `IMAGE_UPLOAD_MAX_BYTES` subió de 8MB a 20MB en
`backend/routes/products.js` (aplica a `uploadCleosImage` y
`uploadFolderImages`), y el frontend ahora filtra fotos por tamaño *antes* de
subir nada (`FOLDER_IMAGES_MAX_FILE_BYTES` en `AdminDashboard.jsx`) — las que
superan el límite se omiten con un aviso en vez de cortar la conexión. El
batching de a 10 + reintentos automáticos del intento anterior se mantienen
como resiliencia extra ante cortes de red genuinos, pero no eran el fix.

Confirmado por el usuario que el diagnóstico (logs de Railway) apuntaba
exactamente a esto — pendiente de que reintente la carga completa para
confirmar que ya no corta.

### 2026-08-18 · ARCA para Responsable Inscripto, con producción bloqueada

Se eliminó el default de Factura C y se incorporó la selección A/ALEY/B para un
emisor Responsable Inscripto, conservando C para Monotributo/Exento. El modo de
habilitación A es obligatorio y no tiene fallback; las condiciones, documentos y
alícuota se validan contra parámetros WSFE. Los importes finales persistidos se
descomponen en neto e IVA con aritmética de centavos, snapshot y PDF fiscal dinámico.
Las consultas productivas quedaron separadas de la emisión: WSAA, FEDummy, parámetros,
puntos de venta y último autorizado pueden probarse con el flag apagado, mientras
`FECAESolicitar` se bloquea centralmente. Sistema Registral confirmó el PERÍODO DESDE
`01/2024`; se guarda `2024-01`, se muestra mes/año y no se exige ni inventa un día.
El WSDL productivo quedó diagnosticado: Node 24/OpenSSL 3.5 rechaza su DHE 1024 por
defecto y conecta con un agente `SECLEVEL=1` limitado a WSFE, certificado validado.
Se ejecutaron únicamente el diagnóstico TLS, WSAA/FEDummy, parámetros, puntos de
venta y último autorizado. No se invocó `FECAESolicitar` ni se emitió un comprobante
productivo. Quedan pendientes datos fiscales del emisor y confirmar el catálogo.

### 2026-08-18 · Barra de anuncios rotativa + fuente única de cuotas

Nueva `AnnouncementBar` arriba del navbar en todo el sitio público (no admin,
no sticky). De paso se creó `backend/config/payments.js` +
`GET /api/payments/config` como fuente única de los tramos de cuotas sin
interés, porque no existía ninguna (el único dato real era el
`INSTALLMENTS = 6` hardcodeado y sin mínimo de `ProductCard.jsx`, que sigue
sin migrar — bug de ese componente documentado arriba, no corregido en este
lote). También se agregó un `id="medios-de-pago"` puntual en `FAQ.jsx` para
que la barra pueda linkear ahí. El navbar quedó deliberadamente `fixed`
(no `sticky`) con un offset simulado por `transform` — ver "Barra de
anuncios" arriba para el detalle y la deuda técnica registrada.

Archivos: `src/components/AnnouncementBar.jsx`, `src/config/layout.js`,
`backend/config/payments.js`, `backend/routes/payments.js`, y cambios en
`backend/index.js`, `src/App.jsx`, `src/components/Navbar.jsx`,
`src/pages/FAQ.jsx`, `src/index.css`.

Verificado en Chromium headless (1440px y 360px): bar y navbar con el offset
correcto en reposo y tras scroll, mega-menú de categorías sin gap/overlap en
ambos estados de scroll, y los tres mensajes mobile entran en una sola línea
a 360px (275px el más largo, con ~300px disponibles). **Mobile real
(dispositivo físico) queda sin verificar acá**, como corresponde.

### 2026-08-15 · Facturación inmediata sin worker

Se retiró el worker permanente y todo polling/temporización de facturas. Después de
persistir un pago Mercado Pago verificado como `approved`, el webhook intenta emitir
inmediatamente mediante el mismo servicio usado por cliente, administrador y script.
La espera del webhook tiene un límite de 20 segundos y toda falla ARCA queda aislada:
el pago, pedido, stock y envío permanecen confirmados y el webhook responde `200`.
`invoice_jobs` quedó únicamente como auditoría de intentos y orígenes. El panel admin
incorpora estados, error sanitizado, alerta de más de 24 horas, contadores, filtros,
reintento manual y PDF privado. Producción continúa bloqueada.

### 2026-08-15 · Recuperación histórica de una emisión interrumpida

Un reinicio de Node ocurrió después de que ARCA autorizara el comprobante 00002-00000002
y antes de persistir el CAE. `FECompConsultar` confirmó `Resultado=A`; se recuperó el
CAE sin volver a llamar a `FECAESolicitar`. La arquitectura posterior retiró el worker;
una acción manual sobre un estado incierto conserva esta misma recuperación previa por
consulta y nunca reenvía a ciegas.

### 2026-08-15 · ARCA WSFEv1: base manual de Factura C en homologación

Integración completa desde WSAA hasta la operación de `FECAESolicitar`. En este corte
inicial todavía no se había ejecutado la primera emisión, validada posteriormente.
Configuración central con bloqueo de producción, firma CMS
por OpenSSL, caché de Ticket de Acceso, cliente WSFEv1 y parámetros persistentes.
Checkout con receptor fiscal, esquema `invoices`, snapshots, locks de numeración,
idempotencia y recuperación de respuestas inciertas mediante `FECompConsultar`.
Endpoints privados, reclamo seguro de pedidos invitados, PDF en memoria y QR oficial.
WSAA + `FEDummy` homologación verificados en `OK`; 64 tests pasan y uno PostgreSQL se
omite sin `TEST_DATABASE_URL`. El TA persistente fue reutilizado por cuatro scripts
Node consecutivos sin `alreadyAuthenticated`. El `602` de puntos de venta quedó
admitido solo en homologación cuando `FECompUltimoAutorizado` confirma la combinación;
para punto 2 / Factura C respondió `0`. Frontend compila. Sin commit todavía.

### 2026-08-15 · Productos a pedido: plazo de entrega y compra sin stock
Cambio de semántica de `a_pedido`: de etiqueta suelta a "se puede comprar sin stock
inmediato, con plazo de entrega". Nuevo `dias_entrega_pedido` por producto (nullable,
cae al default de tienda). `stockReservation.js` permite stock negativo cuando
`a_pedido = true`, decidido siempre server-side dentro de la transacción. Badge,
CTA y aviso de plazo en `ProductCard`, `ProductDetail`, carrito, checkout y mail de
confirmación; `/productos-a-pedido` y el carrusel del home ahora filtran por
`!inStock && aPedido`. 43 tests de backend pasando (4 nuevos). Sin commit todavía.

### 2026-08-15 — `2cf994d` · Imágenes y moneda
Carpeta de imágenes y corrección de un error en el cambio de moneda.

### 2026-08-13 — `ab518ae` · Cambio de moneda
Soporte de productos en USD con conversión a ARS por tipo de cambio, y carpeta para
subir fotos.

### 2026-08-13 — `58e4a91` · Cupones y envío gratis
Cupones de descuento y envío gratis por monto mínimo, con umbral configurable por
variable de entorno como fuente única de verdad.

### 2026-08-12 — `6dfcb03` / `88b913b` · Listas de precios
Carga de listas de precios y edición de producto individual.

### 2026-08-11 — `86d830d` / `53a0c77` · Variantes
Stock por combinación exacta color × medida, con `variant_stock` en JSONB.

### 2026-08-11 — `20fa3a3` / `fc89606` / `02f9a35` · Ajustes visuales
Espaciado entre secciones del home, tarjeta de producto relacionado y vista mobile
(hero con aspect ratio, scroll horizontal en categorías y contacto).

### 2026-08-10 — `4b4eb47` · Categorías personalizables
Subcategorías y tipos de producto administrables desde el panel.

### 2026-08-07 — `13045ea` · Precio por variante
Precio propio opcional por color y por medida.

### 2026-08-07 — `8b13278` · Envío por zona
Cálculo de costo de envío por zona de código postal.

### 2026-08-06 — `3d6bfe8` / `86284d8` · Import de catálogo
Autoguardado de borrador al revisar imágenes, detección de códigos duplicados,
límite subido a 800 páginas.

### Anterior
Migración del proyecto al repositorio propio (`b9157cd`), sección de aviso de stock,
selección múltiple en el admin, header y categorías, commit inicial React + Vite
(`d841fe7`, 11 de junio de 2026).
