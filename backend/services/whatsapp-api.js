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
 * Check if the WhatsApp token is currently known to be dead.
 */
export function isTokenDead() {
  return tokenDead;
}

export { WHATSAPP_API_BASE, getAccessToken, getPhoneNumberId };
