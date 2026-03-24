/**
 * WhatsApp API Helper — Centralized Meta API calls with token health monitoring.
 *
 * Every outbound call to graph.facebook.com goes through this module.
 * If a 401/403 is detected the admin gets a one-time email alert so the
 * token can be refreshed on Render before customers notice.
 */

import { sendEmail } from '../agents/analytics-agent/email-sender.js';

const WHATSAPP_API_BASE = 'https://graph.facebook.com/v22.0';

// ---------------------------------------------------------------------------
// Token-health state (in-memory, resets on deploy)
// ---------------------------------------------------------------------------
let tokenDead = false;          // flipped to true on first 401/403
let alertSentAt = null;         // Date when the alert email was sent
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour between alert emails

function getAccessToken() { return process.env.WHATSAPP_ACCESS_TOKEN; }
function getPhoneNumberId() { return process.env.WHATSAPP_PHONE_NUMBER_ID; }

// ---------------------------------------------------------------------------
// Alert helper
// ---------------------------------------------------------------------------
async function sendTokenAlert(statusCode, errorBody) {
  const now = Date.now();
  if (alertSentAt && (now - alertSentAt) < ALERT_COOLDOWN_MS) return;

  const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
  if (!adminEmail) {
    console.error('🔴 TOKEN EXPIRED — No ADMIN_EMAIL configured, cannot send alert!');
    return;
  }

  alertSentAt = now;

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <h2 style="color:#e52421">⚠️ WhatsApp Bot Token Expired</h2>
      <p>The AXKAN WhatsApp chatbot <strong>stopped responding</strong> because the Meta API token is invalid.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">HTTP Status</td>
            <td style="padding:8px;border:1px solid #ddd">${statusCode}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Error</td>
            <td style="padding:8px;border:1px solid #ddd;font-size:13px;word-break:break-all">${errorBody?.substring(0, 300) || 'N/A'}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Time (UTC)</td>
            <td style="padding:8px;border:1px solid #ddd">${new Date().toISOString()}</td></tr>
      </table>
      <h3>How to fix:</h3>
      <ol>
        <li>Go to <a href="https://business.facebook.com/settings/system-users">Meta Business → System Users</a></li>
        <li>Generate a new permanent token with <code>whatsapp_business_messaging</code> permission</li>
        <li>Update <code>WHATSAPP_ACCESS_TOKEN</code> on <a href="https://dashboard.render.com">Render</a></li>
        <li>Trigger a manual deploy (or the next deploy will pick it up)</li>
      </ol>
      <p style="color:#888;font-size:12px">This alert is sent at most once per hour.</p>
    </div>`;

  try {
    await sendEmail({
      to: adminEmail,
      subject: '🔴 AXKAN WhatsApp Bot DOWN — Token Expired',
      html,
    });
    console.error('🔴 Token alert email sent to', adminEmail);
  } catch (emailErr) {
    console.error('🔴 Failed to send token alert email:', emailErr.message);
  }
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

/**
 * Make an authenticated request to the Meta WhatsApp Cloud API.
 * Detects 401/403 errors and fires an admin alert.
 *
 * @param {string} path  - Relative path appended to WHATSAPP_API_BASE (e.g. `/${phoneId}/messages`)
 * @param {object} [options] - fetch options (method, body, etc.)
 * @returns {Promise<Response>} The raw fetch Response
 */
export async function metaApiFetch(path, options = {}) {
  const url = path.startsWith('http') ? path : `${WHATSAPP_API_BASE}${path}`;

  const headers = {
    'Authorization': `Bearer ${getAccessToken()}`,
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });

  // --- Token health check ---
  if (response.status === 401 || response.status === 403) {
    const errorBody = await response.clone().text();
    console.error(`🔴 META API ${response.status} — Token likely expired. URL: ${url}`);
    console.error(`🔴 Response: ${errorBody.substring(0, 200)}`);

    if (!tokenDead) {
      tokenDead = true;
      console.error('🔴 WHATSAPP TOKEN IS DEAD — Bot cannot send messages until token is refreshed!');
    }

    // Fire async alert (don't block the caller)
    sendTokenAlert(response.status, errorBody).catch(() => {});
  } else if (tokenDead && response.ok) {
    // Token was replaced and is working again
    tokenDead = false;
    alertSentAt = null;
    console.log('🟢 WhatsApp token recovered — API calls working again');
  }

  return response;
}

/**
 * Send a text message via WhatsApp Cloud API.
 * @returns {{ success: boolean, data?: object, error?: string }}
 */
export async function sendWhatsAppMessage(to, text) {
  try {
    const response = await metaApiFetch(`/${getPhoneNumberId()}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    });

    const data = await response.json();
    if (data.error) {
      console.error('🟢 WhatsApp send error:', data.error);
      return { success: false, error: data.error };
    }
    return { success: true, data };
  } catch (err) {
    console.error('🟢 WhatsApp send failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send a video via WhatsApp Cloud API using a public URL.
 * @param {string} to - Recipient phone number
 * @param {string} videoUrl - Public HTTPS URL of the video
 * @param {string} [caption] - Optional caption text
 * @returns {{ success: boolean, data?: object, error?: string }}
 */
export async function sendWhatsAppVideo(to, videoUrl, caption) {
  try {
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'video',
      video: { link: videoUrl }
    };
    if (caption) body.video.caption = caption;

    const response = await metaApiFetch(`/${getPhoneNumberId()}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (data.error) {
      console.error('🟢 WhatsApp video send error:', data.error);
      return { success: false, error: data.error };
    }
    console.log(`📹 Video sent to ${to}: ${videoUrl}`);
    return { success: true, data };
  } catch (err) {
    console.error('📹 WhatsApp video send failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send a list message (radio-button menu) via WhatsApp Cloud API.
 * Max 10 rows total across all sections, row titles max 24 chars, button text max 20 chars.
 * @returns {{ success: boolean, data?: object, error?: string, fallbackText?: string }}
 */
export async function sendWhatsAppListMessage(to, header, body, footer, buttonText, sections) {
  try {
    // Truncate and validate
    const truncatedButton = (buttonText || 'Ver opciones').substring(0, 20);
    const truncatedSections = (sections || []).map(section => ({
      title: (section.title || '').substring(0, 24),
      rows: (section.rows || []).slice(0, 10).map(row => ({
        id: row.id || `row_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: (row.title || '').substring(0, 24),
        description: row.description ? row.description.substring(0, 72) : undefined,
      })),
    }));

    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: body || ' ' },
        action: {
          button: truncatedButton,
          sections: truncatedSections,
        },
      },
    };

    if (header) payload.interactive.header = { type: 'text', text: header.substring(0, 60) };
    if (footer) payload.interactive.footer = { text: footer.substring(0, 60) };

    const response = await metaApiFetch(`/${getPhoneNumberId()}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (data.error) {
      console.error('🟢 WhatsApp list send error:', data.error);
      const fallbackText = `${body}\n\n${truncatedSections.map(s =>
        s.rows.map(r => `• ${r.title}${r.description ? ' - ' + r.description : ''}`).join('\n')
      ).join('\n')}`;
      return { success: false, error: data.error, fallbackText };
    }
    return { success: true, data };
  } catch (err) {
    console.error('🟢 WhatsApp list send failed:', err.message);
    return { success: false, error: err.message, fallbackText: body };
  }
}

/**
 * Send a quick-reply button message via WhatsApp Cloud API.
 * Max 3 buttons, button titles max 20 chars.
 * @returns {{ success: boolean, data?: object, error?: string, fallbackText?: string }}
 */
export async function sendWhatsAppButtonMessage(to, body, buttons, header, footer) {
  try {
    const truncatedButtons = (buttons || []).slice(0, 3).map((btn, i) => ({
      type: 'reply',
      reply: {
        id: btn.id || `btn_${Date.now()}_${i}`,
        title: (btn.title || btn.text || '').substring(0, 20),
      },
    }));

    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body || ' ' },
        action: { buttons: truncatedButtons },
      },
    };

    if (header) payload.interactive.header = { type: 'text', text: header.substring(0, 60) };
    if (footer) payload.interactive.footer = { text: footer.substring(0, 60) };

    const response = await metaApiFetch(`/${getPhoneNumberId()}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (data.error) {
      console.error('🟢 WhatsApp button send error:', data.error);
      const fallbackText = `${body}\n\n${truncatedButtons.map(b => `• ${b.reply.title}`).join('\n')}`;
      return { success: false, error: data.error, fallbackText };
    }
    return { success: true, data };
  } catch (err) {
    console.error('🟢 WhatsApp button send failed:', err.message);
    return { success: false, error: err.message, fallbackText: body };
  }
}

