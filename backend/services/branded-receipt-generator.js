/**
 * Branded Receipt PDF Generator
 * Generates premium AXKAN-branded receipts/recibos with full brand identity
 * Faithfully reproduces the HTML template layout with PDFKit
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log, logError } from '../shared/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure branded-receipts directory exists
const BRANDED_RECEIPTS_DIR = path.join(__dirname, '../branded-receipts');
if (!fs.existsSync(BRANDED_RECEIPTS_DIR)) {
  fs.mkdirSync(BRANDED_RECEIPTS_DIR, { recursive: true });
}

// Brand asset paths (same as quote-generator)
const FONT_RLAQVA = path.join(__dirname, '../assets/fonts/RLAQVA.otf');
const FONT_OBJEKTIV = path.join(__dirname, '../assets/fonts/FONT-OBJEKTIV-VF-BODY.otf');
const LOGO_COMBINED = path.join(__dirname, '../assets/images/JAGUAR_LETTERS.png');
// Fallback to old paths
const FONT_RLAQVA_ALT = path.join(__dirname, '../../frontend/assets/axkan/RLAQVA.otf');
const FONT_OBJEKTIV_ALT = path.join(__dirname, '../../frontend/assets/axkan/FONT-OBJEKTIV-VF-BODY.otf');
const LOGO_JAGUAR = path.join(__dirname, '../../frontend/assets/axkan/JAGUAR.png');
const LOGO_LETTERS = path.join(__dirname, '../../frontend/assets/axkan/LETTERS.png');

// AXKAN Brand Colors (exact hex from the HTML template)
const COLORS = {
  rosaMexicano: '#e72a88',
  verdeSelva: '#8ab73b',
  naranjCalido: '#f39223',
  turquesaCaribe: '#09adc2',
  rojoMexicano: '#e52421',
  oroMaya: '#D4A574',
  guinda: '#a6191d',
  magentaOscuro: '#aa1e6b',
  tealOscuro: '#106c7f',
  bgCream: '#faf8f5',
  textDark: '#1a1a1a',
  textMid: '#4a4a4a',
  textLight: '#8a8a8a',
  borderSoft: '#e8e4df'
};

// Top/bottom color band colors (5 segments)
const BAND_COLORS = [
  COLORS.rosaMexicano,
  COLORS.naranjCalido,
  COLORS.turquesaCaribe,
  COLORS.verdeSelva,
  COLORS.rojoMexicano
];

// Receipt type labels
const TYPE_LABELS = {
  advance: { title: 'RECIBO DE ADELANTO', badge: 'ANTICIPO RECIBIDO', docType: 'Anticipo de Proyecto' },
  full: { title: 'RECIBO DE PAGO', badge: 'PAGO COMPLETO', docType: 'Pago Total' },
  note: { title: 'NOTA DE PAGO', badge: 'PAGO RECIBIDO', docType: 'Nota de Pago' }
};

// Default terms and conditions
const DEFAULT_TERMS = [
  'Este recibo ampara únicamente el pago señalado, no el monto total del proyecto.',
  'El saldo restante deberá cubrirse previo al envío del pedido finalizado.',
  'El diseño incluye 2 rondas de revisión sin costo adicional.',
  'Los tiempos de entrega comienzan a partir de la aprobación del diseño final.',
  'Garantía válida 7 días posteriores a la entrega con evidencia fotográfica.'
];

// Page constants
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const PAGE_BREAK_THRESHOLD = 700;

/**
 * Format currency in Mexican pesos
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(amount);
}

/**
 * Format date in full Spanish format
 */
function formatDateSpanish(date) {
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const d = new Date(date);
  return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
}

/**
 * Generate a receipt number
 */
function generateReceiptNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `AXK-${y}-${m}${d}-${seq}`;
}

/**
 * Convert a number to Spanish words for currency amounts
 * Handles 0 to 999,999,999
 */
