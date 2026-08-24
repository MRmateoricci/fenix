# ARCA WSFEv1 — facturación según emisor y receptor

La integración usa WSAA + WSFEv1 y conserva idempotencia, auditoría, PDF y QR. El tipo de comprobante ya no se configura con `ARCA_DEFAULT_CBTE_TIPO`: se determina por la condición IVA del emisor, la condición del receptor y la habilitación A real del emisor.

## Estado de seguridad

- `ARCA_ENV=production` habilita autenticación y consultas de solo lectura.
- `ARCA_PRODUCTION_ENABLED=false` bloquea `FECAESolicitar`, incluso si un caller intenta saltear el servicio principal.
- `ARCA_AUTO_INVOICE_ENABLED=false` impide el intento automático posterior al pago.
- Para un emisor Responsable Inscripto, `ARCA_A_AUTHORIZATION_MODE` es obligatorio aun para cargar la configuración. No existe fallback a `standard`.
- `ARCA_ACTIVITY_START_DATE` admite el **PERÍODO DESDE** registral como `YYYY-MM`. Si en algún momento ARCA informa oficialmente el día, también admite `YYYY-MM-DD`; nunca se infiere ni se sustituye con fechas de inscripción o actualización.

## Estrategia fiscal

| Emisor | Receptor | Comprobante |
| --- | --- | --- |
| Responsable Inscripto | Responsable Inscripto | A: tipo 1, o tipo 51 si está sujeto a retención |
| Responsable Inscripto | Monotributista | A: tipo 1, o tipo 51 si está sujeto a retención |
| Responsable Inscripto | Consumidor Final | B: tipo 6 |
| Responsable Inscripto | Exento | B: tipo 6 |
| Monotributo o Exento | receptor admitido por ARCA | C: tipo 11 |

Las condiciones del receptor no se aceptan por un código local fijo. El backend consulta `FEParamGetCondicionIvaReceptor` para la clase A, ALEY, B o C correspondiente, clasifica su descripción y conserva el ID vigente que informó ARCA. También valida tipos de comprobante, documentos, punto de venta y alícuotas contra los catálogos WSFE.

Referencias oficiales:

- Matriz de comprobantes: https://www.arca.gob.ar/facturacion/regimen-general/comprobantes.asp
- Manual WSFEv1: https://www.arca.gob.ar/fe/ayuda/documentos/wsfev1-RG-4291.pdf
- Especificación del QR: https://www.arca.gob.ar/fe/qr/documentos/QRespecificaciones.pdf

## Verificar `ARCA_A_AUTHORIZATION_MODE`

No inferir el modo por antigüedad, CUIT, certificado ni punto de venta. Verificarlo con la clave fiscal del contribuyente:

1. Ingresar al servicio de ARCA **Regímenes de Facturación y Registración (REAR/RECE/RFI)**.
2. Abrir **Habilitación de Comprobantes** para el contribuyente.
3. Comparar la autorización informada con esta tabla.

| Habilitación real mostrada por ARCA | Valor de configuración |
| --- | --- |
| Comprobantes clase A sin leyenda especial | `standard` |
| A con leyenda “PAGO EN CBU INFORMADA” | `cbu_informed` |
| A con leyenda “OPERACIÓN SUJETA A RETENCIÓN” | `subject_to_withholding` |

Si la pantalla no permite determinarlo con certeza, dejar la variable vacía. El sistema fallará con `ARCA_A_AUTHORIZATION_MODE_REQUIRED` antes de consultar parámetros, numerar o solicitar un CAE. No completar `standard` como supuesto temporal.

## IVA y precios persistidos

El ecommerce ya trataba `precio_iva` como precio final y, cuando solo existía `precio_venta`, aplicaba una regla global del 21 %. No existe hoy una columna de alícuota por producto ni una arquitectura de múltiples alícuotas. Esa regla histórica quedó centralizada en `backend/config/tax.js`.

Para A, ALEY y B, el importe persistido del pedido se considera precio final con IVA incluido. El backend —nunca el frontend— calcula en centavos:

```text
neto = total / 1,21
IVA = total - neto
total = neto + IVA
```

El redondeo de la división es Round Half Even. El payload envía `ImpNeto`, `ImpIVA`, `ImpTotal` e `Iva.AlicIva[]`; el ID de la alícuota del 21 % se resuelve en tiempo de ejecución mediante `FEParamGetTiposIva`. El snapshot y la factura guardan tasa, base e importe de IVA.

