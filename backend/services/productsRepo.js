import { updateVariantRulePrice } from './productVariants.js'

const CHUNK_SIZE = 500

function chunk(array, size = CHUNK_SIZE) {
  const out = []
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size))
  return out
}

// Construye "($1,$2,$3,'lit'), ($4,$5,$6,'lit'), ..." — placeholders para las
// columnas parametrizadas de cada fila + literales SQL fijos al final de cada
// grupo (constantes como el 'source', iguales para todo el batch).
function valuesClause(rowCount, colCount, literals = [], offset = 0) {
  const groups = []
  for (let r = 0; r < rowCount; r++) {
    const cols = []
    for (let c = 0; c < colCount; c++) cols.push(`$${offset + r * colCount + c + 1}`)
    groups.push(`(${[...cols, ...literals].join(', ')})`)
  }
  return groups.join(', ')
}

// ── 1. Catálogo maestro (Huergui) — upsert descriptivo, nunca toca precio/stock ─
export async function upsertCatalogRows(client, rows) {
  let created = 0
  let updated = 0

  for (const batch of chunk(rows)) {
    const params = []
    for (const r of batch) params.push(r.codigo, r.descripcion, r.grupo, r.subgrupo, r.medida)

    const { rows: result } = await client.query(
      `INSERT INTO products (codigo, descripcion, grupo, subgrupo, medida, source)
       VALUES ${valuesClause(batch.length, 5, ["'catalog'"])}
       ON CONFLICT (codigo) DO UPDATE SET
         descripcion = EXCLUDED.descripcion,
         grupo       = EXCLUDED.grupo,
         subgrupo    = EXCLUDED.subgrupo,
         medida      = EXCLUDED.medida,
         updated_at  = NOW()
       RETURNING (xmax = 0) AS inserted`,
      params
    )
    for (const row of result) row.inserted ? created++ : updated++
  }

  return { created, updated }
}

// ── 2. Lista de precios (ALCIDES) — no toca descripción/grupo en un update ────
export async function upsertPriceRows(client, rows) {
  let created = 0
  let updated = 0

  for (const batch of chunk(rows)) {
    const params = []
    for (const r of batch) params.push(r.codigo, r.descripcion, r.precio_costo, r.precio_venta, r.precio_iva)

    const { rows: result } = await client.query(
      `INSERT INTO products (codigo, descripcion, precio_costo, precio_venta, precio_iva, source, supplier, price_updated_at)
       VALUES ${valuesClause(batch.length, 5, ["'price_list'", "'ALCIDES'", 'NOW()'])}
       ON CONFLICT (codigo) DO UPDATE SET
         precio_costo     = EXCLUDED.precio_costo,
         precio_venta     = EXCLUDED.precio_venta,
         precio_iva       = EXCLUDED.precio_iva,
         supplier         = 'ALCIDES',
         price_updated_at = NOW(),
         updated_at       = NOW()
       RETURNING (xmax = 0) AS inserted`,
      params
    )
    for (const row of result) row.inserted ? created++ : updated++
  }

  return { created, updated }
}

// Alta masiva de listas de proveedores. Crea borradores para códigos nuevos y
// actualiza las variantes que ya tienen una asociación confirmada; nunca publica
// un artículo automáticamente ni rompe una familia unificada.
const pricePreviewRound = value => value == null || !Number.isFinite(Number(value))
  ? null
  : Math.round(Number(value) * 100) / 100

// El excel de un proveedor casi siempre respeta una única moneda, pero algunos
// códigos puntuales vienen en la otra. `row.currency` (cargado desde
// supplier_price_code_overrides antes de llamar a estas funciones) manda por
// sobre la moneda general del archivo cuando existe una excepción guardada.
function rowCurrency(row, file) {
  return row.currency || file.currency
}

function previewSourceValue(arsValue, usdValue, currency, usdArsRate) {
  if (currency === 'USD') {
    return pricePreviewRound(usdValue ?? (arsValue == null ? null : Number(arsValue) / usdArsRate))
  }
  return pricePreviewRound(arsValue)
}

function legacyOption(options, key, label) {
  if (!label || !Array.isArray(options)) return null
  return options.find(option =>
    String(option?.[key] || '').localeCompare(String(label), 'es-AR', { sensitivity: 'base' }) === 0
  ) || null
}

function mappedCurrentPrices(mapping, currency, usdArsRate) {
  if (mapping.variant_rule_id) {
    return {
      precioCosto: previewSourceValue(mapping.rule_precio_costo, mapping.rule_precio_costo_usd, currency, usdArsRate),
      precioVenta: previewSourceValue(mapping.rule_precio_venta, mapping.rule_precio_venta_usd, currency, usdArsRate),
      precioIva: previewSourceValue(mapping.rule_precio_iva, mapping.rule_precio_iva_usd, currency, usdArsRate),
    }
  }

  const option = mapping.color_name
    ? legacyOption(mapping.color_options, 'name', mapping.color_name)
    : mapping.size_label
      ? legacyOption(mapping.size_options, 'label', mapping.size_label)
      : null
  return {
    precioCosto: previewSourceValue(option?.priceCost ?? mapping.precio_costo, option?.priceCostUsd ?? mapping.precio_costo_usd, currency, usdArsRate),
    precioVenta: previewSourceValue(option?.price ?? mapping.precio_venta, option?.priceUsd ?? mapping.precio_venta_usd, currency, usdArsRate),
    precioIva: previewSourceValue(option?.priceWithTax ?? mapping.precio_iva, option?.priceWithTaxUsd ?? mapping.precio_iva_usd, currency, usdArsRate),
  }
}

