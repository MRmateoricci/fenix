import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync, readdirSync } from 'fs'

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

// Log de arranque para poder confirmar en los logs de Railway/Render, sin
// entrar por SFTP, si el volumen persistente sigue montado tras un redeploy:
// si el conteo vuelve a 0 después de haber subido fotos, el volumen no está
// donde el proceso espera (o no está montado) y las imágenes se perdieron.
console.log(`[uploads] usando ${uploadsDir} (${process.env.UPLOADS_DIR ? 'UPLOADS_DIR' : 'default'}) — ${readdirSync(uploadsDir).length} archivo(s) existentes`)
