/**
 * AXKAN Reference Sheet PDF Generator
 * Generates styled PDFs with AXKAN branding for souvenir production tracking
 * Matches the Python generate_axkan.py format
 */

import PDFDocument from 'pdfkit';
import https from 'https';
import http from 'http';
import { format } from 'date-fns';

// AXKAN Brand Colors
const AXKAN_COLORS = {
  pink: '#E91E63',     // A
  green: '#7CB342',    // X
  orange: '#FF9800',   // K
  cyan: '#00BCD4',     // A
  red: '#F44336',      // N
  dark: '#333333',
  light: '#F5F5F5',
  white: '#FFFFFF'
};

// Color sequence for cycling through cells
const ACCENT_COLORS = [
  AXKAN_COLORS.pink,
  AXKAN_COLORS.green,
  AXKAN_COLORS.orange,
  AXKAN_COLORS.cyan,
  AXKAN_COLORS.red
];

/**
 * Download image from URL and return as buffer
 */
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    protocol.get(url, (response) => {
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
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Generate a reference sheet PDF for an order (AXKAN ORDEN DE COMPRA format)
 * @param {Object} order - Order data with items and attachments
 * @returns {Promise<Buffer>} - PDF buffer
 */
export async function generateReferenceSheet(order) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 25,
        info: {
          Title: `AXKAN - ${order.orderNumber || order.order_number}`,
          Author: 'AXKAN Sistema de Pedidos',
          Subject: 'Orden de Compra para Produccion'
        }
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Page dimensions
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 25;
      const contentWidth = pageWidth - (margin * 2);

      // ========================================
      // HEADER - AXKAN LOGO + ORDEN DE COMPRA
      // ========================================

      let yPos = margin;

      // Draw AXKAN colorful text logo
      const axkanLetters = [
        { letter: 'A', color: AXKAN_COLORS.pink },
        { letter: 'X', color: AXKAN_COLORS.green },
        { letter: 'K', color: AXKAN_COLORS.orange },
        { letter: 'A', color: AXKAN_COLORS.cyan },
        { letter: 'N', color: AXKAN_COLORS.red }
      ];

      doc.font('Helvetica-Bold').fontSize(36);
      let logoX = margin;
      for (const item of axkanLetters) {
        doc.fillColor(item.color).text(item.letter, logoX, yPos, { continued: false });
        logoX += 28;
      }

      // Title "ORDEN DE COMPRA"
      doc.fillColor(AXKAN_COLORS.dark)
         .font('Helvetica-Bold')
         .fontSize(18)
         .text('ORDEN DE COMPRA', margin + 180, yPos + 10);

      yPos += 50;

      // ========================================
      // ORDER INFO BOX
      // ========================================

      const orderNumber = order.orderNumber || order.order_number || 'N/A';
      const clientName = order.clientName || order.client_name || 'N/A';
      const items = order.items || [];
      const numDesigns = items.length;
      const currentDate = format(new Date(), 'yyyy-MM-dd');

      // Pink bordered box with order info
      doc.strokeColor(AXKAN_COLORS.pink)
         .lineWidth(2)
         .roundedRect(margin, yPos, contentWidth, 25, 5)
         .fillAndStroke(AXKAN_COLORS.white, AXKAN_COLORS.pink);

      doc.fillColor(AXKAN_COLORS.dark)
         .font('Helvetica-Bold')
         .fontSize(10)
         .text(`Order: ${clientName} | Designs: ${numDesigns} | ${currentDate}`, margin + 10, yPos + 8);

      yPos += 35;

      // ========================================
      // INSTRUCTIONS ROW
      // ========================================

      doc.fillColor(AXKAN_COLORS.dark)
         .font('Helvetica-Bold')
         .fontSize(10)
         .text('Instructions:', margin, yPos + 5);

      // Cyan bordered instructions box
      const instrX = margin + 75;
      const instrWidth = contentWidth - 75;
      doc.strokeColor(AXKAN_COLORS.cyan)
         .lineWidth(2)
         .roundedRect(instrX, yPos, instrWidth, 25, 3)
         .fillAndStroke(AXKAN_COLORS.light, AXKAN_COLORS.cyan);

      // Add instructions text if available
      const instructions = order.clientNotes || order.client_notes || order.notes || '';
      if (instructions) {
        doc.fillColor(AXKAN_COLORS.dark)
           .font('Helvetica')
           .fontSize(10)
           .text(instructions, instrX + 5, yPos + 8, { width: instrWidth - 10 });
      }

      yPos += 35;

      // ========================================
      // CAJAS TOTALES
      // ========================================

      doc.fillColor(AXKAN_COLORS.dark)
         .font('Helvetica-Bold')
         .fontSize(14)
         .text('CAJAS TOTALES:', margin, yPos + 8);

      // Orange bordered box for total boxes
      const cajasX = margin + 130;
      doc.strokeColor(AXKAN_COLORS.orange)
         .lineWidth(3)
         .roundedRect(cajasX, yPos, 150, 35, 5)
         .fillAndStroke(AXKAN_COLORS.light, AXKAN_COLORS.orange);

      yPos += 45;

      // ========================================
      // COLORFUL SEPARATOR LINE
      // ========================================

      const segmentWidth = contentWidth / 5;
      doc.lineWidth(3);
      for (let i = 0; i < 5; i++) {
        doc.strokeColor(ACCENT_COLORS[i])
           .moveTo(margin + i * segmentWidth, yPos)
           .lineTo(margin + (i + 1) * segmentWidth, yPos)
           .stroke();
      }

      yPos += 15;

      // ========================================
      // DESIGN CARDS GRID
      // ========================================

      // Get attachments (design images)
      let attachments = order.orderAttachments || order.order_attachments || [];
      if (typeof attachments === 'string') {
        try {
          attachments = JSON.parse(attachments);
        } catch (e) {
          attachments = [];
        }
      }

      // Create design items from attachments or order items
      const designs = [];

      // If we have attachments, use those as the primary source
      if (attachments && attachments.length > 0) {
        for (let i = 0; i < attachments.length; i++) {
          const att = attachments[i];
          const item = items[i] || {};
          designs.push({
            type: item.productName || item.product_name || '',
            quantity: item.quantity || 0,
            imageUrl: att.url || att
          });
        }
      } else if (items.length > 0) {
        // Fall back to items if no attachments
        for (const item of items) {
          designs.push({
            type: item.productName || item.product_name || '',
            quantity: item.quantity || 0,
            imageUrl: null
          });
        }
      }

      // Grid settings
      const columns = 3;
      const cellSpacing = 10;
      const cellWidth = (contentWidth - (columns - 1) * cellSpacing) / columns;
      const cellHeight = 180;

      let currentX = margin;
      let currentCol = 0;

      for (let idx = 0; idx < designs.length; idx++) {
        const design = designs[idx];
        const accentColor = ACCENT_COLORS[idx % 5];

        // Check if need new page
        if (yPos + cellHeight > pageHeight - margin) {
          doc.addPage();
          yPos = margin;
        }

        // Draw cell border with accent color
        doc.strokeColor(accentColor)
           .lineWidth(2)
           .rect(currentX, yPos, cellWidth, cellHeight)
           .stroke();

        // "Tipo:" header bar
        doc.fillColor(accentColor)
           .rect(currentX, yPos, cellWidth, 18)
           .fill();

        doc.fillColor(AXKAN_COLORS.white)
           .font('Helvetica-Bold')
           .fontSize(8)
           .text('Tipo:', currentX + 5, yPos + 5);

        // Type value box
        doc.fillColor(AXKAN_COLORS.light)
           .rect(currentX + 35, yPos + 2, cellWidth - 40, 14)
           .fill();

        if (design.type) {
          doc.fillColor(AXKAN_COLORS.dark)
             .font('Helvetica')
             .fontSize(8)
             .text(design.type, currentX + 38, yPos + 5, { width: cellWidth - 45 });
        }

        // Image area
        const imageAreaY = yPos + 25;
        const imageAreaHeight = cellHeight - 90;

        if (design.imageUrl) {
          try {
            const imageBuffer = await downloadImage(design.imageUrl);
            doc.image(imageBuffer, currentX + 5, imageAreaY, {
              fit: [cellWidth - 10, imageAreaHeight],
              align: 'center',
              valign: 'center'
            });
          } catch (err) {
            console.warn(`Could not download image for design ${idx + 1}:`, err.message);
            // Draw placeholder
            doc.strokeColor('#CCCCCC')
               .lineWidth(0.5)
               .rect(currentX + 5, imageAreaY, cellWidth - 10, imageAreaHeight)
               .stroke();
            doc.fillColor('#999999')
               .font('Helvetica')
               .fontSize(9)
               .text('[Image not available]', currentX + 5, imageAreaY + imageAreaHeight / 2 - 5, {
                 width: cellWidth - 10,
                 align: 'center'
               });
          }
        } else {
          // Draw placeholder box
          doc.strokeColor('#CCCCCC')
             .lineWidth(0.5)
             .rect(currentX + 5, imageAreaY, cellWidth - 10, imageAreaHeight)
             .stroke();
          doc.fillColor('#999999')
             .font('Helvetica')
             .fontSize(9)
             .text('[No image]', currentX + 5, imageAreaY + imageAreaHeight / 2 - 5, {
               width: cellWidth - 10,
               align: 'center'
             });
        }

        // "Requeridos:" field
        const reqY = yPos + cellHeight - 55;
        doc.fillColor(AXKAN_COLORS.dark)
           .font('Helvetica-Bold')
           .fontSize(9)
           .text('Requeridos:', currentX + 5, reqY);

        doc.strokeColor(accentColor)
           .lineWidth(1)
           .roundedRect(currentX + 5, reqY + 12, cellWidth - 10, 16, 2)
           .fillAndStroke(AXKAN_COLORS.light, accentColor);

        // Show quantity value
        doc.fillColor(AXKAN_COLORS.dark)
           .font('Helvetica')
           .fontSize(10)
           .text(String(design.quantity || 0), currentX + 10, reqY + 15);

        // "Contados:" field
        const contY = reqY + 32;
        doc.fillColor(AXKAN_COLORS.dark)
           .font('Helvetica-Bold')
           .fontSize(9)
           .text('Contados:', currentX + 5, contY);

        doc.strokeColor(accentColor)
           .lineWidth(1)
           .roundedRect(currentX + 5, contY + 12, cellWidth - 10, 16, 2)
           .fillAndStroke(AXKAN_COLORS.light, accentColor);

        // Move to next cell
        currentCol++;
        if (currentCol >= columns) {
          currentCol = 0;
          currentX = margin;
          yPos += cellHeight + cellSpacing;
        } else {
          currentX += cellWidth + cellSpacing;
        }
      }

      // Finalize PDF
      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate reference sheet and return as base64
 * @param {Object} order - Order data
 * @returns {Promise<string>} - Base64 encoded PDF
 */
export async function generateReferenceSheetBase64(order) {
  const pdfBuffer = await generateReferenceSheet(order);
  return pdfBuffer.toString('base64');
}

export default {
  generateReferenceSheet,
  generateReferenceSheetBase64
};