Antes de habilitar producción hay que confirmar comercialmente que ningún producto, envío o concepto vendido por Fenix usa 10,5 %, 27 %, exención o no gravado. La implementación actual no debe usarse para un catálogo con alícuotas mixtas.

## Receptor y documento

- Factura A/ALEY: Responsable Inscripto o Monotributista, identificado con CUIT.
- Factura B a Exento: CUIT.
- Factura B a Consumidor Final: CUIT, DNI o el documento “Consumidor Final” informado por ARCA.
- Para Consumidor Final sin identificar, el documento 99 usa número 0. Al alcanzar el umbral vigente configurado en el backend ($10.000.000), se exige CUIT o DNI.

La interfaz filtra documentos según la condición IVA seleccionada y el backend vuelve a validar la combinación y el total persistido.

## Configuración propuesta para consultas productivas

```env
ARCA_ENV=production
ARCA_PRODUCTION_ENABLED=false
ARCA_AUTO_INVOICE_ENABLED=false

ARCA_CUIT=33718368419
ARCA_PTO_VTA=3
# Railway: secretos sealed con el contenido completo codificado en Base64.
ARCA_CERT_BASE64=
ARCA_KEY_BASE64=
# Desarrollo local: fallback a archivos ignorados por Git.
ARCA_CERT_PATH=./config/arca/production/fenix_certificate.crt
ARCA_KEY_PATH=./config/arca/production/fenix_private.key

ARCA_DEFAULT_CONCEPTO=1
ARCA_LEGAL_NAME=
ARCA_TAX_ADDRESS=CANTILO 745, CITY BELL, BUENOS AIRES
ARCA_TAX_CONDITION=Responsable Inscripto
ARCA_A_AUTHORIZATION_MODE=
ARCA_IIBB=
ARCA_ACTIVITY_START_DATE=2024-01
```

Completar `ARCA_A_AUTHORIZATION_MODE` solo después de la verificación anterior. `ARCA_ACTIVITY_START_DATE=2024-01` refleja exactamente el **PERÍODO DESDE 01/2024** informado por Sistema Registral. El PDF muestra `Inicio de actividades: 01/2024` y la emisión no queda bloqueada por no contar con un día que ARCA no informa.

No agregar `ARCA_DEFAULT_CBTE_TIPO`.

En Railway se deben configurar `ARCA_CERT_BASE64` y `ARCA_KEY_BASE64` juntas y
marcarlas como **sealed**. El backend las decodifica en el directorio temporal de
la instancia con permisos `0600`; sus contenidos no se guardan en Git ni en el
filesystem persistente. Cuando existen, tienen prioridad sobre `ARCA_CERT_PATH` y
`ARCA_KEY_PATH`, que quedan como fallback para desarrollo local. Base64 es solo
una codificación: la confidencialidad depende del almacenamiento sealed.
El proceso principal realiza esta validación antes de `app.listen()`: una pareja
Base64 incompleta o inválida impide el startup, y las lecturas posteriores de la
configuración reutilizan la materialización existente sin reescribirla.
Las variables definidas con valor vacío también se consideran una configuración
inválida; el fallback local sólo se usa cuando ninguna de las dos está definida.

## Consultas seguras de producción

Ejecutar desde `backend`. Los cuatro scripts muestran:

```text
AMBIENTE: PRODUCCIÓN
NO SE EMITIRÁN COMPROBANTES
```

Comandos:

```bash
# Diagnóstico HTTPS aislado, sin WSAA ni SOAP
node scripts/testArcaTls.js

# WSAA + FEDummy
node scripts/testArca.js

# Catálogos: comprobantes, documentos, conceptos, monedas, IVA y condiciones receptor
node scripts/testArcaParametros.js

# Lista y estado de puntos de venta; permite comprobar el punto 3
node scripts/testArcaPuntosVenta.js

# Último autorizado de los tipos relevantes para el modo configurado
node scripts/testArcaLastVoucher.js
```

También se puede consultar un tipo explícito:

```bash
node scripts/testArcaLastVoucher.js --voucher-type 1   # A standard/CBU
node scripts/testArcaLastVoucher.js --voucher-type 51  # A sujeta a retención
node scripts/testArcaLastVoucher.js --voucher-type 6   # B
```