function pricePreviewChanges(previous, row) {
  return [
    ['precioCosto', 'Precio costo', row.precio_costo],
    ['precioVenta', 'Precio venta', row.precio_venta],
    ['precioIva', 'Precio con IVA', row.precio_iva],
  ].filter(([, , next]) => next != null).map(([field, label, next]) => ({
    field,
    label,
    previous: previous?.[field] ?? null,
    next: pricePreviewRound(next),
    changed: previous?.[field] == null || Math.abs(Number(previous[field]) - Number(next)) >= 0.005,
  }))
}

// Analiza exactamente las mismas decisiones que aplicará la carga masiva, pero
// sin escribir. El detalle se usa tanto en la confirmación previa como en el
// comprobante posterior de la importación.
export async function previewSupplierPriceDrafts(client, files, usdArsRate) {
  const seenCodes = new Set()
  const fileResults = []
  let created = 0
  let updated = 0
  let unchanged = 0
  let skipped = 0

  for (const file of files) {
    const uniqueRows = []
    const duplicateItems = []
    for (const row of file.rows) {
      const codeKey = priceCodeKey(row.codigo)
      if (seenCodes.has(codeKey)) {
        duplicateItems.push({
          status: 'duplicate', codigo: row.codigo, descripcion: row.descripcion,
          reason: 'Código repetido en los archivos seleccionados', changes: [],
        })
        continue
      }
      seenCodes.add(codeKey)
      uniqueRows.push(row)
    }

    const sourceKeys = uniqueRows.map(row => priceCodeKey(row.codigo)).filter(Boolean)
    const { rows: mappings } = sourceKeys.length
      ? await client.query(
        `SELECT mapping.source_code_key, mapping.product_id, mapping.color_name,
                mapping.size_label, mapping.tone_name, mapping.variant_rule_id,
                product.codigo AS product_code,
                COALESCE(NULLIF(product.name, ''), NULLIF(product.descripcion, ''), product.codigo) AS product_name,
                product.precio_costo, product.precio_venta, product.precio_iva,
                product.precio_costo_usd, product.precio_venta_usd, product.precio_iva_usd,
                product.color_options, product.size_options,
                rule.precio_costo AS rule_precio_costo,
                rule.precio_venta AS rule_precio_venta,
                rule.precio_iva AS rule_precio_iva,
                rule.precio_costo_usd AS rule_precio_costo_usd,
                rule.precio_venta_usd AS rule_precio_venta_usd,
                rule.precio_iva_usd AS rule_precio_iva_usd
         FROM supplier_product_mappings mapping
         JOIN products product ON product.id = mapping.product_id
         LEFT JOIN product_variant_rules rule ON rule.id = mapping.variant_rule_id
         WHERE mapping.supplier = $1 AND mapping.source_code_key = ANY($2::text[])`,
        [file.supplier, sourceKeys]
      )
      : { rows: [] }
    const mappedByCode = new Map(mappings.map(mapping => [mapping.source_code_key, mapping]))
    const unmappedRows = uniqueRows.filter(row => !mappedByCode.has(priceCodeKey(row.codigo)))
    const unmappedCodes = unmappedRows.map(row => row.codigo)
    const { rows: existingProducts } = unmappedCodes.length
      ? await client.query(
        `SELECT id, codigo, supplier,
                COALESCE(NULLIF(name, ''), NULLIF(descripcion, ''), codigo) AS product_name,
                precio_costo, precio_venta, precio_iva,
                precio_costo_usd, precio_venta_usd, precio_iva_usd,
                color_options, size_options
         FROM products WHERE codigo = ANY($1::varchar[])`,
        [unmappedCodes]
      )
      : { rows: [] }
    const existingByCode = new Map(existingProducts.map(product => [product.codigo, product]))

    const items = []
    for (const row of uniqueRows) {
      const currency = rowCurrency(row, file)
      const mapping = mappedByCode.get(priceCodeKey(row.codigo))
      if (mapping) {
        const variant = [mapping.color_name, mapping.size_label, mapping.tone_name].filter(Boolean).join(' / ')
        const changes = pricePreviewChanges(mappedCurrentPrices(mapping, currency, usdArsRate), row)
        const hasChanges = changes.some(change => change.changed)
        items.push({
          status: hasChanges ? 'update' : 'unchanged',
          codigo: row.codigo,
          descripcion: row.descripcion,
          targetProductId: mapping.product_id,
          targetCode: mapping.product_code,
          targetName: mapping.product_name,
          variant: variant || null,
          currency,
          changes,
          ...(!hasChanges ? { reason: 'Los precios ya coinciden. No se realizará ningún cambio.' } : {}),
        })
        if (hasChanges) updated++
        else { unchanged++; skipped++ }
        continue
      }

      const existing = existingByCode.get(row.codigo)
      if (existing) {
        const previousSupplier = String(existing.supplier || '').trim()
        items.push({
          status: 'update', codigo: row.codigo, descripcion: row.descripcion,
          targetProductId: existing.id,
          targetCode: existing.codigo, targetName: existing.product_name,
          currency,
          reason: previousSupplier && previousSupplier !== file.supplier
            ? `Se asociará a ${file.supplier} (actualmente figura como ${previousSupplier}).`
            : `Se creará la asociación con ${file.supplier}.`,
          changes: pricePreviewChanges(mappedCurrentPrices(existing, currency, usdArsRate), row),
        })
        updated++
      } else {
        items.push({
          status: 'create', codigo: row.codigo, descripcion: row.descripcion,
          currency, changes: pricePreviewChanges(null, row),
        })
        created++
      }
    }

    items.push(...duplicateItems)
    skipped += duplicateItems.length
    const invalidItems = (file.invalidRows || []).map(row => ({
      status: 'invalid', codigo: row.codigo, descripcion: row.descripcion,
      rowNumber: row.rowNumber, reason: row.reason, changes: [],
    }))
    items.push(...invalidItems)
    skipped += invalidItems.length

    const fileCreated = items.filter(item => item.status === 'create').length
    const fileUpdated = items.filter(item => item.status === 'update').length
    const fileUnchanged = items.filter(item => item.status === 'unchanged').length
    const fileSkipped = items.length - fileCreated - fileUpdated
    fileResults.push({
      fileName: file.fileName,
      supplier: file.supplier,
      currency: file.currency,
      totalRows: file.totalRows,
      created: fileCreated,
      updated: fileUpdated,
      unchanged: fileUnchanged,
      skipped: fileSkipped,
      invalidRows: invalidItems.length,
      duplicateRows: duplicateItems.length,
      existingCount: items.filter(item => item.status === 'skipped').length,
      items,
    })
  }

  return { created, updated, unchanged, skipped, files: fileResults }
}

