import { Router } from 'express'
import { recordPageView, getAnalyticsSummary, clampDays } from '../services/analytics.js'
import { requireAdmin } from '../middleware/requireAdmin.js'

const router = Router()

// ── Freno anti-abuso ─────────────────────────────────────────────────────────
// El beacon se dispara una vez por cambio de página. Un cliente que exceda con
// mucho ese ritmo (un bucle, un script inflando el conteo) queda cortado sin
// tocar la base. Ventana simple en memoria: alcanza para un solo proceso y no
// necesita persistencia — si el server reinicia, el contador vuelve a cero y no
// pasa nada.
const HITS_PER_WINDOW = 40
const WINDOW_MS = 60 * 1000
const hits = new Map()

function overRateLimit(key, now = Date.now()) {
  const entry = hits.get(key)
  if (!entry || now - entry.startedAt >= WINDOW_MS) {
    hits.set(key, { count: 1, startedAt: now })
    return false
  }
  entry.count += 1
  return entry.count > HITS_PER_WINDOW
}

// La memoria no crece sin límite: cada tanto se descartan las ventanas viejas.
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of hits) {
    if (now - entry.startedAt >= WINDOW_MS) hits.delete(key)
  }
}, WINDOW_MS).unref?.()

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/analytics/collect
// Público. Lo llama el frontend en cada cambio de ruta (ver src/lib/analytics.js).
// Responde 204 siempre que puede: es telemetría, no debe hacer ruido en el
// cliente ni frenar la navegación. El servidor deriva IP y user-agent de la
// request — el cuerpo solo trae la ruta y el referrer.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/collect', async (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || ''
  if (overRateLimit(ip)) return res.status(429).end()

  try {
    await recordPageView({
      path: req.body?.path,
      referrer: req.body?.referrer,
      ip,
      userAgent: req.get('user-agent'),
    })
  } catch (err) {
    // Un fallo guardando una visita no es motivo para devolver un error al
    // navegador. Se deja registro en el server y se sigue.
    console.error('[POST /api/analytics/collect]', err)
  }
  return res.status(204).end()
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/summary?days=30
// Admin. Alimenta la pestaña "Visitas" del panel: serie diaria, top de páginas,
// de dónde llega la gente y totales del período.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/summary', requireAdmin, async (req, res) => {
  try {
    const summary = await getAnalyticsSummary({ days: clampDays(req.query.days) })
    res.set('Cache-Control', 'no-store')
    res.json(summary)
  } catch (err) {
    console.error('[GET /api/analytics/summary]', err)
    res.status(500).json({ error: 'No se pudo cargar el resumen de visitas' })
  }
})

export default router
