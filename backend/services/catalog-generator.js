/**
 * AXKAN Product Catalog PDF Generator
 * Premium branded catalog with product cards — each card shows
 * shape diagrams, dimensions, prices, and specs together.
 *
 * Uses official AXKAN fonts (RL AQVA, Objektiv VF) and logo.
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

// ================================================
// ASSETS
// ================================================
const ASSETS = {
  jaguarLetters: path.join(__dirname, '../assets/images/JAGUAR_LETTERS.png'),
  fontTitle: path.join(__dirname, '../assets/fonts/RLAQVA.otf'),
  fontBody: path.join(__dirname, '../assets/fonts/FONT-OBJEKTIV-VF-BODY.otf')
};

// ================================================
// BRAND COLORS
// ================================================
const C = {
  pink: '#E91E63',
  green: '#7CB342',
  orange: '#FF9800',
  cyan: '#00BCD4',
  red: '#F44336',
  text: '#555555',
  white: '#FFFFFF',
  gray: '#999999',
  grayLight: '#CCCCCC',
  bg: '#FAFAFA',
  pinkDeep: '#AD1457',
  pinkPale: '#FDF2F8',
  oroMaya: '#D4A574'
};

const BAND = [C.pink, C.green, C.orange, C.cyan, C.red];

// ================================================
// PRODUCT CATALOG — each product is a complete card
// ================================================
const CATALOG_SECTIONS = [
  {
    title: 'Imanes de MDF',
    color: C.pink,
    products: [
      {
        name: 'Imán Chico', material: 'MDF 3mm', p1: '$8', p2: '$6', moq: '100 pzas',
        tiers: '100–999: $8  /  1,000+: $6',
        shapes: [
          { type: 'rect', label: 'Cuadrado', w: 5, h: 5 },
          { type: 'circle', label: 'Circular', d: 5 },
          { type: 'rect', label: 'Alargado', w: 3, h: 9 }
        ]
      },
      {
        name: 'Imán Mediano', material: 'MDF 3mm', p1: '$11', p2: '$8', moq: '100 pzas',
        tiers: '100–999: $11  /  1,000+: $8',
        shapes: [
          { type: 'rect', label: 'Cuadrado', w: 7.5, h: 7.5 },
          { type: 'circle', label: 'Circular', d: 7.5 },
          { type: 'rect', label: 'Alargado', w: 5.5, h: 11.5 }
        ]
      },
      {
        name: 'Imán Grande', material: 'MDF 3mm', p1: '$15', p2: '$12', moq: '100 pzas',
        tiers: '100–999: $15  /  1,000+: $12',
        shapes: [
          { type: 'rect', label: 'Cuadrado', w: 9.5, h: 9.5 },
          { type: 'circle', label: 'Circular', d: 9.5 },
          { type: 'rect', label: 'Alargado', w: 7.5, h: 13.5 }
        ]
      }
    ]
  },
  {
    title: 'Imanes Especiales',
    color: C.cyan,
    products: [
      {
        name: 'Imán 3D', material: 'MDF 3mm × 2 capas (6mm)', p1: '$15', p2: '$12', moq: '100 pzas',
        tiers: '100–999: $15  /  1,000+: $12',
        shapes: [
          { type: 'rect', label: 'Cuadrado', w: 7.5, h: 7.5 },
          { type: 'rect', label: 'Alargado', w: 11.5, h: 5.5 }
        ]
      },
      {
        name: 'Imán Foil Metálico', material: 'MDF 3mm + acabado foil', p1: '$15', p2: '$12', moq: '100 pzas',
        tiers: '100–999: $15  /  1,000+: $12',
        shapes: [
          { type: 'rect', label: 'Cuadrado', w: 7.5, h: 7.5 },
          { type: 'rect', label: 'Alargado', w: 11.5, h: 5.5 }
        ]
      }
    ]
  },
  {
    title: 'Accesorios',
    color: C.green,
    products: [
      {
        name: 'Llavero MDF', material: 'MDF 3mm + argolla reforzada', p1: '$10', p2: '$7', moq: '100 pzas',
        tiers: '100–999: $10  /  1,000+: $7',
        shapes: [
          { type: 'rect', label: 'Cuadrado', w: 5, h: 5 },
          { type: 'circle', label: 'Circular', d: 5 },
          { type: 'rect', label: 'Alargado', w: 8, h: 4 }
        ]
      },
      {
        name: 'Destapador MDF', material: 'MDF 3mm + mecanismo + imán', p1: '$20', p2: '$17', moq: '100 pzas',
        tiers: '100–499: $20  /  500+: $17',
        shapes: [
          { type: 'rect', label: 'Único', w: 11, h: 5 }
        ]
      },
      {
        name: 'Botón Metálico', material: 'Metal + Mylar', p1: '$8', p2: '$6', moq: '100 pzas',
        tiers: '100–999: $8  /  1,000+: $6',
        shapes: [
          { type: 'circle', label: 'Único', d: 4 }
        ]
      }
    ]
  },
  {
    title: 'Productos Grandes',
    color: C.orange,
    products: [
      {
        name: 'Portallaves MDF', material: 'MDF 3mm + 4 ganchos metálicos', p1: '$40', p2: null, moq: '20 pzas',
        tiers: '20+ pzas: $40',
        shapes: [
          { type: 'rect', label: '4 ganchos', w: 19.5, h: 12.5 }
        ]
      },
      {
        name: 'Portarretratos MDF', material: 'MDF 4.5mm + soporte', p1: '$40', p2: null, moq: '20 pzas',
        tiers: '20+ pzas: $40',
        shapes: [
          { type: 'rect', label: 'Foto 10×15 cm', w: 17.45, h: 12.5, innerW: 10, innerH: 15 }
        ]
      }
    ]
  },
  {
    title: 'Paquete Completo',
    color: C.red,
    products: [
      {
        name: 'Souvenir Box', material: '50 imanes + 25 llaveros + 15 destapadores + diseño', p1: '$2,250', p2: null, moq: '1 pza',
        tiers: 'Paquete completo: $2,250 MXN',
        shapes: [] // no shape diagram for the box
      }
    ]
  }
];

// ================================================
// CACHE
// ================================================
let cachedCatalog = { filepath: null, timestamp: 0 };
const CACHE_TTL = 24 * 60 * 60 * 1000;

// ================================================
// DRAWING HELPERS
// ================================================

function textCenter(doc, str, x, w, y) {
  const tw = doc.widthOfString(str);
  doc.text(str, x + (w - tw) / 2, y);
}

function textRight(doc, str, x, w, y) {
  const tw = doc.widthOfString(str);
  doc.text(str, x + w - tw, y);
}

function drawTopBand(doc, pw) {
  const seg = pw / 5;
  for (let i = 0; i < 5; i++) doc.rect(i * seg, 0, seg + 1, 7).fill(BAND[i]);
}

function drawBottomBand(doc, pw, ph) {
  const seg = pw / 5;
  for (let i = 0; i < 5; i++) doc.rect(i * seg, ph - 5, seg + 1, 5).fill(BAND[i]);
}

function drawSideBorders(doc, pw, ph) {
  // removed — too heavy visually
}

function drawSeparator(doc, x, y, w) {
  const seg = w / 5;
  doc.lineWidth(2);
  for (let i = 0; i < 5; i++) {
    doc.strokeColor(BAND[i]).moveTo(x + i * seg, y).lineTo(x + (i + 1) * seg, y).stroke();
  }
}

function drawPageChrome(doc, pw, ph) {
  doc.rect(0, 0, pw, ph).fill(C.white);
  drawTopBand(doc, pw);
  drawBottomBand(doc, pw, ph);
  drawSideBorders(doc, pw, ph);
}

function drawFooter(doc, M, pw, ph, cw) {
  const fy = ph - 28;
  doc.fillColor(C.gray).font('Body').fontSize(6.5);
  doc.text('informacion@axkan.art  |  IG @axkan.mx  |  axkan.art  |  WhatsApp: 55 3825 3251', M, fy);
  textRight(doc, `AXKAN \u00A9 ${new Date().getFullYear()}`, M, cw, fy);
}

function drawHeader(doc, M, cw, y, title, titleColor) {
  if (fs.existsSync(ASSETS.jaguarLetters)) {
    try { doc.image(ASSETS.jaguarLetters, M + 4, y, { height: 42 }); } catch (e) { /* */ }
  }
  doc.fillColor(C.gray).font('Body').fontSize(6);
  doc.text('RECUERDOS HECHOS SOUVENIR', M + 6, y + 46);

  doc.fillColor(titleColor || C.pink).font('Title').fontSize(20);
  textRight(doc, title, M, cw, y + 6);

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  doc.fillColor(C.gray).font('Body').fontSize(7.5);
  textRight(doc, dateStr, M, cw, y + 30);

  return y + 58;
}

