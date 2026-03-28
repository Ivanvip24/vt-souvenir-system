import cron from 'node-cron';
import { query } from '../shared/database.js';
import { sendWhatsAppMessage } from './whatsapp-api.js';

let scheduledJob = null;

// Re-engagement messages — value-first, not "still interested?" nagging
// Research: follow-ups that add value convert 15-25%. Generic "checking in" annoys.
const REENGAGEMENT_MESSAGES = [
  'Oye, la producción de esta semana tiene espacio. Si quieres que te aparte lugar me dices 👍',
  'Te cuento que nos acaban de llegar pedidos de tu zona. Si quieres aprovechar el envío te cotizo rápido',
  'Por cierto, si pides 300+ piezas el envío te sale gratis. ¿Quieres que te arme la cotización?',
  'Oye, tenemos una promo esta semana en pedidos de 500+ piezas. ¿Te mando los detalles?',
  'Hola! Solo te aviso que la producción tarda 8-14 días. Si lo necesitas para una fecha específica me dices para calcular',
];

function getRandomMessage() {
  return REENGAGEMENT_MESSAGES[Math.floor(Math.random() * REENGAGEMENT_MESSAGES.length)];
}

/**
 * Process all conversations with expired reengagement timers.
 * Sends a follow-up message to clients who went silent after their last message.
 * Only sends if: timer expired AND last message was NOT from the client
 * (meaning bot replied but client went silent).
 */
export async function processReengagementQueue() {
  try {
    // Find conversations where:
    // 1. reengagement_at has passed
    // 2. The conversation is still active
    const expired = await query(`
      SELECT wc.id, wc.wa_id, wc.client_name, wc.reengagement_at
      FROM whatsapp_conversations wc
      WHERE wc.reengagement_at IS NOT NULL
        AND wc.reengagement_at <= NOW()
        AND wc.status != 'inactive'
        AND (wc.is_archived IS NULL OR wc.is_archived = false)
    `);

    if (expired.rows.length === 0) return;

    console.log(`🔄 Re-engagement: ${expired.rows.length} conversation(s) to follow up`);

    for (const conv of expired.rows) {
      try {
        // Check the last message — only follow up if bot already replied (client went silent)
        const lastMsg = await query(`
          SELECT direction FROM whatsapp_messages
          WHERE conversation_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `, [conv.id]);

        // If last message is outbound (bot replied, client silent) → send follow-up
        // If last message is inbound (bot never replied) → skip, something else is wrong
        if (lastMsg.rows.length > 0 && lastMsg.rows[0].direction === 'outbound') {
          const message = getRandomMessage();
          await sendWhatsAppMessage(conv.wa_id, message);

          // Store the follow-up message in DB
          await query(
            `INSERT INTO whatsapp_messages (conversation_id, wa_message_id, direction, sender, message_type, content)
             VALUES ($1, $2, 'outbound', 'system', 'text', $3)`,
            [conv.id, `reengagement_${Date.now()}`, message]
          );

          console.log(`🔄 Re-engagement sent to ${conv.client_name || conv.wa_id}`);
        } else {
          console.log(`🔄 Skipped ${conv.client_name || conv.wa_id} — last message is inbound (bot didn't reply)`);
        }

        // Clear timer regardless (one attempt per silence period)
        await query(
          'UPDATE whatsapp_conversations SET reengagement_at = NULL, updated_at = NOW() WHERE id = $1',
          [conv.id]
        );
      } catch (msgErr) {
        console.error(`🔄 Re-engagement error for ${conv.wa_id}:`, msgErr.message);
        // Clear timer to avoid retry loop
        await query(
          'UPDATE whatsapp_conversations SET reengagement_at = NULL WHERE id = $1',
          [conv.id]
        );
      }
    }
  } catch (err) {
    console.error('🔄 Re-engagement scheduler error:', err.message);
  }
}

/**
 * Initialize the re-engagement scheduler.
 * Runs every 5 minutes to check for expired timers.
 */
export function initializeFollowupScheduler() {
  if (scheduledJob) return;

  scheduledJob = cron.schedule('*/5 * * * *', async () => {
    await processReengagementQueue();
  }, {
    timezone: 'America/Mexico_City'
  });

  console.log('🔄 Re-engagement scheduler initialized (every 5 min)');
}

export function stopFollowupScheduler() {
  if (scheduledJob) {
    scheduledJob.stop();
    scheduledJob = null;
    console.log('🔄 Re-engagement scheduler stopped');
  }
}

export function isFollowupSchedulerRunning() {
  return scheduledJob !== null;
}