/**
 * Send a CTA URL button message via WhatsApp Cloud API.
 * @returns {{ success: boolean, data?: object, error?: string, fallbackText?: string }}
 */
export async function sendWhatsAppCTAMessage(to, body, displayText, url, header, footer) {
  try {
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: { text: body || ' ' },
        action: {
          name: 'cta_url',
          parameters: {
            display_text: (displayText || 'Ver más').substring(0, 20),
            url,
          },
        },
      },
    };

    if (header) payload.interactive.header = { type: 'text', text: header.substring(0, 60) };
    if (footer) payload.interactive.footer = { text: footer.substring(0, 60) };

    const response = await metaApiFetch(`/${getPhoneNumberId()}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (data.error) {
      console.error('🟢 WhatsApp CTA send error:', data.error);
      return { success: false, error: data.error, fallbackText: `${body}\n\n${url}` };
    }
    return { success: true, data };
  } catch (err) {
    console.error('🟢 WhatsApp CTA send failed:', err.message);
    return { success: false, error: err.message, fallbackText: `${body}\n\n${url}` };
  }
}

/**
 * Send an emoji reaction to a specific message.
 */
export async function sendWhatsAppReaction(to, messageId, emoji) {
  try {
    const response = await metaApiFetch(
      `${WHATSAPP_API_BASE}/${getPhoneNumberId()}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'reaction',
          reaction: { message_id: messageId, emoji }
        })
      }
    );
    const data = await response.json();
    if (data.error) {
      console.error('🟢 WhatsApp reaction send error:', data.error);
      return { success: false, error: data.error };
    }
    return { success: true, data };
  } catch (err) {
    console.error('🟢 WhatsApp reaction send failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send a location request — client sees a "Share Location" button.
 */
export async function sendWhatsAppLocationRequest(to, body) {
  try {
    const response = await metaApiFetch(
      `${WHATSAPP_API_BASE}/${getPhoneNumberId()}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'interactive',
          interactive: {
            type: 'location_request_message',
            body: { text: body },
            action: { name: 'send_location' }
          }
        })
      }
    );
    const data = await response.json();
    if (data.error) {
      console.error('🟢 WhatsApp location request error:', data.error);
      return { success: false, error: data.error, fallbackText: body };
    }
    return { success: true, data };
  } catch (err) {
    console.error('🟢 WhatsApp location request failed:', err.message);
    return { success: false, error: err.message, fallbackText: body };
  }
}

/**
 * Send a product carousel — series of image+button messages.
 */
export async function sendWhatsAppCarousel(to, cards) {
  const results = [];
  for (const card of cards.slice(0, 5)) {
    try {
      if (card.imageUrl) {
        const caption = `*${card.name}*\n💰 $${card.price} MXN c/u\n${card.description || ''}`.trim();
        const imgResponse = await metaApiFetch(
          `${WHATSAPP_API_BASE}/${getPhoneNumberId()}/messages`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to,
              type: 'image',
              image: { link: card.imageUrl, caption }
            })
          }
        );
        results.push(await imgResponse.json());
      }
      const btnResponse = await metaApiFetch(
        `${WHATSAPP_API_BASE}/${getPhoneNumberId()}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to,
            type: 'interactive',
            interactive: {
              type: 'button',
              body: { text: `¿Te interesa ${card.name}?` },
              action: {
                buttons: [
                  { type: 'reply', reply: { id: `order_${card.productId || card.name}`, title: 'Quiero este' } },
                  { type: 'reply', reply: { id: `info_${card.productId || card.name}`, title: 'Más info' } }
                ]
              }
            }
          })
        }
      );
      results.push(await btnResponse.json());
    } catch (err) {
      console.error(`🟢 WhatsApp carousel card error (${card.name}):`, err.message);
    }
  }
  return { success: true, cardsSent: results.length };
}

