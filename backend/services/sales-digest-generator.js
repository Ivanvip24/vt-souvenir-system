/**
 * Sales Digest PDF Generator
 * Generates AXKAN-branded daily sales digest with priority list and coaching scoreboard
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';
import { log, logError } from '../shared/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Output directory
const REPORTS_DIR = path.join(__dirname, '../sales-digests');
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

// AXKAN Brand Colors
const COLORS = {
  pink: '#E91E63',
  green: '#7CB342',
  orange: '#FF9800',
  cyan: '#00BCD4',
  red: '#F44336',
  text: '#555555',
  textDark: '#333333',
  textLight: '#999999',
  white: '#FFFFFF',
  grayLine: '#E0E0E0',
  grayBg: '#F6F6F6',
  // Section-specific backgrounds
  redBg: '#FFF3F0',
  greenBg: '#F1F8E9',
  orangeBg: '#FFF8E1'
};

const BAND = [COLORS.pink, COLORS.green, COLORS.orange, COLORS.cyan, COLORS.red];

// Assets
const ASSETS = {
  logo: path.join(__dirname, '../assets/images/JAGUAR_LETTERS.png'),
  fontTitle: path.join(__dirname, '../assets/fonts/RLAQVA.otf'),
  fontBody: path.join(__dirname, '../assets/fonts/FONT-OBJEKTIV-VF-BODY.otf')
};

// Page constants (LETTER)
const PW = 612;
const PH = 792;
const ML = 40;
const MR = 40;
const CW = PW - ML - MR;
const SEG_W = PW / BAND.length;
const FOOTER_ZONE = 36;
const PAGE_BOTTOM = PH - FOOTER_ZONE;
const BAND_HEIGHT = 3;

// ── Shared helpers ──────────────────────────────────────────

function getBaseUrl() {
  return process.env.BACKEND_URL
    || process.env.RENDER_EXTERNAL_URL
    || 'https://vt-souvenir-backend.onrender.com';
}

function formatDateShort(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-MX', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
}

function formatCurrency(amount) {
  return '$' + Number(amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function registerFonts(doc) {
  let titleFont = 'Helvetica-Bold';
  let bodyFont = 'Helvetica';
  try {
    if (fs.existsSync(ASSETS.fontTitle)) {
      doc.registerFont('Title', ASSETS.fontTitle);
      titleFont = 'Title';
    }
  } catch (e) { /* fallback */ }
  try {
    if (fs.existsSync(ASSETS.fontBody)) {
      doc.registerFont('Body', ASSETS.fontBody);
      bodyFont = 'Body';
    }
  } catch (e) { /* fallback */ }
  return { titleFont, bodyFont };
}

function drawColorBand(doc, y) {
  for (let i = 0; i < BAND.length; i++) {
    doc.rect(SEG_W * i, y, SEG_W + 1, BAND_HEIGHT).fill(BAND[i]);
  }
}

function drawTopBand(doc) {
  drawColorBand(doc, 0);
}

function drawFooter(doc, bodyFont) {
  const fY = PH - 22;
  drawColorBand(doc, fY + 8);
  doc.font(bodyFont).fontSize(6.5).fillColor('#B0B0B0')
     .text('AXKAN \u2014 Recuerdos Hechos Souvenir', ML, fY - 2, { width: CW, align: 'center', lineBreak: false });
}

function drawHeader(doc, titleFont, bodyFont, title, subtitle) {
  let y = 14;

  // Logo
  if (fs.existsSync(ASSETS.logo)) {
    try {
      doc.image(ASSETS.logo, ML, y, { fit: [80, 32], align: 'left' });
    } catch (e) { /* skip logo */ }
  }

  // Title (right-aligned to logo)
  doc.font(titleFont).fontSize(13).fillColor(COLORS.pink)
     .text(title, ML + 100, y + 4, { width: CW - 100, align: 'right', lineBreak: false });

  // Subtitle below title
  if (subtitle) {
    doc.font(bodyFont).fontSize(8).fillColor(COLORS.textLight)
       .text(subtitle, ML + 100, y + 22, { width: CW - 100, align: 'right', lineBreak: false });
  }

  y += 44;

  // Color band below header
  drawColorBand(doc, y);
  y += BAND_HEIGHT + 20;

  return y;
}

