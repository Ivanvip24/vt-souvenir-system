/**
 * Product Catalog / Price List PDF Generator
 * Generates a professional AXKAN-branded product catalog with all prices and wholesale tiers
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure catalogs directory exists
const CATALOGS_DIR = path.join(__dirname, '../catalogs');
if (!fs.existsSync(CATALOGS_DIR)) {
  fs.mkdirSync(CATALOGS_DIR, { recursive: true });
}

// AXKAN Brand Colors (same as quote-generator.js)
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
  infoBlue: '#2563eb',
  white: '#ffffff'
};

// Logo path
const LOGO_PATH = path.join(__dirname, '../../frontend/assets/images/LOGO-01.png');

// Complete product catalog data
const CATALOG_PRODUCTS = [
  {
    name: 'Imanes de MDF',
    description: 'Imanes personalizados de MDF con corte láser. Disponibles en 3 tamaños.',
    imageUrl: 'https://vtanunciando.com/cdn/shop/files/IMAGENES-IMANES-3.jpg?crop=center&height=600&v=1727106231&width=600',
    category: 'Más Populares',
    hasSizes: true,
    sizes: [
      { label: 'Chico', tiers: [{ range: '50-999', price: 8 }, { range: '1,000+', price: 6 }] },
      { label: 'Mediano', tiers: [{ range: '50-999', price: 11 }, { range: '1,000+', price: 8 }] },
      { label: 'Grande', tiers: [{ range: '50-999', price: 15 }, { range: '1,000+', price: 12 }] }
    ],
    moq: 50
  },
  {
    name: 'Llaveros de MDF',
    description: 'Llaveros personalizados de MDF. Ideales para eventos y souvenirs.',
    imageUrl: 'https://vtanunciando.com/cdn/shop/files/mockup-llavero.png?crop=center&height=600&v=1744307278&width=600',
    category: 'Más Populares',
    tiers: [{ range: '50-999', price: 10 }, { range: '1,000+', price: 8 }],
    moq: 50
  },
  {
    name: 'Imán 3D MDF 3mm',
    description: 'Imanes 3D de MDF de 3mm de espesor. Efecto tridimensional único.',
    imageUrl: 'https://vtanunciando.com/cdn/shop/files/tamasopo.png?crop=center&height=600&v=1755714542&width=600',
    category: 'Especialidad',
    tiers: [{ range: '100-999', price: 15 }, { range: '1,000+', price: 12 }],
    moq: 100
  },
  {
    name: 'Imán de MDF con Foil',
    description: 'Imanes de MDF con acabado foil metálico brillante.',
    imageUrl: 'https://vtanunciando.com/cdn/shop/files/IMAN-FOIL-MOCKUP---vtweb.png?crop=center&height=600&v=1744331653&width=600',
    category: 'Especialidad',
    tiers: [{ range: '100-999', price: 15 }, { range: '1,000+', price: 12 }],
    moq: 100
  },
  {
    name: 'Destapadores de MDF',
    description: 'Destapadores personalizados de MDF. Funcionales y decorativos.',
    imageUrl: 'https://vtanunciando.com/cdn/shop/files/DESTAPADOR---VTWEB.png?crop=center&height=600&v=1741044542&width=600',
    category: 'Más Populares',
    tiers: [{ range: '50-499', price: 20 }, { range: '500-999', price: 17 }, { range: '1,000+', price: 15 }],
    moq: 50
  },
  {
    name: 'Botones Metálicos',
    description: 'Botones metálicos personalizados con impresión de alta resolución.',
    imageUrl: 'https://vtanunciando.com/cdn/shop/files/fotobotones.png?crop=center&height=600&v=1741017071&width=600',
    category: 'Más Populares',
    tiers: [{ range: '50-999', price: 8 }, { range: '1,000+', price: 6 }],
    moq: 50
  },
  {
    name: 'Portallaves de MDF',
    description: 'Portallaves de pared de MDF personalizado. Decorativo y funcional.',
    imageUrl: 'https://vtanunciando.com/cdn/shop/files/PORTALLAVES-VTWEB.png?crop=center&height=600&v=1736017105&width=600',
    category: 'Decoración',
    tiers: [{ range: '20+', price: 40 }],
    moq: 20
  },
  {
    name: 'Souvenir Box',
    description: 'Paquete completo de souvenirs personalizados. Bundle especial premium.',
    imageUrl: 'https://vtanunciando.com/cdn/shop/files/final-bundle-vtweb2.png?crop=center&height=600&v=1740866952&width=600',
    category: 'Paquetes',
    tiers: [{ range: '1+', price: 2250 }],
    moq: 1
  }
];

// Image download cache
const imageCache = new Map();

/**
 * Download image from URL and return as buffer (with cache)
 */
