/**
 * Product Price List PDF Generator
 * Clean, minimal design: soft pink background, white pill rows,
 * product name left + price right. Single page. Professional.
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATALOGS_DIR = path.join(__dirname, '../catalogs');
if (!fs.existsSync(CATALOGS_DIR)) {
  fs.mkdirSync(CATALOGS_DIR, { recursive: true });
}

// AXKAN colors
const C = {
  pink: '#E91E63',
  pinkDark: '#C2185B',
  pinkDeep: '#AD1457',
  pinkSoft: '#F8BBD0',
  pinkPale: '#FCE4EC',
  pinkBg: '#FDF2F6',
  black: '#1a1a1a',
  darkText: '#2d2d2d',
  gray: '#777777',
  white: '#ffffff',
  pillBg: '#ffffff',
  pillStroke: '#F3D5DE'
};

const LOGO_PATH = path.join(__dirname, '../../frontend/assets/images/LOGO-01.png');

// Price list data
const PRICE_ROWS = [
  { name: 'Imanes MDF — Chico', price: '$8', mayoreo: '$6' },
  { name: 'Imanes MDF — Mediano', price: '$11', mayoreo: '$8' },
  { name: 'Imanes MDF — Grande', price: '$15', mayoreo: '$12' },
  { name: 'Imán 3D MDF', price: '$15', mayoreo: '$12' },
  { name: 'Imán Foil Metálico', price: '$15', mayoreo: '$12' },
  { name: 'Llaveros MDF', price: '$10', mayoreo: '$8' },
  { name: 'Destapadores MDF', price: '$20', mayoreo: '$15' },
  { name: 'Botones Metálicos', price: '$8', mayoreo: '$6' },
  { name: 'Portallaves MDF', price: '$40', mayoreo: null, note: 'mín. 20 pzas' },
  { name: 'Souvenir Box', price: '$2,250', mayoreo: null, note: 'paquete completo' }
];

// Cache
let cachedCatalog = { filepath: null, timestamp: 0 };
const CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * Generate price list PDF - single page
 */
