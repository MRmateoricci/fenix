# ARCA WSFEv1 — Factura C

La integración emite exclusivamente Factura C mediante WSFEv1. Todos los orígenes pasan por `attemptInvoiceForOrder()`, que audita el intento y delega en la operación fiscal idempotente `createInvoiceForOrder(orderId)`.

## Seguridad y ambiente

- `ARCA_ENV=homologation` usa únicamente WSAA y WSFEv1 de homologación.
- Si se configura `ARCA_ENV=production`, toda conexión queda bloqueada salvo que también exista `ARCA_PRODUCTION_ENABLED=true`.
- La emisión automática tiene un segundo control independiente: `ARCA_AUTO_INVOICE_ENABLED=true`. En producción deben estar habilitados ambos controles.
- La clave privada, el certificado, el CMS, Token y Sign nunca se registran.
- En homologación, el TA se reutiliza entre procesos mediante
  `.cache/arca/wsaa-homologation-wsfe.json`. El archivo está ignorado por Git,
  se crea con permisos restrictivos y se invalida por vencimiento, CUIT, servicio
  o cambio de certificado.
- `backend/config/arca/`, `*.key`, `*.crt` y `*.csr` están ignorados por Git.
- `.cache/arca/` también está ignorado: contiene credenciales temporales y no debe
  copiarse, publicarse ni incluirse en backups compartidos.
- Las rutas de certificado y clave se resuelven desde la raíz de `backend`, aunque Node se inicie desde otro directorio.

## Variables de entorno

Agregar a `backend/.env`:

```dotenv
ARCA_ENV=homologation
ARCA_PRODUCTION_ENABLED=false
ARCA_AUTO_INVOICE_ENABLED=false
ARCA_CUIT=
ARCA_PTO_VTA=
ARCA_CERT_PATH=./config/arca/arca_certificate.crt
ARCA_KEY_PATH=./config/arca/arca_private.key
ARCA_DEFAULT_CBTE_TIPO=11
ARCA_DEFAULT_CONCEPTO=1
ARCA_LEGAL_NAME=
ARCA_TAX_ADDRESS=
ARCA_TAX_CONDITION=Monotributo
ARCA_IIBB=
ARCA_ACTIVITY_START_DATE=
```

`ARCA_OPENSSL_PATH` es opcional. En Windows se busca también el OpenSSL incluido con Git; si no se encuentra, configurar la ruta absoluta al ejecutable.

`ARCA_ACTIVITY_START_DATE` debe escribirse como `AAAA-MM-DD`. `ARCA_PTO_VTA` debe ser un punto de venta habilitado para factura electrónica y autorizado para el servicio `wsfe` en WSASS.

Los archivos esperados permanecen en:

```text
backend/config/arca/arca_certificate.crt
backend/config/arca/arca_private.key
```

## Preparación

Desde `backend/`:

```powershell
npm install
npm run db:migrate
node scripts/testArca.js
node scripts/testArcaPuntosVenta.js
```

Elegir un punto sin bloqueo ni fecha de baja, cargarlo en `ARCA_PTO_VTA` y luego ejecutar:

```powershell
node scripts/testArcaParametros.js
node scripts/testArcaLastVoucher.js
```

En homologación, `FEParamGetPtosVenta` puede responder exclusivamente `602` sin
resultados aunque la combinación configurada sea utilizable. En ese caso la emisión
registra una advertencia y valida `ARCA_PTO_VTA` + `ARCA_DEFAULT_CBTE_TIPO` mediante
`FECompUltimoAutorizado`; un último número entero mayor o igual a cero habilita la
combinación. Cualquier otro error detiene la emisión. Esta excepción no existe en
producción, donde `FEParamGetPtosVenta` conserva validación estricta.

Los catálogos sanitizados se guardan en `arca_parameter_cache`. Si ARCA tiene una interrupción temporal se usa la última respuesta válida, marcada como `stale` para la UI.

## Primera Factura C de homologación

1. Crear un pedido desde checkout con receptor fiscal confirmado.
2. Acreditar el pago en homologación o marcarlo pagado por el flujo administrativo correspondiente.
3. Copiar el UUID del pedido.
4. Ejecutar conscientemente:

```powershell
node scripts/testArcaInvoice.js --order-id <uuid> --confirm-homologation
```

El argumento `--confirm-homologation` es obligatorio y el script rechaza producción. La operación consulta el último número autorizado, persiste el candidato y recién después llama a `FECAESolicitar`.

También puede emitirse desde “Mi cuenta → Pedido → Obtener factura”. Repetir la operación sobre una factura autorizada devuelve la misma factura y no solicita otro CAE. En homologación ya se validó una Factura C autorizada para punto de venta 2, tipo 11 y número 1, incluida su persistencia, PDF, QR e idempotencia.

## Emisión automática posterior al pago