// Arrow head for dimension lines
function arrowHead(doc, x, y, angle, sz, color) {
  const a1 = angle + Math.PI * 0.78;
  const a2 = angle - Math.PI * 0.78;
  doc.save().fillColor(color);
  doc.moveTo(x, y)
     .lineTo(x + Math.cos(a1) * sz, y + Math.sin(a1) * sz)
     .lineTo(x + Math.cos(a2) * sz, y + Math.sin(a2) * sz)
     .closePath().fill();
  doc.restore();
}

function hDim(doc, x1, x2, y, label, color) {
  const sz = 2.5;
  doc.strokeColor(color).lineWidth(0.4);
  doc.moveTo(x1 + sz, y).lineTo(x2 - sz, y).stroke();
  arrowHead(doc, x1, y, 0, sz, color);
  arrowHead(doc, x2, y, Math.PI, sz, color);
  doc.fillColor(color).font('Body').fontSize(5.5);
  const lw = doc.widthOfString(label);
  doc.text(label, (x1 + x2) / 2 - lw / 2, y + 2.5);
}

function vDim(doc, x, y1, y2, label, color) {
  const sz = 2.5;
  doc.strokeColor(color).lineWidth(0.4);
  doc.moveTo(x, y1 + sz).lineTo(x, y2 - sz).stroke();
  arrowHead(doc, x, y1, Math.PI / 2, sz, color);
  arrowHead(doc, x, y2, -Math.PI / 2, sz, color);
  doc.fillColor(color).font('Body').fontSize(5.5);
  doc.text(label, x + 3, (y1 + y2) / 2 - 3);
}

