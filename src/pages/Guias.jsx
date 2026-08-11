import PageSEO from '../components/SEO'

const T = {
  paper:    '#F7F4EF',
  panel:    '#FBF8F3',
  surface2: '#EDE9E2',
  ink:      '#16110B',
  ink2:     '#2A2118',
  muted:    '#8A8175',
  muted2:   '#9A917F',
  hairline: '#DED6C7',
  red:      '#CC0000',
}

export default function Guias() {
  return (
    <>
      <PageSEO
        title="Guías de iluminación — Lúmenes, temperatura de color y grado IP"
        description="Guías prácticas para elegir la iluminación correcta: cuántos lúmenes necesitás, diferencias entre luz cálida y fría, y qué grado IP usar en exteriores."
        url="/guias"
      />

      <div style={{ background: T.paper, minHeight: '100vh' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 40px 100px' }}>

          {/* Header */}
          <div style={{ marginBottom: 64 }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: T.muted2, display: 'block', marginBottom: 14 }}>
              Guías de iluminación
            </span>
            <h1 style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'clamp(38px, 5vw, 64px)', fontWeight: 400,
              lineHeight: 1.0, letterSpacing: '-.01em',
              color: T.ink, margin: 0,
            }}>
              Todo lo que necesitás saber antes de comprar
            </h1>
          </div>

          {/* Guía 1 — Lúmenes */}
          <GuiaSection
            number="01"
            title="¿Cuántos lúmenes necesito?"
            intro="Los lúmenes (lm) miden el flujo luminoso total. A diferencia de los watts, los lúmenes indican cuánta luz produce realmente una lámpara."
          >
            <TablaLumenes />
            <p style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14, lineHeight: 1.72, color: '#5A5248', marginTop: 24 }}>
              <strong>Consejo:</strong> Para calcular el total del ambiente, multiplicá los lm/m² recomendados por la superficie en metros cuadrados. Un dormitorio de 12 m² necesita entre 1 800 y 3 600 lm totales, que podés repartir entre distintos puntos de luz.
            </p>
          </GuiaSection>

          <Divider />

          {/* Guía 2 — Temperatura */}
          <GuiaSection
            number="02"
            title="Temperatura de color: cálido, neutro o frío"
            intro="La temperatura de color se mide en Kelvin (K). Define si la luz parece amarilla/cálida o blanca/fría. No tiene nada que ver con el calor físico que emite la lámpara."
          >
            <TablaTemperatura />
            <p style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14, lineHeight: 1.72, color: '#5A5248', marginTop: 24 }}>
              <strong>Regla rápida:</strong> Ambientes de descanso y vida → luz cálida. Cocina, baño, escritorio → luz neutra. Garaje, taller, fachada → luz fría. Podés mezclar temperaturas en el mismo ambiente usando circuitos separados o lámparas regulables.
            </p>
          </GuiaSection>

          <Divider />

          {/* Guía 3 — IP */}
          <GuiaSection
            number="03"
            title="Grado IP: protección para exteriores"
            intro="Las siglas IP (Ingress Protection) seguidas de dos dígitos indican el nivel de protección de una luminaria contra sólidos (polvo) y líquidos (agua). Es fundamental para exteriores."
          >
            <TablaIP />
            <p style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14, lineHeight: 1.72, color: '#5A5248', marginTop: 24 }}>
              <strong>Para tener en cuenta:</strong> Si la luminaria queda bajo lluvia directa, siempre IP65 o superior. Para piscinas o jardines con riego, IP67. Una luminaria interior sin IP no debe usarse en exteriores aunque esté bajo techo.
            </p>
          </GuiaSection>

          {/* CTA */}
          <div style={{
            marginTop: 64, padding: '40px',
            background: '#14100A', borderRadius: 3, textAlign: 'center',
          }}>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 26, fontWeight: 400, color: '#F2EBDC', margin: '0 0 10px' }}>
              ¿Todavía tenés dudas?
            </p>
            <p style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14, color: '#A99E8B', margin: '0 0 24px' }}>
              Pasá por el local o escribinos — te asesoramos sin compromiso.
            </p>
            <a
              href="https://wa.me/5492216007560?text=Hola!%20Quiero%20consultar%20sobre%20iluminaci%C3%B3n"
              target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '13px 30px', borderRadius: 2,
                background: '#1f7a3d', color: '#fff',
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 13, fontWeight: 500, textDecoration: 'none',
                transition: 'background .15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#176832')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#1f7a3d')}
            >
              Consultá por WhatsApp
            </a>
          </div>
        </div>
      </div>
    </>
  )
}

