import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure receipts directory exists
const RECEIPTS_DIR = path.join(__dirname, '../receipts');
if (!fs.existsSync(RECEIPTS_DIR)) {
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
}

// AXKAN Brand Colors (Mexican Pink Palette)
const COLORS = {
  pinkLight: '#E91E63',
  pinkMedium: '#C2185B',
  pinkDark: '#AD1457',
  pinkDeep: '#880E4F',
  pinkPale: '#FCE4EC',
  pinkAccent: '#F8BBD9',
  textDark: '#1f2937',
  textGray: '#6b7280',
  depositGreen: '#059669',
  depositBg: '#d1fae5',
  balanceOrange: '#b45309',
  balanceBg: '#fef3c7',
  balanceBorder: '#f59e0b'
};

// Logo path - use LOGO-01 (white/clean version for pink background)
const LOGO_PATH = path.join(__dirname, '../../frontend/assets/images/LOGO-01.png');

/**
 * Generate a PDF receipt for an order
 * @param {Object} orderData - Order information
 * @param {string} orderData.orderNumber - Unique order number
 * @param {string} orderData.clientName - Client full name
 * @param {string} orderData.clientPhone - Client phone number
 * @param {string} orderData.clientEmail - Client email
 * @param {Date} orderData.orderDate - Order creation date
 * @param {Array} orderData.items - Order items with product details
 * @param {number} orderData.totalPrice - Total order price
 * @param {number} orderData.actualDepositAmount - Actual deposit received
 * @param {number} orderData.remainingBalance - Remaining amount to be paid
 * @returns {Promise<string>} - Path to generated PDF file
 */
