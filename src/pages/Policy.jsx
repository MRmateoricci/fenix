import { Link, Navigate, useParams } from 'react-router-dom'
import PageSEO from '../components/SEO'

export const POLICIES = {
  refunds: {
    title: 'Política de reembolso',
    sections: [
      ['Cambios y devoluciones', 'Podés solicitar un cambio o devolución dentro de los 10 días corridos desde que recibiste la compra. El producto debe conservar su embalaje, accesorios y condiciones originales.'],
      ['Productos con fallas', 'Si el producto presenta una falla, escribinos con el número de pedido y fotos para que podamos evaluar el caso y ofrecerte una solución.'],
      ['Reintegros', 'Una vez aprobada la devolución, el reintegro se realiza por el mismo medio de pago. Los tiempos de acreditación dependen de Mercado Pago y de la entidad emisora.'],
    ],
  },
  shipping: {
    title: 'Política de envíos',
    sections: [
      ['Envíos a domicilio', 'El costo y la fecha estimada se calculan con el código postal antes de pagar. La estimación puede variar por disponibilidad, clima o demoras del operador logístico.'],
      ['Retiro en el local', 'El retiro es gratuito en nuestro local de City Bell. Te avisaremos cuando el pedido esté listo; presentá tu DNI y el número de pedido.'],
      ['Recepción', 'Revisá el estado del paquete al recibirlo. Si observás daños visibles, dejá constancia y contactanos cuanto antes.'],
    ],
  },
  privacy: {
    title: 'Política de privacidad',
    sections: [
      ['Datos que usamos', 'Solicitamos únicamente la información necesaria para identificarte, procesar el pago, entregar tu compra y brindarte atención posventa.'],
      ['Protección y terceros', 'No vendemos tus datos. Solo los compartimos con proveedores indispensables para el pago, la logística y el funcionamiento seguro del sitio.'],
      ['Tus derechos', 'Podés pedir acceso, corrección o eliminación de tus datos comunicándote con Fénix Electricidad e Iluminación.'],
    ],
  },
  terms: {
    title: 'Términos del servicio',
    sections: [
      ['Compras', 'La compra queda confirmada cuando Mercado Pago aprueba el pago. Si hubiera un error de stock o precio, te contactaremos para ofrecerte una alternativa o el reintegro total.'],
      ['Precios y disponibilidad', 'Los precios se expresan en pesos argentinos e incluyen impuestos. La disponibilidad puede cambiar hasta que el pedido quede confirmado.'],
      ['Contacto', 'Para consultas sobre estos términos, escribinos por WhatsApp o acercate a nuestro local de City Bell, La Plata.'],
    ],
  },
}

export default function Policy() {
  const { slug } = useParams()
  const policy = POLICIES[slug]
  if (!policy) return <Navigate to="/" replace />

  return (
    <>
      <PageSEO title={policy.title} description={`Información sobre ${policy.title.toLowerCase()} de Fénix Iluminación.`} url={`/policies/${slug}`} />
      <main className="fnx-policy-page">
        <Link to="/" className="fnx-policy-back">← Volver al inicio</Link>
        <h1>{policy.title}</h1>
        <p className="fnx-policy-updated">Última actualización: agosto de 2026</p>
        {policy.sections.map(([title, body]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </section>
        ))}
      </main>
    </>
  )
}
