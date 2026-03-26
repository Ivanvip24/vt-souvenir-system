import cron from 'node-cron';
import { query } from '../shared/database.js';
import { sendWhatsAppMessage } from './whatsapp-api.js';

let scheduledJob = null;

// Keep-alive messages — warm, professional, design-focused
const KEEPALIVE_MESSAGES = [
  'Hola! Estamos trabajando en tu diseño, te enviaremos avances pronto 🎨',
  'Hey! Tu proyecto sigue en proceso, pronto te compartimos el avance ✨',
  'Hola! Seguimos trabajando en tu diseño AXKAN, ya casi tenemos algo listo para ti 🔥',
  'Hey! Nada más para avisarte que tu pedido sigue en producción, pronto te mostramos el diseño 🎯',
  'Hola! Tu diseño va avanzando muy bien, en breve te compartimos cómo va quedando 💪',
];

function getRandomMessage() {
  return KEEPALIVE_MESSAGES[Math.floor(Math.random() * KEEPALIVE_MESSAGES.length)];
}

/**
 * Find active design assignments where the client's WhatsApp window
 * is about to expire (last client message was 22-24 hours ago).
 * Sends a keep-alive message to prevent the 24h window from closing.
 */
export async function processDesignKeepAlive() {
  try {
    // Find active design assignments where:
    // 1. Status is NOT aprobado (still in progress)
    // 2. Client has a phone number
    // 3. The last inbound message from this client was 22-24h ago
    //    (window about to expire, haven't sent a keep-alive yet)
    const atRisk = await query(`
      SELECT DISTINCT ON (da.client_phone)
        da.id AS assignment_id,
        da.order_id,
        da.client_phone,
        da.client_name,
        wc.id AS conversation_id,
        (
          SELECT MAX(wm.created_at)
          FROM whatsapp_messages wm
          WHERE wm.conversation_id = wc.id
            AND wm.direction = 'inbound'
        ) AS last_client_message
      FROM design_assignments da
      JOIN whatsapp_conversations wc ON wc.wa_id = da.client_phone
      WHERE da.status NOT IN ('aprobado')
        AND da.client_phone IS NOT NULL
        AND da.client_phone != ''
      ORDER BY da.client_phone, da.updated_at DESC
    `);

    if (atRisk.rows.length === 0) return;

    let sentCount = 0;

    for (const row of atRisk.rows) {
      try {
        if (!row.last_client_message) continue;

        const lastMsg = new Date(row.last_client_message);
        const hoursAgo = (Date.now() - lastMsg.getTime()) / (1000 * 60 * 60);

        // Only send if between 22-24 hours (window about to expire)
        if (hoursAgo < 22 || hoursAgo > 24) continue;

        // Check we haven't already sent a keep-alive in the last 23 hours
        const recentKeepAlive = await query(`
          SELECT id FROM whatsapp_messages
          WHERE conversation_id = $1
            AND direction = 'outbound'
            AND content LIKE '%trabajando%diseño%'
            AND created_at > NOW() - INTERVAL '23 hours'
          LIMIT 1
        `, [row.conversation_id]);

        if (recentKeepAlive.rows.length > 0) continue; // Already sent one

        const message = getRandomMessage();
        await sendWhatsAppMessage(row.client_phone, message);

        // Store in whatsapp_messages
        await query(
          `INSERT INTO whatsapp_messages (conversation_id, wa_message_id, direction, sender, message_type, content)
           VALUES ($1, $2, 'outbound', 'system', 'text', $3)`,
          [row.conversation_id, `keepalive_${Date.now()}`, message]
        );

        // Also store in design_messages so designer sees it in portal
        await query(
          `INSERT INTO design_messages (design_assignment_id, order_id, sender_type, sender_name, message_type, content)
           VALUES ($1, $2, 'designer', 'AXKAN Bot', 'text', $3)`,
          [row.assignment_id, row.order_id, message]
        );

        sentCount++;
        console.log(`🎨 Keep-alive sent to ${row.client_name || row.client_phone} (assignment ${row.assignment_id})`);

        // Rate limit: 350ms between messages
        await new Promise(r => setTimeout(r, 350));
      } catch (msgErr) {
        console.error(`🎨 Keep-alive error for ${row.client_phone}:`, msgErr.message);
      }
    }

    if (sentCount > 0) {
      console.log(`🎨 Design keep-alive: sent ${sentCount} message(s)`);
    }
  } catch (err) {
    console.error('🎨 Design keep-alive scheduler error:', err.message);
  }
}

/**
 * Returns window status for all active design assignments.
 * Used by the API to power the visual timer in the portal.
 */
export async function getDesignWindowStatus() {
  try {
    const result = await query(`
      SELECT
        da.id AS assignment_id,
        da.order_id,
        da.client_phone,
        da.client_name,
        da.status,
        da.assigned_to,
        (
          SELECT MAX(wm.created_at)
          FROM whatsapp_messages wm
          JOIN whatsapp_conversations wc ON wc.id = wm.conversation_id
          WHERE wc.wa_id = da.client_phone
            AND wm.direction = 'inbound'
        ) AS last_client_message
      FROM design_assignments da
      WHERE da.status NOT IN ('aprobado')
        AND da.client_phone IS NOT NULL
    `);

    return result.rows.map(row => {
      const lastMsg = row.last_client_message ? new Date(row.last_client_message) : null;
      const hoursRemaining = lastMsg
        ? Math.max(0, 24 - (Date.now() - lastMsg.getTime()) / (1000 * 60 * 60))
        : 0;

      let urgency = 'expired';
      if (hoursRemaining > 12) urgency = 'safe';
      else if (hoursRemaining > 6) urgency = 'warning';
      else if (hoursRemaining > 2) urgency = 'urgent';
      else if (hoursRemaining > 0) urgency = 'critical';

      return {
        assignmentId: row.assignment_id,
        orderId: row.order_id,
        clientPhone: row.client_phone,
        clientName: row.client_name,
        status: row.status,
        assignedTo: row.assigned_to,
        lastClientMessage: lastMsg,
        hoursRemaining: Math.round(hoursRemaining * 10) / 10,
        urgency,
      };
    });
  } catch (err) {
    console.error('🎨 Window status error:', err.message);
    return [];
  }
}

/**
 * Initialize the design keep-alive scheduler.
 * Runs every 30 minutes to check for expiring windows.
 */
export function initializeDesignKeepAlive() {
  // Run every 30 minutes
  scheduledJob = cron.schedule('*/30 * * * *', async () => {
    console.log('🎨 Running design keep-alive check...');
    await processDesignKeepAlive();
  });

  console.log('🎨 Design keep-alive scheduler initialized (every 30 min)');

  // Also run immediately on startup
  setTimeout(() => processDesignKeepAlive(), 5000);

  return scheduledJob;
}

export function stopDesignKeepAlive() {
  if (scheduledJob) {
    scheduledJob.stop();
    console.log('🎨 Design keep-alive scheduler stopped');
  }
}
