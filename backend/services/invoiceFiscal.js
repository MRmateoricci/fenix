const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires';
const FACTURA_C = 11;

export class InvoiceValidationError extends Error {
  constructor(message, code = 'INVOICE_VALIDATION_ERROR') {
    super(message);
    this.name = 'InvoiceValidationError';
    this.code = code;
  }
}

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function requireText(value, field) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new InvoiceValidationError(`Falta ${field}.`, 'INVOICE_RECIPIENT_INVALID');
  return normalized;
}

export function isValidCuit(value) {
  const valueDigits = digits(value);
  if (!/^\d{11}$/.test(valueDigits)) return false;
  const factors = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = factors.reduce((total, factor, index) => total + factor * Number(valueDigits[index]), 0);
  const remainder = 11 - (sum % 11);
  const checkDigit = remainder === 11 ? 0 : remainder === 10 ? 9 : remainder;
  return checkDigit === Number(valueDigits[10]);
}

export function buildReceiverData(customer = {}, order = {}) {
  const source = customer.invoiceRecipient || customer;
  const name = requireText(
    source.name ?? source.nombreFiscal ?? order.invoice_recipient_name ?? order.customer_name,
    'el nombre o razón social del receptor',
  );
  const docType = Number(source.docType ?? source.tipoDocumento ?? order.invoice_doc_type);
  let docNumber = digits(source.docNumber ?? source.numeroDocumento ?? order.invoice_doc_number);
  const vatConditionId = Number(
    source.vatConditionId ?? source.condicionIvaId ?? order.invoice_vat_condition_id,
  );

  if (!Number.isInteger(docType) || !Number.isInteger(vatConditionId) || vatConditionId <= 0) {
    throw new InvoiceValidationError(
      'El tipo de documento y la condición frente al IVA son obligatorios.',
      'INVOICE_RECIPIENT_INVALID',
    );
  }

  if (docType === 80) {
    if (!isValidCuit(docNumber)) {
      throw new InvoiceValidationError('El CUIT del receptor no es válido.', 'INVOICE_RECIPIENT_INVALID');
    }
  } else if (docType === 96) {
    if (!/^\d{7,8}$/.test(docNumber)) {
      throw new InvoiceValidationError('El DNI debe contener 7 u 8 dígitos.', 'INVOICE_RECIPIENT_INVALID');
    }
  } else if ([0, 99].includes(docType)) {
    docNumber = docNumber || '0';
    if (docNumber !== '0') {
      throw new InvoiceValidationError(
        'Consumidor Final sin documento debe usar número 0.',
        'INVOICE_RECIPIENT_INVALID',
      );
    }
  } else if (!/^\d{1,20}$/.test(docNumber)) {
    throw new InvoiceValidationError('El número de documento no es válido.', 'INVOICE_RECIPIENT_INVALID');
  }

  return { name, docType, docNumber, vatConditionId };
}

export function moneyToCents(value) {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new InvoiceValidationError('El total persistido del pedido no es válido.', 'INVOICE_AMOUNT_INVALID');
  }
  const [integer, decimals = ''] = normalized.split('.');
  const cents = (BigInt(integer) * 100n) + BigInt(decimals.padEnd(2, '0'));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new InvoiceValidationError('El total del pedido excede el máximo admitido.', 'INVOICE_AMOUNT_INVALID');
  }
  return Number(cents);
}

export function centsToArcaAmount(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new InvoiceValidationError('El importe en centavos no es válido.', 'INVOICE_AMOUNT_INVALID');
  }
  return Number((cents / 100).toFixed(2));
}

export function buildInvoiceAmounts(order) {
  const totalCents = moneyToCents(order?.total_amount);
  if (totalCents <= 0) {
    throw new InvoiceValidationError('El total del pedido debe ser mayor a cero.', 'INVOICE_AMOUNT_INVALID');
  }
  return {
    totalCents,
    netCents: totalCents,
    vatCents: 0,
    tributesCents: 0,
    nonTaxableCents: 0,
    exemptCents: 0,
    total: centsToArcaAmount(totalCents),
    net: centsToArcaAmount(totalCents),
    vat: 0,
    tributes: 0,
    nonTaxable: 0,
    exempt: 0,
  };
}

export function argentinaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ARGENTINA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function toArcaDate(value) {
  const normalized = String(value ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(Date.parse(`${normalized}T12:00:00Z`))) {
    throw new InvoiceValidationError('La fecha fiscal no es válida.', 'INVOICE_DATE_INVALID');
  }
  return normalized.replaceAll('-', '');
}

function validateConcept(order, configuredConcept) {
  const concept = Number(order.invoice_concept || configuredConcept || 1);
  if (![1, 2, 3].includes(concept)) {
    throw new InvoiceValidationError('El concepto debe ser productos, servicios o ambos.', 'INVOICE_CONCEPT_INVALID');
  }
  if (concept !== 1 && (!order.invoice_service_from || !order.invoice_service_to || !order.invoice_payment_due)) {
    throw new InvoiceValidationError(
      'Los comprobantes de servicios requieren período y vencimiento de pago.',
      'INVOICE_SERVICE_DATES_REQUIRED',
    );
  }
  return concept;
}

function buildFacturaC({ order, receiver, pointOfSale, voucherNumber, concept, voucherDate }) {
  const amounts = buildInvoiceAmounts(order);
  const detail = {
    Concepto: concept,
    DocTipo: receiver.docType,
    DocNro: receiver.docNumber,
    CbteDesde: voucherNumber,
    CbteHasta: voucherNumber,
    CbteFch: toArcaDate(voucherDate),
    ImpTotal: amounts.total,
    ImpTotConc: amounts.nonTaxable,
    ImpNeto: amounts.net,
    ImpOpEx: amounts.exempt,
    ImpTrib: amounts.tributes,
    ImpIVA: amounts.vat,
    MonId: 'PES',
    MonCotiz: 1,
    CondicionIVAReceptorId: receiver.vatConditionId,
  };

  if (concept !== 1) {
    detail.FchServDesde = toArcaDate(order.invoice_service_from);
    detail.FchServHasta = toArcaDate(order.invoice_service_to);
    detail.FchVtoPago = toArcaDate(order.invoice_payment_due);
  }

  return {
    request: {
      FeCabReq: { CantReg: 1, PtoVta: pointOfSale, CbteTipo: FACTURA_C },
      FeDetReq: { FECAEDetRequest: [detail] },
    },
    amounts,
  };
}

const voucherStrategies = new Map([[FACTURA_C, buildFacturaC]]);

export function buildInvoiceRequest({
  order,
  receiver,
  pointOfSale,
  voucherType = FACTURA_C,
  voucherNumber,
  configuredConcept = 1,
  voucherDate = argentinaDate(),
}) {
  const strategy = voucherStrategies.get(Number(voucherType));
  if (!strategy) {
    throw new InvoiceValidationError(
      `El tipo de comprobante ${voucherType} todavía no está soportado.`,
      'INVOICE_TYPE_NOT_SUPPORTED',
    );
  }
  const concept = validateConcept(order, configuredConcept);
  return {
    ...strategy({ order, receiver, pointOfSale, voucherNumber, concept, voucherDate }),
    concept,
    voucherDate,
    voucherType: Number(voucherType),
  };
}

export { ARGENTINA_TIME_ZONE, FACTURA_C };
