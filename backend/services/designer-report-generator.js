/**
 * Designer Task Report PDF Generator
 * Generates AXKAN-branded daily and weekly reports for designer task tracking
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log, logError } from '../shared/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Assets — deployed in backend/assets/
const ASSETS = {
  logo: path.join(__dirname, '../assets/images/JAGUAR_LETTERS.png'),
  fontTitle: path.join(__dirname, '../assets/fonts/RLAQVA.otf'),
  fontBody: path.join(__dirname, '../assets/fonts/FONT-OBJEKTIV-VF-BODY.otf')
};

// AXKAN Brand Colors
const COLORS = {
  pink: '#E91E63',
  pinkDeep: '#AD1457',
  pinkPale: '#FDF2F8',
  green: '#7CB342',
  greenLight: '#E8F5E9',
  orange: '#FF9800',
  orangeLight: '#FFF3E0',
  cyan: '#00BCD4',
  cyanLight: '#E0F7FA',
  red: '#F44336',
  redLight: '#FFEBEE',
  text: '#555555',
  textDark: '#333333',
  textLight: '#999999',
  white: '#FFFFFF',
  grayLine: '#E0E0E0',
  grayBg: '#F6F6F6'
};

const BAND = [COLORS.pink, COLORS.green, COLORS.orange, COLORS.cyan, COLORS.red];

// Output directory
const REPORTS_DIR = path.join(__dirname, '../designer-reports');
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

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

function formatDateCompact(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-MX', {
    month: 'short', day: 'numeric'
  });
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
  // bottom: 0 prevents PDFKit auto-paging when we draw footer near page bottom
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
 * Draw a rounded summary card
 */
function drawSummaryCard(doc, titleFont, bodyFont, x, y, w, h, bgColor, value, label) {
  // Card background
  doc.roundedRect(x, y, w, h, 8).fill(bgColor);

  // Value (big number, white)
  doc.font(titleFont).fontSize(22).fillColor(COLORS.white)
     .text(String(value), x, y + 10, { width: w, align: 'center' });

  // Label (small, white with slight transparency feel)
  doc.font(bodyFont).fontSize(7).fillColor(COLORS.white)
     .text(label.toUpperCase(), x, y + 38, { width: w, align: 'center', characterSpacing: 1 });
}

/**
 * Status badge renderer
 */
function drawStatusBadge(doc, bodyFont, x, y, status) {
  const statusConfig = {
    'done':       { label: 'Completado',  color: COLORS.green,  bg: COLORS.greenLight,  icon: '\u2713' },
    'completed':  { label: 'Completado',  color: COLORS.green,  bg: COLORS.greenLight,  icon: '\u2713' },
    'pending':    { label: 'Pendiente',   color: COLORS.orange, bg: COLORS.orangeLight, icon: '\u25CB' },
    'correction': { label: 'Corrección',  color: COLORS.red,    bg: COLORS.redLight,    icon: '\u21BB' },
    'delivered':  { label: 'Entregado',   color: COLORS.cyan,   bg: COLORS.cyanLight,   icon: '\u2191' }
  };

  const cfg = statusConfig[status] || statusConfig['pending'];
  const badgeW = 68;
  const badgeH = 14;

  doc.roundedRect(x, y - 1, badgeW, badgeH, 4).fill(cfg.bg);
  doc.font(bodyFont).fontSize(7).fillColor(cfg.color)
     .text(`${cfg.icon} ${cfg.label}`, x + 4, y + 2, { width: badgeW - 8, align: 'center' });
}


// ════════════════════════════════════════════════════════════
//  DAILY REPORT
// ════════════════════════════════════════════════════════════

/**
 * Generate a daily designer task report PDF
 * @param {Object} data - Report data (designers, totals)
 * @param {string} date - Date string YYYY-MM-DD
 * @returns {Promise<{filepath, filename, url}>}
 */