export async function createSupplierPriceDrafts(client, files, usdArsRate, preview = null) {
  const seenCodes = new Set()
  const fileResults = []
  let created = 0
  let updated = 0
  let unchanged = 0
  let skipped = 0

  for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
    const file = files[fileIndex]
    const previewItems = preview?.files?.[fileIndex]?.items || null
    const previewByCode = previewItems
      ? new Map(previewItems.filter(item => item.codigo).map(item => [priceCodeKey(item.codigo), item]))
      : null
    const uniqueRows = []
    let duplicateRows = 0

    for (const row of file.rows) {
      const codeKey = priceCodeKey(row.codigo)
      if (seenCodes.has(codeKey)) {
        duplicateRows++
        continue
      }
      seenCodes.add(codeKey)
      uniqueRows.push(row)
    }

    let fileCreated = 0
    let fileUpdated = 0
    const existingCodes = []
    const sourceKeys = uniqueRows.map(row => priceCodeKey(row.codigo)).filter(Boolean)
    const savedMappings = sourceKeys.length
      ? await client.query(
        `SELECT source_code_key, product_id
         FROM supplier_product_mappings
         WHERE supplier = $1 AND source_code_key = ANY($2::text[])`,
        [file.supplier, sourceKeys]
      )
      : { rows: [] }
    const mappedByCode = new Map(savedMappings.rows.map(mapping => [mapping.source_code_key, mapping]))
    const mappedRows = uniqueRows.filter(row => {
      const codeKey = priceCodeKey(row.codigo)
      return mappedByCode.has(codeKey) && (!previewByCode || previewByCode.get(codeKey)?.status === 'update')
    })
    const directExistingRows = previewByCode
      ? uniqueRows.filter(row => {
        const codeKey = priceCodeKey(row.codigo)
        const item = previewByCode.get(codeKey)
        return !mappedByCode.has(codeKey) && item?.status === 'update' && item.targetProductId
      })
      : []
    const unmappedRows = previewByCode
      ? uniqueRows.filter(row => previewByCode.get(priceCodeKey(row.codigo))?.status === 'create')
      : uniqueRows.filter(row => !mappedByCode.has(priceCodeKey(row.codigo)))

    const rowsToUpdate = [
      ...mappedRows.map(row => ({ row, productId: mappedByCode.get(priceCodeKey(row.codigo)).product_id })),
      ...directExistingRows.map(row => ({ row, productId: previewByCode.get(priceCodeKey(row.codigo)).targetProductId })),
    ]
    if (rowsToUpdate.length) {
      const mappedResult = await applyPriceUpdates(client, rowsToUpdate.map(({ row, productId }) => ({
        type: 'update',
        productId,
        sourceCode: row.codigo,
        currency: rowCurrency(row, file),
        precioCosto: row.precio_costo,
        precioVenta: row.precio_venta,
        precioIva: row.precio_iva,
      })), usdArsRate, file.supplier)
      fileUpdated += mappedResult.updated
    }
    if (directExistingRows.length) {
      await client.query(
        `UPDATE products SET supplier = $1, updated_at = NOW()
         WHERE id = ANY($2::uuid[])`,
        [file.supplier, directExistingRows.map(row => previewByCode.get(priceCodeKey(row.codigo)).targetProductId)]
      )
    }

    for (const batch of chunk(unmappedRows)) {
      const params = []
      for (const row of batch) {
        const currency = rowCurrency(row, file)
        const toArs = value => value == null
          ? null
          : Math.round((currency === 'USD' ? Number(value) * usdArsRate : Number(value)) * 100) / 100
        const costArs = toArs(row.precio_costo)
        const saleArs = toArs(row.precio_venta)
        const taxArs = toArs(row.precio_iva)
        const costUsd = row.precio_costo == null
          ? null
          : Math.round((currency === 'USD' ? Number(row.precio_costo) : Number(row.precio_costo) / usdArsRate) * 100) / 100
        const saleUsd = row.precio_venta == null
          ? null
          : Math.round((currency === 'USD' ? Number(row.precio_venta) : Number(row.precio_venta) / usdArsRate) * 100) / 100
        const taxUsd = row.precio_iva == null
          ? null
          : Math.round((currency === 'USD' ? Number(row.precio_iva) : Number(row.precio_iva) / usdArsRate) * 100) / 100
        params.push(
          row.codigo, row.descripcion, costArs, saleArs, taxArs, costUsd, saleUsd, taxUsd,
          currency, usdArsRate, file.supplier
        )
      }

      const { rows: inserted } = await client.query(
        `INSERT INTO products (
           codigo, descripcion, precio_costo, precio_venta, precio_iva,
           precio_costo_usd, precio_venta_usd, precio_iva_usd,
           price_currency, price_exchange_rate, supplier,
           source, price_updated_at, published
         )
         VALUES ${valuesClause(batch.length, 11, ["'price_list'", 'NOW()', 'FALSE'])}
         ON CONFLICT (codigo) DO NOTHING
         RETURNING codigo`,
        params
      )
      const insertedCodes = new Set(inserted.map(row => row.codigo))
      fileCreated += inserted.length
      existingCodes.push(...batch.filter(row => !insertedCodes.has(row.codigo)).map(row => row.codigo))
    }

    const unchangedRows = preview?.files?.[fileIndex]?.unchanged || 0
    const fileSkipped = Number(file.skipped || 0) + duplicateRows + existingCodes.length + unchangedRows
    created += fileCreated
    updated += fileUpdated
    unchanged += unchangedRows
    skipped += fileSkipped
    fileResults.push({
      fileName: file.fileName,
      supplier: file.supplier,
      currency: file.currency,
      totalRows: file.totalRows,
      created: fileCreated,
      updated: fileUpdated,
      unchanged: unchangedRows,
      skipped: fileSkipped,
      invalidRows: Number(file.skipped || 0),
      duplicateRows,
      existingCount: existingCodes.length,
      existingCodes: existingCodes.slice(0, 25),
    })
  }

  return { created, updated, unchanged, skipped, files: fileResults }
}

