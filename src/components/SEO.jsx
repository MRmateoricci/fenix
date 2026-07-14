import { Helmet } from 'react-helmet-async'
import { SEO as cfg } from '../config/seo'

export default function PageSEO({ title, description, url, image, schema }) {
  const fullTitle  = title ? `${title} — Fénix Iluminación` : cfg.siteName
  const desc       = description || cfg.description
  const canonical  = url ? `${cfg.siteUrl}${url}` : cfg.siteUrl
  const ogImg      = image || cfg.ogImage

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <link rel="canonical" href={canonical} />

      <meta property="og:type"        content="website" />
      <meta property="og:site_name"   content={cfg.siteName} />
      <meta property="og:title"       content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:image"       content={ogImg} />
      <meta property="og:url"         content={canonical} />
      <meta property="og:locale"      content="es_AR" />

      <meta name="twitter:card"        content="summary_large_image" />
      <meta name="twitter:title"       content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image"       content={ogImg} />

      {schema && (
        <script type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      )}
    </Helmet>
  )
}
