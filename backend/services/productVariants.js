const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const cleanLabel = value => {
  const label = String(value || '').trim()
  return label ? label.slice(0, 100) : null
}

const codeKey = value => String(value || '').trim().toUpperCase().replace(/\s+/g, '')
const numberOrNull = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)
const same = (left, right) => String(left || '').localeCompare(String(right || ''), 'es-AR', { sensitivity: 'base' }) === 0

export function mergeRuleValues(product, assignment = {}) {
  const has = field => Object.prototype.hasOwnProperty.call(assignment, field)
  const readPrice = (field, fallback) => has(field) ? numberOrNull(assignment[field]) : numberOrNull(fallback)
  const saleArs = readPrice('precioVenta', product?.precio_venta)
  const taxArs = readPrice('precioIva', product?.precio_iva)
  const rawStock = has('stock') ? assignment.stock : product?.stock
  const stock = rawStock == null || rawStock === '' ? 0 : Number(rawStock)
  if ((has('precioVenta') && assignment.precioVenta !== '' && saleArs == null) || saleArs < 0 ||
      (has('precioIva') && assignment.precioIva !== '' && taxArs == null) || taxArs < 0 ||
      !Number.isInteger(stock) || stock < 0) {
    throw new Error(`Hay precios o stock inválidos en ${product?.codigo || 'una variante'}`)
  }

  const currency = product?.price_currency || 'ARS'
  const rate = Number(product?.price_exchange_rate) || 1510
  const toUsd = value => value == null ? null : Math.round(value / rate * 100) / 100
  return {
    saleArs,
    taxArs,
    stock,
    saleUsd: currency === 'USD' && has('precioVenta') ? toUsd(saleArs) : product?.precio_venta_usd,
    taxUsd: currency === 'USD' && has('precioIva') ? toUsd(taxArs) : product?.precio_iva_usd,
  }
}

const cleanHex = value => /^#[0-9a-f]{6}$/i.test(String(value || '').trim())
  ? String(value).trim().toUpperCase()
  : null

const VARIANT_TEXT_LIMITS = {
  codigo: 200, name: 200, description: 5000, inventoryDescription: 5000,
  grupo: 150, subgrupo: 150, medida: 100, supplier: 80,
  category: 100, subcategory: 150, ipRating: 20, material: 100,
  cableType: 100, productType: 150, hoverImage: 2000,
}
const VARIANT_NUMBER_FIELDS = ['watts', 'amperes', 'colorTemp', 'lengthCm', 'widthCm', 'heightCm', 'weightKg']

export function variantProductSnapshot(product = {}) {
  return {
    codigo: product.codigo || '',
    name: product.name || '',
    description: product.description_larga ?? product.description ?? '',
    inventoryDescription: product.descripcion ?? product.inventoryDescription ?? '',
    grupo: product.grupo || '', subgrupo: product.subgrupo || '', medida: product.medida || '',
    supplier: product.supplier || '', category: product.category || '', subcategory: product.subcategory || '',
    watts: numberOrNull(product.watts), amperes: numberOrNull(product.amperes), colorTemp: numberOrNull(product.color_temp ?? product.colorTemp),
    ipRating: product.ip_rating ?? product.ipRating ?? '', material: product.material || '',
    cableType: product.cable_type ?? product.cableType ?? '', productType: product.product_type ?? product.productType ?? '',
    lengthCm: numberOrNull(product.length_cm ?? product.lengthCm), widthCm: numberOrNull(product.width_cm ?? product.widthCm),
    heightCm: numberOrNull(product.height_cm ?? product.heightCm), weightKg: numberOrNull(product.weight_kg ?? product.weightKg),
    hoverImage: product.hover_image_url ?? product.hoverImage ?? '',
  }
}

export function normalizeVariantProductData(value, fallback = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const base = variantProductSnapshot(fallback)
  const normalized = {}
  for (const [field, limit] of Object.entries(VARIANT_TEXT_LIMITS)) {
    const raw = Object.prototype.hasOwnProperty.call(source, field) ? source[field] : base[field]
    normalized[field] = String(raw ?? '').trim().slice(0, limit)
  }
  for (const field of VARIANT_NUMBER_FIELDS) {
    const raw = Object.prototype.hasOwnProperty.call(source, field) ? source[field] : base[field]
    normalized[field] = numberOrNull(raw)
  }
  return normalized
}

export function ruleSpecificity(rule) {
  return ['color_name', 'size_label', 'tone_name'].reduce((total, key) => total + (rule?.[key] ? 1 : 0), 0)
}

