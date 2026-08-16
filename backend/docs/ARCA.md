# ARCA WSFEv1 — Factura C

La integración está preparada para emitir exclusivamente Factura C mediante WSFEv1. La emisión es manual desde el detalle privado de un pedido pagado o mediante el script explícito de homologación. El webhook de Mercado Pago no emite comprobantes.

## Seguridad y ambiente

- `ARCA_ENV=homologation` usa únicamente WSAA y WSFEv1 de homologación.
- Si se configura `ARCA_ENV=production`, toda conexión queda bloqueada salvo que también exista `ARCA_PRODUCTION_ENABLED=true`.
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

También puede emitirse desde “Mi cuenta → Pedido → Obtener factura”. Repetir la operación sobre una factura autorizada devuelve la misma factura y no solicita otro CAE.

## Recuperación e idempotencia

- Los requests se serializan con locks consultivos de PostgreSQL por pedido y por `(CUIT, punto de venta, tipo)`.
- Un rechazo queda en `rejected` y requiere corregir los datos manualmente.
- Un timeout o error de transporte queda en `uncertain` y dispara `FECompConsultar`.
- Solo el código oficial `602` se interpreta como comprobante inexistente.
- El request que sufrió el timeout nunca reenvía. Una llamada posterior solo reutiliza el número si ARCA vuelve a confirmar `602` y el último autorizado continúa siendo el anterior.
- Si la numeración avanzó o la consulta es ambigua, la factura permanece incierta para diagnóstico.

## PDF y QR

El PDF se genera en memoria desde snapshots persistidos y se descarga por una ruta privada con `Cache-Control: private, no-store`. No se guardan PDFs públicos ni se vuelve a llamar a `FECAESolicitar`.

El QR usa `https://www.arca.gob.ar/fe/qr/?p=<JSON_BASE64>` y contiene los campos oficiales de versión, fecha, CUIT, punto de venta, tipo/número, importe, moneda/cotización, documento receptor y CAE.

## Producción futura

Antes de habilitar producción se necesitan certificado, clave, relación WSASS y punto de venta productivos, pruebas de recuperación e idempotencia y una revisión operativa. Recién entonces se podrá configurar `ARCA_ENV=production` y `ARCA_PRODUCTION_ENABLED=true`. Esta documentación no autoriza ese cambio ni activa emisión automática.
