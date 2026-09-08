// Telemetría de visitas de la tienda. Reemplaza a un servicio externo (Google
// Analytics / Plausible): el backend guarda cada visita en la tabla page_views
// y el panel la resume en la pestaña "Visitas".
const API_BASE = import.meta.env.VITE_API_URL || ''

// Avisa al backend que se abrió una página. Fire-and-forget: si falla, se
// descarta en silencio — es telemetría, no vale frenar ni molestar al visitante.
// `keepalive` deja que la request termine aunque el visitante ya haya navegado.
// El referrer se manda tal cual lo ve el navegador; el backend se queda solo
// con el host. Las rutas del panel no se registran (acá y también en el server).
export function trackPageView(path) {
  if (typeof path !== 'string' || path.toLowerCase().startsWith('/admin')) return

  try {
    fetch(`${API_BASE}/api/analytics/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path,
        referrer: typeof document !== 'undefined' ? document.referrer || null : null,
      }),
      keepalive: true,
      credentials: 'omit',
      cache: 'no-store',
    }).catch(() => {})
  } catch {
    // fetch puede lanzar de forma sincrónica en navegadores muy viejos.
  }
}