export function ruleMatches(rule, selection = {}) {
  return (!rule.color_name || same(rule.color_name, selection.color)) &&
    (!rule.size_label || same(rule.size_label, selection.size)) &&
    (!rule.tone_name || same(rule.tone_name, selection.tone))
}

function rulesOverlap(left, right) {
  return ['color_name', 'size_label', 'tone_name'].every(key =>
    !left[key] || !right[key] || same(left[key], right[key])
  )
}

export function findRuleAmbiguity(rules) {
  for (let leftIndex = 0; leftIndex < rules.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < rules.length; rightIndex++) {
      const left = rules[leftIndex]
      const right = rules[rightIndex]
      if (ruleSpecificity(left) === ruleSpecificity(right) && rulesOverlap(left, right)) {
        return { left, right }
      }
    }
  }
  return null
}

export function resolveVariantRule(rules, selection, field = 'precio_venta') {
  const matches = (Array.isArray(rules) ? rules : [])
    .filter(rule => rule?.[field] != null && ruleMatches(rule, selection))
    .sort((left, right) => ruleSpecificity(right) - ruleSpecificity(left))
  if (!matches.length) return null
  if (matches[1] && ruleSpecificity(matches[0]) === ruleSpecificity(matches[1])) return { error: 'ambiguous_variant' }
  return matches[0]
}

function optionValue(options, key, label, field) {
  if (!label) return null
  const option = (Array.isArray(options) ? options : []).find(item => same(item?.[key], label))
  return numberOrNull(option?.[field])
}

function legacyPrice(product, color, size, tone, field, optionField) {
  return optionValue(product.size_options, 'label', size, optionField) ??
    optionValue(product.tone_options, 'name', tone, optionField) ??
    optionValue(product.color_options, 'name', color, optionField) ??
    numberOrNull(product[field])
}