async function downloadImage(url) {
  if (imageCache.has(url)) return imageCache.get(url);

  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadImage(response.headers.location).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
        return;
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        imageCache.set(url, buffer);
        resolve(buffer);
      });
      response.on('error', reject);
    });

    request.on('error', reject);
    request.setTimeout(10000, () => {
      request.destroy();
      reject(new Error('Image download timeout'));
    });
  });
}

// Simple file-level cache (24 hours)
let cachedCatalog = { filepath: null, timestamp: 0 };
const CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * Generate a product catalog/price list PDF
 * @param {Object} options
 * @param {boolean} options.forceRegenerate - Bypass cache and regenerate
 * @returns {Promise<{filepath, filename, productCount, generatedAt, cached}>}
 */
export async function generateCatalogPDF(options = {}) {
  // Check cache
  if (!options.forceRegenerate && cachedCatalog.filepath
      && fs.existsSync(cachedCatalog.filepath)
      && (Date.now() - cachedCatalog.timestamp) < CACHE_TTL) {
    return {
      filepath: cachedCatalog.filepath,
      filename: path.basename(cachedCatalog.filepath),
      productCount: CATALOG_PRODUCTS.length,
      generatedAt: new Date(cachedCatalog.timestamp).toISOString(),
      cached: true
    };
  }

  // Download all product images in parallel
  console.log('📸 Downloading product images for catalog...');
  const imageResults = await Promise.allSettled(
    CATALOG_PRODUCTS.map(p => downloadImage(p.imageUrl))
  );

  const productImages = {};
  CATALOG_PRODUCTS.forEach((product, i) => {
    if (imageResults[i].status === 'fulfilled') {
      productImages[product.name] = imageResults[i].value;
    } else {
      console.warn(`⚠️ Could not download image for ${product.name}: ${imageResults[i].reason?.message}`);
    }
  });

  const now = new Date();
  const filename = `catalogo-axkan-${Date.now()}.pdf`;
  const filepath = path.join(CATALOGS_DIR, filename);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      const pageWidth = doc.page.width;
      const contentWidth = pageWidth - 100; // 50px margins each side

      // ========================================
      // PAGE 1: COVER
      // ========================================
      drawCoverPage(doc, now, pageWidth);

      // ========================================
      // PAGE 2+: PRODUCT LISTINGS
      // ========================================
      doc.addPage();
      let yPos = 50;

      // Page title
      yPos = drawPageHeader(doc, 'NUESTROS PRODUCTOS', pageWidth);

      for (let i = 0; i < CATALOG_PRODUCTS.length; i++) {
        const product = CATALOG_PRODUCTS[i];
        const imageBuffer = productImages[product.name] || null;

        // Calculate card height
        const cardHeight = product.hasSizes ? 200 : 150;

        // Check if we need a new page
        if (yPos + cardHeight > doc.page.height - 80) {
          drawFooter(doc, pageWidth);
          doc.addPage();
          yPos = drawPageHeader(doc, 'NUESTROS PRODUCTOS', pageWidth);
        }

        yPos = drawProductCard(doc, product, imageBuffer, yPos, contentWidth);
        yPos += 15; // spacing between cards
      }

      // ========================================
      // FINAL SECTION: TERMS & INFO
      // ========================================
      // Check if enough space, otherwise new page
      if (yPos + 280 > doc.page.height - 50) {
        drawFooter(doc, pageWidth);
        doc.addPage();
        yPos = 50;
      }

      yPos = drawInfoSection(doc, yPos, contentWidth);
      yPos = drawContactSection(doc, yPos, contentWidth, now);

      drawFooter(doc, pageWidth);

      // Finalize
      doc.end();

      stream.on('finish', () => {
        console.log(`✅ Catalog PDF generated: ${filename}`);

        // Update cache
        cachedCatalog = { filepath, timestamp: Date.now() };

        resolve({
          filepath,
          filename,
          productCount: CATALOG_PRODUCTS.length,
          generatedAt: now.toISOString(),
          cached: false
        });
      });

      stream.on('error', (error) => {
        console.error('❌ Error writing catalog PDF:', error);
        reject(error);
      });

    } catch (error) {
      console.error('❌ Error generating catalog PDF:', error);
      reject(error);
    }
  });
}