El webhook usa el ID recibido solo como disparador, vuelve a consultar el pago con las credenciales privadas de Mercado Pago y persiste el resultado verificado. Si `payment.status=approved`, el pedido coincide y `ARCA_AUTO_INVOICE_ENABLED=true`, intenta la factura inmediatamente en el mismo flujo. La espera está limitada a 20 segundos; si vence, el webhook responde `200` y la operación ya iniciada continúa con su propia persistencia segura. Una falla ARCA nunca revierte el pago, el pedido, el stock ni el envío, y tampoco cambia el `200` del webhook.

No existe worker de facturación, cron, scheduler ni polling periódico. `invoice_jobs` se conserva únicamente como auditoría deduplicada del último intento, cantidad, origen (`webhook`, `customer`, `admin`, `manual_script`) y error sanitizado; no es una cola. `invoices` es la fuente de verdad fiscal. Los locks y la unicidad de `invoices` preservan un solo comprobante y un solo CAE ante webhooks o procesos simultáneos.

Si faltan datos fiscales, el intento queda documentado como `needs_data`, el pedido sigue pagado y no se llama a ARCA. Después de confirmarlos, el cliente o el administrador pueden usar el botón manual. Estados `pending`, `in_process`, `rejected`, `cancelled`, `refunded` y `charged_back` de Mercado Pago no disparan la emisión automática. Con `ARCA_AUTO_INVOICE_ENABLED=false`, el webhook no se conecta a ARCA y los botones manuales continúan disponibles.

Las devoluciones y contracargos posteriores a una factura autorizada requieren una Nota de Crédito. Ese flujo no está implementado y no se genera automáticamente en esta etapa.

## Recuperación e idempotencia

- Los requests se serializan con locks consultivos de PostgreSQL por pedido y por `(CUIT, punto de venta, tipo)`.
- Un rechazo queda en `rejected` y requiere corregir los datos manualmente.
- Un timeout o error de transporte queda en `uncertain` y dispara `FECompConsultar`.
- Solo el código oficial `602` se interpreta como comprobante inexistente.
- El request que sufrió el timeout nunca reenvía. Una llamada posterior solo reutiliza el número si ARCA vuelve a confirmar `602` y el último autorizado continúa siendo el anterior.
- Si la numeración avanzó o la consulta es ambigua, la factura permanece incierta para diagnóstico.
- No hay reintentos temporizados ni reenvíos ciegos. Una acción posterior del cliente, del administrador o del script vuelve a entrar por `createInvoiceForOrder()`, que consulta primero los estados inciertos.
- El panel administrativo muestra pendientes, demoradas más de 24 horas, estado fiscal, último origen/error y permite “Facturar ahora” sólo para pagos de Mercado Pago realmente aprobados y sin factura autorizada.

La recuperación manual de comprobantes `pending`, `processing`, `uncertain` o `error` se ejecuta, desde `backend/`, con:

```powershell
node scripts/retryPendingInvoices.js --confirm-homologation
```

El script es una herramienta de emergencia, exige confirmación de homologación, rechaza producción y no procesa facturas `rejected`. Nunca se ejecuta automáticamente.

## PDF y QR

El PDF se genera en memoria desde snapshots persistidos y se descarga por una ruta privada con `Cache-Control: private, no-store`. No se guardan PDFs públicos ni se vuelve a llamar a `FECAESolicitar`.

El QR usa `https://www.arca.gob.ar/fe/qr/?p=<JSON_BASE64>` y contiene los campos oficiales de versión, fecha, CUIT, punto de venta, tipo/número, importe, moneda/cotización, documento receptor y CAE.

## Despliegue seguro a producción

La activación debe hacerse en dos etapas y nunca habilitando ambos controles al mismo tiempo:

1. Desplegar el código con `ARCA_ENV=production`, `ARCA_PRODUCTION_ENABLED=false` y `ARCA_AUTO_INVOICE_ENABLED=false`.
2. Configurar certificado, clave, relación WSASS, CUIT, datos legales y punto de venta productivos.
3. Probar WSAA, `FEDummy`, parámetros, punto de venta y último autorizado. En producción no existe el fallback 602 de puntos de venta.
4. Cambiar solamente `ARCA_PRODUCTION_ENABLED=true` y mantener la automatización apagada.
5. Emitir una única factura real controlada mediante el flujo manual, y verificar CAE, persistencia, PDF y QR.
6. Revisar idempotencia, recuperación, alertas y procedimiento operativo para rechazos y estados inciertos.
7. Recién entonces cambiar `ARCA_AUTO_INVOICE_ENABLED=true`.

Para detener inmediatamente nuevas emisiones automáticas, configurar `ARCA_AUTO_INVOICE_ENABLED=false` y reiniciar el backend. Esto no altera pagos, pedidos ni facturas ya autorizadas. Los scripts de emisión y recuperación incluidos rechazan producción. Esta tarea no activa ni prueba el ambiente productivo.
