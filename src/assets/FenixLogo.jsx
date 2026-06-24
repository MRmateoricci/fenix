export default function FenixLogo({ onDark = false }) {
  const textColor = onDark ? '#F2EBDC' : '#CC0000'
  const subColor  = onDark ? 'rgba(242,235,220,0.6)' : '#444'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      {/* ── Marca gráfica ── */}
      <svg viewBox="0 0 54 40" width="54" height="40" aria-hidden="true">
        {/* Cuerpo central — rectángulo rojo */}
        <rect x="6" y="10" width="32" height="20" rx="2" fill="#CC0000" />
        {/* Ala superior — apunta a la derecha */}
        <polygon points="34,10 50,4 50,20 34,20" fill="#CC0000" />
        {/* Ala inferior */}
        <polygon points="34,20 50,20 50,36 34,30" fill="#AA0000" />
        {/* Rayo / relámpago interno en blanco */}
        <polygon points="21,14 17,22 20,22 16,28 24,20 20,20" fill="white" />
      </svg>

      {/* ── Texto ── */}
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <span style={{
          fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
          fontWeight: 800, fontSize: 20,
          letterSpacing: '.18em', paddingLeft: '.18em',
          color: textColor,
          transition: 'color .3s',
        }}>
          FÉNIX
        </span>
        <span style={{
          fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
          fontWeight: 400, fontSize: 9,
          letterSpacing: '.06em',
          color: subColor,
          transition: 'color .3s',
          marginTop: 2,
        }}>
          Electricidad e Iluminación
        </span>
      </div>
    </div>
  )
}