/**
 * Draw the cover page
 */
function drawCoverPage(doc, now, pageWidth) {
  // Full pink header block
  const headerHeight = 180;
  doc.rect(0, 0, pageWidth, headerHeight)
     .fillAndStroke(COLORS.pinkMedium, COLORS.pinkMedium);

  // Lighter overlay
  doc.rect(0, 0, pageWidth, headerHeight / 2)
     .fillOpacity(0.3)
     .fill(COLORS.pinkLight);
  doc.fillOpacity(1);

  // Logo
  const logoSize = 90;
  const logoX = pageWidth - 50 - logoSize;
  if (fs.existsSync(LOGO_PATH)) {
    try {
      doc.image(LOGO_PATH, logoX, 45, { height: logoSize });
    } catch (err) {
      console.log('Could not load logo:', err.message);
    }
  }

  // Title text
  doc.fontSize(38)
     .font('Helvetica-Bold')
     .fillColor(COLORS.white)
     .text('Axkan', 50, 40, { width: 400 });

  doc.fontSize(14)
     .font('Helvetica')
     .fillColor('#FCE4EC')
     .text('Souvenirs Personalizados', 50, 85);

  doc.fontSize(22)
     .font('Helvetica-Bold')
     .fillColor(COLORS.white)
     .text('CATÁLOGO DE PRODUCTOS', 50, 120);

  doc.fontSize(14)
     .font('Helvetica')
     .fillColor('#FCE4EC')
     .text('Y PRECIOS DE MAYOREO', 50, 148);

  // Content area below header
  doc.fillColor(COLORS.textDark);
  let y = headerHeight + 50;

  // Date badge
  doc.roundedRect(50, y, 250, 30, 5)
     .fillAndStroke(COLORS.pinkPale, COLORS.pinkAccent);

  doc.fontSize(11)
     .font('Helvetica-Bold')
     .fillColor(COLORS.pinkDark)
     .text(`Precios vigentes: ${formatDate(now)}`, 60, y + 8);

  y += 55;

  // Company description
  doc.fontSize(12)
     .font('Helvetica')
     .fillColor(COLORS.textDark)
     .text('En AXKAN nos especializamos en la producción de souvenirs personalizados de alta calidad para destinos turísticos, eventos y negocios en toda la República Mexicana.', 50, y, { width: 510, lineGap: 4 });

  y += 60;

  doc.fontSize(11)
     .fillColor(COLORS.textGray)
     .text('Todos nuestros productos son personalizables con tu diseño, logo o imagen. Fabricados con materiales de primera calidad y acabados profesionales.', 50, y, { width: 510, lineGap: 3 });

  y += 60;

  // Highlights row
  const highlights = [
    { icon: '✓', text: 'Personalización total' },
    { icon: '✓', text: 'Envío a todo México' },
    { icon: '✓', text: 'Producción: 5-7 días' },
    { icon: '✓', text: 'Precios de mayoreo' }
  ];

  doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.successGreen);
  const colWidth = 127;
  highlights.forEach((h, i) => {
    doc.text(`${h.icon} ${h.text}`, 50 + (i * colWidth), y, { width: colWidth });
  });

  y += 35;

  // Quick summary table
  doc.roundedRect(50, y, 510, 170, 8)
     .fillAndStroke(COLORS.pinkPale, COLORS.pinkAccent);

  y += 12;
  doc.fontSize(13)
     .font('Helvetica-Bold')
     .fillColor(COLORS.pinkDark)
     .text('RESUMEN DE PRECIOS', 70, y);

  y += 25;
  doc.fontSize(9).font('Helvetica').fillColor(COLORS.textDark);

  // Quick reference table header
  doc.font('Helvetica-Bold').fillColor(COLORS.pinkDark);
  doc.text('Producto', 70, y);
  doc.text('Precio Regular', 280, y);
  doc.text('Mayoreo (1,000+)', 400, y);
  y += 18;

  // Divider
  doc.moveTo(70, y - 3).lineTo(540, y - 3).lineWidth(0.5).stroke(COLORS.pinkAccent);

  doc.font('Helvetica').fontSize(9).fillColor(COLORS.textDark);
  const summaryRows = [
    ['Imanes MDF (Chico)', '$8.00', '$6.00'],
    ['Imanes MDF (Mediano)', '$11.00', '$8.00'],
    ['Imanes MDF (Grande)', '$15.00', '$12.00'],
    ['Llaveros MDF', '$10.00', '$8.00'],
    ['Destapadores MDF', '$20.00', '$15.00'],
    ['Botones Metálicos', '$8.00', '$6.00'],
    ['Portallaves MDF', '$40.00', '—'],
    ['Souvenir Box', '$2,250.00', '—']
  ];

  summaryRows.forEach(row => {
    doc.fillColor(COLORS.textDark).text(row[0], 70, y, { width: 200 });
    doc.text(row[1], 280, y, { width: 100 });
    doc.fillColor(row[2] !== '—' ? COLORS.successGreen : COLORS.textGray);
    doc.font(row[2] !== '—' ? 'Helvetica-Bold' : 'Helvetica');
    doc.text(row[2], 400, y, { width: 120 });
    doc.font('Helvetica').fillColor(COLORS.textDark);
    y += 15;
  });
}