export async function generateDailyReport(data, date) {
  return new Promise((resolve, reject) => {
    try {
      const reportDate = date || data.date || new Date().toISOString().split('T')[0];
      const filename = `reporte-diario-${reportDate}.pdf`;
      const filepath = path.join(REPORTS_DIR, filename);

      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 10, bottom: 0, left: ML, right: MR },
        autoFirstPage: false
      });

      const { titleFont, bodyFont } = registerFonts(doc);

      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // ── Page 1
      newPage(doc, bodyFont);
      let y = drawHeader(doc, titleFont, bodyFont,
        'REPORTE DIARIO DE PRODUCCIÓN',
        formatDateShort(reportDate)
      );

      // ── Summary cards row
      const totals = data.totals || {};
      const cardW = (CW - 30) / 4;
      const cardH = 54;
      const cardGap = 10;
      const cards = [
        { value: totals.assigned || 0,    label: 'Asignadas',    bg: COLORS.cyan },
        { value: totals.completed || 0,   label: 'Completadas',  bg: COLORS.green },
        { value: totals.pending || 0,     label: 'Pendientes',   bg: COLORS.orange },
        { value: totals.corrections || 0, label: 'Correcciones', bg: COLORS.red }
      ];

      for (let i = 0; i < cards.length; i++) {
        const cx = ML + i * (cardW + cardGap);
        drawSummaryCard(doc, titleFont, bodyFont, cx, y, cardW, cardH, cards[i].bg, cards[i].value, cards[i].label);
      }
      y += cardH + 28;

      // ── Per-designer sections
      const designers = data.designers || [];
      for (const designer of designers) {
        // Estimate space: header(28) + table header(20) + rows(22 each) + padding(16)
        const sectionHeight = 28 + 20 + (designer.tasks || []).length * 22 + 16;
        y = ensureSpace(doc, bodyFont, y, Math.min(sectionHeight, 120));

        // Designer name header
        doc.roundedRect(ML, y, CW, 22, 4).fill(COLORS.pinkPale);
        doc.roundedRect(ML, y, 4, 22, 2).fill(COLORS.pink);
        doc.font(titleFont).fontSize(10).fillColor(COLORS.pink)
           .text(designer.name.toUpperCase(), ML + 14, y + 5);

        // Completed / Pending counts
        const summaryText = `${designer.totalCompleted || 0} completadas  \u2022  ${designer.totalPending || 0} pendientes`;
        doc.font(bodyFont).fontSize(7.5).fillColor(COLORS.textLight)
           .text(summaryText, ML + 14, y + 5, { width: CW - 28, align: 'right' });
        y += 30;

        // Table header — 5 columns
        const colTask = ML + 8;
        const colProduct = ML + 100;
        const colDest = ML + 230;
        const colQty = ML + 370;
        const colStatus = ML + CW - 80;

        doc.font(bodyFont).fontSize(6).fillColor('#B0B0B0');
        doc.text('TAREA', colTask, y);
        doc.text('PRODUCTO', colProduct, y);
        doc.text('DESTINO', colDest, y);
        doc.text('CANTIDAD', colQty, y);
        doc.text('STATUS', colStatus, y);

        y += 4;
        doc.moveTo(ML + 4, y).lineTo(ML + CW - 4, y)
           .lineWidth(0.4).strokeColor(COLORS.grayLine).opacity(0.5).stroke();
        doc.opacity(1);
        y += 10;

        // Task rows
        const tasks = designer.tasks || [];
        for (let i = 0; i < tasks.length; i++) {
          y = ensureSpace(doc, bodyFont, y, 24);

          const task = tasks[i];

          // Alternating row background
          if (i % 2 === 0) {
            doc.roundedRect(ML + 2, y - 2, CW - 4, 20, 3).fill(COLORS.grayBg);
          }

          // Task type (armado, diseño, etc.)
          doc.font(bodyFont).fontSize(8).fillColor(COLORS.textDark)
             .text(task.taskType || '-', colTask, y + 2, { width: 88, lineBreak: false });

          // Product type (imanes, destapadores, etc.)
          doc.font(bodyFont).fontSize(8).fillColor(COLORS.text)
             .text(task.productType || '-', colProduct, y + 2, { width: 125, lineBreak: false });

          // Destination
          doc.font(bodyFont).fontSize(8).fillColor(COLORS.text)
             .text(task.destination || '-', colDest, y + 2, { width: 130, lineBreak: false });

          // Quantity — show pieces progress if available
          let qtyText = '';
          if (task.quantity) {
            qtyText = String(task.quantity);
          } else if (task.pieces) {
            qtyText = `${task.piecesDelivered || 0}/${task.pieces}`;
          }
          doc.font(bodyFont).fontSize(8).fillColor(COLORS.text)
             .text(qtyText, colQty, y + 2, { width: 50, lineBreak: false });

          // Status badge
          drawStatusBadge(doc, bodyFont, colStatus, y + 1, task.status);

          y += 22;
        }

        y += 16;
      }

      // ── Finalize
      doc.end();

      stream.on('finish', () => {
        const url = `${getBaseUrl()}/designer-reports/${filename}`;
        log('info', 'designer_report.daily.generated', { filename });
        resolve({ filepath, filename, url });
      });

      stream.on('error', reject);
    } catch (error) {
      logError('designer_report.daily.error', error);
      reject(error);
    }
  });
}


