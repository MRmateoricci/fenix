# Estado del sistema — Fénix Web

> Bitácora de qué está hecho, qué falta y por qué se tomaron ciertas decisiones.
> El contexto estable (arquitectura, reglas, convenciones) vive en `CLAUDE.md`.
>
> **Cuándo actualizar:** al cerrar una tanda de trabajo, no en cada prompt.
> Si el cambio merece un commit con mensaje propio, merece una entrada acá.
> Un ajuste de padding, no.

**Última actualización:** 18 de agosto de 2026
**Commit de referencia:** `2cf994d` + cambios locales sin commit

---

## Estado general

| Área | Estado | Nota |
|---|---|---|
| Catálogo público | ✅ Funcionando | Falta terminar de cargar productos |
| Panel de administración | ✅ Funcionando | 7 secciones |
| Importación de listas de precios | ✅ Funcionando | XLSX + PDF de factura |
| Importación de imágenes de catálogo | ✅ Funcionando | Con revisión y borrador |
| Variantes (color × medida × tono) | ✅ Funcionando | Stock por combinación exacta |
| Carrito y checkout | ✅ Funcionando | Mercado Pago + datos fiscales dinámicos A/B/C |
| Cotización de envío | 🟡 Provisorio | Tarifario manual por zona |
| Envío gratis por monto | ✅ Funcionando | Umbral por env var |
| Cupones de descuento | ✅ Funcionando | |
| Cuentas de cliente | ✅ Funcionando | Email + OAuth Google/Facebook |
| Pedidos y seguimiento | ✅ Funcionando | Con notificaciones por mail |
| Reseñas | ✅ Funcionando | Propias + Google Places |
| Alertas de stock | ✅ Funcionando | "Avisame cuando vuelva" |
| Newsletter | ✅ Funcionando | |
| Productos a pedido | ✅ Funcionando | Compra sin stock con plazo de entrega — ver detalle abajo |
| SEO | ✅ Funcionando | Helmet + sitemap + robots |
| Facturación electrónica ARCA | 🟡 Implementada, producción bloqueada | A/B para RI y C para Monotributo; falta confirmar habilitación A real de Fenix |

---

## Detalle por área

### Catálogo e inventario

Una sola tabla `products` para inventario interno y catálogo público. Se publica
completando las columnas de catálogo y poniendo `published = true`.

Ejes de producto disponibles: `color_options`, `size_options`, `tone_options`
(tono de luz), con `variant_stock` (JSONB) para stock por combinación exacta y
precio propio opcional por color y por medida.

Campos físicos ya en el esquema y listos para el cotizador: `length_cm`,
`width_cm`, `height_cm`, `weight_kg`.

**Falta:** poblar dimensiones y peso en los productos reales. Sin esto no hay
cotizador de envío confiable.

### Productos a pedido

`a_pedido` ya no es una etiqueta suelta: significa "este producto se consigue a
pedido cuando no hay stock inmediato", y cambia si el producto se puede comprar.

| Estado | Condición | Comportamiento |
|---|---|---|
| En stock | `stock > 0` | Sin cambios |
| A pedido | `stock = 0` y `a_pedido = true` | Comprable, muestra plazo de entrega |
| Sin stock | `stock = 0` y `a_pedido = false` | No comprable, alerta de stock |

- `products.a_pedido BOOLEAN NOT NULL DEFAULT FALSE` (`schema.sql:260`)
- `products.dias_entrega_pedido INTEGER` nullable — override por producto; si es
  `NULL` se usa `store_settings.dias_entrega_pedido_default` (`schema.sql:260-343`)
- Expuesto como `aPedido` / `diasEntregaPedido` en `routes/catalog.js`
- Backend acepta la compra sin stock: `stockReservation.js` deja el stock en negativo
  cuando `a_pedido = true`, leído siempre de la DB dentro de la misma transacción
  (nunca de un dato mandado por el cliente). Marca `item.aPedido` en la orden solo
  para los items que efectivamente usaron la excepción
- Toggle + input de días en el admin (`AdminDashboard.jsx` ~1076), default global
  editable en la pestaña Tienda
- Ficha de producto: badge de tres estados, bloque de plazo, CTA activo con
  "Agregar al carrito · a pedido", alerta de stock oculta cuando es a pedido
  (`ProductDetail.jsx`)
