import { IVA_MULTIPLIER } from '../config/tax.js'

export { IVA_MULTIPLIER }

function numericOrNull(value) {
  if (value == null || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export function roundPublicPrice(value) {
  const numeric = numericOrNull(value)
  return numeric == null ? null : Math.round(numeric * 100) / 100
}

// La tienda siempre publica importes finales con IVA. Para proveedores en USD
// se convierte primero a ARS; si no existe el precio con IVA, se calcula un
// fallback del 21 % sobre el precio de venta disponible.
export function resolvePublicPrice({
  priceWithTax,
  priceWithTaxUsd,
  price,
  priceUsd,
  currency = 'ARS',
  usdArsRate = 1510,
}) {
  const rate = numericOrNull(usdArsRate) || 1510
  const sourceIsUsd = currency === 'USD'
  const tax = sourceIsUsd && numericOrNull(priceWithTaxUsd) != null
    ? numericOrNull(priceWithTaxUsd) * rate
    : numericOrNull(priceWithTax)
  if (tax != null) return roundPublicPrice(tax)

  const sale = sourceIsUsd && numericOrNull(priceUsd) != null
    ? numericOrNull(priceUsd) * rate
    : numericOrNull(price)
  return sale == null ? null : roundPublicPrice(sale * IVA_MULTIPLIER)
}

export function resolvePublicOptionPrice(option, currency, usdArsRate) {
  return resolvePublicPrice({
    priceWithTax: option?.priceWithTax,
    priceWithTaxUsd: option?.priceWithTaxUsd,
    price: option?.price,
    priceUsd: option?.priceUsd,
    currency,
    usdArsRate,
  })
}