// ================================================
// DRAW A SINGLE PRODUCT CARD
// ================================================
// Returns the card height so caller can advance y

function drawProductCard(doc, x, y, w, product, sectionColor) {
  const scale = 3.2; // px per cm
  const pad = 10;
  const shapeRowY = y + 40; // start shapes below name

  // Calculate shapes row
  const shapeGap = 12;
  const shapes = product.shapes || [];
  let totalShapesW = 0;
  const shapeInfos = [];

  for (const s of shapes) {
    let sw, sh;
    if (s.type === 'circle') {
      sw = sh = s.d * scale;
    } else {
      sw = s.w * scale;
      sh = s.h * scale;
    }
    shapeInfos.push({ ...s, sw, sh });
    totalShapesW += sw + shapeGap;
  }
  totalShapesW -= shapeGap; // remove last gap

  // Max shape height (for card sizing)
  const maxShapeH = shapeInfos.reduce((max, si) => Math.max(max, si.sh), 0);

  // Card height
  const shapesAreaH = shapes.length > 0 ? maxShapeH + 30 : 0; // shapes + dim labels
  const cardH = 40 + shapesAreaH + 48; // header + shapes area + price area

  // Card background
  doc.roundedRect(x, y, w, cardH, 6).fill(C.white);
  doc.strokeColor(sectionColor).lineWidth(1);
  doc.roundedRect(x, y, w, cardH, 6).stroke();

  // Top accent bar
  doc.save();
  doc.roundedRect(x, y, w, 28, 6);
  doc.clip();
  doc.rect(x, y, w, 28).fill(sectionColor);
  doc.restore();

  // Product name
  doc.fillColor(C.white).font('Title').fontSize(10);
  textCenter(doc, product.name, x, w, y + 6);

  // Material (under the colored bar)
  doc.fillColor(C.gray).font('Body').fontSize(5.5);
  textCenter(doc, product.material, x, w, y + 30);

  // Draw shapes horizontally centered
  if (shapes.length > 0) {
    let sx = x + (w - totalShapesW) / 2;
    const shapeMidY = shapeRowY + 10 + maxShapeH / 2;

    for (const si of shapeInfos) {
      const shapeX = sx;
      const shapeY = shapeMidY - si.sh / 2;

      if (si.type === 'circle') {
        const r = si.sw / 2;
        const cx = shapeX + r;
        const cy = shapeMidY;

        // Circle
        doc.strokeColor(sectionColor).lineWidth(0.8);
        doc.circle(cx, cy, r).stroke();
        doc.save().fillOpacity(0.05);
        doc.circle(cx, cy, r).fill(sectionColor);
        doc.restore().fillOpacity(1);

        // H dimension
        hDim(doc, cx - r, cx + r, cy + r + 3, `${si.d} cm`, sectionColor);

        // Label
        doc.fillColor(C.text).font('Body').fontSize(5);
        const lw = doc.widthOfString(si.label);
        doc.text(si.label, cx - lw / 2, shapeY - 9);
      } else {
        // Rectangle
        doc.strokeColor(sectionColor).lineWidth(0.8);
        doc.roundedRect(shapeX, shapeY, si.sw, si.sh, 1.5).stroke();
        doc.save().fillOpacity(0.04);
        doc.roundedRect(shapeX, shapeY, si.sw, si.sh, 1.5).fill(C.oroMaya);
        doc.restore().fillOpacity(1);

        // Inner area (portarretratos)
        if (si.innerW && si.innerH) {
          const iw = si.innerW * scale;
          const ih = si.innerH * scale;
          const ix = shapeX + (si.sw - iw) / 2;
          const iy = shapeY + (si.sh - ih) / 2;
          doc.strokeColor(C.grayLight).lineWidth(0.4);
          doc.rect(ix, iy, iw, ih).stroke();
        }

        // H dimension
        hDim(doc, shapeX, shapeX + si.sw, shapeY + si.sh + 3, `${si.w} cm`, sectionColor);

        // V dimension (only if not square or if taller than 6cm)
        if (si.h !== si.w) {
          vDim(doc, shapeX + si.sw + 3, shapeY, shapeY + si.sh, `${si.h} cm`, sectionColor);
        }

        // Label
        doc.fillColor(C.text).font('Body').fontSize(5);
        const lw = doc.widthOfString(si.label);
        doc.text(si.label, shapeX + si.sw / 2 - lw / 2, shapeY - 9);
      }

      sx += si.sw + shapeGap;
    }
  }

  // Price area at bottom of card
  const priceY = y + cardH - 42;

  // Light bg for price area
  doc.save();
  doc.roundedRect(x, y, w, cardH, 6);
  doc.clip();
  doc.rect(x, priceY - 2, w, 36).fill(C.bg);
  doc.restore();

  // Prices — big Title font, quantities in small Body font
  if (product.p2) {
    // Two-tier layout: p1 left, p2 right
    const halfW = w / 2;
    // Left price
    doc.fillColor(sectionColor).font('Title').fontSize(14);
    textCenter(doc, product.p1, x, halfW, priceY);
    doc.fillColor(C.gray).font('Body').fontSize(5.5);
    textCenter(doc, '100–999 pzas', x, halfW, priceY + 14);
    // Right price
    doc.fillColor(sectionColor).font('Title').fontSize(14);
    textCenter(doc, product.p2, x + halfW, halfW, priceY);
    doc.fillColor(C.gray).font('Body').fontSize(5.5);
    textCenter(doc, '1,000+ pzas', x + halfW, halfW, priceY + 14);
  } else {
    // Single price centered
    doc.fillColor(sectionColor).font('Title').fontSize(14);
    textCenter(doc, product.p1, x, w, priceY);
    doc.fillColor(C.gray).font('Body').fontSize(5.5);
    textCenter(doc, `Mín: ${product.moq}`, x, w, priceY + 14);
  }

  // MOQ (only for two-tier, since single-tier already shows it)
  if (product.p2) {
    doc.fillColor(C.gray).font('Body').fontSize(5.5);
    textCenter(doc, `Mín: ${product.moq}`, x, w, priceY + 23);
  }

  return cardH;
}

