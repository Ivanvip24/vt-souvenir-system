import nodemailer from 'nodemailer';
import { config } from 'dotenv';

config();

// Create email transporter
let transporter;

// Connection pooling configuration for faster email sending
const connectionPool = {
  pool: true,
  maxConnections: 5,
  maxMessages: 100
};

function createTransporter() {
  if (process.env.EMAIL_SERVICE === 'sendgrid') {
    // SendGrid (recommended for cloud platforms like Render)
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY
      }
    });
  } else if (process.env.EMAIL_SERVICE === 'gmail') {
    // Gmail - Try port 465 (SSL) for cloud platforms that block port 587
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true, // Use SSL
      ...connectionPool,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      },
      tls: {
        rejectUnauthorized: false // For cloud platforms
      }
    });
  } else {
    // Generic SMTP
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_SECURE === 'true',
      ...connectionPool,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }
}

/**
 * Initialize email transporter
 */
export function initializeEmailSender() {
  try {
    console.log('📋 Email Configuration:');
    console.log(`   Service: ${process.env.EMAIL_SERVICE || 'NOT SET'}`);

    // Check for SendGrid
    if (process.env.EMAIL_SERVICE === 'sendgrid') {
      console.log(`   SendGrid API Key: ${process.env.SENDGRID_API_KEY ? 'SET' : 'NOT SET'}`);
      console.log(`   From Email: ${process.env.EMAIL_USER || 'NOT SET'}`);

      if (!process.env.SENDGRID_API_KEY || !process.env.EMAIL_USER) {
        console.error('❌ Missing SendGrid configuration!');
        console.error('   Required: SENDGRID_API_KEY and EMAIL_USER');
        return false;
      }

      transporter = createTransporter();
      console.log('✅ Email sender initialized with SendGrid');
      return true;
    }

    // Gmail configuration
    console.log(`   User: ${process.env.EMAIL_USER || 'NOT SET'}`);
    console.log(`   Password Length: ${process.env.EMAIL_PASSWORD ? process.env.EMAIL_PASSWORD.length + ' chars' : 'NOT SET'}`);
    console.log(`   SMTP: smtp.gmail.com:465 (SSL)`);

    if (!process.env.EMAIL_SERVICE || !process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.error('❌ Missing required email environment variables!');
      console.error('   💡 TIP: For Render, use SendGrid instead of Gmail (port 587 may be blocked)');
      console.error('   Set EMAIL_SERVICE=sendgrid and SENDGRID_API_KEY=your_api_key');
      return false;
    }

    if (process.env.EMAIL_SERVICE === 'gmail' && process.env.EMAIL_PASSWORD.length !== 16) {
      console.error('⚠️  WARNING: Gmail App Password should be EXACTLY 16 characters!');
      console.error('   Current length:', process.env.EMAIL_PASSWORD.length);
      console.error('   Get App Password from: https://myaccount.google.com/security');
    }

    transporter = createTransporter();
    console.log('✅ Email sender initialized (trying port 465/SSL for cloud compatibility)');
    return true;
  } catch (error) {
    console.error('❌ Error initializing email sender:', error.message);
    console.error('   Stack:', error.stack);
    return false;
  }
}

/**
 * Send email with HTML content
 * @param {Object} options - Email options
 */
