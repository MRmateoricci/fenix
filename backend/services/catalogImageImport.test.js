import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMergedVariantOptions, matchKnownProductsOnPage } from './catalogImageImport.js'

test('asocia códigos conocidos aunque el PDF cambie espacios y guiones', () => {
  const products = [
    { id: 'one', codigo: 'AT-204 C' },
    { id: 'two', codigo: 'V01-PINT' },
  ]
  const items = [
    { text: 'AT 204-C', x: 210, y: 600 },
    { text: 'V01 PINT', x: 100, y: 300 },
    { text: '59.400', x: 500, y: 600 },
  ]
  const placements = [
    { objectName: 'img-a', x0: 40, x1: 180, y0: 570, y1: 630 },
    { objectName: 'img-b', x0: 600, x1: 680, y0: 280, y1: 330 },
  ]

  const matches = matchKnownProductsOnPage(items, placements, products)
  assert.deepEqual(matches.map(match => match.product.id), ['one', 'two'])
  assert.equal(matches[0].ranked[0].placement.objectName, 'img-a')
  assert.equal(matches[1].ranked[0].placement.objectName, 'img-b')
})

test('no inventa asociaciones con números o textos que no son códigos cargados', () => {
  const matches = matchKnownProductsOnPage(
    [{ text: '13530', x: 400, y: 500 }, { text: 'APLIQUE PINZA', x: 200, y: 500 }],
    [{ objectName: 'img-a', x0: 20, x1: 100, y0: 480, y1: 520 }],
    [{ id: 'one', codigo: '403' }]
  )
  assert.equal(matches.length, 0)
})

test('une dos productos como colores y conserva los precios de cada codigo', () => {
  const target = {
    codigo: 'AP-105B/T', color_options: [], size_options: [], variant_stock: {}, image_url: '/blanco.png',
    precio_costo: 100, precio_venta: 150, precio_iva: 181.5,
    precio_costo_usd: 1, precio_venta_usd: 1.5, precio_iva_usd: 1.815,
  }
  const source = {
    codigo: 'AP-105N/T', color_options: [], size_options: [], variant_stock: {}, image_url: '/negro.png',
    precio_costo: 120, precio_venta: 180, precio_iva: 217.8,
    precio_costo_usd: 1.2, precio_venta_usd: 1.8, precio_iva_usd: 2.178,
  }

  const merged = buildMergedVariantOptions(target, source, {
    variantType: 'color', baseCode: 'AP-105', targetValue: 'Blanco', sourceValue: 'Negro',
    targetHex: '#FFFFFF', sourceHex: '#111111',
  })

  assert.deepEqual(merged.colorOptions.map(color => ({ name: color.name, code: color.supplierCode, price: color.price })), [
    { name: 'Blanco', code: 'AP-105B/T', price: 150 },
    { name: 'Negro', code: 'AP-105N/T', price: 180 },
  ])
  assert.equal(merged.prices.precioVenta, 150)
  assert.equal(merged.baseCode, 'AP-105')
  assert.equal(merged.sizeOptions.length, 0)
})

test('une dos productos como medidas y rechaza nombres repetidos', () => {
  const target = { codigo: 'T-10', color_options: [], size_options: [], variant_stock: {}, precio_venta: 100 }
  const source = { codigo: 'T-20', color_options: [], size_options: [], variant_stock: {}, precio_venta: 200 }
  const merged = buildMergedVariantOptions(target, source, {
    variantType: 'size', baseCode: 'T', targetValue: '10 cm', sourceValue: '20 cm',
  })
  assert.deepEqual(merged.sizeOptions.map(size => ({ label: size.label, code: size.supplierCode, price: size.price })), [
    { label: '10 cm', code: 'T-10', price: 100 },
    { label: '20 cm', code: 'T-20', price: 200 },
  ])
  assert.throws(() => buildMergedVariantOptions(target, source, {
    variantType: 'size', baseCode: 'T', targetValue: '10 cm', sourceValue: '10 CM',
  }), /diferentes/)
})