- Card, carrito, checkout y mail de confirmación muestran el plazo (el mayor entre
  los items a pedido del pedido, no una suma)
- Página `/productos-a-pedido` y carrusel del home filtran por `!inStock && aPedido`

**Pendiente:** el selector de cantidad en `ProductDetail.jsx` sigue limitado a 1
para items a pedido (el stepper usa `availableStock`, que es 0) — el backend ya
soporta cantidades mayores en backorder, falta habilitarlo en la UI si se necesita.
Verificación en mobile pendiente (no confiable con `resize_window` en este proyecto).

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

### Envíos

**Estado actual: tarifario manual por zona** (`backend/config/shipping.js`).

7 zonas por rango de CP cubriendo 1000–9999 sin huecos:

| Zona | CP | Clásico | Expreso |
|---|---|---|---|
| Gran La Plata | 1884–1936 | 12.020 | 13.219 |
| CABA | 1000–1499 | 13.500 | 18.600 |
| GBA | 1500–1883, 1937–1999 | 14.300 | 19.700 |
| Centro, Litoral y Cuyo | 2000–3399, 5000–5999 | 15.957 | 21.941 |
| Interior BA y La Pampa | 6000–8199 | 16.700 | 23.000 |
| Norte (NOA/NEA) | 3400–4999 | 19.900 | 27.400 |
| Patagonia | 8200–9999 | 25.500 | 35.100 |

Más una tarifa plana de paquete grande (60×40×30 cm): 33.069 clásico / 46.546 expreso.

**Envío gratis:** `FREE_SHIPPING_THRESHOLD`, default 100.000, configurable con
`ENVIO_GRATIS_MINIMO`. Aplica a todo el país. El frontend no tiene el valor
hardcodeado, lo recibe de `GET /api/shipping/config`.

**Pendiente:** integración real con Correo Argentino. El adaptador está previsto en
`services/shippingQuotes.js` y se activa cambiando `SHIPPING_PROVIDER=correo_argentino`.
Faltan credenciales (`CORREO_ARGENTINO_API_URL`, `CLIENT_ID`, `CLIENT_SECRET`).
Requiere además las dimensiones físicas cargadas por producto.

### Pagos

Mercado Pago Checkout Pro (`services/mercadopago.js`, `mercadopagoPayments.js`).
Webhook en `/api/webhooks` con validación de firma (`MP_WEBHOOK_SECRET`), recibiendo
el body raw antes del `express.json()`.

**Cuotas:** `ProductCard.jsx:30` define `const INSTALLMENTS = 6` y muestra
"Hasta 6 cuotas sin interés de $X".

**Pendiente / a revisar:**
1. El valor está hardcodeado en el componente, no es fuente única de verdad. Debería
   vivir en el backend junto al resto de la configuración de tienda.
2. `ProductDetail.jsx` **no muestra ningún mensaje de cuotas**, siendo la página de
   mayor conversión.
3. Verificar que las 6 cuotas sin interés estén efectivamente activadas en el panel
   de comerciante de MP y que coincidan con lo que promete la UI.

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
- Alertas de stock: el cliente deja su mail y se le avisa cuando el producto vuelve
- Reseñas propias moderables + reseñas reales de Google Places (límite de 5 de la API)

### Reserva y expiración de stock

`stockReservation.js` descuenta stock dentro de la transacción del pedido.
`jobs/expireReservations.js` libera reservas vencidas.

---

## Pendientes priorizados

1. **Confirmar la habilitación A real de Fenix** y configurar
   `ARCA_A_AUTHORIZATION_MODE` sin asumir `standard`
2. Confirmar la única alícuota del catálogo; el PERÍODO DESDE ya quedó fijado en `2024-01`
3. Aplicar la migración y ejecutar las consultas productivas seguras para el punto 3
4. Ejecutar las pruebas PostgreSQL descartables de facturación con `TEST_DATABASE_URL`
5. **Cargar dimensiones y peso** en los productos reales — bloquea el cotizador real
6. **Cuotas**: mover `INSTALLMENTS` al backend y agregar el mensaje en `ProductDetail`
7. **Verificar cuotas sin interés** activas en el panel de MP
8. **Terminar de poblar el catálogo** con productos e imágenes
9. Credenciales de Correo Argentino y activación del adaptador real
10. Refactor de `AdminDashboard.jsx` (8.100+ líneas en un solo archivo)

---

## Bitácora

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
