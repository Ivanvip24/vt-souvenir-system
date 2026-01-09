/**
 * Quote PDF Generator
 * Generates professional quote/cotización PDFs for AXKAN souvenirs
 * Integrated with AI Assistant for natural language quote generation
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure quotes directory exists
const QUOTES_DIR = path.join(__dirname, '../quotes');
if (!fs.existsSync(QUOTES_DIR)) {
  fs.mkdirSync(QUOTES_DIR, { recursive: true });
}

// AXKAN Brand Colors (Mexican Pink Palette)
const COLORS = {
  pinkLight: '#E91E63',
  pinkMedium: '#C2185B',
  pinkDark: '#AD1457',
  pinkDeep: '#880E4F',
  pinkPale: '#FCE4EC',
  pinkAccent: '#F8BBD9',
  textDark: '#1f2937',
  textGray: '#6b7280',
  successGreen: '#059669',
  successBg: '#d1fae5',
  warningOrange: '#b45309',
  warningBg: '#fef3c7',
  infoBlueBg: '#dbeafe',
  infoBlue: '#2563eb'
};

// Logo path
const LOGO_PATH = path.join(__dirname, '../../frontend/assets/images/LOGO-01.png');

// Pricing configuration (matching frontend order-form.js)
const PRICING_TIERS = {
  'imanes_ch': [
    { min: 50, max: 999, price: 8.00, label: 'Imanes MDF Chico' },
    { min: 1000, max: Infinity, price: 6.00, label: 'Imanes MDF Chico' }
  ],
  'imanes_m': [
    { min: 50, max: 999, price: 11.00, label: 'Imanes MDF Mediano' },
    { min: 1000, max: Infinity, price: 8.00, label: 'Imanes MDF Mediano' }
  ],
  'imanes_g': [
    { min: 50, max: 999, price: 15.00, label: 'Imanes MDF Grande' },
    { min: 1000, max: Infinity, price: 12.00, label: 'Imanes MDF Grande' }
  ],
  'imanes': [
    { min: 50, max: 999, price: 11.00, label: 'Imanes MDF' },
    { min: 1000, max: Infinity, price: 8.00, label: 'Imanes MDF' }
  ],
  'llaveros': [
    { min: 50, max: 999, price: 10.00, label: 'Llaveros MDF' },
    { min: 1000, max: Infinity, price: 8.00, label: 'Llaveros MDF' }
  ],
  'destapadores': [
    { min: 50, max: 999, price: 20.00, label: 'Destapadores MDF' },
    { min: 1000, max: Infinity, price: 17.00, label: 'Destapadores MDF' }
  ],
  'portallaves': [
    { min: 20, max: Infinity, price: 40.00, label: 'Portallaves MDF' }
  ],
  'souvenir_box': [
    { min: 1, max: Infinity, price: 2250.00, label: 'Souvenir Box' }
  ],
  'botones': [
    { min: 50, max: 999, price: 8.00, label: 'Botones Metálicos' },
    { min: 1000, max: Infinity, price: 6.00, label: 'Botones Metálicos' }
  ]
};

// Product name aliases for natural language parsing
const PRODUCT_ALIASES = {
  'iman': 'imanes',
  'imán': 'imanes',
  'imanes': 'imanes',
  'magneto': 'imanes',
  'magnetos': 'imanes',
  'llavero': 'llaveros',
  'llaveros': 'llaveros',
  'destapador': 'destapadores',
  'destapadores': 'destapadores',
  'abridor': 'destapadores',
  'abridores': 'destapadores',
  'portallaves': 'portallaves',
  'porta llaves': 'portallaves',
  'porta-llaves': 'portallaves',
  'souvenir box': 'souvenir_box',
  'souvenirbox': 'souvenir_box',
  'caja souvenir': 'souvenir_box',
  'boton': 'botones',
  'botón': 'botones',
  'botones': 'botones'
};

// Size aliases for magnets
const SIZE_ALIASES = {
  'chico': 'ch',
  'chicos': 'ch',
  'pequeño': 'ch',
  'pequeños': 'ch',
  'ch': 'ch',
  'mediano': 'm',
  'medianos': 'm',
  'normal': 'm',
  'normales': 'm',
  'm': 'm',
  'grande': 'g',
  'grandes': 'g',
  'g': 'g'
};

/**
 * Parse natural language quote request
 * @param {string} text - Natural language text like "50 imanes y 30 llaveros"
 * @returns {Array} Array of items with product, quantity, size
 */
