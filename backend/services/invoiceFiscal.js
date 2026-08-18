import {
  CONSUMER_FINAL_IDENTIFICATION_THRESHOLD,
  DEFAULT_VAT_RATE,
} from '../config/tax.js';

const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires';
const FACTURA_A = 1;
const FACTURA_B = 6;
const FACTURA_C = 11;
const FACTURA_A_SUJETA_RETENCION = 51;

const TAXED_VOUCHERS = new Set([FACTURA_A, FACTURA_B, FACTURA_A_SUJETA_RETENCION]);
const A_VOUCHERS = new Set([FACTURA_A, FACTURA_A_SUJETA_RETENCION]);

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

function normalizedLabel(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function requireText(value, field) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new InvoiceValidationError(`Falta ${field}.`, 'INVOICE_RECIPIENT_INVALID');
  return normalized;
}

function normalizeIssuerVatCategory(value) {
  const normalized = normalizedLabel(value);
  if (normalized === 'registered' || /responsable (?:inscripto|inscrito)/.test(normalized)) {
    return 'registered';
  }
  if (normalized === 'monotributo' || /monotribut/.test(normalized)) return 'monotributo';
  if (normalized === 'exempt' || /\bexent[oa]\b/.test(normalized)) return 'exempt';
  throw new InvoiceValidationError(
    'La condición IVA del emisor no está soportada.',
    'INVOICE_ISSUER_VAT_CONDITION_UNSUPPORTED',
  );
}

export function classifyReceiverVatCondition(value) {
  const normalized = normalizedLabel(value);
  if (normalized === 'registered' || /responsable (?:inscripto|inscrito)/.test(normalized)) {
    return 'registered';
  }
  if (normalized === 'monotributo' || /monotribut/.test(normalized)) return 'monotributo';
  if (normalized === 'exempt' || /\bexent[oa]\b/.test(normalized)) return 'exempt';
  if (normalized === 'consumer_final' || /consumidor final/.test(normalized)) return 'consumer_final';
  return null;
}

function invoiceAType(aAuthorizationMode) {
  if (aAuthorizationMode === 'subject_to_withholding') return FACTURA_A_SUJETA_RETENCION;
  if (['standard', 'cbu_informed'].includes(aAuthorizationMode)) return FACTURA_A;
  throw new InvoiceValidationError(
    'Falta configurar la habilitación real de comprobantes A del emisor.',
    'ARCA_A_AUTHORIZATION_MODE_REQUIRED',
  );
}

export function determineVoucherType({
  issuerVatCondition,
  receiverVatCondition,
  aAuthorizationMode,
}) {
  const issuer = normalizeIssuerVatCategory(issuerVatCondition);
  const receiver = classifyReceiverVatCondition(receiverVatCondition);
  if (!receiver) {
    throw new InvoiceValidationError(
      'La condición IVA del receptor no está contemplada por la facturación actual.',
      'INVOICE_RECEIVER_VAT_CONDITION_UNSUPPORTED',
    );
  }

  if (issuer === 'monotributo' || issuer === 'exempt') return FACTURA_C;
  if (receiver === 'registered' || receiver === 'monotributo') {
    return invoiceAType(aAuthorizationMode);
  }
  if (receiver === 'consumer_final' || receiver === 'exempt') return FACTURA_B;

  throw new InvoiceValidationError(
    'No existe una estrategia fiscal para la combinación de emisor y receptor.',
    'INVOICE_VOUCHER_COMBINATION_UNSUPPORTED',
  );
}

export function invoiceClassForVoucherType(voucherType) {
  const type = Number(voucherType);
  if (type === FACTURA_A) return 'A';
  if (type === FACTURA_A_SUJETA_RETENCION) return 'ALEY';
  if (type === FACTURA_B) return 'B';
  if (type === FACTURA_C) return 'C';
  throw new InvoiceValidationError(
    `El tipo de comprobante ${voucherType} todavía no está soportado.`,
    'INVOICE_TYPE_NOT_SUPPORTED',
  );
}