/**
 * Send a WhatsApp Flow message — opens a multi-screen form.
 */
export async function sendWhatsAppFlow(to, flowId, flowToken, body, ctaText = 'Comenzar') {
  try {
    const response = await metaApiFetch(
      `${WHATSAPP_API_BASE}/${getPhoneNumberId()}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'interactive',
          interactive: {
            type: 'flow',
            body: { text: body },
            action: {
              name: 'flow',
              parameters: {
                flow_id: flowId,
                flow_token: flowToken,
                flow_cta: ctaText,
                flow_action: 'navigate',
                flow_action_payload: { screen: 'PRODUCT_SELECT' }
              }
            }
          }
        })
      }
    );
    const data = await response.json();
    if (data.error) {
      console.error('🟢 WhatsApp flow send error:', data.error);
      return { success: false, error: data.error, fallbackText: body };
    }
    return { success: true, data };
  } catch (err) {
    console.error('🟢 WhatsApp flow send failed:', err.message);
    return { success: false, error: err.message, fallbackText: body };
  }
}

/**
 * Send a WhatsApp template message (for initiating conversations outside 24h window).
 *
 * @param {string} to - Recipient phone number (e.g. "5215538253251")
 * @param {string} templateName - Approved template name (e.g. "designer_daily_followup")
 * @param {string} languageCode - Template language (e.g. "es_MX")
 * @param {Array} bodyParameters - Array of parameter values for body variables
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function sendWhatsAppTemplate(to, templateName, languageCode = 'es_MX', bodyParameters = []) {
  try {
    const components = [];
    if (bodyParameters.length > 0) {
      components.push({
        type: 'body',
        parameters: bodyParameters.map(val => ({ type: 'text', text: String(val) }))
      });
    }

    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length > 0 && { components })
      }
    };

    const response = await metaApiFetch(
      `${WHATSAPP_API_BASE}/${getPhoneNumberId()}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );
    const data = await response.json();
    if (data.error) {
      console.error('🟢 WhatsApp template send error:', data.error);
      return { success: false, error: data.error };
    }
    return { success: true, data };
  } catch (err) {
    console.error('🟢 WhatsApp template send failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Check if the WhatsApp token is currently known to be dead.
 */
export function isTokenDead() {
  return tokenDead;
}

export { WHATSAPP_API_BASE, getAccessToken, getPhoneNumberId };