export function parseQuoteRequest(text) {
  const items = [];
  const textLower = text.toLowerCase();

  // Pattern to match: number + product name + optional size
  // Examples: "50 imanes", "100 llaveros grandes", "30 destapadores"
  const patterns = [
    // Number + product + size
    /(\d+)\s*(imanes?|imán|magnetos?|llaveros?|destapadores?|abridores?|portallaves?|porta[\s-]?llaves|souvenir\s*box|caja\s*souvenir|botones?)\s*(chicos?|pequeños?|medianos?|normales?|grandes?|ch|m|g)?/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(textLower)) !== null) {
      const quantity = parseInt(match[1]);
      const productRaw = match[2].trim();
      const sizeRaw = match[3]?.trim() || null;

      // Normalize product name
      let productKey = null;
      for (const [alias, key] of Object.entries(PRODUCT_ALIASES)) {
        if (productRaw.includes(alias) || alias.includes(productRaw)) {
          productKey = key;
          break;
        }
      }

      if (!productKey) continue;

      // Normalize size for magnets
      let sizeKey = null;
      if (productKey === 'imanes' && sizeRaw) {
        for (const [alias, key] of Object.entries(SIZE_ALIASES)) {
          if (sizeRaw.includes(alias)) {
            sizeKey = key;
            break;
          }
        }
      }

      // Determine the pricing key
      let pricingKey = productKey;
      if (productKey === 'imanes' && sizeKey) {
        pricingKey = `imanes_${sizeKey}`;
      }

      // Get price from tiers
      const tiers = PRICING_TIERS[pricingKey] || PRICING_TIERS[productKey];
      if (!tiers) continue;

      const applicableTier = tiers.find(t => quantity >= t.min && quantity <= t.max);
      if (!applicableTier) {
        // Below minimum - use first tier's price and note the minimum
        items.push({
          productKey: pricingKey,
          productName: tiers[0].label + (sizeKey ? ` (${sizeKey.toUpperCase()})` : ''),
          quantity,
          unitPrice: tiers[0].price,
          subtotal: quantity * tiers[0].price,
          minimumRequired: tiers[0].min,
          belowMinimum: quantity < tiers[0].min
        });
      } else {
        items.push({
          productKey: pricingKey,
          productName: applicableTier.label + (sizeKey ? ` (${sizeKey.toUpperCase()})` : ''),
          quantity,
          unitPrice: applicableTier.price,
          subtotal: quantity * applicableTier.price,
          minimumRequired: tiers[0].min,
          belowMinimum: false
        });
      }
    }
  }

  return items;
}

/**
 * Generate a PDF quote/cotización
 * @param {Object} quoteData - Quote information
 * @param {string} quoteData.clientName - Client name (optional)
 * @param {string} quoteData.clientPhone - Client phone (optional)
 * @param {string} quoteData.clientEmail - Client email (optional)
 * @param {Array} quoteData.items - Array of quote items
 * @param {string} quoteData.notes - Additional notes (optional)
 * @param {number} quoteData.validityDays - Quote validity in days (default 15)
 * @returns {Promise<Object>} - { filepath, filename, quoteNumber, total }
 */
