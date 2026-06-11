import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'

const fmt = (n) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)

export default function ProductCard({ product }) {
  const { addItem } = useCart()
  const [added, setAdded] = useState(false)

  function handleAdd(e) {
    e.preventDefault()
    e.stopPropagation()
    if (!product.inStock || added) return
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      category: product.category,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  return (
    <Link to={`/products/${product.id}`} className="group block focus:outline-none">
      <article
        className="rounded-lg overflow-hidden transition-colors duration-300 h-full flex flex-col"
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-text-muted)')}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
      >
        {/* Image container */}
        <div
          className="relative overflow-hidden"
          style={{ aspectRatio: '1 / 1', backgroundColor: 'var(--color-surface-2)' }}
        >
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            loading="lazy"
          />

          {/* Category badge */}
          <span
            className="absolute top-3 left-3 px-2.5 py-1 text-[11px] uppercase tracking-wider rounded font-medium"
            style={{ backgroundColor: 'rgba(26,26,20,0.70)', color: '#fff', backdropFilter: 'blur(4px)' }}
          >
            {product.category}
          </span>

          {!product.inStock && (
            <span
              className="absolute top-3 right-3 px-2.5 py-1 text-[11px] uppercase tracking-wider rounded"
              style={{ backgroundColor: 'rgba(20,20,20,0.85)', color: 'var(--color-text-muted)' }}
            >
              Sin stock
            </span>
          )}
        </div>

        {/* Info */}
        <div className="p-4 flex flex-col flex-1">
          <h3
            className="text-sm font-medium leading-snug mb-1.5 line-clamp-2 flex-1"
            style={{ color: 'var(--color-text)' }}
          >
            {product.name}
          </h3>
          <p
            className="text-base font-semibold mb-4"
            style={{ color: 'var(--color-text)' }}
          >
            {fmt(product.price)}
          </p>

          <button
            onClick={handleAdd}
            disabled={!product.inStock || added}
            className="w-full py-2.5 text-sm font-medium rounded tracking-wide transition-all duration-200"
            style={
              added
                ? { backgroundColor: '#166534', color: '#fff', cursor: 'default' }
                : product.inStock
                  ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                  : { backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-muted)', cursor: 'not-allowed' }
            }
            onMouseEnter={(e) => {
              if (product.inStock && !added) {
                e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)'
              }
            }}
            onMouseLeave={(e) => {
              if (product.inStock && !added) {
                e.currentTarget.style.backgroundColor = 'var(--color-primary)'
              }
            }}
          >
            {added ? '✓ Agregado' : product.inStock ? 'Agregar al carrito' : 'Sin stock'}
          </button>
        </div>
      </article>
    </Link>
  )
}