async function normalizeLegacyStock(client, product) {
  const existing = await client.query('SELECT id FROM product_variant_rules WHERE product_id = $1 LIMIT 1', [product.id])
  if (existing.rows.length) return
  const variantStock = product.variant_stock && typeof product.variant_stock === 'object' ? product.variant_stock : {}
  const stockRows = Object.entries(variantStock)
  if (stockRows.length) {
    for (const [rowKey, sizes] of stockRows) {
      const separator = rowKey.includes(' / ') ? rowKey.split(' / ') : [rowKey, null]
      const colorOrTone = separator[0] === '_' ? null : separator[0]
      const hasColors = Array.isArray(product.color_options) && product.color_options.length > 0
      const color = hasColors ? colorOrTone : null
      const tone = hasColors ? separator[1] : colorOrTone
      for (const [sizeKey, stock] of Object.entries(sizes || {})) {
        const size = sizeKey === '_' ? null : sizeKey
        await client.query(
          `INSERT INTO product_variant_rules
             (product_id, color_name, size_label, tone_name,
              precio_costo, precio_venta, precio_iva,
              precio_costo_usd, precio_venta_usd, precio_iva_usd,
              price_currency, price_exchange_rate, stock)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [product.id, color, size, tone,
            legacyPrice(product, color, size, tone, 'precio_costo', 'priceCost'),
            legacyPrice(product, color, size, tone, 'precio_venta', 'price'),
            legacyPrice(product, color, size, tone, 'precio_iva', 'priceWithTax'),
            legacyPrice(product, color, size, tone, 'precio_costo_usd', 'priceCostUsd'),
            legacyPrice(product, color, size, tone, 'precio_venta_usd', 'priceUsd'),
            legacyPrice(product, color, size, tone, 'precio_iva_usd', 'priceWithTaxUsd'),
            product.price_currency || 'ARS', product.price_exchange_rate, Math.max(0, Number(stock) || 0)]
        )
      }
    }
  } else {
    const colors = (Array.isArray(product.color_options) ? product.color_options : []).map(option => option?.name).filter(Boolean)
    const sizes = (Array.isArray(product.size_options) ? product.size_options : []).map(option => option?.label).filter(Boolean)
    const tones = (Array.isArray(product.tone_options) ? product.tone_options : []).map(option => option?.name).filter(Boolean)
    const hasOptions = colors.length || sizes.length || tones.length
    if (hasOptions) {
      for (const color of (colors.length ? colors : [null])) {
        for (const size of (sizes.length ? sizes : [null])) {
          for (const tone of (tones.length ? tones : [null])) {
            await client.query(
              `INSERT INTO product_variant_rules
                 (product_id,color_name,size_label,tone_name,precio_costo,precio_venta,precio_iva,
                  precio_costo_usd,precio_venta_usd,precio_iva_usd,price_currency,price_exchange_rate,stock)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NULL)`,
              [product.id, color, size, tone,
                legacyPrice(product, color, size, tone, 'precio_costo', 'priceCost'),
                legacyPrice(product, color, size, tone, 'precio_venta', 'price'),
                legacyPrice(product, color, size, tone, 'precio_iva', 'priceWithTax'),
                legacyPrice(product, color, size, tone, 'precio_costo_usd', 'priceCostUsd'),
                legacyPrice(product, color, size, tone, 'precio_venta_usd', 'priceUsd'),
                legacyPrice(product, color, size, tone, 'precio_iva_usd', 'priceWithTaxUsd'),
                product.price_currency || 'ARS', product.price_exchange_rate]
            )
          }
        }
      }
    }
    await client.query(
      `INSERT INTO product_variant_rules (product_id, price_currency, price_exchange_rate, stock)
       VALUES ($1,$2,$3,$4)`,
      [product.id, product.price_currency || 'ARS', product.price_exchange_rate, Math.max(0, Number(product.stock) || 0)]
    )
  }
}

function appendOption(options, key, value, extra = {}) {
  if (!value) return Array.isArray(options) ? options : []
  const current = Array.isArray(options) ? [...options] : []
  if (!current.some(option => same(option?.[key], value))) current.push({ [key]: value, ...extra })
  return current
}

export async function recomputeGroupedProduct(client, productId) {
  const [{ rows: products }, { rows: rules }] = await Promise.all([
    client.query('SELECT * FROM products WHERE id = $1', [productId]),
    client.query('SELECT * FROM product_variant_rules WHERE product_id = $1', [productId]),
  ])
  const product = products[0]
  if (!product || !rules.length) return product
  const min = (ruleField, optionField) => {
    const values = rules.map(rule => numberOrNull(rule[ruleField]))
    for (const list of [product.color_options, product.size_options, product.tone_options]) {
      for (const option of Array.isArray(list) ? list : []) values.push(numberOrNull(option?.[optionField]))
    }
    const valid = values.filter(value => value != null)
    return valid.length ? Math.min(...valid) : null
  }
  const stock = rules.reduce((total, rule) => total + (rule.stock == null ? 0 : Math.max(0, Number(rule.stock) || 0)), 0)
  const { rows } = await client.query(
    `UPDATE products SET precio_costo=$1, precio_venta=$2, precio_iva=$3,
       precio_costo_usd=$4, precio_venta_usd=$5, precio_iva_usd=$6,
       stock=$7, updated_at=NOW() WHERE id=$8 RETURNING *`,
    [min('precio_costo', 'priceCost'), min('precio_venta', 'price'), min('precio_iva', 'priceWithTax'),
      min('precio_costo_usd', 'priceCostUsd'), min('precio_venta_usd', 'priceUsd'), min('precio_iva_usd', 'priceWithTaxUsd'),
      stock, productId]
  )
  return rows[0]
}

export async function loadMergePreview(client, rawIds) {
  const ids = [...new Set((Array.isArray(rawIds) ? rawIds : []).map(String))]
  if (ids.length < 2 || ids.length > 200 || ids.some(id => !UUID_PATTERN.test(id))) {
    throw new Error('Seleccioná entre 2 y 200 productos válidos para unir')
  }
  const { rows: products } = await client.query(
    `SELECT p.*,
       (SELECT COUNT(*)::integer FROM product_variant_rules vr WHERE vr.product_id=p.id) AS variant_rule_count,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'id', vr.id, 'color', vr.color_name, 'colorHex', vr.color_hex, 'size', vr.size_label, 'tone', vr.tone_name, 'toneHex', vr.tone_hex,
           'image', vr.image_url, 'productData', vr.product_data, 'precio_venta', vr.precio_venta, 'precio_iva', vr.precio_iva,
           'stock', vr.stock,
           'supplierCodes', COALESCE((
             SELECT jsonb_agg(m.source_code ORDER BY m.source_code)
             FROM supplier_product_mappings m WHERE m.variant_rule_id=vr.id
           ), '[]'::jsonb)
         ) ORDER BY vr.created_at)
         FROM product_variant_rules vr WHERE vr.product_id=p.id
       ), '[]'::jsonb) AS variant_rules
     FROM products p WHERE p.id=ANY($1::uuid[]) ORDER BY p.codigo`, [ids]
  )
  if (products.length !== ids.length) throw new Error('Uno o más productos seleccionados ya no existen')
  const suppliers = new Set(products.map(product => String(product.supplier || '').trim().toUpperCase()))
  if (suppliers.size !== 1) throw new Error('Sólo se pueden unir productos del mismo proveedor')
  return products.map(product => ({
    ...product,
    isGrouped: Number(product.variant_rule_count) > 1 ||
      (Number(product.variant_rule_count) === 0 && (
        (product.color_options || []).length > 0 || (product.size_options || []).length > 0 || (product.tone_options || []).length > 0
      )),
  }))
}

export async function mergeProducts(client, payload) {
  let products = await loadMergePreview(client, payload.productIds)
  await client.query('SELECT id FROM products WHERE id=ANY($1::uuid[]) FOR UPDATE', [products.map(product => product.id)])
  products = await loadMergePreview(client, payload.productIds)
  const baseId = String(payload.baseProductId || '')
  const base = products.find(product => product.id === baseId)
  if (!base) throw new Error('Elegí un producto base válido')
  const grouped = products.filter(product => product.isGrouped)
  if (grouped.length > 1 || (grouped.length === 1 && grouped[0].id !== baseId)) {
    throw new Error('Sólo se puede incorporar a un grupo existente si ese grupo es el producto base')
  }
  const generalCode = String(payload.generalCode || '').trim().toUpperCase()
  const generalName = String(payload.generalName || '').trim()
  if (!generalCode || generalCode.length > 64 || !generalName || generalName.length > 200) {
    throw new Error('Completá un nombre y un código general válidos')
  }
  if (products.some(product => same(product.codigo, generalCode) && !(base.isGrouped && product.id === baseId))) {
    throw new Error('El código general debe ser nuevo y distinto de los códigos originales')
  }
  const conflict = await client.query('SELECT id FROM products WHERE codigo=$1 AND NOT (id=ANY($2::uuid[])) LIMIT 1', [generalCode, products.map(p => p.id)])
  if (conflict.rows.length) throw new Error(`El código general ${generalCode} ya existe`)

  if (base.isGrouped && !Number(base.variant_rule_count)) await normalizeLegacyStock(client, base)
  let { rows: retainedRules } = await client.query(
    `SELECT rule.*, COALESCE((
       SELECT jsonb_agg(mapping.source_code ORDER BY mapping.source_code)
       FROM supplier_product_mappings mapping WHERE mapping.variant_rule_id=rule.id
     ), '[]'::jsonb) AS supplier_codes
     FROM product_variant_rules rule WHERE rule.product_id=$1 ORDER BY rule.created_at`,
    [baseId]
  )
  // Una única regla es la variante base de un producto simple. Al usarlo como
  // base de una unión se vuelve a crear con los atributos elegidos en la vista
  // previa, evitando conservar una fila comodín duplicada.
  if (!base.isGrouped && retainedRules.length) {
    await client.query('DELETE FROM product_variant_rules WHERE product_id=$1', [baseId])
    retainedRules = []
  }
  const submittedAssignments = Array.isArray(payload.assignments) ? payload.assignments : []
  const assignments = new Map(submittedAssignments
    .filter(item => !item.variantRuleId)
    .map(item => [String(item.productId), item]))
  const retainedAssignments = new Map(submittedAssignments
    .filter(item => item.variantRuleId)
    .map(item => [String(item.variantRuleId), item]))
  if (base.isGrouped && retainedRules.some(rule => !retainedAssignments.has(rule.id))) {
    throw new Error('Falta revisar una de las variantes actuales del grupo')
  }
  if ([...retainedAssignments.keys()].some(id => !retainedRules.some(rule => rule.id === id))) {
    throw new Error('Una de las variantes actuales ya no existe')
  }
  const revisedRetainedRules = retainedRules.map(rule => {
    const assignment = retainedAssignments.get(rule.id)
    if (!assignment) return rule
    const code = rule.supplier_codes?.[0] || 'una variante existente'
    return {
      ...rule,
      color_name: cleanLabel(assignment.color),
      color_hex: cleanHex(assignment.colorHex),
      size_label: cleanLabel(assignment.size),
      tone_name: cleanLabel(assignment.tone),
      tone_hex: cleanHex(assignment.toneHex),
      product_data: normalizeVariantProductData(assignment.productData, rule.product_data || base),
      values: mergeRuleValues({ ...rule, codigo: code }, assignment),
      product: { codigo: code },
    }
  })
  const sources = products.filter(product => !(product.id === baseId && base.isGrouped))
  const candidateRules = sources.map(product => {
    const assignment = assignments.get(product.id)
    if (!assignment) throw new Error(`Falta indicar la combinación de ${product.codigo}`)
    return {
      product,
      color_name: cleanLabel(assignment.color),
      color_hex: cleanHex(assignment.colorHex),
      size_label: cleanLabel(assignment.size),
      tone_name: cleanLabel(assignment.tone),
      tone_hex: cleanHex(assignment.toneHex),
      product_data: normalizeVariantProductData(assignment.productData, product),
      values: mergeRuleValues(product, assignment),
    }
  })
  const ambiguity = findRuleAmbiguity([...revisedRetainedRules, ...candidateRules])
  if (ambiguity) {
    const left = ambiguity.left.product?.codigo || 'una regla existente'
    const right = ambiguity.right.product?.codigo || 'otra regla existente'
    throw new Error(`Las reglas de ${left} y ${right} se superponen con la misma precisión`)
  }

  for (const rule of revisedRetainedRules) {
    if (!rule.values) continue
    await client.query(
      `UPDATE product_variant_rules SET color_name=$1,color_hex=$2,size_label=$3,tone_name=$4,tone_hex=$5,product_data=$6::jsonb,
         precio_venta=$7,precio_iva=$8,
         precio_venta_usd=$9,precio_iva_usd=$10,stock=$11,updated_at=NOW()
       WHERE id=$12 AND product_id=$13`,
      [rule.color_name, rule.color_hex, rule.size_label, rule.tone_name, rule.tone_hex, JSON.stringify(rule.product_data), rule.values.saleArs, rule.values.taxArs,
        rule.values.saleUsd, rule.values.taxUsd, rule.values.stock, rule.id, baseId]
    )
    await client.query(
      `UPDATE supplier_product_mappings SET color_name=$1,color_hex=$2,size_label=$3,tone_name=$4,updated_at=NOW()
       WHERE variant_rule_id=$5 AND product_id=$6`,
      [rule.color_name, rule.color_hex, rule.size_label, rule.tone_name, rule.id, baseId]
    )
  }

  const previousOption = (options, key, value) =>
    (Array.isArray(options) ? options : []).find(option => same(option?.[key], value)) || {}
  let colors = []
  let sizes = []
  let tones = []
  for (const rule of revisedRetainedRules) {
    colors = appendOption(colors, 'name', rule.color_name, {
      ...previousOption(base.color_options, 'name', rule.color_name), hex: rule.color_hex || previousOption(base.color_options, 'name', rule.color_name).hex || '#CCCCCC',
    })
    sizes = appendOption(sizes, 'label', rule.size_label, previousOption(base.size_options, 'label', rule.size_label))
    tones = appendOption(tones, 'name', rule.tone_name, {
      ...previousOption(base.tone_options, 'name', rule.tone_name), hex: rule.tone_hex || previousOption(base.tone_options, 'name', rule.tone_name).hex || '#CCCCCC',
    })
  }
  for (const rule of candidateRules) {
    colors = appendOption(colors, 'name', rule.color_name, { hex: rule.color_hex || '#CCCCCC', image: rule.product.image_url || '' })
    sizes = appendOption(sizes, 'label', rule.size_label)
    tones = appendOption(tones, 'name', rule.tone_name, { hex: rule.tone_hex || '#CCCCCC' })
    const { rows } = await client.query(
      `INSERT INTO product_variant_rules
         (product_id,color_name,color_hex,size_label,tone_name,tone_hex,image_url,product_data,precio_costo,precio_venta,precio_iva,
          precio_costo_usd,precio_venta_usd,precio_iva_usd,price_currency,price_exchange_rate,stock)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [baseId, rule.color_name, rule.color_hex, rule.size_label, rule.tone_name, rule.tone_hex, rule.product.image_url || null,
        JSON.stringify(rule.product_data), rule.product.precio_costo, rule.values.saleArs, rule.values.taxArs,
        rule.product.precio_costo_usd, rule.values.saleUsd, rule.values.taxUsd,
        rule.product.price_currency || 'ARS', rule.product.price_exchange_rate, rule.values.stock]
    )
    const ruleId = rows[0].id
    // Mueve solamente el código de esta fila. Filtrar solo por product_id hacía
    // que, al procesar luego el producto base, también se movieran códigos ya
    // reasignados y terminaran varios dentro de una misma regla.
    await client.query(
      `UPDATE supplier_product_mappings SET product_id=$2, variant_rule_id=$3,
         color_name=$4,color_hex=$5,size_label=$6,tone_name=$7,updated_at=NOW()
       WHERE product_id=$1 AND source_code_key=$8`,
      [rule.product.id, baseId, ruleId, rule.color_name, rule.color_hex, rule.size_label, rule.tone_name,
        codeKey(rule.product.codigo)]
    )
    await client.query(
      `INSERT INTO supplier_product_mappings
         (supplier,source_code,source_code_key,product_id,color_name,color_hex,size_label,tone_name,variant_rule_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (supplier,source_code_key) DO UPDATE SET product_id=EXCLUDED.product_id,
         color_name=EXCLUDED.color_name,color_hex=EXCLUDED.color_hex,size_label=EXCLUDED.size_label,tone_name=EXCLUDED.tone_name,
         variant_rule_id=EXCLUDED.variant_rule_id,updated_at=NOW()`,
      [base.supplier, rule.product.codigo, codeKey(rule.product.codigo), baseId,
        rule.color_name, rule.color_hex, rule.size_label, rule.tone_name, ruleId]
    )
  }

  await client.query(
    `UPDATE products SET codigo=$1,name=$2,color_options=$3::jsonb,size_options=$4::jsonb,
       tone_options=$5::jsonb,variant_stock='{}'::jsonb,published=FALSE,updated_at=NOW() WHERE id=$6`,
    [generalCode, generalName, JSON.stringify(colors), JSON.stringify(sizes), JSON.stringify(tones), baseId]
  )
  for (const source of products.filter(product => product.id !== baseId)) {
    await client.query(`INSERT INTO favorites(user_id,product_id,created_at) SELECT user_id,$2,created_at FROM favorites WHERE product_id=$1 ON CONFLICT DO NOTHING`, [source.id, baseId])
    await client.query('DELETE FROM favorites WHERE product_id=$1', [source.id])
    await client.query(`INSERT INTO reviews(user_id,product_id,rating,comment,created_at,updated_at) SELECT user_id,$2,rating,comment,created_at,updated_at FROM reviews WHERE product_id=$1 ON CONFLICT DO NOTHING`, [source.id, baseId])
    await client.query('DELETE FROM reviews WHERE product_id=$1', [source.id])
    await client.query('UPDATE stock_alerts SET product_id=$2 WHERE product_id=$1', [source.id, baseId])
  }
  await client.query('DELETE FROM products WHERE id=ANY($1::uuid[])', [products.filter(product => product.id !== baseId).map(product => product.id)])
  const updated = await recomputeGroupedProduct(client, baseId)
  return { product: updated, merged: products.length, variantRules: revisedRetainedRules.length + candidateRules.length }
}

