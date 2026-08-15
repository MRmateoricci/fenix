import { useAdmin } from '../context/AdminContext'
import ProductCard from '../components/ProductCard'
import PageSEO from '../components/SEO'

export default function ProductosAPedido() {
  const { products } = useAdmin()

  const productosAPedido = products.filter((p) => p.aPedido)

  return (
    <>
      <PageSEO
        title="Productos a pedido"
        description="Productos que Fénix Iluminación consigue a pedido: consultá disponibilidad y tiempos de entrega."
        url="/productos-a-pedido"
      />
      <div style={{ backgroundColor: 'var(--color-bg)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '78rem', margin: '0 auto', padding: '3rem 1.5rem 6rem' }}>
          <h1
            style={{
              fontFamily: 'var(--font-serif)', color: 'var(--color-text)',
              fontSize: '2.25rem', fontWeight: 400, letterSpacing: '-0.01em',
              textAlign: 'center', marginBottom: '0.75rem',
            }}
          >
            Productos a pedido
          </h1>
          <p style={{
            textAlign: 'center', color: 'var(--color-text-muted)',
            maxWidth: '38rem', margin: '0 auto 2.5rem',
          }}>
            Estos productos no están en stock inmediato: los conseguimos especialmente para vos. Consultanos por WhatsApp para conocer tiempos de entrega.
          </p>

          {productosAPedido.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
              Por ahora no hay productos a pedido disponibles.
            </p>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 28,
            }}>
              {productosAPedido.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