/**
 * Draw page header for product pages
 */
function drawPageHeader(doc, title, pageWidth) {
  // Thin pink bar at top
  doc.rect(0, 0, pageWidth, 6)
     .fill(COLORS.pinkMedium);

  doc.fontSize(16)
     .font('Helvetica-Bold')
     .fillColor(COLORS.pinkDark)
     .text(title, 50, 20);

  // Thin divider
  doc.moveTo(50, 42).lineTo(pageWidth - 50, 42).lineWidth(1).stroke(COLORS.pinkAccent);

  return 55; // return y position after header
}

/**
 * Draw a single product card
 */
function drawProductCard(doc, product, imageBuffer, startY, contentWidth) {
  const cardX = 50;
  const imageSize = 90;
  const textX = cardX + imageSize + 20;
  const textWidth = contentWidth - imageSize - 20;

  let y = startY;

  // Light background for the card
  const cardHeight = product.hasSizes ? 185 : 135;
  doc.roundedRect(cardX, y - 5, contentWidth, cardHeight, 6)
     .fillAndStroke('#fafafa', '#e5e7eb');

  // Product image
  if (imageBuffer) {
    try {
      doc.image(imageBuffer, cardX + 10, y + 5, { width: imageSize - 20, height: imageSize - 20, fit: [imageSize - 20, imageSize - 20] });
    } catch (err) {
      // Fallback: colored rectangle
      doc.roundedRect(cardX + 10, y + 5, imageSize - 20, imageSize - 20, 4)
         .fill(COLORS.pinkPale);
      doc.fontSize(8).fillColor(COLORS.pinkDark).text(product.name, cardX + 12, y + 35, { width: imageSize - 24, align: 'center' });
    }
  } else {
    doc.roundedRect(cardX + 10, y + 5, imageSize - 20, imageSize - 20, 4)
       .fill(COLORS.pinkPale);
    doc.fontSize(8).fillColor(COLORS.pinkDark).text(product.name, cardX + 12, y + 35, { width: imageSize - 24, align: 'center' });
  }

  // Product name
  doc.fontSize(13)
     .font('Helvetica-Bold')
     .fillColor(COLORS.pinkDark)
     .text(product.name, textX, y + 3, { width: textWidth });

  // Category badge
  const catBadgeX = textX + doc.widthOfString(product.name, { font: 'Helvetica-Bold', fontSize: 13 }) + 10;
  if (catBadgeX < textX + textWidth - 80) {
    doc.fontSize(7)
       .font('Helvetica')
       .fillColor(COLORS.pinkMedium)
       .text(product.category, catBadgeX, y + 6);
  }

  // Description
  doc.fontSize(9)
     .font('Helvetica')
     .fillColor(COLORS.textGray)
     .text(product.description, textX, y + 22, { width: textWidth, lineGap: 2 });

  // MOQ badge
  doc.fontSize(8)
     .font('Helvetica-Bold')
     .fillColor(COLORS.warningOrange)
     .text(`Mín. ${product.moq} pzas`, textX, y + 42);

  // Pricing table
  let tableY = y + 58;

  // Table header
  const tableX = textX;
  const priceTableWidth = textWidth;

  if (product.hasSizes) {
    // Multi-size table (for Imanes)
    doc.roundedRect(tableX, tableY - 3, priceTableWidth, 18, 3)
       .fill(COLORS.pinkPale);

    doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.pinkDark);
    doc.text('Tamaño', tableX + 5, tableY + 2);
    doc.text('Cantidad', tableX + 100, tableY + 2);
    doc.text('Precio/Unidad', tableX + 200, tableY + 2);
    doc.text('Mayoreo', tableX + 310, tableY + 2);

    tableY += 20;
    doc.fontSize(9).font('Helvetica');

    product.sizes.forEach((size, sizeIdx) => {
      if (sizeIdx > 0) {
        doc.moveTo(tableX, tableY - 2).lineTo(tableX + priceTableWidth, tableY - 2).lineWidth(0.3).stroke('#e5e7eb');
      }

      doc.fillColor(COLORS.textDark).font('Helvetica-Bold');
      doc.text(size.label, tableX + 5, tableY);

      doc.font('Helvetica').fillColor(COLORS.textGray);
      doc.text(size.tiers[0].range + ' pzas', tableX + 100, tableY);

      doc.fillColor(COLORS.textDark);
      doc.text(formatCurrency(size.tiers[0].price), tableX + 200, tableY);

      if (size.tiers.length > 1) {
        doc.fillColor(COLORS.successGreen).font('Helvetica-Bold');
        doc.text(formatCurrency(size.tiers[1].price) + '/u', tableX + 310, tableY);
      }

      tableY += 17;
    });

    return tableY + 5;
  } else {
    // Standard single-product table
    doc.roundedRect(tableX, tableY - 3, priceTableWidth, 18, 3)
       .fill(COLORS.pinkPale);

    doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.pinkDark);
    doc.text('Cantidad', tableX + 5, tableY + 2);
    doc.text('Precio por Unidad', tableX + 150, tableY + 2);

    tableY += 20;
    doc.fontSize(9);

    product.tiers.forEach((tier, tierIdx) => {
      if (tierIdx > 0) {
        doc.moveTo(tableX, tableY - 2).lineTo(tableX + priceTableWidth, tableY - 2).lineWidth(0.3).stroke('#e5e7eb');
      }

      doc.font('Helvetica').fillColor(COLORS.textGray);
      doc.text(tier.range + ' pzas', tableX + 5, tableY);

      const isLastTier = tierIdx === product.tiers.length - 1 && product.tiers.length > 1;
      if (isLastTier) {
        doc.fillColor(COLORS.successGreen).font('Helvetica-Bold');
        doc.text(formatCurrency(tier.price) + '/u  ★ Mayoreo', tableX + 150, tableY);
      } else {
        doc.fillColor(COLORS.textDark).font('Helvetica');
        doc.text(formatCurrency(tier.price) + '/u', tableX + 150, tableY);
      }

      tableY += 17;
    });

    return tableY + 5;
  }
}