async function rebuildGroupedAxes(client, productId) {
  const [{ rows: products }, { rows: rules }] = await Promise.all([
    client.query('SELECT color_options,size_options,tone_options FROM products WHERE id=$1', [productId]),
    client.query('SELECT color_name,color_hex,size_label,tone_name,tone_hex FROM product_variant_rules WHERE product_id=$1', [productId]),
  ])
  const product = products[0]
  if (!product) return
  const rebuild = (options, key, values, extra = {}) => [...new Set(values.filter(Boolean))].map(value => {
    const previous = (Array.isArray(options) ? options : []).find(option => same(option?.[key], value))
    return previous ? { ...previous, [key]: value } : { [key]: value, ...extra }
  })
  await client.query(
    'UPDATE products SET color_options=$1::jsonb,size_options=$2::jsonb,tone_options=$3::jsonb WHERE id=$4',
    [
      JSON.stringify([...new Set(rules.map(rule => rule.color_name).filter(Boolean))].map(value => {
        const rule = rules.find(item => same(item.color_name, value))
        const previous = (Array.isArray(product.color_options) ? product.color_options : []).find(option => same(option?.name, value))
        return { ...(previous || {}), name: value, hex: rule?.color_hex || previous?.hex || '#CCCCCC' }
      })),
      JSON.stringify(rebuild(product.size_options, 'label', rules.map(rule => rule.size_label))),
      JSON.stringify([...new Set(rules.map(rule => rule.tone_name).filter(Boolean))].map(value => {
        const rule = rules.find(item => same(item.tone_name, value))
        const previous = (Array.isArray(product.tone_options) ? product.tone_options : []).find(option => same(option?.name, value))
        return { ...(previous || {}), name: value, hex: rule?.tone_hex || previous?.hex || '#CCCCCC' }
      })),
      productId,
    ]
  )
}