export async function generateQuotePDF(quoteData) {
  return new Promise((resolve, reject) => {
    try {
      // Generate quote number
      const quoteNumber = `COT-${Date.now().toString(36).toUpperCase()}`;
      const now = new Date();

      // Calculate totals
      let subtotal = 0;
      const validItems = quoteData.items.filter(item => !item.belowMinimum);
      const invalidItems = quoteData.items.filter(item => item.belowMinimum);

      for (const item of validItems) {
        subtotal += item.subtotal;
      }

      // Apply any discounts or shipping
      const shippingEstimate = quoteData.includeShipping ? 350 : 0;
      const total = subtotal + shippingEstimate;

      // Validity date
      const validityDays = quoteData.validityDays || 15;
      const validUntil = new Date(now);
      validUntil.setDate(validUntil.getDate() + validityDays);

      const filename = `cotizacion-${quoteNumber}-${Date.now()}.pdf`;
      const filepath = path.join(QUOTES_DIR, filename);

      // Create PDF document
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      // Pipe to file
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // ============================================
      // HEADER with AXKAN branding
      // ============================================
      const headerHeight = 120;
      doc.rect(0, 0, doc.page.width, headerHeight)
         .fillAndStroke(COLORS.pinkMedium, COLORS.pinkMedium);

      // Lighter gradient overlay
      doc.rect(0, 0, doc.page.width, headerHeight / 2)
         .fillOpacity(0.3)
         .fill(COLORS.pinkLight);
      doc.fillOpacity(1);

      // Logo on right
      const logoSize = 70;
      const logoX = doc.page.width - 50 - logoSize;
      if (fs.existsSync(LOGO_PATH)) {
        try {
          doc.image(LOGO_PATH, logoX, 25, { height: logoSize });
        } catch (err) {
          console.log('Could not load logo:', err.message);
        }
      }

      // Company header
      doc.fontSize(32)
         .font('Helvetica-Bold')
         .fillColor('#ffffff')
         .text('Axkan', 50, 25, { width: 400, align: 'left' });

      doc.fontSize(13)
         .font('Helvetica')
         .fillColor('#FCE4EC')
         .text('Souvenirs Personalizados', 50, 62, { width: 400, align: 'left' });

      doc.fontSize(18)
         .font('Helvetica-Bold')
         .fillColor('#ffffff')
         .text('COTIZACIÓN', 50, 85, { width: 400, align: 'left' });

      // Reset color
      doc.fillColor('#000000');
      doc.y = headerHeight + 30;

      // ============================================
      // QUOTE INFO BOX
      // ============================================
      const startY = doc.y;
      const infoBoxHeight = quoteData.clientName ? 100 : 70;

      doc.roundedRect(50, startY - 5, 510, infoBoxHeight, 5)
         .fillAndStroke(COLORS.pinkPale, COLORS.pinkAccent);

      doc.fillColor('#000000');
      doc.fontSize(10).font('Helvetica');

      const labelX = 65;
      const valueX = 180;
      let lineY = startY + 5;

      // Quote info labels
      doc.fillColor(COLORS.pinkDark).font('Helvetica');
      doc.text('Número de Cotización:', labelX, lineY);
      doc.text('Fecha:', labelX, lineY + 15);
      doc.text('Válida hasta:', labelX, lineY + 30);

      // Quote info values
      doc.fillColor(COLORS.textDark).font('Helvetica-Bold');
      doc.text(quoteNumber, valueX, lineY);
      doc.text(formatDate(now), valueX, lineY + 15);
      doc.text(formatDate(validUntil), valueX, lineY + 30);

      // Client info (right column) if provided
      if (quoteData.clientName) {
        const rightLabelX = 320;
        const rightValueX = 400;

        doc.fillColor(COLORS.pinkDark).font('Helvetica');
        doc.text('Cliente:', rightLabelX, lineY);
        if (quoteData.clientPhone) doc.text('Teléfono:', rightLabelX, lineY + 15);
        if (quoteData.clientEmail) doc.text('Email:', rightLabelX, lineY + 30);

        doc.fillColor(COLORS.textDark).font('Helvetica-Bold');
        doc.text(quoteData.clientName, rightValueX, lineY);
        if (quoteData.clientPhone) doc.text(quoteData.clientPhone, rightValueX, lineY + 15);
        if (quoteData.clientEmail) doc.text(quoteData.clientEmail, rightValueX, lineY + 30);
      }

      // Position after info box
      doc.y = startY + infoBoxHeight + 20;

      // ============================================
      // PRODUCTS TABLE
      // ============================================
      doc.font('Helvetica-Bold')
         .fontSize(12)
         .fillColor(COLORS.textDark)
         .text('PRODUCTOS COTIZADOS', 50, doc.y);

      doc.moveDown(0.5);

      // Table header
      const tableTop = doc.y;
      doc.rect(50, tableTop - 3, 510, 22)
         .fillAndStroke(COLORS.pinkPale, COLORS.pinkLight);

      doc.fontSize(9)
         .font('Helvetica-Bold')
         .fillColor(COLORS.pinkDark)
         .text('Producto', 55, tableTop + 3)
         .text('Cantidad', 280, tableTop + 3)
         .text('Precio Unit.', 360, tableTop + 3)
         .text('Subtotal', 470, tableTop + 3);

      // Table rows
      let itemY = tableTop + 27;
      doc.font('Helvetica').fontSize(10);

      // Valid items
      for (const item of validItems) {
        doc.fillColor(COLORS.textDark);
        doc.text(item.productName, 50, itemY, { width: 220 });
        doc.text(item.quantity.toLocaleString('es-MX'), 280, itemY);
        doc.text(formatCurrency(item.unitPrice), 360, itemY);
        doc.text(formatCurrency(item.subtotal), 470, itemY);
        itemY += 22;
      }

      // Invalid items (below minimum) with warning
      if (invalidItems.length > 0) {
        itemY += 5;
        doc.fillColor(COLORS.warningOrange).fontSize(8);
        doc.text('⚠️ Los siguientes productos están por debajo del mínimo:', 50, itemY);
        itemY += 15;

        doc.fontSize(9);
        for (const item of invalidItems) {
          doc.fillColor(COLORS.warningOrange);
          doc.text(`${item.productName}: ${item.quantity} pzas (mínimo ${item.minimumRequired})`, 60, itemY);
          itemY += 15;
        }
      }

      // Shipping line (if applicable)
      if (shippingEstimate > 0) {
        itemY += 5;
        doc.fillColor(COLORS.textGray);
        doc.fontSize(9);
        doc.text('🚚 Envío (estimado)', 50, itemY, { width: 220 });
        doc.text('—', 280, itemY);
        doc.text('—', 360, itemY);
        doc.text(formatCurrency(shippingEstimate), 470, itemY);
        itemY += 20;
      }

      // Divider line
      doc.moveTo(50, itemY).lineTo(560, itemY).stroke();
      itemY += 15;

      // ============================================
      // TOTALS
      // ============================================
      doc.font('Helvetica-Bold').fontSize(11);

      // Subtotal
      doc.fillColor(COLORS.textDark);
      doc.text('SUBTOTAL:', 350, itemY);
      doc.text(formatCurrency(subtotal), 470, itemY);
      itemY += 20;

      if (shippingEstimate > 0) {
        doc.text('ENVÍO:', 350, itemY);
        doc.text(formatCurrency(shippingEstimate), 470, itemY);
        itemY += 20;
      }

      // Total box
      doc.roundedRect(340, itemY - 5, 220, 35, 3)
         .fillAndStroke(COLORS.successBg, COLORS.successGreen);

      doc.fontSize(14)
         .fillColor(COLORS.successGreen)
         .font('Helvetica-Bold');
      doc.text('TOTAL:', 355, itemY + 5);
      doc.text(formatCurrency(total), 355, itemY + 5, { width: 195, align: 'right' });

      itemY += 50;

      // ============================================
      // PRICE BREAKDOWN / TIERS INFO
      // ============================================
      doc.roundedRect(50, itemY, 510, 60, 5)
         .fillAndStroke(COLORS.infoBlueBg, COLORS.infoBlue);

      doc.fillColor(COLORS.infoBlue)
         .fontSize(9)
         .font('Helvetica-Bold')
         .text('💡 PRECIOS POR VOLUMEN', 60, itemY + 8);

      doc.font('Helvetica').fontSize(8);
      doc.text('• Imanes MDF: $11/u (50-999 pzas) → $8/u (1000+ pzas)', 60, itemY + 22);
      doc.text('• Llaveros MDF: $10/u (50-999 pzas) → $8/u (1000+ pzas)', 60, itemY + 33);
      doc.text('• Destapadores MDF: $20/u (50-999 pzas) → $17/u (1000+ pzas)', 60, itemY + 44);
      doc.text('• Portallaves MDF: $40/u (mín. 20 pzas)', 300, itemY + 22);
      doc.text('• Souvenir Box: $2,250/u (sin mínimo)', 300, itemY + 33);

      itemY += 75;

      // ============================================
      // NOTES & TERMS
      // ============================================
      if (quoteData.notes) {
        doc.fillColor(COLORS.textDark)
           .fontSize(10)
           .font('Helvetica-Bold')
           .text('NOTAS:', 50, itemY);

        doc.font('Helvetica')
           .fontSize(9)
           .fillColor(COLORS.textGray)
           .text(quoteData.notes, 50, itemY + 15, { width: 510 });

        itemY += 40;
      }

      // Terms
      doc.fillColor(COLORS.textGray)
         .fontSize(8)
         .font('Helvetica');

      const terms = [
        '• Esta cotización tiene una vigencia de ' + validityDays + ' días.',
        '• Precios en pesos mexicanos (MXN), no incluyen IVA.',
        '• Se requiere anticipo del 50% para iniciar producción.',
        '• Tiempo de producción: 5-7 días hábiles después del anticipo.',
        '• Envío no incluido (se cotiza según destino).',
        '• Los diseños deben enviarse en alta resolución (300 DPI mínimo).'
      ];

      for (const term of terms) {
        doc.text(term, 50, itemY);
        itemY += 12;
      }

      // ============================================
      // FOOTER
      // ============================================
      doc.moveDown(2);
      doc.fontSize(10)
         .fillColor(COLORS.pinkMedium)
         .font('Helvetica-Bold')
         .text('¡Gracias por cotizar con AXKAN!', { align: 'center' });

      doc.moveDown(0.5);
      doc.fontSize(9)
         .fillColor(COLORS.textGray)
         .font('Helvetica')
         .text('WhatsApp: +52 961 123 4567 | Email: ventas@axkan.com', { align: 'center' });

      doc.moveDown(0.3);
      doc.fontSize(7)
         .text(`Cotización generada el ${formatDate(now)} | ${quoteNumber}`, { align: 'center' });

      // Finalize PDF
      doc.end();

      stream.on('finish', () => {
        console.log(`✅ Quote PDF generated: ${filename}`);
        resolve({
          filepath,
          filename,
          quoteNumber,
          total,
          subtotal,
          itemCount: validItems.length,
          validUntil: formatDate(validUntil),
          items: validItems,
          invalidItems
        });
      });

      stream.on('error', (error) => {
        console.error('❌ Error writing quote PDF:', error);
        reject(error);
      });

    } catch (error) {
      console.error('❌ Error generating quote PDF:', error);
      reject(error);
    }
  });
}

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
 * Format date in Spanish
 */
