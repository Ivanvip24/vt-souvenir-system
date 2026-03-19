import { Router } from 'express';
import { query } from '../shared/database.js';
import { authMiddleware } from './admin-routes.js';
import { processIncomingMessage, generateConversationInsights, ensureAiToggleColumn, getAiModel, setAiModel, getGlobalAiEnabled, setGlobalAiEnabled } from '../services/whatsapp-ai.js';
import { migrate as migrateLabelsArchive } from '../migrations/add-whatsapp-labels-archive.js';

// Run labels/archive migration once on import
let labelsArchiveMigrated = false;
async function ensureLabelsArchiveColumns() {
  if (labelsArchiveMigrated) return;
  try {
    await migrateLabelsArchive();
    labelsArchiveMigrated = true;
  } catch (err) {
    if (err.message?.includes('already exists')) {
      labelsArchiveMigrated = true;
    } else {
      console.error('🏷️ Labels/archive migration warning:', err.message);
    }
  }
}
import { sendWhatsAppMessage, sendWhatsAppListMessage, sendWhatsAppButtonMessage, sendWhatsAppCTAMessage, sendWhatsAppReaction, sendWhatsAppLocationRequest, sendWhatsAppCarousel, sendWhatsAppFlow } from '../services/whatsapp-api.js';
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
          } else if (interactiveData?.type === 'nfm_reply') {
            const responseJson = interactiveData.nfm_reply?.response_json;
            const flowToken = interactiveData.nfm_reply?.flow_token;
            try {
              const parsed = JSON.parse(responseJson);
              messageText = `[Formulario completado: ${JSON.stringify(parsed)}]`;
              messageMetadata = { interactive_type: 'nfm_reply', flow_token: flowToken, flow_response: parsed };
            } catch {
              messageText = `[Formulario completado]`;
              messageMetadata = { interactive_type: 'nfm_reply', flow_token: flowToken };
            }
          } else {
            messageText = `[Respuesta interactiva: ${interactiveData?.type || 'desconocida'}]`;
          }
        }
        else if (message.type === 'location') {
          const loc = message.location;
          messageText = `[Ubicación compartida: ${loc.name || loc.address || `${loc.latitude}, ${loc.longitude}`}]`;
          messageMetadata = {
            type: 'location',
            latitude: loc.latitude,
            longitude: loc.longitude,
            name: loc.name || null,
            address: loc.address || null
          };
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
      await ensureLabelsArchiveColumns();

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

      // If AI is globally disabled, skip replying entirely
      if (aiResult.skipped) {
        console.log(`🤖 AI disabled globally — skipping reply to ${waId}`);
        return;
      }

      // Convert markdown **bold** to WhatsApp *bold* format
      const replyText = (aiResult.reply || '').replace(/\*\*(.+?)\*\*/g, '*$1*');
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
            await sendWhatsAppDocument(waId, doc.url, doc.filename || 'documento.pdf', doc.caption || '');
          }
        } catch (docErr) {
          console.error('🟢 WhatsApp document send error:', docErr.message);
        }
      }

      // Send emoji reaction if AI requested one
      if (aiResult.reactionEmoji && waMessageId) {
        try {
          await sendWhatsAppReaction(waId, waMessageId, aiResult.reactionEmoji);
        } catch (reactErr) {
          console.error('🟢 WhatsApp reaction send error:', reactErr.message);
        }
      }

      // Send location request if AI requested one
      if (aiResult.locationRequest) {
        try {
          const locBody = aiResult.locationRequest.body || '¿Podrías compartirme tu ubicación para el envío?';
          const result = await sendWhatsAppLocationRequest(waId, locBody);
          if (!result.success && result.fallbackText) {
            await sendWhatsAppMessage(waId, result.fallbackText);
          }
        } catch (locErr) {
          console.error('🟢 WhatsApp location request error:', locErr.message);
        }
      }

      // Send product carousel if AI requested one
      if (aiResult.carouselCards && aiResult.carouselCards.length > 0) {
        try {
          await sendWhatsAppCarousel(waId, aiResult.carouselCards);
        } catch (carouselErr) {
          console.error('🟢 WhatsApp carousel send error:', carouselErr.message);
        }
      }

      // Send WhatsApp Flow if AI requested one
      if (aiResult.flowRequest) {
        const flowType = aiResult.flowRequest.flowId || 'order_form';
        const flowId = process.env[`WA_FLOW_${flowType.toUpperCase().replace('_', '_')}_ID`] || null;
        if (flowId) {
          try {
            const flowToken = `${flowType}_${Date.now()}`;
            const result = await sendWhatsAppFlow(
              waId, flowId, flowToken,
              aiResult.flowRequest.body || 'Completa este formulario:',
              aiResult.flowRequest.ctaText || 'Comenzar'
            );
            if (!result.success && result.fallbackText) {
              await sendWhatsAppMessage(waId, result.fallbackText);
            }
          } catch (flowErr) {
            console.error('🟢 WhatsApp flow send error:', flowErr.message);
          }
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
      if (aiResult.reactionEmoji) {
        outboundMetadata.reactionSent = aiResult.reactionEmoji;
      }
      if (aiResult.locationRequest) {
        outboundMetadata.locationRequested = true;
      }
      if (aiResult.carouselCards?.length > 0) {
        outboundMetadata.carouselSent = aiResult.carouselCards;
      }
      if (aiResult.flowRequest) {
        outboundMetadata.flowSent = aiResult.flowRequest;
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
// Flow data endpoint — Meta calls this for dynamic screen data (no auth)
// ---------------------------------------------------------------------------
router.post('/flow-endpoint', async (req, res) => {
  try {
    const { action, screen, data, flow_token } = req.body;

    if (action === 'ping') {
      return res.json({ data: { status: 'active' } });
    }

    if (action === 'INIT') {
      const productsResult = await query('SELECT id, name, base_price FROM products WHERE is_active = true ORDER BY name');
      const products = productsResult.rows.map(p => ({
        id: String(p.id),
        title: `${p.name} — $${p.base_price} MXN`
      }));
      return res.json({ screen: 'PRODUCT_SELECT', data: { products } });
    }

    if (action === 'data_exchange') {
      return res.json({ screen, data: {} });
    }

    res.json({ data: {} });
  } catch (err) {
    console.error('🟢 WhatsApp flow endpoint error:', err.message);
    res.status(500).json({ data: { error: 'Error interno del servidor' } });
  }
});

// ---------------------------------------------------------------------------
// 3. GET /conversations — List all conversations (auth required)
// ---------------------------------------------------------------------------
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    await ensureLabelsArchiveColumns();
    const showArchived = req.query.archived === 'true';
    const result = await query(`
      SELECT wc.*,
        (SELECT content FROM whatsapp_messages WHERE conversation_id = wc.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT COUNT(*) FROM whatsapp_messages WHERE conversation_id = wc.id) as message_count,
        COALESCE(
          (SELECT json_agg(json_build_object('id', wl.id, 'name', wl.name, 'color', wl.color))
           FROM whatsapp_conversation_labels wcl
           JOIN whatsapp_labels wl ON wl.id = wcl.label_id
           WHERE wcl.conversation_id = wc.id),
          '[]'::json
        ) as labels
      FROM whatsapp_conversations wc
      WHERE (COALESCE(wc.is_archived, false) = $1)
      ORDER BY wc.is_pinned DESC NULLS LAST, wc.last_message_at DESC NULLS LAST
    `, [showArchived]);
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
// 6b. PUT /conversations/:id/unread — Mark conversation as unread (auth required)
// ---------------------------------------------------------------------------
router.put('/conversations/:id/unread', authMiddleware, async (req, res) => {
  try {
    await query(
      'UPDATE whatsapp_conversations SET unread_count = 1 WHERE id = $1',
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Mark unread error:', err);
    res.status(500).json({ success: false, error: 'Failed to mark as unread' });
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
// 7a. POST /conversations/:id/recap — AI catches up on missed messages (auth required)
// ---------------------------------------------------------------------------
router.post('/conversations/:id/recap', authMiddleware, async (req, res) => {
  try {
    const conversationId = req.params.id;

    // Get conversation info
    const convResult = await query(
      'SELECT id, wa_id, client_name FROM whatsapp_conversations WHERE id = $1',
      [conversationId]
    );
    if (convResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    const conv = convResult.rows[0];

    // Get the last inbound message to use as the trigger for AI processing
    const lastMsg = await query(
      `SELECT content FROM whatsapp_messages
       WHERE conversation_id = $1 AND direction = 'inbound'
       ORDER BY created_at DESC LIMIT 1`,
      [conversationId]
    );

    if (lastMsg.rows.length === 0) {
      return res.json({ success: false, error: 'No client messages to recap' });
    }

    const lastMessageText = lastMsg.rows[0].content || '';

    // Process with AI — buildConversationHistory inside will load all stored messages
    const aiResult = await processIncomingMessage(
      conversationId,
      conv.wa_id,
      '[RECAP] El cliente envió mensajes mientras la IA estaba desactivada. El último mensaje fue: "' + lastMessageText + '". Responde naturalmente retomando la conversación basándote en todo el historial.',
      null
    );

    if (aiResult.skipped || !aiResult.reply) {
      return res.json({ success: false, error: aiResult.reason || 'AI did not generate a response' });
    }

    // Convert markdown **bold** to WhatsApp *bold* and send
    const recapReply = (aiResult.reply || '').replace(/\*\*(.+?)\*\*/g, '*$1*');
    await sendWhatsAppMessage(conv.wa_id, recapReply);

    // Store outbound message
    const outboundWaId = 'recap_' + Date.now();
    await query(
      `INSERT INTO whatsapp_messages (conversation_id, wa_message_id, direction, sender, message_type, content, metadata)
       VALUES ($1, $2, 'outbound', 'ai', 'text', $3, $4)`,
      [conversationId, outboundWaId, recapReply, JSON.stringify({ type: 'recap', intent: aiResult.intent })]
    );

    // Update conversation summary
    if (aiResult.intent) {
      await query(
        'UPDATE whatsapp_conversations SET intent = $1, ai_summary = $2, updated_at = NOW() WHERE id = $3',
        [aiResult.intent, aiResult.summary || null, conversationId]
      );
    }

    console.log(`🔄 Recap sent for conversation ${conversationId} (${conv.client_name || conv.wa_id})`);
    res.json({ success: true, reply: aiResult.reply });
  } catch (err) {
    console.error('🔄 Recap error:', err);
    res.status(500).json({ success: false, error: 'Recap failed' });
  }
});

// ---------------------------------------------------------------------------
// 7b. GET/PATCH /ai-model — Get or change the WhatsApp AI model (auth required)
// ---------------------------------------------------------------------------
router.get('/ai-model', authMiddleware, (req, res) => {
  res.json({ success: true, model: getAiModel(), globalAiEnabled: getGlobalAiEnabled() });
});

router.patch('/ai-global', authMiddleware, (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') return res.status(400).json({ success: false, error: 'enabled must be boolean' });
  const result = setGlobalAiEnabled(enabled);
  res.json({ success: true, globalAiEnabled: result });
});

router.patch('/ai-model', authMiddleware, (req, res) => {
  const { model } = req.body;
  if (!model) return res.status(400).json({ success: false, error: 'model is required' });
  const ok = setAiModel(model);
  if (!ok) return res.status(400).json({ success: false, error: 'Invalid model. Allowed: claude-haiku-4-5-20251001, claude-sonnet-4-5-20250929, claude-sonnet-4-6-20250514' });
  res.json({ success: true, model: getAiModel() });
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
// 9. POST /conversations/:id/react — Admin emoji reaction (auth required)
// ---------------------------------------------------------------------------
router.post('/conversations/:id/react', authMiddleware, async (req, res) => {
  try {
    const { messageId, emoji } = req.body;
    if (!messageId || !emoji) {
      return res.status(400).json({ success: false, error: 'messageId and emoji are required' });
    }

    const conv = await query('SELECT wa_id FROM whatsapp_conversations WHERE id = $1', [req.params.id]);
    if (conv.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const result = await sendWhatsAppReaction(conv.rows[0].wa_id, messageId, emoji);
    res.json(result);
  } catch (err) {
    console.error('🟢 WhatsApp admin reaction error:', err);
    res.status(500).json({ success: false, error: 'Failed to send reaction' });
  }
});

// ---------------------------------------------------------------------------
// 10. GET /health — Check WhatsApp bot token status (auth required)
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

// ---------------------------------------------------------------------------
// 11. GET /labels — List all labels with assignments
// ---------------------------------------------------------------------------
router.get('/labels', authMiddleware, async (req, res) => {
  try {
    await ensureLabelsArchiveColumns();
    const labels = await query(`
      SELECT wl.*,
        COALESCE(
          (SELECT json_agg(wcl.conversation_id)
           FROM whatsapp_conversation_labels wcl
           WHERE wcl.label_id = wl.id),
          '[]'::json
        ) as conversation_ids
      FROM whatsapp_labels wl
      ORDER BY wl.created_at ASC
    `);
    res.json({ success: true, data: labels.rows });
  } catch (err) {
    console.error('🏷️ WhatsApp labels list error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch labels' });
  }
});

// ---------------------------------------------------------------------------
// 12. POST /labels — Create a new label
// ---------------------------------------------------------------------------
router.post('/labels', authMiddleware, async (req, res) => {
  try {
    await ensureLabelsArchiveColumns();
    const { name, color } = req.body;
    if (!name || !color) {
      return res.status(400).json({ success: false, error: 'name and color are required' });
    }
    const result = await query(
      'INSERT INTO whatsapp_labels (name, color) VALUES ($1, $2) RETURNING *',
      [name.trim().substring(0, 50), color]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('🏷️ WhatsApp create label error:', err);
    res.status(500).json({ success: false, error: 'Failed to create label' });
  }
});

// ---------------------------------------------------------------------------
// 13. DELETE /labels/:id — Delete a label
// ---------------------------------------------------------------------------
router.delete('/labels/:id', authMiddleware, async (req, res) => {
  try {
    await query('DELETE FROM whatsapp_labels WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('🏷️ WhatsApp delete label error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete label' });
  }
});

// ---------------------------------------------------------------------------
// 14. POST /conversations/:id/labels/:labelId — Assign label to conversation
// ---------------------------------------------------------------------------
router.post('/conversations/:id/labels/:labelId', authMiddleware, async (req, res) => {
  try {
    await ensureLabelsArchiveColumns();
    await query(
      'INSERT INTO whatsapp_conversation_labels (conversation_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.id, req.params.labelId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('🏷️ WhatsApp assign label error:', err);
    res.status(500).json({ success: false, error: 'Failed to assign label' });
  }
});

// ---------------------------------------------------------------------------
// 15. DELETE /conversations/:id/labels/:labelId — Remove label from conversation
// ---------------------------------------------------------------------------
router.delete('/conversations/:id/labels/:labelId', authMiddleware, async (req, res) => {
  try {
    await query(
      'DELETE FROM whatsapp_conversation_labels WHERE conversation_id = $1 AND label_id = $2',
      [req.params.id, req.params.labelId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('🏷️ WhatsApp remove label error:', err);
    res.status(500).json({ success: false, error: 'Failed to remove label' });
  }
});

// ---------------------------------------------------------------------------
// 16. PATCH /conversations/:id/archive — Toggle archive
// ---------------------------------------------------------------------------
router.patch('/conversations/:id/archive', authMiddleware, async (req, res) => {
  try {
    await ensureLabelsArchiveColumns();
    const { is_archived } = req.body;
    await query(
      'UPDATE whatsapp_conversations SET is_archived = $1, updated_at = NOW() WHERE id = $2',
      [!!is_archived, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('📥 WhatsApp archive error:', err);
    res.status(500).json({ success: false, error: 'Failed to toggle archive' });
  }
});

// ---------------------------------------------------------------------------
// 17. PATCH /conversations/:id/pin — Toggle pin
// ---------------------------------------------------------------------------
router.patch('/conversations/:id/pin', authMiddleware, async (req, res) => {
  try {
    await ensureLabelsArchiveColumns();
    const { is_pinned } = req.body;
    await query(
      'UPDATE whatsapp_conversations SET is_pinned = $1, updated_at = NOW() WHERE id = $2',
      [!!is_pinned, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('📌 WhatsApp pin error:', err);
    res.status(500).json({ success: false, error: 'Failed to toggle pin' });
  }
});

// ---------------------------------------------------------------------------
// 18. DELETE /conversations/:id — Delete conversation and all its messages
// ---------------------------------------------------------------------------
router.delete('/conversations/:id', authMiddleware, async (req, res) => {
  try {
    const convId = req.params.id;
    // Delete in order: messages -> labels -> conversation
    await query('DELETE FROM whatsapp_messages WHERE conversation_id = $1', [convId]);
    await query('DELETE FROM whatsapp_conversation_labels WHERE conversation_id = $1', [convId]);
    await query('DELETE FROM whatsapp_conversations WHERE id = $1', [convId]);
    res.json({ success: true });
  } catch (err) {
    console.error('🗑️ WhatsApp delete conversation error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete conversation' });
  }
});

// ---------------------------------------------------------------------------
// 19. PATCH /conversations/:id/follow-up — Set/clear follow-up timer
// ---------------------------------------------------------------------------
router.patch('/conversations/:id/follow-up', authMiddleware, async (req, res) => {
  try {
    const convId = req.params.id;
    const { days, date, clear } = req.body;

    let followUpAt = null;

    if (clear) {
      followUpAt = null;
    } else if (days && typeof days === 'number' && days > 0) {
      // Set follow_up_at to N days from now
      const d = new Date();
      d.setDate(d.getDate() + days);
      followUpAt = d.toISOString();
    } else if (date) {
      followUpAt = new Date(date).toISOString();
    } else {
      return res.status(400).json({ success: false, error: 'Provide days, date, or clear:true' });
    }

    const result = await query(
      'UPDATE whatsapp_conversations SET follow_up_at = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [followUpAt, convId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('⏱ WhatsApp follow-up error:', err);
    res.status(500).json({ success: false, error: 'Failed to set follow-up' });
  }
});

export default router;
