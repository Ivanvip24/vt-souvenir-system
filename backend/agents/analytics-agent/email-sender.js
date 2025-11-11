import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';
import { config } from 'dotenv';

config();

// Initialize SendGrid
let usingSendGridAPI = false;
let transporter = null;

if (process.env.EMAIL_SERVICE === 'sendgrid' && process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  usingSendGridAPI = true;
  console.log('✅ Using SendGrid HTTP API (bypasses SMTP port blocking)');
}

/**
 * Send email using SendGrid HTTP API or nodemailer
 */
export async function sendEmail({ to, subject, html, attachments = [] }) {
  try {
    const from = {
      email: process.env.EMAIL_USER || 'informacion@vtanunciando.com',
      name: process.env.COMPANY_NAME || 'VT Anunciando - Souvenirs Personalizados'
    };

    console.log(`📧 Sending email to: ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Method: ${usingSendGridAPI ? 'SendGrid HTTP API' : 'SMTP'}`);

    if (usingSendGridAPI) {
      // Use SendGrid HTTP API (bypasses port blocking on Render)
      const msg = {
        to,
        from,
        subject,
        html,
        attachments: attachments.map(att => ({
          content: att.content ? att.content.toString('base64') : undefined,
          filename: att.filename,
          type: att.contentType || 'application/pdf',
          disposition: 'attachment'
        }))
      };

      // If attachment has path, read it
      if (attachments.length > 0 && attachments[0].path) {
        const fs = await import('fs');
        const fileContent = fs.readFileSync(attachments[0].path);
        msg.attachments[0].content = fileContent.toString('base64');
      }

      const response = await sgMail.send(msg);

      console.log('✅ Email sent successfully via SendGrid API');
      console.log(`   Message ID: ${response[0].headers['x-message-id']}`);

      return {
        success: true,
        messageId: response[0].headers['x-message-id'],
        recipients: to
      };
    } else {
      // Fallback to nodemailer SMTP (for local development)
      if (!transporter) {
        throw new Error('Email transporter not initialized. Use SendGrid for cloud platforms.');
      }

      const mailOptions = {
        from: `${from.name} <${from.email}>`,
        to,
        subject,
        html,
        attachments
      };

      const info = await transporter.sendMail(mailOptions);

      console.log('✅ Email sent successfully via SMTP');
      console.log(`   Message ID: ${info.messageId}`);

      return {
        success: true,
        messageId: info.messageId,
        recipients: to
      };
    }
  } catch (error) {
    console.error('❌ Error sending email:', error);

    if (error.response) {
      console.error('   SendGrid Error Response:', error.response.body);
    }

    throw new Error(`Failed to send email: ${error.message}`);
  }
}

/**
 * Send receipt email with PDF attachment
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

            <p style="margin-top: 30px;">¡Gracias por tu preferencia!</p>

            <p style="margin-top: 30px; border-top: 1px solid #E5E7EB; padding-top: 20px;">
              <strong>${process.env.COMPANY_NAME || 'VT Anunciando'}</strong><br>
              ${process.env.COMPANY_EMAIL || process.env.EMAIL_USER || ''}
            </p>
          </div>
          <div class="footer">
            <p>Este es un mensaje automático. El recibo adjunto es un comprobante oficial de tu pedido.</p>
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

function formatCurrency(amount) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(amount);
}

export function initializeEmailSender() {
  console.log('📋 Email Configuration:');
  console.log(`   Service: ${process.env.EMAIL_SERVICE}`);
  console.log(`   Using SendGrid API: ${usingSendGridAPI}`);
  return true;
}

export default {
  sendEmail,
  sendReceiptEmail,
  initializeEmailSender
};
