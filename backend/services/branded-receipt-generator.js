/**
 * Branded Receipt PDF Generator
 * Generates premium AXKAN-branded receipts/recibos with full brand identity
 * Faithfully reproduces the HTML template layout with PDFKit
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure branded-receipts directory exists
const BRANDED_RECEIPTS_DIR = path.join(__dirname, '../branded-receipts');
if (!fs.existsSync(BRANDED_RECEIPTS_DIR)) {
  fs.mkdirSync(BRANDED_RECEIPTS_DIR, { recursive: true });
}

// Brand asset paths
const FONT_RLAQVA = path.join(__dirname, '../../frontend/assets/axkan/RLAQVA.otf');
const FONT_OBJEKTIV = path.join(__dirname, '../../frontend/assets/axkan/FONT-OBJEKTIV-VF-BODY.otf');
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
    console.log('⚠️ Could not load RLAQVA font, using Helvetica-Bold:', err.message);
  }

  try {
    if (fs.existsSync(FONT_OBJEKTIV)) {
      doc.registerFont('Objektiv', FONT_OBJEKTIV);
      fonts.body = 'Objektiv';
    }
  } catch (err) {
    console.log('⚠️ Could not load Objektiv font, using Helvetica:', err.message);
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

      console.log(`🧾 Generating branded receipt: ${receiptNumber}`);
      console.log(`   Client: ${clientName} | Type: ${receiptType} | Total: ${formatCurrency(totalProject)}`);

      // Create PDF
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 0, bottom: 0, left: 0, right: 0 }
      });

      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // Register fonts
      const fonts = registerFonts(doc);

      let y = 0;

      // ================================================================
      // 1. TOP COLOR BAND (8pt)
      // ================================================================
      drawColorBand(doc, 0, 8);
      y = 8;

      // ================================================================
      // 2. HEADER (y=32 to y=90)
      // ================================================================
      y = 32;

      // Left side: Jaguar logo + Letters logo + tagline
      try {
        if (fs.existsSync(LOGO_JAGUAR)) {
          doc.image(LOGO_JAGUAR, MARGIN_LEFT, y, { height: 48 });
        }
      } catch (err) {
        console.log('⚠️ Could not load JAGUAR logo:', err.message);
      }

      try {
        if (fs.existsSync(LOGO_LETTERS)) {
          doc.image(LOGO_LETTERS, 112, y + 3, { height: 26 });
        }
      } catch (err) {
        console.log('⚠️ Could not load LETTERS logo:', err.message);
      }

      // Tagline
      doc.font(fonts.body)
         .fontSize(6.5)
         .fillColor(COLORS.textLight)
         .text('RECUERDOS HECHOS SOUVENIR', 112, y + 32, {
           characterSpacing: 2.5,
           lineBreak: false
         });

      // Right side: Receipt type title + receipt number
      doc.font(fonts.title)
         .fontSize(11)
         .fillColor(COLORS.rosaMexicano)
         .text(labels.title, MARGIN_LEFT, y, {
           width: CONTENT_WIDTH,
           align: 'right'
         });

      doc.font('Courier')
         .fontSize(8.5)
         .fillColor(COLORS.textLight)
         .text(receiptNumber, MARGIN_LEFT, y + 16, {
           width: CONTENT_WIDTH,
           align: 'right'
         });

      // ================================================================
      // 3. DIVIDER (y=88)
      // ================================================================
      y = 88;
      // Full width line
      doc.moveTo(MARGIN_LEFT, y)
         .lineTo(PAGE_WIDTH - MARGIN_RIGHT, y)
         .lineWidth(0.5)
         .strokeColor(COLORS.borderSoft)
         .stroke();

      // Rosa accent bar on left
      doc.rect(MARGIN_LEFT, y - 1, 50, 2.5)
         .fill(COLORS.rosaMexicano);

      // ================================================================
      // 4. META STRIP (y=98)
      // ================================================================
      y = 98;
      const metaColWidth = CONTENT_WIDTH / 3;

      // Column 1: Fecha
      doc.font(fonts.body)
         .fontSize(6)
         .fillColor(COLORS.textLight)
         .text('FECHA DE EMISIÓN', MARGIN_LEFT, y, {
           characterSpacing: 1,
           lineBreak: false
         });
      doc.font('Courier')
         .fontSize(10)
         .fillColor(COLORS.textDark)
         .text(dateStr, MARGIN_LEFT, y + 10, { lineBreak: false });

      // Column 2: Lugar
      const col2X = MARGIN_LEFT + metaColWidth;
      doc.font(fonts.body)
         .fontSize(6)
         .fillColor(COLORS.textLight)
         .text('LUGAR', col2X, y, {
           characterSpacing: 1,
           lineBreak: false
         });
      doc.font('Courier')
         .fontSize(10)
         .fillColor(COLORS.textDark)
         .text('México', col2X, y + 10, { lineBreak: false });

      // Column 3: Tipo de documento
      const col3X = MARGIN_LEFT + metaColWidth * 2;
      doc.font(fonts.body)
         .fontSize(6)
         .fillColor(COLORS.textLight)
         .text('TIPO DE DOCUMENTO', col3X, y, {
           characterSpacing: 1,
           lineBreak: false
         });
      doc.font('Courier')
         .fontSize(10)
         .fillColor(COLORS.textDark)
         .text(labels.docType, col3X, y + 10, { lineBreak: false });

      // ================================================================
      // 5. CLIENT CARD (y=128)
      // ================================================================
      y = 128;
      const clientCardHeight = 38;

      // White card with borderSoft stroke
      doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, clientCardHeight)
         .lineWidth(0.5)
         .fillAndStroke('#ffffff', COLORS.borderSoft);

      // Rosa left border accent (3pt wide)
      doc.rect(MARGIN_LEFT, y, 3, clientCardHeight)
         .fill(COLORS.rosaMexicano);

      // Client name
      doc.font(fonts.title)
         .fontSize(18)
         .fillColor(COLORS.textDark)
         .text(clientName, MARGIN_LEFT + 14, y + 6, { lineBreak: false });

      // Role line
      const roleText = projectName ? `Cliente — ${projectName}` : 'Cliente';
      doc.font(fonts.body)
         .fontSize(9)
         .fillColor(COLORS.textLight)
         .text(roleText, MARGIN_LEFT + 14, y + 24, { lineBreak: false });

      // ================================================================
      // 6. CONCEPT BLOCK (y=175)
      // ================================================================
      y = 175;

      // Measure description height
      doc.font(fonts.body).fontSize(11);
      const descHeight = doc.heightOfString(description, { width: CONTENT_WIDTH - 28 });
      const conceptBlockHeight = Math.max(40, descHeight + 26);

      // White rect background
      doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, conceptBlockHeight)
         .lineWidth(0.5)
         .fillAndStroke('#ffffff', COLORS.borderSoft);

      // Label
      doc.font(fonts.body)
         .fontSize(6)
         .fillColor(COLORS.textLight)
         .text('DESCRIPCIÓN DEL PROYECTO', MARGIN_LEFT + 14, y + 6, {
           characterSpacing: 1,
           lineBreak: false
         });

      // Description text
      doc.font(fonts.body)
         .fontSize(11)
         .fillColor(COLORS.textDark)
         .text(description, MARGIN_LEFT + 14, y + 18, {
           width: CONTENT_WIDTH - 28
         });

      // ================================================================
      // 7. PRODUCT TABLE (y dynamic)
      // ================================================================
      y = y + conceptBlockHeight + 10;
      y = checkPageBreak(doc, y, fonts, 80);

      // Column positions
      const colProduct = MARGIN_LEFT;
      const colSize = 220;
      const colQty = 320;
      const colPrice = 400;
      const colTotal = 490;
      const tableHeaderHeight = 22;

      // Header row - turquesaCaribe background
      doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, tableHeaderHeight)
         .fill(COLORS.turquesaCaribe);

      // Column headers in white
      doc.font(fonts.title)
         .fontSize(7)
         .fillColor('#ffffff');

      doc.text('PRODUCTO AXKAN', colProduct + 10, y + 7, { lineBreak: false });
      doc.text('TAMAÑO', colSize, y + 7, { lineBreak: false });
      doc.text('CANTIDAD', colQty, y + 7, { lineBreak: false });
      doc.text('P. UNITARIO', colPrice, y + 7, { lineBreak: false });
      doc.text('TOTAL', colTotal, y + 7, { lineBreak: false });

      y += tableHeaderHeight;

      // Data rows
      items.forEach((item, index) => {
        y = checkPageBreak(doc, y, fonts, 24);

        const rowHeight = 22;

        // Alternating row background
        if (index % 2 === 0) {
          doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, rowHeight)
             .fill('#fafaf8');
        }

        const lineTotal = item.quantity * item.unitPrice;

        doc.font(fonts.body)
           .fontSize(9)
           .fillColor(COLORS.textDark);

        doc.text(item.product, colProduct + 10, y + 6, { lineBreak: false });
        doc.text(item.size || '—', colSize, y + 6, { lineBreak: false });

        // Right-align numeric columns
        doc.text(item.quantity.toLocaleString('es-MX'), colQty, y + 6, {
          width: 60,
          align: 'right',
          lineBreak: false
        });
        doc.text(formatCurrency(item.unitPrice), colPrice, y + 6, {
          width: 70,
          align: 'right',
          lineBreak: false
        });
        doc.text(formatCurrency(lineTotal), colTotal, y + 6, {
          width: 72,
          align: 'right',
          lineBreak: false
        });

        y += rowHeight;
      });

      // ================================================================
      // 8. TABLE TOTALS
      // ================================================================
      y += 4;
      y = checkPageBreak(doc, y, fonts, 60);

      const totalsX = colPrice;
      const totalsValueX = colTotal;
      const totalsValueWidth = 72;

      // Subtotal
      doc.font(fonts.body)
         .fontSize(9)
         .fillColor(COLORS.textMid)
         .text('Subtotal', totalsX, y, { lineBreak: false });
      doc.text(formatCurrency(subtotal), totalsValueX, y, {
        width: totalsValueWidth,
        align: 'right',
        lineBreak: false
      });
      y += 16;

      // IVA (conditional)
      if (includeIVA) {
        doc.text(`IVA (${ivaRate}%)`, totalsX, y, { lineBreak: false });
        doc.text(formatCurrency(ivaAmount), totalsValueX, y, {
          width: totalsValueWidth,
          align: 'right',
          lineBreak: false
        });
        y += 16;
      }

      // Divider line before grand total
      doc.moveTo(totalsX, y)
         .lineTo(totalsValueX + totalsValueWidth, y)
         .lineWidth(0.75)
         .strokeColor(COLORS.borderSoft)
         .stroke();
      y += 6;

      // Grand total
      doc.font(fonts.title)
         .fontSize(11)
         .fillColor(COLORS.textDark)
         .text('Total del Proyecto', totalsX, y, { lineBreak: false });
      doc.text(formatCurrency(totalProject), totalsValueX, y, {
        width: totalsValueWidth,
        align: 'right',
        lineBreak: false
      });
      y += 24;

      // ================================================================
      // 9. AMOUNT HERO (big pink block)
      // ================================================================
      y = checkPageBreak(doc, y, fonts, 90);

      const heroHeight = 82;

      // Full-width rosa background
      doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, heroHeight)
         .fill(COLORS.rosaMexicano);

      // Jaguar watermark overlay at low opacity
      try {
        if (fs.existsSync(LOGO_JAGUAR)) {
          doc.save();
          doc.opacity(0.08);
          doc.image(LOGO_JAGUAR, PAGE_WIDTH - MARGIN_RIGHT - 100, y + 6, { height: 70 });
          doc.restore();
        }
      } catch (err) {
        // Skip watermark if image fails
      }

      // Left side: badge
      // Semi-transparent white badge background
      doc.save();
      doc.opacity(0.2);
      doc.roundedRect(MARGIN_LEFT + 14, y + 12, 130, 20, 3)
         .fill('#ffffff');
      doc.restore();

      doc.font(fonts.title)
         .fontSize(7)
         .fillColor('#ffffff')
         .text(labels.badge, MARGIN_LEFT + 20, y + 16, { lineBreak: false });

      // Description below badge
      const heroDescText = receiptType === 'advance'
        ? `Pago parcial del proyecto\n${projectName || 'AXKAN'}`
        : receiptType === 'full'
        ? `Pago total del proyecto\n${projectName || 'AXKAN'}`
        : `Pago recibido para\n${projectName || 'AXKAN'}`;

      doc.font(fonts.body)
         .fontSize(8)
         .fillColor('rgba(255,255,255,0.85)')
         .text(heroDescText, MARGIN_LEFT + 14, y + 40, {
           width: 180,
           lineBreak: true
         });

      // Right side: MXN label + big amount
      const amountStr = formatCurrency(effectiveAdvance);
      // Split into main amount and decimals
      const amountParts = amountStr.split('.');
      const mainAmount = amountParts[0]; // e.g. "$42,000"
      const decimals = amountParts[1] ? '.' + amountParts[1] : '.00';

      doc.font(fonts.body)
         .fontSize(7)
         .fillColor('rgba(255,255,255,0.7)')
         .text('MXN', PAGE_WIDTH - MARGIN_RIGHT - 200, y + 10, {
           width: 185,
           align: 'right',
           lineBreak: false
         });

      doc.font(fonts.title)
         .fontSize(36)
         .fillColor('#ffffff')
         .text(mainAmount, PAGE_WIDTH - MARGIN_RIGHT - 200, y + 20, {
           width: 185,
           align: 'right',
           lineBreak: false
         });

      // Smaller decimals
      // Calculate position for decimals after main amount
      const mainAmountWidth = doc.widthOfString(mainAmount);
      doc.font(fonts.title)
         .fontSize(16)
         .fillColor('rgba(255,255,255,0.8)')
         .text(decimals, PAGE_WIDTH - MARGIN_RIGHT - 15, y + 24, {
           lineBreak: false
         });

      // Amount in words
      const amountInWords = numberToSpanishWords(effectiveAdvance);
      doc.font(fonts.body)
         .fontSize(7)
         .fillColor('rgba(255,255,255,0.7)')
         .text(amountInWords, PAGE_WIDTH - MARGIN_RIGHT - 280, y + 62, {
           width: 265,
           align: 'right',
           lineBreak: false
         });

      y += heroHeight + 10;

      // ================================================================
      // 10. DETAILS TABLE (colored dots)
      // ================================================================
      y = checkPageBreak(doc, y, fonts, 80);

      const detailRows = [
        {
          dot: COLORS.rosaMexicano,
          label: receiptType === 'full' ? 'Monto pagado' : 'Anticipo recibido',
          value: formatCurrency(effectiveAdvance)
        },
        {
          dot: COLORS.turquesaCaribe,
          label: 'Saldo pendiente',
          value: formatCurrency(pendingBalance)
        },
        {
          dot: COLORS.naranjCalido,
          label: 'Fecha de pago',
          value: dateStr
        },
        {
          dot: COLORS.verdeSelva,
          label: 'Forma de pago',
          value: paymentMethod
        }
      ];

      detailRows.forEach((row) => {
        y = checkPageBreak(doc, y, fonts, 20);

        // Colored dot
        doc.circle(MARGIN_LEFT + 8, y + 6, 4)
           .fill(row.dot);

        // Label
        doc.font(fonts.body)
           .fontSize(9)
           .fillColor(COLORS.textMid)
           .text(row.label, MARGIN_LEFT + 20, y + 1, { lineBreak: false });

        // Value (right-aligned)
        doc.font(fonts.title)
           .fontSize(9)
           .fillColor(COLORS.textDark)
           .text(row.value, MARGIN_LEFT, y + 1, {
             width: CONTENT_WIDTH,
             align: 'right',
             lineBreak: false
           });

        // Subtle separator line
        y += 18;
        doc.moveTo(MARGIN_LEFT + 20, y)
           .lineTo(PAGE_WIDTH - MARGIN_RIGHT, y)
           .lineWidth(0.3)
           .strokeColor(COLORS.borderSoft)
           .stroke();
        y += 6;
      });

      // Special instructions (if any)
      if (specialInstructions) {
        y += 4;
        y = checkPageBreak(doc, y, fonts, 40);

        doc.font(fonts.body)
           .fontSize(6)
           .fillColor(COLORS.textLight)
           .text('INSTRUCCIONES ESPECIALES', MARGIN_LEFT, y, {
             characterSpacing: 1
           });
        y += 10;

        doc.font(fonts.body)
           .fontSize(9)
           .fillColor(COLORS.textDark)
           .text(specialInstructions, MARGIN_LEFT + 10, y, {
             width: CONTENT_WIDTH - 20
           });

        y += doc.heightOfString(specialInstructions, { width: CONTENT_WIDTH - 20 }) + 10;
      }

      // ================================================================
      // 11. TERMS & CONDITIONS
      // ================================================================
      y += 6;
      y = checkPageBreak(doc, y, fonts, 100);

      const termsBlockHeight = 12 + (DEFAULT_TERMS.length * 14) + 10;

      // Light gray background
      doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, termsBlockHeight)
         .fill('#f7f6f4');

      // Title
      doc.font(fonts.title)
         .fontSize(6)
         .fillColor(COLORS.textMid)
         .text('TÉRMINOS Y CONDICIONES', MARGIN_LEFT + 14, y + 8, {
           characterSpacing: 1,
           lineBreak: false
         });

      let termsY = y + 22;
      DEFAULT_TERMS.forEach((term) => {
        // Oro maya dash marker
        doc.font(fonts.body)
           .fontSize(8.5)
           .fillColor(COLORS.oroMaya)
           .text('—', MARGIN_LEFT + 14, termsY, { lineBreak: false });

        doc.fillColor(COLORS.textMid)
           .text(term, MARGIN_LEFT + 30, termsY, {
             width: CONTENT_WIDTH - 50
           });

        termsY += 14;
      });

      y += termsBlockHeight + 10;

      // ================================================================
      // 12. FOOTER
      // ================================================================
      // Position footer near bottom of page
      const footerY = Math.max(y + 10, PAGE_HEIGHT - 60);

      // Line separator
      doc.moveTo(MARGIN_LEFT, footerY)
         .lineTo(PAGE_WIDTH - MARGIN_RIGHT, footerY)
         .lineWidth(0.5)
         .strokeColor(COLORS.borderSoft)
         .stroke();

      // Left: contact info
      doc.font(fonts.body)
         .fontSize(7)
         .fillColor(COLORS.textLight)
         .text('informacion@axkan.art    IG @axkanoficial    Web axkan.art', MARGIN_LEFT, footerY + 6, {
           lineBreak: false
         });

      // Right: copyright
      doc.font(fonts.title)
         .fontSize(8)
         .fillColor(COLORS.textLight)
         .text('AXKAN \u00A9 2026', MARGIN_LEFT, footerY + 5, {
           width: CONTENT_WIDTH,
           align: 'right',
           lineBreak: false
         });

      // ================================================================
      // 13. BOTTOM COLOR BAND (5pt)
      // ================================================================
      drawColorBand(doc, PAGE_HEIGHT - 5, 5);

      // ================================================================
      // 14. JAGUAR WATERMARK (bottom-right, 3.5% opacity)
      // ================================================================
      try {
        if (fs.existsSync(LOGO_JAGUAR)) {
          doc.save();
          doc.opacity(0.035);
          doc.image(LOGO_JAGUAR, PAGE_WIDTH - MARGIN_RIGHT - 140, PAGE_HEIGHT - 180, { height: 120 });
          doc.restore();
        }
      } catch (err) {
        // Skip watermark silently
      }

      // Finalize PDF
      doc.end();

      // Wait for stream to finish
      stream.on('finish', () => {
        console.log(`🧾 Branded receipt generated: ${receiptNumber}`);
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
        console.error('❌ Error writing branded receipt PDF:', error);
        reject(error);
      });

    } catch (error) {
      console.error('❌ Error generating branded receipt:', error);
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
