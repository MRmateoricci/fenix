import { randomUUID } from 'crypto'
import path from 'path'
import {
  access,
  copyFile,
  mkdir,
  readdir,
  rm,
  stat,
  unlink,
  writeFile,
} from 'fs/promises'
import { constants as fsConstants } from 'fs'
import { createCanvas, ImageData } from '@napi-rs/canvas'
import { getDocument, ImageKind, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { uploadsDir } from '../config/uploads.js'
import { normalizeCodigo } from './excelImport.js'

const PREVIEW_ROOT = path.join(uploadsDir, 'import-previews')
const PREVIEW_TTL_MS = 6 * 60 * 60 * 1000
const MAX_PRODUCTS = 300

function normalizeLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function normalizeText(value, maxLength = 500) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, maxLength) : null
}

function isCleosCode(value) {
  const text = String(value || '').trim()
  if (!text || text.length > 64) return false
  if (/[a-záéíóúñ]/.test(text)) return false
  if (!/^[A-Z0-9][A-Z0-9/+.()\- ]+$/.test(text)) return false
  return /[A-Z]/.test(text)
}

function parseCleosNumber(value) {
  const text = String(value || '').replace(/[^\d,.-]/g, '').trim()
  if (!text) return null
  let normalized
  if (text.includes(',')) {
    normalized = text.replace(/\./g, '').replace(',', '.')
  } else if ((text.match(/\./g) || []).length === 1) {
    const [integer, decimal] = text.split('.')
    normalized = decimal.length === 3 ? `${integer}${decimal}` : text
  } else {
    normalized = text.replace(/\./g, '')
  }
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

function parseWatts(value, code) {
  const source = `${value || ''} ${code || ''}`
  const match = source.match(/(\d+(?:[.,]\d+)?)\s*W\b/i)
  return match ? parseCleosNumber(match[1]) : null
}

function toPdfPoint(matrix, x, y) {
  return [
    matrix[0] * x + matrix[2] * y + matrix[4],
    matrix[1] * x + matrix[3] * y + matrix[5],
  ]
}

function matrixBounds(matrix) {
  const corners = [
    toPdfPoint(matrix, 0, 0),
    toPdfPoint(matrix, 1, 0),
    toPdfPoint(matrix, 0, 1),
    toPdfPoint(matrix, 1, 1),
  ]
  return {
    x0: Math.min(...corners.map(([x]) => x)),
    x1: Math.max(...corners.map(([x]) => x)),
    y0: Math.min(...corners.map(([, y]) => y)),
    y1: Math.max(...corners.map(([, y]) => y)),
  }
}

function getPageImagePlacements(operatorList) {
  const placements = []
  const stack = []
  let transform = [1, 0, 0, 1, 0, 0]

  for (let index = 0; index < operatorList.fnArray.length; index++) {
    const fn = operatorList.fnArray[index]
    const args = operatorList.argsArray[index]
    if (fn === OPS.save) {
      stack.push(transform.slice())
    } else if (fn === OPS.restore) {
      transform = stack.pop() || [1, 0, 0, 1, 0, 0]
    } else if (fn === OPS.transform) {
      transform = Util.transform(transform, args)
    } else if (fn === OPS.paintImageXObject) {
      placements.push({
        objectName: args[0],
        ...matrixBounds(transform),
      })
    }
  }

  return placements
}

function readPageObject(page, objectName, timeoutMs = 1500) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value || null)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)

    try {
      const direct = page.objs.get(objectName, finish)
      if (direct) finish(direct)
    } catch {
      finish(null)
    }
  })
}

