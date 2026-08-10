import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import path from 'path'
import { fileURLToPath } from 'url'
import 'dotenv/config'
import ordersRouter   from './routes/orders.js'
import webhooksRouter from './routes/webhooks.js'
import authRouter     from './routes/auth.js'
import favoritesRouter from './routes/favorites.js'
import stockAlertsRouter from './routes/stockAlerts.js'
import reviewsRouter from './routes/reviews.js'
import productsRouter from './routes/products.js'
import subcategoriesRouter from './routes/subcategories.js'
import productTypesRouter from './routes/productTypes.js'
import categoryCustomizationsRouter from './routes/categoryCustomizations.js'
import catalogRouter  from './routes/catalog.js'
import googleReviewsRouter from './routes/googleReviews.js'
import shippingRouter from './routes/shipping.js'
import newsletterRouter from './routes/newsletter.js'
import { uploadsDir } from './config/uploads.js'
import { createCorsOptionsDelegate } from './config/cors.js'
import { startExpireReservationsJob } from './jobs/expireReservations.js'

const app  = express()
const PORT = process.env.PORT || 3001
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendDist = path.resolve(__dirname, '..', 'dist')

// Detrás del proxy de Railway/Render, sin esto `req.protocol` siempre da
// 'http' — rompe las URLs absolutas que arma POST /api/products/:id/image.
app.set('trust proxy', 1)

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors(createCorsOptionsDelegate({
  appBaseUrl: process.env.APP_BASE_URL,
  frontendBaseUrl: process.env.FRONTEND_BASE_URL,
})))

// ── Webhooks: necesitan el body raw para verificar la firma ───────────────────
app.use('/api/webhooks', express.raw({ type: 'application/json' }), (req, _res, next) => {
  if (Buffer.isBuffer(req.body)) {
    try { req.body = JSON.parse(req.body.toString()) } catch { req.body = {} }
  }
  next()
})

// ── Body parser JSON + cookies para el resto de rutas ─────────────────────────
app.use(express.json())
app.use(cookieParser())

// ── Fotos de producto subidas por el admin (ver routes/products.js POST /:id/image) ─
app.use('/uploads', express.static(uploadsDir))

// ── Rutas ─────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true, env: process.env.NODE_ENV || 'development' }))
app.use('/api/orders',   ordersRouter)
app.use('/api/webhooks', webhooksRouter)
app.use('/api/auth',     authRouter)
app.use('/api/favorites', favoritesRouter)
app.use('/api/stock-alerts', stockAlertsRouter)
app.use('/api/reviews', reviewsRouter)
app.use('/api/products', productsRouter)
app.use('/api/subcategories', subcategoriesRouter)
app.use('/api/product-types', productTypesRouter)
app.use('/api/category-customizations', categoryCustomizationsRouter)
app.use('/api/catalog',  catalogRouter)
app.use('/api/google-reviews', googleReviewsRouter)
app.use('/api/shipping', shippingRouter)
app.use('/api/newsletter', newsletterRouter)

// Mercado Pago no acepta back_urls con localhost. En desarrollo la preferencia
// vuelve primero por APP_BASE_URL (por ejemplo, ngrok) y este puente redirige
// el navegador al frontend local. En producción ambas URLs suelen ser iguales
// y la ruta sigue hacia el fallback de React.
app.get('/order-confirmation', (req, res, next) => {
  const appBase = process.env.APP_BASE_URL?.trim().replace(/\/+$/, '')
  const frontendBase = process.env.FRONTEND_BASE_URL?.trim().replace(/\/+$/, '')

  if (!appBase || !frontendBase || appBase === frontendBase) return next()

  const query = new URLSearchParams(
    Object.entries(req.query).flatMap(([key, value]) =>
      Array.isArray(value)
        ? value.map((item) => [key, String(item)])
        : [[key, String(value)]]
    )
  ).toString()

  res.redirect(302, `${frontendBase}/order-confirmation${query ? `?${query}` : ''}`)
})

// ── 404 ───────────────────────────────────────────────────────────────────────
// Las rutas API inexistentes siempre responden JSON, incluso en producciÃ³n.
app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }))

// En producciÃ³n Express sirve tambiÃ©n el build de React. El fallback a
// index.html permite refrescar rutas de React Router como /products/:id o
// /admin sin recibir un 404 del servidor.
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(frontendDist))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'))
  })
} else {
  // En desarrollo el frontend lo sirve Vite en :5173.
  app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }))
}

// ── Error global ──────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[Express error]', err)
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' })
})

app.listen(PORT, () => {
  console.log(`🔥 Fénix backend corriendo en http://localhost:${PORT}`)
  startExpireReservationsJob()
})
