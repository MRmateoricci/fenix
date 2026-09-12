import { Link, Navigate, useParams } from 'react-router-dom'
import PageSEO from '../components/SEO'
import PolicyBody from '../components/PolicyBody'
import { SEO as seoCfg } from '../config/seo'

const { legal, business } = seoCfg

// Identificación del vendedor, repetida en cada documento porque cada uno se
// puede leer suelto (el modal del checkout abre uno solo).
const RESPONSABLE = `${legal.companyName} (CUIT ${legal.cuit}), con domicilio en ${legal.address}, que opera bajo el nombre comercial "${business.name}"`

// Cada documento lleva su propia fecha: cuando se corrige uno, el resto no
// tiene por qué aparentar haber cambiado.
export const POLICIES = {
  refunds: {
    title: 'Cambios, devoluciones y reembolsos',
    updated: 'septiembre de 2026',
    sections: [
      ['Derecho de arrepentimiento', [
        'Si compraste por este sitio, tenés derecho a arrepentirte de la compra sin necesidad de dar un motivo dentro de los 10 días corridos contados desde que recibiste el producto (o desde la compra, si todavía no lo recibiste). Está previsto en el artículo 34 de la Ley 24.240 y en los artículos 1110 a 1116 del Código Civil y Comercial.',
        'Para ejercerlo usá el [botón de arrepentimiento](/arrepentimiento). Al enviar la solicitud recibís un número de trámite por correo electrónico. Los gastos de devolución corren por nuestra cuenta: coordinamos el retiro o te indicamos cómo enviarlo sin costo para vos.',
        'El producto debe volver en el estado en que lo recibiste, sin uso y con sus accesorios. No te vamos a rechazar la devolución por la caja o el embalaje.',
        'Una vez recibido el producto, reintegramos el total pagado, incluido el envío original si lo hubo.',
      ]],
      ['Productos con fallas — garantía legal', [
        'Todos los productos nuevos tienen una garantía legal mínima de 6 meses desde la entrega (artículo 11 de la Ley 24.240), además de la garantía del fabricante cuando la hubiera.',
        'Si el producto presenta una falla, escribinos con el número de pedido, una descripción y fotos o un video del problema. Según el caso, se repara, se reemplaza por uno igual o, si no es posible, se reintegra el importe. Los costos de traslado por garantía están a nuestro cargo.',
        'La garantía no cubre daños por instalación incorrecta, uso fuera de las especificaciones del producto, sobretensiones de la red eléctrica ni desgaste normal. Recomendamos que la instalación la haga un electricista matriculado.',
      ]],
      ['Producto equivocado o dañado en el envío', 'Si recibiste algo distinto a lo que pediste, o el paquete llegó dañado, avisanos dentro de las 48 horas con fotos del producto y del embalaje. Nos hacemos cargo del reemplazo y del envío.'],
      ['Cambios por otro producto', 'Fuera del derecho de arrepentimiento, aceptamos cambios por otro producto dentro de los 30 días de la entrega, siempre que esté sin uso, completo y en su embalaje original. Si hay diferencia de precio se abona o se acredita. El envío del cambio corre por cuenta del cliente, salvo que el cambio se deba a un error nuestro.'],
      ['Cómo se hacen los reintegros', [
        'Pagos con Mercado Pago: se reintegra por el mismo medio de pago. El tiempo de acreditación lo determinan Mercado Pago y la entidad emisora de la tarjeta, habitualmente entre 7 y 30 días.',
        'Pagos por transferencia bancaria: se reintegra por transferencia a una cuenta a nombre del comprador, dentro de los 5 días hábiles de recibido el producto.',
      ]],
      ['Contacto', `Para cualquiera de estos trámites escribinos a ${legal.email} o por WhatsApp al ${business.phoneDisplay}, o acercate al local de ${business.streetAddress}, City Bell.`],
    ],
  },

  shipping: {
    title: 'Política de envíos',
    updated: 'septiembre de 2026',
    sections: [
      ['Envíos a domicilio', 'Enviamos a todo el país. El costo y la fecha estimada de entrega se calculan con el código postal en el checkout, antes de pagar. El costo depende de la zona de destino y del peso del pedido. Algunos pedidos muy voluminosos o pesados no se pueden cotizar automáticamente: en ese caso el sitio te lo indica y lo cotizamos por WhatsApp.'],
      ['Envío sin cargo en la zona', 'Los pedidos a City Bell, Gonnet y Villa Elisa tienen envío gratis, sin mínimo de compra: los entregamos nosotros. Al ingresar tu código postal en el checkout vas a ver el envío en $0. Para el resto del país el envío es gratis a partir del monto que se informa en el sitio.'],
      ['Plazos', 'El plazo que ves en el checkout es una estimación: suma los días que necesitamos para preparar el pedido (algunos productos los pedimos al proveedor) y el tránsito del transporte. Puede variar por disponibilidad, clima, feriados o demoras del operador logístico. Si un pedido se demora más de lo previsto, te avisamos.'],
      ['Retiro en el local', `El retiro es gratuito en nuestro local de ${business.streetAddress}, City Bell, en el horario de atención (${business.hoursDisplay}). Te avisamos cuando el pedido esté listo. Presentá tu DNI y el número de pedido; si retira otra persona, indicalo al comprar.`],
      ['Recepción del paquete', 'Revisá el estado del paquete al recibirlo. Si observás daños visibles, dejá constancia ante el transportista y contactanos dentro de las 48 horas con fotos. Hasta que el producto te es entregado, el riesgo de pérdida o daño en el transporte es nuestro, no tuyo.'],
      ['Entregas fallidas', 'Si el transporte no logra entregar el paquete (domicilio incorrecto, nadie para recibirlo) y vuelve a nuestro local, coordinamos un nuevo envío. El costo del reenvío corre por cuenta del cliente si el dato del domicilio era incorrecto o incompleto.'],
    ],
  },

  privacy: {
    title: 'Política de privacidad',
    updated: 'septiembre de 2026',
    sections: [
      ['Quién es responsable de tus datos', [
        `El responsable de la base de datos es ${RESPONSABLE}. Para cualquier consulta sobre tus datos personales escribinos a ${legal.email}.`,
        'Esta política se rige por la Ley 25.326 de Protección de los Datos Personales y sus normas complementarias.',
      ]],
      ['Qué datos recopilamos', [
        'Solo pedimos los datos necesarios para lo que vas a hacer en el sitio:',
        { list: [
          'Cuenta de usuario: nombre, apellido, correo electrónico, contraseña (guardada cifrada, nunca en texto plano), teléfono y domicilio si los cargás. Si ingresás con Google o Facebook, recibimos tu nombre y correo de esa cuenta.',
          'Compra: nombre, correo, teléfono, domicilio de entrega, DNI y los datos de facturación (CUIT y condición frente al IVA si pedís factura A). Estos datos son obligatorios para procesar, entregar y facturar el pedido.',
          'Pago por transferencia: el comprobante que subís y el nombre del titular de la cuenta de origen.',
          'Reseñas, favoritos y suscripción al boletín, si los usás.',
          'Navegación: páginas visitadas y acciones dentro del sitio (ver un producto, agregar al carrito, comprar), según se detalla más abajo.',
        ] },
      ]],
      ['Para qué los usamos', { list: [
        'Procesar, entregar y facturar tu compra, y atender consultas, cambios, devoluciones y garantías.',
        'Administrar tu cuenta y mantener tu sesión iniciada.',
        'Enviarte correos sobre tu pedido (confirmación, pago, envío) y, después de la entrega, una invitación a dejar una reseña.',
        'Enviarte novedades y promociones solo si te suscribiste al boletín. Podés darte de baja en cualquier momento escribiéndonos a ' + legal.email + '.',
        'Medir el uso del sitio y el resultado de nuestra publicidad, y mostrarte anuncios más relevantes en Facebook e Instagram.',
        'Cumplir obligaciones legales, en particular fiscales.',
      ] }],
      ['Con quién los compartimos', [
        'No vendemos ni alquilamos tus datos. Los compartimos únicamente con los proveedores que necesitamos para operar, y solo lo necesario en cada caso:',
        { list: [
          'Mercado Pago (Mercado Libre S.R.L.), que procesa el pago. Nunca vemos ni guardamos los datos de tu tarjeta: los ingresás directamente en la plataforma de Mercado Pago, bajo su propia política de privacidad.',
          'Los transportistas (Andreani, Correo Argentino u otros) reciben tu nombre, domicilio y teléfono para entregar el paquete.',
          'ARCA (ex AFIP), a quien se transmiten los datos de facturación para emitir la factura electrónica, como exige la ley.',
          'Meta Platforms (Facebook e Instagram), a través del Píxel de Meta, según se explica en la sección siguiente.',
          'Google, como proveedor del servicio de correo con el que enviamos los mails, de las tipografías del sitio, del inicio de sesión con Google (si lo usás) y de las reseñas de Google que mostramos.',
          'El proveedor de alojamiento donde corre el sitio y su base de datos.',
        ] },
        'Estos proveedores pueden estar ubicados fuera de la Argentina. En ese caso la transferencia se realiza a países o empresas con un nivel de protección adecuado o con las garantías contractuales que exige la ley.',
      ]],
      ['Cookies y tecnologías similares', [
        'El sitio usa:',
        { list: [
          'Una cookie propia de sesión (`fenix_session`) para mantenerte identificado cuando iniciás sesión. Dura 30 días y no se comparte con nadie.',
          'Almacenamiento local del navegador para recordar tu carrito y el acceso a tus pedidos entre visitas. Esa información no sale de tu dispositivo.',
          'Las cookies del Píxel de Meta (`_fbp` y `_fbc`), descriptas a continuación.',
        ] },
        'No usamos Google Analytics ni otras herramientas de analítica de terceros. Podés borrar o bloquear las cookies desde la configuración de tu navegador; si bloqueás la de sesión no vas a poder mantener la sesión iniciada.',
      ]],
      ['Píxel de Meta (Facebook e Instagram)', [
        'Usamos el Píxel de Meta, una herramienta de Meta Platforms, Inc., para medir el resultado de nuestra publicidad en Facebook e Instagram y para mostrar anuncios a personas que visitaron el sitio. El píxel registra las páginas que visitás y ciertas acciones: ver un producto, agregarlo al carrito, iniciar el pago y completar una compra, junto con el producto, el importe y la moneda. Meta recibe además tu dirección IP, datos de tu navegador y sus cookies.',
        'Cuando completás el checkout, el píxel puede enviar a Meta tu correo electrónico y teléfono en forma cifrada (hash) para asociar la compra a una cuenta de Facebook o Instagram y medir mejor los anuncios. Meta no puede leer esos datos si no coinciden con una cuenta existente.',
        'Meta trata esta información como responsable independiente bajo su propia [Política de privacidad](https://www.facebook.com/privacy/policy). Podés limitar el uso de tus datos con fines publicitarios desde la configuración de anuncios de tu cuenta de Facebook e Instagram ([Tu actividad fuera de Meta](https://www.facebook.com/off_facebook_activity)) y bloquear las cookies del píxel desde tu navegador.',
      ]],
      ['Estadísticas propias del sitio', 'Para saber qué páginas se visitan más, guardamos por cada visita la ruta, el sitio desde el que llegaste y un identificador anónimo que cambia todos los días y no permite reconstruir tu dirección IP. No guardamos la IP ni usamos cookies para esto. Estos registros se borran a los 180 días.'],
      ['Cuánto tiempo conservamos tus datos', { list: [
        'Los datos de tus pedidos y facturas, durante el plazo que exigen las normas fiscales y comerciales (10 años).',
        'Los datos de tu cuenta, mientras la cuenta esté activa. Podés pedir que la eliminemos en cualquier momento.',
        'Los comprobantes de transferencia, hasta que el pago se verifica y por el plazo necesario para atender reclamos.',
        'La suscripción al boletín, hasta que te des de baja.',
      ] }],
      ['Seguridad', 'Las conexiones al sitio van cifradas (HTTPS). Las contraseñas se guardan con cifrado irreversible. El acceso a los datos de clientes está restringido al personal que los necesita para atender pedidos. Ningún sistema es infalible; si detectamos un incidente que afecte tus datos, te vamos a avisar.'],
      ['Tus derechos', [
        'Podés pedir en cualquier momento el acceso, la rectificación, la actualización o la supresión de tus datos personales, y oponerte al uso de tus datos para publicidad. Para hacerlo escribinos a ' + legal.email + ' desde el correo con el que te registraste, o presentá una nota en nuestro local. Respondemos en los plazos que fija la ley: 10 días corridos para el acceso y 5 días hábiles para la rectificación o supresión.',
        'El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto, conforme lo establecido en el artículo 14, inciso 3 de la Ley 25.326.',
        'La Agencia de Acceso a la Información Pública, órgano de control de la Ley 25.326, tiene la atribución de atender las denuncias y reclamos que se interpongan con relación al incumplimiento de las normas sobre protección de datos personales. Sitio: [www.argentina.gob.ar/aaip](https://www.argentina.gob.ar/aaip).',
      ]],
      ['Menores de edad', 'El sitio está dirigido a mayores de 18 años. No recopilamos a sabiendas datos de menores. Si creés que un menor nos dio sus datos, escribinos y los eliminamos.'],
      ['Cambios en esta política', 'Podemos actualizar esta política cuando cambie el sitio o la normativa. La fecha de la última actualización figura al inicio. Si el cambio es relevante, lo avisamos en el sitio.'],
    ],
  },

  terms: {
    title: 'Términos y condiciones',
    updated: 'septiembre de 2026',
    sections: [
      ['Quiénes somos', `Este sitio es operado por ${RESPONSABLE}. Podés contactarnos por correo a ${legal.email}, por WhatsApp al ${business.phoneDisplay} o en el local, en el horario de atención (${business.hoursDisplay}).`],
      ['Aceptación', 'Al navegar el sitio, crear una cuenta o realizar una compra aceptás estos términos, la [política de privacidad](/policies/privacy), la [política de envíos](/policies/shipping) y la de [cambios y devoluciones](/policies/refunds). Estas condiciones no limitan los derechos que te reconocen la Ley 24.240 de Defensa del Consumidor y el Código Civil y Comercial; ante cualquier diferencia, prevalece la norma más favorable al consumidor.'],
      ['Cuenta de usuario', 'Podés comprar con o sin cuenta. Si creás una, sos responsable de mantener en reserva tu contraseña y de la actividad que se realice con ella. Los datos que cargás tienen que ser verdaderos y estar actualizados. Podés cerrar tu cuenta cuando quieras escribiéndonos.'],
      ['Productos y precios', [
        'Los precios están expresados en pesos argentinos e incluyen IVA. El precio final es el que se muestra en el checkout al momento de confirmar la compra. Las promociones, cupones y descuentos por medio de pago se aplican según las condiciones informadas en el sitio.',
        'La cantidad de cuotas sin interés depende del banco y la tarjeta, y la define Mercado Pago al momento del pago.',
        'Las fotos son ilustrativas: pueden existir diferencias menores de tono o terminación respecto del producto real. Las especificaciones técnicas (potencia, tensión, temperatura de color, grado de protección) son las que figuran en la ficha del producto.',
        'Si por un error evidente un producto se publicó con un precio manifiestamente incorrecto, te lo comunicamos antes de despachar para que decidas si mantener la compra al precio correcto o recibir el reintegro total.',
      ]],
      ['Cómo se perfecciona la compra', [
        'Al confirmar el pedido recibís un correo con el número de orden. La compra queda perfeccionada cuando se acredita el pago:',
        { list: [
          'Mercado Pago: en el momento en que Mercado Pago aprueba el pago.',
          'Transferencia bancaria: cuando verificamos el ingreso del dinero. El pedido se mantiene reservado durante el plazo que se informa en el checkout; si en ese plazo no recibimos la transferencia, se cancela automáticamente.',
          'Reserva para retiro y pago en el local: cuando pagás en el local en la fecha elegida.',
        ] },
        'Hasta que el pago se acredita no despachamos el pedido ni reservamos el precio de forma indefinida.',
      ]],
      ['Entrega', 'Las condiciones, costos y plazos de envío y retiro están en la [política de envíos](/policies/shipping). El plazo informado es una estimación. Sos responsable de que el domicilio y los datos de contacto sean correctos.'],
      ['Derecho de arrepentimiento', 'Tenés derecho a revocar la compra sin expresar causa dentro de los 10 días corridos desde la entrega, sin costo, mediante el [botón de arrepentimiento](/arrepentimiento). Los gastos de devolución son a nuestro cargo. El detalle está en la [política de cambios y devoluciones](/policies/refunds).'],
      ['Garantía', 'Los productos nuevos tienen garantía legal de 6 meses desde la entrega (artículo 11 de la Ley 24.240), sin perjuicio de la garantía del fabricante. Ante una falla, se repara, se reemplaza o se reintegra el importe, a tu elección dentro de lo que permite la ley. No cubre daños por instalación incorrecta, uso indebido ni sobretensiones eléctricas.'],
      ['Facturación', 'Emitimos factura electrónica por cada compra. Si necesitás factura A, tenés que indicarlo en el checkout y cargar el CUIT y la condición frente al IVA; de lo contrario se emite factura B o C a consumidor final con el DNI informado. La factura se envía por correo electrónico y queda disponible en tu pedido.'],
      ['Reseñas', 'Podés dejar una reseña de un producto que compraste y recibiste. No publicamos reseñas ofensivas, que contengan datos personales de terceros o publicidad. Nos reservamos el derecho de no publicar o retirar una reseña que incumpla estas condiciones. Las reseñas de Google que se muestran en el sitio provienen de Google y se rigen por sus términos.'],
      ['Propiedad intelectual', 'El diseño del sitio, los textos, las fotos propias y la marca "Fénix Electricidad e Iluminación" son de nuestra propiedad o de nuestros licenciantes. Las marcas y fotos de los productos pertenecen a sus fabricantes. No está permitido reproducirlos sin autorización.'],
      ['Defensa del consumidor', `Ante cualquier reclamo podés escribirnos a ${legal.email}. Si no lo resolvemos, podés presentar tu reclamo ante la [Ventanilla Única Federal de Defensa del Consumidor](${legal.consumerDefenseUrl}) o ante la autoridad de aplicación de tu provincia o municipio.`],
      ['Ley aplicable y jurisdicción', 'Estos términos se rigen por las leyes de la República Argentina. Para cualquier controversia son competentes los tribunales del domicilio del consumidor, conforme al artículo 36 de la Ley 24.240.'],
      ['Cambios', 'Podemos modificar estos términos. Los cambios rigen desde su publicación en el sitio y no afectan las compras ya realizadas. La fecha de la última actualización figura al inicio.'],
    ],
  },
}

export default function Policy() {
  const { slug } = useParams()
  const policy = POLICIES[slug]
  if (!policy) return <Navigate to="/" replace />

  return (
    <>
      <PageSEO title={policy.title} description={`${policy.title} de ${business.name}.`} url={`/policies/${slug}`} />
      <main className="fnx-policy-page">
        <Link to="/" className="fnx-policy-back">← Volver al inicio</Link>
        <h1>{policy.title}</h1>
        <p className="fnx-policy-updated">Última actualización: {policy.updated}</p>
        {policy.sections.map(([title, body]) => (
          <section key={title}>
            <h2>{title}</h2>
            <PolicyBody body={body} />
          </section>
        ))}
      </main>
    </>
  )
}