function imageToRgba(image) {
  const pixelCount = image.width * image.height
  const source = image.data

  if (image.kind === ImageKind.RGBA_32BPP && source.length >= pixelCount * 4) {
    return new Uint8ClampedArray(source.buffer, source.byteOffset, pixelCount * 4)
  }

  const rgba = new Uint8ClampedArray(pixelCount * 4)
  if (image.kind === ImageKind.RGB_24BPP && source.length >= pixelCount * 3) {
    for (let sourceIndex = 0, targetIndex = 0; targetIndex < rgba.length; sourceIndex += 3, targetIndex += 4) {
      rgba[targetIndex] = source[sourceIndex]
      rgba[targetIndex + 1] = source[sourceIndex + 1]
      rgba[targetIndex + 2] = source[sourceIndex + 2]
      rgba[targetIndex + 3] = 255
    }
    return rgba
  }

  if (image.kind === ImageKind.GRAYSCALE_1BPP) {
    for (let pixel = 0; pixel < pixelCount; pixel++) {
      const byte = source[Math.floor(pixel / 8)] || 0
      const enabled = (byte >> (7 - (pixel % 8))) & 1
      const color = enabled ? 255 : 0
      const target = pixel * 4
      rgba[target] = color
      rgba[target + 1] = color
      rgba[target + 2] = color
      rgba[target + 3] = 255
    }
    return rgba
  }

  return null
}

async function savePdfImage(image, destination) {
  if (!image?.width || !image?.height || !image?.data) return false
  const rgba = imageToRgba(image)
  if (!rgba) return false

  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.putImageData(new ImageData(rgba, image.width, image.height), 0, 0)
  await writeFile(destination, canvas.toBuffer('image/png'))
  return true
}

function sameRow(items, y, tolerance = 2.25) {
  return items
    .filter((item) => Math.abs(item.y - y) <= tolerance)
    .sort((a, b) => a.x - b.x)
}

function textInColumn(row, startX, endX = Number.POSITIVE_INFINITY) {
  return normalizeText(
    row
      .filter((item) => item.x >= startX - 2 && item.x < endX - 2)
      .map((item) => item.text)
      .join(' '),
    1000
  )
}

function findGroupTitle(items, header, upperBound) {
  const candidates = items.filter((item) =>
    item.x >= header.x - 5 &&
    item.x < 520 &&
    item.y > header.y + 7 &&
    item.y < upperBound &&
    item.height >= 15
  )
  if (!candidates.length) return null

  const maxHeight = Math.max(...candidates.map((item) => item.height))
  const titleItem = candidates
    .filter((item) => item.height >= maxHeight - 0.5)
    .sort((a, b) => a.y - b.y)[0]
  return textInColumn(sameRow(items, titleItem.y, 1), header.x - 5, 560)
}

function findGroupSubtitle(items, header, title, upperBound) {
  if (!title) return null
  const titleLine = items
    .filter((item) => item.y > header.y + 7 && item.y < upperBound && item.height >= 15)
    .sort((a, b) => a.y - b.y)[0]
  if (!titleLine) return null

  const candidates = items
    .filter((item) =>
      item.x >= header.x - 5 &&
      item.x < 560 &&
      item.y > header.y + 5 &&
      item.y < titleLine.y - 3 &&
      item.height >= 11
    )
    .sort((a, b) => b.y - a.y)
  if (!candidates.length) return null
  return textInColumn(sameRow(items, candidates[0].y, 1), header.x - 5, 570)
}

