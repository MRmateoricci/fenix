export function documentKindForNumber(value) {
  return String(value || '').replace(/\D/g, '').length > 8 ? 'cuit' : 'dni'
}

export function applyInvoiceMode(current, options, needsInvoiceA) {
  if (!options) return { ...current, needsInvoiceA }
  const conditions = options.vatConditions || []
  const documents = options.documents || []
  const compatibleConditions = needsInvoiceA
    ? conditions.filter((condition) => ['A', 'ALEY'].includes(condition.invoiceClass))
    : conditions.filter((condition) => condition.category === 'consumer_final')
  const currentCondition = compatibleConditions
    .find((condition) => condition.id === Number(current.invoiceVatConditionId))
  const preferredCondition = currentCondition
    || (!needsInvoiceA
      ? compatibleConditions.find((condition) => condition.category === 'consumer_final')
      : compatibleConditions.length === 1 ? compatibleConditions[0] : null)
  const cuitDocument = documents.find((document) => document.kind === 'cuit')
  const dniDocument = documents.find((document) => document.kind === 'dni')
  const anonymousDocument = documents.find((document) => document.kind === 'consumer_final')
  const digits = String(current.invoiceDocNumber || '').replace(/\D/g, '')
  const consumerFinalWithoutCuit = !needsInvoiceA && current.consumerFinalWithoutCuit === true
  const consumerFinalDigits = consumerFinalWithoutCuit && digits.length <= 8 ? digits : ''
  const document = consumerFinalWithoutCuit
    ? consumerFinalDigits ? dniDocument : anonymousDocument
    : needsInvoiceA || documentKindForNumber(digits) === 'cuit'
      ? cuitDocument
      : dniDocument

  return {
    ...current,
    needsInvoiceA,
    consumerFinalWithoutCuit,
    invoiceName: needsInvoiceA
      ? (currentCondition ? current.invoiceName : '')
      : `${current.nombre || ''} ${current.apellido || ''}`.trim(),
    invoiceDocType: document ? String(document.id) : '',
    invoiceDocNumber: consumerFinalWithoutCuit
      ? consumerFinalDigits
      : needsInvoiceA && digits.length !== 11 ? '' : digits,
    invoiceVatConditionId: preferredCondition ? String(preferredCondition.id) : '',
  }
}
