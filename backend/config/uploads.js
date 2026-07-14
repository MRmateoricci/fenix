import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

// Carpeta donde se guardan las fotos de producto subidas por el admin
// (ver routes/products.js POST /:id/image, servida en index.js vía
// app.use('/uploads', express.static(uploadsDir))). Configurable por env var
// para que en Railway/Render solo haga falta montar un volumen persistente
// en esta misma ruta al desplegar, sin tocar código.
const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '..', 'public', 'uploads')

mkdirSync(uploadsDir, { recursive: true })
