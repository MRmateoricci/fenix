import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import {
  classifyReceiverVatCondition,
  invoiceClassForVoucherType,
  voucherPresentation,
} from './invoiceFiscal.js';

const ARCA_QR_BASE_URL = 'https://www.arca.gob.ar/fe/qr/?p=';
const MONOTRIBUTO_CREDIT_LEGEND = 'El crédito fiscal discriminado en el presente comprobante, solo podrá ser computado a efectos del Régimen de Sostenimiento e Inclusión Fiscal para Pequeños Contribuyentes de la Ley Nº 27.618.';
const FISCAL_TRANSPARENCY_TITLE = 'Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)';
const DEFAULT_INVOICE_LOGO_PATH = fileURLToPath(
  new URL('../../src/assets/logo_fenix-removebg-preview.png', import.meta.url),
);

let defaultInvoiceLogoPromise;

function isoDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

function displayDate(value) {
  const normalized = isoDate(value);
  if (!normalized) return '';
  const [year, month, day] = normalized.split('-');
  return day ? `${day}/${month}/${year}` : `${month}/${year}`;
}

function money(value) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function buildArcaQrPayload(invoice) {
  if (!invoice?.cae || !invoice?.cbte_numero || !invoice?.fecha_comprobante) {
    throw new Error('La factura autorizada no contiene todos los datos requeridos para el QR.');
  }
  return {
    ver: 1,
    fecha: isoDate(invoice.fecha_comprobante),
    cuit: Number(invoice.issuer_cuit),
    ptoVta: Number(invoice.pto_vta),
    tipoCmp: Number(invoice.cbte_tipo),
    nroCmp: Number(invoice.cbte_numero),
    importe: Number(Number(invoice.imp_total).toFixed(2)),
    moneda: invoice.currency || 'PES',
    ctz: Number(invoice.currency_rate || 1),
    tipoDocRec: Number(invoice.receiver_doc_type),
    nroDocRec: Number(invoice.receiver_doc_number || 0),
    tipoCodAut: 'E',
    codAut: Number(invoice.cae),
  };
}

export function buildArcaQrUrl(invoice) {
  const payload = buildArcaQrPayload(invoice);
  return `${ARCA_QR_BASE_URL}${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')}`;
}

function formattedVoucherNumber(invoice) {
  return `${String(invoice.pto_vta).padStart(5, '0')}-${String(invoice.cbte_numero).padStart(8, '0')}`;
}

function presentationFor(invoice) {
  return voucherPresentation(invoice.cbte_tipo, invoice.issuer_snapshot?.aAuthorizationMode);
}

function receiverVatLegend(invoice, receiver) {
  const description = receiver.vatCategory
    || receiver.vatConditionDescription
    || receiver.vatConditionId
    || invoice.receiver_vat_condition_id;
  switch (classifyReceiverVatCondition(description)) {
    case 'consumer_final': return 'A CONSUMIDOR FINAL';
    case 'exempt': return 'IVA EXENTO';
    case 'monotributo': return 'RESPONSABLE MONOTRIBUTO';
    default: return description;
  }
}

function shouldShowFiscalTransparency(invoice, receiver) {
  const category = classifyReceiverVatCondition(
    receiver.vatCategory || receiver.vatConditionDescription || receiver.vatConditionId,
  );
  return Number(invoice.imp_iva) > 0
    && ['consumer_final', 'exempt', 'monotributo'].includes(category);
}

async function trimTransparentImage(source) {
  const image = await loadImage(source);
  const sourceCanvas = createCanvas(image.width, image.height);
  const sourceContext = sourceCanvas.getContext('2d');
  sourceContext.drawImage(image, 0, 0);
  const pixels = sourceContext.getImageData(0, 0, image.width, image.height).data;
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (pixels[((y * image.width) + x) * 4 + 3] > 5) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;

  const padding = 4;
  const x = Math.max(0, minX - padding);
  const y = Math.max(0, minY - padding);
  const width = Math.min(image.width - x, (maxX - minX + 1) + (padding * 2));
  const height = Math.min(image.height - y, (maxY - minY + 1) + (padding * 2));
  const output = createCanvas(width, height);
  output.getContext('2d').drawImage(image, x, y, width, height, 0, 0, width, height);
  return output.toBuffer('image/png');
}

async function loadDefaultInvoiceLogo() {
  if (!existsSync(DEFAULT_INVOICE_LOGO_PATH)) return null;
  return trimTransparentImage(await readFile(DEFAULT_INVOICE_LOGO_PATH));
}