function GuiaSection({ number, title, intro, children }) {
  return (
    <section style={{ marginBottom: 0 }}>
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
        <span style={{
          fontFamily: "var(--font-sans)",
          fontSize: 11, color: T.red, letterSpacing: '.1em',
          paddingTop: 8, flexShrink: 0,
        }}>
          {number}
        </span>
        <div style={{ flex: 1 }}>
          <h2 style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'clamp(26px, 3vw, 36px)', fontWeight: 600,
            color: T.ink, margin: '0 0 16px',
          }}>
            {title}
          </h2>
          <p style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 15, lineHeight: 1.72, color: '#5A5248', margin: '0 0 28px',
          }}>
            {intro}
          </p>
          {children}
        </div>
      </div>
    </section>
  )
}

function Divider() {
  return <div style={{ height: 1, background: T.hairline, margin: '56px 0' }} />
}

function TablaLumenes() {
  const rows = [
    { ambiente: 'Dormitorio',         rango: '150–300 lm/m²', nota: 'Luz ambiental suave' },
    { ambiente: 'Sala de estar',      rango: '200–400 lm/m²', nota: 'Combinar general + lámparas' },
    { ambiente: 'Cocina',             rango: '300–500 lm/m²', nota: 'Iluminación de tarea' },
    { ambiente: 'Baño',               rango: '300–500 lm/m²', nota: 'Espejo bien iluminado' },
    { ambiente: 'Oficina / escritorio', rango: '400–700 lm/m²', nota: 'Evitar reflejos en pantalla' },
    { ambiente: 'Garaje / depósito',  rango: '300–500 lm/m²', nota: 'Luz fría preferible' },
    { ambiente: 'Pasillo',            rango: '100–200 lm/m²', nota: 'Sensores de movimiento' },
  ]
  return <TablaBase headers={['Ambiente', 'Recomendado', 'Nota']} rows={rows.map(r => [r.ambiente, r.rango, r.nota])} />
}

function TablaTemperatura() {
  const rows = [
    ['2 700 K', 'Blanca cálida', 'Dormitorio, living, restorán', 'Ambiente íntimo'],
    ['3 000 K', 'Cálida suave',  'Living, habitación, hotelería', 'Muy versátil'],
    ['3 500 K', 'Blanca neutra', 'Cocina, baño, tiendas',         'Natural sin frialdad'],
    ['4 000 K', 'Blanca día',    'Oficina, cocina, consultorio',  'Concentración'],
    ['5 000 K', 'Blanca brillante', 'Taller, garaje, exposición', 'Alta visibilidad'],
    ['6 500 K', 'Luz de día',    'Fachada, cancha, depósito',     'Efecto diurno'],
  ]
  return <TablaBase headers={['Kelvin', 'Tono', 'Uso ideal', 'Efecto']} rows={rows} />
}

function TablaIP() {
  const rows = [
    ['IP20', 'Sin protección agua', 'Interior seco',            'Living, dormitorio, oficina'],
    ['IP44', 'Salpicaduras',        'Exterior cubierto',        'Galería, pérgola, baño'],
    ['IP54', 'Polvo + salpicaduras','Exterior semi-expuesto',   'Entrada, garaje abierto'],
    ['IP65', 'Chorro de agua',      'Exterior directo',         'Jardín, fachada, balcón'],
    ['IP67', 'Inmersión temporal',  'Zona húmeda / agua',       'Junto a pileta, maceta'],
  ]
  return <TablaBase headers={['Grado IP', 'Protección', 'Contexto', 'Ejemplos']} rows={rows} />
}

function TablaBase({ headers, rows }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13.5 }}>
        <thead>
          <tr style={{ background: T.surface2 }}>
            {headers.map(h => (
              <th key={h} style={{
                padding: '10px 16px', textAlign: 'left',
                fontFamily: "var(--font-sans)",
                fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase',
                color: T.muted2, fontWeight: 400,
                borderBottom: `2px solid ${T.hairline}`,
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? T.panel : T.paper }}>
              {row.map((cell, j) => (
                <td key={j} style={{
                  padding: '11px 16px', color: j === 0 ? T.ink : '#5A5248',
                  fontWeight: j === 0 ? 500 : 400,
                  borderBottom: `1px solid ${T.hairline}`,
                }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
