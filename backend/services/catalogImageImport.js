import { randomUUID } from 'crypto'
import path from 'path'
import { access, copyFile, mkdir, rm, unlink, writeFile } from 'fs/promises'
import { constants as fsConstants } from 'fs'
import { createCanvas, ImageData } from '@napi-rs/canvas'
import { getDocument, ImageKind, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { uploadsDir } from '../config/uploads.js'
import {
  getCleosPreviewDir,
  parseCleosCatalogPdf,
} from './cleosCatalogImport.js'

const MAX_PAGES = 800
const MAX_PREVIEW_ROWS = 500

function codeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function publicProduct(product) {
  return {
    id: product.id,
    codigo: product.codigo,
    name: product.name || null,
    descripcion: product.descripcion || null,
    image_url: product.image_url || null,
  }
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
    if (fn === OPS.save) stack.push(transform.slice())
    else if (fn === OPS.restore) transform = stack.pop() || [1, 0, 0, 1, 0, 0]
    else if (fn === OPS.transform) transform = Util.transform(transform, args)
    else if (fn === OPS.paintImageXObject) {
      placements.push({ objectName: args[0], ...matrixBounds(transform) })
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
      const color = ((byte >> (7 - (pixel % 8))) & 1) ? 255 : 0
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
  canvas.getContext('2d').putImageData(new ImageData(rgba, image.width, image.height), 0, 0)
  await writeFile(destination, canvas.toBuffer('image/png'))
  return true
}

function distanceFromRow(placement, item) {
  const yDistance = item.y < placement.y0
    ? placement.y0 - item.y
    : item.y > placement.y1 ? item.y - placement.y1 : 0
  const imageCenterX = (placement.x0 + placement.x1) / 2
  return yDistance * 10 + Math.abs(imageCenterX - item.x) * 0.08
}

function nearbyText(items, placement) {
  const centerY = (placement.y0 + placement.y1) / 2
  return items
    .filter(item => Math.abs(item.y - centerY) < 45)
    .sort((a, b) => Math.abs(a.y - centerY) - Math.abs(b.y - centerY) || a.x - b.x)
    .slice(0, 5)
    .map(item => item.text)
    .join(' · ')
    .slice(0, 300)
}

export function matchKnownProductsOnPage(items, placements, products) {
  const productsByKey = new Map()
  for (const product of products) {
    const key = codeKey(product.codigo)
    if (key.length >= 3 && !productsByKey.has(key)) productsByKey.set(key, product)
  }

  const found = []
  for (const item of items) {
    const rawCandidates = [item.text, ...String(item.text || '').split(/\s+/)]
    const product = rawCandidates
      .map(codeKey)
      .map(key => productsByKey.get(key))
      .find(Boolean)
    if (!product) continue

    const ranked = placements
      .map(placement => ({ placement, score: distanceFromRow(placement, item) }))
      .sort((a, b) => a.score - b.score)
    if (!ranked.length || ranked[0].score > 1200) continue
    found.push({ product, item, ranked })
  }
  return found
}

function cleosPreview(parsed, supplier, products) {
  const byKey = new Map(products.map(product => [codeKey(product.codigo), product]))
  return {
    ...parsed,
    supplier,
    extractor: 'cleos',
    products: parsed.products.map((row) => {
      const match = byKey.get(codeKey(row.code)) || null
      return {
        page: row.page,
        detectedCode: row.code,
        nearbyText: row.description || row.name || '',
        imageOptions: row.imageOptions,
        selectedImageKey: row.selectedImageKey,
        match: match ? publicProduct(match) : null,
      }
    }),
  }
}

export async function parseCatalogImagesPdf(buffer, supplier, products) {
  if (supplier === 'CLEOS') {
    return cleosPreview(await parseCleosCatalogPdf(buffer), supplier, products)
  }

  const importId = randomUUID()
  const previewDir = getCleosPreviewDir(importId)
  await mkdir(previewDir, { recursive: true })
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
  })
  const rowsByProduct = new Map()
  const unmatched = []
  let pageCount = 0
  let extractedImages = 0
  let skippedImages = 0

  try {
    const document = await loadingTask.promise
    pageCount = document.numPages
    if (!pageCount || pageCount > MAX_PAGES) throw new Error('El PDF tiene una cantidad de páginas no admitida')

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const page = await document.getPage(pageNumber)
      const [textContent, operatorList] = await Promise.all([
        page.getTextContent({ normalizeWhitespace: true }),
        page.getOperatorList(),
      ])
      const items = textContent.items
        .map(item => ({
          text: String(item.str || '').trim(),
          x: item.transform[4],
          y: item.transform[5],
        }))
        .filter(item => item.text)

      const rawPlacements = getPageImagePlacements(operatorList)
      const objectFiles = new Map()
      const validObjects = new Set()
      for (const objectName of [...new Set(rawPlacements.map(item => item.objectName))]) {
        const image = await readPageObject(page, objectName)
        if (!image || image.width < 24 || image.height < 24) {
          skippedImages++
          continue
        }
        const key = `page-${pageNumber}-${objectFiles.size + 1}.png`
        if (await savePdfImage(image, path.join(previewDir, key))) {
          objectFiles.set(objectName, key)
          validObjects.add(objectName)
          extractedImages++
        } else skippedImages++
      }

      const placements = rawPlacements
        .filter(item => validObjects.has(item.objectName))
        .filter(item => Math.abs(item.x1 - item.x0) >= 12 && Math.abs(item.y1 - item.y0) >= 12)
      const matches = matchKnownProductsOnPage(items, placements, products)
      const matchedObjects = new Set()

      for (const match of matches) {
        const best = match.ranked[0].placement
        const key = objectFiles.get(best.objectName)
        if (!key) continue
        matchedObjects.add(best.objectName)
        const current = rowsByProduct.get(match.product.id)
        const imageOptions = match.ranked
          .slice(0, 5)
          .map(({ placement }) => objectFiles.get(placement.objectName))
          .filter((value, index, all) => value && all.indexOf(value) === index)
          .map(imageKey => ({ key: imageKey, url: `/uploads/import-previews/${importId}/${imageKey}` }))
        const next = {
          page: pageNumber,
          detectedCode: match.product.codigo,
          nearbyText: nearbyText(items, best),
          imageOptions,
          selectedImageKey: key,
          match: publicProduct(match.product),
          score: match.ranked[0].score,
        }
        if (!current || next.score < current.score) rowsByProduct.set(match.product.id, next)
      }

      for (const placement of placements) {
        if (matchedObjects.has(placement.objectName)) continue
        const key = objectFiles.get(placement.objectName)
        if (!key) continue
        unmatched.push({
          page: pageNumber,
          detectedCode: '',
          nearbyText: nearbyText(items, placement),
          imageOptions: [{ key, url: `/uploads/import-previews/${importId}/${key}` }],
          selectedImageKey: key,
          match: null,
          score: null,
        })
      }
      page.cleanup()
    }

    const matchedRows = [...rowsByProduct.values()].sort((a, b) => a.page - b.page)
    const remaining = Math.max(0, MAX_PREVIEW_ROWS - matchedRows.length)
    const previewRows = [...matchedRows, ...unmatched.slice(0, remaining)]
    if (!previewRows.length) {
      throw new Error(`No se pudieron extraer imágenes utilizables del catálogo de ${supplier}`)
    }
    return {
      importId,
      supplier,
      extractor: 'generic',
      pageCount,
      products: previewRows,
      matchedCount: matchedRows.length,
      unmatchedCount: unmatched.length,
      extractedImages,
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

export async function applyCatalogImages(client, importId, supplier, rawActions, publicUploadsBase = '/uploads') {
  if (!Array.isArray(rawActions) || !rawActions.length || rawActions.length > MAX_PREVIEW_ROWS) {
    throw new Error('No hay asociaciones de imágenes válidas para aplicar')
  }
  const previewDir = getCleosPreviewDir(importId)
  if (!previewDir) throw new Error('La vista previa del catálogo no es válida')
  await access(previewDir, fsConstants.R_OK)

  const writtenFiles = []
  let imagesSaved = 0
  try {
    for (const rawAction of rawActions) {
      const productId = String(rawAction.productId || '')
      const selectedImageKey = sanitizeImageKey(rawAction.selectedImageKey)
      if (!/^[0-9a-f-]{36}$/i.test(productId) || !selectedImageKey) {
        throw new Error('Hay una asociación incompleta en la revisión')
      }
      const { rows } = await client.query(
        `SELECT id, codigo FROM products WHERE id = $1 AND supplier = $2`,
        [productId, supplier]
      )
      if (!rows[0]) throw new Error('Uno de los productos no pertenece al proveedor seleccionado')

      const source = path.join(previewDir, selectedImageKey)
      await access(source, fsConstants.R_OK)
      const safeSupplier = supplier.replace(/[^A-Z0-9_-]+/gi, '-').slice(0, 30)
      const safeCode = rows[0].codigo.replace(/[^A-Z0-9_-]+/gi, '-').slice(0, 48)
      const extension = path.extname(selectedImageKey).toLowerCase() || '.png'
      const filename = `catalog-${safeSupplier}-${safeCode}-${Date.now()}-${randomUUID().slice(0, 8)}${extension}`
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