function getGroupColumns(items, header, lowerBound, upperBound) {
  const labels = items
    .filter((item) => item.y >= lowerBound && item.y <= upperBound)
    .filter((item) => {
      const label = normalizeLabel(item.text)
      return [
        'codigo',
        'descripcion',
        'tension',
        'potencia',
        'poten.',
        'pot.',
        'lumen',
        'zocalo',
        'color (k)',
        'temperatura de color (k)',
        'proteccion',
        'protec.',
        'u$s',
        'caja',
      ].includes(label)
    })
    .sort((a, b) => Math.abs(a.y - header.y) - Math.abs(b.y - header.y))

  const byLabel = (predicate) => labels.find((item) => predicate(normalizeLabel(item.text)))
  const description = byLabel((label) => label === 'descripcion')
  const tension = byLabel((label) => label === 'tension')
  const watts = byLabel((label) => ['potencia', 'poten.', 'pot.'].includes(label))
  const lumen = byLabel((label) => label === 'lumen')
  const socket = byLabel((label) => label === 'zocalo')
  const color = byLabel((label) => label.includes('color (k)'))
  const protection = byLabel((label) => ['proteccion', 'protec.'].includes(label))
  const price = byLabel((label) => label === 'u$s')
  const box = byLabel((label) => label === 'caja')

  const starts = [
    description?.x,
    tension?.x,
    watts?.x,
    lumen?.x,
    socket?.x,
    color?.x,
    protection?.x,
    price?.x,
    box?.x,
  ].filter(Number.isFinite).sort((a, b) => a - b)

  const endFor = (start, fallback) => starts.find((value) => value > start + 3) || fallback
  return {
    description: description ? [description.x, endFor(description.x, 520)] : [header.x + 60, 520],
    watts: watts ? [watts.x, endFor(watts.x, watts.x + 55)] : null,
    lumen: lumen ? [lumen.x, endFor(lumen.x, lumen.x + 55)] : null,
    socket: socket ? [socket.x, endFor(socket.x, socket.x + 45)] : null,
    color: color ? [color.x, endFor(color.x, color.x + 65)] : null,
    protection: protection ? [protection.x, endFor(protection.x, protection.x + 55)] : null,
    price: price ? [price.x - 20, box?.x || price.x + 45] : null,
    box: box ? [box.x - 3, box.x + 45] : null,
  }
}

function parseGroupRows(items, header, lowerBound, upperBound) {
  const columns = getGroupColumns(items, header, lowerBound, upperBound)
  const codeItems = items
    .filter((item) =>
      Math.abs(item.x - header.x) < 18 &&
      item.y < header.y - 2 &&
      item.y > lowerBound &&
      isCleosCode(item.text)
    )
    .sort((a, b) => b.y - a.y)

  return codeItems.map((codeItem) => {
    const row = sameRow(items, codeItem.y)
    const read = (column) => column ? textInColumn(row, column[0], column[1]) : null
    const code = normalizeCodigo(codeItem.text)
    const description = normalizeText(
      row
        .filter((item) => item.x >= columns.description[0] - 2 && item.x < 500)
        .sort((a, b) => a.x - b.x)[0]?.text
    )
    const wattsText = read(columns.watts) || row.map((item) => item.text).find((text) => /\d+(?:[.,]\d+)?\s*W\b/i.test(text))
    const priceText = read(columns.price) || row
      .filter((item) => item.x >= 500 && item.x < 565)
      .map((item) => item.text)
      .find((text) => /\d/.test(text))
    const boxText = read(columns.box)
    return {
      code,
      y: codeItem.y,
      description,
      watts: parseWatts(wattsText, code),
      lumen: read(columns.lumen),
      socket: read(columns.socket),
      colorTemperature: read(columns.color),
      ipRating: read(columns.protection),
      priceUsd: parseCleosNumber(priceText),
      boxUnits: boxText ? Math.trunc(parseCleosNumber(boxText) || 0) || null : null,
    }
  })
}

function candidatePlacementsForGroup(placements, lowerBound, upperBound) {
  const candidates = placements.filter((placement) => {
    const centerY = (placement.y0 + placement.y1) / 2
    return centerY >= lowerBound && centerY <= upperBound
  })

  const seen = new Set()
  return candidates.filter((placement) => {
    if (seen.has(placement.objectName)) return false
    seen.add(placement.objectName)
    return true
  })
}

function chooseDefaultImage(row, rowIndex, rows, candidates) {
  if (!candidates.length) return null
  if (candidates.length === rows.length) {
    const ordered = [...candidates].sort((a, b) => {
      const yDiff = ((b.y0 + b.y1) / 2) - ((a.y0 + a.y1) / 2)
      return Math.abs(yDiff) > 8 ? yDiff : a.x0 - b.x0
    })
    return ordered[rowIndex] || ordered[0]
  }

  return [...candidates].sort((a, b) => {
    const aDistance = Math.abs(((a.y0 + a.y1) / 2) - row.y)
    const bDistance = Math.abs(((b.y0 + b.y1) / 2) - row.y)
    return aDistance - bDistance
  })[0]
}

