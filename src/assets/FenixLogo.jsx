export default function FenixLogo({ className = '', onDark = false }) {
  return (
    <div className={`flex items-center gap-2.5 shrink-0 ${className}`}>
      <svg viewBox="0 0 44 44" width="40" height="40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="44" height="44" rx="7" fill="#CC0000" />
        <path
          d="M26 6L13 24h9L14 38l18-18h-9l8-14H26z"
          fill="white"
          strokeLinejoin="round"
        />
      </svg>
      <div>
        <div
          style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: 800,
            fontSize: '17px',
            letterSpacing: '0.12em',
            color: onDark ? '#F2EDE6' : '#1A1A14',
            lineHeight: 1.05,
          }}
        >
          FÉNIX
        </div>
        <div
          style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: 400,
            fontSize: '7.5px',
            letterSpacing: '0.06em',
            color: onDark ? 'rgba(242,237,230,0.50)' : '#7A7468',
            lineHeight: 1.3,
            textTransform: 'uppercase',
          }}
        >
          Electricidad e Iluminación
        </div>
      </div>
    </div>
  )
}