export async function detachVariantRule(client, productId, ruleId) {
  if (!UUID_PATTERN.test(String(productId)) || !UUID_PATTERN.test(String(ruleId))) {
    throw new Error('La variante seleccionada no es válida')
  }
  const { rows: products } = await client.query('SELECT * FROM products WHERE id=$1 FOR UPDATE', [productId])
  const group = products[0]
  if (!group) throw new Error('El producto agrupado ya no existe')
  const { rows: rules } = await client.query(
    'SELECT * FROM product_variant_rules WHERE product_id=$1 ORDER BY created_at FOR UPDATE',
    [productId]
  )
  const targetRule = rules.find(rule => rule.id === ruleId)
  if (!targetRule) throw new Error('La variante ya no existe en este grupo')
  const { rows: mappings } = await client.query(
    `SELECT * FROM supplier_product_mappings
     WHERE variant_rule_id=ANY($1::uuid[]) ORDER BY source_code FOR UPDATE`,
    [rules.map(rule => rule.id)]
  )
  const mappingsByRule = new Map(rules.map(rule => [rule.id, mappings.filter(mapping => mapping.variant_rule_id === rule.id)]))
  const targetMappings = mappingsByRule.get(ruleId) || []
  if (targetMappings.length !== 1) {
    throw new Error('Para separar esta fila debe tener exactamente un código de proveedor')
  }
  const targetMapping = targetMappings[0]
  const sourceCode = String(targetMapping.source_code || '').trim().toUpperCase()
  if (!sourceCode || sourceCode.length > 64) throw new Error('El código de proveedor no sirve como código de producto')
  const duplicate = await client.query('SELECT id FROM products WHERE codigo=$1 AND id<>$2 LIMIT 1', [sourceCode, productId])
  if (duplicate.rows.length) throw new Error(`Ya existe un producto individual con el código ${sourceCode}`)

  const applyIndividualDetails = async (id, rule, mapping) => {
    const data = normalizeVariantProductData(rule.product_data, { ...group, codigo: mapping.source_code })
    await client.query(
      `UPDATE products SET name=$1,descripcion=$2,description_larga=$3,grupo=$4,subgrupo=$5,medida=$6,
         supplier=COALESCE(NULLIF($7,''),supplier),category=NULLIF($8,''),subcategory=NULLIF($9,''),
         watts=$10,amperes=$11,color_temp=$12,ip_rating=NULLIF($13,''),material=NULLIF($14,''),
         cable_type=NULLIF($15,''),product_type=NULLIF($16,''),length_cm=$17,width_cm=$18,height_cm=$19,
         weight_kg=$20,hover_image_url=NULLIF($21,''),updated_at=NOW() WHERE id=$22`,
      [data.name || null, data.inventoryDescription || null, data.description || null, data.grupo || null,
        data.subgrupo || null, data.medida || rule.size_label || null, data.supplier, data.category,
        data.subcategory, data.watts, data.amperes, data.colorTemp, data.ipRating, data.material, data.cableType,
        data.productType, data.lengthCm, data.widthCm, data.heightCm, data.weightKg, data.hoverImage, id]
    )
  }

  const applyRuleToProduct = async (id, rule, mapping, published = false) => {
    await client.query(
      `UPDATE products SET codigo=$1,medida=$2,precio_costo=$3,precio_venta=$4,precio_iva=$5,
         precio_costo_usd=$6,precio_venta_usd=$7,precio_iva_usd=$8,
         price_currency=COALESCE($9,price_currency),price_exchange_rate=COALESCE($10,price_exchange_rate),
         stock=COALESCE($11,0),image_url=COALESCE($12,image_url),color_options='[]'::jsonb,
         size_options='[]'::jsonb,tone_options='[]'::jsonb,variant_stock='{}'::jsonb,
         published=$13,is_new=FALSE,best_seller=FALSE,updated_at=NOW() WHERE id=$14`,
      [mapping.source_code, rule.size_label, rule.precio_costo, rule.precio_venta, rule.precio_iva,
        rule.precio_costo_usd, rule.precio_venta_usd, rule.precio_iva_usd, rule.price_currency,
        rule.price_exchange_rate, rule.stock, rule.image_url, published, id]
    )
    await client.query(
      `UPDATE supplier_product_mappings SET product_id=$1,variant_rule_id=NULL,
         color_name=NULL,color_hex=NULL,size_label=NULL,tone_name=NULL,updated_at=NOW() WHERE id=$2`,
      [id, mapping.id]
    )
    await applyIndividualDetails(id, rule, mapping)
  }

  if (rules.length === 1) {
    await applyRuleToProduct(productId, targetRule, targetMapping)
    await client.query('DELETE FROM product_variant_rules WHERE id=$1', [ruleId])
    const { rows: detached } = await client.query('SELECT * FROM products WHERE id=$1', [productId])
    return { detached: detached[0], groupRemoved: true, remaining: 0 }
  }

  const { rows: inserted } = await client.query(
    `INSERT INTO products (
       codigo,descripcion,grupo,subgrupo,medida,watts,amperes,precio_costo,precio_venta,precio_iva,
       precio_costo_usd,precio_venta_usd,precio_iva_usd,price_currency,price_exchange_rate,
       stock,source,supplier,price_updated_at,stock_updated_at,name,category,subcategory,
       description_larga,image_url,hover_image_url,color_options,size_options,tone_options,
       variant_stock,color_temp,ip_rating,material,cable_type,product_type,published,
       length_cm,width_cm,height_cm,weight_kg,is_new,best_seller)
     SELECT $2,descripcion,grupo,subgrupo,$3,watts,amperes,$4,$5,$6,$7,$8,$9,
       COALESCE($10,price_currency),COALESCE($11,price_exchange_rate),COALESCE($12,0),source,supplier,
       price_updated_at,stock_updated_at,name,category,subcategory,description_larga,
       COALESCE($13,image_url),hover_image_url,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'{}'::jsonb,
       color_temp,ip_rating,material,cable_type,product_type,FALSE,length_cm,width_cm,height_cm,weight_kg,FALSE,FALSE
     FROM products WHERE id=$1 RETURNING *`,
    [productId, targetMapping.source_code, targetRule.size_label, targetRule.precio_costo,
      targetRule.precio_venta, targetRule.precio_iva, targetRule.precio_costo_usd,
      targetRule.precio_venta_usd, targetRule.precio_iva_usd, targetRule.price_currency,
      targetRule.price_exchange_rate, targetRule.stock, targetRule.image_url]
  )
  const detached = inserted[0]
  await client.query(
    `UPDATE supplier_product_mappings SET product_id=$1,variant_rule_id=NULL,
       color_name=NULL,color_hex=NULL,size_label=NULL,tone_name=NULL,updated_at=NOW() WHERE id=$2`,
    [detached.id, targetMapping.id]
  )
  await applyIndividualDetails(detached.id, targetRule, targetMapping)
  await client.query('DELETE FROM product_variant_rules WHERE id=$1', [ruleId])

  const remainingRules = rules.filter(rule => rule.id !== ruleId)
  if (remainingRules.length === 1) {
    const remainingRule = remainingRules[0]
    const remainingMappings = mappingsByRule.get(remainingRule.id) || []
    if (remainingMappings.length !== 1) throw new Error('La variante restante debe tener exactamente un código de proveedor')
    await applyRuleToProduct(productId, remainingRule, remainingMappings[0], group.published)
    await client.query('DELETE FROM product_variant_rules WHERE id=$1', [remainingRule.id])
    return { detached, groupRemoved: true, remaining: 1 }
  }

  await rebuildGroupedAxes(client, productId)
  const updatedGroup = await recomputeGroupedProduct(client, productId)
  return { detached, group: updatedGroup, groupRemoved: false, remaining: remainingRules.length }
}

export async function updateVariantRulePrice(client, ruleId, values) {
  const { rows } = await client.query(
    `UPDATE product_variant_rules SET precio_costo=COALESCE($1,precio_costo),precio_venta=COALESCE($2,precio_venta),
       precio_iva=COALESCE($3,precio_iva),precio_costo_usd=COALESCE($4,precio_costo_usd),
       precio_venta_usd=COALESCE($5,precio_venta_usd),precio_iva_usd=COALESCE($6,precio_iva_usd),
       price_currency=$7,price_exchange_rate=$8,updated_at=NOW() WHERE id=$9 RETURNING product_id`,
    [values.costArs, values.saleArs, values.taxArs, values.costUsd, values.saleUsd, values.taxUsd,
      values.currency, values.usdArsRate, ruleId]
  )
  if (!rows.length) return 0
  await recomputeGroupedProduct(client, rows[0].product_id)
  return 1
}
