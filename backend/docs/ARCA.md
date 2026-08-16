# ARCA WSFEv1 — Factura C

La integración emite exclusivamente Factura C mediante WSFEv1. La misma operación idempotente, `createInvoiceForOrder(orderId)`, sirve al botón manual, al script de homologación y al worker automático posterior a un pago aprobado de Mercado Pago.

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

El webhook usa el ID recibido solo como disparador, vuelve a consultar el pago con las credenciales privadas de Mercado Pago y persiste el resultado verificado. Solamente `payment.status=approved`, asociado al pedido correcto, crea una fila deduplicada en `invoice_jobs`. Después responde `200`; nunca espera WSAA, WSFE ni el PDF. Una falla transitoria al verificar o persistir el pago responde `500` para que Mercado Pago reintente, pero una falla al encolar o procesar ARCA no cambia la respuesta del pago confirmado.

El worker se inicia con el backend cuando `ARCA_AUTO_INVOICE_ENABLED=true`. Consulta la cola cada 15 segundos y vuelve a validar en la base que `orders.mp_status=approved` antes de llamar a `createInvoiceForOrder()`. Webhooks repetidos convergen en una sola fila por `order_id`; los locks y la unicidad de `invoices` preservan un solo comprobante y un solo CAE.

Si faltan datos fiscales, el trabajo queda en `needs_data` y el pedido sigue pagado. Al confirmarlos desde el detalle privado se reprograma el trabajo; el botón “Obtener factura” permanece como fallback manual. Estados `pending`, `in_process`, `rejected`, `cancelled`, `refunded` y `charged_back` de Mercado Pago no programan ni ejecutan una factura.

Las devoluciones y contracargos posteriores a una factura autorizada requieren una Nota de Crédito. Ese flujo no está implementado y no se genera automáticamente en esta etapa.

## Recuperación e idempotencia

- Los requests se serializan con locks consultivos de PostgreSQL por pedido y por `(CUIT, punto de venta, tipo)`.
- Un rechazo queda en `rejected` y requiere corregir los datos manualmente.
- Un timeout o error de transporte queda en `uncertain` y dispara `FECompConsultar`.
- Solo el código oficial `602` se interpreta como comprobante inexistente.
- El request que sufrió el timeout nunca reenvía. Una llamada posterior solo reutiliza el número si ARCA vuelve a confirmar `602` y el último autorizado continúa siendo el anterior.
- Si la numeración avanzó o la consulta es ambigua, la factura permanece incierta para diagnóstico.
- Los errores recuperables se reintentan como máximo cinco veces: inmediato, luego 1 minuto, 5 minutos, 15 minutos y 1 hora. Un rechazo fiscal, datos inválidos, pedido no pagado o configuración inválida no se reintentan automáticamente.
- Cada ciclo revisa trabajos `processing` cuyo lease tenga más de diez minutos y los recupera, incluso si al reiniciar todavía eran demasiado recientes. Un intento anterior no puede sobrescribir al nuevo porque la persistencia verifica su número de intento. La cola es PostgreSQL, no memoria del proceso.

Para revisar pendientes, intentos y el último error sanitizado se puede usar `getInvoiceAutomationMetrics()` de `jobs/arcaInvoices.js`. La recuperación manual de comprobantes `pending`, `uncertain` o `error` se ejecuta, desde `backend/`, con:

```powershell
node scripts/retryPendingInvoices.js --confirm-homologation
```

El script no reprograma facturas `rejected`. No se instaló ningún cron; el barrido normal lo realiza el worker embebido mientras el servidor está activo.

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

Para detener inmediatamente nuevas emisiones automáticas, configurar `ARCA_AUTO_INVOICE_ENABLED=false` y reiniciar el backend. Esto no altera pagos, pedidos ni facturas ya autorizadas. El script de recuperación exige `--confirm-production` cuando se use en producción. Esta tarea no activa ni prueba el ambiente productivo.