// La lista de precios se revisa antes de tocar la base. Este paso busca primero
// coincidencias exactas y, si no hay, rankea candidatos por similitud de codigo
// y descripcion para que el administrador corrija rapido el emparejamiento.
function similarityText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
}

// Clave estable para códigos de proveedor. Los espacios son solo formato:
// "CL-305 + Z-305" y "CL-305+Z-305" identifican el mismo artículo.
export function priceCodeKey(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '')
}

function diceSimilarity(left, right) {
  if (!left || !right) return 0
  if (left === right) return 1
  if (left.length < 2 || right.length < 2) return left === right ? 1 : 0
  const pairs = new Map()
  for (let i = 0; i < left.length - 1; i++) {
    const pair = left.slice(i, i + 2)
    pairs.set(pair, (pairs.get(pair) || 0) + 1)
  }
  let intersection = 0
  for (let i = 0; i < right.length - 1; i++) {
    const pair = right.slice(i, i + 2)
    const count = pairs.get(pair) || 0
    if (count) {
      intersection++
      pairs.set(pair, count - 1)
    }
  }
  return (2 * intersection) / (left.length + right.length - 2)
}

function commonPrefixScore(left, right) {
  let length = 0
  while (length < left.length && length < right.length && left[length] === right[length]) length++
  return length / Math.max(left.length, right.length, 1)
}

const PRICE_COLOR_SUFFIXES = Object.freeze({
  WW: { name: 'Warm white', hex: '#F5D08A' },
  CW: { name: 'Cool white', hex: '#E0F2FE' },
  NW: { name: 'Neutral white', hex: '#F1F5F9' },
  N: { name: 'Neutral white', hex: '#F1F5F9' },
  W: { name: 'White', hex: '#F8FAFC' },
  B: { name: 'Blue', hex: '#2563EB' },
  Y: { name: 'Yellow', hex: '#FACC15' },
  R: { name: 'Red', hex: '#DC2626' },
  G: { name: 'Green', hex: '#16A34A' },
  BK: { name: 'Black', hex: '#111827' },
  RGB: { name: 'RGB', hex: '#A855F7' },
})

// Solo considera sufijos conocidos: de ese modo un codigo que termina en una
// medida, potencia o version no se agrupa accidentalmente como color.
export function priceColorVariantFromCode(value, description = '') {
  const code = String(value || '').trim().toUpperCase()
  const match = code.match(/^(.*?)(?:-|_|\s+)(WW|CW|NW|RGB|BK|N|W|B|Y|R|G)$/)
  if (!match?.[1]) return null
  const suffix = match[2]
  let color = PRICE_COLOR_SUFFIXES[suffix]
  if (!color) return null
  const descriptionText = similarityText(description)
  if (suffix === 'W' && /(LUZFRIA|COOLWHITE|6000K|6500K)/.test(descriptionText)) {
    color = PRICE_COLOR_SUFFIXES.CW
  } else if (suffix === 'W' && /(LUZCALIDA|WARMWHITE|2700K|3000K)/.test(descriptionText)) {
    color = PRICE_COLOR_SUFFIXES.WW
  }
  return { familyCode: match[1].trim(), suffix, ...color }
}

