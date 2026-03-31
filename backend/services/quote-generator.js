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

// AXKAN Brand Colors — matching catalog style (no black)
const COLORS = {
  pink: '#E91E63',
  pinkDeep: '#AD1457',
  pinkPale: '#FDF2F8',
  green: '#7CB342',
  orange: '#FF9800',
  cyan: '#00BCD4',
  red: '#F44336',
  text: '#555555',
  textLight: '#999999',
  white: '#FFFFFF',
  grayLine: '#E0E0E0'
};

const BAND = [COLORS.pink, COLORS.green, COLORS.orange, COLORS.cyan, COLORS.red];

// Assets — deployed in backend/assets/
const ASSETS = {
  logo: path.join(__dirname, '../assets/images/JAGUAR_LETTERS.png'),
  fontTitle: path.join(__dirname, '../assets/fonts/RLAQVA.otf'),
  fontBody: path.join(__dirname, '../assets/fonts/FONT-OBJEKTIV-VF-BODY.otf')
};

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
    { min: 1000, max: Infinity, price: 7.00, label: 'Llaveros MDF' }
  ],
  'destapadores': [
    { min: 50, max: 499, price: 20.00, label: 'Destapadores MDF' },
    { min: 500, max: 999, price: 17.00, label: 'Destapadores MDF' },
    { min: 1000, max: Infinity, price: 15.00, label: 'Destapadores MDF' }
  ],
  'portallaves': [
    { min: 20, max: Infinity, price: 40.00, label: 'Portallaves MDF' }
  ],
  'portarretratos': [
    { min: 20, max: Infinity, price: 40.00, label: 'Portarretratos MDF' }
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
  'portarretratos': 'portarretratos',
  'portaretratos': 'portarretratos',
  'porta retratos': 'portarretratos',
  'porta-retratos': 'portarretratos',
  'portaretrato': 'portarretratos',
  'portarretrato': 'portarretratos',
  'marco': 'portarretratos',
  'marcos': 'portarretratos',
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
    /(iman(?:es)?|imán|magneto(?:s)?|llavero(?:s)?|destapador(?:es)?|abridor(?:es)?|portallaves?|porta[\s-]?llaves|portarretratos?|portaretratos?|porta[\s-]?retratos|marcos?|souvenir\s*box|boto(?:n|nes))\s*(?:3d|foil\s*metálico|foil\s*metalico|foil|mdf|chicos?|pequeños?|medianos?|normales?|grandes?)?\s*(?:en|a|precio|de|\s)*\$\s*([\d.]+)/gi,
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
  let textNormalized = text.replace(/(\d),(\d)/g, '$1$2').toLowerCase();
  // Remove $ before numbers that are followed by "en $" or "a $" (quantity, not price)
  // e.g. "$450 en $7" → "450 en $7"
  textNormalized = textNormalized.replace(/\$(\d+)\s*(?:en|a)\s*\$/g, '$1 en $');

  // Product names regex fragment (shared across patterns)
  const productNames = 'imanes?|imán|magnetos?|llaveros?|destapadores?|abridores?|portallaves?|porta[\\s-]?llaves|portarretratos?|portaretratos?|porta[\\s-]?retratos|marcos?|souvenir\\s*box|caja\\s*souvenir|botones?';
  const modifiers = '3d|foil\\s*metálico|foil\\s*metalico|foil|metálico|metalico|mdf';
  const sizes = 'chicos?|pequeños?|medianos?|normales?|grandes?|ch|m|g';

  // Inline price fragment: optional "en/a/por" + $ + number + optional "c/u"
  const inlinePrice = '(?:(?:en|a|por|precio)?\\s*\\$\\s*([\\d.]+)\\s*(?:c/?u|pza|cada\\s*uno)?)';

  // Pattern 1: Number (optional pzas) + product + optional modifiers + optional inline price
  // Examples: "1050 imanes en $13", "1050pzas imanes $13 c/u", "300 imanes en $10.5"
  const pattern1 = new RegExp(
    `(\\d+)\\s*(?:pzas?|piezas?|pz)?\\s*(?:de\\s+)?(${productNames})\\s*(${modifiers})?\\s*(${sizes})?\\s*${inlinePrice}?`,
    'gi'
  );

  // Pattern 2: Product + number (optional pzas) + optional inline price
  // Examples: "imanes 1050pzas en $13", "imanes 300 $10.5"
  const pattern2 = new RegExp(
    `(${productNames})\\s*(${modifiers})?\\s*(${sizes})?\\s+(\\d+)\\s*(?:pzas?|piezas?|pz)?\\s*${inlinePrice}?`,
    'gi'
  );

  // Parse global custom prices as fallback (single price per product)
  const globalCustomPrices = options.customPrices || parseCustomPrices(text);

  // Track matched ranges to avoid duplicates between pattern1 and pattern2
  const matchedRanges = [];

  function rangeOverlaps(start, end) {
    return matchedRanges.some(r => start < r.end && end > r.start);
  }

  function processItem(quantity, productRaw, specialType, sizeRaw, inlinePrice) {
    // Normalize product name
    let productKey = null;
    for (const [alias, key] of Object.entries(PRODUCT_ALIASES)) {
      if (productRaw.includes(alias) || alias.includes(productRaw)) {
        productKey = key;
        break;
      }
    }
    if (!productKey) return null;

    // Check for special product types (3D, Foil) for imanes
    let pricingKey = productKey;
    if (productKey === 'imanes' && specialType) {
      for (const [alias, key] of Object.entries(SPECIAL_PRODUCT_TYPES)) {
        if (specialType.includes(alias) || alias.includes(specialType)) {
          pricingKey = key;
          break;
        }
      }
    }

    // Normalize size for regular magnets
    let sizeKey = null;
    if (productKey === 'imanes' && pricingKey === 'imanes' && sizeRaw) {
      for (const [alias, key] of Object.entries(SIZE_ALIASES)) {
        if (sizeRaw.includes(alias)) {
          sizeKey = key;
          break;
        }
      }
      if (sizeKey) pricingKey = `imanes_${sizeKey}`;
    }

    // Determine custom price: inline price takes priority, then global
    const hasInlinePrice = inlinePrice !== undefined && !isNaN(inlinePrice);
    const globalPrice = globalCustomPrices[pricingKey] || globalCustomPrices[productKey];
    const customPrice = hasInlinePrice ? inlinePrice : globalPrice;
    const hasCustomPrice = customPrice !== undefined;

    // Get price from tiers (as fallback)
    const tiers = PRICING_TIERS[pricingKey] || PRICING_TIERS[productKey];
    if (!tiers) return null;

    const applicableTier = tiers.find(t => quantity >= t.min && quantity <= t.max);
    const requiresQuote = !hasCustomPrice && (applicableTier?.requiresQuote || tiers[0].requiresQuote);

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

    return {
      productKey: pricingKey,
      productName,
      quantity,
      unitPrice,
      subtotal: requiresQuote ? 0 : quantity * unitPrice,
      minimumRequired: tiers[0].min,
      belowMinimum,
      requiresQuote,
      isSpecialPrice: hasCustomPrice
    };
  }

  // Run pattern 1: number + product
  let match;
  while ((match = pattern1.exec(textNormalized)) !== null) {
    const quantity = parseInt(match[1]);
    if (quantity <= 0 || isNaN(quantity)) continue;
    const productRaw = match[2].trim();
    const specialType = match[3]?.trim() || null;
    const sizeRaw = match[4]?.trim() || null;
    const inlinePrice = match[5] ? parseFloat(match[5]) : undefined;

    const item = processItem(quantity, productRaw, specialType, sizeRaw, inlinePrice);
    if (item) {
      items.push(item);
      matchedRanges.push({ start: match.index, end: match.index + match[0].length });
    }
  }

  // Run pattern 2: product + number (only for non-overlapping matches)
  while ((match = pattern2.exec(textNormalized)) !== null) {
    if (rangeOverlaps(match.index, match.index + match[0].length)) continue;

    const productRaw = match[1].trim();
    const specialType = match[2]?.trim() || null;
    const sizeRaw = match[3]?.trim() || null;
    const quantity = parseInt(match[4]);
    if (quantity <= 0 || isNaN(quantity)) continue;
    const inlinePrice = match[5] ? parseFloat(match[5]) : undefined;

    const item = processItem(quantity, productRaw, specialType, sizeRaw, inlinePrice);
    if (item) {
      items.push(item);
      matchedRanges.push({ start: match.index, end: match.index + match[0].length });
    }
  }

  // Pattern 3: orphan quantity + price without product name (e.g. "450 en $7")
  // Inherits product from most recently matched item
  if (items.length > 0) {
    const orphanPattern = /(\d+)\s*(?:pzas?|piezas?|pz)?\s*(?:en|a|por|precio)?\s*\$\s*([\d.]+)/gi;
    while ((match = orphanPattern.exec(textNormalized)) !== null) {
      if (rangeOverlaps(match.index, match.index + match[0].length)) continue;

      const quantity = parseInt(match[1]);
      if (quantity <= 0 || isNaN(quantity)) continue;
      const inlinePrice = parseFloat(match[2]);
      if (isNaN(inlinePrice)) continue;

      // Find the closest preceding item to inherit product from
      const lastItem = items[items.length - 1];
      const item = processItem(quantity, lastItem.productKey, null, null, inlinePrice);
      if (item) {
        items.push(item);
        matchedRanges.push({ start: match.index, end: match.index + match[0].length });
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

      // Deduplicate items: only merge if SAME product, quantity, AND price (true duplicates)
      const seen = [];
      for (const item of quoteData.items) {
        // Skip items with invalid data
        if (!item.quantity || isNaN(item.quantity) || item.quantity <= 0) continue;
        if (item.unitPrice === undefined || isNaN(item.unitPrice)) continue;

        // Check for true duplicate (same product + same quantity + same price)
        const isDuplicate = seen.some(s =>
          s.productKey === item.productKey &&
          s.quantity === item.quantity &&
          s.unitPrice === item.unitPrice
        );
        if (!isDuplicate) {
          seen.push(item);
        }
      }

      const deduplicatedItems = seen;

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

      // Extra concepts (urgency, special design, discounts, etc.)
      const extraConcepts = (quoteData.extraConcepts || []).filter(c => c && c.concept && typeof c.amount === 'number');
      let extraConceptsTotal = 0;
      for (const ec of extraConcepts) {
        extraConceptsTotal += ec.amount;
      }

      // Free shipping for orders >= 300 pieces
      // Standard shipping cost: $210 MXN (per AXKAN brand guidelines)
      const STANDARD_SHIPPING_COST = 210;
      const freeShipping = totalPieces >= 300;
      const shippingEstimate = freeShipping ? 0 : STANDARD_SHIPPING_COST;
      const total = subtotal + extraConceptsTotal + shippingEstimate;

      // Calculate 50% deposit
      const depositAmount = Math.ceil(total * 0.5);

      // Validity date (default 3 days)
      const validityDays = quoteData.validityDays || 3;
      const validUntil = new Date(now);
      validUntil.setDate(validUntil.getDate() + validityDays);

      const filename = `cotizacion-${quoteNumber}-${Date.now()}.pdf`;
      const outputDir = quoteData.outputDir || QUOTES_DIR;
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const filepath = path.join(outputDir, filename);

      // Create PDF document — Monolito design with multi-page support
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 40, bottom: 15, left: 55, right: 55 },
        autoFirstPage: false
      });

      // Register official AXKAN fonts
      if (fs.existsSync(ASSETS.fontTitle)) doc.registerFont('Title', ASSETS.fontTitle);
      if (fs.existsSync(ASSETS.fontBody)) doc.registerFont('Body', ASSETS.fontBody);

      const titleFont = fs.existsSync(ASSETS.fontTitle) ? 'Title' : 'Helvetica-Bold';
      const bodyFont = fs.existsSync(ASSETS.fontBody) ? 'Body' : 'Helvetica';

      const pw = 612;   // LETTER width
      const ph = 792;   // LETTER height
      const ml = 55;
      const cw = pw - ml - 55;
      const segW = pw / BAND.length;

      const FOOTER_ZONE = 40;
      const PAGE_BOTTOM = ph - FOOTER_ZONE;
      const CONT_TOP = 30;

      // Pipe to file
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // ── Page chrome helpers
      function drawTopBand() {
        for (let i = 0; i < BAND.length; i++) {
          doc.rect(segW * i, 0, segW + 1, 5).fill(BAND[i]);
        }
      }
      function drawFooter() {
        const fY = ph - 20;
        for (let i = 0; i < BAND.length; i++) {
          doc.rect(segW * i, fY, segW + 1, 4).fill(BAND[i]);
        }
        doc.font(bodyFont).fontSize(6).fillColor('#B0B0B0')
           .text('axkan.art   •   55 3825 3251   •   informacion@axkan.art', ml, fY - 11, { width: cw, align: 'center', lineBreak: false });
      }
      function newPage() {
        doc.addPage({ size: 'LETTER', margins: { top: 40, bottom: 15, left: 55, right: 55 } });
        drawTopBand();
        drawFooter();
      }
      function ensureSpace(y, needed) {
        if (y + needed > PAGE_BOTTOM) { newPage(); return CONT_TOP; }
        return y;
      }

      // Table column positions
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
        doc.moveTo(ml + 4, lineY).lineTo(ml + cw - 4, lineY).lineWidth(0.4).strokeColor(COLORS.pink).opacity(0.2).stroke();
        doc.opacity(1);
        return lineY + 10;
      }

      // Track items with special prices for notes
      const specialPriceItems = validItems.filter(item => item.isSpecialPrice);

      // ══════════════════════════════════════════
      // PAGE 1 — Header
      // ══════════════════════════════════════════
      newPage();
      let y = 16;

      // Logo
      if (fs.existsSync(ASSETS.logo)) {
        try { doc.image(ASSETS.logo, (pw - 160) / 2, y, { fit: [160, 56], align: 'center' }); }
        catch (err) { console.log('Could not load logo:', err.message); }
      }
      y += 80;

      // Tagline pill
      const tagW = 210;
      const tagX = (pw - tagW) / 2;
      doc.roundedRect(tagX, y, tagW, 14, 7).fill(COLORS.pinkPale);
      doc.font(bodyFont).fontSize(5.5).fillColor(COLORS.pink)
         .text('RECUERDOS HECHOS SOUVENIR', ml, y + 3, { width: cw, align: 'center', characterSpacing: 2 });
      y += 34;

      // Quote number + date
      doc.font(bodyFont).fontSize(7.5).fillColor('#B0B0B0')
         .text(`${quoteNumber}   •   ${formatDate(now)}   •   Vigencia: ${formatDate(validUntil)}`, ml, y, { width: cw, align: 'center' });
      y += 32;

      // Client card
      if (quoteData.clientName) {
        const cardH = 34;
        const cardW = 230;
        const cardX = (pw - cardW) / 2;
        doc.roundedRect(cardX, y, cardW, cardH, 6).fill('#F6F6F6');
        doc.roundedRect(cardX, y + 5, 3, cardH - 10, 1.5).fill(COLORS.pink);
        doc.font(bodyFont).fontSize(6).fillColor('#B0B0B0')
           .text('CLIENTE', cardX + 14, y + 6);
        doc.font(bodyFont).fontSize(10).fillColor('#505050')
           .text(quoteData.clientName, cardX + 14, y + 18);
        y += cardH + 34;
      }

      // Diamond divider
      const rW = cw * 0.45;
      const rxS = ml + (cw - rW) / 2;
      doc.moveTo(rxS, y).lineTo(pw / 2 - 6, y).lineWidth(0.3).strokeColor('#E0E0E0').stroke();
      doc.moveTo(pw / 2 + 6, y).lineTo(rxS + rW, y).lineWidth(0.3).strokeColor('#E0E0E0').stroke();
      doc.save();
      doc.translate(pw / 2, y).rotate(45);
      doc.rect(-2, -2, 4, 4).fill(COLORS.pink);
      doc.restore();
      y += 26;

      // "PRODUCTOS" title
      doc.moveTo(ml + 40, y + 4).lineTo(pw / 2 - 42, y + 4).lineWidth(0.3).strokeColor('#E0E0E0').stroke();
      doc.moveTo(pw / 2 + 42, y + 4).lineTo(ml + cw - 40, y + 4).lineWidth(0.3).strokeColor('#E0E0E0').stroke();
      doc.font(titleFont).fontSize(8).fillColor('#505050')
         .text('PRODUCTOS', ml, y, { width: cw, align: 'center', characterSpacing: 2 });
      y += 26;

      // ── Table header
      y = drawTableHeader(y);

      // ── Product rows with page breaks
      const rowH = 28;
      for (let i = 0; i < validItems.length; i++) {
        const item = validItems[i];
        if (y + rowH > PAGE_BOTTOM) { newPage(); y = CONT_TOP; y = drawTableHeader(y); }

        if (i % 2 === 0) {
          doc.roundedRect(ml + 2, y - 3, cw - 4, rowH, 3).fill('#F6F6F6');
        }
        const displayName = item.isSpecialPrice ? `* ${item.productName}` : item.productName;
        doc.font(bodyFont).fontSize(9).fillColor(item.isSpecialPrice ? COLORS.pinkDeep : '#505050')
           .text(displayName, cN, y + 3, { width: 220 });
        doc.font(bodyFont).fontSize(8.5).fillColor('#808080')
           .text(item.quantity.toLocaleString('es-MX') + ' pzas', cQ, y + 3);
        doc.font(bodyFont).fontSize(8.5).fillColor('#808080')
           .text(formatCurrency(item.unitPrice), cP, y + 3);
        doc.font(titleFont).fontSize(9).fillColor('#505050')
           .text(formatCurrency(item.subtotal), cS - 75, y + 2, { width: 75, align: 'right' });
        y += rowH;
      }

      // Special quote items (price TBD)
      for (const item of specialQuoteItems) {
        if (y + rowH > PAGE_BOTTOM) { newPage(); y = CONT_TOP; y = drawTableHeader(y); }
        doc.font(bodyFont).fontSize(9).fillColor('#B0B0B0')
           .text(item.productName, cN, y + 3, { width: 220 });
        doc.font(bodyFont).fontSize(8.5).fillColor('#B0B0B0')
           .text(item.quantity.toLocaleString('es-MX') + ' pzas', cQ, y + 3);
        doc.font(bodyFont).fontSize(8.5).fillColor(COLORS.orange)
           .text('Por cotizar', cP, y + 3);
        doc.font(bodyFont).fontSize(8.5).fillColor(COLORS.orange)
           .text('—', cS - 75, y + 3, { width: 75, align: 'right' });
        y += rowH;
      }

      // Invalid items (below minimum)
      if (invalidItems.length > 0) {
        y = ensureSpace(y, 15 + invalidItems.length * 13);
        y += 6;
        doc.font(bodyFont).fontSize(7.5).fillColor(COLORS.orange);
        doc.text('Los siguientes productos están por debajo del mínimo:', ml + 6, y);
        y += 13;
        for (const item of invalidItems) {
          doc.font(bodyFont).fontSize(8).fillColor(COLORS.orange);
          doc.text(`${item.productName}: ${item.quantity} pzas (mínimo ${item.minimumRequired})`, ml + 14, y);
          y += 13;
        }
      }

      // Extra concepts (urgency, special design, discounts, etc.)
      for (const ec of extraConcepts) {
        if (y + rowH > PAGE_BOTTOM) { newPage(); y = CONT_TOP; y = drawTableHeader(y); }
        const isDiscount = ec.amount < 0;
        const conceptColor = isDiscount ? COLORS.green : COLORS.orange;
        doc.font(bodyFont).fontSize(9).fillColor(conceptColor)
           .text(ec.concept, cN, y + 3, { width: 280 });
        doc.font(titleFont).fontSize(9).fillColor(conceptColor)
           .text(formatCurrency(Math.abs(ec.amount)), cS - 75, y + 2, { width: 75, align: 'right' });
        y += rowH;
      }

      // Shipping line
      if (shippingEstimate > 0) {
        if (y + 22 > PAGE_BOTTOM) { newPage(); y = CONT_TOP; }
        y += 4;
        doc.font(bodyFont).fontSize(8.5).fillColor('#B0B0B0')
           .text('Envío (estimado)', cN, y + 2);
        doc.font(titleFont).fontSize(9).fillColor('#505050')
           .text(formatCurrency(shippingEstimate), cS - 75, y + 1, { width: 75, align: 'right' });
        y += 22;
      }

      y += 24;

      // ══════════════════════════════════════════
      // TOTALS + BOTTOM SECTIONS (~250px needed)
      // ══════════════════════════════════════════
      y = ensureSpace(y, 250);

      // Totals card
      const totCardW = 230;
      const totCardX = ml + cw - totCardW;
      const totCardH = (freeShipping ? 108 : 90) + (extraConcepts.length * 20);
      doc.roundedRect(totCardX, y, totCardW, totCardH, 8).fill('#F6F6F6');

      let ty = y + 10;
      const tL = totCardX + 16;
      const tR = totCardX + totCardW - 16;

      if (freeShipping) {
        const pillW = 140;
        const pillX = totCardX + (totCardW - pillW) / 2;
        doc.roundedRect(pillX, ty - 1, pillW, 14, 7).fill('#F1F8E9');
        doc.font(bodyFont).fontSize(7).fillColor(COLORS.green)
           .text('Envío gratis incluido', totCardX, ty + 1, { width: totCardW, align: 'center' });
        ty += 20;
      }

      doc.font(bodyFont).fontSize(8.5).fillColor('#808080').text('Subtotal', tL, ty);
      doc.font(bodyFont).fontSize(8.5).fillColor('#505050')
         .text(formatCurrency(subtotal), tL, ty, { width: tR - tL, align: 'right' });
      ty += 20;

      for (const ec of extraConcepts) {
        const isDiscount = ec.amount < 0;
        const ecColor = isDiscount ? COLORS.green : COLORS.orange;
        doc.font(bodyFont).fontSize(8.5).fillColor(ecColor).text(ec.concept, tL, ty);
        doc.font(bodyFont).fontSize(8.5).fillColor(ecColor)
           .text((isDiscount ? '-' : '+') + formatCurrency(Math.abs(ec.amount)), tL, ty, { width: tR - tL, align: 'right' });
        ty += 20;
      }

      if (shippingEstimate > 0) {
        doc.font(bodyFont).fontSize(8.5).fillColor('#808080').text('Envío', tL, ty);
        doc.font(bodyFont).fontSize(8.5).fillColor('#505050')
           .text(formatCurrency(shippingEstimate), tL, ty, { width: tR - tL, align: 'right' });
        ty += 20;
      }

      doc.font(titleFont).fontSize(16).fillColor(COLORS.pink).text('TOTAL', tL, ty);
      doc.font(titleFont).fontSize(16).fillColor(COLORS.pink)
         .text(formatCurrency(total), tL, ty, { width: tR - tL, align: 'right' });
      ty += 24;

      doc.font(bodyFont).fontSize(8).fillColor(COLORS.orange).text('Anticipo 50%', tL, ty);
      doc.font(titleFont).fontSize(10).fillColor(COLORS.orange)
         .text(formatCurrency(depositAmount), tL, ty, { width: tR - tL, align: 'right' });

      y += totCardH + 24;

      // Volume pricing box (cyan border)
      const volH = 30;
      doc.roundedRect(ml, y, cw, volH, 5).lineWidth(0.5).strokeColor(COLORS.cyan).opacity(0.35).stroke();
      doc.opacity(1);
      doc.font(titleFont).fontSize(6).fillColor(COLORS.cyan)
         .text('PRECIOS POR VOLUMEN', ml + 10, y + 5);
      doc.font(bodyFont).fontSize(5.5).fillColor('#808080')
         .text('Imanes: Ch $8/$6 • Med $11/$8 • Gde/3D/Foil $15/$12  |  Llaveros $10/$7  |  Destapadores $20/$17/$15  |  Portallaves/Portarretratos $40  |  Box $2,250', ml + 10, y + 17, { width: cw - 20 });
      y += volH + 20;

      // Notes
      const notesLines = [];
      if (specialPriceItems.length > 0) {
        notesLines.push(`* Precios especiales aplicados: ${specialPriceItems.map(i => `${i.productName} ${formatCurrency(i.unitPrice)}`).join(', ')}.`);
      }
      if (specialQuoteItems.length > 0) {
        notesLines.push(`${specialQuoteItems.map(i => `${i.productName} (${i.quantity.toLocaleString('es-MX')} pzas)`).join(', ')} requiere precio especial — contactar para cotización.`);
      }
      if (quoteData.notes) notesLines.push(quoteData.notes);

      if (notesLines.length > 0) {
        doc.font(bodyFont).fontSize(7).fillColor('#808080')
           .text(notesLines.join(' '), ml, y, { width: cw, align: 'center' });
        y += 18;
      }

      // Terms
      doc.font(bodyFont).fontSize(5.5).fillColor('#B0B0B0')
         .text(`Vigencia: ${validityDays} días  •  Precios en MXN, no incluyen IVA  •  Anticipo 50% para iniciar  •  Producción 5–7 días hábiles  •  Envío gratis 300+ pzas`, ml, y, { width: cw, align: 'center' });

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
          specialQuoteItems,
          extraConcepts
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
      { name: 'Imanes MDF Chico', minQty: 100, prices: [{ qty: '100-999', price: 8 }, { qty: '1000+', price: 6 }] },
      { name: 'Imanes MDF Mediano', minQty: 100, prices: [{ qty: '100-999', price: 11 }, { qty: '1000+', price: 8 }] },
      { name: 'Imanes MDF Grande', minQty: 100, prices: [{ qty: '100-999', price: 15 }, { qty: '1000+', price: 12 }] },
      { name: 'Imanes 3D', minQty: 100, prices: [{ qty: '100-999', price: 15 }, { qty: '1000+', price: 12 }] },
      { name: 'Imanes Foil Metálico', minQty: 100, prices: [{ qty: '100-999', price: 15 }, { qty: '1000+', price: 12 }] },
      { name: 'Llaveros MDF', minQty: 100, prices: [{ qty: '100-999', price: 10 }, { qty: '1000+', price: 7 }] },
      { name: 'Destapadores MDF', minQty: 100, prices: [{ qty: '100-499', price: 20 }, { qty: '500-999', price: 17 }, { qty: '1000+', price: 15 }] },
      { name: 'Portallaves MDF', minQty: 20, prices: [{ qty: '20+', price: 40 }] },
      { name: 'Portarretratos MDF', minQty: 20, prices: [{ qty: '20+', price: 40 }] },
      { name: 'Souvenir Box', minQty: 1, prices: [{ qty: '1+', price: 2250 }] },
      { name: 'Botones Metálicos', minQty: 100, prices: [{ qty: '100-999', price: 8 }, { qty: '1000+', price: 6 }] }
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