export function voucherPresentation(voucherType, aAuthorizationMode = null) {
  const type = Number(voucherType);
  if (type === FACTURA_B) return { letter: 'B', name: 'FACTURA B', legend: null };
  if (type === FACTURA_C) return { letter: 'C', name: 'FACTURA C', legend: null };
  if (type === FACTURA_A_SUJETA_RETENCION) {
    return {
      letter: 'A',
      name: 'FACTURA A',
      legend: 'OPERACIÓN SUJETA A RETENCIÓN',
    };
  }
  if (type === FACTURA_A) {
    return {
      letter: 'A',
      name: 'FACTURA A',
      legend: aAuthorizationMode === 'cbu_informed' ? 'PAGO EN CBU INFORMADA' : null,
    };
  }
  return { letter: '', name: `COMPROBANTE ${voucherType}`, legend: null };
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
  } else if (docType === 99) {
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

export function validateReceiverForVoucher({
  receiver,
  receiverVatCondition,
  voucherType,
  totalAmount,
  consumerIdentificationThreshold = CONSUMER_FINAL_IDENTIFICATION_THRESHOLD,
}) {
  const category = classifyReceiverVatCondition(receiverVatCondition);
  const type = Number(voucherType);
  if (!category) {
    throw new InvoiceValidationError(
      'La condición IVA del receptor no está soportada.',
      'INVOICE_RECEIVER_VAT_CONDITION_UNSUPPORTED',
    );
  }

  if (A_VOUCHERS.has(type)) {
    if (!['registered', 'monotributo'].includes(category) || receiver.docType !== 80) {
      throw new InvoiceValidationError(
        'Factura A requiere receptor Responsable Inscripto o Monotributista identificado con CUIT.',
        'INVOICE_DOCUMENT_VOUCHER_MISMATCH',
      );
    }
  } else if (type === FACTURA_B) {
    if (!['consumer_final', 'exempt'].includes(category)) {
      throw new InvoiceValidationError(
        'Factura B solo admite las condiciones IVA habilitadas por ARCA para esa clase.',
        'INVOICE_VAT_CONDITION_VOUCHER_MISMATCH',
      );
    }
    if (category === 'exempt' && receiver.docType !== 80) {
      throw new InvoiceValidationError(
        'Un receptor Exento debe identificarse con CUIT.',
        'INVOICE_DOCUMENT_VOUCHER_MISMATCH',
      );
    }
    const thresholdCents = moneyToCents(consumerIdentificationThreshold);
    if (category === 'consumer_final'
      && moneyToCents(totalAmount) >= thresholdCents
      && receiver.docType === 99) {
      throw new InvoiceValidationError(
        'El importe requiere identificar al Consumidor Final con CUIT o DNI.',
        'INVOICE_CONSUMER_IDENTIFICATION_REQUIRED',
      );
    }
    if (category === 'consumer_final' && ![80, 96, 99].includes(receiver.docType)) {
      throw new InvoiceValidationError(
        'Consumidor Final debe usar CUIT, DNI o el documento Consumidor Final informado por ARCA.',
        'INVOICE_DOCUMENT_VOUCHER_MISMATCH',
      );
    }
  }

  return { ...receiver, vatCategory: category };
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

function vatRateBasisPoints(value) {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new InvoiceValidationError('La alícuota IVA no es válida.', 'INVOICE_VAT_RATE_INVALID');
  }
  const [integer, decimals = ''] = normalized.split('.');
  const basisPoints = (Number(integer) * 100) + Number(decimals.padEnd(2, '0'));
  if (!Number.isSafeInteger(basisPoints) || basisPoints <= 0 || basisPoints > 10_000) {
    throw new InvoiceValidationError('La alícuota IVA no es válida.', 'INVOICE_VAT_RATE_INVALID');
  }
  return basisPoints;
}

function divideRoundHalfEven(numerator, denominator) {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const doubled = remainder * 2n;
  if (doubled < denominator) return quotient;
  if (doubled > denominator) return quotient + 1n;
  return quotient % 2n === 0n ? quotient : quotient + 1n;
}

export function buildInvoiceAmounts(order, {
  voucherType = FACTURA_C,
  vatRate = DEFAULT_VAT_RATE,
} = {}) {
  const totalCents = moneyToCents(order?.total_amount);
  if (totalCents <= 0) {
    throw new InvoiceValidationError('El total del pedido debe ser mayor a cero.', 'INVOICE_AMOUNT_INVALID');
  }

  if (!TAXED_VOUCHERS.has(Number(voucherType))) {
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
      ivaBreakdown: [],
    };
  }

  const rateBasisPoints = vatRateBasisPoints(vatRate);
  const netCents = Number(divideRoundHalfEven(
    BigInt(totalCents) * 10_000n,
    BigInt(10_000 + rateBasisPoints),
  ));
  const vatCents = totalCents - netCents;
  const normalizedRate = rateBasisPoints / 100;
  return {
    totalCents,
    netCents,
    vatCents,
    tributesCents: 0,
    nonTaxableCents: 0,
    exemptCents: 0,
    total: centsToArcaAmount(totalCents),
    net: centsToArcaAmount(netCents),
    vat: centsToArcaAmount(vatCents),
    tributes: 0,
    nonTaxable: 0,
    exempt: 0,
    ivaBreakdown: [{
      rate: normalizedRate,
      baseCents: netCents,
      vatCents,
      base: centsToArcaAmount(netCents),
      amount: centsToArcaAmount(vatCents),
    }],
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

function baseDetail({ order, receiver, voucherNumber, concept, voucherDate, amounts }) {
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
  return detail;
}

function buildFacturaC(context) {
  const amounts = buildInvoiceAmounts(context.order, { voucherType: FACTURA_C });
  const detail = baseDetail({ ...context, amounts });
  return {
    request: {
      FeCabReq: { CantReg: 1, PtoVta: context.pointOfSale, CbteTipo: FACTURA_C },
      FeDetReq: { FECAEDetRequest: [detail] },
    },
    amounts,
  };
}

function buildTaxedVoucher(context) {
  const voucherType = Number(context.voucherType);
  const vatRateId = Number(context.vatRateId);
  if (!Number.isInteger(vatRateId) || vatRateId <= 0) {
    throw new InvoiceValidationError(
      'Falta el identificador de alícuota validado contra FEParamGetTiposIva.',
      'INVOICE_VAT_RATE_ID_REQUIRED',
    );
  }
  const amounts = buildInvoiceAmounts(context.order, {
    voucherType,
    vatRate: context.vatRate,
  });
  const detail = baseDetail({ ...context, amounts });
  detail.Iva = {
    AlicIva: amounts.ivaBreakdown.map((item) => ({
      Id: vatRateId,
      BaseImp: item.base,
      Importe: item.amount,
    })),
  };
  return {
    request: {
      FeCabReq: { CantReg: 1, PtoVta: context.pointOfSale, CbteTipo: voucherType },
      FeDetReq: { FECAEDetRequest: [detail] },
    },
    amounts,
  };
}

const voucherStrategies = new Map([
  [FACTURA_A, buildTaxedVoucher],
  [FACTURA_B, buildTaxedVoucher],
  [FACTURA_C, buildFacturaC],
  [FACTURA_A_SUJETA_RETENCION, buildTaxedVoucher],
]);

export function buildInvoiceRequest({
  order,
  receiver,
  pointOfSale,
  voucherType = FACTURA_C,
  voucherNumber,
  configuredConcept = 1,
  voucherDate = argentinaDate(),
  vatRate = DEFAULT_VAT_RATE,
  vatRateId = null,
}) {
  const normalizedType = Number(voucherType);
  const strategy = voucherStrategies.get(normalizedType);
  if (!strategy) {
    throw new InvoiceValidationError(
      `El tipo de comprobante ${voucherType} todavía no está soportado.`,
      'INVOICE_TYPE_NOT_SUPPORTED',
    );
  }
  const concept = validateConcept(order, configuredConcept);
  return {
    ...strategy({
      order,
      receiver,
      pointOfSale,
      voucherType: normalizedType,
      voucherNumber,
      concept,
      voucherDate,
      vatRate,
      vatRateId,
    }),
    concept,
    voucherDate,
    voucherType: normalizedType,
  };
}

export {
  ARGENTINA_TIME_ZONE,
  FACTURA_A,
  FACTURA_A_SUJETA_RETENCION,
  FACTURA_B,
  FACTURA_C,
};