/**
 * Draw the info/terms section
 */
function drawInfoSection(doc, startY, contentWidth) {
  let y = startY;

  // Section title
  doc.fontSize(14)
     .font('Helvetica-Bold')
     .fillColor(COLORS.pinkDark)
     .text('INFORMACIÓN IMPORTANTE', 50, y);

  y += 25;

  // Shipping box
  doc.roundedRect(50, y, contentWidth, 55, 5)
     .fillAndStroke(COLORS.successBg, COLORS.successGreen);

  doc.fontSize(11)
     .font('Helvetica-Bold')
     .fillColor(COLORS.successGreen)
     .text('🚚 ENVÍO', 65, y + 8);

  doc.fontSize(9).font('Helvetica').fillColor(COLORS.textDark);
  doc.text('• Envío GRATIS en pedidos de 300+ piezas', 65, y + 25);
  doc.text('• Envío estándar: $210 MXN para pedidos menores', 65, y + 38);

  y += 70;

  // Production box
  doc.roundedRect(50, y, contentWidth, 55, 5)
     .fillAndStroke(COLORS.infoBlueBg, COLORS.infoBlue);

  doc.fontSize(11)
     .font('Helvetica-Bold')
     .fillColor(COLORS.infoBlue)
     .text('⏱ PRODUCCIÓN', 65, y + 8);

  doc.fontSize(9).font('Helvetica').fillColor(COLORS.textDark);
  doc.text('• Tiempo de producción: 5-7 días hábiles después del anticipo', 65, y + 25);
  doc.text('• Todos los productos incluyen personalización con tu diseño', 65, y + 38);

  y += 70;

  // Payment terms box
  doc.roundedRect(50, y, contentWidth, 55, 5)
     .fillAndStroke(COLORS.warningBg, COLORS.warningOrange);

  doc.fontSize(11)
     .font('Helvetica-Bold')
     .fillColor(COLORS.warningOrange)
     .text('💰 FORMA DE PAGO', 65, y + 8);

  doc.fontSize(9).font('Helvetica').fillColor(COLORS.textDark);
  doc.text('• Anticipo del 50% para iniciar producción', 65, y + 25);
  doc.text('• Precios en pesos mexicanos (MXN), no incluyen IVA', 65, y + 38);

  y += 70;

  return y;
}