export function priceProductSimilarity(source, product) {
  const sourceCode = similarityText(source.codigo)
  const productCode = similarityText(product.codigo)
  const sourceDescription = similarityText(source.descripcion)
  const productDescription = similarityText(`${product.nombre || ''} ${product.descripcion || ''}`)
  return (
    diceSimilarity(sourceCode, productCode) * 0.68 +
    commonPrefixScore(sourceCode, productCode) * 0.22 +
    diceSimilarity(sourceDescription, productDescription) * 0.1
  )
}

function closestProducts(source, products, limit = 10, excludedProductId = null) {
  const closest = []
  for (const product of products) {
    if (excludedProductId && product.id === excludedProductId) continue
    const score = priceProductSimilarity(source, product)
    closest.push({ product, score })
    closest.sort((a, b) => b.score - a.score || a.product.codigo.localeCompare(b.product.codigo))
    if (closest.length > limit) closest.pop()
  }
  return closest.map(({ product, score }) => ({ ...product, similarity: Math.round(score * 100) }))
}

export async function matchPriceRows(client, rows, supplier = null) {
  if (!rows.length) return []
  const [productResult, mappingResult] = await Promise.all([
    client.query(
      `SELECT id, codigo, COALESCE(NULLIF(name, ''), descripcion, codigo) AS nombre,
              descripcion, image_url, precio_costo, precio_venta, precio_iva, precio_costo_usd
       FROM products`
    ),
    supplier
      ? client.query(
        `SELECT m.source_code_key, m.color_name, m.color_hex,
                p.id, p.codigo, COALESCE(NULLIF(p.name, ''), p.descripcion, p.codigo) AS nombre,
                p.descripcion, p.image_url, p.precio_costo, p.precio_venta, p.precio_iva, p.precio_costo_usd
         FROM supplier_product_mappings m
         JOIN products p ON p.id = m.product_id
         WHERE m.supplier = $1`,
        [supplier]
      )
      : Promise.resolve({ rows: [] }),
  ])
  const products = productResult.rows
  const byCode = new Map(products.map((product) => [priceCodeKey(product.codigo), product]))
  const savedMappings = new Map(mappingResult.rows.map(mapping => [mapping.source_code_key, mapping]))
  const matchedRows = rows.map((row) => {
    const savedMapping = savedMappings.get(priceCodeKey(row.codigo)) || null
    const match = savedMapping || byCode.get(priceCodeKey(row.codigo)) || null
    const savedColor = savedMapping?.color_name ? {
      ...(priceColorVariantFromCode(row.codigo, row.descripcion) || { familyCode: row.codigo, suffix: null }),
      name: savedMapping.color_name,
      hex: savedMapping.color_hex || '#CCCCCC',
      product: savedMapping,
    } : null
    return {
      ...row,
      match,
      matchType: savedMapping ? 'saved' : match ? 'exact' : null,
      suggestions: closestProducts(row, products, 10, match?.id),
      colorRecommendation: savedColor,
    }
  })

  const colorFamilies = new Map()
  for (const row of matchedRows) {
    const color = priceColorVariantFromCode(row.codigo, row.descripcion)
    if (!color) continue
    if (!colorFamilies.has(color.familyCode)) colorFamilies.set(color.familyCode, [])
    colorFamilies.get(color.familyCode).push({ row, color })
  }

  for (const [familyCode, family] of colorFamilies) {
    // La familia se confirma solamente cuando cambian los sufijos de color.
    // Una unica fila terminada en -B, por ejemplo, no alcanza para inferirla.
    if (family.length < 2 || new Set(family.map(item => item.color.suffix)).size < 2) continue

    const exactFamilyProduct = byCode.get(priceCodeKey(familyCode)) || null
    const rankedFamilyProducts = exactFamilyProduct
      ? [{ ...exactFamilyProduct, similarity: 100 }]
      : closestProducts({ codigo: familyCode, descripcion: family[0].row.descripcion }, products, 10)
    const recommendedProduct = rankedFamilyProducts[0]?.similarity >= 55
      ? rankedFamilyProducts[0]
      : null

    for (const { row, color } of family) {
      if (row.matchType === 'saved') continue
      row.colorRecommendation = {
        ...color,
        product: recommendedProduct,
      }
      if (recommendedProduct && !row.suggestions.some(product => product.id === recommendedProduct.id)) {
        row.suggestions = [recommendedProduct, ...row.suggestions].slice(0, 10)
      } else if (recommendedProduct) {
        row.suggestions = [
          recommendedProduct,
          ...row.suggestions.filter(product => product.id !== recommendedProduct.id),
        ].slice(0, 10)
      }
    }
  }

  return matchedRows
}

