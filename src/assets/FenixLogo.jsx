import logo from './logo_fenix-removebg-preview.png'

export default function FenixLogo({ height = 80 }) {
  return (
    <img
      src={logo}
      alt="Fénix Electricidad e Iluminación"
      style={{
        height,
        width: 'auto',
        display: 'block',
        flexShrink: 0,
      }}
    />
  )
}