Ninguno de esos scripts contiene una llamada a `FECAESolicitar`. `FECompConsultar` y `FECompUltimoAutorizado` siguen siendo consultas permitidas con la emisión bloqueada.

### Compatibilidad TLS de WSFE producción

El 18/08/2026 se verificó localmente con Node `v24.11.1` y OpenSSL `3.5.4` que el WSDL productivo negocia TLS 1.2, suite `DHE-RSA-AES256-GCM-SHA384` y una clave efímera DH de 1024 bits. El nivel de seguridad predeterminado de OpenSSL la rechaza con `tls_process_ske_dhe:dh key too small`; el certificado del servidor, en cambio, valida correctamente.

`backend/services/arcaTls.js` crea un `https.Agent` privado solo cuando la URL coincide con `https://servicios1.afip.gov.ar/wsfev1/`. Conserva validación de certificados, exige TLS 1.2 o superior y limita la compatibilidad a suites ECDHE/DHE con AES-GCM usando `@SECLEVEL=1`. No usa `rejectUnauthorized: false`, no modifica `NODE_OPTIONS`, `openssl.cnf` ni el nivel global de Node.

`node-soap` 1.10.0 usa Axios 1.19.0. La integración inyecta el mismo agente en la instancia Axios, en `wsdl_options` y en las opciones de cada operación, de modo que cubre tanto la descarga del WSDL como los POST SOAP. El WSDL observado respondió HTTP 200 sin redirect, no contiene imports relativos/externos y publica el mismo host para el endpoint SOAP.

Railway usa Railpack y toma la versión de Node desde `engines.node` del `package.json` raíz. El rango actual (`^20.19.0 || >=22.12.0`) es compatible con estas opciones de `https.Agent`; no hace falta modificar OpenSSL del contenedor ni agregar configuración manual del sistema. Para registrar el runtime efectivo en Railway se puede ejecutar `node -p "JSON.stringify({node:process.version,openssl:process.versions.openssl})"` en una shell del servicio.

## Primera factura real — no ejecutar hasta autorización

Cuando se confirme la habilitación real de Fenix, antes del primer comprobante deben estar completos:

- `ARCA_A_AUTHORIZATION_MODE` verificado;
- razón social e IIBB;
- `ARCA_ACTIVITY_START_DATE=2024-01`, tomado del PERÍODO DESDE registral;
- punto de venta 3 validado para WSFE/RECE;
- alícuota del catálogo confirmada como única para todos los conceptos;
- `ARCA_AUTO_INVOICE_ENABLED=false`;
- `ARCA_PRODUCTION_ENABLED=true` habilitado solo para la prueba controlada.

El comando exacto, desde `backend`, es:

```bash
node scripts/testArcaInvoice.js --order-id UUID --confirm-production
```

El script aborta si falta `--confirm-production`, si `ARCA_PRODUCTION_ENABLED` no es `true`, si falta el modo A o si falta un período de actividad válido. `YYYY-MM` es suficiente; no se consulta ni usa Fecha de inscripción o Fecha de actualización. La emisión automática debe permanecer apagada hasta validar el resultado de esa primera factura.

## Homologación y limitaciones

- La estrategia Monotributo → Factura C tipo 11 se conserva para las pruebas existentes de homologación.
- La operación recupera respuestas inciertas con `FECompConsultar` y protege la secuencia por CUIT, punto de venta y tipo.
- Las Facturas A a Monotributistas incluyen la leyenda exigida por la Ley 27.618.
- No está implementada la Factura de Crédito Electrónica MiPyME ni la selección de múltiples alícuotas dentro de un pedido. Si la relación comercial requiere FCE o el catálogo incorpora tasas mixtas, hay que ampliar la estrategia antes de emitir.

## Representación gráfica y logo

El PDF de los comprobantes alcanzados incluye el bloque `Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)`, el `IVA Contenido` y los `Otros Impuestos Nacionales Indirectos`. La implementación fiscal actual no liquida otros impuestos nacionales indirectos, por lo que ese valor se muestra en cero.

El encabezado reutiliza el logo público versionado en `src/assets/logo_fenix-removebg-preview.png`. No es un secreto y no requiere una variable de Railway. Para cambiarlo, hay que reemplazar ese archivo por otro PNG transparente, conservar el nombre y volver a desplegar; el backend recorta automáticamente el margen transparente antes de insertarlo. Si el asset no estuviera disponible, el PDF mantiene como fallback el encabezado textual del emisor.