// Aplica exclusivamente lineas ya revisadas. Los precios publicos se conservan
// en ARS; si la fuente esta en USD se convierten con la cotizacion vigente. El
// costo en USD tambien se guarda para no perder el valor original del proveedor.
export async function applyPriceUpdates(client, actions, usdArsRate, supplier = null) {
  let created = 0
  let updated = 0
  const confirmedMappings = []
  const savedVariantMappings = new Map()

  if (supplier) {
    const sourceKeys = actions
      .map(action => priceCodeKey(action.sourceCode))
      .filter(Boolean)
    if (sourceKeys.length) {
      const { rows } = await client.query(
        `SELECT source_code_key, color_name, color_hex, size_label, tone_name, variant_rule_id
         FROM supplier_product_mappings
         WHERE supplier = $1 AND source_code_key = ANY($2::text[])`,
        [supplier, sourceKeys]
      )
      rows.forEach(mapping => savedVariantMappings.set(mapping.source_code_key, mapping))
    }
  }

  for (const action of actions) {
    const savedVariant = savedVariantMappings.get(priceCodeKey(action.sourceCode))
    const colorVariant = action.colorVariant || (savedVariant?.color_name ? {
      name: savedVariant.color_name,
      hex: savedVariant.color_hex || '#CCCCCC',
    } : null)
    const sizeVariant = action.sizeVariant || (savedVariant?.size_label ? {
      label: savedVariant.size_label,
    } : null)
    let mappedProductId = action.productId || null
    const currency = action.currency === 'USD' ? 'USD' : 'ARS'
    const convertToArs = (value) => value == null
      ? null
      : Math.round((currency === 'USD' ? value * usdArsRate : value) * 100) / 100
    const costArs = convertToArs(action.precioCosto)
    const saleArs = convertToArs(action.precioVenta)
    const taxArs = convertToArs(action.precioIva)
    const costUsd = action.precioCosto == null
      ? null
      : Math.round((currency === 'USD' ? action.precioCosto : action.precioCosto / usdArsRate) * 100) / 100
    const saleUsd = action.precioVenta == null
      ? null
      : Math.round((currency === 'USD' ? action.precioVenta : action.precioVenta / usdArsRate) * 100) / 100
    const taxUsd = action.precioIva == null
      ? null
      : Math.round((currency === 'USD' ? action.precioIva : action.precioIva / usdArsRate) * 100) / 100

    if (action.type === 'create') {
      const { rows } = await client.query(
        `INSERT INTO products (
           codigo, descripcion, precio_costo, precio_venta, precio_iva,
           precio_costo_usd, precio_venta_usd, precio_iva_usd,
           price_currency, price_exchange_rate,
           source, supplier, price_updated_at, published
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'price_list', $11, NOW(), FALSE)
         RETURNING id`,
        [action.codigo, action.descripcion, costArs, saleArs, taxArs, costUsd, saleUsd, taxUsd, currency, usdArsRate, action.supplier || 'OTRO']
      )
      mappedProductId = rows[0]?.id || null
      created++
    } else if (savedVariant?.variant_rule_id) {
      updated += await updateVariantRulePrice(client, savedVariant.variant_rule_id, {
        costArs, saleArs, taxArs, costUsd, saleUsd, taxUsd, currency, usdArsRate,
      })
    } else if (colorVariant) {
      const { rows } = await client.query(
        `SELECT color_options, precio_costo, precio_venta, precio_iva,
                precio_costo_usd, precio_venta_usd, precio_iva_usd
         FROM products WHERE id = $1`,
        [action.productId]
      )
      const product = rows[0]
      const currentColors = Array.isArray(product?.color_options) ? product.color_options : []
      const colorIndex = currentColors.findIndex(color =>
        String(color?.name || '').localeCompare(colorVariant.name, 'es-AR', { sensitivity: 'base' }) === 0
      )
      const previousColor = colorIndex >= 0 ? currentColors[colorIndex] : {}
      const color = {
        ...previousColor,
        name: colorVariant.name,
        hex: colorVariant.hex,
        image: previousColor.image || '',
        supplierCode: action.sourceCode || previousColor.supplierCode || null,
        price: saleArs ?? previousColor.price ?? (product?.precio_venta == null ? null : Number(product.precio_venta)),
        priceCost: costArs ?? previousColor.priceCost ?? (product?.precio_costo == null ? null : Number(product.precio_costo)),
        priceWithTax: taxArs ?? previousColor.priceWithTax ?? (product?.precio_iva == null ? null : Number(product.precio_iva)),
        priceUsd: saleUsd ?? previousColor.priceUsd ?? null,
        priceCostUsd: costUsd ?? previousColor.priceCostUsd ?? null,
        priceWithTaxUsd: taxUsd ?? previousColor.priceWithTaxUsd ?? null,
      }
      const nextColors = [...currentColors]
      if (colorIndex >= 0) nextColors[colorIndex] = color
      else nextColors.push(color)

      const minimumColorValue = (key, fallback) => {
        const values = nextColors
          .map(item => item?.[key])
          .filter(value => value != null && Number.isFinite(Number(value)))
          .map(Number)
        return values.length ? Math.min(...values) : fallback == null ? null : Number(fallback)
      }
      const { rowCount } = await client.query(
        `UPDATE products
         SET color_options = $1::jsonb,
             precio_costo = $2,
             precio_venta = $3,
             precio_iva = $4,
             precio_costo_usd = $5,
             precio_venta_usd = $6,
             precio_iva_usd = $7,
             price_currency = $8,
             price_exchange_rate = $9,
             price_updated_at = NOW(),
             updated_at = NOW()
         WHERE id = $10`,
        [
          JSON.stringify(nextColors),
          minimumColorValue('priceCost', product?.precio_costo),
          minimumColorValue('price', product?.precio_venta),
          minimumColorValue('priceWithTax', product?.precio_iva),
          minimumColorValue('priceCostUsd', product?.precio_costo_usd),
          minimumColorValue('priceUsd', product?.precio_venta_usd),
          minimumColorValue('priceWithTaxUsd', product?.precio_iva_usd),
          currency,
          usdArsRate,
          action.productId,
        ]
      )
      updated += rowCount
    } else if (sizeVariant) {
      const { rows } = await client.query(
        `SELECT size_options, precio_costo, precio_venta, precio_iva,
                precio_costo_usd, precio_venta_usd, precio_iva_usd
         FROM products WHERE id = $1`,
        [action.productId]
      )
      const product = rows[0]
      const currentSizes = Array.isArray(product?.size_options) ? product.size_options : []
      const sizeIndex = currentSizes.findIndex(size =>
        String(size?.label || '').localeCompare(sizeVariant.label, 'es-AR', { sensitivity: 'base' }) === 0
      )
      const previousSize = sizeIndex >= 0 ? currentSizes[sizeIndex] : {}
      const size = {
        ...previousSize,
        label: sizeVariant.label,
        supplierCode: action.sourceCode || previousSize.supplierCode || null,
        price: saleArs ?? previousSize.price ?? (product?.precio_venta == null ? null : Number(product.precio_venta)),
        priceCost: costArs ?? previousSize.priceCost ?? (product?.precio_costo == null ? null : Number(product.precio_costo)),
        priceWithTax: taxArs ?? previousSize.priceWithTax ?? (product?.precio_iva == null ? null : Number(product.precio_iva)),
        priceUsd: saleUsd ?? previousSize.priceUsd ?? null,
        priceCostUsd: costUsd ?? previousSize.priceCostUsd ?? null,
        priceWithTaxUsd: taxUsd ?? previousSize.priceWithTaxUsd ?? null,
      }
      const nextSizes = [...currentSizes]
      if (sizeIndex >= 0) nextSizes[sizeIndex] = size
      else nextSizes.push(size)

      const minimumSizeValue = (key, fallback) => {
        const values = nextSizes
          .map(item => item?.[key])
          .filter(value => value != null && Number.isFinite(Number(value)))
          .map(Number)
        return values.length ? Math.min(...values) : fallback == null ? null : Number(fallback)
      }
      const { rowCount } = await client.query(
        `UPDATE products
         SET size_options = $1::jsonb,
             precio_costo = $2, precio_venta = $3, precio_iva = $4,
             precio_costo_usd = $5, precio_venta_usd = $6, precio_iva_usd = $7,
             price_currency = $8, price_exchange_rate = $9,
             price_updated_at = NOW(), updated_at = NOW()
         WHERE id = $10`,
        [
          JSON.stringify(nextSizes),
          minimumSizeValue('priceCost', product?.precio_costo),
          minimumSizeValue('price', product?.precio_venta),
          minimumSizeValue('priceWithTax', product?.precio_iva),
          minimumSizeValue('priceCostUsd', product?.precio_costo_usd),
          minimumSizeValue('priceUsd', product?.precio_venta_usd),
          minimumSizeValue('priceWithTaxUsd', product?.precio_iva_usd),
          currency, usdArsRate, action.productId,
        ]
      )
      updated += rowCount
    } else {
      const { rowCount } = await client.query(
        `UPDATE products
         SET precio_costo = COALESCE($1, precio_costo),
             precio_venta = COALESCE($2, precio_venta),
             precio_iva = COALESCE($3, precio_iva),
             precio_costo_usd = COALESCE($4, precio_costo_usd),
             precio_venta_usd = COALESCE($5, precio_venta_usd),
             precio_iva_usd = COALESCE($6, precio_iva_usd),
             price_currency = $7,
             price_exchange_rate = $8,
             price_updated_at = NOW(),
             updated_at = NOW()
         WHERE id = $9`,
        [costArs, saleArs, taxArs, costUsd, saleUsd, taxUsd, currency, usdArsRate, action.productId]
      )
      updated += rowCount
    }

    if (supplier && action.sourceCode && mappedProductId) {
      confirmedMappings.push({
        sourceCode: action.sourceCode,
        sourceCodeKey: priceCodeKey(action.sourceCode),
        productId: mappedProductId,
        colorName: colorVariant?.name || null,
        colorHex: colorVariant?.hex || null,
        sizeLabel: sizeVariant?.label || null,
      })
    }
  }

  const uniqueMappings = [...new Map(confirmedMappings.map(mapping => [mapping.sourceCodeKey, mapping])).values()]
  if (uniqueMappings.length) {
    await client.query(
      `INSERT INTO supplier_product_mappings (
         supplier, source_code, source_code_key, product_id, color_name, color_hex, size_label
       )
       SELECT $2, mapping.source_code, mapping.source_code_key,
              mapping.product_id::uuid, mapping.color_name, mapping.color_hex, mapping.size_label
       FROM jsonb_to_recordset($1::jsonb) AS mapping(
         source_code text, source_code_key text, product_id text,
         color_name text, color_hex text, size_label text
       )
       ON CONFLICT (supplier, source_code_key) DO UPDATE
       SET source_code = EXCLUDED.source_code,
           product_id = EXCLUDED.product_id,
           color_name = EXCLUDED.color_name,
           color_hex = EXCLUDED.color_hex,
           size_label = EXCLUDED.size_label,
           updated_at = NOW()`,
      [JSON.stringify(uniqueMappings.map(mapping => ({
        source_code: mapping.sourceCode,
        source_code_key: mapping.sourceCodeKey,
        product_id: mapping.productId,
        color_name: mapping.colorName,
        color_hex: mapping.colorHex,
        size_label: mapping.sizeLabel,
      }))), supplier]
    )
  }

  return { created, updated, mappingsSaved: uniqueMappings.length }
}

