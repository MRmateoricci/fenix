import crypto from 'crypto'
import { pool } from '../db/pool.js'

// Zona horaria del negocio. Postgres guarda todo en UTC; el resumen agrupa por
// día calendario de Argentina para que "visitas de hoy" signifique lo que el
// dueño espera y no cambie de día a las 21:00.
const TZ = 'America/Argentina/Buenos_Aires'

// Retención de filas crudas. Pasado este plazo el job de limpieza las borra: el
// resumen nunca mira tan atrás y la tabla no tiene por qué crecer sin techo.
export const RETENTION_DAYS = 180

// UA de tráfico automático conocido: buscadores, monitores de uptime, unfurl de
// links en WhatsApp/redes, herramientas de línea de comandos. No pretende ser
// exhaustivo — filtra el grueso para que el conteo sea de personas, no de bots.
const BOT_UA_RE = /bot|crawler|spider|crawling|slurp|mediapartners|facebookexternalhit|whatsapp|telegrambot|discordbot|embedly|quora link preview|pinterestbot|redditbot|applebot|bingpreview|semrush|ahrefs|mj12bot|dotbot|petalbot|yandex|duckduckbot|headlesschrome|phantomjs|lighthouse|gtmetrix|pingdom|uptimerobot|statuscake|curl\/|wget|python-requests|axios\/|go-http-client|node-fetch|okhttp/i

export function isBotUserAgent(userAgent) {
  // Sin user-agent no es un navegador de persona: cae como bot.
  if (!userAgent || typeof userAgent !== 'string') return true
  return BOT_UA_RE.test(userAgent)
}

// La sal del hash combina la fecha (UTC) con un secreto del entorno. Rota cada
// día para que el hash no sirva para cruzar visitas entre jornadas, y el
// secreto impide precomputar la tabla de hashes desde afuera.
function visitorSalt(date = new Date()) {
  const day = date.toISOString().slice(0, 10)
  const secret = process.env.ANALYTICS_SALT
    || process.env.ADMIN_SESSION_SECRET
    || 'fenix-analytics'
  return `${day}:${secret}`
}

export function visitorHash(ip, userAgent, date = new Date()) {
  return crypto
    .createHash('sha256')
    .update(`${visitorSalt(date)}|${ip || ''}|${userAgent || ''}`)
    .digest('hex')
}

// Del referrer se guarda solo el host (sin www, sin path ni query): alcanza para
// "de dónde llega la gente" y evita persistir URLs con datos personales.
export function referrerHost(referrer) {
  if (!referrer || typeof referrer !== 'string') return null
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '')
    return host ? host.slice(0, 255) : null
  } catch {
    return null
  }
}

// Solo se registra el pathname, sin query ni hash y sin barra final. Las rutas
// del panel (`/admin...`) no son visitas de clientes y se descartan acá.
export function normalizePath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return null
  let path = rawPath.trim().split('?')[0].split('#')[0]
  if (!path) return null
  if (!path.startsWith('/')) path = `/${path}`
  if (path.length > 1) path = path.replace(/\/+$/, '') || '/'
  if (path.toLowerCase().startsWith('/admin')) return null
  return path.slice(0, 255)
}

// Registra una visita. Devuelve false si la ruta no corresponde guardarla
// (ruta de admin, path inválido). Nunca lanza por un beacon: el llamador la
// envuelve igual, pero mantener esto acotado evita romper la request pública.
export async function recordPageView({ path, referrer, ip, userAgent }) {
  const normalizedPath = normalizePath(path)
  if (!normalizedPath) return false

  await pool.query(
    `INSERT INTO page_views (path, referrer_host, visitor_hash, is_bot)
     VALUES ($1, $2, $3, $4)`,
    [normalizedPath, referrerHost(referrer), visitorHash(ip, userAgent), isBotUserAgent(userAgent)]
  )
  return true
}

export function clampDays(value, fallback = 30) {
  const n = Math.trunc(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, 1), 365)
}