export function numberToSpanishWords(amount) {
  const integerPart = Math.floor(Math.abs(amount));
  const decimalPart = Math.round((Math.abs(amount) % 1) * 100);

  if (integerPart === 0) {
    const centStr = String(decimalPart).padStart(2, '0');
    return `Cero pesos ${centStr}/100 M.N.`;
  }

  const units = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
  const teens = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
  const tens = ['', 'diez', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const hundreds = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

  function convertGroup(n) {
    if (n === 0) return '';
    if (n === 100) return 'cien';

    let result = '';

    // Hundreds
    if (n >= 100) {
      result += hundreds[Math.floor(n / 100)];
      n = n % 100;
      if (n > 0) result += ' ';
    }

    // Tens and units
    if (n >= 10 && n <= 19) {
      result += teens[n - 10];
    } else if (n >= 21 && n <= 29) {
      const singleWords = ['', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
      result += singleWords[n - 20];
    } else if (n >= 20) {
      result += tens[Math.floor(n / 10)];
      const u = n % 10;
      if (u > 0) {
        result += ' y ' + units[u];
      }
    } else if (n > 0) {
      result += units[n];
    }

    return result;
  }

  let words = '';
  let remaining = integerPart;

  // Millions
  if (remaining >= 1000000) {
    const millions = Math.floor(remaining / 1000000);
    if (millions === 1) {
      words += 'un millón';
    } else {
      words += convertGroup(millions) + ' millones';
    }
    remaining = remaining % 1000000;
    if (remaining > 0) words += ' ';
  }

  // Thousands
  if (remaining >= 1000) {
    const thousands = Math.floor(remaining / 1000);
    if (thousands === 1) {
      words += 'mil';
    } else {
      words += convertGroup(thousands) + ' mil';
    }
    remaining = remaining % 1000;
    if (remaining > 0) words += ' ';
  }

  // Hundreds, tens, units
  if (remaining > 0) {
    words += convertGroup(remaining);
  }

  // Capitalize first letter
  words = words.charAt(0).toUpperCase() + words.slice(1);

  const centStr = String(decimalPart).padStart(2, '0');
  return `${words} pesos ${centStr}/100 M.N.`;
}

/**
 * Draw the 5-color band across full page width
 */
function drawColorBand(doc, y, height) {
  const segmentWidth = PAGE_WIDTH / 5;
  for (let i = 0; i < 5; i++) {
    doc.rect(segmentWidth * i, y, segmentWidth, height)
       .fill(BAND_COLORS[i]);
  }
}

/**
 * Register brand fonts with fallback
 * Returns object with font names to use
 */
function registerFonts(doc) {
  const fonts = {
    title: 'Helvetica-Bold',
    body: 'Helvetica',
    mono: 'Courier'
  };

  try {
    if (fs.existsSync(FONT_RLAQVA)) {
      doc.registerFont('RLAQVA', FONT_RLAQVA);
      fonts.title = 'RLAQVA';
    }
  } catch (err) {
    log('warn', 'branded_receipt.font_missing', { font: 'RLAQVA', error: err.message });
  }

  try {
    if (fs.existsSync(FONT_OBJEKTIV)) {
      doc.registerFont('Objektiv', FONT_OBJEKTIV);
      fonts.body = 'Objektiv';
    }
  } catch (err) {
    log('warn', 'branded_receipt.font_missing', { font: 'Objektiv', error: err.message });
  }

  return fonts;
}

/**
 * Check if Y position needs a page break, and add one if needed
 * Draws top band on new page
 * Returns updated Y position
 */
function checkPageBreak(doc, y, fonts, neededSpace = 60) {
  if (y + neededSpace > PAGE_BREAK_THRESHOLD) {
    doc.addPage({ size: 'LETTER', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    drawColorBand(doc, 0, 8);
    return 24;
  }
  return y;
}

/**
 * Generate a branded AXKAN receipt PDF
 *
 * @param {Object} receiptData - Receipt information
 * @returns {Promise<Object>} - Generated receipt details
 */
export async function generateBrandedReceipt(receiptData) {
  return new Promise((resolve, reject) => {
    try {
      // Destructure and set defaults
      const {
        clientName,
        projectName = '',
        projectDescription = '',
        items = [],
        advanceAmount = 0,
        includeIVA = false,
        ivaRate = 16,
        paymentMethod = 'Transferencia Bancaria',
        paymentDate = null,
        receiptType = 'advance',
        specialInstructions = ''
      } = receiptData;

      if (!clientName) {
        return reject(new Error('clientName is required'));
      }
      if (!items || items.length === 0) {
        return reject(new Error('At least one item is required'));
      }

      // Calculations
      const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
      const totalPieces = items.reduce((sum, item) => sum + item.quantity, 0);
      const ivaAmount = includeIVA ? subtotal * (ivaRate / 100) : 0;
      const totalProject = subtotal + ivaAmount;

      // For full payment, advanceAmount = totalProject
      const effectiveAdvance = receiptType === 'full' ? totalProject : (parseFloat(advanceAmount) || 0);
      const pendingBalance = receiptType === 'advance' ? totalProject - effectiveAdvance : (receiptType === 'note' ? totalProject - effectiveAdvance : 0);

      const receiptNumber = generateReceiptNumber();
      const labels = TYPE_LABELS[receiptType] || TYPE_LABELS.advance;
      const dateStr = formatDateSpanish(paymentDate || new Date());

      // Auto-generate project description if not provided
      let description = projectDescription;
      if (!description) {
        const itemSummaries = items.map(item => {
          return `${item.quantity.toLocaleString('es-MX')} ${item.product}${item.size ? ' ' + item.size : ''}`;
        });
        description = projectName
          ? `${projectName} — ${itemSummaries.join(', ')}`
          : `Producción de ${itemSummaries.join(', ')} con diseño personalizado AXKAN`;
      }

      // File setup
      const timestamp = Date.now();
      const safeClient = clientName.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 20);
      const filename = `recibo-${receiptNumber}-${safeClient}-${timestamp}.pdf`;
      const filepath = path.join(BRANDED_RECEIPTS_DIR, filename);

      log('info', 'branded_receipt.generating', { receiptNumber });
      log('info', 'branded_receipt.details', { clientName, receiptType, total: totalProject });

      // ══════════════════════════════════════════
      // PDF — Matching quotation layout exactly
      // ══════════════════════════════════════════
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 40, bottom: 15, left: 55, right: 55 },
        autoFirstPage: false
      });

      // Register fonts (same as quote-generator)
      const titleFontPath = fs.existsSync(FONT_RLAQVA) ? FONT_RLAQVA : (fs.existsSync(FONT_RLAQVA_ALT) ? FONT_RLAQVA_ALT : null);
      const bodyFontPath = fs.existsSync(FONT_OBJEKTIV) ? FONT_OBJEKTIV : (fs.existsSync(FONT_OBJEKTIV_ALT) ? FONT_OBJEKTIV_ALT : null);
      if (titleFontPath) doc.registerFont('Title', titleFontPath);
      if (bodyFontPath) doc.registerFont('Body', bodyFontPath);
      const titleFont = titleFontPath ? 'Title' : 'Helvetica-Bold';
      const bodyFont = bodyFontPath ? 'Body' : 'Helvetica';

      // Logo path (prefer combined, fallback to separate)
      const logoPath = fs.existsSync(LOGO_COMBINED) ? LOGO_COMBINED : null;

      const pw = 612;
      const ph = 792;
      const ml = 55;
      const cw = pw - ml - 55;
      const segW = pw / BAND_COLORS.length;

      const FOOTER_ZONE = 40;
      const PAGE_BOTTOM = ph - FOOTER_ZONE;
      const CONT_TOP = 30;

      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // ── Page chrome helpers (same as quotation)
      function drawTopBand() {
        for (let i = 0; i < BAND_COLORS.length; i++) {
          doc.rect(segW * i, 0, segW + 1, 5).fill(BAND_COLORS[i]);
        }
      }
      function drawFooterBand() {
        const fY = ph - 20;
        for (let i = 0; i < BAND_COLORS.length; i++) {
          doc.rect(segW * i, fY, segW + 1, 4).fill(BAND_COLORS[i]);
        }
        doc.font(bodyFont).fontSize(6).fillColor('#B0B0B0')
           .text('axkan.art   •   55 3825 3251   •   informacion@axkan.art', ml, fY - 11, { width: cw, align: 'center', lineBreak: false });
      }
      function newPage() {
        doc.addPage({ size: 'LETTER', margins: { top: 40, bottom: 15, left: 55, right: 55 } });
        drawTopBand();
        drawFooterBand();
      }
      function ensureSpace(atY, needed) {
        if (atY + needed > PAGE_BOTTOM) { newPage(); return CONT_TOP; }
        return atY;
      }

      // Table column positions (same as quotation)
      const cN = ml + 8;
      const cQ = ml + 240;
      const cP = ml + 320;
      const cS = ml + cw - 8;

      function drawTableHeader(atY) {
        doc.font(bodyFont).fontSize(6).fillColor('#B0B0B0');
        doc.text('PRODUCTO', cN, atY);
        doc.text('CANTIDAD', cQ, atY);
        doc.text('PRECIO', cP, atY);
        doc.text('SUBTOTAL', cS - 60, atY, { width: 60, align: 'right' });
        const lineY = atY + 4;
        doc.moveTo(ml + 4, lineY).lineTo(ml + cw - 4, lineY).lineWidth(0.4).strokeColor(COLORS.rosaMexicano).opacity(0.2).stroke();
        doc.opacity(1);
        return lineY + 10;
      }

      // ══════════════════════════════════════════
      // PAGE 1 — Header (matching quotation exactly)
      // ══════════════════════════════════════════
      newPage();
      let y = 16;

      // Centered logo
      if (logoPath) {
        try { doc.image(logoPath, (pw - 160) / 2, y, { fit: [160, 56], align: 'center' }); }
        catch (err) { log('warn', 'branded_receipt.logo_missing', { error: err.message }); }
      }
      y += 80;

      // Tagline pill
      const tagW = 210;
      const tagX = (pw - tagW) / 2;
      doc.roundedRect(tagX, y, tagW, 14, 7).fill('#FDF2F8');
      doc.font(bodyFont).fontSize(5.5).fillColor(COLORS.rosaMexicano)
         .text('RECUERDOS HECHOS SOUVENIR', ml, y + 3, { width: cw, align: 'center', characterSpacing: 2 });
      y += 34;

      // Receipt number + date
      doc.font(bodyFont).fontSize(7.5).fillColor('#B0B0B0')
         .text(`${receiptNumber}   •   ${dateStr}   •   ${labels.docType}`, ml, y, { width: cw, align: 'center' });
      y += 32;

      // Client card (centered)
      if (clientName) {
        const cardH = 34;
        const cardW = 230;
        const cardX = (pw - cardW) / 2;
        doc.roundedRect(cardX, y, cardW, cardH, 6).fill('#F6F6F6');
        doc.roundedRect(cardX, y + 5, 3, cardH - 10, 1.5).fill(COLORS.rosaMexicano);
        doc.font(bodyFont).fontSize(6).fillColor('#B0B0B0')
           .text('CLIENTE', cardX + 14, y + 6);
        doc.font(bodyFont).fontSize(10).fillColor('#505050')
           .text(clientName, cardX + 14, y + 18);
        y += cardH + 34;
      }

      // Diamond divider
      const rW = cw * 0.45;
      const rxS = ml + (cw - rW) / 2;
      doc.moveTo(rxS, y).lineTo(pw / 2 - 6, y).lineWidth(0.3).strokeColor('#E0E0E0').stroke();
      doc.moveTo(pw / 2 + 6, y).lineTo(rxS + rW, y).lineWidth(0.3).strokeColor('#E0E0E0').stroke();
      doc.save();
      doc.translate(pw / 2, y).rotate(45);
      doc.rect(-2, -2, 4, 4).fill(COLORS.rosaMexicano);
      doc.restore();
      y += 26;

      // "PRODUCTOS" title with decorative lines
      doc.moveTo(ml + 40, y + 4).lineTo(pw / 2 - 42, y + 4).lineWidth(0.3).strokeColor('#E0E0E0').stroke();
      doc.moveTo(pw / 2 + 42, y + 4).lineTo(ml + cw - 40, y + 4).lineWidth(0.3).strokeColor('#E0E0E0').stroke();
      doc.font(titleFont).fontSize(8).fillColor('#505050')
         .text('PRODUCTOS', ml, y, { width: cw, align: 'center', characterSpacing: 2 });
      y += 28;

      // ── Table header
      y = drawTableHeader(y);

      // ── Product rows
      const rowH = 28;
      items.forEach((item, i) => {
        if (y + rowH > PAGE_BOTTOM) { newPage(); y = CONT_TOP; y = drawTableHeader(y); }

        if (i % 2 === 0) {
          doc.roundedRect(ml + 2, y - 3, cw - 4, rowH, 3).fill('#F6F6F6');
        }

        const lineTotal = item.quantity * item.unitPrice;
        const displayName = item.size ? `${item.product} (${item.size})` : item.product;

        doc.font(bodyFont).fontSize(9).fillColor('#505050')
           .text(displayName, cN, y + 3, { width: 220 });
        doc.font(bodyFont).fontSize(8.5).fillColor('#808080')
           .text(item.quantity.toLocaleString('es-MX') + ' pzas', cQ, y + 3);
        doc.font(bodyFont).fontSize(8.5).fillColor('#808080')
           .text(formatCurrency(item.unitPrice), cP, y + 3);
        doc.font(titleFont).fontSize(9).fillColor('#505050')
           .text(formatCurrency(lineTotal), cS - 75, y + 2, { width: 75, align: 'right' });
        y += rowH;
      });

      y += 24;

      // ══════════════════════════════════════════
      // TOTALS CARD (matching quotation style)
      // ══════════════════════════════════════════
      y = ensureSpace(y, 250);

      const totCardW = 230;
      const totCardX = ml + cw - totCardW;
      const hasIVA = includeIVA && ivaAmount > 0;
      const totCardH = 110 + (hasIVA ? 20 : 0) + (pendingBalance > 0 ? 20 : 0);
      doc.roundedRect(totCardX, y, totCardW, totCardH, 8).fill('#F6F6F6');

      let ty = y + 10;
      const tL = totCardX + 16;
      const tR = totCardX + totCardW - 16;

      // Subtotal
      doc.font(bodyFont).fontSize(8.5).fillColor('#808080').text('Subtotal', tL, ty);
      doc.font(bodyFont).fontSize(8.5).fillColor('#505050')
         .text(formatCurrency(subtotal), tL, ty, { width: tR - tL, align: 'right' });
      ty += 20;

      // IVA
      if (hasIVA) {
        doc.font(bodyFont).fontSize(8.5).fillColor('#808080').text(`IVA (${ivaRate}%)`, tL, ty);
        doc.font(bodyFont).fontSize(8.5).fillColor('#505050')
           .text(formatCurrency(ivaAmount), tL, ty, { width: tR - tL, align: 'right' });
        ty += 20;
      }

      // TOTAL
      doc.font(titleFont).fontSize(16).fillColor(COLORS.rosaMexicano).text('TOTAL', tL, ty);
      doc.font(titleFont).fontSize(16).fillColor(COLORS.rosaMexicano)
         .text(formatCurrency(totalProject), tL, ty, { width: tR - tL, align: 'right' });
      ty += 24;

      // Anticipo
      const advanceLabel = receiptType === 'full' ? 'Pago completo' : `${labels.badge}`;
      doc.font(bodyFont).fontSize(8).fillColor(COLORS.verdeSelva).text(advanceLabel, tL, ty);
      doc.font(titleFont).fontSize(10).fillColor(COLORS.verdeSelva)
         .text(formatCurrency(effectiveAdvance), tL, ty, { width: tR - tL, align: 'right' });
      ty += 20;

      // Saldo pendiente
      if (pendingBalance > 0) {
        doc.font(bodyFont).fontSize(8).fillColor(COLORS.naranjCalido).text('Saldo pendiente', tL, ty);
        doc.font(titleFont).fontSize(10).fillColor(COLORS.naranjCalido)
           .text(formatCurrency(pendingBalance), tL, ty, { width: tR - tL, align: 'right' });
        ty += 20;
      }

      y += totCardH + 24;

      // ── Payment method + date line
      y = ensureSpace(y, 30);
      doc.font(bodyFont).fontSize(7.5).fillColor('#B0B0B0')
         .text(`Forma de pago: ${paymentMethod}   •   Fecha de pago: ${dateStr}`, ml, y, { width: cw, align: 'center' });
      y += 24;

      // ── Special instructions
      if (specialInstructions) {
        y = ensureSpace(y, 40);
        doc.font(bodyFont).fontSize(7).fillColor('#808080')
           .text(specialInstructions, ml, y, { width: cw, align: 'center' });
        y += 18;
      }

      // ── Terms
      y = ensureSpace(y, 20);
      doc.font(bodyFont).fontSize(5.5).fillColor('#B0B0B0')
         .text('Precios en MXN, no incluyen IVA  •  Anticipo 50% para iniciar  •  Producción 5–7 días hábiles  •  Envío gratis 300+ pzas', ml, y, { width: cw, align: 'center' });

      // Finalize PDF
      doc.end();

      // Wait for stream to finish
      stream.on('finish', () => {
        log('info', 'branded_receipt.generated', { receiptNumber });
        resolve({
          filepath,
          filename,
          receiptNumber,
          totalProject,
          advanceAmount: effectiveAdvance,
          remainingBalance: pendingBalance,
          includeIVA
        });
      });

      stream.on('error', (error) => {
        logError('branded_receipt.write_error', error);
        reject(error);
      });

    } catch (error) {
      logError('branded_receipt.generate_error', error);
      reject(error);
    }
  });
}

/**
 * Get the URL path for a branded receipt file
 * Returns full URL for production, relative for local
 */
export function getBrandedReceiptUrl(filepath) {
  const filename = path.basename(filepath);
  const relativePath = `/branded-receipts/${filename}`;

  const backendUrl = process.env.BACKEND_URL
    || process.env.RENDER_EXTERNAL_URL
    || (process.env.NODE_ENV === 'production' ? 'https://vt-souvenir-backend.onrender.com' : null);

  if (backendUrl) {
    return `${backendUrl}${relativePath}`;
  }

  return relativePath;
}

export default {
  generateBrandedReceipt,
  numberToSpanishWords,
  getBrandedReceiptUrl
};
