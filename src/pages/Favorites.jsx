import { useAdmin } from '../context/AdminContext'
import { useFavorites } from '../context/FavoritesContext'
import ProductCard from '../components/ProductCard'
import PageSEO from '../components/SEO'

export default function Favorites() {
  const { products } = useAdmin()
  const { favoriteIds } = useFavorites()

  const favoriteProducts = products.filter((p) => favoriteIds.has(p.id))

  return (
    <>
      <PageSEO title="Mis favoritos" description="Los productos que guardaste en Fénix Iluminación." url="/favorites" />
      <div style={{ backgroundColor: 'var(--color-bg)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '78rem', margin: '0 auto', padding: '3rem 1.5rem 6rem' }}>
          <h1
            style={{
              fontFamily: 'var(--font-serif)', color: 'var(--color-text)',
              fontSize: '2.25rem', fontWeight: 400, letterSpacing: '-0.01em',
              textAlign: 'center', marginBottom: '2.5rem',
            }}
          >
            Mis favoritos
          </h1>

          {favoriteProducts.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
              Todavía no guardaste ningún producto. Tocá el corazón en cualquier producto para agregarlo acá.
            </p>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 28,
            }}>
              {favoriteProducts.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
