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
      `INSERT INTO products (codigo, descripcion, precio_costo, precio_venta, precio_iva, source, price_updated_at)
       VALUES ${valuesClause(batch.length, 5, ["'price_list'", 'NOW()'])}
       ON CONFLICT (codigo) DO UPDATE SET
         precio_costo     = EXCLUDED.precio_costo,
         precio_venta     = EXCLUDED.precio_venta,
         precio_iva       = EXCLUDED.precio_iva,
         price_updated_at = NOW(),
         updated_at       = NOW()
       RETURNING (xmax = 0) AS inserted`,
      params
    )
    for (const row of result) row.inserted ? created++ : updated++
  }

  return { created, updated }
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
      `INSERT INTO products (codigo, descripcion, watts, stock, precio_costo_usd, source, stock_updated_at)
       VALUES ${valuesClause(batch.length, 5, ["'purchase'", 'NOW()'])}
       ON CONFLICT (codigo) DO UPDATE SET
         stock             = products.stock + EXCLUDED.stock,
         precio_costo_usd  = EXCLUDED.precio_costo_usd,
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
