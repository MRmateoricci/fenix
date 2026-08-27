import { useState } from 'react'
import PageSEO from '../components/SEO'

const T = {
  paper:          '#F7F4EF',
  panel:          '#FBF8F3',
  ink:            '#16110B',
  ink2:           '#2A2118',
  muted:          '#8A8175',
  muted2:         '#9A917F',
  hairline:       '#DED6C7',
  hairlineStrong: '#C9BFAF',
  red:            '#CC0000',
  surface2:       '#EDE9E2',
}

const FAQS = [
  {
    section: 'Sobre los productos',
    items: [
      {
        q: '¿Cuántos lúmenes necesito para iluminar una habitación?',
        a: 'Depende del tipo de ambiente. Como guía general: dormitorios 150–300 lm/m², salas de estar 200–400 lm/m², cocinas y baños 300–500 lm/m², zonas de trabajo 400–700 lm/m². Un cuarto de 15 m² necesita entre 2 250 y 4 500 lm totales. Pasá por el local y te ayudamos a calcular el proyecto completo.',
      },
      {
        q: '¿Qué diferencia hay entre luz cálida, neutra y fría?',
        a: 'Se mide en Kelvin (K). Luz cálida (2 700–3 000 K): color amarillado, ideal para dormitorios, livings y ambientes de descanso. Luz neutra (3 500–4 000 K): blanco natural, recomendada para cocinas, baños y oficinas. Luz fría (5 000–6 500 K): blanco azulado, para talleres, garajes o iluminación de fachadas.',
      },
      {
        q: '¿Qué significa el grado IP de una luminaria?',
        a: 'IP (Ingress Protection) indica el nivel de protección contra polvo y agua. El primer dígito es polvo (0–6) y el segundo es agua (0–9). Para exteriores bajo lluvia directa recomendamos mínimo IP65. Patios cubiertos: IP44. Interior seco: IP20 es suficiente.',
      },
      {
        q: '¿Las tiras LED se pueden cortar a medida?',
        a: 'Sí. Las tiras LED tienen marcas de corte cada ciertos centímetros (generalmente cada 5 cm). Se cortan con tijera o cúter en esas marcas sin dañar el resto de la tira. El largo de corte mínimo depende del fabricante y el tipo de tira.',
      },
      {
        q: '¿Cuánto dura una lámpara LED?',
        a: 'Las LEDs de buena calidad tienen una vida útil de 25 000 a 50 000 horas. Usándola 6 horas diarias, eso equivale a más de 10 años. Ofrecemos garantía de fábrica en todos los productos que comercializamos.',
      },
    ],
  },
  {
    section: 'Sobre la compra',
    items: [
      {
        q: '¿Hacen envíos a La Plata y alrededores?',
        a: 'Sí. Hacemos envíos a La Plata, City Bell, Gonnet, Villa Elisa, Ringuelet, Tolosa y alrededores. El costo y tiempo de entrega se confirman al finalizar el pedido, según volumen y dirección. También podés retirar sin cargo en el local.',
      },
      {
        q: '¿Puedo retirar el pedido en el local?',
        a: 'Sí, retiro en local es siempre gratuito. Nuestro local está en C. Cantilo 745, City Bell, La Plata. Abrimos de lunes a viernes de 8 a 18 hs corrido, y los sábados de 9 a 14 hs.',
      },
      {
        id: 'medios-de-pago',
        q: '¿Cuáles son los medios de pago?',
        a: 'En el checkout podés pagar con Mercado Pago o, cuando esté habilitada, por transferencia bancaria con 10% de descuento sobre los productos. El pedido queda pendiente hasta que cargues el comprobante y verifiquemos el ingreso.',
      },
      {
        q: '¿Puedo hacer consultas antes de comprar?',
        a: 'Sí, y te lo recomendamos. Podés escribirnos por WhatsApp, llamarnos al 221-600-7560 o pasar directamente al local. Tenemos personal capacitado para asesorarte en iluminación, instalaciones eléctricas y domótica.',
      },
      {
        q: '¿Hacen proyectos de iluminación para obras o remodelaciones?',
        a: 'Sí. Trabajamos con arquitectos, decoradores y particulares en proyectos de iluminación. Podemos asesorarte en la selección de productos, calcular cantidades y presupuestar por proyecto. Consultanos por WhatsApp o visitá el local.',
      },
    ],
  },
]

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.flatMap(s =>
    s.items.map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    }))
  ),
}

