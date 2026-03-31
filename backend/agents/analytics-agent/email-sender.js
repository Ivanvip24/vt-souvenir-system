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
    const resendFrom = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    console.log(`📧 Sending email to: ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Method: ${activeProvider}`);

    if (resendClient) {
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

// Font stack — clean, Apple-like
const F = "font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Generate clean, document-style AXKAN email
 * Logo top-left, doc title top-right, thin gradient accent line, white card, footer with links
 */
function buildEmailHTML(bodyContent, preheader = '') {
  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <title>AXKAN</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    * { margin: 0; padding: 0; }
    body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table { border-collapse: collapse; }
    img { border: 0; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; background-color: #f2f2f7; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; }
      .mobile-pad { padding-left: 24px !important; padding-right: 24px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f2f2f7;">
  ${preheader ? `<div style="display:none;font-size:1px;color:#f2f2f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>` : ''}

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f2f2f7;">
  <tr><td style="padding: 40px 16px;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" align="center" class="email-container" style="margin:0 auto; background-color:#ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">

    <!-- HEADER: Logo + Document Title -->
    <tr>
      <td style="padding: 56px 48px 0;" class="mobile-pad">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td style="vertical-align: middle; width: 50%;">
              <img src="${LOGO_URL}" width="140" alt="AXKAN" style="display:block; width:140px; max-width:140px; height:auto;">
            </td>
            <td style="vertical-align: middle; text-align: right; width: 50%;">
              <p style="margin:0; ${F}; font-size: 12px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 1px;">%%DOC_LABEL%%</p>
              <p style="margin: 4px 0 0; ${F}; font-size: 22px; font-weight: 700; color: %%DOC_COLOR%%; letter-spacing: -0.3px;">%%DOC_TITLE%%</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Thin accent line -->
    <tr>
      <td style="padding: 40px 48px 0;" class="mobile-pad">
        <div style="height: 2px; background: linear-gradient(90deg, #E72A88, #F39223, #8AB73B, #09ADC2); border-radius: 2px;"></div>
      </td>
    </tr>

    <!-- BODY CONTENT -->
    ${bodyContent}

    <!-- FOOTER -->
    <tr>
      <td style="padding: 0 48px;" class="mobile-pad">
        <div style="height: 1px; background-color: #e5e5ea;"></div>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px 48px 16px; text-align: center;" class="mobile-pad">
        <p style="margin: 0; ${F}; font-size: 12px; color: #8e8e93; line-height: 1.6;">
          <a href="mailto:${process.env.COMPANY_EMAIL || 'informacion@axkan.art'}" style="color: #8e8e93; text-decoration: none;">${process.env.COMPANY_EMAIL || 'informacion@axkan.art'}</a>&nbsp;&nbsp;&nbsp;&nbsp;<a href="https://instagram.com/axkan.mx" style="color: #8e8e93; text-decoration: none;">@axkanoficial</a>&nbsp;&nbsp;&nbsp;&nbsp;<a href="https://axkan.art" style="color: #8e8e93; text-decoration: none;">axkan.art</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 0 48px 32px; text-align: center;" class="mobile-pad">
        <p style="margin: 0; ${F}; font-size: 11px; color: #c7c7cc;">
          Recuerdos Hechos Souvenir &copy; ${new Date().getFullYear()} AXKAN. Todos los derechos reservados.
        </p>
      </td>
    </tr>

  </table>
  </td></tr>
  </table>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════
// 1. RECIBO DE PAGO — Receipt with PDF attachment
// ═══════════════════════════════════════════════════════════════
export async function sendReceiptEmail(order, client, pdfPath) {
  try {
    if (!client.email) {
      console.log('⚠️  Client email not provided, skipping receipt email');
      return { success: false, reason: 'No email address' };
    }

    const orderDate = new Date(order.orderDate).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
    const eventDateFmt = order.eventDate ? new Date(order.eventDate).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

    // Build item rows if available
    const items = order.items || [];
    const itemRows = items.map(item =>
      `<tr>
        <td style="padding: 18px 0; ${F}; font-size: 14px; color: #1c1c1e; border-bottom: 1px solid #f0f0f0;">${item.quantity} &times; ${item.productName}</td>
        <td style="padding: 18px 0; ${F}; font-size: 14px; font-weight: 600; color: #1c1c1e; text-align: right; border-bottom: 1px solid #f0f0f0;">${formatCurrency(item.lineTotal)}</td>
      </tr>`
    ).join('');

    const SP = (h) => `<tr><td style="height:${h}px; line-height:${h}px; font-size:0;" height="${h}">&nbsp;</td></tr>`;

    const bodyContent = `
        ${SP(44)}
        <tr><td style="padding: 0 48px;" class="mobile-pad">
          <p style="margin: 0 0 6px; ${F}; font-size: 13px; color: #8e8e93;">Hola,</p>
          <p style="margin: 0; ${F}; font-size: 26px; font-weight: 700; color: #1c1c1e; letter-spacing: -0.3px;">${client.name}</p>
          <p style="margin: 14px 0 0; ${F}; font-size: 14px; color: #8e8e93; line-height: 1.5;">Tu pago ha sido verificado y registrado correctamente. Adjunto encontraras tu recibo oficial.</p>
        </td></tr>

        ${SP(40)}

        <!-- Order + Date -->
        <tr><td style="padding: 0 48px;" class="mobile-pad">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="padding: 24px 0; border-top: 1px solid #e5e5ea; border-bottom: 1px solid #e5e5ea; width: 33%; vertical-align: top;">
                <p style="margin: 0; ${F}; font-size: 10px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 1px;">Orden</p>
                <p style="margin: 8px 0 0; ${F}; font-size: 16px; font-weight: 700; color: #1c1c1e;">${order.orderNumber}</p>
              </td>
              <td style="padding: 24px 0; border-top: 1px solid #e5e5ea; border-bottom: 1px solid #e5e5ea; width: 34%; vertical-align: top; text-align: center;">
                <p style="margin: 0; ${F}; font-size: 10px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 1px;">Fecha</p>
                <p style="margin: 8px 0 0; ${F}; font-size: 16px; font-weight: 700; color: #1c1c1e;">${orderDate}</p>
              </td>
              <td style="padding: 24px 0; border-top: 1px solid #e5e5ea; border-bottom: 1px solid #e5e5ea; width: 33%; vertical-align: top; text-align: right;">
                <p style="margin: 0; ${F}; font-size: 10px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 1px;">Metodo</p>
                <p style="margin: 8px 0 0; ${F}; font-size: 16px; font-weight: 700; color: #1c1c1e;">SPEI</p>
              </td>
            </tr>
          </table>
        </td></tr>

        ${items.length > 0 ? `
        ${SP(36)}

        <!-- Products -->
        <tr><td style="padding: 0 48px;" class="mobile-pad">
          <p style="margin: 0 0 14px; ${F}; font-size: 10px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 1px;">Productos</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            ${itemRows}
          </table>
        </td></tr>
        ` : ''}

        ${SP(28)}

        <!-- Totals -->
        <tr><td style="padding: 0 48px;" class="mobile-pad">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="padding: 14px 0; ${F}; font-size: 14px; color: #3a3a3c;">Total del Pedido</td>
              <td style="padding: 14px 0; ${F}; font-size: 14px; font-weight: 600; color: #1c1c1e; text-align: right;">${formatCurrency(order.totalPrice)}</td>
            </tr>
            <tr>
              <td style="padding: 14px 0; ${F}; font-size: 14px; color: #8AB73B; font-style: italic;">Anticipo Recibido</td>
              <td style="padding: 14px 0; ${F}; font-size: 14px; font-weight: 600; color: #8AB73B; text-align: right;">${formatCurrency(order.actualDepositAmount)}</td>
            </tr>
            <tr><td colspan="2"><div style="height: 1px; background-color: #e5e5ea;"></div></td></tr>
            ${order.remainingBalance > 0 ? `
            <tr>
              <td style="padding: 20px 0 0; ${F}; font-size: 11px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.5px;">Saldo Restante</td>
              <td style="padding: 20px 0 0; ${F}; font-size: 28px; font-weight: 700; color: #E72A88; text-align: right; letter-spacing: -0.5px;">${formatCurrency(order.remainingBalance)}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding: 8px 0 0; ${F}; font-size: 12px; color: #aaa;">
                Este monto debera ser cubierto antes de la entrega del pedido.
              </td>
            </tr>
            ` : `
            <tr>
              <td colspan="2" style="padding: 24px 0 0; ${F}; font-size: 15px; font-weight: 600; color: #8AB73B; text-align: center;">
                Pedido pagado en su totalidad
              </td>
            </tr>
            `}
          </table>
        </td></tr>

        ${SP(36)}

        <!-- Divider -->
        <tr><td style="padding: 0 48px;" class="mobile-pad">
          <div style="height: 1px; background-color: #e5e5ea;"></div>
        </td></tr>

        ${SP(36)}

        <!-- Next Steps -->
        <tr><td style="padding: 0 48px;" class="mobile-pad">
          <p style="margin: 0 0 20px; ${F}; font-size: 10px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 1px;">Proximos Pasos</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="width: 44px; vertical-align: top; padding-bottom: 24px;">
                <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #E72A88; color: #fff; ${F}; font-size: 14px; font-weight: 700; line-height: 32px; text-align: center;">1</div>
              </td>
              <td style="vertical-align: top; padding-bottom: 24px;">
                <p style="margin: 0; ${F}; font-size: 15px; font-weight: 700; color: #1c1c1e;">Diseno en Proceso</p>
                <p style="margin: 4px 0 0; ${F}; font-size: 13px; color: #8e8e93; line-height: 1.4;">Te enviaremos una vista previa para aprobacion</p>
              </td>
            </tr>
            <tr>
              <td style="width: 44px; vertical-align: top; padding-bottom: 24px;">
                <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #f0f0f0; color: #8e8e93; ${F}; font-size: 14px; font-weight: 700; line-height: 32px; text-align: center;">2</div>
              </td>
              <td style="vertical-align: top; padding-bottom: 24px;">
                <p style="margin: 0; ${F}; font-size: 15px; font-weight: 700; color: #1c1c1e;">Produccion</p>
                <p style="margin: 4px 0 0; ${F}; font-size: 13px; color: #8e8e93; line-height: 1.4;">Impresion, corte y empaque de tu pedido</p>
              </td>
            </tr>
            <tr>
              <td style="width: 44px; vertical-align: top;">
                <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #f0f0f0; color: #8e8e93; ${F}; font-size: 14px; font-weight: 700; line-height: 32px; text-align: center;">3</div>
              </td>
              <td style="vertical-align: top;">
                <p style="margin: 0; ${F}; font-size: 15px; font-weight: 700; color: #1c1c1e;">Envio</p>
                <p style="margin: 4px 0 0; ${F}; font-size: 13px; color: #8e8e93; line-height: 1.4;">Recibiras tu numero de rastreo por este medio</p>
              </td>
            </tr>
          </table>
        </td></tr>

        ${eventDateFmt ? `
        ${SP(20)}
        <tr><td style="padding: 0 48px; text-align: center;" class="mobile-pad">
          <div style="display: inline-block; background-color: #FFF0F5; border-radius: 8px; padding: 12px 24px;">
            <p style="margin: 0; ${F}; font-size: 11px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.5px;">Fecha del Evento</p>
            <p style="margin: 4px 0 0; ${F}; font-size: 16px; font-weight: 700; color: #E72A88;">${eventDateFmt}</p>
          </div>
        </td></tr>
        ` : ''}

        ${SP(48)}
    `;

    const html = buildEmailHTML(bodyContent, `Recibo de pago — Orden ${order.orderNumber}`)
      .replace('%%DOC_LABEL%%', 'RECIBO DE PAGO')
      .replace('%%DOC_TITLE%%', order.orderNumber)
      .replace('%%DOC_COLOR%%', '#E72A88');

    const emailOptions = {
      to: client.email,
      subject: `Recibo de Pago — ${order.orderNumber} | AXKAN`,
      html
    };

    if (pdfPath) {
      emailOptions.attachments = [
        {
          filename: `Recibo-${order.orderNumber}.pdf`,
          path: pdfPath,
          contentType: 'application/pdf'
        }
      ];
    }

    return await sendEmail(emailOptions);

  } catch (error) {
    console.error('❌ Error sending receipt email:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. PEDIDO APROBADO — Order Confirmed (with optional PDF link)
// ═══════════════════════════════════════════════════════════════
export async function sendClientReceiptEmail(email, name, orderNumber, pdfUrl, orderData) {
  try {
    if (!email) {
      console.log('⚠️  Client email not provided, skipping receipt email');
      return { success: false, reason: 'No email address' };
    }

    const { totalPrice, depositAmount, remainingBalance, items, eventDate } = orderData;
    const eventDateFmt = eventDate ? new Date(eventDate).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

    const itemRows = (items || []).map(item =>
      `<tr>
        <td style="padding: 18px 0; ${F}; font-size: 14px; color: #1c1c1e; border-bottom: 1px solid #f0f0f0;">${item.quantity} &times; ${item.productName}</td>
        <td style="padding: 18px 0; ${F}; font-size: 14px; font-weight: 600; color: #1c1c1e; text-align: right; border-bottom: 1px solid #f0f0f0;">${formatCurrency(item.lineTotal)}</td>
      </tr>`
    ).join('');

    // SP = email-safe spacer (Gmail ignores padding on <table>, only <td> works)
    const SP = (h) => `<tr><td style="height:${h}px; line-height:${h}px; font-size:0;" height="${h}">&nbsp;</td></tr>`;

    const bodyContent = `
        <!-- Spacer after accent line -->
        ${SP(48)}

        <!-- Checkmark -->
        <tr><td style="text-align: center;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background-color: #8AB73B; color: #fff; ${F}; font-size: 28px; line-height: 56px; margin: 0 auto;">&#10003;</div>
        </td></tr>
        ${SP(20)}
        <tr><td style="text-align: center; padding: 0 48px;" class="mobile-pad">
          <p style="margin: 0; ${F}; font-size: 28px; font-weight: 700; color: #1c1c1e;">Pedido Confirmado</p>
        </td></tr>
        ${SP(14)}
        <tr><td style="text-align: center; padding: 0 48px;" class="mobile-pad">
          <p style="margin: 0; ${F}; font-size: 15px; color: #8e8e93; line-height: 1.6;">Hola <strong style="color: #1c1c1e;">${name}</strong>, tu pedido ha sido verificado y ya estamos trabajando en el.</p>
        </td></tr>

        <!-- Spacer -->
        ${SP(40)}

        <!-- Order + Event Date -->
        <tr><td style="padding: 0 48px;" class="mobile-pad">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="padding: 24px 0; border-top: 1px solid #e5e5ea; border-bottom: 1px solid #e5e5ea; width: 50%; vertical-align: top;">
                <p style="margin: 0; ${F}; font-size: 10px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 1px;">Orden</p>
                <p style="margin: 8px 0 0; ${F}; font-size: 16px; font-weight: 700; color: #1c1c1e;">${orderNumber}</p>
              </td>
              ${eventDateFmt ? `
              <td style="padding: 24px 0; border-top: 1px solid #e5e5ea; border-bottom: 1px solid #e5e5ea; width: 50%; vertical-align: top; text-align: right;">
                <p style="margin: 0; ${F}; font-size: 10px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 1px;">Fecha del Evento</p>
                <p style="margin: 8px 0 0; ${F}; font-size: 16px; font-weight: 700; color: #E72A88;">${eventDateFmt}</p>
              </td>
              ` : '<td></td>'}
            </tr>
          </table>
        </td></tr>

        ${items && items.length > 0 ? `
        <!-- Spacer -->
        ${SP(36)}

        <!-- Products label -->
        <tr><td style="padding: 0 48px;" class="mobile-pad">
          <p style="margin: 0 0 14px; ${F}; font-size: 10px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 1px;">Productos</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            ${itemRows}
          </table>
        </td></tr>
        ` : ''}

        <!-- Spacer -->
        ${SP(28)}

        <!-- Totals -->
        <tr><td style="padding: 0 48px;" class="mobile-pad">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="padding: 14px 0; ${F}; font-size: 14px; color: #3a3a3c;">Total del Pedido</td>
              <td style="padding: 14px 0; ${F}; font-size: 14px; font-weight: 600; color: #1c1c1e; text-align: right;">${formatCurrency(totalPrice)}</td>
            </tr>
            <tr>
              <td style="padding: 14px 0; ${F}; font-size: 14px; color: #8AB73B; font-style: italic;">Anticipo Recibido</td>
              <td style="padding: 14px 0; ${F}; font-size: 14px; font-weight: 600; color: #8AB73B; text-align: right;">${formatCurrency(depositAmount)}</td>
            </tr>
            <tr><td colspan="2"><div style="height: 1px; background-color: #e5e5ea;"></div></td></tr>
            ${remainingBalance > 0 ? `
            <tr>
              <td style="padding: 20px 0 0; ${F}; font-size: 11px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.5px;">Saldo Restante</td>
              <td style="padding: 20px 0 0; ${F}; font-size: 28px; font-weight: 700; color: #E72A88; text-align: right; letter-spacing: -0.5px;">${formatCurrency(remainingBalance)}</td>
            </tr>
            ` : `
            <tr>
              <td colspan="2" style="padding: 24px 0 0; ${F}; font-size: 15px; font-weight: 600; color: #8AB73B; text-align: center;">
                Pedido pagado en su totalidad
              </td>
            </tr>
            `}
          </table>
        </td></tr>

        ${pdfUrl ? `
        ${SP(32)}
        <tr><td style="padding: 0 48px; text-align: center;" class="mobile-pad">
          <a href="${pdfUrl}" style="display: inline-block; ${F}; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; padding: 14px 48px; background-color: #E72A88; border-radius: 50px;">Ver Recibo de Pago</a>
        </td></tr>
        ` : ''}

        <!-- Spacer before Next Steps -->
        ${SP(44)}

        <!-- Divider -->
        <tr><td style="padding: 0 48px;" class="mobile-pad">
          <div style="height: 1px; background-color: #e5e5ea;"></div>
        </td></tr>

        ${SP(36)}

        <!-- Next Steps -->
        <tr><td style="padding: 0 48px;" class="mobile-pad">
          <p style="margin: 0 0 20px; ${F}; font-size: 10px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 1px;">Proximos Pasos</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="width: 44px; vertical-align: top; padding-bottom: 24px;">
                <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #E72A88; color: #fff; ${F}; font-size: 14px; font-weight: 700; line-height: 32px; text-align: center;">1</div>
              </td>
              <td style="vertical-align: top; padding-bottom: 24px;">
                <p style="margin: 0; ${F}; font-size: 15px; font-weight: 700; color: #1c1c1e;">Diseno en Proceso</p>
                <p style="margin: 4px 0 0; ${F}; font-size: 13px; color: #8e8e93; line-height: 1.4;">Te enviaremos una vista previa para aprobacion</p>
              </td>
            </tr>
            <tr>
              <td style="width: 44px; vertical-align: top; padding-bottom: 24px;">
                <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #f0f0f0; color: #8e8e93; ${F}; font-size: 14px; font-weight: 700; line-height: 32px; text-align: center;">2</div>
              </td>
              <td style="vertical-align: top; padding-bottom: 24px;">
                <p style="margin: 0; ${F}; font-size: 15px; font-weight: 700; color: #1c1c1e;">Produccion</p>
                <p style="margin: 4px 0 0; ${F}; font-size: 13px; color: #8e8e93; line-height: 1.4;">Impresion, corte y empaque de tu pedido</p>
              </td>
            </tr>
            <tr>
              <td style="width: 44px; vertical-align: top;">
                <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #f0f0f0; color: #8e8e93; ${F}; font-size: 14px; font-weight: 700; line-height: 32px; text-align: center;">3</div>
              </td>
              <td style="vertical-align: top;">
                <p style="margin: 0; ${F}; font-size: 15px; font-weight: 700; color: #1c1c1e;">Envio</p>
                <p style="margin: 4px 0 0; ${F}; font-size: 13px; color: #8e8e93; line-height: 1.4;">Recibiras tu numero de rastreo por este medio</p>
              </td>
            </tr>
          </table>
        </td></tr>

        ${SP(48)}
    `;

    const html = buildEmailHTML(bodyContent, `Tu pedido ${orderNumber} ha sido aprobado`)
      .replace('%%DOC_LABEL%%', 'CONFIRMACION')
      .replace('%%DOC_TITLE%%', 'Pedido Aprobado')
      .replace('%%DOC_COLOR%%', '#8AB73B');

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

// ═══════════════════════════════════════════════════════════════
// 3. ENVIO EN CAMINO — Shipping Notification
// ═══════════════════════════════════════════════════════════════
export async function sendShippingNotificationEmail({ email, clientName, orderNumber, trackingNumber, carrier, trackingUrl, deliveryDays, shippedAt }) {
  try {
    if (!email) {
      console.log('⚠️  Client email not provided, skipping shipping notification');
      return { success: false, reason: 'No email address' };
    }

    const shippedDate = shippedAt ? new Date(shippedAt) : new Date();
    const estimatedDelivery = new Date(shippedDate);
    estimatedDelivery.setDate(estimatedDelivery.getDate() + (deliveryDays || 3));
    const estStart = shippedDate.toLocaleDateString('es-MX', { day: 'numeric' });
    const estEnd = estimatedDelivery.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
    const estimatedRange = `${estStart} – ${estEnd}`;

    const TC = '#09ADC2';

    const SP = (h) => `<tr><td style="height:${h}px; line-height:${h}px; font-size:0;" height="${h}">&nbsp;</td></tr>`;

    const bodyContent = `
        ${SP(48)}

        <!-- Truck icon -->
        <tr><td style="text-align: center;">
          <span style="font-size: 44px;">🚚</span>
        </td></tr>
        ${SP(16)}
        <tr><td style="text-align: center; padding: 0 48px;" class="mobile-pad">
          <p style="margin: 0; ${F}; font-size: 26px; font-weight: 700; color: #1c1c1e;">Tu Pedido Va En Camino</p>
        </td></tr>
        ${SP(12)}
        <tr><td style="text-align: center; padding: 0 48px;" class="mobile-pad">
          <p style="margin: 0; ${F}; font-size: 15px; color: #8e8e93; line-height: 1.5;">Hola <strong style="color: #1c1c1e;">${clientName}</strong>, tu paquete ya salio de nuestras instalaciones.</p>
        </td></tr>

        ${SP(36)}

        <!-- Tracking Card -->
        <tr><td style="padding: 0 48px;" class="mobile-pad">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 1px solid #d4f0f4; border-radius: 12px;">
            <tr><td style="padding: 28px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="width: 55%; vertical-align: top; padding-bottom: 20px;">
                    <p style="margin: 0; ${F}; font-size: 10px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 1px;">Numero de Rastreo</p>
                    <p style="margin: 6px 0 0; ${F}; font-size: 18px; font-weight: 700; color: ${TC};">${trackingNumber}</p>
                  </td>
                  <td style="width: 45%; vertical-align: top; text-align: right; padding-bottom: 20px;">
                    <p style="margin: 0; ${F}; font-size: 10px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 1px;">Paqueteria</p>
                    <p style="margin: 6px 0 0; ${F}; font-size: 18px; font-weight: 700; color: #1c1c1e;">${carrier || 'Nacional'}</p>
                  </td>
                </tr>
                <tr>
                  <td style="width: 55%; vertical-align: top; border-top: 1px solid #f0f0f0; padding-top: 20px;">
                    <p style="margin: 0; ${F}; font-size: 10px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 1px;">Orden</p>
                    <p style="margin: 6px 0 0; ${F}; font-size: 15px; font-weight: 600; color: #1c1c1e;">${orderNumber}</p>
                  </td>
                  <td style="width: 45%; vertical-align: top; text-align: right; border-top: 1px solid #f0f0f0; padding-top: 20px;">
                    <p style="margin: 0; ${F}; font-size: 10px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 1px;">Entrega Estimada</p>
                    <p style="margin: 6px 0 0; ${F}; font-size: 15px; font-weight: 600; color: ${TC};">${estimatedRange}</p>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        ${SP(36)}

        <!-- Progress Steps -->
        <tr><td style="padding: 0 48px;" class="mobile-pad">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="width: 25%; text-align: center; vertical-align: top;">
                <div style="width: 28px; height: 28px; border-radius: 50%; background-color: ${TC}; color: #fff; ${F}; font-size: 12px; font-weight: 700; line-height: 28px; margin: 0 auto;">&#10003;</div>
                <p style="margin: 6px 0 0; ${F}; font-size: 10px; color: ${TC}; font-weight: 600;">Creado</p>
              </td>
              <td style="width: 25%; text-align: center; vertical-align: top;">
                <div style="width: 28px; height: 28px; border-radius: 50%; background-color: ${TC}; color: #fff; ${F}; font-size: 12px; font-weight: 700; line-height: 28px; margin: 0 auto;">&#10003;</div>
                <p style="margin: 6px 0 0; ${F}; font-size: 10px; color: ${TC}; font-weight: 600;">Recolectado</p>
              </td>
              <td style="width: 25%; text-align: center; vertical-align: top;">
                <div style="width: 28px; height: 28px; border-radius: 50%; background-color: ${TC}; color: #fff; ${F}; font-size: 12px; font-weight: 700; line-height: 28px; margin: 0 auto;">&#10003;</div>
                <p style="margin: 6px 0 0; ${F}; font-size: 10px; color: ${TC}; font-weight: 600;">En Transito</p>
              </td>
              <td style="width: 25%; text-align: center; vertical-align: top;">
                <div style="width: 28px; height: 28px; border-radius: 50%; background-color: #e5e5ea; color: #8e8e93; ${F}; font-size: 12px; font-weight: 700; line-height: 28px; margin: 0 auto;">4</div>
                <p style="margin: 6px 0 0; ${F}; font-size: 10px; color: #8e8e93; font-weight: 600;">Entregado</p>
              </td>
            </tr>
          </table>
        </td></tr>

        ${trackingUrl ? `
        ${SP(36)}
        <tr><td style="padding: 0 48px; text-align: center;" class="mobile-pad">
          <a href="${trackingUrl}" style="display: inline-block; ${F}; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; padding: 16px 52px; background-color: #1c1c1e; border-radius: 50px;">Rastrear Mi Paquete</a>
        </td></tr>
        ` : ''}

        ${SP(48)}
    `;

    const html = buildEmailHTML(bodyContent, `Tu pedido ${orderNumber} va en camino`)
      .replace('%%DOC_LABEL%%', 'ACTUALIZACION')
      .replace('%%DOC_TITLE%%', 'En Camino')
      .replace('%%DOC_COLOR%%', TC);

    return await sendEmail({
      to: email,
      subject: `Tu Pedido ${orderNumber} Va En Camino | AXKAN`,
      html
    });

  } catch (error) {
    console.error('❌ Error sending shipping notification email:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════

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
  sendShippingNotificationEmail,
  initializeEmailSender
};