export async function generateCatalogPDF(options = {}) {
  if (!options.forceRegenerate && cachedCatalog.filepath
      && fs.existsSync(cachedCatalog.filepath)
      && (Date.now() - cachedCatalog.timestamp) < CACHE_TTL) {
    return {
      filepath: cachedCatalog.filepath,
      filename: path.basename(cachedCatalog.filepath),
      productCount: PRICE_ROWS.length,
      generatedAt: new Date(cachedCatalog.timestamp).toISOString(),
      cached: true
    };
  }

  const now = new Date();
  const filename = `lista-precios-axkan-${Date.now()}.pdf`;
  const filepath = path.join(CATALOGS_DIR, filename);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        autoFirstPage: true,
        bufferPages: true
      });

      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      const W = 612;
      const H = 792;
      const PAD = 50;
      const ROW_W = W - PAD * 2;

      // Row dimensions - compact to fit single page
      const ROW_H = 26;
      const ROW_GAP = 3;

      // ==============================
      // FULL PAGE SOFT PINK BACKGROUND
      // ==============================
      doc.rect(0, 0, W, H).fill(C.pinkBg);

      // Subtle decorative circle (top-right)
      doc.save();
      doc.circle(W - 50, 100, 160).fillOpacity(0.04).fill(C.pink);
      doc.restore();
      doc.fillOpacity(1);

      // Subtle decorative circle (bottom-left)
      doc.save();
      doc.circle(50, H - 80, 120).fillOpacity(0.04).fill(C.pink);
      doc.restore();
      doc.fillOpacity(1);

      // ==============================
      // LOGO (top-left, subtle)
      // ==============================
      if (fs.existsSync(LOGO_PATH)) {
        try {
          doc.save();
          doc.fillOpacity(0.12);
          doc.image(LOGO_PATH, PAD - 10, 28, { height: 55 });
          doc.restore();
          doc.fillOpacity(1);
        } catch (err) {
          console.log('Could not load logo:', err.message);
        }
      }

      // ==============================
      // TITLE
      // ==============================
      let y = 35;

      doc.fontSize(34)
         .font('Helvetica-Bold')
         .fillColor(C.pinkDeep)
         .text('AXKAN', PAD, y, { width: ROW_W, align: 'center', lineBreak: false });

      y += 42;

      doc.fontSize(13)
         .font('Helvetica-Oblique')
         .fillColor(C.gray)
         .text('Lista de precios', PAD, y, { width: ROW_W, align: 'center', lineBreak: false });

      y += 25;

      // Thin decorative line
      const lineInset = 180;
      doc.moveTo(lineInset, y).lineTo(W - lineInset, y).lineWidth(0.5).stroke(C.pinkSoft);

      y += 14;

      // ==============================
      // SECTION: PRECIOS UNITARIOS
      // ==============================
      doc.fontSize(8)
         .font('Helvetica-Bold')
         .fillColor(C.pinkDark)
         .text('PRECIO POR UNIDAD  (50-999 pzas)', PAD, y, { width: ROW_W, align: 'center', lineBreak: false });

      y += 16;

      // Price rows
      for (const row of PRICE_ROWS) {
        y = drawPriceRow(doc, row.name, row.price, row.note, PAD, y, ROW_W, ROW_H);
        y += ROW_GAP;
      }

      y += 8;

      // Decorative line
      doc.moveTo(lineInset, y).lineTo(W - lineInset, y).lineWidth(0.5).stroke(C.pinkSoft);
      y += 12;

      // ==============================
      // SECTION: PRECIOS MAYOREO
      // ==============================
      doc.fontSize(8)
         .font('Helvetica-Bold')
         .fillColor(C.pinkDark)
         .text('PRECIO MAYOREO  (1,000+ pzas)', PAD, y, { width: ROW_W, align: 'center', lineBreak: false });

      y += 16;

      // Mayoreo rows
      const mayoreoRows = PRICE_ROWS.filter(r => r.mayoreo);
      for (const row of mayoreoRows) {
        y = drawPriceRow(doc, row.name, row.mayoreo, null, PAD, y, ROW_W, ROW_H);
        y += ROW_GAP;
      }

      y += 10;

      // ==============================
      // SMALL NOTES
      // ==============================
      doc.fontSize(7)
         .font('Helvetica')
         .fillColor(C.gray)
         .text('Pedido mínimo: 50 pzas  |  Envío gratis en 300+ pzas  |  Anticipo 50%  |  Producción: 5-7 días', PAD, y, {
           width: ROW_W,
           align: 'center',
           lineBreak: false
         });

      // ==============================
      // FOOTER
      // ==============================
      const footerY = H - 50;

      // Pink accent bar
      doc.rect(0, footerY - 5, W, 55).fill(C.pinkPale);

      doc.fontSize(9)
         .font('Helvetica-Bold')
         .fillColor(C.pinkDeep)
         .text('WhatsApp: 55 3825 3251', PAD, footerY + 8, { width: ROW_W / 2, lineBreak: false });

      doc.fontSize(9)
         .font('Helvetica-Bold')
         .fillColor(C.pinkDeep)
         .text('informacion@axkan.art', PAD + ROW_W / 2, footerY + 8, { width: ROW_W / 2, align: 'right', lineBreak: false });

      doc.fontSize(7)
         .font('Helvetica-Oblique')
         .fillColor(C.gray)
         .text('@axkan.souvenirs', PAD, footerY + 24, { width: ROW_W / 2, lineBreak: false });

      doc.fontSize(7)
         .font('Helvetica-Oblique')
         .fillColor(C.gray)
         .text('vtanunciando.com', PAD + ROW_W / 2, footerY + 24, { width: ROW_W / 2, align: 'right', lineBreak: false });

      // Finalize - only keep first page
      const range = doc.bufferedPageRange();
      if (range.count > 1) {
        // Remove extra pages if PDFKit auto-created them
        for (let i = range.count - 1; i > 0; i--) {
          doc.switchToPage(i);
        }
        doc.switchToPage(0);
      }

      doc.end();

      stream.on('finish', () => {
        console.log(`✅ Price list PDF generated: ${filename}`);
        cachedCatalog = { filepath, timestamp: Date.now() };
        resolve({
          filepath,
          filename,
          productCount: PRICE_ROWS.length,
          generatedAt: now.toISOString(),
          cached: false
        });
      });

      stream.on('error', reject);
    } catch (error) {
      console.error('❌ Error generating price list PDF:', error);
      reject(error);
    }
  });
}

/**
 * Draw a single price row (white rounded pill with name left, price right)
 */
function drawPriceRow(doc, name, price, note, x, y, width, rowH) {
  const radius = rowH / 2;
  const innerPad = 14;

  // White pill background with subtle border
  doc.save();
  doc.roundedRect(x, y, width, rowH, radius)
     .fillAndStroke(C.pillBg, C.pillStroke);
  doc.restore();

  // Product name (left)
  const textY = y + (rowH / 2) - 5;
  doc.fontSize(10)
     .font('Helvetica')
     .fillColor(C.darkText)
     .text(name, x + innerPad, textY, { width: width - 120, lineBreak: false });

  // Small note next to name if present
  if (note) {
    const nameWidth = doc.widthOfString(name, { font: 'Helvetica', size: 10 });
    doc.fontSize(6.5)
       .font('Helvetica-Oblique')
       .fillColor(C.gray)
       .text(note, x + innerPad + nameWidth + 8, textY + 2, { width: 80, lineBreak: false });
  }

  // Price (right, bold, pink)
  doc.fontSize(14)
     .font('Helvetica-Bold')
     .fillColor(C.pinkDeep)
     .text(price, x + width - 95, y + (rowH / 2) - 7, { width: 80, align: 'right', lineBreak: false });

  return y + rowH;
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