export async function sendEmail({ to, subject, html, attachments = [] }) {
  try {
    if (!transporter) {
      initializeEmailSender();
    }

    const recipients = Array.isArray(to) ? to.join(', ') : to;

    const mailOptions = {
      from: `${process.env.COMPANY_NAME || 'Souvenir Management'} <${process.env.EMAIL_USER}>`,
      to: recipients,
      subject,
      html,
      attachments
    };

    console.log(`📧 Sending email to: ${recipients}`);
    console.log(`   Subject: ${subject}`);

    const info = await transporter.sendMail(mailOptions);

    console.log('✅ Email sent successfully:', info.messageId);

    return {
      success: true,
      messageId: info.messageId,
      recipients
    };

  } catch (error) {
    console.error('❌ Error sending email:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

/**
 * Send daily report via email
 * @param {string} htmlReport - HTML content of the report
 * @param {Date} date - Report date
 */
export async function sendDailyReport(htmlReport, date) {
  try {
    const recipients = process.env.REPORT_RECIPIENTS.split(',').map(email => email.trim());

    const dateStr = date.toLocaleDateString('es-MX', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const subject = `📊 Reporte Diario - ${dateStr}`;

    return await sendEmail({
      to: recipients,
      subject,
      html: htmlReport
    });

  } catch (error) {
    console.error('❌ Error sending daily report:', error);
    throw error;
  }
}

/**
 * Send weekly report via email
 * @param {string} htmlReport - HTML content of the report
 */
export async function sendWeeklyReport(htmlReport) {
  try {
    const recipients = process.env.REPORT_RECIPIENTS.split(',').map(email => email.trim());
    const subject = `📈 Reporte Semanal - Semana ${getWeekNumber(new Date())}`;

    return await sendEmail({
      to: recipients,
      subject,
      html: htmlReport
    });

  } catch (error) {
    console.error('❌ Error sending weekly report:', error);
    throw error;
  }
}

/**
 * Send monthly report via email
 * @param {string} htmlReport - HTML content of the report
 * @param {number} year - Report year
 * @param {number} month - Report month
 */
export async function sendMonthlyReport(htmlReport, year, month) {
  try {
    const recipients = process.env.REPORT_RECIPIENTS.split(',').map(email => email.trim());

    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    const subject = `📈 Reporte Mensual - ${monthNames[month - 1]} ${year}`;

    return await sendEmail({
      to: recipients,
      subject,
      html: htmlReport
    });

  } catch (error) {
    console.error('❌ Error sending monthly report:', error);
    throw error;
  }
}

/**
 * Send low margin alert email
 * @param {Array} lowMarginOrders - Array of low margin orders
 */
export async function sendLowMarginAlert(lowMarginOrders) {
  try {
    const recipients = process.env.REPORT_RECIPIENTS.split(',').map(email => email.trim());

    const ordersList = lowMarginOrders.map(order =>
      `<li><strong>${order.orderNumber}</strong> - ${order.clientName}: ${order.profitMargin.toFixed(1)}% margen</li>`
    ).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; }
          .alert { background-color: #FEF2F2; border-left: 4px solid #EF4444; padding: 20px; margin: 20px 0; }
          .alert h2 { color: #991B1B; margin-top: 0; }
          ul { margin: 15px 0; }
          li { margin: 5px 0; }
        </style>
      </head>
      <body>
        <div class="alert">
          <h2>⚠️ Alerta: Órdenes con Bajo Margen de Ganancia</h2>
          <p>Se han detectado ${lowMarginOrders.length} órdenes con margen de ganancia inferior al 20%:</p>
          <ul>
            ${ordersList}
          </ul>
          <p><strong>Acción recomendada:</strong> Revise los costos de producción y considere ajustar los precios para mantener márgenes saludables.</p>
        </div>
      </body>
      </html>
    `;

    return await sendEmail({
      to: recipients,
      subject: '⚠️ Alerta: Órdenes con Bajo Margen',
      html
    });

  } catch (error) {
    console.error('❌ Error sending low margin alert:', error);
    throw error;
  }
}

/**
 * Send order confirmation to client
 * @param {Object} order - Order details
 * @param {Object} client - Client information
 */
export async function sendOrderConfirmation(order, client) {
  try {
    if (!client.email) {
      console.log('⚠️  Client email not provided, skipping confirmation');
      return { success: false, reason: 'No email address' };
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: white; padding: 30px; border: 1px solid #E5E7EB; }
          .footer { background: #F3F4F6; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; color: #6B7280; }
          .detail { margin: 10px 0; }
          .label { font-weight: bold; color: #374151; }
          .button { display: inline-block; padding: 12px 24px; background-color: #3B82F6; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Orden Confirmada</h1>
          </div>
          <div class="content">
            <p>Hola <strong>${client.name}</strong>,</p>
            <p>Tu orden ha sido recibida y confirmada. Aquí están los detalles:</p>

            <div class="detail">
              <span class="label">Número de Orden:</span> ${order.orderNumber}
            </div>
            <div class="detail">
              <span class="label">Fecha:</span> ${new Date(order.orderDate).toLocaleDateString('es-MX')}
            </div>
            <div class="detail">
              <span class="label">Total:</span> ${formatCurrency(order.totalPrice)}
            </div>

            <p style="margin-top: 20px;">Comenzaremos a trabajar en tu orden de inmediato. Te notificaremos cuando esté lista para envío.</p>

            <p>¡Gracias por tu preferencia!</p>

            <p style="margin-top: 30px;">
              <strong>${process.env.COMPANY_NAME || 'Tu Empresa'}</strong><br>
              ${process.env.COMPANY_EMAIL || ''}
            </p>
          </div>
          <div class="footer">
            <p>Este es un mensaje automático, por favor no respondas a este correo.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await sendEmail({
      to: client.email,
      subject: `✅ Orden Confirmada - ${order.orderNumber}`,
      html
    });

  } catch (error) {
    console.error('❌ Error sending order confirmation:', error);
    throw error;
  }
}

/**
 * Send receipt PDF to client
 * @param {Object} order - Order details
 * @param {Object} client - Client information
 * @param {string} pdfPath - Path to PDF receipt file
 */
export async function sendReceiptEmail(order, client, pdfPath) {
  try {
    if (!client.email) {
      console.log('⚠️  Client email not provided, skipping receipt email');
      return { success: false, reason: 'No email address' };
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: white; padding: 30px; border: 1px solid #E5E7EB; }
          .footer { background: #F3F4F6; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; color: #6B7280; }
          .detail { margin: 15px 0; padding: 12px; background: #F9FAFB; border-left: 4px solid #059669; }
          .label { font-weight: bold; color: #374151; }
          .highlight { background: #FEF3C7; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F59E0B; }
          .amount { font-size: 24px; font-weight: bold; color: #B45309; margin-top: 8px; }
          .deposit { font-size: 20px; font-weight: bold; color: #059669; margin-top: 8px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📄 Recibo de Pago</h1>
            <p style="margin: 0; font-size: 18px;">Orden Aprobada</p>
          </div>
          <div class="content">
            <p>Hola <strong>${client.name}</strong>,</p>
            <p>¡Tu orden ha sido aprobada! Adjunto encontrarás el recibo de pago con todos los detalles.</p>

            <div class="detail">
              <div class="label">Número de Orden:</div>
              <div style="font-size: 18px; font-weight: bold; margin-top: 4px;">${order.orderNumber}</div>
            </div>

            <div class="detail">
              <div class="label">Fecha de Orden:</div>
              <div>${new Date(order.orderDate).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
            </div>

            <div class="detail">
              <div class="label">Total:</div>
              <div style="font-size: 20px; font-weight: bold; margin-top: 4px;">${formatCurrency(order.totalPrice)}</div>
            </div>

            <div class="detail">
              <div class="label">Anticipo Recibido:</div>
              <div class="deposit">${formatCurrency(order.actualDepositAmount)}</div>
            </div>

            <div class="highlight">
              <div style="font-size: 14px; color: #92400E; font-weight: 600;">Saldo Restante a Pagar:</div>
              <div class="amount">${formatCurrency(order.remainingBalance)}</div>
              <div style="font-size: 13px; color: #92400E; margin-top: 8px;">
                Este monto deberá ser pagado antes de la entrega del pedido.
              </div>
            </div>

            ${order.eventDate ? `
            <div class="detail">
              <div class="label">📅 Fecha del Evento:</div>
              <div style="font-size: 16px; font-weight: bold; margin-top: 4px; color: #7C3AED;">
                ${new Date(order.eventDate).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
            ` : ''}

            <p style="margin-top: 30px;">Para consultar el estado de tu pedido en cualquier momento, visita nuestra página y usa la opción "Ya tengo una orden de compra" con tu teléfono registrado.</p>

            <p>¡Gracias por tu preferencia!</p>

            <p style="margin-top: 30px; border-top: 1px solid #E5E7EB; padding-top: 20px;">
              <strong>${process.env.COMPANY_NAME || 'Souvenir Management'}</strong><br>
              ${process.env.COMPANY_EMAIL || process.env.EMAIL_USER || ''}
            </p>
          </div>
          <div class="footer">
            <p>Este es un mensaje automático. El recibo adjunto es un comprobante oficial de tu pedido.</p>
            <p>Si tienes preguntas, no dudes en contactarnos.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await sendEmail({
      to: client.email,
      subject: `📄 Recibo de Pago - Orden ${order.orderNumber}`,
      html,
      attachments: [
        {
          filename: `Recibo-${order.orderNumber}.pdf`,
          path: pdfPath,
          contentType: 'application/pdf'
        }
      ]
    });

  } catch (error) {
    console.error('❌ Error sending receipt email:', error);
    throw error;
  }
}

/**
 * Test email configuration
 */
export async function testEmailConfig() {
  try {
    if (!transporter) {
      initializeEmailSender();
    }

    await transporter.verify();
    console.log('✅ Email configuration is valid');

    // Send test email
    const testEmail = process.env.EMAIL_USER;
    await sendEmail({
      to: testEmail,
      subject: '✅ Test Email - Souvenir Management System',
      html: '<h1>Email Configuration Test</h1><p>If you received this email, your configuration is working correctly!</p>'
    });

    return { success: true, message: 'Email configuration is valid and test email sent' };

  } catch (error) {
    console.error('❌ Email configuration test failed:', error);
    return { success: false, error: error.message };
  }
}

// Helper functions

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(amount);
}

export default {
  initializeEmailSender,
  sendEmail,
  sendDailyReport,
  sendWeeklyReport,
  sendMonthlyReport,
  sendLowMarginAlert,
  sendOrderConfirmation,
  sendReceiptEmail,
  testEmailConfig
};