// ── 3. Comprobante de venta — descuenta stock, nunca clampea a 0 ──────────────
export async function applySaleDecrement(client, lines) {
  // Agrupa por código por si el mismo producto aparece en más de un renglón,
  // así el UPDATE ... FROM VALUES no procesa el mismo código dos veces.
  const byCodigo = new Map()
  for (const l of lines) {
    byCodigo.set(l.codigo, (byCodigo.get(l.codigo) || 0) + l.cantidad)
  }
  const entries = [...byCodigo.entries()]
  if (entries.length === 0) return { updated: 0, unmatched: [] }

  const params = []
  for (const [codigo, cantidad] of entries) params.push(codigo, cantidad)

  const { rows: result } = await client.query(
    `UPDATE products AS p
     SET stock = p.stock - v.cantidad::integer, stock_updated_at = NOW(), updated_at = NOW()
     FROM (VALUES ${valuesClause(entries.length, 2)}) AS v(codigo, cantidad)
     WHERE p.codigo = v.codigo::varchar
     RETURNING p.codigo`,
    params
  )

  const matched = new Set(result.map((r) => r.codigo))
  const unmatched = entries
    .filter(([codigo]) => !matched.has(codigo))
    .map(([codigo, cantidad]) => ({ codigo, cantidad }))

  return { updated: result.length, unmatched }
}

