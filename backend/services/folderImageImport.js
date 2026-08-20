import { randomUUID } from 'crypto'
import path from 'path'
import { access, copyFile, mkdir, readdir, rm, stat, unlink } from 'fs/promises'
import { constants as fsConstants } from 'fs'
import { uploadsDir } from '../config/uploads.js'

const PREVIEW_ROOT = path.join(uploadsDir, 'import-previews')
const PREVIEW_TTL_MS = 6 * 60 * 60 * 1000
const MAX_FILES = 500

function codeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function publicProduct(product) {
  return {
    id: product.id,
    codigo: product.codigo,
    name: product.name || null,
    image_url: product.image_url || null,
  }
}

function getFolderPreviewDir(importId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(importId || ''))) return null
  return path.join(PREVIEW_ROOT, importId)
}

async function cleanupOldPreviews() {
  await mkdir(PREVIEW_ROOT, { recursive: true })
  const entries = await readdir(PREVIEW_ROOT, { withFileTypes: true })
  const now = Date.now()
  await Promise.all(entries
    .filter(entry => entry.isDirectory())
    .map(async (entry) => {
      const target = path.join(PREVIEW_ROOT, entry.name)
      const info = await stat(target).catch(() => null)
      if (info && now - info.mtimeMs > PREVIEW_TTL_MS) {
        await rm(target, { recursive: true, force: true })
      }
    }))
}

// Deriva candidatos de código de producto a partir del nombre de archivo:
// "4501.jpg" -> "4501"; "4501-2.jpg" / "4501 blanco.png" -> también prueba "4501";
// "AB-12 detalle.jpg" -> también prueba "AB-12" (códigos con separador interno).
function candidateCodesFromFilename(filename) {
  const stem = path.parse(filename).name
  const parts = stem.split(/[\s_-]+/).filter(Boolean)
  const candidates = new Set([stem, parts[0] || stem])
  let prefix = ''
  for (const part of parts) {
    prefix = prefix ? `${prefix}-${part}` : part
    candidates.add(prefix)
    candidates.add(part)
  }
  return [...candidates]
}

// El caller (la ruta) ya generó importId/previewDir y multer ya escribió los
// archivos ahí en disco directamente (diskStorage) — acá solo emparejamos por
// código y armamos las filas de revisión, sin volver a tocar los buffers.
// Esto permite subir carpetas grandes en varias tandas sin acumular todas las
// imágenes en RAM de una sola vez (lo que tumbaba el proceso con 300+ fotos).
export async function ensureFolderPreviewDir(existingImportId) {
  const importId = /^[0-9a-f-]{36}$/i.test(String(existingImportId || '')) ? existingImportId : randomUUID()
  if (!existingImportId) await cleanupOldPreviews()
  const previewDir = getFolderPreviewDir(importId)
  await mkdir(previewDir, { recursive: true })
  return { importId, previewDir }
}

export async function buildFolderImagePreview(files, products, { importId, previewDir }) {
  if (!Array.isArray(files) || !files.length) throw new Error('No se recibieron imágenes')
  if (files.length > MAX_FILES) throw new Error(`Se permite subir hasta ${MAX_FILES} imágenes por vez`)
  if (!importId || !previewDir) throw new Error('Falta la carpeta de revisión')

  const productsByKey = new Map()
  for (const product of products) {
    const key = codeKey(product.codigo)
    if (key.length >= 2 && !productsByKey.has(key)) productsByKey.set(key, product)
  }

  const rows = files.map(file => {
    const candidates = candidateCodesFromFilename(file.originalname)
    const product = candidates
      .map(codeKey)
      .map(candidateKey => productsByKey.get(candidateKey))
      .find(Boolean) || null

    return {
      originalName: file.originalname,
      detectedCode: product ? product.codigo : (candidates[0] || ''),
      imageOptions: [{ key: file.filename, url: `/uploads/import-previews/${importId}/${file.filename}` }],
      selectedImageKey: file.filename,
      match: product ? publicProduct(product) : null,
    }
  })

  const matchedCount = rows.filter(row => row.match).length
  return {
    importId,
    products: rows,
    matchedCount,
    unmatchedCount: rows.length - matchedCount,
  }
}

function sanitizeImageKey(value) {
  const key = path.basename(String(value || ''))
  return /^folder-[0-9a-f]{8}\.(?:jpe?g|png|webp|gif)$/i.test(key) ? key : null
}

export async function applyFolderImages(client, importId, supplier, rawActions = [], publicUploadsBase = '/uploads') {
  if (!Array.isArray(rawActions) || !rawActions.length || rawActions.length > MAX_FILES) {
    throw new Error('No hay imágenes para aplicar')
  }
  const previewDir = getFolderPreviewDir(importId)
  if (!previewDir) throw new Error('La vista previa no es válida')
  await access(previewDir, fsConstants.R_OK)

  const writtenFiles = []
  let imagesSaved = 0
  try {
    const seenProductIds = new Set()
    for (const rawAction of rawActions) {
      const productId = String(rawAction.productId || '')
      const selectedImageKey = sanitizeImageKey(rawAction.selectedImageKey)
      if (!/^[0-9a-f-]{36}$/i.test(productId) || !selectedImageKey) {
        throw new Error('Hay una asociación incompleta en la revisión')
      }
      if (seenProductIds.has(productId)) {
        throw new Error('Un producto no puede recibir más de una imagen en la misma confirmación')
      }
      seenProductIds.add(productId)

      const { rows } = await client.query('SELECT id, codigo FROM products WHERE id = $1 AND supplier = $2', [productId, supplier])
      if (!rows[0]) throw new Error('Uno de los productos no pertenece al proveedor seleccionado')

      const source = path.join(previewDir, selectedImageKey)
      await access(source, fsConstants.R_OK)
      const safeCode = rows[0].codigo.replace(/[^A-Z0-9_-]+/gi, '-').slice(0, 48)
      const extension = path.extname(selectedImageKey).toLowerCase() || '.jpg'
      const filename = `folder-${safeCode}-${Date.now()}-${randomUUID().slice(0, 8)}${extension}`
      const destination = path.join(uploadsDir, filename)
      await copyFile(source, destination)
      writtenFiles.push(destination)
      const imageUrl = `${publicUploadsBase.replace(/\/+$/, '')}/${filename}`
      await client.query('UPDATE products SET image_url = $1 WHERE id = $2', [imageUrl, productId])
      imagesSaved++
    }
    return { imagesSaved, updated: imagesSaved, writtenFiles, previewDir }
  } catch (error) {
    await Promise.all(writtenFiles.map(file => unlink(file).catch(() => {})))
    throw error
  }
}

export async function discardFolderImagePreview(previewDir) {
  await rm(previewDir, { recursive: true, force: true }).catch(() => {})
}