async function cleanupOldPreviews() {
  await mkdir(PREVIEW_ROOT, { recursive: true })
  const entries = await readdir(PREVIEW_ROOT, { withFileTypes: true })
  const now = Date.now()
  await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const target = path.join(PREVIEW_ROOT, entry.name)
      const info = await stat(target).catch(() => null)
      if (info && now - info.mtimeMs > PREVIEW_TTL_MS) {
        await rm(target, { recursive: true, force: true })
      }
    }))
}

export function getCleosPreviewDir(importId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(importId || ''))) return null
  return path.join(PREVIEW_ROOT, importId)
}

export async function saveCleosPreviewImage(importId, file) {
  const previewDir = getCleosPreviewDir(importId)
  if (!previewDir) throw new Error('La vista previa de CLEOS no es válida')
  await access(previewDir, fsConstants.W_OK)

  const extensions = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  }
  const extension = extensions[file?.mimetype]
  if (!extension || !file?.buffer?.length) throw new Error('La imagen no es válida')

  const key = `custom-${randomUUID()}${extension}`
  await writeFile(path.join(previewDir, key), file.buffer)
  return {
    key,
    url: `/uploads/import-previews/${importId}/${key}`,
  }
}

export async function parseCleosCatalogPdf(buffer) {
  await cleanupOldPreviews()
  const importId = randomUUID()
  const previewDir = getCleosPreviewDir(importId)
  await mkdir(previewDir, { recursive: true })

  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
  })

  const extracted = []
  let pageCount = 0
  let skippedImages = 0

  try {
    const document = await loadingTask.promise
    pageCount = document.numPages
    if (!pageCount || pageCount > 80) throw new Error('El PDF tiene una cantidad de páginas no admitida')

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const page = await document.getPage(pageNumber)
      const [textContent, operatorList] = await Promise.all([
        page.getTextContent({ normalizeWhitespace: true }),
        page.getOperatorList(),
      ])
      const viewport = page.getViewport({ scale: 1 })
      const items = textContent.items
        .map((item) => ({
          text: String(item.str || '').trim(),
          x: item.transform[4],
          y: item.transform[5],
          width: item.width || 0,
          height: item.height || Math.abs(item.transform[3]) || 0,
        }))
        .filter((item) => item.text)

      if (pageNumber === 1) {
        const firstPageText = normalizeLabel(items.map((item) => item.text).join(' '))
        if (!firstPageText.includes('lista unica') || !firstPageText.includes('precios netos')) {
          throw new Error('El archivo no parece ser una lista de precios CLEOS')
        }
      }

      const placements = getPageImagePlacements(operatorList)
      const imageFiles = new Map()
      for (const objectName of [...new Set(placements.map((placement) => placement.objectName))]) {
        const image = await readPageObject(page, objectName)
        if (!image) {
          skippedImages++
          continue
        }
        const imageKey = `page-${pageNumber}-${imageFiles.size + 1}.png`
        const saved = await savePdfImage(image, path.join(previewDir, imageKey))
        if (saved) imageFiles.set(objectName, imageKey)
        else skippedImages++
      }

      const headers = items
        .filter((item) => normalizeLabel(item.text) === 'codigo')
        .sort((a, b) => b.y - a.y)

      for (let groupIndex = 0; groupIndex < headers.length; groupIndex++) {
        const header = headers[groupIndex]
        const previous = headers[groupIndex - 1]
        const next = headers[groupIndex + 1]
        const upperBound = previous ? (previous.y + header.y) / 2 : viewport.height - 95
        const lowerBound = next ? (header.y + next.y) / 2 : 24
        const rows = parseGroupRows(items, header, lowerBound, upperBound)
        if (!rows.length) continue

        const title = findGroupTitle(items, header, upperBound) || rows[0].description || 'Producto CLEOS'
        const subtitle = findGroupSubtitle(items, header, title, upperBound)
        const candidates = candidatePlacementsForGroup(placements, lowerBound, upperBound)
          .filter((placement) => imageFiles.has(placement.objectName))

        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
          const row = rows[rowIndex]
          const defaultImage = chooseDefaultImage(row, rowIndex, rows, candidates)
          const imageOptions = candidates.map((placement) => ({
            key: imageFiles.get(placement.objectName),
            url: `/uploads/import-previews/${importId}/${imageFiles.get(placement.objectName)}`,
          }))
          const uniqueName = rows.length > 1
            ? `${title} ${row.watts ? `${row.watts}W` : row.code}`
            : title

          extracted.push({
            page: pageNumber,
            code: row.code,
            name: normalizeText(uniqueName, 200),
            description: row.description,
            longDescription: normalizeText([subtitle, row.description].filter(Boolean).join('. '), 2000),
            groupTitle: title,
            priceUsd: row.priceUsd,
            watts: row.watts,
            lumen: row.lumen,
            socket: row.socket,
            colorTemperature: row.colorTemperature,
            ipRating: row.ipRating,
            boxUnits: row.boxUnits,
            imageOptions,
            selectedImageKey: defaultImage ? imageFiles.get(defaultImage.objectName) : null,
          })
        }
      }

      page.cleanup()
    }

    const byCode = new Map()
    let duplicateCodes = 0
    for (const product of extracted) {
      const existing = byCode.get(product.code)
      if (!existing) {
        byCode.set(product.code, product)
        continue
      }
      duplicateCodes++
      byCode.set(product.code, {
        ...existing,
        priceUsd: existing.priceUsd ?? product.priceUsd,
        watts: existing.watts ?? product.watts,
        description: existing.description ?? product.description,
        imageOptions: existing.imageOptions.length ? existing.imageOptions : product.imageOptions,
        selectedImageKey: existing.selectedImageKey || product.selectedImageKey,
      })
    }

    const products = [...byCode.values()].slice(0, MAX_PRODUCTS)
    if (!products.length) throw new Error('No se reconocieron productos en el PDF de CLEOS')
    return {
      importId,
      pageCount,
      products,
      duplicateCodes,
      skippedImages,
    }
  } catch (error) {
    await rm(previewDir, { recursive: true, force: true })
    throw error
  } finally {
    await loadingTask.destroy().catch(() => {})
  }
}

