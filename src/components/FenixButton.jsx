import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function FenixButton({ onClick, href, type = 'button', disabled = false, onDark = false, style }) {
  const [hovered, setHovered] = useState(false)
  const navigate = useNavigate()

  function handleClick(e) {
    if (href) {
      e.preventDefault()
      navigate(href)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    onClick?.()
  }

  const container = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    appearance: 'none',
    WebkitAppearance: 'none',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    textDecoration: 'none',
    outline: 'none',
    borderRadius: 2,
    transition: 'opacity 0.2s ease',
    ...style,
  }

  const logo = (
    <>
      {/* Icono SVG */}
      <svg
        viewBox="0 0 54 40"
        width="54"
        height="40"
        aria-hidden="true"
        style={{
          transform: hovered ? 'scale(1.06)' : 'scale(1)',
          transition: 'transform 0.2s ease',
        }}
      >
        <rect x="6" y="10" width="32" height="20" rx="2" fill="#CC0000" />
        <polygon points="34,10 50,4 50,20 34,20" fill="#CC0000" />
        <polygon points="34,20 50,20 50,36 34,30" fill="#AA0000" />
        <polygon points="21,14 17,22 20,22 16,28 24,20 20,20" fill="white" />
      </svg>

      {/* Texto */}
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <span style={{
          fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
          fontWeight: 800,
          fontSize: 20,
          letterSpacing: '.18em',
          paddingLeft: '.18em',
          color: onDark
            ? (hovered ? '#F2EBDC' : 'rgba(242,235,220,0.85)')
            : (hovered ? '#AA0000' : '#CC0000'),
          transition: 'color 0.2s ease',
        }}>
          FÉNIX
        </span>
        <span style={{
          fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
          fontWeight: 400,
          fontSize: 9,
          letterSpacing: '.06em',
          color: onDark
            ? 'rgba(242,235,220,0.55)'
            : (hovered ? '#1A1614' : '#666'),
          marginTop: 2,
          transition: 'color 0.2s ease',
        }}>
          Electricidad e Iluminación
        </span>
      </div>
    </>
  )

  const handlers = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  }

  if (href) {
    return (
      <a href={href} onClick={handleClick} style={container} {...handlers}>
        {logo}
      </a>
    )
  }

  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={disabled}
      style={container}
      {...handlers}
    >
      {logo}
    </button>
  )
}
