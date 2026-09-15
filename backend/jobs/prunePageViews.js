import { prunePageViews, RETENTION_DAYS } from '../services/analytics.js'

// La tabla page_views es de solo-append y crece con cada visita. El resumen del
// panel nunca mira más atrás de unos meses, así que las filas viejas no aportan
// nada y solo ocupan espacio en la base de Railway. Este barrido las borra una
// vez por día (y una al arrancar).
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000

async function sweepOldPageViews() {
  try {
    const deleted = await prunePageViews()
    if (deleted) {
      console.log(`[prunePageViews] ${deleted} visita(s) de más de ${RETENTION_DAYS} días borradas`)
    }
  } catch (err) {
    console.error('[prunePageViews] Error en el barrido:', err)
  }
}

// Devuelve el timer para que index.js pueda frenarlo en el apagado ordenado.
export function startPrunePageViewsJob() {
  sweepOldPageViews()
  return setInterval(sweepOldPageViews, SWEEP_INTERVAL_MS)
}
