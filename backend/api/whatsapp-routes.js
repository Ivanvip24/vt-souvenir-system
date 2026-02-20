import { Router } from 'express';
import { query } from '../shared/database.js';
import { authMiddleware } from './admin-routes.js';
import { processIncomingMessage } from '../services/whatsapp-ai.js';
import {
  downloadWhatsAppMedia,
  uploadMediaToCloudinary,
  sendWhatsAppImage,
  sendWhatsAppDocument,
  sendWhatsAppAudio,
  transcribeAudio
} from '../services/whatsapp-media.js';

const router = Router();

// ---------------------------------------------------------------------------
// Helper: send a text message via the Meta WhatsApp Cloud API
// ---------------------------------------------------------------------------
async function sendWhatsAppMessage(to, text) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: { body: text }
        })
      }
    );
    const data = await response.json();
    if (data.error) {
      console.error('🟢 WhatsApp send error:', data.error);
    }
    return data;
  } catch (err) {
    console.error('🟢 WhatsApp send failed:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 1. GET /webhook — Meta verification handshake (no auth)
// ---------------------------------------------------------------------------
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('🟢 WhatsApp webhook verified');
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// ---------------------------------------------------------------------------
// 2. POST /webhook — Receive inbound messages from Meta (no auth)
// ---------------------------------------------------------------------------
router.post('/webhook', (req, res) => {
  // Always respond 200 immediately so Meta does not retry
  res.sendStatus(200);

  // Process the payload asynchronously
  (async () => {
    try {
      const value = req.body?.entry?.[0]?.changes?.[0]?.value;
      if (!value || !value.messages || value.messages.length === 0) {
        // Status update or other non-message event — nothing to do
        return;
      }

      const message = value.messages[0];
      const contact = value.contacts?.[0];
      const waId = message.from;
      const waMessageId = message.id;
      const clientName = contact?.profile?.name || waId;

      // Process message based on type
      let messageText = '';
      let mediaContext = null;
      let mediaUrl = null;
      let messageMetadata = null;

      console.log('🟢 WhatsApp message from', waId, '— type:', message.type);

      try {
        if (message.type === 'text') {
          messageText = message.text?.body || '';
        }
        else if (message.type === 'image') {
          const media = await downloadWhatsAppMedia(message.image.id);
          const cloudinaryResult = await uploadMediaToCloudinary(media.buffer, media.mimeType, 'whatsapp-media');
          const base64 = media.buffer.toString('base64');
          messageText = message.image.caption || '[Imagen]';
          mediaUrl = cloudinaryResult.url;
          mediaContext = { type: 'image', imageBase64: base64, imageMimeType: media.mimeType, mediaUrl: cloudinaryResult.url };
          messageMetadata = { cloudinaryUrl: cloudinaryResult.url };
        }
        else if (message.type === 'audio') {
          const media = await downloadWhatsAppMedia(message.audio.id);
          const cloudinaryResult = await uploadMediaToCloudinary(media.buffer, media.mimeType, 'whatsapp-audio');
          const transcription = await transcribeAudio(media.buffer, media.mimeType);
          messageText = transcription || '[Audio no reconocido]';
          mediaUrl = cloudinaryResult.url;
          mediaContext = { type: 'audio', transcription, mediaUrl: cloudinaryResult.url };
          messageMetadata = { cloudinaryUrl: cloudinaryResult.url, transcription };
        }
        else if (message.type === 'document') {
          const media = await downloadWhatsAppMedia(message.document.id);
          const cloudinaryResult = await uploadMediaToCloudinary(media.buffer, media.mimeType, 'whatsapp-docs');
          messageText = `[Documento: ${message.document.filename || 'archivo'}]`;
          mediaUrl = cloudinaryResult.url;
          mediaContext = { type: 'document', mediaUrl: cloudinaryResult.url };
          messageMetadata = { cloudinaryUrl: cloudinaryResult.url, filename: message.document.filename };
        }
        else if (message.type === 'video') {
          messageText = message.video?.caption || '[Video recibido — solo procesamos texto, imágenes y audio]';
          mediaContext = { type: 'video' };
        }
        else if (message.type === 'sticker') {
          messageText = '[Sticker recibido]';
          mediaContext = { type: 'sticker' };
        }
        else {
          messageText = `[Mensaje tipo ${message.type} recibido]`;
        }
      } catch (mediaErr) {
        console.error('🟢 WhatsApp media processing error:', mediaErr.message);
        messageText = messageText || '[Error procesando media]';
      }

      console.log('🟢 WhatsApp content:', messageText.substring(0, 100));

      // Dedup: skip if we already stored this message
      const existing = await query(
        'SELECT id FROM whatsapp_messages WHERE wa_message_id = $1',
        [waMessageId]
      );
      if (existing.rows.length > 0) {
        return;
      }

      // Get or create conversation
      const convResult = await query(
        `INSERT INTO whatsapp_conversations (wa_id, client_name, last_message_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (wa_id) DO UPDATE
           SET client_name = $2, last_message_at = NOW(), updated_at = NOW()
         RETURNING id, client_id`,
        [waId, clientName]
      );
      const conversationId = convResult.rows[0].id;
      let clientId = convResult.rows[0].client_id;

      // Try to match an existing client by phone number (last 10 digits)
      if (!clientId) {
        const clientMatch = await query(
          `SELECT id FROM clients WHERE phone LIKE '%' || RIGHT($1, 10) || '%' LIMIT 1`,
          [waId]
        );
        if (clientMatch.rows.length > 0) {
          clientId = clientMatch.rows[0].id;
          await query(
            'UPDATE whatsapp_conversations SET client_id = $1 WHERE id = $2',
            [clientId, conversationId]
          );
        }
      }

      // Store inbound message (with media URL and metadata if present)
      await query(
        `INSERT INTO whatsapp_messages (conversation_id, wa_message_id, direction, sender, message_type, content, media_url, metadata)
         VALUES ($1, $2, 'inbound', 'client', $3, $4, $5, $6)`,
        [conversationId, waMessageId, message.type, messageText, mediaUrl, messageMetadata ? JSON.stringify(messageMetadata) : null]
      );

      // Increment unread count
      await query(
        'UPDATE whatsapp_conversations SET unread_count = unread_count + 1 WHERE id = $1',
        [conversationId]
      );

      // Get AI reply (pass media context for vision/audio processing)
      const aiResult = await processIncomingMessage(conversationId, waId, messageText, mediaContext);
      const replyText = aiResult.reply;
      const intent = aiResult.intent || null;
      const summary = aiResult.summary || null;
      const imagesToSend = aiResult.imagesToSend || [];

      // Send text reply via Meta API
      await sendWhatsAppMessage(waId, replyText);

      // Send product images if AI requested them
      for (const img of imagesToSend) {
        if (img.imageUrl) {
          try {
            await sendWhatsAppImage(waId, img.imageUrl, img.productName || '');
          } catch (imgErr) {
            console.error('🟢 WhatsApp image send error:', imgErr.message);
          }
        }
      }

      // Store outbound AI message
      const outboundWaId = 'ai_' + Date.now();
      const outboundMetadata = { intent };
      if (imagesToSend.length > 0) {
        outboundMetadata.imagesSent = imagesToSend;
      }
      await query(
        `INSERT INTO whatsapp_messages (conversation_id, wa_message_id, direction, sender, message_type, content, metadata)
         VALUES ($1, $2, 'outbound', 'ai', 'text', $3, $4)`,
        [conversationId, outboundWaId, replyText, JSON.stringify(outboundMetadata)]
      );

      // Update conversation intent and summary
      await query(
        'UPDATE whatsapp_conversations SET intent = $1, ai_summary = $2 WHERE id = $3',
        [intent, summary, conversationId]
      );
    } catch (err) {
      console.error('🟢 WhatsApp webhook error:', err);
    }
  })();
});

// ---------------------------------------------------------------------------
// 3. GET /conversations — List all conversations (auth required)
// ---------------------------------------------------------------------------
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const result = await query(`
      SELECT wc.*,
        (SELECT content FROM whatsapp_messages WHERE conversation_id = wc.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT COUNT(*) FROM whatsapp_messages WHERE conversation_id = wc.id) as message_count
      FROM whatsapp_conversations wc
      ORDER BY wc.last_message_at DESC NULLS LAST
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('🟢 WhatsApp conversations list error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch conversations' });
  }
});

// ---------------------------------------------------------------------------
// 4. GET /conversations/:id/messages — Get messages for a conversation (auth)
// ---------------------------------------------------------------------------
router.get('/conversations/:id/messages', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM whatsapp_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('🟢 WhatsApp messages list error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch messages' });
  }
});

// ---------------------------------------------------------------------------
// 5. POST /conversations/:id/reply — Admin manual reply (auth required)
// ---------------------------------------------------------------------------
router.post('/conversations/:id/reply', authMiddleware, async (req, res) => {
  try {
    const { message, imageUrl } = req.body;
    if (!message && !imageUrl) {
      return res.status(400).json({ success: false, error: 'message or imageUrl is required' });
    }

    // Look up the conversation to get the wa_id
    const convResult = await query(
      'SELECT wa_id FROM whatsapp_conversations WHERE id = $1',
      [req.params.id]
    );
    if (convResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    const waId = convResult.rows[0].wa_id;

    // Send via Meta API (text, image, or both)
    if (message) {
      await sendWhatsAppMessage(waId, message);
    }
    if (imageUrl) {
      await sendWhatsAppImage(waId, imageUrl, message || '');
    }

    // Store outbound admin message
    const outboundWaId = 'admin_' + Date.now();
    const msgType = imageUrl ? 'image' : 'text';
    await query(
      `INSERT INTO whatsapp_messages (conversation_id, wa_message_id, direction, sender, message_type, content, media_url)
       VALUES ($1, $2, 'outbound', 'admin', $3, $4, $5)`,
      [req.params.id, outboundWaId, msgType, message || '', imageUrl || null]
    );

    // Update last_message_at
    await query(
      'UPDATE whatsapp_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1',
      [req.params.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('🟢 WhatsApp admin reply error:', err);
    res.status(500).json({ success: false, error: 'Failed to send reply' });
  }
});

// ---------------------------------------------------------------------------
// 6. PUT /conversations/:id/read — Mark conversation as read (auth required)
// ---------------------------------------------------------------------------
router.put('/conversations/:id/read', authMiddleware, async (req, res) => {
  try {
    await query(
      'UPDATE whatsapp_conversations SET unread_count = 0 WHERE id = $1',
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('🟢 WhatsApp mark read error:', err);
    res.status(500).json({ success: false, error: 'Failed to mark as read' });
  }
});

export default router;
