import test from 'node:test'
import assert from 'node:assert/strict'
import { createSupplierPriceDrafts, previewSupplierPriceDrafts, recordSupplierPriceImports } from './productsRepo.js'

test('la vista previa detalla creaciones, cambios, vinculaciones, repetidos e inválidos sin escribir', async () => {
  const client = {
    async query(sql) {
      if (/FROM supplier_product_mappings mapping/.test(sql)) {
        assert.match(sql, /product\.name/)
        assert.doesNotMatch(sql, /product\.nombre/)
        return { rows: [{
          source_code_key: 'MAP-1', product_id: 'product-1', color_name: null, size_label: null,
          tone_name: null, variant_rule_id: null, product_code: 'GRUPO-1', product_name: 'Producto unido',
          precio_costo: 80, precio_venta: 100, precio_iva: 121,
          precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null,
          color_options: [], size_options: [],
        }] }
      }
      if (/FROM products WHERE codigo = ANY/.test(sql)) {
        assert.match(sql, /NULLIF\(name,/)
        return { rows: [{
          id: 'product-2', codigo: 'EXISTE', supplier: 'NOMBRE ANTERIOR', product_name: 'Ya cargado',
          precio_costo: 10, precio_venta: 20, precio_iva: 24.2,
          precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null,
          color_options: [], size_options: [],
        }] }
      }
      if (/FROM products WHERE supplier = \$1/.test(sql)) return { rows: [] }
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }

  const result = await previewSupplierPriceDrafts(client, [{
    fileName: 'PROVEEDOR.xlsx', supplier: 'PROVEEDOR', currency: 'ARS', totalRows: 5, skipped: 1,
    invalidRows: [{ rowNumber: 6, codigo: '', descripcion: 'Sin código', reason: 'Falta el código' }],
    rows: [
      { codigo: 'MAP-1', descripcion: 'Asociado', precio_costo: 80, precio_venta: 150, precio_iva: 181.5 },
      { codigo: 'NUEVO', descripcion: 'Nuevo', precio_costo: 10, precio_venta: 20, precio_iva: 24.2 },
      { codigo: 'EXISTE', descripcion: 'Existente', precio_costo: 10, precio_venta: 20, precio_iva: 24.2 },
      { codigo: 'NUEVO', descripcion: 'Duplicado', precio_costo: 10, precio_venta: 20, precio_iva: 24.2 },
    ],
  }], 1510)

  assert.equal(result.created, 1)
  assert.equal(result.updated, 2)
  assert.equal(result.skipped, 2)
  assert.deepEqual(result.files[0].items.map(item => item.status), ['update', 'create', 'update', 'duplicate', 'invalid'])
  const update = result.files[0].items[0]
  assert.equal(update.targetCode, 'GRUPO-1')
  assert.equal(update.changes.find(change => change.field === 'precioVenta').previous, 100)
  assert.equal(update.changes.find(change => change.field === 'precioVenta').next, 150)
  assert.equal(update.changes.find(change => change.field === 'precioCosto').changed, false)
  assert.match(result.files[0].items[2].reason, /Se asociará a PROVEEDOR/)
})

test('una asociación cuyos precios coinciden queda sin cambios y no cuenta como actualización', async () => {
  const client = {
    async query(sql) {
      if (/FROM supplier_product_mappings mapping/.test(sql)) return { rows: [{
        source_code_key: 'IGUAL', product_id: 'product-1', color_name: null, size_label: null,
        tone_name: null, variant_rule_id: null, product_code: 'IGUAL', product_name: 'Producto',
        precio_costo: 80, precio_venta: 100, precio_iva: 121,
        precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null,
        color_options: [], size_options: [],
      }] }
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }
  const result = await previewSupplierPriceDrafts(client, [{
    fileName: 'lista.xlsx', supplier: 'PROVEEDOR', currency: 'ARS', totalRows: 1, skipped: 0,
    rows: [{ codigo: 'IGUAL', descripcion: 'Producto', precio_costo: 80, precio_venta: 100, precio_iva: 121 }],
  }], 1510)

  assert.equal(result.updated, 0)
  assert.equal(result.unchanged, 1)
  assert.equal(result.skipped, 1)
  assert.equal(result.files[0].items[0].status, 'unchanged')
})

test('un código con excepción de moneda se lee en su propia moneda aunque el resto del archivo esté en otra', async () => {
  const client = {
    async query(sql) {
      if (/FROM supplier_product_mappings mapping/.test(sql)) return { rows: [{
        source_code_key: 'EXCEPCION', product_id: 'product-1', color_name: null, size_label: null,
        tone_name: null, variant_rule_id: null, product_code: 'EXCEPCION', product_name: 'Producto',
        precio_costo: 80, precio_venta: 100, precio_iva: 121,
        precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null,
        color_options: [], size_options: [],
      }] }
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }
  const result = await previewSupplierPriceDrafts(client, [{
    fileName: 'lista.xlsx', supplier: 'PROVEEDOR', currency: 'ARS', totalRows: 1, skipped: 0,
    rows: [{ codigo: 'EXCEPCION', descripcion: 'Producto', precio_costo: 0.05, precio_venta: 0.1, precio_iva: 0.121, currency: 'USD' }],
  }], 1510)

  const item = result.files[0].items[0]
  assert.equal(item.currency, 'USD')
  // El precio actual (100 ARS) se compara contra la fila en USD (100 / 1510), redondeado a 2 decimales.
  assert.equal(item.changes.find(change => change.field === 'precioVenta').previous, Math.round((100 / 1510) * 100) / 100)
})

test('crea borradores, convierte USD y no pisa códigos existentes o repetidos', async () => {
  const insertParams = []
  const client = {
    async query(sql, params) {
      if (/SELECT source_code_key, product_id/.test(sql)) return { rows: [] }
      assert.match(sql, /published/)
      assert.match(sql, /ON CONFLICT \(codigo\) DO NOTHING/)
      insertParams.push(params)
      const inserted = []
      for (let index = 0; index < params.length; index += 11) {
        if (params[index] !== 'EXISTENTE') inserted.push({ codigo: params[index] })
      }
      return { rows: inserted }
    },
  }

  const result = await createSupplierPriceDrafts(client, [
    {
      fileName: 'CELUZ EN DOLARES.xlsx', supplier: 'CELUZ EN DOLARES', currency: 'USD', totalRows: 2, skipped: 0,
      rows: [
        { codigo: 'USD-1', descripcion: 'En dólares', precio_costo: 2, precio_venta: 3, precio_iva: 3.63 },
        { codigo: 'EXISTENTE', descripcion: 'Ya cargado', precio_costo: 1, precio_venta: 2, precio_iva: 2.42 },
      ],
    },
    {
      fileName: 'CABRERA.xlsx', supplier: 'CABRERA', currency: 'ARS', totalRows: 2, skipped: 0,
      rows: [
        { codigo: 'USD-1', descripcion: 'Repetido', precio_costo: 10, precio_venta: 20, precio_iva: 24.2 },
        { codigo: 'ARS-1', descripcion: 'En pesos', precio_costo: 1510, precio_venta: 2000, precio_iva: 2420 },
      ],
    },
  ], 1510)

  assert.equal(result.created, 2)
  assert.equal(result.updated, 0)
  assert.equal(result.skipped, 2)
  assert.equal(result.files[0].existingCount, 1)
  assert.equal(result.files[1].duplicateRows, 1)
  assert.deepEqual(insertParams[0].slice(0, 11), [
    'USD-1', 'En dólares', 3020, 4530, 5481.3, 2, 3, 3.63, 'USD', 1510, 'CELUZ EN DOLARES',
  ])
  assert.deepEqual(insertParams[1].slice(0, 11), [
    'ARS-1', 'En pesos', 1510, 2000, 2420, 1, 1.32, 1.6, 'ARS', 1510, 'CABRERA',
  ])
})

test('un código con excepción de moneda se convierte con su propia moneda al crear el borrador', async () => {
  const insertParams = []
  const client = {
    async query(sql, params) {
      if (/SELECT source_code_key, product_id/.test(sql)) return { rows: [] }
      insertParams.push(params)
      return { rows: params.filter((_, index) => index % 11 === 0).map(codigo => ({ codigo })) }
    },
  }

  await createSupplierPriceDrafts(client, [{
    fileName: 'CABRERA.xlsx', supplier: 'CABRERA', currency: 'ARS', totalRows: 2, skipped: 0,
    rows: [
      { codigo: 'ARS-1', descripcion: 'En pesos', precio_costo: 1510, precio_venta: 2000, precio_iva: 2420 },
      { codigo: 'USD-EXCEPCION', descripcion: 'Excepción en dólares', precio_costo: 2, precio_venta: 3, precio_iva: 3.63, currency: 'USD' },
    ],
  }], 1510)

  assert.deepEqual(insertParams[0].slice(0, 11), [
    'ARS-1', 'En pesos', 1510, 2000, 2420, 1, 1.32, 1.6, 'ARS', 1510, 'CABRERA',
  ])
  assert.deepEqual(insertParams[0].slice(11, 22), [
    'USD-EXCEPCION', 'Excepción en dólares', 3020, 4530, 5481.3, 2, 3, 3.63, 'USD', 1510, 'CABRERA',
  ])
})

test('una lista masiva actualiza el precio de una variante unida sin recrear su codigo', async () => {
  const productId = '11111111-1111-4111-8111-111111111111'
  let colorUpdateParams = null
  let productInsertAttempted = false
  const client = {
    async query(sql, params) {
      if (/SELECT source_code_key, product_id/.test(sql)) {
        return { rows: [{ source_code_key: 'FE-AP-121N/T', product_id: productId }] }
      }
      if (/SELECT source_code_key, color_name, color_hex, size_label/.test(sql)) {
        return { rows: [{ source_code_key: 'FE-AP-121N/T', color_name: 'Negro', color_hex: '#111111', size_label: null }] }
      }
      if (/SELECT color_options, precio_costo/.test(sql)) {
        return {
          rows: [{
            color_options: [
              { name: 'Negro', hex: '#111111', supplierCode: 'FE-AP-121N/T', price: 100 },
              { name: 'Blanco', hex: '#FFFFFF', supplierCode: 'FE-AP-121B/T', price: 120 },
            ],
            precio_costo: 70, precio_venta: 100, precio_iva: 121,
            precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null,
          }],
        }
      }
      if (/UPDATE products\s+SET color_options/.test(sql)) {
        colorUpdateParams = params
        return { rows: [], rowCount: 1 }
      }
      if (/INSERT INTO supplier_product_mappings/.test(sql)) return { rows: [], rowCount: 1 }
      if (/INSERT INTO products/.test(sql)) productInsertAttempted = true
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }

  const result = await createSupplierPriceDrafts(client, [{
    fileName: 'FERROLUX.xlsx', supplier: 'FERROLUX', currency: 'ARS', totalRows: 1, skipped: 0,
    rows: [{ codigo: 'FE-AP-121N/T', descripcion: 'Negro', precio_costo: 140, precio_venta: 250, precio_iva: 302.5 }],
  }], 1510)

  const colors = JSON.parse(colorUpdateParams[0])
  assert.equal(result.created, 0)
  assert.equal(result.updated, 1)
  assert.equal(productInsertAttempted, false)
  assert.equal(colors.find(color => color.name === 'Negro').price, 250)
  assert.equal(colors.find(color => color.name === 'Blanco').price, 120)
})

// Cliente mínimo para los casos de renombre: sin asociaciones guardadas ni
// coincidencia exacta de código, todo depende de los candidatos del proveedor.
function renameClient(supplierProducts) {
  return {
    async query(sql) {
      if (/FROM supplier_product_mappings mapping/.test(sql)) return { rows: [] }
      if (/FROM products WHERE codigo = ANY/.test(sql)) return { rows: [] }
      if (/FROM products WHERE supplier = \$1/.test(sql)) return { rows: supplierProducts }
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }
}

const renameFile = (rows) => ({
  fileName: 'LISTA.xlsx', supplier: 'ALCIDES', currency: 'ARS', totalRows: rows.length,
  skipped: 0, invalidRows: [], rows,
})

test('un código renombrado solo en la puntuación propone el producto original antes de crear un duplicado', async () => {
  const client = renameClient([
    { id: 'p-1', codigo: 'ALC40', nombre: 'Farol colgante', descripcion: 'Farol colgante', image_url: null, published: true },
    { id: 'p-2', codigo: 'ALC99', nombre: 'Otra cosa', descripcion: 'Otra cosa', image_url: null, published: true },
  ])

  const result = await previewSupplierPriceDrafts(client, [renameFile([
    { codigo: 'AL-C40', descripcion: 'Farol colgante', precio_costo: 100, precio_venta: 150, precio_iva: 181.5 },
  ])], 1510)

  const [item] = result.files[0].items
  assert.equal(item.status, 'create')
  assert.equal(item.suggestions[0].id, 'p-1')
  assert.equal(item.suggestions[0].renamed, true)
  assert.equal(item.suggestions[0].similarity, 100)
})

test('dos productos que colapsan al mismo código normalizado no se proponen como renombre', async () => {
  const client = renameClient([
    { id: 'p-1', codigo: 'ALC40', nombre: 'Farol', descripcion: 'Farol', image_url: null, published: true },
    { id: 'p-2', codigo: 'AL C40', nombre: 'Farol viejo', descripcion: 'Farol viejo', image_url: null, published: true },
  ])

  const result = await previewSupplierPriceDrafts(client, [renameFile([
    { codigo: 'AL-C40', descripcion: 'Farol', precio_costo: 100, precio_venta: 150, precio_iva: 181.5 },
  ])], 1510)

  // Siguen ofreciendose como candidatos a mano: lo que no puede pasar es que uno
  // se presente como "es este seguro" cuando el otro es igual de parecido.
  const [item] = result.files[0].items
  assert.equal(item.status, 'create')
  assert.equal(item.suggestions.length, 2)
  assert.equal(item.suggestions.some(product => product.renamed), false)
})

test('un producto que ya recibe otra fila de la misma lista no se propone para un alta', async () => {
  const client = {
    async query(sql) {
      if (/FROM supplier_product_mappings mapping/.test(sql)) return { rows: [] }
      if (/FROM products WHERE codigo = ANY/.test(sql)) return { rows: [{
        id: 'p-1', codigo: 'ALC40', supplier: 'ALCIDES', product_name: 'Farol colgante',
        precio_costo: 100, precio_venta: 150, precio_iva: 181.5,
        precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null,
        color_options: [], size_options: [],
      }] }
      if (/FROM products WHERE supplier = \$1/.test(sql)) return { rows: [
        { id: 'p-1', codigo: 'ALC40', nombre: 'Farol colgante', descripcion: 'Farol colgante', image_url: null, published: true },
      ] }
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }

  const result = await previewSupplierPriceDrafts(client, [renameFile([
    { codigo: 'ALC40', descripcion: 'Farol colgante', precio_costo: 100, precio_venta: 160, precio_iva: 193.6 },
    { codigo: 'AL-C40', descripcion: 'Farol colgante', precio_costo: 100, precio_venta: 150, precio_iva: 181.5 },
  ])], 1510)

  const [exact, alta] = result.files[0].items
  assert.equal(exact.status, 'update')
  assert.equal(exact.targetProductId, 'p-1')
  assert.equal(alta.status, 'create')
  assert.equal(alta.suggestions, undefined)
})

test('un alta sin ningún parecido en el proveedor no arrastra sugerencias', async () => {
  const client = renameClient([
    { id: 'p-1', codigo: 'ZZ900', nombre: 'Cable subterráneo', descripcion: 'Cable subterráneo', image_url: null, published: true },
  ])

  const result = await previewSupplierPriceDrafts(client, [renameFile([
    { codigo: 'AL-C40', descripcion: 'Farol colgante', precio_costo: 100, precio_venta: 150, precio_iva: 181.5 },
  ])], 1510)

  assert.equal(result.files[0].items[0].suggestions, undefined)
})

test('la asociación guardada queda marcada para poder deshacerse desde la vista previa', async () => {
  const client = {
    async query(sql) {
      if (/FROM supplier_product_mappings mapping/.test(sql)) return { rows: [{
        source_code_key: 'AL-C40', product_id: 'p-1', color_name: null, size_label: null,
        tone_name: null, variant_rule_id: null, product_code: 'ALC40', product_name: 'Farol colgante',
        precio_costo: 100, precio_venta: 140, precio_iva: 169.4,
        precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null,
        color_options: [], size_options: [],
      }] }
      if (/FROM products WHERE supplier = \$1/.test(sql)) return { rows: [] }
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }

  const result = await previewSupplierPriceDrafts(client, [renameFile([
    { codigo: 'AL-C40', descripcion: 'Farol colgante', precio_costo: 100, precio_venta: 150, precio_iva: 181.5 },
  ])], 1510)

  const [item] = result.files[0].items
  assert.equal(item.status, 'update')
  assert.equal(item.matchType, 'saved')
  assert.equal(item.targetCode, 'ALC40')
})

const groupedRules = [
  { id: 'rule-15w', color: null, size: '15W', tone: null, precioVenta: 1000, precioIva: 1210 },
  { id: 'rule-20w', color: null, size: '20W', tone: null, precioVenta: 1300, precioIva: 1573 },
]

test('un codigo que apunta a un producto agrupado sin variante asignada espera la eleccion y no se aplica', async () => {
  const client = {
    async query(sql) {
      if (/FROM supplier_product_mappings mapping/.test(sql)) return { rows: [{
        source_code_key: 'ALC40', product_id: 'p-1', color_name: null, size_label: null,
        tone_name: null, variant_rule_id: null, product_code: 'ALC40', product_name: 'Lampara',
        precio_costo: 800, precio_venta: 1000, precio_iva: 1210,
        precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null,
        color_options: [], size_options: [], variant_rules: groupedRules,
      }] }
      if (/FROM products WHERE supplier = \$1/.test(sql)) return { rows: [] }
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }

  const result = await previewSupplierPriceDrafts(client, [renameFile([
    { codigo: 'ALC40', descripcion: 'Lampara', precio_costo: 900, precio_venta: 1100, precio_iva: 1331 },
  ])], 1510)

  const [item] = result.files[0].items
  assert.equal(item.status, 'variant')
  assert.equal(result.updated, 0)
  assert.equal(result.pendingVariant, 1)
  assert.deepEqual(item.groupedTarget.rules.map(rule => rule.label), ['15W', '20W'])
  assert.match(item.reason, /2 variantes/)
})

test('un codigo ya asignado a una variante concreta se actualiza normalmente', async () => {
  const client = {
    async query(sql) {
      if (/FROM supplier_product_mappings mapping/.test(sql)) return { rows: [{
        source_code_key: 'ALC40-20W', product_id: 'p-1', color_name: null, size_label: '20W',
        tone_name: null, variant_rule_id: 'rule-20w', product_code: 'ALC40', product_name: 'Lampara',
        precio_costo: 800, precio_venta: 1000, precio_iva: 1210,
        precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null,
        rule_precio_costo: 1000, rule_precio_venta: 1300, rule_precio_iva: 1573,
        rule_precio_costo_usd: null, rule_precio_venta_usd: null, rule_precio_iva_usd: null,
        color_options: [], size_options: [], variant_rules: groupedRules,
      }] }
      if (/FROM products WHERE supplier = \$1/.test(sql)) return { rows: [] }
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }

  const result = await previewSupplierPriceDrafts(client, [renameFile([
    { codigo: 'ALC40-20W', descripcion: 'Lampara 20W', precio_costo: 1100, precio_venta: 1400, precio_iva: 1694 },
  ])], 1510)

  const [item] = result.files[0].items
  assert.equal(item.status, 'update')
  assert.equal(item.groupedTarget, undefined)
  assert.equal(result.pendingVariant, 0)
  assert.equal(item.changes.find(change => change.field === 'precioVenta').previous, 1300)
})

test('un producto de una sola variante se sigue actualizando por la ficha, que el trigger sincroniza', async () => {
  const client = {
    async query(sql) {
      if (/FROM supplier_product_mappings mapping/.test(sql)) return { rows: [{
        source_code_key: 'SIMPLE', product_id: 'p-2', color_name: null, size_label: null,
        tone_name: null, variant_rule_id: null, product_code: 'SIMPLE', product_name: 'Producto simple',
        precio_costo: 800, precio_venta: 1000, precio_iva: 1210,
        precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null,
        color_options: [], size_options: [],
        variant_rules: [{ id: 'rule-base', color: null, size: null, tone: null, precioVenta: 1000, precioIva: 1210 }],
      }] }
      if (/FROM products WHERE supplier = \$1/.test(sql)) return { rows: [] }
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }

  const result = await previewSupplierPriceDrafts(client, [renameFile([
    { codigo: 'SIMPLE', descripcion: 'Producto simple', precio_costo: 900, precio_venta: 1100, precio_iva: 1331 },
  ])], 1510)

  assert.equal(result.files[0].items[0].status, 'update')
  assert.equal(result.pendingVariant, 0)
})

test('la fila que espera variante no se escribe al confirmar la importacion', async () => {
  const executed = []
  const client = {
    async query(sql, params) {
      executed.push(sql)
      if (/FROM supplier_product_mappings mapping/.test(sql)) return { rows: [{
        source_code_key: 'ALC40', product_id: 'p-1', color_name: null, size_label: null,
        tone_name: null, variant_rule_id: null, product_code: 'ALC40', product_name: 'Lampara',
        precio_costo: 800, precio_venta: 1000, precio_iva: 1210,
        precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null,
        color_options: [], size_options: [], variant_rules: groupedRules,
      }] }
      if (/FROM products WHERE supplier = \$1/.test(sql)) return { rows: [] }
      if (/SELECT source_code_key, product_id/.test(sql)) return { rows: [{ source_code_key: 'ALC40', product_id: 'p-1' }] }
      if (/INSERT INTO products/.test(sql)) return { rows: [] }
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }

  const files = [renameFile([
    { codigo: 'ALC40', descripcion: 'Lampara', precio_costo: 900, precio_venta: 1100, precio_iva: 1331 },
  ])]
  const preview = await previewSupplierPriceDrafts(client, files, 1510)
  const result = await createSupplierPriceDrafts(client, files, 1510, preview)

  assert.equal(result.created, 0)
  assert.equal(result.updated, 0)
  assert.equal(executed.some(sql => /UPDATE products/.test(sql)), false)
  assert.equal(executed.some(sql => /UPDATE product_variant_rules/.test(sql)), false)
})

test('un producto que otro archivo del mismo proveedor ya actualiza no se sugiere como destino de un alta', async () => {
  const client = {
    async query(sql) {
      if (/FROM supplier_product_mappings mapping/.test(sql)) return { rows: [] }
      if (/FROM products WHERE codigo = ANY/.test(sql)) return { rows: [{
        id: 'p-1', codigo: 'ALC40', supplier: 'ALCIDES', product_name: 'Farol colgante',
        precio_costo: 100, precio_venta: 150, precio_iva: 181.5,
        precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null,
        color_options: [], size_options: [], variant_rules: [],
      }] }
      if (/FROM products WHERE supplier = \$1/.test(sql)) return { rows: [
        { id: 'p-1', codigo: 'ALC40', nombre: 'Farol colgante', descripcion: 'Farol colgante', published: true },
      ] }
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }

  // El codigo exacto llega en el primer archivo y el renombrado en el segundo.
  const result = await previewSupplierPriceDrafts(client, [
    renameFile([{ codigo: 'ALC40', descripcion: 'Farol colgante', precio_costo: 100, precio_venta: 160, precio_iva: 193.6 }]),
    { ...renameFile([{ codigo: 'AL-C40', descripcion: 'Farol colgante', precio_costo: 100, precio_venta: 150, precio_iva: 181.5 }]), fileName: 'LISTA-2.xlsx' },
  ], 1510)

  assert.equal(result.files[0].items[0].status, 'update')
  assert.equal(result.files[1].items[0].status, 'create')
  assert.equal(result.files[1].items[0].suggestions, undefined)
})

test('el comprobante posterior nombra las filas que quedaron esperando variante', async () => {
  const client = {
    async query(sql) {
      if (/FROM supplier_product_mappings mapping/.test(sql)) return { rows: [{
        source_code_key: 'ALC40', product_id: 'p-1', color_name: null, size_label: null,
        tone_name: null, variant_rule_id: null, product_code: 'ALC40', product_name: 'Lampara',
        precio_costo: 800, precio_venta: 1000, precio_iva: 1210,
        precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null,
        color_options: [], size_options: [], variant_rules: groupedRules,
      }] }
      if (/FROM products WHERE supplier = \$1/.test(sql)) return { rows: [] }
      if (/SELECT source_code_key, product_id/.test(sql)) return { rows: [{ source_code_key: 'ALC40', product_id: 'p-1' }] }
      if (/INSERT INTO products/.test(sql)) return { rows: [] }
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }

  const files = [renameFile([
    { codigo: 'ALC40', descripcion: 'Lampara', precio_costo: 900, precio_venta: 1100, precio_iva: 1331 },
  ])]
  const preview = await previewSupplierPriceDrafts(client, files, 1510)
  const result = await createSupplierPriceDrafts(client, files, 1510, preview)

  assert.equal(result.pendingVariant, 1)
  assert.equal(result.files[0].pendingVariant, 1)
  // La vista previa ya la contaba como omitida: el comprobante da el mismo total.
  assert.equal(result.skipped, preview.skipped)
})

// ── Historial de cargas de lista ─────────────────────────────────────────────

function recordingClient() {
  const calls = []
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params })
      if (/INSERT INTO supplier_price_imports/.test(sql)) {
        return { rows: [{ supplier: 'ALCIDES', created_at: '2026-08-26T12:00:00Z' }] }
      }
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }
}

test('una carga que no cambió ningún precio igual queda registrada', async () => {
  const client = recordingClient()
  await recordSupplierPriceImports(client, [
    { fileName: 'LISTA.xlsx', supplier: 'ALCIDES', totalRows: 108, created: 0, updated: 0, unchanged: 108, skipped: 108, pendingVariant: 0 },
  ], 1510)

  assert.equal(client.calls.length, 1)
  const entradas = JSON.parse(client.calls[0].params[0])
  assert.equal(entradas.length, 1)
  assert.equal(entradas[0].supplier, 'ALCIDES')
  assert.equal(entradas[0].total_rows, 108)
  assert.equal(entradas[0].unchanged_count, 108)
  assert.equal(entradas[0].created_count, 0)
  assert.equal(client.calls[0].params[1], 1510)
})

test('varios archivos del mismo proveedor se registran como una sola carga', async () => {
  const client = recordingClient()
  await recordSupplierPriceImports(client, [
    { fileName: 'PARTE-1.xlsx', supplier: 'ALCIDES', totalRows: 50, created: 2, updated: 10, unchanged: 38, skipped: 38, pendingVariant: 1 },
    { fileName: 'PARTE-2.xlsx', supplier: 'ALCIDES', totalRows: 30, created: 1, updated: 5, unchanged: 24, skipped: 24, pendingVariant: 2 },
  ], 1510)

  const entradas = JSON.parse(client.calls[0].params[0])
  assert.equal(entradas.length, 1)
  assert.deepEqual(entradas[0].file_names, ['PARTE-1.xlsx', 'PARTE-2.xlsx'])
  assert.equal(entradas[0].total_rows, 80)
  assert.equal(entradas[0].updated_count, 15)
  assert.equal(entradas[0].created_count, 3)
  assert.equal(entradas[0].pending_variant_count, 3)
})

test('archivos de proveedores distintos generan una carga por proveedor', async () => {
  const client = recordingClient()
  await recordSupplierPriceImports(client, [
    { fileName: 'A.xlsx', supplier: 'ALCIDES', totalRows: 10, created: 1, updated: 2, unchanged: 7, skipped: 7, pendingVariant: 0 },
    { fileName: 'K.xlsx', supplier: 'KIAN', totalRows: 20, created: 0, updated: 4, unchanged: 16, skipped: 16, pendingVariant: 0 },
  ], 1510)

  const entradas = JSON.parse(client.calls[0].params[0])
  assert.deepEqual(entradas.map(entrada => entrada.supplier), ['ALCIDES', 'KIAN'])
  assert.equal(entradas[1].total_rows, 20)
})

test('sin archivos no se escribe ninguna fila de historial', async () => {
  const client = recordingClient()
  const result = await recordSupplierPriceImports(client, [], 1510)
  assert.deepEqual(result, [])
  assert.equal(client.calls.length, 0)
})

// ── Aviso de variantes que la lista no actualiza ─────────────────────────────

// El caso real: BRE-7041..7044 vienen en el excel, BRE-7045 lo agregó el negocio.
const breRules = [
  { id: 'r-7044', color: null, size: '8 pulg', tone: null, precioVenta: 13234, precioIva: 16013.14, codigo: 'BRE-7044', supplierCode: 'BRE-7044', derived: false, updatedAt: '2026-07-12T00:00:00Z' },
  { id: 'r-7045', color: null, size: '9 pulg', tone: null, precioVenta: 13234, precioIva: 16013.14, codigo: 'BRE-7045', supplierCode: null, derived: false, updatedAt: '2026-07-12T00:00:00Z' },
]

function breClient(rules) {
  return {
    async query(sql) {
      if (/FROM supplier_product_mappings mapping/.test(sql)) return { rows: [{
        source_code_key: 'BRE-7044', product_id: 'p-bre', color_name: null, size_label: '8 pulg',
        tone_name: null, variant_rule_id: 'r-7044', product_code: 'BRE-04-GRP', product_name: 'Brida oblicua',
        precio_costo: 9339.17, precio_venta: 13234, precio_iva: 16013.14,
        precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null,
        rule_precio_costo: 9339.17, rule_precio_venta: 13234, rule_precio_iva: 16013.14,
        rule_precio_costo_usd: null, rule_precio_venta_usd: null, rule_precio_iva_usd: null,
        color_options: [], size_options: [], variant_rules: rules,
      }] }
      if (/FROM products WHERE supplier = \$1/.test(sql)) return { rows: [] }
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }
}

const breFile = () => renameFile([
  { codigo: 'BRE-7044', descripcion: 'Brida 8 pulg', precio_costo: 11207, precio_venta: 15880, precio_iva: 19214.8 },
])

test('la variante hecha a mano que no viene en la lista se avisa antes de confirmar', async () => {
  const result = await previewSupplierPriceDrafts(breClient(breRules), [breFile()], 1510)

  assert.equal(result.files[0].items[0].status, 'update')
  assert.equal(result.staleVariantCount, 1)
  const [producto] = result.staleVariants
  assert.equal(producto.productCode, 'BRE-04-GRP')
  assert.equal(producto.variants.length, 1)
  assert.equal(producto.variants[0].codigo, 'BRE-7045')
  assert.equal(producto.variants[0].hechaAMano, true)
  assert.equal(producto.variants[0].precioIva, 16013.14)
})

test('si esa variante sigue el precio de otra deja de avisarse: se actualiza sola', async () => {
  const rules = breRules.map(rule => rule.id === 'r-7045' ? { ...rule, derived: true } : rule)
  const result = await previewSupplierPriceDrafts(breClient(rules), [breFile()], 1510)

  assert.equal(result.staleVariantCount, 0)
  assert.deepEqual(result.staleVariants, [])
})

test('una variante con código de proveedor que no vino en el archivo se avisa como tal', async () => {
  const rules = breRules.map(rule => rule.id === 'r-7045'
    ? { ...rule, supplierCode: 'BRE-7045', codigo: 'BRE-7045' }
    : rule)
  const result = await previewSupplierPriceDrafts(breClient(rules), [breFile()], 1510)

  assert.equal(result.staleVariantCount, 1)
  assert.equal(result.staleVariants[0].variants[0].hechaAMano, false)
})

test('la variante que sí vino en la lista no figura como pendiente', async () => {
  const result = await previewSupplierPriceDrafts(breClient(breRules), [breFile()], 1510)
  const ids = result.staleVariants.flatMap(item => item.variants.map(variant => variant.id))
  assert.equal(ids.includes('r-7044'), false)
})

test('un producto de una sola variante no reporta nada: el trigger la sincroniza', async () => {
  const client = {
    async query(sql) {
      if (/FROM supplier_product_mappings mapping/.test(sql)) return { rows: [{
        source_code_key: 'SIMPLE', product_id: 'p-2', color_name: null, size_label: null,
        tone_name: null, variant_rule_id: null, product_code: 'SIMPLE', product_name: 'Producto simple',
        precio_costo: 800, precio_venta: 1000, precio_iva: 1210,
        precio_costo_usd: null, precio_venta_usd: null, precio_iva_usd: null,
        color_options: [], size_options: [],
        variant_rules: [{ id: 'r-base', color: null, size: null, tone: null, precioVenta: 1000, precioIva: 1210, codigo: 'SIMPLE', supplierCode: 'SIMPLE', derived: false, updatedAt: null }],
      }] }
      if (/FROM products WHERE supplier = \$1/.test(sql)) return { rows: [] }
      throw new Error(`Consulta inesperada: ${sql}`)
    },
  }
  const result = await previewSupplierPriceDrafts(client, [renameFile([
    { codigo: 'SIMPLE', descripcion: 'Producto simple', precio_costo: 900, precio_venta: 1100, precio_iva: 1331 },
  ])], 1510)

  assert.equal(result.staleVariantCount, 0)
})
