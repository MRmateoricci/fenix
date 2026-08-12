const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const cleanLabel = value => {
  const label = String(value || '').trim()
  return label ? label.slice(0, 100) : null
}

const codeKey = value => String(value || '').trim().toUpperCase().replace(/\s+/g, '')
const numberOrNull = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)
const same = (left, right) => String(left || '').localeCompare(String(right || ''), 'es-AR', { sensitivity: 'base' }) === 0

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
    `SELECT p.*, COUNT(v.id)::integer AS variant_rule_count
     FROM products p LEFT JOIN product_variant_rules v ON v.product_id=p.id
     WHERE p.id=ANY($1::uuid[]) GROUP BY p.id ORDER BY p.codigo`, [ids]
  )
  if (products.length !== ids.length) throw new Error('Uno o más productos seleccionados ya no existen')
  const suppliers = new Set(products.map(product => String(product.supplier || '').trim().toUpperCase()))
  if (suppliers.size !== 1) throw new Error('Sólo se pueden unir productos del mismo proveedor')
  return products.map(product => ({
    ...product,
    isGrouped: Number(product.variant_rule_count) > 0 ||
      (product.color_options || []).length > 0 || (product.size_options || []).length > 0 || (product.tone_options || []).length > 0,
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
  if (products.some(product => same(product.codigo, generalCode))) throw new Error('El código general debe ser nuevo y distinto de los códigos originales')
  const conflict = await client.query('SELECT id FROM products WHERE codigo=$1 AND NOT (id=ANY($2::uuid[])) LIMIT 1', [generalCode, products.map(p => p.id)])
  if (conflict.rows.length) throw new Error(`El código general ${generalCode} ya existe`)

  if (base.isGrouped && !Number(base.variant_rule_count)) await normalizeLegacyStock(client, base)
  const { rows: retainedRules } = await client.query('SELECT * FROM product_variant_rules WHERE product_id=$1', [baseId])
  const assignments = new Map((Array.isArray(payload.assignments) ? payload.assignments : []).map(item => [String(item.productId), item]))
  const sources = products.filter(product => !(product.id === baseId && base.isGrouped))
  const candidateRules = sources.map(product => {
    const assignment = assignments.get(product.id)
    if (!assignment) throw new Error(`Falta indicar la combinación de ${product.codigo}`)
    return {
      product,
      color_name: cleanLabel(assignment.color),
      size_label: cleanLabel(assignment.size),
      tone_name: cleanLabel(assignment.tone),
    }
  })
  const ambiguity = findRuleAmbiguity([...retainedRules, ...candidateRules])
  if (ambiguity) {
    const left = ambiguity.left.product?.codigo || 'una regla existente'
    const right = ambiguity.right.product?.codigo || 'otra regla existente'
    throw new Error(`Las reglas de ${left} y ${right} se superponen con la misma precisión`)
  }

  let colors = Array.isArray(base.color_options) ? base.color_options : []
  let sizes = Array.isArray(base.size_options) ? base.size_options : []
  let tones = Array.isArray(base.tone_options) ? base.tone_options : []
  for (const rule of candidateRules) {
    colors = appendOption(colors, 'name', rule.color_name, { hex: '#CCCCCC', image: rule.product.image_url || '' })
    sizes = appendOption(sizes, 'label', rule.size_label)
    tones = appendOption(tones, 'name', rule.tone_name, { hex: '#CCCCCC' })
    const { rows } = await client.query(
      `INSERT INTO product_variant_rules
         (product_id,color_name,size_label,tone_name,precio_costo,precio_venta,precio_iva,
          precio_costo_usd,precio_venta_usd,precio_iva_usd,price_currency,price_exchange_rate,stock)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [baseId, rule.color_name, rule.size_label, rule.tone_name,
        rule.product.precio_costo, rule.product.precio_venta, rule.product.precio_iva,
        rule.product.precio_costo_usd, rule.product.precio_venta_usd, rule.product.precio_iva_usd,
        rule.product.price_currency || 'ARS', rule.product.price_exchange_rate, Math.max(0, Number(rule.product.stock) || 0)]
    )
    const ruleId = rows[0].id
    await client.query(
      `UPDATE supplier_product_mappings SET product_id=$2, variant_rule_id=$3,
         color_name=$4,size_label=$5,tone_name=$6,updated_at=NOW() WHERE product_id=$1`,
      [rule.product.id, baseId, ruleId, rule.color_name, rule.size_label, rule.tone_name]
    )
    await client.query(
      `INSERT INTO supplier_product_mappings
         (supplier,source_code,source_code_key,product_id,color_name,size_label,tone_name,variant_rule_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (supplier,source_code_key) DO UPDATE SET product_id=EXCLUDED.product_id,
         color_name=EXCLUDED.color_name,size_label=EXCLUDED.size_label,tone_name=EXCLUDED.tone_name,
         variant_rule_id=EXCLUDED.variant_rule_id,updated_at=NOW()`,
      [base.supplier, rule.product.codigo, codeKey(rule.product.codigo), baseId,
        rule.color_name, rule.size_label, rule.tone_name, ruleId]
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
  return { product: updated, merged: products.length, variantRules: retainedRules.length + candidateRules.length }
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