// Rellena los días sin visitas con ceros para que el gráfico no tenga huecos.
function fillDailyGaps(rows, days) {
  const byDay = new Map(rows.map((row) => [row.day, row]))
  const series = []
  const today = new Date()
  // Fecha "hoy" en la zona del negocio, como YYYY-MM-DD.
  const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(today)
  const cursor = new Date(`${todayLocal}T00:00:00Z`)
  cursor.setUTCDate(cursor.getUTCDate() - (days - 1))

  for (let i = 0; i < days; i += 1) {
    const key = cursor.toISOString().slice(0, 10)
    const hit = byDay.get(key)
    series.push({
      date: key,
      views: hit ? Number(hit.views) : 0,
      visitors: hit ? Number(hit.visitors) : 0,
    })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return series
}

// Límite inferior del rango como timestamptz, calculado en Postgres para que el
// corte caiga en la medianoche de Argentina y no en la de UTC.
const RANGE_START_SQL = `(
  ((NOW() AT TIME ZONE '${TZ}')::date - make_interval(days => $1::int - 1))::timestamp
  AT TIME ZONE '${TZ}'
)`

export async function getAnalyticsSummary({ days = 30 } = {}) {
  const range = clampDays(days)

  const dailyQuery = pool.query(
    `SELECT to_char((created_at AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD') AS day,
            COUNT(*)::int AS views,
            COUNT(DISTINCT visitor_hash)::int AS visitors
       FROM page_views
      WHERE is_bot = FALSE
        AND created_at >= ${RANGE_START_SQL}
      GROUP BY day
      ORDER BY day`,
    [range]
  )

  const topPagesQuery = pool.query(
    `SELECT path,
            COUNT(*)::int AS views,
            COUNT(DISTINCT visitor_hash)::int AS visitors
       FROM page_views
      WHERE is_bot = FALSE
        AND created_at >= ${RANGE_START_SQL}
      GROUP BY path
      ORDER BY views DESC, path
      LIMIT 8`,
    [range]
  )

  const topReferrersQuery = pool.query(
    `SELECT COALESCE(referrer_host, 'Directo') AS source,
            COUNT(DISTINCT visitor_hash)::int AS visitors
       FROM page_views
      WHERE is_bot = FALSE
        AND created_at >= ${RANGE_START_SQL}
      GROUP BY source
      ORDER BY visitors DESC, source
      LIMIT 8`,
    [range]
  )

  const [daily, topPages, topReferrers] = await Promise.all([
    dailyQuery, topPagesQuery, topReferrersQuery,
  ])

  const series = fillDailyGaps(daily.rows, range)
  const totalViews = series.reduce((sum, day) => sum + day.views, 0)
  const totalVisitors = series.reduce((sum, day) => sum + day.visitors, 0)
  const today = series[series.length - 1] || { views: 0, visitors: 0 }
  // Promedio con un decimal: con poco tráfico "0,4 por día" dice más que un 0
  // redondeado que parece que no entró nadie.
  const perDay = (n) => (series.length ? Math.round((n / series.length) * 10) / 10 : 0)

  // No se expone un "personas únicas del período": el hash del visitante rota
  // cada día a propósito, así que sumar días distintos contaría de nuevo a
  // quien volvió. Lo que sí es sólido es el promedio de personas por día.
  return {
    days: range,
    retentionDays: RETENTION_DAYS,
    daily: series,
    today: { views: today.views, visitors: today.visitors },
    range: {
      views: totalViews,
      visitorsPerDay: perDay(totalVisitors),
      viewsPerDay: perDay(totalViews),
    },
    topPages: topPages.rows.map((row) => ({
      path: row.path, views: Number(row.views), visitors: Number(row.visitors),
    })),
    topReferrers: topReferrers.rows.map((row) => ({
      source: row.source, visitors: Number(row.visitors),
    })),
  }
}

// Borra las filas más viejas que RETENTION_DAYS. Devuelve cuántas eliminó.
export async function prunePageViews() {
  const { rowCount } = await pool.query(
    `DELETE FROM page_views
      WHERE created_at < NOW() - make_interval(days => $1::int)`,
    [RETENTION_DAYS]
  )
  return rowCount
}