// ================================================
// MAIN PDF GENERATION
// ================================================

export async function generateCatalogPDF(options = {}) {
  if (!options.forceRegenerate && cachedCatalog.filepath
      && fs.existsSync(cachedCatalog.filepath)
      && (Date.now() - cachedCatalog.timestamp) < CACHE_TTL) {
    return {
      filepath: cachedCatalog.filepath,
      filename: path.basename(cachedCatalog.filepath),
      productCount: CATALOG_SECTIONS.reduce((s, sec) => s + sec.products.length, 0),
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
        size: 'A4',
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        info: {
          Title: 'AXKAN — Catálogo de Productos',
          Author: 'AXKAN Recuerdos Hechos Souvenir',
          Subject: 'Catálogo de Productos y Precios'
        }
      });

      doc.registerFont('Title', ASSETS.fontTitle);
      doc.registerFont('Body', ASSETS.fontBody);

      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      const pw = doc.page.width;
      const ph = doc.page.height;
      const M = 30;
      const cw = pw - M * 2;

      // --- PAGE SETUP ---
      let pageNum = 0;
      let y;

      function startPage(title, titleColor) {
        if (pageNum > 0) doc.addPage();
        pageNum++;
        drawPageChrome(doc, pw, ph);
        y = drawHeader(doc, M, cw, 16, title, titleColor);
        drawSeparator(doc, M, y, cw);
        y += 12;
      }

      function checkPageBreak(needed) {
        if (y + needed > ph - 40) {
          drawFooter(doc, M, pw, ph, cw);
          doc.addPage();
          pageNum++;
          drawPageChrome(doc, pw, ph);
          y = 20;
          drawSeparator(doc, M, y, cw);
          y += 12;
        }
      }

      startPage('CATÁLOGO DE PRODUCTOS', C.pink);

      // Info bar
      doc.roundedRect(M, y, cw, 20, 4).fill(C.pinkPale);
      doc.fillColor(C.pinkDeep).font('Body').fontSize(7);
      textCenter(doc, 'Precios en MXN por unidad  \u00B7  Anticipo 50%  \u00B7  Diseño personalizado incluido  \u00B7  Envío gratis 300+ pzas', M, cw, y + 6);
      y += 28;

      // --- RENDER SECTIONS ---
      const cardGap = 10;

      for (const section of CATALOG_SECTIONS) {
        // Determine columns based on number of products
        const products = section.products;
        const cols = products.length >= 3 ? 3 : products.length;
        const cardW = (cw - (cols - 1) * cardGap) / cols;

        // Estimate first row height to keep title + first row together
        const firstRowProducts = products.slice(0, cols);
        let firstRowH = 0;
        for (const p of firstRowProducts) {
          const maxShapeH = (p.shapes || []).reduce((mx, s) => {
            const h = s.type === 'circle' ? s.d * 3.2 : s.h * 3.2;
            return Math.max(mx, h);
          }, 0);
          const shapesArea = p.shapes.length > 0 ? maxShapeH + 30 : 0;
          const h = 40 + shapesArea + 48;
          if (h > firstRowH) firstRowH = h;
        }

        // Check if section title + first row of cards fit together
        checkPageBreak(28 + firstRowH + 8);

        // Section title
        doc.rect(M, y, cw, 22).fill(C.bg);
        doc.rect(M, y, 4, 22).fill(section.color);
        doc.fillColor(section.color).font('Title').fontSize(12);
        doc.text(section.title, M + 14, y + 5);
        y += 28;

        // Draw product cards in rows
        for (let i = 0; i < products.length; i += cols) {
          const rowProducts = products.slice(i, i + cols);

          // Estimate max card height for this row
          let maxH = 0;
          for (const p of rowProducts) {
            const maxShapeH = (p.shapes || []).reduce((mx, s) => {
              const h = s.type === 'circle' ? s.d * 3.2 : s.h * 3.2;
              return Math.max(mx, h);
            }, 0);
            const shapesArea = p.shapes.length > 0 ? maxShapeH + 30 : 0;
            const h = 40 + shapesArea + 48;
            if (h > maxH) maxH = h;
          }

          checkPageBreak(maxH + 8);

          // Draw cards in this row
          for (let j = 0; j < rowProducts.length; j++) {
            const cardX = M + j * (cardW + cardGap);
            drawProductCard(doc, cardX, y, cardW, rowProducts[j], section.color);
          }

          y += maxH + cardGap;
        }

        y += 4;
      }

      // --- NOTES ---
      checkPageBreak(60);
      y += 4;
      drawSeparator(doc, M, y, cw);
      y += 12;

      const notes = [
        'Pedido mínimo general: 100 pzas  \u00B7  Portallaves/Portarretratos: 20 pzas  \u00B7  Souvenir Box: 1 pza',
        'Envío estándar: 6-7 días hábiles  \u00B7  Producción: 8-14 días según cantidad',
        '2 rondas de revisión de diseño incluidas  \u00B7  Garantía: 7 días con evidencia fotográfica'
      ];
      doc.fillColor(C.gray).font('Body').fontSize(6.5);
      for (const n of notes) {
        textCenter(doc, n, M, cw, y);
        y += 11;
      }

      // Footer on last page
      drawFooter(doc, M, pw, ph, cw);

      doc.end();

      stream.on('finish', () => {
        console.log(`\u2705 Product catalog PDF generated: ${filename}`);
        cachedCatalog = { filepath, timestamp: Date.now() };
        resolve({
          filepath,
          filename,
          productCount: CATALOG_SECTIONS.reduce((s, sec) => s + sec.products.length, 0),
          generatedAt: now.toISOString(),
          cached: false
        });
      });

      stream.on('error', reject);
    } catch (error) {
      console.error('\u274C Error generating catalog PDF:', error);
      reject(error);
    }
  });
}

export function getCatalogUrl(filepath) {
  const filename = path.basename(filepath);
  const relativePath = `/catalogs/${filename}`;
  const backendUrl = process.env.BACKEND_URL
    || process.env.RENDER_EXTERNAL_URL
    || (process.env.NODE_ENV === 'production' ? 'https://vt-souvenir-backend.onrender.com' : null);
  return backendUrl ? `${backendUrl}${relativePath}` : relativePath;
}

export default { generateCatalogPDF, getCatalogUrl };
