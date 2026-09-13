// Búsqueda de productos en la tienda (desplegable del navbar y catálogo).
//
// La búsqueda es deliberadamente abierta: el cliente escribe rápido, sin tildes
// y en cualquier orden ("lampara 22w" tiene que encontrar "Lámpara grande
// cálida 22W"). Por eso se normaliza texto de los dos lados, se compara palabra
// por palabra sin exigir que estén juntas, y si ninguna coincidencia cumple con
// todas las palabras se muestran las parciales antes que una pantalla vacía.

// Campos donde se busca, en orden de importancia. El nombre pesa más que el
// resto porque es lo que el cliente ve en la tarjeta y reconoce como "lo que
// buscaba".
const NAME_WEIGHT = 3
const SECONDARY_FIELDS = ['category', 'subcategory', 'productType', 'material', 'description']

// Minúsculas, sin tildes ni diéresis, signos convertidos a espacio.
// "Lámpara LED A60 E27 -6W/9W/12W" → "lampara led a60 e27 6w 9w 12w"
export function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()
}

export function tokenize(query) {
  const text = normalizeText(query)
  return text ? text.split(' ') : []
}

// Variantes de una palabra que se aceptan como coincidencia: la palabra tal
// cual y, si termina en plural, su singular. Así "lamparas" encuentra
// "lámpara" y "dicroicas" encuentra "dicroica" sin un diccionario.
function tokenVariants(token) {
  const variants = [token]
  if (token.length > 4 && token.endsWith('es')) variants.push(token.slice(0, -2))
  if (token.length > 3 && token.endsWith('s')) variants.push(token.slice(0, -1))
  return variants
}

function fieldContains(haystack, token) {
  if (!haystack) return false
  return tokenVariants(token).some(v => haystack.includes(v))
}

// Puntaje de un producto para una consulta. 0 = ninguna palabra coincide.
// Devuelve además cuántas palabras coincidieron para separar coincidencias
// completas de parciales.
export function scoreProduct(product, tokens) {
  if (tokens.length === 0) return { score: 0, matched: 0 }
  const name = normalizeText(product?.name)
  const secondary = normalizeText(SECONDARY_FIELDS.map(f => product?.[f]).filter(Boolean).join(' '))

  let score = 0
  let matched = 0
  for (const token of tokens) {
    if (fieldContains(name, token)) {
      matched++
      score += NAME_WEIGHT
      // Palabra entera en el nombre vale más que un fragmento ("led" dentro de "ledvance").
      if (name.split(' ').some(word => tokenVariants(token).includes(word))) score += 1
    } else if (fieldContains(secondary, token)) {
      matched++
      score += 1
    }
  }
  // Empate: la consulta completa seguida en el nombre gana ("dicroica calida").
  if (matched === tokens.length && tokens.length > 1 && name.includes(tokens.join(' '))) score += 2
  return { score, matched }
}

// Devuelve los productos que coinciden con la consulta, ordenados por
// relevancia. Si algún producto coincide con todas las palabras se devuelven
// sólo esos; si ninguno lo hace, se devuelven las coincidencias parciales
// (las que más palabras cumplen primero) para que la búsqueda nunca quede vacía
// mientras haya algo remotamente parecido.
export function searchProducts(products, query) {
  const tokens = tokenize(query)
  if (tokens.length === 0) return products
  const scored = []
  products.forEach((product, index) => {
    const { score, matched } = scoreProduct(product, tokens)
    if (matched > 0) scored.push({ product, score, matched, index })
  })
  const hasFull = scored.some(s => s.matched === tokens.length)
  return scored
    .filter(s => !hasFull || s.matched === tokens.length)
    .sort((a, b) => b.matched - a.matched || b.score - a.score || a.index - b.index)
    .map(s => s.product)
}
