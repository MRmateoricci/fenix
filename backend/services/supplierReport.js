// Cada agregado se calcula por separado para no multiplicar productos, ventas
// o importaciones al unir relaciones de uno a muchos.
export const SUPPLIER_REPORT_SQL = `
WITH product_stats AS (
  SELECT COALESCE(NULLIF(UPPER(BTRIM(supplier)), ''), 'SIN PROVEEDOR') AS supplier,
    COUNT(*)::int AS product_count,
    COUNT(*) FILTER (WHERE published)::int AS published_count,
    COUNT(*) FILTER (WHERE stock <= 0)::int AS out_of_stock_count,
    COALESCE(SUM(stock), 0) AS stock_units,
    COUNT(*) FILTER (WHERE price_currency = 'USD')::int AS usd_count,
    MAX(price_updated_at) AS last_price_change_at
  FROM products GROUP BY 1
), latest_import AS (
  SELECT DISTINCT ON (UPPER(BTRIM(supplier))) UPPER(BTRIM(supplier)) AS supplier,
    created_at, created_count, updated_count, unchanged_count, pending_variant_count, file_names
  FROM supplier_price_imports ORDER BY UPPER(BTRIM(supplier)), created_at DESC, id DESC
), sale_lines AS (
  SELECT o.id AS order_id, COALESCE(o.paid_at, o.created_at) AS sale_at,
    COALESCE(NULLIF(UPPER(BTRIM(item->>'supplier')), ''), NULLIF(UPPER(BTRIM(p.supplier)), ''), 'SIN PROVEEDOR') AS supplier,
    CASE WHEN item->>'quantity' ~ '^[0-9]+([.][0-9]+)?$' THEN (item->>'quantity')::numeric ELSE 0 END AS quantity,
    CASE WHEN item->>'price' ~ '^[0-9]+([.][0-9]+)?$' THEN (item->>'price')::numeric ELSE 0 END AS price,
    NULLIF(BTRIM(item->>'supplier'), '') IS NULL AND p.id IS NOT NULL AS inferred_supplier
  FROM orders o
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END) item
  LEFT JOIN products p ON p.id::text = item->>'id'
  WHERE o.status IN ('paid', 'preparing', 'shipped', 'delivered')
    AND ($1::int IS NULL OR COALESCE(o.paid_at, o.created_at) >= NOW() - make_interval(days => $1::int))
), sales AS (
  SELECT supplier, COUNT(DISTINCT order_id)::int AS order_count,
    SUM(quantity) AS units_sold, SUM(price * quantity) AS sales_amount,
    MAX(sale_at) AS last_sale_at, COUNT(*) FILTER (WHERE inferred_supplier)::int AS inferred_lines
  FROM sale_lines WHERE quantity > 0 GROUP BY supplier
), suppliers AS (
  SELECT supplier FROM product_stats UNION SELECT supplier FROM latest_import
  UNION SELECT UPPER(BTRIM(supplier)) FROM supplier_price_settings UNION SELECT supplier FROM sales
)
SELECT s.supplier,
  COALESCE(p.product_count, 0) AS product_count, COALESCE(p.published_count, 0) AS published_count,
  COALESCE(p.out_of_stock_count, 0) AS out_of_stock_count, COALESCE(p.stock_units, 0) AS stock_units,
  COALESCE(p.usd_count, 0) AS usd_count, p.last_price_change_at,
  li.created_at AS last_import_at, li.created_count AS import_created,
  li.updated_count AS import_updated, li.unchanged_count AS import_unchanged,
  li.pending_variant_count AS import_pending, li.file_names AS import_files,
  COALESCE(v.order_count, 0) AS order_count, COALESCE(v.units_sold, 0) AS units_sold,
  COALESCE(v.sales_amount, 0) AS sales_amount, v.last_sale_at, COALESCE(v.inferred_lines, 0) AS inferred_lines,
  (SELECT COUNT(DISTINCT order_id)::int FROM sale_lines WHERE quantity > 0) AS total_orders
FROM suppliers s
LEFT JOIN product_stats p USING (supplier)
LEFT JOIN latest_import li USING (supplier)
LEFT JOIN sales v USING (supplier)
WHERE s.supplier IS NOT NULL AND s.supplier <> ''
ORDER BY s.supplier`

export function parseSupplierReportPeriod(value = '30') {
  if (!['30', '90', '365', 'all'].includes(value)) throw new Error('Período inválido. Elegí 30, 90, 365 días o todo el historial.')
  return value === 'all' ? null : Number(value)
}

export async function getSupplierReport(client, period = '30') {
  const { rows } = await client.query(SUPPLIER_REPORT_SQL, [parseSupplierReportPeriod(period)])
  const suppliers = rows.map(row => ({
    supplier: row.supplier,
    productCount: Number(row.product_count), publishedCount: Number(row.published_count),
    draftCount: Number(row.product_count) - Number(row.published_count),
    outOfStockCount: Number(row.out_of_stock_count), stockUnits: Number(row.stock_units),
    usdCount: Number(row.usd_count), lastPriceChangeAt: row.last_price_change_at,
    lastImport: row.last_import_at ? {
      at: row.last_import_at, created: Number(row.import_created), updated: Number(row.import_updated),
      unchanged: Number(row.import_unchanged), pendingVariant: Number(row.import_pending),
      fileNames: row.import_files || [],
    } : null,
    orderCount: Number(row.order_count), unitsSold: Number(row.units_sold),
    salesAmount: Number(row.sales_amount), lastSaleAt: row.last_sale_at, inferredLines: Number(row.inferred_lines),
  }))
  return { period, generatedAt: new Date().toISOString(), suppliers,
    totals: {
      suppliers: suppliers.length,
      products: suppliers.reduce((total, supplier) => total + supplier.productCount, 0),
      withoutImports: suppliers.filter(supplier => !supplier.lastImport).length,
      orders: Number(rows[0]?.total_orders || 0),
      salesAmount: suppliers.reduce((total, supplier) => total + supplier.salesAmount, 0),
    },
  }
}
