import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

const ARCA_QR_BASE_URL = 'https://www.arca.gob.ar/fe/qr/?p=';

function isoDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

function displayDate(value) {
  const normalized = isoDate(value);
  if (!normalized) return '';
  const [year, month, day] = normalized.split('-');
  return `${day}/${month}/${year}`;
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

function invoiceTypeName(type) {
  if (Number(type) === 11) return 'FACTURA C';
  return `COMPROBANTE ${type}`;
}

export async function generateInvoicePdf(invoice) {
  if (!invoice || invoice.status !== 'authorized') {
    throw new Error('Solo se puede generar el PDF de una factura autorizada.');
  }

  const issuer = invoice.issuer_snapshot || {};
  const receiver = invoice.receiver_snapshot || {};
  const itemsSnapshot = invoice.items_snapshot || {};
  const items = Array.isArray(itemsSnapshot.items) ? itemsSnapshot.items : [];
  const qrImage = await QRCode.toBuffer(buildArcaQrUrl(invoice), {
    type: 'png',
    width: 240,
    margin: 1,
    errorCorrectionLevel: 'M',
  });

  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margin: 42, info: { Title: invoiceTypeName(invoice.cbte_tipo) } });
    const chunks = [];
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('error', reject);
    document.on('end', () => resolve(Buffer.concat(chunks)));

    document.font('Helvetica-Bold').fontSize(18).text(issuer.legalName || 'Emisor', 42, 42, { width: 245 });
    document.font('Helvetica').fontSize(9)
      .text(`CUIT: ${issuer.cuit || invoice.issuer_cuit}`)
      .text(`Condición IVA: ${issuer.taxCondition || ''}`)
      .text(`Domicilio fiscal: ${issuer.taxAddress || ''}`)
      .text(`Ingresos Brutos: ${issuer.grossIncome || ''}`)
      .text(`Inicio de actividades: ${displayDate(issuer.activityStartDate)}`);

    document.rect(295, 38, 258, 115).stroke('#555555');
    document.font('Helvetica-Bold').fontSize(28).text('C', 305, 45, { width: 45, align: 'center' });
    document.fontSize(15).text(invoiceTypeName(invoice.cbte_tipo), 355, 48, { width: 185 });
    document.font('Helvetica').fontSize(10)
      .text(`N° ${formattedVoucherNumber(invoice)}`, 355, 75)
      .text(`Fecha: ${displayDate(invoice.fecha_comprobante)}`, 355, 93)
      .text(`Código comprobante: ${invoice.cbte_tipo}`, 355, 111);

    document.moveTo(42, 170).lineTo(553, 170).stroke('#999999');
    document.font('Helvetica-Bold').fontSize(11).text('Receptor', 42, 180);
    document.font('Helvetica').fontSize(9)
      .text(`Nombre / Razón social: ${receiver.name || ''}`)
      .text(`Documento (${invoice.receiver_doc_type}): ${invoice.receiver_doc_number}`)
      .text(`Condición IVA: ${receiver.vatConditionId || invoice.receiver_vat_condition_id}`)
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
    document.font('Helvetica-Bold').fontSize(12)
      .text('TOTAL', 320, y + 8, { width: 140 })
      .text(money(invoice.imp_total), 470, y + 8, { width: 83, align: 'right' });

    let footerY = Math.max(y + 65, 620);
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

export { ARCA_QR_BASE_URL };