function sanitizeImageKey(value) {
  const key = path.basename(String(value || ''))
  return /^(?:page-\d+-\d+\.png|custom-[0-9a-f-]{36}\.(?:jpe?g|png|webp|gif))$/i.test(key) ? key : null
}

function sanitizeAction(action) {
  const code = normalizeCodigo(action.code)
  if (!code || code.length > 64) throw new Error('Hay un producto sin código válido')
  return {
    code,
    name: normalizeText(action.name, 200) || code,
    description: normalizeText(action.description, 2000),
    longDescription: normalizeText(action.longDescription, 5000),
    groupTitle: normalizeText(action.groupTitle, 150),
    category: normalizeText(action.category, 100),
    subcategory: normalizeText(action.subcategory, 150),
    priceUsd: action.priceUsd == null || action.priceUsd === ''
      ? null
      : Number(action.priceUsd),
    watts: action.watts == null || action.watts === ''
      ? null
      : Number(action.watts),
    ipRating: normalizeText(action.ipRating, 10),
    selectedImageKey: sanitizeImageKey(action.selectedImageKey),
    removeImage: Boolean(action.removeImage),
  }
}

export async function applyCleosCatalogProducts(client, importId, rawActions, publicUploadsBase = '/uploads') {
  if (!Array.isArray(rawActions) || !rawActions.length || rawActions.length > MAX_PRODUCTS) {
    throw new Error('No hay productos CLEOS válidos para importar')
  }
  const previewDir = getCleosPreviewDir(importId)
  if (!previewDir) throw new Error('La vista previa de CLEOS no es válida')
  await access(previewDir, fsConstants.R_OK)

  const actions = rawActions.map(sanitizeAction)
  const writtenFiles = []
  let created = 0
  let updated = 0
  let imagesSaved = 0
  let imagesRemoved = 0

  try {
    for (const action of actions) {
      if (action.priceUsd !== null && (!Number.isFinite(action.priceUsd) || action.priceUsd < 0)) {
        throw new Error(`El precio USD de ${action.code} no es válido`)
      }
      if (action.watts !== null && (!Number.isFinite(action.watts) || action.watts < 0)) {
        throw new Error(`La potencia de ${action.code} no es válida`)
      }

      const { rows } = await client.query(
        `INSERT INTO products (
           codigo, descripcion, grupo, subgrupo, supplier, precio_costo_usd,
           watts, name, description_larga, ip_rating, product_type, category,
           subcategory, source
         )
         VALUES ($1, $2, 'CLEOS', $3, 'CLEOS', $4, $5, $6, $7, $8, $3, $9, $10, 'catalog')
         ON CONFLICT (codigo) DO UPDATE SET
           descripcion = COALESCE(EXCLUDED.descripcion, products.descripcion),
           grupo = 'CLEOS',
           subgrupo = COALESCE(EXCLUDED.subgrupo, products.subgrupo),
           supplier = 'CLEOS',
           precio_costo_usd = COALESCE(EXCLUDED.precio_costo_usd, products.precio_costo_usd),
           watts = COALESCE(EXCLUDED.watts, products.watts),
           name = COALESCE(products.name, EXCLUDED.name),
           description_larga = COALESCE(products.description_larga, EXCLUDED.description_larga),
           ip_rating = COALESCE(EXCLUDED.ip_rating, products.ip_rating),
           product_type = COALESCE(products.product_type, EXCLUDED.product_type),
           category = COALESCE(EXCLUDED.category, products.category),
           subcategory = COALESCE(EXCLUDED.subcategory, products.subcategory),
           updated_at = NOW()
         RETURNING id, (xmax = 0) AS created`,
        [
          action.code,
          action.description,
          action.groupTitle,
          action.priceUsd,
          action.watts,
          action.name,
          action.longDescription,
          action.ipRating,
          action.category,
          action.subcategory,
        ]
      )
      const product = rows[0]
      if (product.created) created++
      else updated++

      if (action.removeImage) {
        await client.query('UPDATE products SET image_url = NULL WHERE id = $1', [product.id])
        imagesRemoved++
      } else if (action.selectedImageKey) {
        const source = path.join(previewDir, action.selectedImageKey)
        await access(source, fsConstants.R_OK)
        const safeCode = action.code.replace(/[^A-Z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 48)
        const extension = path.extname(action.selectedImageKey).toLowerCase() || '.png'
        const filename = `cleos-${safeCode || product.id}-${Date.now()}-${randomUUID().slice(0, 8)}${extension}`
        const destination = path.join(uploadsDir, filename)
        await copyFile(source, destination)
        writtenFiles.push(destination)
        const imageUrl = `${publicUploadsBase.replace(/\/+$/, '')}/${filename}`
        await client.query('UPDATE products SET image_url = $1 WHERE id = $2', [imageUrl, product.id])
        imagesSaved++
      }
    }

    return { created, updated, imagesSaved, imagesRemoved, writtenFiles, previewDir }
  } catch (error) {
    await Promise.all(writtenFiles.map((file) => unlink(file).catch(() => {})))
    throw error
  }
}

export async function discardCleosPreview(previewDir) {
  if (!previewDir || path.dirname(previewDir) !== PREVIEW_ROOT) return
  await rm(previewDir, { recursive: true, force: true })
}