// ════════════════════════════════════════════════════════════
//  WEEKLY REPORT
// ════════════════════════════════════════════════════════════

/**
 * Generate a weekly designer performance report PDF
 * @param {Object} data - Report data (designers, totals, insights)
 * @returns {Promise<{filepath, filename, url}>}
 */
export async function generateWeeklyReport(data) {
  return new Promise((resolve, reject) => {
    try {
      const weekStart = data.weekStart;
      const weekEnd = data.weekEnd;
      const filename = `reporte-semanal-${weekStart}-a-${weekEnd}.pdf`;
      const filepath = path.join(REPORTS_DIR, filename);

      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 10, bottom: 0, left: ML, right: MR },
        autoFirstPage: false
      });

      const { titleFont, bodyFont } = registerFonts(doc);

      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // ════════════════════════════════════════
      // PAGE 1 — Dashboard
      // ════════════════════════════════════════
      newPage(doc, bodyFont);
      let y = drawHeader(doc, titleFont, bodyFont,
        'REPORTE SEMANAL',
        `${formatDateCompact(weekStart)} \u2013 ${formatDateShort(weekEnd)}`
      );

      // Summary cards
      const totals = data.totals || {};
      const cardW = (CW - 30) / 4;
      const cardH = 54;
      const cardGap = 10;

      const completionPct = totals.completionRate != null
        ? Math.round(totals.completionRate * 100) + '%'
        : '0%';
      const avgTurnaround = totals.avgTurnaround != null
        ? totals.avgTurnaround + 'h'
        : '-';

      const weekCards = [
        { value: totals.tasks || 0,          label: 'Total Tareas',      bg: COLORS.cyan },
        { value: completionPct,              label: 'Tasa Completado',   bg: COLORS.green },
        { value: avgTurnaround,              label: 'Tiempo Promedio',   bg: COLORS.orange },
        { value: totals.totalCorrections || 0, label: 'Correcciones',   bg: COLORS.red }
      ];

      for (let i = 0; i < weekCards.length; i++) {
        const cx = ML + i * (cardW + cardGap);
        drawSummaryCard(doc, titleFont, bodyFont, cx, y, cardW, cardH, weekCards[i].bg, weekCards[i].value, weekCards[i].label);
      }
      y += cardH + 30;

      // Completion rate visual bar
      const barW = CW - 80;
      const barH = 18;
      const barX = ML + 40;
      const completionVal = (totals.completionRate || 0);

      doc.font(bodyFont).fontSize(7).fillColor(COLORS.textLight)
         .text('TASA DE COMPLETADO', ML, y, { width: CW, align: 'center', characterSpacing: 1.5 });
      y += 16;

      // Bar background
      doc.roundedRect(barX, y, barW, barH, 6).fill('#EEEEEE');

      // Filled portion
      const filledW = Math.max(barW * completionVal, 12);
      doc.roundedRect(barX, y, filledW, barH, 6).fill(COLORS.green);

      // Percentage label inside bar
      doc.font(titleFont).fontSize(9).fillColor(COLORS.white)
         .text(completionPct, barX, y + 3, { width: filledW, align: 'center' });

      y += barH + 30;

      // ── Weekly breakdown divider
      doc.moveTo(ML + 60, y).lineTo(ML + CW - 60, y)
         .lineWidth(0.4).strokeColor(COLORS.grayLine).opacity(0.4).stroke();
      doc.opacity(1);
      y += 12;

      doc.font(titleFont).fontSize(9).fillColor(COLORS.textDark)
         .text('RESUMEN POR DISEÑADOR', ML, y, { width: CW, align: 'center', characterSpacing: 2 });
      y += 28;

      // Quick designer stats table on page 1
      const designers = data.designers || [];

      // Table header
      const dColName = ML + 10;
      const dColArmados = ML + 140;
      const dColDisenos = ML + 220;
      const dColTotal = ML + 300;
      const dColAvg = ML + 370;
      const dColCorr = ML + CW - 50;

      doc.font(bodyFont).fontSize(6).fillColor('#B0B0B0');
      doc.text('DISEÑADOR', dColName, y);
      doc.text('ARMADOS', dColArmados, y);
      doc.text('DISEÑOS', dColDisenos, y);
      doc.text('TOTAL', dColTotal, y);
      doc.text('PROMEDIO', dColAvg, y);
      doc.text('CORREC.', dColCorr, y);
      y += 4;
      doc.moveTo(ML + 4, y).lineTo(ML + CW - 4, y)
         .lineWidth(0.4).strokeColor(COLORS.pink).opacity(0.2).stroke();
      doc.opacity(1);
      y += 12;

      for (let i = 0; i < designers.length; i++) {
        y = ensureSpace(doc, bodyFont, y, 24);
        const d = designers[i];

        if (i % 2 === 0) {
          doc.roundedRect(ML + 2, y - 3, CW - 4, 22, 3).fill(COLORS.grayBg);
        }

        doc.font(titleFont).fontSize(9).fillColor(COLORS.pink)
           .text(d.name, dColName, y + 1, { width: 125, lineBreak: false });
        doc.font(bodyFont).fontSize(9).fillColor(COLORS.text)
           .text(String(d.armadosCompleted || 0), dColArmados, y + 1, { width: 60, lineBreak: false });
        doc.font(bodyFont).fontSize(9).fillColor(COLORS.text)
           .text(String(d.disenosCompleted || 0), dColDisenos, y + 1, { width: 60, lineBreak: false });
        doc.font(titleFont).fontSize(9).fillColor(COLORS.textDark)
           .text(String(d.totalTasks || 0), dColTotal, y + 1, { width: 50, lineBreak: false });

        const avgText = d.avgTurnaroundHours != null ? d.avgTurnaroundHours.toFixed(1) + 'h' : '-';
        doc.font(bodyFont).fontSize(9).fillColor(COLORS.text)
           .text(avgText, dColAvg, y + 1, { width: 50, lineBreak: false });

        const corrRate = d.correctionRate != null ? Math.round(d.correctionRate * 100) + '%' : '-';
        const corrColor = (d.correctionRate || 0) > 0.2 ? COLORS.red : COLORS.text;
        doc.font(bodyFont).fontSize(9).fillColor(corrColor)
           .text(corrRate, dColCorr, y + 1, { width: 50, lineBreak: false });

        y += 24;
      }

      // ════════════════════════════════════════
      // PAGE 2 — Per Designer Detail
      // ════════════════════════════════════════
      newPage(doc, bodyFont);
      y = 24;

      doc.font(titleFont).fontSize(11).fillColor(COLORS.pink)
         .text('DETALLE POR DISEÑADOR', ML, y, { width: CW, align: 'center', characterSpacing: 2 });
      y += 30;

      // Day labels for bar charts
      const dayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

      // Render designers in 2-column layout
      const colWidth = (CW - 20) / 2;
      const colX = [ML, ML + colWidth + 20];

      let rowStartY = y;
      for (let di = 0; di < designers.length; di++) {
        const d = designers[di];
        const col = di % 2;
        const cx = colX[col];

        // Start new row every 2 designers
        if (col === 0) {
          if (di > 0) y += 10;
          y = ensureSpace(doc, bodyFont, y, 195);
          rowStartY = y;
        }
        const useY = rowStartY;

        // Card background
        const cardTotalH = 180;
        doc.roundedRect(cx, useY, colWidth, cardTotalH, 8)
           .lineWidth(0.5).strokeColor(COLORS.grayLine).stroke();

        // Name header bar
        doc.save();
        doc.roundedRect(cx, useY, colWidth, cardTotalH, 8).clip();
        doc.rect(cx, useY, colWidth, 26).fill(COLORS.pink);
        doc.restore();
        doc.font(titleFont).fontSize(10).fillColor(COLORS.white)
           .text(d.name.toUpperCase(), cx + 10, useY + 7, { width: colWidth - 20 });

        let cy = useY + 34;

        // Stats grid (2x2)
        const statW = (colWidth - 24) / 2;
        const stats = [
          { label: 'Armados', value: d.armadosCompleted || 0, color: COLORS.green },
          { label: 'Diseños', value: d.disenosCompleted || 0, color: COLORS.cyan },
          { label: 'Promedio', value: d.avgTurnaroundHours != null ? d.avgTurnaroundHours.toFixed(1) + 'h' : '-', color: COLORS.orange },
          { label: 'Correcciones', value: d.correctionRate != null ? Math.round(d.correctionRate * 100) + '%' : '-', color: (d.correctionRate || 0) > 0.2 ? COLORS.red : COLORS.text }
        ];

        for (let si = 0; si < stats.length; si++) {
          const sx = cx + 12 + (si % 2) * (statW + 4);
          const sy = cy + Math.floor(si / 2) * 30;

          doc.font(titleFont).fontSize(14).fillColor(stats[si].color)
             .text(String(stats[si].value), sx, sy);
          doc.font(bodyFont).fontSize(6.5).fillColor(COLORS.textLight)
             .text(stats[si].label.toUpperCase(), sx, sy + 16, { characterSpacing: 0.5 });
        }

        cy += 66;

        // Daily output bar chart
        doc.font(bodyFont).fontSize(6).fillColor(COLORS.textLight)
           .text('PRODUCCIÓN DIARIA', cx + 12, cy, { characterSpacing: 0.8 });
        cy += 12;

        const dailyOutput = d.dailyOutput || [0, 0, 0, 0, 0, 0, 0];
        const maxOutput = Math.max(...dailyOutput, 1);
        const barAreaW = colWidth - 30;
        const singleBarW = Math.floor(barAreaW / 7) - 4;
        const maxBarH = 40;
        const chartColors = [COLORS.pink, COLORS.green, COLORS.orange, COLORS.cyan, COLORS.red, COLORS.pink, COLORS.green];

        for (let bi = 0; bi < 7; bi++) {
          const bx = cx + 15 + bi * (singleBarW + 4);
          const bh = Math.max((dailyOutput[bi] / maxOutput) * maxBarH, 2);
          const by = cy + maxBarH - bh;

          doc.roundedRect(bx, by, singleBarW, bh, 2).fill(chartColors[bi]);

          // Value on top of bar
          if (dailyOutput[bi] > 0) {
            doc.font(bodyFont).fontSize(6).fillColor(COLORS.textDark)
               .text(String(dailyOutput[bi]), bx, by - 10, { width: singleBarW, align: 'center' });
          }

          // Day label below
          doc.font(bodyFont).fontSize(5.5).fillColor(COLORS.textLight)
             .text(dayLabels[bi], bx, cy + maxBarH + 4, { width: singleBarW, align: 'center' });
        }

        // Advance y after completing a row of 2 (or last designer if odd count)
        if (col === 1 || di === designers.length - 1) {
          y = rowStartY + cardTotalH + 10;
        }
      }

      // ════════════════════════════════════════
      // PAGE 3 — AI Insights
      // ════════════════════════════════════════
      newPage(doc, bodyFont);
      y = 24;

      // Header
      doc.font(titleFont).fontSize(14).fillColor(COLORS.pink)
         .text('ANÁLISIS IA', ML, y);
      y += 22;

      // Pink accent line
      doc.moveTo(ML, y).lineTo(ML + 80, y)
         .lineWidth(2.5).strokeColor(COLORS.pink).stroke();
      doc.moveTo(ML + 82, y).lineTo(ML + CW, y)
         .lineWidth(0.3).strokeColor(COLORS.grayLine).stroke();
      y += 24;

      // Subtitle
      doc.font(bodyFont).fontSize(8.5).fillColor(COLORS.textLight)
         .text('Observaciones generadas automáticamente a partir de los datos de producción de la semana.', ML, y, { width: CW });
      y += 28;

      const insights = data.insights || [];
      const insightColors = [COLORS.pink, COLORS.cyan];

      for (let i = 0; i < insights.length; i++) {
        y = ensureSpace(doc, bodyFont, y, 60);

        const bulletColor = insightColors[i % insightColors.length];

        // Numbered circle
        const circleX = ML + 14;
        const circleY = y + 8;
        doc.circle(circleX, circleY, 10).fill(bulletColor);
        doc.font(titleFont).fontSize(10).fillColor(COLORS.white)
           .text(String(i + 1), circleX - 10, circleY - 5, { width: 20, align: 'center' });

        // Insight text
        const textX = ML + 34;
        const textW = CW - 44;

        // Card background for each insight
        doc.roundedRect(textX, y - 4, textW, 44, 6).fill(COLORS.grayBg);

        doc.font(bodyFont).fontSize(9.5).fillColor(COLORS.textDark)
           .text(insights[i], textX + 12, y + 6, { width: textW - 24, lineGap: 3 });

        y += 54;
      }

      // If no insights, show placeholder
      if (insights.length === 0) {
        doc.font(bodyFont).fontSize(10).fillColor(COLORS.textLight)
           .text('No hay insights disponibles para esta semana.', ML, y, { width: CW, align: 'center' });
      }

      // ── Bottom decoration
      y = ensureSpace(doc, bodyFont, y, 40);
      y += 20;
      doc.moveTo(ML + 60, y).lineTo(ML + CW - 60, y)
         .lineWidth(0.4).strokeColor(COLORS.grayLine).opacity(0.3).stroke();
      doc.opacity(1);
      y += 14;
      doc.font(bodyFont).fontSize(7).fillColor(COLORS.textLight)
         .text(`Semana del ${formatDateCompact(weekStart)} al ${formatDateShort(weekEnd)}`, ML, y, { width: CW, align: 'center' });

      // ── Finalize
      doc.end();

      stream.on('finish', () => {
        const url = `${getBaseUrl()}/designer-reports/${filename}`;
        log('info', 'designer_report.weekly.generated', { filename });
        resolve({ filepath, filename, url });
      });

      stream.on('error', reject);
    } catch (error) {
      logError('designer_report.weekly.error', error);
      reject(error);
    }
  });
}

export default {
  generateDailyReport,
  generateWeeklyReport
};