function newPage(doc, bodyFont) {
  doc.addPage({ size: 'LETTER', margins: { top: 10, bottom: 0, left: ML, right: MR } });
  drawTopBand(doc);
  drawFooter(doc, bodyFont);
}

function ensureSpace(doc, bodyFont, y, needed) {
  if (y + needed > PAGE_BOTTOM) {
    newPage(doc, bodyFont);
    return 30;
  }
  return y;
}

/**
 * Draw a rounded summary card (KPI pill)
 */
function drawKPICard(doc, titleFont, bodyFont, x, y, w, h, bgColor, value, label) {
  doc.roundedRect(x, y, w, h, 8).fill(bgColor);
  doc.font(titleFont).fontSize(20).fillColor(COLORS.white)
     .text(String(value), x, y + 8, { width: w, align: 'center' });
  doc.font(bodyFont).fontSize(6.5).fillColor(COLORS.white)
     .text(label.toUpperCase(), x, y + 34, { width: w, align: 'center', characterSpacing: 0.8 });
}

/**
 * Truncate text to fit within a certain width approximation
 */
function truncate(str, maxLen) {
  if (!str) return '-';
  return str.length > maxLen ? str.substring(0, maxLen - 1) + '\u2026' : str;
}

/**
 * Draw a section title with colored dot indicator
 */
function drawSectionTitle(doc, titleFont, bodyFont, y, emoji, title, accentColor) {
  // Colored dot
  doc.circle(ML + 8, y + 6, 5).fill(accentColor);

  // Title text
  doc.font(titleFont).fontSize(11).fillColor(COLORS.textDark)
     .text(title, ML + 20, y, { width: CW - 20 });

  y += 20;

  // Thin accent line
  doc.moveTo(ML, y).lineTo(ML + CW, y)
     .lineWidth(0.6).strokeColor(accentColor).opacity(0.4).stroke();
  doc.opacity(1);
  y += 10;

  return y;
}


// ════════════════════════════════════════════════════════════
//  SALES DIGEST PDF
// ════════════════════════════════════════════════════════════

/**
 * Generate a daily sales digest PDF
 * @param {Object} data - Sales digest data
 * @param {string} data.date - Date string YYYY-MM-DD
 * @param {Object} data.priorities - Cold leads, ready to close, waiting reply
 * @param {Object} data.scoreboard - KPIs and coaching metrics
 * @returns {Promise<{filepath, filename, url}>}
 */
