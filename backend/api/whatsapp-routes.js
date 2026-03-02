import { Router } from 'express';
import { query } from '../shared/database.js';
import { authMiddleware } from './admin-routes.js';
import { processIncomingMessage, generateConversationInsights, ensureAiToggleColumn } from '../services/whatsapp-ai.js';
import { sendWhatsAppMessage, sendWhatsAppListMessage, sendWhatsAppButtonMessage, sendWhatsAppCTAMessage } from '../services/whatsapp-api.js';
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
        else if (message.type === 'interactive') {
          // User tapped a list item or quick reply button
          const interactiveData = message.interactive;
          if (interactiveData?.type === 'list_reply') {
            messageText = `[Seleccionó: ${interactiveData.list_reply.title}]`;
            messageMetadata = { interactive_type: 'list_reply', ...interactiveData.list_reply };
          } else if (interactiveData?.type === 'button_reply') {
            messageText = `[Seleccionó: ${interactiveData.button_reply.title}]`;
            messageMetadata = { interactive_type: 'button_reply', ...interactiveData.button_reply };
          } else {
            messageText = `[Respuesta interactiva: ${interactiveData?.type || 'desconocida'}]`;
          }
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

      // Ensure ai_enabled column exists (auto-migration on first call)
      await ensureAiToggleColumn();

      // Get or create conversation
      const convResult = await query(
        `INSERT INTO whatsapp_conversations (wa_id, client_name, last_message_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (wa_id) DO UPDATE
           SET client_name = $2, last_message_at = NOW(), updated_at = NOW()
         RETURNING id, client_id, ai_enabled`,
        [waId, clientName]
      );
      const conversationId = convResult.rows[0].id;
      let clientId = convResult.rows[0].client_id;
      const aiEnabled = convResult.rows[0].ai_enabled;

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

      // Skip AI processing if ai_enabled is false for this conversation
      if (aiEnabled === false) {
        console.log(`🟢 WhatsApp AI disabled for conversation ${conversationId} — skipping auto-reply`);
        return;
      }

      // Get AI reply (pass media context for vision/audio processing)
      const aiResult = await processIncomingMessage(conversationId, waId, messageText, mediaContext);
      const replyText = aiResult.reply;
      const intent = aiResult.intent || null;
      const summary = aiResult.summary || null;
      const imagesToSend = aiResult.imagesToSend || [];
      const listsToSend = aiResult.listsToSend || [];
      const buttonsToSend = aiResult.buttonsToSend || [];
      const documentsToSend = aiResult.documentsToSend || [];

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

      // Send interactive list messages
      for (const list of listsToSend) {
        try {
          const result = await sendWhatsAppListMessage(
            waId, list.header || '', list.body || '', list.footer || '',
            list.buttonText || 'Ver opciones', list.sections || []
          );
          if (!result.success && result.fallbackText) {
            await sendWhatsAppMessage(waId, result.fallbackText);
          }
        } catch (listErr) {
          console.error('🟢 WhatsApp list send error:', listErr.message);
        }
      }

      // Send interactive button messages
      for (const btn of buttonsToSend) {
        try {
          const result = await sendWhatsAppButtonMessage(
            waId, btn.body || '', btn.buttons || [],
            btn.header || null, btn.footer || null
          );
          if (!result.success && result.fallbackText) {
            await sendWhatsAppMessage(waId, result.fallbackText);
          }
        } catch (btnErr) {
          console.error('🟢 WhatsApp button send error:', btnErr.message);
        }
      }

      // Send documents if AI requested them
      for (const doc of documentsToSend) {
        try {
          if (doc.url) {
            await sendWhatsAppDocument(waId, doc.url, doc.caption || '', doc.filename || 'documento.pdf');
          }
        } catch (docErr) {
          console.error('🟢 WhatsApp document send error:', docErr.message);
        }
      }

      // Store outbound AI message
      const outboundWaId = 'ai_' + Date.now();
      const outboundMetadata = { intent };
      if (imagesToSend.length > 0) {
        outboundMetadata.imagesSent = imagesToSend;
      }
      if (listsToSend.length > 0) {
        outboundMetadata.listsSent = listsToSend;
      }
      if (buttonsToSend.length > 0) {
        outboundMetadata.buttonsSent = buttonsToSend;
      }
      if (documentsToSend.length > 0) {
        outboundMetadata.documentsSent = documentsToSend;
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

// ---------------------------------------------------------------------------
// 7. PATCH /conversations/:id/settings — Update conversation settings (auth required)
// ---------------------------------------------------------------------------
router.patch('/conversations/:id/settings', authMiddleware, async (req, res) => {
  try {
    const { ai_enabled } = req.body;
    if (typeof ai_enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'ai_enabled must be a boolean' });
    }

    const result = await query(
      'UPDATE whatsapp_conversations SET ai_enabled = $1, updated_at = NOW() WHERE id = $2 RETURNING id, ai_enabled',
      [ai_enabled, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    console.log(`🟢 WhatsApp AI ${ai_enabled ? 'enabled' : 'disabled'} for conversation ${req.params.id}`);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('🟢 WhatsApp settings update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

// ---------------------------------------------------------------------------
// 8. POST /conversations/:id/insights — AI conversation analysis (auth required)
// ---------------------------------------------------------------------------
router.post('/conversations/:id/insights', authMiddleware, async (req, res) => {
  try {
    const conversationId = req.params.id;
    const forceRefresh = req.body?.forceRefresh || false;

    // If force refresh, reset cache counter so it re-analyzes
    if (forceRefresh) {
      await query(
        'UPDATE whatsapp_conversations SET insights_message_count = 0 WHERE id = $1',
        [conversationId]
      );
    }

    const result = await generateConversationInsights(conversationId);

    res.json({
      success: true,
      data: result.insights,
      cached: result.cached
    });
  } catch (err) {
    console.error('🟢 WhatsApp insights error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate insights' });
  }
});

// ---------------------------------------------------------------------------
// 8. GET /health — Check WhatsApp bot token status (auth required)
// ---------------------------------------------------------------------------
import { isTokenDead } from '../services/whatsapp-api.js';

router.get('/health', authMiddleware, async (req, res) => {
  const dead = isTokenDead();
  res.json({
    success: true,
    whatsapp: {
      tokenStatus: dead ? 'EXPIRED' : 'OK',
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ? 'configured' : 'MISSING',
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN ? 'configured' : 'MISSING',
    },
  });
});

export default router;
