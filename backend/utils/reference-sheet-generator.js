/**
 * Reference Sheet PDF Generator
 * Generates PDF reference sheets for laser-cut souvenir orders
 * Used to track approved designs and quantities during production
 */

import PDFDocument from 'pdfkit';
import https from 'https';
import http from 'http';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/index.js';

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
 * Generate a reference sheet PDF for an order
 * @param {Object} order - Order data with items and attachments
 * @returns {Promise<Buffer>} - PDF buffer
 */
export async function generateReferenceSheet(order) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: `Hoja de Referencia - ${order.orderNumber || order.order_number}`,
          Author: 'AXKAN Sistema de Pedidos',
          Subject: 'Hoja de referencia para produccion'
        }
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Page dimensions
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 40;
      const contentWidth = pageWidth - (margin * 2);

      // Colors (AXKAN brand)
      const primaryColor = '#E91E63';
      const secondaryColor = '#7CB342';
      const grayColor = '#6B7280';
      const lightGray = '#F3F4F6';

      // ========================================
      // HEADER
      // ========================================

      // Title bar
      doc.rect(0, 0, pageWidth, 80)
         .fill(primaryColor);

      doc.fontSize(24)
         .fillColor('white')
         .font('Helvetica-Bold')
         .text('HOJA DE REFERENCIA', margin, 25, { align: 'center', width: contentWidth });

      doc.fontSize(12)
         .text('PRODUCCION Y CONTEO', margin, 52, { align: 'center', width: contentWidth });

      // Order info bar
      doc.rect(0, 80, pageWidth, 50)
         .fill(lightGray);

      const orderNumber = order.orderNumber || order.order_number || 'N/A';
      const clientName = order.clientName || order.client_name || 'N/A';
      const eventDate = order.eventDate || order.event_date;
      const eventType = order.eventType || order.event_type || '';

      let formattedDate = 'N/A';
      if (eventDate) {
        try {
          formattedDate = format(new Date(eventDate), 'dd MMM yyyy', { locale: es });
        } catch (e) {
          formattedDate = eventDate;
        }
      }

      doc.fontSize(11)
         .fillColor(grayColor)
         .font('Helvetica-Bold')
         .text(`Pedido: ${orderNumber}`, margin, 92)
         .text(`Cliente: ${clientName}`, margin + 180, 92)
         .text(`Evento: ${eventType || 'N/A'}`, margin + 360, 92);

      doc.fontSize(10)
         .font('Helvetica')
         .text(`Fecha evento: ${formattedDate}`, margin, 108)
         .text(`Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, margin + 360, 108);

      // ========================================
      // ITEMS GRID
      // ========================================

      let yPosition = 150;
      const items = order.items || [];
      const attachments = order.orderAttachments || order.order_attachments || [];

      // Parse attachments if string
      let parsedAttachments = attachments;
      if (typeof attachments === 'string') {
        try {
          parsedAttachments = JSON.parse(attachments);
        } catch (e) {
          parsedAttachments = [];
        }
      }

      // Section title
      doc.fontSize(14)
         .fillColor(primaryColor)
         .font('Helvetica-Bold')
         .text('PRODUCTOS DEL PEDIDO', margin, yPosition);

      yPosition += 25;

      // Draw each item
      const cellWidth = (contentWidth - 20) / 2; // 2 columns with gap
      const cellHeight = 200;
      const cellGap = 20;
      let currentX = margin;
      let itemsInRow = 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // Check if need new page
        if (yPosition + cellHeight > pageHeight - margin) {
          doc.addPage();
          yPosition = margin;
        }

        // Draw cell background
        doc.rect(currentX, yPosition, cellWidth, cellHeight)
           .lineWidth(1)
           .stroke('#E5E7EB');

        // Item header with product name
        doc.rect(currentX, yPosition, cellWidth, 30)
           .fill(secondaryColor);

        const productName = item.productName || item.product_name || item.name || 'Producto';
        doc.fontSize(11)
           .fillColor('white')
           .font('Helvetica-Bold')
           .text(productName, currentX + 8, yPosition + 9, {
             width: cellWidth - 16,
             ellipsis: true
           });

        // Quantity info
        const quantity = item.quantity || 0;
        doc.fontSize(10)
           .fillColor(grayColor)
           .font('Helvetica')
           .text(`Cantidad requerida: ${quantity} piezas`, currentX + 8, yPosition + 40);

        // Image placeholder area
        const imageAreaY = yPosition + 60;
        const imageAreaHeight = 80;

        doc.rect(currentX + 8, imageAreaY, cellWidth - 16, imageAreaHeight)
           .lineWidth(0.5)
           .dash(3, { space: 3 })
           .stroke('#D1D5DB')
           .undash();

        doc.fontSize(9)
           .fillColor('#9CA3AF')
           .text('Espacio para imagen de referencia', currentX + 8, imageAreaY + 35, {
             width: cellWidth - 16,
             align: 'center'
           });

        // Editable fields section
        const fieldsY = yPosition + 150;

        doc.fontSize(9)
           .fillColor(grayColor)
           .font('Helvetica-Bold');

        // Counted field
        doc.text('Contados:', currentX + 8, fieldsY);
        doc.rect(currentX + 60, fieldsY - 3, cellWidth - 75, 14)
           .fill('#F9FAFB')
           .stroke('#E5E7EB');

        // Boxes field
        doc.text('Cajas:', currentX + 8, fieldsY + 18);
        doc.rect(currentX + 60, fieldsY + 15, cellWidth - 75, 14)
           .fill('#F9FAFB')
           .stroke('#E5E7EB');

        // Move to next cell position
        itemsInRow++;
        if (itemsInRow >= 2) {
          // Move to next row
          yPosition += cellHeight + cellGap;
          currentX = margin;
          itemsInRow = 0;
        } else {
          // Move to next column
          currentX += cellWidth + cellGap;
        }
      }

      // Reset position after items
      if (itemsInRow > 0) {
        yPosition += cellHeight + cellGap;
      }

      // ========================================
      // ATTACHMENTS SECTION (if any)
      // ========================================

      if (parsedAttachments && parsedAttachments.length > 0) {
        // Check if need new page
        if (yPosition + 150 > pageHeight - margin) {
          doc.addPage();
          yPosition = margin;
        }

        doc.fontSize(14)
           .fillColor(primaryColor)
           .font('Helvetica-Bold')
           .text('DISENOS ADJUNTOS', margin, yPosition);

        yPosition += 25;

        // Download and add images
        const imageWidth = 150;
        const imageHeight = 120;
        currentX = margin;
        itemsInRow = 0;

        for (let i = 0; i < Math.min(parsedAttachments.length, 6); i++) {
          const att = parsedAttachments[i];
          const imageUrl = att.url || att;

          // Check if need new page
          if (yPosition + imageHeight + 30 > pageHeight - margin) {
            doc.addPage();
            yPosition = margin;
          }

          try {
            // Try to download and embed image
            const imageBuffer = await downloadImage(imageUrl);

            doc.image(imageBuffer, currentX, yPosition, {
              fit: [imageWidth, imageHeight],
              align: 'center',
              valign: 'center'
            });

            // Image border
            doc.rect(currentX, yPosition, imageWidth, imageHeight)
               .lineWidth(1)
               .stroke('#E5E7EB');

            // Image label
            doc.fontSize(8)
               .fillColor(grayColor)
               .text(`Diseno ${i + 1}`, currentX, yPosition + imageHeight + 5, {
                 width: imageWidth,
                 align: 'center'
               });

          } catch (err) {
            console.warn(`Could not download image ${i + 1}:`, err.message);

            // Draw placeholder
            doc.rect(currentX, yPosition, imageWidth, imageHeight)
               .fill('#F9FAFB')
               .stroke('#E5E7EB');

            doc.fontSize(9)
               .fillColor('#9CA3AF')
               .text(`Imagen ${i + 1}\n(no disponible)`, currentX, yPosition + 45, {
                 width: imageWidth,
                 align: 'center'
               });
          }

          // Move to next position
          itemsInRow++;
          if (itemsInRow >= 3) {
            yPosition += imageHeight + 30;
            currentX = margin;
            itemsInRow = 0;
          } else {
            currentX += imageWidth + 15;
          }
        }
      }

      // ========================================
      // FOOTER / NOTES SECTION
      // ========================================

      // Add notes section at the bottom
      if (yPosition + 100 > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      } else {
        yPosition += 40;
      }

      doc.fontSize(12)
         .fillColor(grayColor)
         .font('Helvetica-Bold')
         .text('NOTAS DE PRODUCCION:', margin, yPosition);

      yPosition += 20;

      // Notes box
      doc.rect(margin, yPosition, contentWidth, 60)
         .fill('#F9FAFB')
         .stroke('#E5E7EB');

      // Client notes if any
      const clientNotes = order.clientNotes || order.client_notes || order.notes || '';
      if (clientNotes) {
        doc.fontSize(9)
           .fillColor(grayColor)
           .font('Helvetica')
           .text(clientNotes, margin + 10, yPosition + 10, {
             width: contentWidth - 20,
             height: 50,
             ellipsis: true
           });
      }

      // Footer
      doc.fontSize(8)
         .fillColor('#9CA3AF')
         .text('AXKAN - Sistema de Pedidos | Hoja de Referencia para Produccion',
               margin, pageHeight - 30, {
                 width: contentWidth,
                 align: 'center'
               });

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
