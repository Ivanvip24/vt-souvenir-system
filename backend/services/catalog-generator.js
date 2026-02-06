/**
 * Product Catalog / Price List PDF Generator
 * Design inspired by bold price list flyer style:
 * - Full-color background border
 * - Stacked "LISTA DE PRECIOS" header with logo
 * - Category sections with colored bars
 * - 3-column product grids per category
 * - Clean footer with contact
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

// AXKAN Brand Colors
const C = {
  pink: '#E91E63',
  pinkDark: '#C2185B',
  pinkDeep: '#AD1457',
  pinkBg: '#880E4F',
  pinkPale: '#FCE4EC',
  black: '#111111',
  white: '#ffffff',
  gray: '#555555',
  lightGray: '#999999',
  lineGray: '#cccccc',
  green: '#059669'
};

// Logo path
const LOGO_PATH = path.join(__dirname, '../../frontend/assets/images/LOGO-01.png');

// Product categories with 3-column layout data
const CATEGORIES = [
  {
    name: 'IMANES DE MDF',
    columns: [
      {
        title: 'CHICO',
        lines: ['MDF CON CORTE LÁSER', 'PERSONALIZADO', 'MÍN. 50 PIEZAS'],
        price: '$8',
        priceUnit: '/UNIDAD',
        mayoreo: '$6/u (1,000+)'
      },
      {
        title: 'MEDIANO',
        lines: ['MDF CON CORTE LÁSER', 'PERSONALIZADO', 'MÍN. 50 PIEZAS'],
        price: '$11',
        priceUnit: '/UNIDAD',
        mayoreo: '$8/u (1,000+)'
      },
      {
        title: 'GRANDE',
        lines: ['MDF CON CORTE LÁSER', 'PERSONALIZADO', 'MÍN. 50 PIEZAS'],
        price: '$15',
        priceUnit: '/UNIDAD',
        mayoreo: '$12/u (1,000+)'
      }
    ]
  },
  {
    name: 'IMANES ESPECIALIDAD',
    columns: [
      {
        title: 'IMÁN 3D',
        lines: ['MDF 3MM DE ESPESOR', 'EFECTO TRIDIMENSIONAL', 'MÍN. 100 PIEZAS'],
        price: '$15',
        priceUnit: '/UNIDAD',
        mayoreo: '$12/u (1,000+)'
      },
      {
        title: 'IMÁN FOIL',
        lines: ['ACABADO METÁLICO', 'BRILLANTE PREMIUM', 'MÍN. 100 PIEZAS'],
        price: '$15',
        priceUnit: '/UNIDAD',
        mayoreo: '$12/u (1,000+)'
      },
      {
        title: 'BOTONES',
        lines: ['BOTONES METÁLICOS', 'IMPRESIÓN HD', 'MÍN. 50 PIEZAS'],
        price: '$8',
        priceUnit: '/UNIDAD',
        mayoreo: '$6/u (1,000+)'
      }
    ]
  },
  {
    name: 'ACCESORIOS',
    columns: [
      {
        title: 'LLAVEROS',
        lines: ['MDF PERSONALIZADO', 'IDEAL PARA EVENTOS', 'MÍN. 50 PIEZAS'],
        price: '$10',
        priceUnit: '/UNIDAD',
        mayoreo: '$8/u (1,000+)'
      },
      {
        title: 'DESTAPADORES',
        lines: ['MDF PERSONALIZADO', 'FUNCIONAL Y DECORATIVO', 'MÍN. 50 PIEZAS'],
        price: '$20',
        priceUnit: '/UNIDAD',
        mayoreo: '$15/u (1,000+)'
      },
      {
        title: 'PORTALLAVES',
        lines: ['MDF PARA PARED', 'DECORATIVO', 'MÍN. 20 PIEZAS'],
        price: '$40',
        priceUnit: '/UNIDAD',
        mayoreo: null
      }
    ]
  },
  {
    name: 'PAQUETES ESPECIALES',
    columns: [
      {
        title: 'SOUVENIR BOX',
        lines: ['PAQUETE COMPLETO', 'SOUVENIRS PREMIUM', 'SIN MÍNIMO'],
        price: '$2,250',
        priceUnit: '/PAQUETE',
        mayoreo: null
      },
      {
        title: 'ENVÍO',
        lines: ['GRATIS 300+ PIEZAS', 'ESTÁNDAR: $210 MXN', 'A TODO MÉXICO'],
        price: 'GRATIS',
        priceUnit: '300+ PZS',
        mayoreo: null
      },
      {
        title: 'PRODUCCIÓN',
        lines: ['5-7 DÍAS HÁBILES', 'ANTICIPO 50%', 'PERSONALIZACIÓN TOTAL'],
        price: '5-7',
        priceUnit: 'DÍAS',
        mayoreo: null
      }
    ]
  }
];

// Image download cache
const imageCache = new Map();

async function downloadImage(url) {
  if (imageCache.has(url)) return imageCache.get(url);

  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const request = protocol.get(url, (response) => {
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
    request.setTimeout(10000, () => { request.destroy(); reject(new Error('Timeout')); });
  });
}

// Simple file-level cache (24 hours)
let cachedCatalog = { filepath: null, timestamp: 0 };
const CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * Generate a product catalog/price list PDF
 */