// ── 4. Orden de compra (KIAN) — suma stock, crea productos nuevos ─────────────
export async function applyPurchaseIncrement(client, lines) {
  // Agrupa por código por si el mismo código aparece en más de una fila del
  // pedido, ya que ON CONFLICT no admite tocar la misma fila dos veces en un
  // mismo statement.
  const byCodigo = new Map()
  for (const l of lines) {
    const prev = byCodigo.get(l.codigo)
    if (prev) {
      prev.totalUnidades += l.totalUnidades
      prev.precioFinalUsd = l.precioFinalUsd ?? prev.precioFinalUsd
      prev.descripcion = prev.descripcion || l.descripcion
      prev.watts = prev.watts ?? l.watts
    } else {
      byCodigo.set(l.codigo, { ...l })
    }
  }
  const entries = [...byCodigo.values()]
  if (entries.length === 0) return { created: 0, updated: 0 }

  let created = 0
  let updated = 0

  for (const batch of chunk(entries)) {
    const params = []
    for (const l of batch) params.push(l.codigo, l.descripcion, l.watts, l.totalUnidades, l.precioFinalUsd)

    const { rows: result } = await client.query(
      `INSERT INTO products (codigo, descripcion, watts, stock, precio_costo_usd, source, supplier, stock_updated_at)
       VALUES ${valuesClause(batch.length, 5, ["'purchase'", "'KIAN'", 'NOW()'])}
       ON CONFLICT (codigo) DO UPDATE SET
         stock             = products.stock + EXCLUDED.stock,
         precio_costo_usd  = EXCLUDED.precio_costo_usd,
         supplier          = 'KIAN',
         stock_updated_at  = NOW(),
         updated_at        = NOW()
       RETURNING (xmax = 0) AS inserted`,
      params
    )
    for (const row of result) row.inserted ? created++ : updated++
  }

  return { created, updated }
}

// ── 5. Factura/remito PDF — busca coincidencia por código embebido en la ─────
// descripción del proveedor. Nunca escribe nada: el admin confirma cada línea
// en el frontend antes de que se llame a applyInvoiceLines.
export async function matchInvoiceLines(client, items) {
  const results = []
  for (const item of items) {
    let match = null
    if (item.codigoCandidato) {
      const { rows } = await client.query(
        `SELECT * FROM products WHERE codigo = $1 OR descripcion ILIKE $2
         ORDER BY (codigo = $1) DESC LIMIT 1`,
        [item.codigoCandidato, `%${item.codigoCandidato}%`]
      )
      match = rows[0] || null
    }
    results.push({ ...item, match })
  }
  return results
}

// ── 6. Aplicar factura/remito PDF ya revisada por el admin ───────────────────
// 'update' suma stock a un producto existente; 'create' da de alta uno nuevo
// con el stock inicial (o suma si el código ya existe, por si dos líneas de
// la misma factura crean el mismo código nuevo).
export async function applyInvoiceLines(client, actions) {
  let created = 0
  let updated = 0

  for (const action of actions) {
    if (action.type === 'update') {
      const { rowCount } = await client.query(
        `UPDATE products SET stock = stock + $1,
           precio_costo_usd = COALESCE($2, precio_costo_usd),
           stock_updated_at = NOW(), updated_at = NOW()
         WHERE id = $3`,
        [action.cantidad, action.precioUsd ?? null, action.productId]
      )
      if (rowCount) updated++
    } else if (action.type === 'create') {
      const { rows } = await client.query(
        `INSERT INTO products (codigo, descripcion, stock, precio_costo_usd, source, stock_updated_at)
         VALUES ($1, $2, $3, $4, 'purchase', NOW())
         ON CONFLICT (codigo) DO UPDATE SET
           stock             = products.stock + EXCLUDED.stock,
           precio_costo_usd  = EXCLUDED.precio_costo_usd,
           stock_updated_at  = NOW(),
           updated_at        = NOW()
         RETURNING (xmax = 0) AS inserted`,
        [action.codigo, action.descripcion ?? null, action.cantidad, action.precioUsd ?? null]
      )
      rows[0]?.inserted ? created++ : updated++
    }
  }

  return { created, updated }
}
