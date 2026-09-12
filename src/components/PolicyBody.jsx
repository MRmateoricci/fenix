import { Link } from 'react-router-dom'

// Cuerpo de una sección de política, compartido entre la página /policies/:slug
// y el modal del checkout. Los dos leen el mismo objeto POLICIES; si cada uno
// renderizara a su manera, el cliente leería dos versiones del mismo texto.
//
// El cuerpo puede ser un string (un párrafo) o una lista de bloques: strings
// (párrafos) y objetos `{ list: [...] }` (viñetas). Dentro de cualquier texto
// se admiten links con la forma `[texto](url)`: los que empiezan con "/" son
// rutas internas y navegan con React Router; el resto abre en otra pestaña.

const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g

function renderInline(text) {
  const parts = []
  let last = 0
  for (const match of text.matchAll(LINK_RE)) {
    const [raw, label, href] = match
    if (match.index > last) parts.push(text.slice(last, match.index))
    parts.push(
      href.startsWith('/')
        ? <Link key={match.index} to={href}>{label}</Link>
        : <a key={match.index} href={href} target="_blank" rel="noopener noreferrer">{label}</a>
    )
    last = match.index + raw.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

export default function PolicyBody({ body }) {
  const blocks = Array.isArray(body) ? body : [body]
  return blocks.map((block, index) => {
    if (typeof block === 'string') return <p key={index}>{renderInline(block)}</p>
    if (block?.list) {
      return (
        <ul key={index}>
          {block.list.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}
        </ul>
      )
    }
    return null
  })
}