export async function generateCatalogPDF(options = {}) {
  // Check cache
  if (!options.forceRegenerate && cachedCatalog.filepath
      && fs.existsSync(cachedCatalog.filepath)
      && (Date.now() - cachedCatalog.timestamp) < CACHE_TTL) {
    return {
      filepath: cachedCatalog.filepath,
      filename: path.basename(cachedCatalog.filepath),
      productCount: 8,
      generatedAt: new Date(cachedCatalog.timestamp).toISOString(),
      cached: true
    };
  }

  const now = new Date();
  const filename = `catalogo-axkan-${Date.now()}.pdf`;
  const filepath = path.join(CATALOGS_DIR, filename);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 0, bottom: 0, left: 0, right: 0 }
      });

      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      const W = doc.page.width;   // 612
      const H = doc.page.height;  // 792
      const BORDER = 28;          // colored border thickness
      const INNER_X = BORDER + 12;
      const INNER_W = W - (BORDER * 2) - 24;

      // ==============================
      // COLORED BORDER (full page)
      // ==============================
      // Top
      doc.rect(0, 0, W, BORDER).fill(C.pink);
      // Bottom
      doc.rect(0, H - BORDER, W, BORDER).fill(C.pink);
      // Left
      doc.rect(0, 0, BORDER, H).fill(C.pink);
      // Right
      doc.rect(W - BORDER, 0, BORDER, H).fill(C.pink);

      // ==============================
      // WHITE INNER BACKGROUND
      // ==============================
      doc.rect(BORDER, BORDER, W - BORDER * 2, H - BORDER * 2).fill(C.white);

      // ==============================
      // HEADER: Stacked "LISTA DE PRECIOS" + Logo
      // ==============================
      const headerY = BORDER + 15;
      const headerX = INNER_X + 5;

      // Line 1: Bold filled white on pink background
      const headerBgH = 120;
      doc.rect(BORDER, BORDER, W - BORDER * 2, headerBgH).fill(C.pinkDeep);

      // "LISTA DE PRECIOS" - Line 1: White filled
      doc.fontSize(36)
         .font('Helvetica-Bold')
         .fillColor(C.white)
         .text('LISTA DE PRECIOS', headerX, headerY, { width: 350 });

      // "LISTA DE PRECIOS" - Line 2: Semi-transparent (outline effect)
      const line2Y = headerY + 38;
      doc.fontSize(36)
         .font('Helvetica-Bold')
         .fillOpacity(0.3)
         .fillColor(C.white)
         .text('LISTA DE PRECIOS', headerX, line2Y, { width: 350 });
      doc.fillOpacity(1);

      // "LISTA DE PRECIOS" - Line 3: Filled pink-light
      const line3Y = headerY + 76;
      doc.fontSize(36)
         .font('Helvetica-Bold')
         .fillColor(C.pink)
         .text('LISTA DE PRECIOS', headerX, line3Y, { width: 350 });

      // Logo on the right
      const logoSize = 85;
      const logoX = W - BORDER - logoSize - 20;
      if (fs.existsSync(LOGO_PATH)) {
        try {
          doc.image(LOGO_PATH, logoX, headerY + 15, { height: logoSize });
        } catch (err) {
          console.log('Could not load logo:', err.message);
        }
      }

      // ==============================
      // CATEGORY SECTIONS
      // ==============================
      let y = BORDER + headerBgH + 15;

      for (let catIdx = 0; catIdx < CATEGORIES.length; catIdx++) {
        const category = CATEGORIES[catIdx];

        // Check if we need a new page
        if (y + 140 > H - BORDER - 45) {
          // Draw footer on current page
          drawPageFooter(doc, W, H, BORDER, INNER_X, INNER_W, now);
          // New page
          doc.addPage();
          // Redraw border
          doc.rect(0, 0, W, BORDER).fill(C.pink);
          doc.rect(0, H - BORDER, W, BORDER).fill(C.pink);
          doc.rect(0, 0, BORDER, H).fill(C.pink);
          doc.rect(W - BORDER, 0, BORDER, H).fill(C.pink);
          doc.rect(BORDER, BORDER, W - BORDER * 2, H - BORDER * 2).fill(C.white);
          y = BORDER + 15;
        }

        // Category bar
        const barH = 26;
        doc.rect(INNER_X, y, INNER_W, barH).fill(C.pinkDeep);

        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor(C.white)
           .text(category.name, INNER_X + 12, y + 6, { width: INNER_W - 24 });

        y += barH + 2;

        // Thin pink line under bar
        doc.moveTo(INNER_X, y).lineTo(INNER_X + INNER_W, y).lineWidth(2).stroke(C.pink);
        y += 8;

        // 3-column grid
        const colCount = category.columns.length;
        const colGap = 10;
        const colW = (INNER_W - (colGap * (colCount - 1))) / colCount;

        // Track max height across columns
        let maxColBottom = y;

        for (let colIdx = 0; colIdx < colCount; colIdx++) {
          const col = category.columns[colIdx];
          const colX = INNER_X + (colIdx * (colW + colGap));
          let colY = y;

          // Column title (bold, large)
          doc.fontSize(12)
             .font('Helvetica-Bold')
             .fillColor(C.black)
             .text(col.title, colX, colY, { width: colW });
          colY += 18;

          // Description lines (small, gray, uppercase)
          doc.fontSize(7.5)
             .font('Helvetica')
             .fillColor(C.gray);

          for (const line of col.lines) {
            doc.text(line, colX, colY, { width: colW });
            colY += 10;
          }

          colY += 4;

          // Price (bold, large)
          doc.fontSize(18)
             .font('Helvetica-Bold')
             .fillColor(C.black)
             .text(col.price, colX, colY, { width: colW });
          colY += 22;

          // Price unit (small)
          doc.fontSize(7)
             .font('Helvetica')
             .fillColor(C.gray)
             .text(col.priceUnit, colX, colY, { width: colW });
          colY += 12;

          // Mayoreo price (green, if applicable)
          if (col.mayoreo) {
            doc.fontSize(8)
               .font('Helvetica-Bold')
               .fillColor(C.green)
               .text('MAYOREO: ' + col.mayoreo, colX, colY, { width: colW });
            colY += 14;
          }

          if (colY > maxColBottom) maxColBottom = colY;
        }

        y = maxColBottom + 5;

        // Separator line between categories
        if (catIdx < CATEGORIES.length - 1) {
          doc.moveTo(INNER_X, y).lineTo(INNER_X + INNER_W, y).lineWidth(0.5).stroke(C.lineGray);
          y += 10;
        }
      }

      // ==============================
      // FOOTER
      // ==============================
      drawPageFooter(doc, W, H, BORDER, INNER_X, INNER_W, now);

      // Finalize
      doc.end();

      stream.on('finish', () => {
        console.log(`✅ Catalog PDF generated: ${filename}`);
        cachedCatalog = { filepath, timestamp: Date.now() };
        resolve({
          filepath,
          filename,
          productCount: 8,
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
 * Draw footer bar at bottom of page
 */
function drawPageFooter(doc, W, H, BORDER, INNER_X, INNER_W, now) {
  const footerBarY = H - BORDER - 38;
  const footerBarH = 30;

  // Pink footer bar
  doc.rect(INNER_X, footerBarY, INNER_W, footerBarH).fill(C.pinkDeep);

  // Left: social/contact
  doc.fontSize(8)
     .font('Helvetica-Bold')
     .fillColor(C.white)
     .text('@axkan.souvenirs', INNER_X + 12, footerBarY + 5, { width: 180 });

  doc.fontSize(7)
     .font('Helvetica')
     .fillColor(C.white)
     .text('WhatsApp: 55 3825 3251', INNER_X + 12, footerBarY + 17, { width: 180 });

  // Center: decorative line
  const lineY = footerBarY + 15;
  const lineStartX = INNER_X + 195;
  const lineEndX = INNER_X + INNER_W - 195;
  doc.moveTo(lineStartX, lineY).lineTo(lineEndX, lineY).lineWidth(1).stroke(C.pink);

  // Right: website
  doc.fontSize(8)
     .font('Helvetica-Bold')
     .fillColor(C.white)
     .text('vtanunciando.com', INNER_X + INNER_W - 180, footerBarY + 5, { width: 168, align: 'right' });

  doc.fontSize(7)
     .font('Helvetica')
     .text('informacion@axkan.art', INNER_X + INNER_W - 180, footerBarY + 17, { width: 168, align: 'right' });
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