export async function generateReceipt(orderData) {
  return new Promise((resolve, reject) => {
    try {
      // Ensure deposit amount is a valid number
      const depositAmount = parseFloat(orderData.actualDepositAmount) || 0;
      const totalPrice = parseFloat(orderData.totalPrice) || 0;
      const remainingBalance = parseFloat(orderData.remainingBalance) || (totalPrice - depositAmount);

      console.log(`📄 PDF Generator - Order: ${orderData.orderNumber}`);
      console.log(`   Total: $${totalPrice}, Deposit: $${depositAmount}, Remaining: $${remainingBalance}`);

      // Override with validated values
      orderData.actualDepositAmount = depositAmount;
      orderData.totalPrice = totalPrice;
      orderData.remainingBalance = remainingBalance;

      const filename = `receipt-${orderData.orderNumber}-${Date.now()}.pdf`;
      const filepath = path.join(RECEIPTS_DIR, filename);

      // Create PDF document
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: {
          top: 50,
          bottom: 50,
          left: 50,
          right: 50
        }
      });

      // Pipe to file
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // Mexican pink gradient header background
      const headerHeight = 120;
      doc.rect(0, 0, doc.page.width, headerHeight)
         .fillAndStroke(COLORS.pinkMedium, COLORS.pinkMedium);

      // Add lighter pink gradient overlay effect
      doc.rect(0, 0, doc.page.width, headerHeight / 2)
         .fillOpacity(0.3)
         .fill(COLORS.pinkLight);

      doc.fillOpacity(1); // Reset opacity

      // Add AXKAN logo on the right side if it exists
      const logoSize = 70;
      const logoX = doc.page.width - 50 - logoSize; // Right-aligned with margin
      if (fs.existsSync(LOGO_PATH)) {
        try {
          doc.image(LOGO_PATH, logoX, 25, { height: logoSize });
        } catch (err) {
          console.log('⚠️ Could not load logo for PDF:', err.message);
        }
      }

      // Company header - left aligned (ALWAYS use Axkan, ignore env variable)
      doc.fontSize(32)
         .font('Helvetica-Bold')
         .fillColor('#ffffff')
         .text('Axkan', 50, 25, { width: 400, align: 'left' });

      doc.fontSize(13)
         .font('Helvetica')
         .fillColor('#FCE4EC')
         .text('Souvenirs Personalizados', 50, 62, { width: 400, align: 'left' });

      doc.fontSize(16)
         .font('Helvetica-Bold')
         .fillColor('#ffffff')
         .text('RECIBO DE PAGO', 50, 85, { width: 400, align: 'left' });

      // Reset color to black for content
      doc.fillColor('#000000');

      // Position below header
      doc.y = headerHeight + 30;

      // Receipt details box with light pink background
      const startY = doc.y;
      const boxHeight = 85;

      // Draw light pink rounded rectangle background
      doc.roundedRect(50, startY - 5, 510, boxHeight, 5)
         .fillAndStroke(COLORS.pinkPale, COLORS.pinkAccent);

      doc.fillColor('#000000'); // Reset to black

      doc.fontSize(10)
         .font('Helvetica');

      // Left column labels
      const labelX = 65;
      const valueX = 200;
      let lineY = startY + 5;

      doc.fillColor(COLORS.pinkDark).font('Helvetica');
      doc.text(`Número de Orden:`, labelX, lineY);
      doc.text(`Fecha:`, labelX, lineY + 15);
      doc.text(`Cliente:`, labelX, lineY + 30);
      doc.text(`Teléfono:`, labelX, lineY + 45);
      doc.text(`Email:`, labelX, lineY + 60);

      // Right column (values)
      doc.fillColor(COLORS.textDark).font('Helvetica-Bold');
      doc.text(orderData.orderNumber, valueX, lineY);
      doc.text(formatDate(orderData.orderDate), valueX, lineY + 15);
      doc.text(orderData.clientName, valueX, lineY + 30);
      doc.text(orderData.clientPhone, valueX, lineY + 45);
      doc.text(orderData.clientEmail || 'N/A', valueX, lineY + 60);

      // Reset color
      doc.fillColor('#000000');

      // Position after box
      doc.y = startY + boxHeight + 20;

      // Items section
      doc.font('Helvetica-Bold')
         .fontSize(12)
         .text('PRODUCTOS', 50, doc.y);

      doc.moveDown(0.5);

      // Table header with pink background
      const tableTop = doc.y;

      // Draw pink header background
      doc.rect(50, tableTop - 3, 510, 20)
         .fillAndStroke(COLORS.pinkPale, COLORS.pinkLight);

      // Header text in dark pink
      doc.fontSize(9)
         .font('Helvetica-Bold')
         .fillColor(COLORS.pinkDark)
         .text('Producto', 55, tableTop + 2)
         .text('Cantidad', 305, tableTop + 2)
         .text('Precio Unit.', 385, tableTop + 2)
         .text('Subtotal', 485, tableTop + 2);

      // Reset color
      doc.fillColor('#000000');

      // Items
      let itemY = tableTop + 25;
      doc.font('Helvetica').fontSize(9);

      orderData.items.forEach(item => {
        doc.text(item.productName, 50, itemY, { width: 240 });
        doc.text(item.quantity.toString(), 300, itemY);
        doc.text(formatCurrency(item.unitPrice), 380, itemY);
        doc.text(formatCurrency(item.lineTotal), 480, itemY);
        itemY += 20;
      });

      // Draw line before totals
      doc.moveTo(50, itemY)
         .lineTo(560, itemY)
         .stroke();

      itemY += 15;

      // Totals section - Fixed layout to prevent overlap
      doc.font('Helvetica-Bold').fontSize(11);

      // Total
      doc.fillColor('#000000');
      doc.text('TOTAL:', 300, itemY, { width: 200, align: 'left' });
      doc.text(formatCurrency(orderData.totalPrice), 300, itemY, { width: 250, align: 'right' });

      itemY += 30;

      // Deposit received box (highlighted with green)
      doc.roundedRect(280, itemY - 5, 280, 28, 3)
         .fillAndStroke(COLORS.depositBg, COLORS.depositGreen);

      doc.fontSize(11)
         .fillColor(COLORS.depositGreen)
         .font('Helvetica-Bold');
      doc.text('ANTICIPO RECIBIDO:', 290, itemY + 5, { width: 150, align: 'left' });
      doc.text(formatCurrency(orderData.actualDepositAmount), 290, itemY + 5, { width: 260, align: 'right' });

      itemY += 38;

      // Remaining balance box (highlighted with orange/amber)
      doc.roundedRect(280, itemY - 5, 280, 35, 3)
         .fillAndStroke(COLORS.balanceBg, COLORS.balanceBorder);

      doc.fontSize(13)
         .fillColor(COLORS.balanceOrange)
         .font('Helvetica-Bold');
      doc.text('SALDO RESTANTE:', 290, itemY + 5, { width: 150, align: 'left' });
      doc.text(formatCurrency(orderData.remainingBalance), 290, itemY + 5, { width: 260, align: 'right' });

      // Reset color
      doc.fillColor('#000000');

      itemY += 40;

      // Payment instructions
      doc.moveDown(2);
      doc.fontSize(10)
         .font('Helvetica')
         .fillColor(COLORS.textGray)
         .text('El saldo restante deberá ser pagado antes de la entrega del pedido.', 50, itemY, {
           width: 500,
           align: 'center'
         });

      // Footer with AXKAN branding
      doc.moveDown(3);
      doc.fontSize(9)
         .fillColor(COLORS.pinkMedium)
         .text('¡Gracias por confiar en AXKAN!', {
           align: 'center'
         });

      doc.moveDown(0.5);
      doc.fontSize(8)
         .fillColor('#9ca3af')
         .text(`Recibo generado el ${formatDate(new Date())}`, {
           align: 'center'
         });

      doc.text(`ID de Orden: ${orderData.orderNumber}`, {
        align: 'center'
      });

      // Finalize PDF
      doc.end();

      // Wait for stream to finish
      stream.on('finish', () => {
        console.log(`✅ PDF receipt generated: ${filename}`);
        resolve(filepath);
      });

      stream.on('error', (error) => {
        console.error('❌ Error writing PDF:', error);
        reject(error);
      });

    } catch (error) {
      console.error('❌ Error generating PDF:', error);
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
 * Format date in readable format
 */
function formatDate(date) {
  return new Date(date).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Get the URL path for a receipt file
 */
export function getReceiptUrl(filepath) {
  const filename = path.basename(filepath);
  return `/receipts/${filename}`;
}

/**
 * Delete a receipt file
 */
export async function deleteReceipt(filepath) {
  try {
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      console.log(`🗑️  Deleted receipt: ${filepath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Error deleting receipt:', error);
    return false;
  }
}
