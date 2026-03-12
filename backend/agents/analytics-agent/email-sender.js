import { Resend } from 'resend';
import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';
import fs from 'fs';
import { config } from 'dotenv';

config();

// Initialize email transport — priority: Resend > SendGrid > SMTP
let resendClient = null;
let usingSendGridAPI = false;
let transporter = null;
let activeProvider = 'none';

if (process.env.RESEND_API_KEY) {
  resendClient = new Resend(process.env.RESEND_API_KEY);
  activeProvider = 'resend';
  console.log('✅ Using Resend HTTP API for email');
} else if (process.env.EMAIL_SERVICE === 'sendgrid' && process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  usingSendGridAPI = true;
  activeProvider = 'sendgrid';
  console.log('✅ Using SendGrid HTTP API (bypasses SMTP port blocking)');
} else if (process.env.EMAIL_SERVICE && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });
  activeProvider = 'smtp';
  console.log(`✅ Using SMTP (${process.env.EMAIL_SERVICE}) for email`);
} else {
  console.warn('⚠️  No email service configured. Set RESEND_API_KEY or EMAIL_SERVICE + credentials.');
}

/**
 * Send email using Resend, SendGrid, or nodemailer
 */
export async function sendEmail({ to, subject, html, attachments = [] }) {
  try {
    const fromEmail = process.env.COMPANY_EMAIL || process.env.EMAIL_USER || 'informacion@axkan.art';
    const fromName = process.env.COMPANY_NAME || 'AXKAN - Recuerdos Hechos Souvenir';
    // Resend requires a verified domain; use RESEND_FROM or onboarding@resend.dev as fallback
    const resendFrom = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    console.log(`📧 Sending email to: ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Method: ${activeProvider}`);

    if (resendClient) {
      // Resend HTTP API (primary — works on Render, free tier)
      const resendAttachments = attachments.map(att => {
        let content;
        if (att.path) {
          content = fs.readFileSync(att.path);
        } else if (att.content) {
          content = Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content);
        }
        return { filename: att.filename, content };
      }).filter(att => att.content);

      const msg = {
        from: `${fromName} <${resendFrom}>`,
        to,
        subject,
        html,
      };
      if (resendAttachments.length > 0) {
        msg.attachments = resendAttachments;
      }

      const { data, error } = await resendClient.emails.send(msg);

      if (error) {
        throw new Error(error.message);
      }

      console.log('✅ Email sent successfully via Resend');
      console.log(`   Message ID: ${data.id}`);

      return { success: true, messageId: data.id, recipients: to };

    } else if (usingSendGridAPI) {
      // SendGrid HTTP API (fallback)
      const msg = {
        to,
        from: { email: fromEmail, name: fromName },
        subject,
        html,
        attachments: attachments.map(att => ({
          content: att.content ? att.content.toString('base64') : undefined,
          filename: att.filename,
          type: att.contentType || 'application/pdf',
          disposition: 'attachment'
        }))
      };

      if (attachments.length > 0 && attachments[0].path) {
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
      // Nodemailer SMTP (last fallback)
      if (!transporter) {
        throw new Error('No email provider configured. Set RESEND_API_KEY or EMAIL_SERVICE + credentials.');
      }

      const mailOptions = {
        from: `${fromName} <${fromEmail}>`,
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
      console.error('   Error Response:', error.response.body);
    }

    throw new Error(`Failed to send email: ${error.message}`);
  }
}

// ── Brand assets (hosted on Cloudinary) ──
const LOGO_URL = 'https://res.cloudinary.com/dg1owvdhw/image/upload/w_240,q_auto/brand/axkan-logo-full.png';
const JAGUAR_URL = 'https://res.cloudinary.com/dg1owvdhw/image/upload/w_80,q_auto/brand/axkan-jaguar.png';
const PRODUCT_URL = 'https://res.cloudinary.com/dg1owvdhw/image/upload/w_560,q_auto/brand/axkan-product-showcase.jpg';

/**
 * Generate the premium AXKAN email wrapper
 */
function buildEmailHTML(bodyContent, preheader = '') {
  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>AXKAN</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600;700&display=swap');
    * { margin: 0; padding: 0; }
    body, table, td, p, a, li { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
    body { margin: 0; padding: 0; width: 100% !important; background-color: #F5F0EB; }
    .body-wrap { background-color: #F5F0EB; }
    .email-container { max-width: 600px; margin: 0 auto; }
    .serif { font-family: 'DM Serif Display', Georgia, 'Times New Roman', serif; }
    .sans { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; }
      .fluid { max-width: 100% !important; height: auto !important; }
      .stack-column { display: block !important; width: 100% !important; }
      .pad-mobile { padding-left: 20px !important; padding-right: 20px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#F5F0EB;">
  ${preheader ? `<div style="display:none;font-size:1px;color:#F5F0EB;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheader}</div>` : ''}

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="body-wrap" style="background-color:#F5F0EB;">
  <tr><td style="padding: 24px 12px;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" align="center" class="email-container" style="margin:0 auto;">

    <!-- LOGO BAR -->
    <tr>
      <td style="padding: 28px 40px 20px; text-align: center;">
        <img src="${LOGO_URL}" width="160" alt="AXKAN" style="display:inline-block; width:160px; max-width:160px; height:auto;">
      </td>
    </tr>

    <!-- HERO GRADIENT -->
    <tr>
      <td style="background: linear-gradient(135deg, #E72A88 0%, #B91D73 40%, #8A1558 100%); border-radius: 16px 16px 0 0; padding: 48px 40px 40px; text-align: center;">
        <!--[if mso]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;"><v:fill type="gradient" color="#E72A88" color2="#8A1558" angle="135"/><v:textbox style="mso-fit-shape-to-text:true" inset="0,0,0,0"><![endif]-->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr><td style="text-align: center; padding-bottom: 16px;">
            <img src="${JAGUAR_URL}" width="56" alt="" style="width:56px; height:auto; opacity:0.9;">
          </td></tr>
          <tr><td style="font-family: 'DM Serif Display', Georgia, serif; font-size: 32px; line-height: 1.2; color: #ffffff; text-align: center; padding-bottom: 12px;">
            %%HERO_TITLE%%
          </td></tr>
          <tr><td style="font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: rgba(255,255,255,0.85); text-align: center;">
            %%HERO_SUBTITLE%%
          </td></tr>
        </table>
        <!--[if mso]></v:textbox></v:rect><![endif]-->
      </td>
    </tr>

    <!-- MAIN CONTENT -->
    <tr>
      <td style="background-color: #ffffff; padding: 0;">
        ${bodyContent}
      </td>
    </tr>

    <!-- PRODUCT SHOWCASE -->
    <tr>
      <td style="background-color: #ffffff; padding: 0 40px 32px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr><td style="padding: 24px 0 16px; border-top: 1px solid #F0EBE5;">
            <p style="font-family: 'DM Serif Display', Georgia, serif; font-size: 18px; color: #2C2C28; margin: 0;">Recuerdos Hechos Souvenir</p>
          </td></tr>
          <tr><td>
            <img src="${PRODUCT_URL}" width="520" alt="AXKAN Souvenirs" style="width:100%; max-width:520px; height:auto; border-radius: 12px; display: block;">
          </td></tr>
          <tr><td style="padding-top: 16px; text-align: center;">
            <a href="https://axkan.art" style="display: inline-block; font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 600; color: #E72A88; text-decoration: none; padding: 10px 28px; border: 2px solid #E72A88; border-radius: 50px; letter-spacing: 0.5px;">Visitar axkan.art</a>
          </td></tr>
        </table>
      </td>
    </tr>

    <!-- FOOTER -->
    <tr>
      <td style="background-color: #2C2C28; border-radius: 0 0 16px 16px; padding: 36px 40px; text-align: center;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr><td style="padding-bottom: 16px;">
            <img src="${LOGO_URL}" width="120" alt="AXKAN" style="width:120px; height:auto; filter: brightness(10);">
          </td></tr>
          <tr><td style="font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.7; color: #9CA3AF;">
            <strong style="color: #E5E7EB;">${process.env.COMPANY_NAME || 'AXKAN'}</strong> &mdash; Recuerdos Hechos Souvenir<br>
            <a href="mailto:${process.env.COMPANY_EMAIL || 'informacion@axkan.art'}" style="color: #E72A88; text-decoration: none;">${process.env.COMPANY_EMAIL || 'informacion@axkan.art'}</a><br>
            <a href="https://axkan.art" style="color: #E72A88; text-decoration: none;">axkan.art</a>
          </td></tr>
          <tr><td style="padding-top: 20px; font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 11px; color: #6B7280;">
            Este es un correo automatico. Si tienes preguntas, responde directamente a este mensaje.
          </td></tr>
        </table>
      </td>
    </tr>

  </table>
  </td></tr>
  </table>
</body>
</html>`;
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

    const orderDateFormatted = new Date(order.orderDate).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const eventDateFormatted = order.eventDate ? new Date(order.eventDate).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '';

    const bodyContent = `
        <!-- Greeting -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding: 36px 40px 0;">
          <tr><td style="font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.7; color: #4B5563;">
            <p style="margin: 0 0 8px;">Hola <strong style="color: #2C2C28;">${client.name}</strong>,</p>
            <p style="margin: 0;">Tu orden ha sido aprobada. Adjunto encontraras el recibo de pago con todos los detalles.</p>
          </td></tr>
        </table>

        <!-- Order Details Card -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding: 28px 40px;">
          <tr><td>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: #FAFAF8; border-radius: 12px; overflow: hidden;">
              <!-- Order number badge -->
              <tr><td style="background: linear-gradient(90deg, #E72A88, #F39223); padding: 14px 24px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.8); text-transform: uppercase; letter-spacing: 1.5px;">Numero de Orden</td>
                    <td style="font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 18px; font-weight: 700; color: #ffffff; text-align: right;">${order.orderNumber}</td>
                  </tr>
                </table>
              </td></tr>
              <!-- Details rows -->
              <tr><td style="padding: 20px 24px 0;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 600; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.8px; padding-bottom: 4px;">Fecha de Orden</td>
                  </tr>
                  <tr>
                    <td style="font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 15px; color: #2C2C28; padding-bottom: 16px; border-bottom: 1px solid #F0EBE5;">${orderDateFormatted}</td>
                  </tr>
                </table>
              </td></tr>
              ${eventDateFormatted ? `
              <tr><td style="padding: 16px 24px 0;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 600; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.8px; padding-bottom: 4px;">Fecha del Evento</td>
                  </tr>
                  <tr>
                    <td style="font-family: 'DM Serif Display', Georgia, serif; font-size: 17px; color: #E72A88; padding-bottom: 16px; border-bottom: 1px solid #F0EBE5;">${eventDateFormatted}</td>
                  </tr>
                </table>
              </td></tr>` : ''}
              <!-- Totals -->
              <tr><td style="padding: 20px 24px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 13px; color: #6B7280; padding-bottom: 10px;">Total del Pedido</td>
                    <td style="font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 17px; font-weight: 700; color: #2C2C28; text-align: right; padding-bottom: 10px;">${formatCurrency(order.totalPrice)}</td>
                  </tr>
                  <tr>
                    <td style="font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 13px; color: #8AB73B; padding-bottom: 10px;">Anticipo Recibido</td>
                    <td style="font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 17px; font-weight: 700; color: #8AB73B; text-align: right; padding-bottom: 10px;">${formatCurrency(order.actualDepositAmount)}</td>
                  </tr>
                  <tr>
                    <td colspan="2" style="border-top: 2px dashed #F0EBE5; padding-top: 12px;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                        <tr>
                          <td style="font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 600; color: #F39223;">Saldo Restante</td>
                          <td style="font-family: 'DM Serif Display', Georgia, serif; font-size: 24px; font-weight: 700; color: #E72A88; text-align: right;">${formatCurrency(order.remainingBalance)}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td></tr>
              <!-- Balance note -->
              <tr><td style="padding: 0 24px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(135deg, #FEF3C7, #FFF7E0); border-radius: 8px;">
                  <tr><td style="padding: 12px 16px; font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #92400E;">
                    Este monto debera ser pagado antes de la entrega del pedido.
                  </td></tr>
                </table>
              </td></tr>
            </table>
          </td></tr>
        </table>

        <!-- Thank you -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding: 0 40px 36px;">
          <tr><td style="font-family: 'DM Serif Display', Georgia, serif; font-size: 20px; color: #2C2C28; text-align: center; padding-top: 8px;">
            Gracias por tu preferencia
          </td></tr>
        </table>`;

    const html = buildEmailHTML(bodyContent, `Recibo de pago - Orden ${order.orderNumber}`)
      .replace('%%HERO_TITLE%%', 'Recibo de Pago')
      .replace('%%HERO_SUBTITLE%%', 'Tu orden ha sido aprobada y esta en proceso');

    return await sendEmail({
      to: client.email,
      subject: `Recibo de Pago - Orden ${order.orderNumber} | AXKAN`,
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
    const eventDateFormatted = eventDate ? new Date(eventDate).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '';

    // Build item rows for the product table
    const itemRows = (items || []).map((item, i) => {
      const bgColor = i % 2 === 0 ? '#FAFAF8' : '#ffffff';
      return `<tr>
        <td style="padding: 12px 16px; font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 13px; color: #2C2C28; background: ${bgColor};">${item.productName}</td>
        <td style="padding: 12px 16px; font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 13px; color: #6B7280; text-align: center; background: ${bgColor};">${item.quantity}</td>
        <td style="padding: 12px 16px; font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 13px; color: #6B7280; text-align: right; background: ${bgColor};">${formatCurrency(item.unitPrice)}</td>
        <td style="padding: 12px 16px; font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 600; color: #2C2C28; text-align: right; background: ${bgColor};">${formatCurrency(item.lineTotal)}</td>
      </tr>`;
    }).join('');

    const bodyContent = `
        <!-- Greeting -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding: 36px 40px 0;">
          <tr><td style="font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.7; color: #4B5563;">
            <p style="margin: 0 0 8px;">Hola <strong style="color: #2C2C28;">${name}</strong>,</p>
            <p style="margin: 0;">Tu pedido ha sido verificado y aprobado. Ya estamos trabajando en el.</p>
          </td></tr>
        </table>

        <!-- Order Number Badge -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding: 28px 40px 0;">
          <tr><td>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(90deg, #E72A88, #F39223); border-radius: 10px;">
              <tr><td style="padding: 16px 24px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.8); text-transform: uppercase; letter-spacing: 1.5px;">Orden</td>
                    <td style="font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 20px; font-weight: 700; color: #ffffff; text-align: right;">${orderNumber}</td>
                  </tr>
                </table>
              </td></tr>
            </table>
          </td></tr>
        </table>

        ${items && items.length > 0 ? `
        <!-- Items Table -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding: 24px 40px 0;">
          <tr><td style="font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 700; color: #9CA3AF; text-transform: uppercase; letter-spacing: 1.5px; padding-bottom: 12px;">
            Detalle del Pedido
          </td></tr>
          <tr><td>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-radius: 10px; overflow: hidden; border: 1px solid #F0EBE5;">
              <tr>
                <td style="padding: 10px 16px; font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 700; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.5px; background: #F5F0EB; border-bottom: 2px solid #E72A88;">Producto</td>
                <td style="padding: 10px 16px; font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 700; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; background: #F5F0EB; border-bottom: 2px solid #E72A88;">Cant.</td>
                <td style="padding: 10px 16px; font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 700; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.5px; text-align: right; background: #F5F0EB; border-bottom: 2px solid #E72A88;">P. Unit.</td>
                <td style="padding: 10px 16px; font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 700; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.5px; text-align: right; background: #F5F0EB; border-bottom: 2px solid #E72A88;">Subtotal</td>
              </tr>
              ${itemRows}
            </table>
          </td></tr>
        </table>
        ` : ''}

        <!-- Totals Section -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding: 24px 40px;">
          <tr><td>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: #FAFAF8; border-radius: 12px; overflow: hidden;">
              <tr><td style="padding: 20px 24px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 13px; color: #6B7280; padding-bottom: 10px;">Total del Pedido</td>
                    <td style="font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 17px; font-weight: 700; color: #2C2C28; text-align: right; padding-bottom: 10px;">${formatCurrency(totalPrice)}</td>
                  </tr>
                  <tr>
                    <td style="font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 13px; color: #8AB73B; padding-bottom: 12px;">Anticipo Recibido</td>
                    <td style="font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 17px; font-weight: 700; color: #8AB73B; text-align: right; padding-bottom: 12px;">${formatCurrency(depositAmount)}</td>
                  </tr>
                  <tr>
                    <td colspan="2" style="border-top: 2px dashed #F0EBE5; padding-top: 14px;">
                      ${remainingBalance > 0 ? `
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                        <tr>
                          <td style="font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 600; color: #F39223;">Saldo Restante</td>
                          <td style="font-family: 'DM Serif Display', Georgia, serif; font-size: 26px; font-weight: 700; color: #E72A88; text-align: right;">${formatCurrency(remainingBalance)}</td>
                        </tr>
                      </table>
                      ` : `
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                        <tr>
                          <td style="font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 700; color: #8AB73B; text-align: center; padding: 4px 0;">Pedido pagado en su totalidad</td>
                        </tr>
                      </table>
                      `}
                    </td>
                  </tr>
                </table>
              </td></tr>
              ${remainingBalance > 0 ? `
              <tr><td style="padding: 0 24px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(135deg, #FEF3C7, #FFF7E0); border-radius: 8px;">
                  <tr><td style="padding: 12px 16px; font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #92400E;">
                    Este monto debera ser pagado antes de la entrega del pedido.
                  </td></tr>
                </table>
              </td></tr>` : ''}
            </table>
          </td></tr>
        </table>

        ${eventDateFormatted ? `
        <!-- Event Date -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding: 0 40px 16px;">
          <tr><td>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(135deg, #FDF2F8, #FCE7F3); border-radius: 10px; border-left: 4px solid #E72A88;">
              <tr><td style="padding: 16px 20px;">
                <p style="margin: 0 0 4px; font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 600; color: #9CA3AF; text-transform: uppercase; letter-spacing: 1px;">Fecha del Evento</p>
                <p style="margin: 0; font-family: 'DM Serif Display', Georgia, serif; font-size: 17px; color: #E72A88;">${eventDateFormatted}</p>
              </td></tr>
            </table>
          </td></tr>
        </table>
        ` : ''}

        ${pdfUrl ? `
        <!-- CTA Button -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding: 8px 40px 16px;">
          <tr><td style="text-align: center;">
            <a href="${pdfUrl}" style="display: inline-block; font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; padding: 14px 40px; background: linear-gradient(135deg, #E72A88 0%, #B91D73 100%); border-radius: 50px; letter-spacing: 0.3px;">Ver Recibo de Pago</a>
          </td></tr>
        </table>
        ` : ''}

        <!-- Thank you -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding: 12px 40px 36px;">
          <tr><td style="font-family: 'DM Serif Display', Georgia, serif; font-size: 20px; color: #2C2C28; text-align: center; padding-top: 8px;">
            Gracias por tu preferencia
          </td></tr>
        </table>`;

    const html = buildEmailHTML(bodyContent, `Tu pedido ${orderNumber} ha sido aprobado - AXKAN`)
      .replace('%%HERO_TITLE%%', 'Pedido Aprobado')
      .replace('%%HERO_SUBTITLE%%', `${orderNumber} &mdash; Ya estamos trabajando en tu pedido`);

    return await sendEmail({
      to: email,
      subject: `Tu Pedido ${orderNumber} Ha Sido Aprobado | AXKAN`,
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
  console.log(`   Active provider: ${activeProvider}`);
  console.log(`   Resend: ${resendClient ? 'configured' : 'not set'}`);
  console.log(`   SendGrid: ${usingSendGridAPI ? 'configured' : 'not set'}`);
  console.log(`   SMTP: ${transporter ? 'configured' : 'not set'}`);
  return true;
}

export default {
  sendEmail,
  sendReceiptEmail,
  sendClientReceiptEmail,
  initializeEmailSender
};
