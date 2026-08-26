import { useAdmin } from '../context/AdminContext'
import ProductCard from '../components/ProductCard'
import PageSEO from '../components/SEO'

// Antes esta página era "Productos a pedido" y listaba lo que NO había —
// una página que nadie quiere visitar. Con el modelo de disponibilidad nuevo
// muestra lo contrario, que es lo que sí vende: lo que está en el local y sale
// para el correo enseguida.
export default function EntregaInmediata() {
  const { products } = useAdmin()

  const disponibles = products.filter((p) => p.stockInmediato)

  return (
    <>
      <PageSEO
        title="Entrega inmediata"
        description="Productos que Fénix Iluminación tiene en el local y despacha enseguida, sin esperar reposición del proveedor."
        url="/entrega-inmediata"
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
            Entrega inmediata
          </h1>
          <p style={{
            textAlign: 'center', color: 'var(--color-text-muted)',
            maxWidth: '38rem', margin: '0 auto 2.5rem',
          }}>
            Estos productos están en el local ahora mismo: los preparamos y los despachamos sin esperar la reposición del proveedor.
          </p>

          {disponibles.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
              Por ahora no hay productos marcados con entrega inmediata.
            </p>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 28,
            }}>
              {disponibles.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