function formatDate(date) {
  return new Date(date).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Get the URL path for a quote file
 */
export function getQuoteUrl(filepath) {
  const filename = path.basename(filepath);
  return `/quotes/${filename}`;
}

/**
 * Delete a quote file
 */
export async function deleteQuote(filepath) {
  try {
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      console.log(`🗑️ Deleted quote: ${filepath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Error deleting quote:', error);
    return false;
  }
}

/**
 * Get pricing information for products (for AI to reference)
 */
export function getPricingInfo() {
  return {
    products: [
      { name: 'Imanes MDF Chico', minQty: 50, prices: [{ qty: '50-999', price: 8 }, { qty: '1000+', price: 6 }] },
      { name: 'Imanes MDF Mediano', minQty: 50, prices: [{ qty: '50-999', price: 11 }, { qty: '1000+', price: 8 }] },
      { name: 'Imanes MDF Grande', minQty: 50, prices: [{ qty: '50-999', price: 15 }, { qty: '1000+', price: 12 }] },
      { name: 'Llaveros MDF', minQty: 50, prices: [{ qty: '50-999', price: 10 }, { qty: '1000+', price: 8 }] },
      { name: 'Destapadores MDF', minQty: 50, prices: [{ qty: '50-999', price: 20 }, { qty: '1000+', price: 17 }] },
      { name: 'Portallaves MDF', minQty: 20, prices: [{ qty: '20+', price: 40 }] },
      { name: 'Souvenir Box', minQty: 1, prices: [{ qty: '1+', price: 2250 }] },
      { name: 'Botones Metálicos', minQty: 50, prices: [{ qty: '50-999', price: 8 }, { qty: '1000+', price: 6 }] }
    ],
    notes: {
      production: '5-7 días hábiles',
      deposit: '50% anticipo',
      shipping: 'No incluido',
      validity: '15 días'
    }
  };
}

export default {
  parseQuoteRequest,
  generateQuotePDF,
  getQuoteUrl,
  deleteQuote,
  getPricingInfo
};
