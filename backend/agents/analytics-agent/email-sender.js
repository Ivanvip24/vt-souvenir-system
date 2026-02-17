import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';
import { config } from 'dotenv';

config();

// Initialize email transport
let usingSendGridAPI = false;
let transporter = null;

if (process.env.EMAIL_SERVICE === 'sendgrid' && process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  usingSendGridAPI = true;
  console.log('✅ Using SendGrid HTTP API (bypasses SMTP port blocking)');
} else if (process.env.EMAIL_SERVICE && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
  // Initialize SMTP transporter for local dev (Gmail, etc.)
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });
  console.log(`✅ Using SMTP (${process.env.EMAIL_SERVICE}) for email`);
} else {
  console.warn('⚠️  No email service configured. Set EMAIL_SERVICE=sendgrid + SENDGRID_API_KEY, or EMAIL_SERVICE=gmail + EMAIL_USER + EMAIL_PASSWORD');
}

/**
 * Send email using SendGrid HTTP API or nodemailer
 */
export async function sendEmail({ to, subject, html, attachments = [] }) {
  try {
    const from = {
      email: process.env.COMPANY_EMAIL || process.env.EMAIL_USER || 'informacion@axkan.art',
      name: process.env.COMPANY_NAME || 'AXKAN - Recuerdos Hechos Souvenir'
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
          .header { background: linear-gradient(135deg, #E72A88 0%, #C4206F 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: white; padding: 30px; border: 1px solid #E5E7EB; }
          .footer { background: #FAF7F0; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; color: #6B7280; }
          .detail { margin: 15px 0; padding: 12px; background: #FAF7F0; border-left: 4px solid #E72A88; }
          .label { font-weight: bold; color: #2C2C28; }
          .highlight { background: #FEF3C7; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F39223; }
          .amount { font-size: 24px; font-weight: bold; color: #D97757; margin-top: 8px; }
          .deposit { font-size: 20px; font-weight: bold; color: #8AB73B; margin-top: 8px; }
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
              <strong>${process.env.COMPANY_NAME || 'AXKAN'}</strong><br>
              Recuerdos Hechos Souvenir<br>
              ${process.env.COMPANY_EMAIL || process.env.EMAIL_USER || 'informacion@axkan.art'}<br>
              <a href="https://axkan.art" style="color: #E72A88;">axkan.art</a>
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

/**
 * Send receipt email to client during auto-approval flow (called from client-routes.js)
 * Unlike sendReceiptEmail which attaches a PDF file, this links to the PDF URL
 */
export async function sendClientReceiptEmail(email, name, orderNumber, pdfUrl, orderData) {
  try {
    if (!email) {
      console.log('⚠️  Client email not provided, skipping receipt email');
      return { success: false, reason: 'No email address' };
    }

    const { totalPrice, depositAmount, remainingBalance, items, eventDate, eventType } = orderData;

    const itemRows = (items || []).map(item =>
      `<tr>
        <td style="padding: 8px; border-bottom: 1px solid #E5E7EB;">${item.productName}</td>
        <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; text-align: right;">${formatCurrency(item.unitPrice)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; text-align: right;">${formatCurrency(item.lineTotal)}</td>
      </tr>`
    ).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #2C2C28; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #E72A88 0%, #C4206F 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: white; padding: 30px; border: 1px solid #E5E7EB; }
          .footer { background: #FAF7F0; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; color: #6B7280; }
          .detail { margin: 15px 0; padding: 12px; background: #FAF7F0; border-left: 4px solid #E72A88; }
          .label { font-weight: bold; color: #2C2C28; }
          .highlight { background: #FEF3C7; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F39223; }
          .amount { font-size: 24px; font-weight: bold; color: #D97757; margin-top: 8px; }
          .deposit { font-size: 20px; font-weight: bold; color: #8AB73B; margin-top: 8px; }
          table { width: 100%; border-collapse: collapse; margin: 16px 0; }
          th { background: #FAF7F0; padding: 10px 8px; text-align: left; font-weight: bold; border-bottom: 2px solid #E72A88; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Tu Pedido Ha Sido Aprobado</h1>
            <p style="margin: 0; font-size: 18px;">${orderNumber}</p>
          </div>
          <div class="content">
            <p>Hola <strong>${name}</strong>,</p>
            <p>Tu pedido ha sido verificado y aprobado. Ya estamos trabajando en el.</p>

            <div class="detail">
              <div class="label">Numero de Orden:</div>
              <div style="font-size: 18px; font-weight: bold; margin-top: 4px;">${orderNumber}</div>
            </div>

            ${items && items.length > 0 ? `
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style="text-align: center;">Cantidad</th>
                  <th style="text-align: right;">Precio Unit.</th>
                  <th style="text-align: right;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${itemRows}
              </tbody>
            </table>
            ` : ''}

            <div class="detail">
              <div class="label">Total:</div>
              <div style="font-size: 20px; font-weight: bold; margin-top: 4px;">${formatCurrency(totalPrice)}</div>
            </div>

            <div class="detail">
              <div class="label">Anticipo Recibido:</div>
              <div class="deposit">${formatCurrency(depositAmount)}</div>
            </div>

            ${remainingBalance > 0 ? `
            <div class="highlight">
              <div style="font-size: 14px; color: #92400E; font-weight: 600;">Saldo Restante a Pagar:</div>
              <div class="amount">${formatCurrency(remainingBalance)}</div>
              <div style="font-size: 13px; color: #92400E; margin-top: 8px;">
                Este monto debera ser pagado antes de la entrega del pedido.
              </div>
            </div>
            ` : `
            <div style="background: #ECFDF5; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #8AB73B;">
              <div style="font-size: 16px; font-weight: bold; color: #166534;">Pedido pagado en su totalidad</div>
            </div>
            `}

            ${eventDate ? `
            <div class="detail">
              <div class="label">Fecha del Evento:</div>
              <div style="font-size: 16px; font-weight: bold; margin-top: 4px; color: #E72A88;">
                ${new Date(eventDate).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
            ` : ''}

            ${pdfUrl ? `
            <p style="margin-top: 20px;">
              <a href="${pdfUrl}" style="display: inline-block; background: #E72A88; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
                Ver Recibo de Pago
              </a>
            </p>
            ` : ''}

            <p style="margin-top: 30px;">Gracias por tu preferencia!</p>

            <p style="margin-top: 30px; border-top: 1px solid #E5E7EB; padding-top: 20px;">
              <strong>${process.env.COMPANY_NAME || 'AXKAN'}</strong><br>
              Recuerdos Hechos Souvenir<br>
              ${process.env.COMPANY_EMAIL || process.env.EMAIL_USER || 'informacion@axkan.art'}<br>
              <a href="https://axkan.art" style="color: #E72A88;">axkan.art</a>
            </p>
          </div>
          <div class="footer">
            <p>Este es un mensaje automatico. Si tienes preguntas, responde a este correo.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await sendEmail({
      to: email,
      subject: `Tu Pedido ${orderNumber} Ha Sido Aprobado - AXKAN`,
      html
    });

  } catch (error) {
    console.error('❌ Error sending client receipt email:', error);
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
  sendClientReceiptEmail,
  initializeEmailSender
};