async function invoiceLogo(logoSource) {
  if (logoSource === false) return null;
  if (logoSource) {
    const source = typeof logoSource === 'string' ? await readFile(logoSource) : logoSource;
    return trimTransparentImage(source);
  }
  defaultInvoiceLogoPromise ||= loadDefaultInvoiceLogo().catch(() => null);
  return defaultInvoiceLogoPromise;
}

function shouldShowMonotributoLegend(invoice) {
  const receiverCategory = invoice.receiver_snapshot?.vatCategory;
  return ['A', 'ALEY'].includes(invoiceClassForVoucherType(invoice.cbte_tipo))
    && receiverCategory === 'monotributo';
}

export async function generateInvoicePdf(invoice, { logoSource } = {}) {
  if (!invoice || invoice.status !== 'authorized') {
    throw new Error('Solo se puede generar el PDF de una factura autorizada.');
  }

  const issuer = invoice.issuer_snapshot || {};
  const receiver = invoice.receiver_snapshot || {};
  const itemsSnapshot = invoice.items_snapshot || {};
  const items = Array.isArray(itemsSnapshot.items) ? itemsSnapshot.items : [];
  const presentation = presentationFor(invoice);
  const vatBreakdown = Array.isArray(invoice.iva_breakdown)
    ? invoice.iva_breakdown
    : (Array.isArray(itemsSnapshot.vatBreakdown) ? itemsSnapshot.vatBreakdown : []);
  const qrImage = await QRCode.toBuffer(buildArcaQrUrl(invoice), {
    type: 'png',
    width: 240,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
  const logoImage = await invoiceLogo(logoSource);

  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margin: 42, info: { Title: presentation.name } });
    const chunks = [];
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('error', reject);
    document.on('end', () => resolve(Buffer.concat(chunks)));

    if (logoImage) {
      document.image(logoImage, 42, 38, { fit: [205, 66], align: 'left', valign: 'center' });
      document.font('Helvetica-Bold').fontSize(8)
        .text(issuer.legalName || 'Emisor', 42, 108, { width: 245 });
      document.font('Helvetica').fontSize(7)
        .text(`CUIT: ${issuer.cuit || invoice.issuer_cuit}`)
        .text(`Condición IVA: ${issuer.taxCondition || ''}`)
        .text(`Domicilio fiscal: ${issuer.taxAddress || ''}`)
        .text(`Ingresos Brutos: ${issuer.grossIncome || ''}`)
        .text(`Inicio de actividades: ${displayDate(issuer.activityStartDate)}`);
    } else {
      document.font('Helvetica-Bold').fontSize(18).text(issuer.legalName || 'Emisor', 42, 42, { width: 245 });
      document.font('Helvetica').fontSize(9)
        .text(`CUIT: ${issuer.cuit || invoice.issuer_cuit}`)
        .text(`Condición IVA: ${issuer.taxCondition || ''}`)
        .text(`Domicilio fiscal: ${issuer.taxAddress || ''}`)
        .text(`Ingresos Brutos: ${issuer.grossIncome || ''}`)
        .text(`Inicio de actividades: ${displayDate(issuer.activityStartDate)}`);
    }

    document.rect(295, 38, 258, 115).stroke('#555555');
    document.font('Helvetica-Bold').fontSize(28).text(presentation.letter, 305, 45, { width: 45, align: 'center' });
    document.fontSize(15).text(presentation.name, 355, 48, { width: 185 });
    document.font('Helvetica').fontSize(10)
      .text(`N.º ${formattedVoucherNumber(invoice)}`, 355, 75)
      .text(`Fecha: ${displayDate(invoice.fecha_comprobante)}`, 355, 93)
      .text(`Código comprobante: ${invoice.cbte_tipo}`, 355, 111);
    if (presentation.legend) {
      document.font('Helvetica-Bold').fontSize(7).text(presentation.legend, 305, 132, { width: 238, align: 'center' });
    }

    document.moveTo(42, 170).lineTo(553, 170).stroke('#999999');
    document.font('Helvetica-Bold').fontSize(11).text('Receptor', 42, 180);
    document.font('Helvetica').fontSize(9)
      .text(`Nombre / Razón social: ${receiver.name || ''}`)
      .text(`Documento (${invoice.receiver_doc_type}): ${invoice.receiver_doc_number}`)
      .text(`Condición IVA: ${receiverVatLegend(invoice, receiver)}`)
      .text(`Domicilio: ${receiver.address || ''}`);

    let y = document.y + 16;
    document.font('Helvetica-Bold').fontSize(9)
      .text('Detalle', 42, y, { width: 275 })
      .text('Cantidad', 320, y, { width: 55, align: 'right' })
      .text('Unitario', 385, y, { width: 75, align: 'right' })
      .text('Subtotal', 470, y, { width: 83, align: 'right' });
    y += 16;
    document.moveTo(42, y).lineTo(553, y).stroke('#999999');
    y += 8;

    document.font('Helvetica').fontSize(8);
    for (const item of items) {
      if (y > 660) {
        document.addPage();
        y = 50;
      }
      const variants = [item.color, item.tone, item.size].filter(Boolean).join(' / ');
      const label = variants ? `${item.name || 'Producto'} (${variants})` : item.name || 'Producto';
      document.text(label, 42, y, { width: 275 });
      document.text(String(item.quantity || 0), 320, y, { width: 55, align: 'right' });
      document.text(money(item.price), 385, y, { width: 75, align: 'right' });
      document.text(money(item.subtotal), 470, y, { width: 83, align: 'right' });
      y += Math.max(18, document.heightOfString(label, { width: 275 }) + 6);
    }

    if (Number(itemsSnapshot.transferDiscountAmount) > 0) {
      document.text('Descuento por transferencia', 320, y, { width: 140 });
      document.text(`-${money(itemsSnapshot.transferDiscountAmount)}`, 470, y, { width: 83, align: 'right' });
      y += 16;
    }
    if (Number(itemsSnapshot.discountAmount) > 0) {
      document.text(`Descuento${itemsSnapshot.couponCode ? ` (${itemsSnapshot.couponCode})` : ''}`, 320, y, { width: 140 });
      document.text(`-${money(itemsSnapshot.discountAmount)}`, 470, y, { width: 83, align: 'right' });
      y += 16;
    }
    if (Number(itemsSnapshot.shippingCost) > 0) {
      document.text('Envío', 320, y, { width: 140 });
      document.text(money(itemsSnapshot.shippingCost), 470, y, { width: 83, align: 'right' });
      y += 16;
    }

    document.moveTo(315, y).lineTo(553, y).stroke('#555555');
    y += 8;
    if (Number(invoice.imp_iva) > 0) {
      document.font('Helvetica').fontSize(9)
        .text('Neto gravado', 320, y, { width: 140 })
        .text(money(invoice.imp_neto), 470, y, { width: 83, align: 'right' });
      y += 14;
      for (const vat of vatBreakdown) {
        document.text(`IVA ${Number(vat.rate)}%`, 320, y, { width: 140 })
          .text(money(vat.amount), 470, y, { width: 83, align: 'right' });
        y += 14;
      }
      if (!vatBreakdown.length) {
        document.text('IVA', 320, y, { width: 140 })
          .text(money(invoice.imp_iva), 470, y, { width: 83, align: 'right' });
        y += 14;
      }
    }
    document.font('Helvetica-Bold').fontSize(12)
      .text('TOTAL', 320, y + 2, { width: 140 })
      .text(money(invoice.imp_total), 470, y + 2, { width: 83, align: 'right' });
    y += 26;

    if (shouldShowFiscalTransparency(invoice, receiver)) {
      const otherNationalIndirectTaxes = Number(
        invoice.other_national_indirect_taxes
        ?? itemsSnapshot.otherNationalIndirectTaxes
        ?? 0,
      );
      document.font('Helvetica-Bold').fontSize(8)
        .text(FISCAL_TRANSPARENCY_TITLE, 42, y, { width: 380 });
      y += 13;
      document.font('Helvetica').fontSize(8)
        .text('IVA Contenido:', 42, y, { width: 275 })
        .text(money(invoice.imp_iva), 320, y, { width: 100, align: 'right' });
      y += 12;
      document.text('Otros Impuestos Nacionales Indirectos:', 42, y, { width: 275 })
        .text(money(otherNationalIndirectTaxes), 320, y, { width: 100, align: 'right' });
      y += 18;
    }

    if (shouldShowMonotributoLegend(invoice)) {
      document.font('Helvetica').fontSize(7).text(MONOTRIBUTO_CREDIT_LEGEND, 42, y, { width: 511 });
      y = document.y + 8;
    }

    let footerY = Math.max(y + 25, 620);
    if (footerY > 680) {
      document.addPage();
      footerY = 80;
    }
    document.image(qrImage, 42, footerY, { width: 115, height: 115 });
    document.font('Helvetica-Bold').fontSize(10)
      .text(`CAE: ${invoice.cae}`, 175, footerY + 20)
      .text(`Vencimiento CAE: ${displayDate(invoice.cae_expiration_date)}`, 175, footerY + 38);
    document.font('Helvetica').fontSize(8)
      .text('Comprobante autorizado por ARCA. El QR permite verificar sus datos fiscales.', 175, footerY + 65, { width: 360 });

    document.end();
  });
}

export { ARCA_QR_BASE_URL, FISCAL_TRANSPARENCY_TITLE, MONOTRIBUTO_CREDIT_LEGEND };