/**
 * Draw the contact section
 */
function drawContactSection(doc, startY, contentWidth, now) {
  let y = startY;

  // Contact box
  doc.roundedRect(50, y, contentWidth, 70, 8)
     .fillAndStroke(COLORS.pinkPale, COLORS.pinkMedium);

  doc.fontSize(13)
     .font('Helvetica-Bold')
     .fillColor(COLORS.pinkDark)
     .text('¿LISTO PARA HACER TU PEDIDO?', 70, y + 10);

  doc.fontSize(10).font('Helvetica').fillColor(COLORS.textDark);
  doc.text('📱 WhatsApp: 55 3825 3251', 70, y + 32);
  doc.text('📧 Email: informacion@axkan.art', 70, y + 47);
  doc.text('🌐 vtanunciando.com', 300, y + 32);

  y += 85;

  // Generated date
  doc.fontSize(7)
     .fillColor(COLORS.textGray)
     .text(`Catálogo generado el ${formatDate(now)} | Precios sujetos a cambio sin previo aviso`, 50, y, { align: 'center', width: contentWidth });

  return y + 15;
}

/**
 * Draw footer on current page
 */
function drawFooter(doc, pageWidth) {
  const footerY = doc.page.height - 35;

  doc.moveTo(50, footerY).lineTo(pageWidth - 50, footerY).lineWidth(0.5).stroke(COLORS.pinkAccent);

  doc.fontSize(7)
     .font('Helvetica')
     .fillColor(COLORS.textGray)
     .text('AXKAN | Souvenirs Personalizados | vtanunciando.com | WhatsApp: 55 3825 3251', 50, footerY + 5, {
       width: pageWidth - 100,
       align: 'center'
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
 * Get the URL path for a catalog file
 */
export function getCatalogUrl(filepath) {
  const filename = path.basename(filepath);
  const relativePath = `/catalogs/${filename}`;

  const backendUrl = process.env.BACKEND_URL
    || process.env.RENDER_EXTERNAL_URL
    || (process.env.NODE_ENV === 'production' ? 'https://vt-souvenir-backend.onrender.com' : null);

  if (backendUrl) {
    return `${backendUrl}${relativePath}`;
  }

  return relativePath;
}

export default {
  generateCatalogPDF,
  getCatalogUrl
};
