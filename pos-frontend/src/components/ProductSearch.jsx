import { useEffect, useRef, useState } from 'react'
import { useProductCatalog } from '../hooks/useProductCatalog'
import { api } from '../services/api'

const money = value => Number(value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })

export default function ProductSearch({ onSelect, focusToken }) {
  const { ready, searchLocal } = useProductCatalog()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [focusToken])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    if (ready) {
      setResults(searchLocal(query))
      setActiveIndex(0)
      return
    }

    // Fallback de servidor: solo mientras el cache local todavía no bajó.
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const { products } = await api.search(query)
        setResults(products)
        setActiveIndex(0)
      } catch {
        setResults([])
      }
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query, ready, searchLocal])

  function selectResult(product) {
    if (!product) return
    onSelect(product)
    setQuery('')
    setResults([])
    inputRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (!results.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      selectResult(results[activeIndex])
    }
  }

  return (
    <div className="flex h-full flex-col p-4">
      <input
        ref={inputRef}
        autoFocus
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Buscar por nombre o código..."
        className="mb-1 w-full rounded-lg border border-slate-300 px-4 py-3 text-xl focus:border-slate-500 focus:outline-none"
      />
      <p className="mb-3 h-4 text-xs text-slate-400">
        {!ready && 'Cargando catálogo... buscando en el servidor mientras tanto'}
      </p>
      <div className="flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white">
        {results.length === 0 && query.trim() && <p className="p-4 text-slate-400">Sin resultados</p>}
        {results.map((product, index) => (
          <button
            key={product.id}
            type="button"
            onClick={() => selectResult(product)}
            onMouseEnter={() => setActiveIndex(index)}
            className={`flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left ${
              index === activeIndex ? 'bg-slate-100' : 'hover:bg-slate-50'
            }`}
          >
            <div>
              <p className="font-medium text-slate-800">{product.nombre}</p>
              <p className="text-sm text-slate-400">{product.codigo}</p>
            </div>
            <div className="text-right">
              {product.precio == null ? (
                <p className="font-semibold text-red-600">Sin precio</p>
              ) : (
                <p className="font-semibold text-slate-800">{money(product.precio)}</p>
              )}
              <p className={`text-xs ${product.stock > 0 ? 'text-slate-400' : 'text-amber-600'}`}>
                {product.stock > 0 ? `Stock: ${product.stock}` : 'Sin stock'}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
