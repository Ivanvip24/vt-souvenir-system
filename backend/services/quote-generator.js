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
  'imanes_3d': [
    { min: 100, max: 999, price: 15.00, label: 'Imanes 3D' },
    { min: 1000, max: Infinity, price: 12.00, label: 'Imanes 3D' }
  ],
  'imanes_foil': [
    { min: 100, max: 999, price: 15.00, label: 'Imanes Foil Metálico' },
    { min: 1000, max: Infinity, price: 12.00, label: 'Imanes Foil Metálico' }
  ],
  'llaveros': [
    { min: 50, max: 999, price: 10.00, label: 'Llaveros MDF' },
    { min: 1000, max: Infinity, price: 8.00, label: 'Llaveros MDF' }
  ],
  'destapadores': [
    { min: 50, max: 499, price: 20.00, label: 'Destapadores MDF' },
    { min: 500, max: 999, price: 17.00, label: 'Destapadores MDF' },
    { min: 1000, max: Infinity, price: 15.00, label: 'Destapadores MDF' }
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

// Special product type aliases (detected from text context)
const SPECIAL_PRODUCT_TYPES = {
  '3d': 'imanes_3d',
  'foil': 'imanes_foil',
  'foil metálico': 'imanes_foil',
  'foil metalico': 'imanes_foil',
  'metálico': 'imanes_foil',
  'metalico': 'imanes_foil'
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
 * Parse custom prices from text like "Llavero $6" or "iman en $8" or "en precio $7"
 * @param {string} text - Text containing price specifications
 * @returns {Object} Map of product key to custom price
 */
function parseCustomPrices(text) {
  const customPrices = {};
  const textLower = text.toLowerCase();

  // Pattern 1: product + optional type/size + price
  // Handles: "iman $7", "iman en precio $7", "imanes mediano en precio $7", "llavero a $6"
  const pricePatterns = [
    // Product + optional (3d/foil/size words) + optional (en/a/precio/de) + $ + price
    // Note: iman(es)? matches both "iman" and "imanes", llavero(s)? matches "llavero" and "llaveros", etc.
    /(iman(?:es)?|imán|magneto(?:s)?|llavero(?:s)?|destapador(?:es)?|abridor(?:es)?|portallaves?|porta[\s-]?llaves|souvenir\s*box|boto(?:n|nes))\s*(?:3d|foil\s*metálico|foil\s*metalico|foil|mdf|chicos?|pequeños?|medianos?|normales?|grandes?)?\s*(?:en|a|precio|de|\s)*\$\s*([\d.]+)/gi,
  ];

  // Pattern 2: standalone special types with price (e.g., "3D $25", "foil $25")
  const specialTypePatterns = [
    /(3d|foil\s*metálico|foil\s*metalico|foil)\s*(?:en|a)?\s*\$\s*([\d.]+)/gi,
  ];

  // First parse product patterns
  for (const pattern of pricePatterns) {
    let match;
    while ((match = pattern.exec(textLower)) !== null) {
      const productRaw = match[1].trim();
      const price = parseFloat(match[2]);

      // Normalize product name
      let productKey = null;
      for (const [alias, key] of Object.entries(PRODUCT_ALIASES)) {
        if (productRaw.includes(alias) || alias.includes(productRaw)) {
          productKey = key;
          break;
        }
      }

      if (productKey && !isNaN(price)) {
        customPrices[productKey] = price;
      }
    }
  }

  // Then parse standalone special type patterns (3D $25, foil $25)
  for (const pattern of specialTypePatterns) {
    let match;
    while ((match = pattern.exec(textLower)) !== null) {
      const specialType = match[1].trim();
      const price = parseFloat(match[2]);

      if (!isNaN(price)) {
        // Map special type to product key
        for (const [alias, key] of Object.entries(SPECIAL_PRODUCT_TYPES)) {
          if (specialType.includes(alias) || alias.includes(specialType)) {
            // Only set if not already set by the more specific pattern
            if (!customPrices[key]) {
              customPrices[key] = price;
            }
            break;
          }
        }
      }
    }
  }

  return customPrices;
}

/**
 * Parse natural language quote request
 * @param {string} text - Natural language text like "50 imanes y 30 llaveros"
 * @param {Object} options - Optional settings
 * @param {Object} options.customPrices - Custom prices to override default pricing
 * @returns {Array} Array of items with product, quantity, size
 */
export function parseQuoteRequest(text, options = {}) {
  const items = [];
  // Normalize text: remove commas from numbers (1,000 → 1000), then lowercase
  const textNormalized = text.replace(/(\d),(\d)/g, '$1$2').toLowerCase();

  // Parse custom prices from text if not provided
  const customPrices = options.customPrices || parseCustomPrices(text);

  // Pattern to match: number + product name + optional modifiers (3D, Foil, size)
  // Examples: "50 imanes", "1000 llaveros", "100 imanes 3d", "100 imanes foil metálico"
  const patterns = [
    // Number + product + optional modifiers (3d, foil, size, mdf)
    /([\d,]+)\s*(imanes?|imán|magnetos?|llaveros?|destapadores?|abridores?|portallaves?|porta[\s-]?llaves|souvenir\s*box|caja\s*souvenir|botones?)\s*(3d|foil\s*metálico|foil\s*metalico|foil|metálico|metalico|mdf)?\s*(chicos?|pequeños?|medianos?|normales?|grandes?|ch|m|g)?/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(textNormalized)) !== null) {
      // Parse quantity (remove commas)
      const quantity = parseInt(match[1].replace(/,/g, ''));
      const productRaw = match[2].trim();
      const specialType = match[3]?.trim() || null;
      const sizeRaw = match[4]?.trim() || null;

      // Normalize product name
      let productKey = null;
      for (const [alias, key] of Object.entries(PRODUCT_ALIASES)) {
        if (productRaw.includes(alias) || alias.includes(productRaw)) {
          productKey = key;
          break;
        }
      }

      if (!productKey) continue;

      // Check for special product types (3D, Foil) for imanes
      let pricingKey = productKey;

      if (productKey === 'imanes' && specialType) {
        // Check for special product type
        for (const [alias, key] of Object.entries(SPECIAL_PRODUCT_TYPES)) {
          if (specialType.includes(alias) || alias.includes(specialType)) {
            pricingKey = key;
            break;
          }
        }
      }

      // Normalize size for regular magnets (only if not a special type)
      let sizeKey = null;
      if (productKey === 'imanes' && pricingKey === 'imanes') {
        if (sizeRaw) {
          for (const [alias, key] of Object.entries(SIZE_ALIASES)) {
            if (sizeRaw.includes(alias)) {
              sizeKey = key;
              break;
            }
          }
        }
        // Apply size to pricing key
        if (sizeKey) {
          pricingKey = `imanes_${sizeKey}`;
        }
      }

      // Check for custom price (check both pricingKey and productKey)
      const customPrice = customPrices[pricingKey] || customPrices[productKey];
      const hasCustomPrice = customPrice !== undefined;

      // Get price from tiers (as fallback)
      const tiers = PRICING_TIERS[pricingKey] || PRICING_TIERS[productKey];
      if (!tiers) continue;

      const applicableTier = tiers.find(t => quantity >= t.min && quantity <= t.max);

      // Check if this product requires special quote
      const requiresQuote = !hasCustomPrice && (applicableTier?.requiresQuote || tiers[0].requiresQuote);

      // Determine the price to use
      let unitPrice, productName;
      if (hasCustomPrice) {
        unitPrice = customPrice;
        productName = (applicableTier?.label || tiers[0].label) + (sizeKey ? ` (${sizeKey.toUpperCase()})` : '');
      } else if (applicableTier) {
        unitPrice = applicableTier.price;
        productName = applicableTier.label + (sizeKey ? ` (${sizeKey.toUpperCase()})` : '');
      } else {
        unitPrice = tiers[0].price;
        productName = tiers[0].label + (sizeKey ? ` (${sizeKey.toUpperCase()})` : '');
      }

      const belowMinimum = !hasCustomPrice && (!applicableTier && quantity < tiers[0].min);

      items.push({
        productKey: pricingKey,
        productName,
        quantity,
        unitPrice,
        subtotal: requiresQuote ? 0 : quantity * unitPrice,
        minimumRequired: tiers[0].min,
        belowMinimum,
        requiresQuote,
        isSpecialPrice: hasCustomPrice
      });
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

      // Deduplicate items by productKey (keep the one with valid quantity, prefer special price)
      const itemMap = new Map();
      for (const item of quoteData.items) {
        // Skip items with invalid data
        if (!item.quantity || isNaN(item.quantity) || item.quantity <= 0) continue;
        if (item.unitPrice === undefined || isNaN(item.unitPrice)) continue;

        const key = item.productKey;
        const existing = itemMap.get(key);

        if (!existing) {
          itemMap.set(key, item);
        } else {
          // If new item has special price, prefer it; otherwise keep the one with higher quantity
          if (item.isSpecialPrice && !existing.isSpecialPrice) {
            itemMap.set(key, item);
          } else if (item.quantity > existing.quantity && !existing.isSpecialPrice) {
            itemMap.set(key, item);
          }
        }
      }

      const deduplicatedItems = Array.from(itemMap.values());

      // Calculate totals
      let subtotal = 0;
      let totalPieces = 0;
      const validItems = deduplicatedItems.filter(item => !item.belowMinimum && !item.requiresQuote);
      const invalidItems = deduplicatedItems.filter(item => item.belowMinimum);
      const specialQuoteItems = deduplicatedItems.filter(item => item.requiresQuote);

      for (const item of validItems) {
        const itemSubtotal = item.subtotal || 0;
        const itemQuantity = item.quantity || 0;
        if (!isNaN(itemSubtotal)) subtotal += itemSubtotal;
        if (!isNaN(itemQuantity)) totalPieces += itemQuantity;
      }

      // Add special quote items to total pieces count (but not subtotal)
      for (const item of specialQuoteItems) {
        const itemQuantity = item.quantity || 0;
        if (!isNaN(itemQuantity)) totalPieces += itemQuantity;
      }

      // Free shipping for orders >= 300 pieces
      // Standard shipping cost: $210 MXN (per AXKAN brand guidelines)
      const STANDARD_SHIPPING_COST = 210;
      const freeShipping = totalPieces >= 300;
      const shippingEstimate = freeShipping ? 0 : STANDARD_SHIPPING_COST;
      const total = subtotal + shippingEstimate;

      // Calculate 50% deposit
      const depositAmount = Math.ceil(total * 0.5);

      // Validity date (default 3 days)
      const validityDays = quoteData.validityDays || 3;
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

      // Track items with special prices for notes
      const specialPriceItems = validItems.filter(item => item.isSpecialPrice);

      // Valid items
      for (const item of validItems) {
        // Product name (with special price marker if applicable)
        const displayName = item.isSpecialPrice ? `* ${item.productName}` : item.productName;
        doc.fillColor(item.isSpecialPrice ? COLORS.pinkDark : COLORS.textDark);
        doc.text(displayName, 50, itemY, { width: 220 });
        doc.text(item.quantity.toLocaleString('es-MX'), 280, itemY);
        doc.text(formatCurrency(item.unitPrice), 360, itemY);
        doc.text(formatCurrency(item.subtotal), 470, itemY);
        itemY += 22;
      }

      // Special quote items (price to be determined)
      for (const item of specialQuoteItems) {
        doc.fillColor(COLORS.textGray);
        doc.text(item.productName, 50, itemY, { width: 220 });
        doc.text(item.quantity.toLocaleString('es-MX'), 280, itemY);
        doc.fillColor(COLORS.warningOrange);
        doc.text('Por cotizar', 360, itemY);
        doc.text('—', 470, itemY);
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

      itemY += 45;

      // Deposit amount box (50% anticipo)
      doc.roundedRect(340, itemY - 5, 220, 30, 3)
         .fillAndStroke(COLORS.warningBg, '#f59e0b');

      doc.fontSize(11)
         .fillColor(COLORS.warningOrange)
         .font('Helvetica-Bold');
      doc.text('ANTICIPO (50%):', 355, itemY + 3);
      doc.text(formatCurrency(depositAmount), 355, itemY + 3, { width: 195, align: 'right' });

      itemY += 40;

      // Free shipping notice if applicable
      if (freeShipping) {
        doc.fontSize(10)
           .fillColor(COLORS.successGreen)
           .font('Helvetica-Bold')
           .text('✓ ¡Envío GRATIS incluido! (pedido de ' + totalPieces.toLocaleString('es-MX') + ' piezas)', 50, itemY, { align: 'center', width: 510 });
        itemY += 20;
      }

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
      // Build notes text including special price items, special quote items, and user notes
      const notesLines = [];

      // Add note about special prices applied (marked with *)
      if (specialPriceItems.length > 0) {
        const priceList = specialPriceItems.map(item =>
          `${item.productName} ${formatCurrency(item.unitPrice)}`
        ).join(', ');
        notesLines.push(`* Precios especiales aplicados: ${priceList}.`);
      }

      // Add note about special quote items
      if (specialQuoteItems.length > 0) {
        const specialItemNames = specialQuoteItems.map(item =>
          `${item.productName} (${item.quantity.toLocaleString('es-MX')} pzas)`
        ).join(', ');
        notesLines.push(`${specialItemNames} requiere precio especial - contactar para cotización.`);
      }

      // Add user notes
      if (quoteData.notes) {
        notesLines.push(quoteData.notes);
      }

      if (notesLines.length > 0) {
        doc.fillColor(COLORS.textDark)
           .fontSize(10)
           .font('Helvetica-Bold')
           .text('NOTAS:', 50, itemY);

        doc.font('Helvetica')
           .fontSize(9)
           .fillColor(COLORS.textGray)
           .text(notesLines.join(' '), 50, itemY + 15, { width: 510 });

        itemY += 40 + (notesLines.length > 1 ? 15 : 0);
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
        '• Envío incluido en pedidos de 300+ piezas. Otros envíos se cotizan según destino.'
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
         .text('WhatsApp: 55 3825 3251 | Email: informacion@axkan.art', { align: 'center' });

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
          shipping: shippingEstimate,
          freeShipping,
          totalPieces,
          itemCount: validItems.length,
          validUntil: formatDate(validUntil),
          items: validItems,
          invalidItems,
          specialQuoteItems
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
 * Returns full URL for production, relative for local
 */
export function getQuoteUrl(filepath) {
  const filename = path.basename(filepath);
  const relativePath = `/quotes/${filename}`;

  // In production, return full backend URL
  const backendUrl = process.env.BACKEND_URL
    || process.env.RENDER_EXTERNAL_URL
    || (process.env.NODE_ENV === 'production' ? 'https://vt-souvenir-backend.onrender.com' : null);

  if (backendUrl) {
    return `${backendUrl}${relativePath}`;
  }

  // For local development
  return relativePath;
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
      { name: 'Imanes 3D', minQty: 100, prices: [{ qty: '100-999', price: 15 }, { qty: '1000+', price: 12 }] },
      { name: 'Imanes Foil Metálico', minQty: 100, prices: [{ qty: '100-999', price: 15 }, { qty: '1000+', price: 12 }] },
      { name: 'Llaveros MDF', minQty: 50, prices: [{ qty: '50-999', price: 10 }, { qty: '1000+', price: 8 }] },
      { name: 'Destapadores MDF', minQty: 50, prices: [{ qty: '50-499', price: 20 }, { qty: '500-999', price: 17 }, { qty: '1000+', price: 15 }] },
      { name: 'Portallaves MDF', minQty: 20, prices: [{ qty: '20+', price: 40 }] },
      { name: 'Souvenir Box', minQty: 1, prices: [{ qty: '1+', price: 2250 }] },
      { name: 'Botones Metálicos', minQty: 50, prices: [{ qty: '50-999', price: 8 }, { qty: '1000+', price: 6 }] }
    ],
    notes: {
      production: '5-7 días hábiles',
      deposit: '50% anticipo',
      shipping: 'Incluido en pedidos de 300+ piezas',
      validity: '3 días'
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
