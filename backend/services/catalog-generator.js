/**
 * Product Price List PDF Generator
 * Clean, minimal design: soft pink background, white pill rows,
 * product name left + price right. No filler. Professional.
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
  pinkSoft: '#F8BBD0',    // soft background
  pinkPale: '#FCE4EC',    // lightest pink bg
  pinkBg: '#FDF2F6',      // very subtle page bg
  black: '#1a1a1a',
  darkText: '#2d2d2d',
  gray: '#777777',
  white: '#ffffff',
  pillBg: '#ffffff',
  pillStroke: '#F3D5DE'
};

const LOGO_PATH = path.join(__dirname, '../../frontend/assets/images/LOGO-01.png');

// Price list data - only what matters
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
 * Generate price list PDF
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
        margins: { top: 0, bottom: 0, left: 0, right: 0 }
      });

      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      const W = 612;  // LETTER width
      const H = 792;  // LETTER height
      const PAD = 55;  // side padding
      const ROW_W = W - PAD * 2;

      // ==============================
      // FULL PAGE SOFT PINK BACKGROUND
      // ==============================
      doc.rect(0, 0, W, H).fill(C.pinkBg);

      // Subtle decorative circle (top-right, like the reference)
      doc.save();
      doc.circle(W - 60, 120, 180).fillOpacity(0.04).fill(C.pink);
      doc.restore();
      doc.fillOpacity(1);

      // Subtle decorative circle (bottom-left)
      doc.save();
      doc.circle(60, H - 100, 140).fillOpacity(0.04).fill(C.pink);
      doc.restore();
      doc.fillOpacity(1);

      // ==============================
      // LOGO (top-left, subtle)
      // ==============================
      if (fs.existsSync(LOGO_PATH)) {
        try {
          doc.save();
          doc.fillOpacity(0.12);
          doc.image(LOGO_PATH, PAD - 10, 35, { height: 65 });
          doc.restore();
          doc.fillOpacity(1);
        } catch (err) {
          console.log('Could not load logo:', err.message);
        }
      }

      // ==============================
      // TITLE
      // ==============================
      let y = 50;

      doc.fontSize(42)
         .font('Helvetica-Bold')
         .fillColor(C.pinkDeep)
         .text('AXKAN', PAD, y, { width: ROW_W, align: 'center' });

      y += 52;

      doc.fontSize(16)
         .font('Helvetica-Oblique')
         .fillColor(C.gray)
         .text('Lista de precios', PAD, y, { width: ROW_W, align: 'center' });

      y += 35;

      // Thin decorative line
      const lineInset = 180;
      doc.moveTo(lineInset, y).lineTo(W - lineInset, y).lineWidth(0.5).stroke(C.pinkSoft);

      y += 20;

      // ==============================
      // SECTION: PRECIOS UNITARIOS
      // ==============================
      doc.fontSize(9)
         .font('Helvetica-Bold')
         .fillColor(C.pinkDark)
         .text('PRECIO POR UNIDAD  (50-999 pzas)', PAD, y, { width: ROW_W, align: 'center' });

      y += 22;

      // Price rows
      for (const row of PRICE_ROWS) {
        y = drawPriceRow(doc, row.name, row.price, row.note, PAD, y, ROW_W);
      }

      y += 15;

      // Decorative line
      doc.moveTo(lineInset, y).lineTo(W - lineInset, y).lineWidth(0.5).stroke(C.pinkSoft);
      y += 18;

      // ==============================
      // SECTION: PRECIOS MAYOREO
      // ==============================
      doc.fontSize(9)
         .font('Helvetica-Bold')
         .fillColor(C.pinkDark)
         .text('PRECIO MAYOREO  (1,000+ pzas)', PAD, y, { width: ROW_W, align: 'center' });

      y += 22;

      // Mayoreo rows (only products that have mayoreo price)
      const mayoreoRows = PRICE_ROWS.filter(r => r.mayoreo);
      for (const row of mayoreoRows) {
        y = drawPriceRow(doc, row.name, row.mayoreo, null, PAD, y, ROW_W);
      }

      y += 20;

      // ==============================
      // SMALL NOTES (only essential)
      // ==============================
      doc.fontSize(7.5)
         .font('Helvetica')
         .fillColor(C.gray);

      doc.text('Pedido mínimo: 50 pzas  |  Envío gratis en 300+ pzas  |  Anticipo 50%  |  Producción: 5-7 días', PAD, y, {
        width: ROW_W,
        align: 'center'
      });

      // ==============================
      // FOOTER
      // ==============================
      const footerY = H - 60;

      // Pink accent bar
      doc.rect(0, footerY - 5, W, 65).fill(C.pinkPale);

      doc.fontSize(10)
         .font('Helvetica-Bold')
         .fillColor(C.pinkDeep);

      doc.text('WhatsApp: 55 3825 3251', PAD, footerY + 10, { width: ROW_W / 2 });

      doc.fontSize(10)
         .font('Helvetica-Bold')
         .fillColor(C.pinkDeep)
         .text('informacion@axkan.art', PAD + ROW_W / 2, footerY + 10, { width: ROW_W / 2, align: 'right' });

      doc.fontSize(8)
         .font('Helvetica-Oblique')
         .fillColor(C.gray)
         .text('@axkan.souvenirs', PAD, footerY + 28, { width: ROW_W / 2 });

      doc.fontSize(8)
         .font('Helvetica-Oblique')
         .fillColor(C.gray)
         .text('vtanunciando.com', PAD + ROW_W / 2, footerY + 28, { width: ROW_W / 2, align: 'right' });

      // Finalize
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
function drawPriceRow(doc, name, price, note, x, y, width) {
  const rowH = 34;
  const radius = 10;
  const innerPad = 18;

  // White pill background with subtle border
  doc.save();
  doc.roundedRect(x, y, width, rowH, radius)
     .fillAndStroke(C.pillBg, C.pillStroke);
  doc.restore();

  // Product name (left)
  const textY = y + 10;
  doc.fontSize(11)
     .font('Helvetica')
     .fillColor(C.darkText)
     .text(name, x + innerPad, textY, { width: width - 140 });

  // Small note under name if present
  if (note) {
    doc.fontSize(7)
       .font('Helvetica-Oblique')
       .fillColor(C.gray)
       .text(note, x + innerPad, textY + 14, { width: width - 140 });
  }

  // Price (right, bold, pink)
  doc.fontSize(16)
     .font('Helvetica-Bold')
     .fillColor(C.pinkDeep)
     .text(price, x + width - 110, y + 8, { width: 90, align: 'right' });

  return y + rowH + 8; // return next y with spacing
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