export default function FAQ() {
  const [open, setOpen] = useState(null)

  const toggle = (key) => setOpen(prev => prev === key ? null : key)

  return (
    <>
      <PageSEO
        title="Preguntas frecuentes — Iluminación y electricidad"
        description="Respondemos las dudas más comunes sobre lúmenes, temperatura de color, grado IP, envíos y medios de pago en Fénix Iluminación, City Bell."
        url="/faq"
        schema={faqSchema}
      />

      <div style={{ background: T.paper, minHeight: '100vh' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '72px 40px 100px' }}>

          {/* Header */}
          <div style={{ marginBottom: 64 }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: T.muted2, display: 'block', marginBottom: 14 }}>
              FAQ
            </span>
            <h1 style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'clamp(38px, 5vw, 64px)', fontWeight: 400,
              lineHeight: 1.0, letterSpacing: '-.01em',
              color: T.ink, margin: 0,
            }}>
              Preguntas frecuentes
            </h1>
          </div>

          {/* Sections */}
          {FAQS.map(section => (
            <div key={section.section} style={{ marginBottom: 56 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
                <h2 style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase',
                  color: T.muted2, margin: 0, whiteSpace: 'nowrap',
                }}>
                  {section.section}
                </h2>
                <div style={{ flex: 1, height: 1, background: T.hairline }} />
              </div>

              <div style={{ border: `1px solid ${T.hairline}`, borderRadius: 3, overflow: 'hidden' }}>
                {section.items.map((item, i) => {
                  const key = `${section.section}-${i}`
                  const isOpen = open === key
                  return (
                    <div
                      key={key}
                      id={item.id}
                      style={{
                        borderBottom: i < section.items.length - 1 ? `1px solid ${T.hairline}` : 'none',
                        scrollMarginTop: item.id ? 100 : undefined,
                      }}
                    >
                      <button
                        onClick={() => toggle(key)}
                        style={{
                          width: '100%', textAlign: 'left',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                          gap: 16, padding: '20px 24px',
                          background: isOpen ? T.surface2 : T.panel,
                          border: 'none', cursor: 'pointer',
                          transition: 'background .15s',
                        }}
                        onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.background = '#F0EBE1' }}
                        onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.background = T.panel }}
                        aria-expanded={isOpen}
                      >
                        <span style={{
                          fontFamily: "'Inter', system-ui, sans-serif",
                          fontSize: 15, fontWeight: 500, color: T.ink, lineHeight: 1.45,
                        }}>
                          {item.q}
                        </span>
                        <svg
                          width="16" height="16" viewBox="0 0 24 24" fill="none"
                          stroke={T.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                          style={{ flexShrink: 0, marginTop: 3, transition: 'transform .2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>

                      {isOpen && (
                        <div style={{ padding: '0 24px 22px 24px', background: T.surface2 }}>
                          <p style={{
                            fontFamily: "'Inter', system-ui, sans-serif",
                            fontSize: 14.5, lineHeight: 1.72,
                            color: '#5A5248', margin: 0,
                          }}>
                            {item.a}
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* CTA */}
          <div style={{
            marginTop: 16, padding: '32px', background: T.panel,
            border: `1px solid ${T.hairline}`, borderRadius: 3, textAlign: 'center',
          }}>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 22, fontWeight: 400, color: T.ink, margin: '0 0 16px' }}>
              ¿No encontraste lo que buscabas?
            </p>
            <a
              href="https://wa.me/5492216007560?text=Hola!%20Tengo%20una%20consulta"
              target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '12px 28px', borderRadius: 2,
                background: '#1f7a3d', color: '#fff',
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 13, fontWeight: 500, textDecoration: 'none',
                transition: 'background .15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#176832')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#1f7a3d')}
            >
              Preguntanos por WhatsApp
            </a>
          </div>
        </div>
      </div>
    </>
  )
}