export async function generateSalesDigestPDF(data) {
  return new Promise((resolve, reject) => {
    try {
      const reportDate = data.date || new Date().toISOString().split('T')[0];
      const filename = `sales-digest-${reportDate}.pdf`;
      const filepath = path.join(REPORTS_DIR, filename);

      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 10, bottom: 0, left: ML, right: MR },
        autoFirstPage: false
      });

      const { titleFont, bodyFont } = registerFonts(doc);

      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      const priorities = data.priorities || {};
      const scoreboard = data.scoreboard || {};

      // ════════════════════════════════════════
      // PAGE 1 — Priority List
      // ════════════════════════════════════════
      newPage(doc, bodyFont);
      let y = drawHeader(doc, titleFont, bodyFont,
        'REPORTE DIARIO DE VENTAS',
        formatDateShort(reportDate)
      );

      // ── LEADS FRIOS ──
      const coldLeads = priorities.coldLeads || [];
      y = drawSectionTitle(doc, titleFont, bodyFont, y, null, 'LEADS FR\u00cdOS', COLORS.red);

      if (coldLeads.length === 0) {
        doc.font(bodyFont).fontSize(9).fillColor(COLORS.textLight)
           .text('Sin conversaciones en esta categor\u00eda', ML + 12, y, { width: CW - 24 });
        y += 24;
      } else {
        // Table header
        const colClient = ML + 8;
        const colHours = ML + 200;
        const colMsg = ML + 280;

        doc.font(bodyFont).fontSize(6).fillColor('#B0B0B0');
        doc.text('CLIENTE', colClient, y);
        doc.text('HRS SIN RESPUESTA', colHours, y);
        doc.text('\u00daLTIMO MENSAJE', colMsg, y);
        y += 4;
        doc.moveTo(ML + 4, y).lineTo(ML + CW - 4, y)
           .lineWidth(0.3).strokeColor(COLORS.grayLine).opacity(0.5).stroke();
        doc.opacity(1);
        y += 10;

        for (const lead of coldLeads) {
          y = ensureSpace(doc, bodyFont, y, 24);

          // Row background
          doc.roundedRect(ML + 2, y - 2, CW - 4, 20, 3).fill(COLORS.redBg);

          doc.font(bodyFont).fontSize(8.5).fillColor(COLORS.textDark)
             .text(truncate(lead.clientName, 28), colClient, y + 2, { width: 185, lineBreak: false });

          doc.font(titleFont).fontSize(9).fillColor(COLORS.red)
             .text(lead.hoursSince ? `${lead.hoursSince}h` : '-', colHours, y + 2, { width: 70, lineBreak: false });

          doc.font(bodyFont).fontSize(7.5).fillColor(COLORS.text)
             .text(truncate(lead.lastMessage, 38), colMsg, y + 2, { width: CW - 280, lineBreak: false });

          y += 22;
        }
        y += 8;
      }

      // ── LISTOS PARA CERRAR ──
      y = ensureSpace(doc, bodyFont, y, 60);
      const readyToClose = priorities.readyToClose || [];
      y = drawSectionTitle(doc, titleFont, bodyFont, y, null, 'LISTOS PARA CERRAR', COLORS.green);

      if (readyToClose.length === 0) {
        doc.font(bodyFont).fontSize(9).fillColor(COLORS.textLight)
           .text('Sin conversaciones en esta categor\u00eda', ML + 12, y, { width: CW - 24 });
        y += 24;
      } else {
        const colClient2 = ML + 8;
        const colContext = ML + 200;

        doc.font(bodyFont).fontSize(6).fillColor('#B0B0B0');
        doc.text('CLIENTE', colClient2, y);
        doc.text('CONTEXTO', colContext, y);
        y += 4;
        doc.moveTo(ML + 4, y).lineTo(ML + CW - 4, y)
           .lineWidth(0.3).strokeColor(COLORS.grayLine).opacity(0.5).stroke();
        doc.opacity(1);
        y += 10;

        for (const lead of readyToClose) {
          y = ensureSpace(doc, bodyFont, y, 24);

          doc.roundedRect(ML + 2, y - 2, CW - 4, 20, 3).fill(COLORS.greenBg);

          doc.font(bodyFont).fontSize(8.5).fillColor(COLORS.textDark)
             .text(truncate(lead.clientName, 28), colClient2, y + 2, { width: 185, lineBreak: false });

          doc.font(bodyFont).fontSize(7.5).fillColor(COLORS.text)
             .text(truncate(lead.context || lead.lastMessage, 52), colContext, y + 2, { width: CW - 200, lineBreak: false });

          y += 22;
        }
        y += 8;
      }

      // ── ESPERANDO RESPUESTA ──
      y = ensureSpace(doc, bodyFont, y, 60);
      const waitingReply = priorities.waitingReply || [];
      y = drawSectionTitle(doc, titleFont, bodyFont, y, null, 'ESPERANDO RESPUESTA', COLORS.orange);

      if (waitingReply.length === 0) {
        doc.font(bodyFont).fontSize(9).fillColor(COLORS.textLight)
           .text('Sin conversaciones en esta categor\u00eda', ML + 12, y, { width: CW - 24 });
        y += 24;
      } else {
        const colClient3 = ML + 8;
        const colHours3 = ML + 200;
        const colMsg3 = ML + 280;

        doc.font(bodyFont).fontSize(6).fillColor('#B0B0B0');
        doc.text('CLIENTE', colClient3, y);
        doc.text('HRS ESPERANDO', colHours3, y);
        doc.text('\u00daLTIMO MENSAJE', colMsg3, y);
        y += 4;
        doc.moveTo(ML + 4, y).lineTo(ML + CW - 4, y)
           .lineWidth(0.3).strokeColor(COLORS.grayLine).opacity(0.5).stroke();
        doc.opacity(1);
        y += 10;

        for (const lead of waitingReply) {
          y = ensureSpace(doc, bodyFont, y, 24);

          doc.roundedRect(ML + 2, y - 2, CW - 4, 20, 3).fill(COLORS.orangeBg);

          doc.font(bodyFont).fontSize(8.5).fillColor(COLORS.textDark)
             .text(truncate(lead.clientName, 28), colClient3, y + 2, { width: 185, lineBreak: false });

          doc.font(titleFont).fontSize(9).fillColor(COLORS.orange)
             .text(lead.hoursSince ? `${lead.hoursSince}h` : '-', colHours3, y + 2, { width: 70, lineBreak: false });

          doc.font(bodyFont).fontSize(7.5).fillColor(COLORS.text)
             .text(truncate(lead.lastMessage, 38), colMsg3, y + 2, { width: CW - 280, lineBreak: false });

          y += 22;
        }
      }

      // ════════════════════════════════════════
      // PAGE 2 — Coaching Scoreboard
      // ════════════════════════════════════════
      newPage(doc, bodyFont);
      y = 24;

      doc.font(titleFont).fontSize(14).fillColor(COLORS.pink)
         .text('COACHING SCOREBOARD', ML, y);
      y += 22;

      // Pink accent line
      doc.moveTo(ML, y).lineTo(ML + 120, y)
         .lineWidth(2.5).strokeColor(COLORS.pink).stroke();
      doc.moveTo(ML + 122, y).lineTo(ML + CW, y)
         .lineWidth(0.3).strokeColor(COLORS.grayLine).stroke();
      y += 28;

      // ── 5 KPI Cards Row ──
      const kpiCardW = (CW - 40) / 5;
      const kpiCardH = 50;
      const kpiGap = 10;

      const kpis = [
        { value: scoreboard.totalPills || 0, label: 'Pills Enviados', bg: COLORS.cyan },
        { value: scoreboard.followed || 0,   label: 'Seguidos',       bg: COLORS.green },
        { value: scoreboard.responses || 0,  label: 'Respuestas',     bg: COLORS.pink },
        { value: scoreboard.orders || 0,     label: 'Pedidos',        bg: COLORS.orange },
        { value: formatCurrency(scoreboard.revenue), label: 'Revenue', bg: COLORS.green }
      ];

      for (let i = 0; i < kpis.length; i++) {
        const cx = ML + i * (kpiCardW + kpiGap);
        drawKPICard(doc, titleFont, bodyFont, cx, y, kpiCardW, kpiCardH, kpis[i].bg, kpis[i].value, kpis[i].label);
      }
      y += kpiCardH + 32;

      // ── By Type Section ──
      doc.font(titleFont).fontSize(10).fillColor(COLORS.textDark)
         .text('POR TIPO DE COACHING', ML, y, { characterSpacing: 1.5 });
      y += 20;

      const byType = scoreboard.byType || [];
      const typeColors = [COLORS.pink, COLORS.cyan, COLORS.green, COLORS.orange, COLORS.red];
      const barFullW = CW - 200;

      if (byType.length === 0) {
        doc.font(bodyFont).fontSize(9).fillColor(COLORS.textLight)
           .text('Sin datos de coaching disponibles', ML + 12, y);
        y += 24;
      } else {
        for (let i = 0; i < byType.length; i++) {
          y = ensureSpace(doc, bodyFont, y, 40);
          const item = byType[i];
          const typeColor = typeColors[i % typeColors.length];
          const rate = item.rate || 0;

          // Type name
          doc.circle(ML + 8, y + 6, 4).fill(typeColor);
          doc.font(titleFont).fontSize(9).fillColor(COLORS.textDark)
             .text(item.type || '-', ML + 20, y, { width: 140, lineBreak: false });

          // Progress bar
          const barX = ML + 170;
          const barY = y + 1;
          const barH = 12;

          // Background
          doc.roundedRect(barX, barY, barFullW, barH, 4).fill('#EEEEEE');

          // Filled portion
          const fillW = Math.max(barFullW * (rate / 100), rate > 0 ? 8 : 0);
          if (fillW > 0) {
            doc.roundedRect(barX, barY, fillW, barH, 4).fill(typeColor);
          }

          // Rate text inside bar (or next to it)
          if (rate > 15) {
            doc.font(bodyFont).fontSize(7).fillColor(COLORS.white)
               .text(`${Math.round(rate)}%`, barX + 4, barY + 2, { width: fillW - 8, align: 'center' });
          } else if (rate > 0) {
            doc.font(bodyFont).fontSize(7).fillColor(typeColor)
               .text(`${Math.round(rate)}%`, barX + fillW + 4, barY + 2);
          }

          y += barH + 4;

          // Stats line
          doc.font(bodyFont).fontSize(7).fillColor(COLORS.textLight)
             .text(`${item.sent || 0} enviados \u2192 ${item.responded || 0} respuestas (${Math.round(rate)}%)`,
                ML + 20, y);

          y += 20;
        }
      }

      y += 12;

      // ── Weekly Trend Section ──
      y = ensureSpace(doc, bodyFont, y, 80);

      doc.moveTo(ML + 60, y).lineTo(ML + CW - 60, y)
         .lineWidth(0.4).strokeColor(COLORS.grayLine).opacity(0.4).stroke();
      doc.opacity(1);
      y += 16;

      doc.font(titleFont).fontSize(10).fillColor(COLORS.textDark)
         .text('TENDENCIA SEMANAL', ML, y, { characterSpacing: 1.5 });
      y += 22;

      const weeklyTrend = scoreboard.weeklyTrend || [];

      if (weeklyTrend.length === 0) {
        doc.font(bodyFont).fontSize(9).fillColor(COLORS.textLight)
           .text('Sin datos de tendencia disponibles', ML + 12, y);
        y += 24;
      } else {
        for (let i = 0; i < weeklyTrend.length; i++) {
          y = ensureSpace(doc, bodyFont, y, 28);
          const week = weeklyTrend[i];
          const rate = week.rate || 0;

          // Determine trend arrow
          let arrow = '';
          let arrowColor = COLORS.textLight;
          if (i > 0) {
            const prevRate = weeklyTrend[i - 1].rate || 0;
            if (rate > prevRate) {
              arrow = ' \u2191';
              arrowColor = COLORS.green;
            } else if (rate < prevRate) {
              arrow = ' \u2193';
              arrowColor = COLORS.red;
            } else {
              arrow = ' \u2192';
              arrowColor = COLORS.textLight;
            }
          }

          // Row background (alternating)
          if (i % 2 === 0) {
            doc.roundedRect(ML + 2, y - 3, CW - 4, 22, 3).fill(COLORS.grayBg);
          }

          // Week label
          doc.font(bodyFont).fontSize(9).fillColor(COLORS.textDark)
             .text(week.week || `Semana ${i + 1}`, ML + 12, y + 1, { width: 200, lineBreak: false });

          // Rate + stats
          const statsText = `${week.sent || 0} enviados, ${week.responded || 0} respuestas`;
          doc.font(bodyFont).fontSize(8).fillColor(COLORS.textLight)
             .text(statsText, ML + 220, y + 2, { width: 180, lineBreak: false });

          // Rate value with arrow
          doc.font(titleFont).fontSize(10).fillColor(COLORS.pink)
             .text(`${Math.round(rate)}%`, ML + CW - 80, y + 1, { width: 40, align: 'right', lineBreak: false });

          if (arrow) {
            doc.font(titleFont).fontSize(12).fillColor(arrowColor)
               .text(arrow, ML + CW - 35, y - 1, { width: 30, lineBreak: false });
          }

          y += 24;
        }
      }

      // ── Bottom decoration
      y += 16;
      y = ensureSpace(doc, bodyFont, y, 30);
      doc.moveTo(ML + 60, y).lineTo(ML + CW - 60, y)
         .lineWidth(0.4).strokeColor(COLORS.grayLine).opacity(0.3).stroke();
      doc.opacity(1);
      y += 12;
      doc.font(bodyFont).fontSize(7).fillColor(COLORS.textLight)
         .text(`Generado: ${formatDateShort(reportDate)}`, ML, y, { width: CW, align: 'center' });

      // ── Finalize
      doc.end();

      stream.on('finish', () => {
        // Serve directly from backend (no Cloudinary — it blocks raw PDFs)
        const url = `${getBaseUrl()}/sales-digests/${filename}`;
        log('info', 'sales_digest.generated', { url });
        resolve({ filepath, filename, url, pdfUrl: url });
      });

      stream.on('error', reject);
    } catch (error) {
      logError('sales_digest.error', error);
      reject(error);
    }
  });
}

export default {
  generateSalesDigestPDF
};
