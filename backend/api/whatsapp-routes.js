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
  parseAssignment,
  createTask,
  completeTask,
  getPendingTasks,
  getDesignerByPhone,
  getDesignerByName,
  deliverDesignPiece
} from '../services/designer-task-tracker.js';
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
// Designer Task Tracking — detect assignments from Ivan, completions from designers
// ---------------------------------------------------------------------------
const IVAN_PHONE = (process.env.IVAN_WHATSAPP_NUMBER || '').replace(/\D/g, '').slice(-10);

const DESIGNER_NAME_RE = /\b(sarahi|sarahí|majo)\b/i;
const TASK_KEYWORD_RE = /\b(arm|arma|armado|armados|dis|diseño|diseña|diseños|diseñar)\b/i;
const COMPLETION_RE = /^(listo|ya|terminé|termine|sí|si|done|ya quedó|ya quedo)$/i;
const COMPLETION_ALL_RE = /^listo\s+todas$/i;

async function handleDesignerMessage(waId, text, imageUrl) {
  if (!text && !imageUrl) return null;

  const senderLast10 = waId.replace(/\D/g, '').slice(-10);
  const isIvan = IVAN_PHONE && senderLast10 === IVAN_PHONE;
  const normalText = (text || '').trim();
  const lowerText = normalText.toLowerCase();

  // ---- Manager commands (from Ivan) ----
  if (isIvan) {
    // "pendientes" — list all pending tasks
    if (lowerText === 'pendientes') {
      const tasks = await getPendingTasks();
      if (tasks.length === 0) {
        return { handled: true, reply: '✓ No hay tareas pendientes' };
      }
      const lines = tasks.map(t => {
        const qty = t.quantity ? ` (${t.quantity})` : '';
        const dest = t.destination ? ` — ${t.destination}` : '';
        return `• ${t.designer_name}: ${t.task_type} ${t.product_type || ''}${qty}${dest} [${t.status}]`;
      });
      return { handled: true, reply: `📋 Pendientes:\n${lines.join('\n')}` };
    }

    // "status sarahi" / "status majo"
    const statusMatch = lowerText.match(/^status\s+(sarahi|sarahí|majo)$/i);
    if (statusMatch) {
      const designer = await getDesignerByName(statusMatch[1]);
      if (!designer) {
        return { handled: true, reply: `No encontré a ${statusMatch[1]}` };
      }
      const tasks = await getPendingTasks(designer.id);
      if (tasks.length === 0) {
        return { handled: true, reply: `✓ ${designer.name} no tiene tareas pendientes` };
      }
      const lines = tasks.map(t => {
        const qty = t.quantity ? ` (${t.quantity})` : '';
        const dest = t.destination ? ` — ${t.destination}` : '';
        const pieces = t.pieces && t.pieces.length > 0
          ? `\n  Piezas: ${t.pieces.map(p => `${p.piece_name} [${p.status}]`).join(', ')}`
          : '';
        return `• ${t.task_type} ${t.product_type || ''}${qty}${dest} [${t.status}]${pieces}`;
      });
      return { handled: true, reply: `📋 ${designer.name}:\n${lines.join('\n')}` };
    }

    // Task assignment detection: must contain designer name + task keyword
    if (DESIGNER_NAME_RE.test(normalText) && TASK_KEYWORD_RE.test(normalText)) {
      const parsed = await parseAssignment(normalText, imageUrl);
      const task = await createTask(parsed, imageUrl);
      const qty = task.quantity ? ` ${task.quantity}` : '';
      const dest = task.destination ? ` — ${task.destination}` : '';
      const desc = task.product_type || (task.pieces && task.pieces.length > 0 ? task.pieces.join(', ') : task.task_type);
      return { handled: true, reply: `✓ Tarea para ${task.designer_name}: ${task.task_type}${qty} ${desc}${dest}` };
    }

    // Not a designer-related message from Ivan
    return null;
  }

  // ---- Designer responses (from Sarahi or Majo) ----
  const designer = await getDesignerByPhone(waId);
  if (!designer) return null; // Not a known designer — let normal AI handle it

  // "listo todas" — mark ALL pending tasks as done
  if (COMPLETION_ALL_RE.test(lowerText)) {
    const tasks = await getPendingTasks(designer.id);
    if (tasks.length === 0) {
      return { handled: true, reply: '✓ No tienes tareas pendientes' };
    }
    for (const t of tasks) {
      await completeTask(t.id);
    }
    return { handled: true, reply: `✓ ${tasks.length} tareas completadas` };
  }

  // "listo", "ya", "terminé", etc. — mark most recent pending task as done
  if (COMPLETION_RE.test(lowerText)) {
    const tasks = await getPendingTasks(designer.id);
    if (tasks.length === 0) {
      return { handled: true, reply: '✓ No tienes tareas pendientes' };
    }
    const latest = tasks[0]; // most recent (ordered by assigned_at DESC)
    await completeTask(latest.id);
    const desc = latest.product_type || latest.task_type;
    const qty = latest.quantity ? ` (${latest.quantity})` : '';
    return { handled: true, reply: `✓ Tarea completada: ${desc}${qty}` };
  }

  // A bare number — if they have a pending armado task, update quantity and mark done
  const numberMatch = lowerText.match(/^(\d+)$/);
  if (numberMatch) {
    const tasks = await getPendingTasks(designer.id);
    const armadoTask = tasks.find(t => t.task_type === 'armado');
    if (armadoTask) {
      const actualQty = parseInt(numberMatch[1]);
      // Update quantity with actual count and complete
      await query(
        'UPDATE designer_tasks SET quantity = $1, updated_at = NOW() WHERE id = $2',
        [actualQty, armadoTask.id]
      );
      await completeTask(armadoTask.id);
      const desc = armadoTask.product_type || 'armado';
      return { handled: true, reply: `✓ Tarea completada: ${desc} (${actualQty})` };
    }
    // No armado task — fall through to normal AI
    return null;
  }

  // An image — if they have a pending diseño task, deliver the first undelivered piece
  if (imageUrl) {
    const tasks = await getPendingTasks(designer.id);
    const designTask = tasks.find(t => t.task_type === 'diseño' && t.pieces && t.pieces.length > 0);
    if (designTask) {
      const undelivered = designTask.pieces.find(p => p.status !== 'delivered');
      if (undelivered) {
        const piece = await deliverDesignPiece(designTask.id, undelivered.piece_name, imageUrl);
        return { handled: true, reply: `✓ Pieza entregada: ${piece.piece_name}` };
      }
    }
    // No pending design task with undelivered pieces — fall through
    return null;
  }

  // Not a recognized designer command — let normal AI handle it
  return null;
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

      // --- Designer Task Tracking ---
      try {
        const designerResult = await handleDesignerMessage(waId, messageText, mediaUrl);
        if (designerResult?.handled) {
          // Send confirmation and skip normal AI processing
          await sendWhatsAppMessage(waId, designerResult.reply);
          // Store outbound message
          await query(
            `INSERT INTO whatsapp_messages (conversation_id, wa_message_id, direction, sender, message_type, content)
             VALUES ($1, $2, 'outbound', 'system', 'text', $3)`,
            [conversationId, `designer_${Date.now()}`, designerResult.reply]
          );
          return; // Skip AI processing
        }
      } catch (designerErr) {
        console.error('📋 Designer task error:', designerErr.message);
        // Don't block normal flow on error
      }

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

      // Store each sent image as a separate message (so admin dashboard can display them)
      for (var imgIdx = 0; imgIdx < imagesToSend.length; imgIdx++) {
        var sentImg = imagesToSend[imgIdx];
        if (sentImg.imageUrl) {
          await query(
            `INSERT INTO whatsapp_messages (conversation_id, wa_message_id, direction, sender, message_type, content, media_url, metadata)
             VALUES ($1, $2, 'outbound', 'ai', 'image', $3, $4, $5)`,
            [conversationId, 'ai_img_' + Date.now() + '_' + imgIdx, sentImg.productName || '', sentImg.imageUrl, JSON.stringify({ type: 'product_image' })]
          );
        }
      }

      // Store each sent document as a separate message
      for (var docIdx = 0; docIdx < documentsToSend.length; docIdx++) {
        var sentDoc = documentsToSend[docIdx];
        if (sentDoc.url) {
          await query(
            `INSERT INTO whatsapp_messages (conversation_id, wa_message_id, direction, sender, message_type, content, media_url, metadata)
             VALUES ($1, $2, 'outbound', 'ai', 'document', $3, $4, $5)`,
            [conversationId, 'ai_doc_' + Date.now() + '_' + docIdx, sentDoc.caption || sentDoc.filename || 'Documento', sentDoc.url, JSON.stringify({ type: 'document', filename: sentDoc.filename || 'documento.pdf' })]
          );
        }
      }

      // Update conversation intent and summary
      await query(
        'UPDATE whatsapp_conversations SET intent = $1, ai_summary = $2 WHERE id = $3',
        [intent, summary, conversationId]
      );

      // Auto-create draft order when payment receipt is detected
      // Detect payment receipt: either AI tagged it OR image came with payment-related caption/context
      let isPaymentReceipt = aiResult.paymentReceiptDetected;
      if (!isPaymentReceipt && mediaContext?.type === 'image') {
        // Server-side detection: check if message text or recent messages suggest payment
        const paymentKeywords = /comprobante|transferencia|pago|pagué|pague|deposito|depósito|anticipo|envié|envie|recibo|voucher|oxxo|spei|transf/i;
        if (paymentKeywords.test(messageText)) {
          isPaymentReceipt = true;
        } else {
          // Check last 5 messages for payment context
          const recentMsgs = await query(
            `SELECT content FROM whatsapp_messages WHERE conversation_id = $1 AND direction = 'inbound' ORDER BY created_at DESC LIMIT 5`,
            [conversationId]
          );
          for (const rm of recentMsgs.rows) {
            if (paymentKeywords.test(rm.content || '')) { isPaymentReceipt = true; break; }
          }
        }
      }
      if (isPaymentReceipt && mediaContext?.type === 'image') {
        try {
          console.log(`📦 Payment receipt detected from ${waId} — creating WhatsApp draft order...`);

          // Get client info from conversation
          const convInfo = await query(
            'SELECT client_name, wa_id, client_id FROM whatsapp_conversations WHERE id = $1',
            [conversationId]
          );
          const conv = convInfo.rows[0];

          // Get conversation history to extract order details
          const history = await query(
            `SELECT content, direction FROM whatsapp_messages
             WHERE conversation_id = $1 AND content IS NOT NULL
             ORDER BY created_at ASC`,
            [conversationId]
          );

          // Extract order context from conversation
          let productName = 'Imanes de MDF';
          let quantity = 100;
          let destination = '';
          let eventType = '';

          for (const msg of history.rows) {
            const txt = (msg.content || '').toLowerCase();
            // Extract quantity
            const qtyMatch = txt.match(/(\d{2,5})\s*(imanes|llaveros|destapadores|botones|piezas|pzas)/i);
            if (qtyMatch) quantity = parseInt(qtyMatch[1]);
            // Extract product
            if (txt.includes('llavero')) productName = 'Llaveros de MDF';
            else if (txt.includes('destapador')) productName = 'Destapador de MDF';
            else if (txt.includes('boton') || txt.includes('botón')) productName = 'Botones Metálicos';
            else if (txt.includes('3d')) productName = 'Imán 3D MDF 3mm';
            else if (txt.includes('foil')) productName = 'Imán de MDF con Foil';
            // Extract destination
            const destMatch = txt.match(/(?:envio|envío|a|de|para|desde)\s+([A-ZÁÉÍÓÚa-záéíóú\s,]{3,30}?)(?:\s*[,.]|\s*$)/i);
            if (destMatch && msg.direction === 'inbound') destination = destMatch[1].trim();
            // Extract event
            if (txt.match(/boda/i)) eventType = 'Boda';
            else if (txt.match(/bautiz/i)) eventType = 'Bautizo';
            else if (txt.match(/xv|quincea/i)) eventType = 'XV Años';
            else if (txt.match(/tienda|negocio/i)) eventType = 'Negocio';
          }

          // Get product from DB for pricing
          const productResult = await query(
            'SELECT id, name, base_price FROM products WHERE LOWER(name) LIKE $1 LIMIT 1',
            ['%' + productName.toLowerCase().split(' ')[0] + '%']
          );
          const product = productResult.rows[0];
          const unitPrice = product ? parseFloat(product.base_price) : 11.00;
          const totalPrice = unitPrice * quantity;

          // Check if a draft order already exists for this conversation
          const existingDraft = await query(
            `SELECT id FROM orders WHERE notes LIKE $1 AND status = 'whatsapp_draft'`,
            ['%wa_conv_' + conversationId + '%']
          );

          if (existingDraft.rows.length === 0) {
            // Find or create client
            let clientId = conv.client_id;
            if (!clientId) {
              const clientResult = await query(
                `INSERT INTO clients (name, phone, created_at)
                 VALUES ($1, $2, NOW())
                 ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
                 RETURNING id`,
                [conv.client_name || waId, waId]
              );
              clientId = clientResult.rows[0].id;
              // Link client to conversation
              await query('UPDATE whatsapp_conversations SET client_id = $1 WHERE id = $2', [clientId, conversationId]);
            }

            // Create draft order
            const orderNumber = 'WA-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

            const orderResult = await query(
              `INSERT INTO orders (order_number, client_id, status, approval_status, total_price, total_production_cost,
               notes, order_date, event_type, payment_proof_url)
               VALUES ($1, $2, 'whatsapp_draft', 'pending_review', $3, 0, $4, NOW(), $5, $6)
               RETURNING id`,
              [
                orderNumber,
                clientId,
                totalPrice,
                'Pedido creado desde WhatsApp. wa_conv_' + conversationId + '. Destino: ' + (destination || 'No especificado') + '. Revisar detalles.',
                eventType || null,
                mediaContext.mediaUrl || null
              ]
            );

            // Create order item
            if (product) {
              await query(
                `INSERT INTO order_items (order_id, product_id, quantity, unit_price, production_cost_per_unit)
                 VALUES ($1, $2, $3, $4, 0)`,
                [orderResult.rows[0].id, product.id, quantity, unitPrice]
              );
            }

            console.log(`📦 WhatsApp draft order created: ${orderNumber} — ${quantity}x ${productName} = $${totalPrice} for ${conv.client_name || waId}`);
          } else {
            console.log(`📦 Draft order already exists for conversation ${conversationId}, skipping`);
          }
        } catch (draftErr) {
          console.error('📦 WhatsApp draft order error:', draftErr.message);
          // Don't fail the whole webhook — draft creation is best-effort
        }
      }
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
// 3b. GET /conversations/search — Universal search (MUST be before :id routes)
// ---------------------------------------------------------------------------
router.get('/conversations/search', authMiddleware, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.json({ success: true, data: [] });
    }

    const searchPattern = '%' + q + '%';
    const result = await query(`
      SELECT DISTINCT wc.id, wc.wa_id, wc.client_name, wc.last_message_at, wc.unread_count,
        wc.is_pinned, wc.is_archived, wc.intent, wc.ai_enabled,
        (SELECT content FROM whatsapp_messages WHERE conversation_id = wc.id ORDER BY created_at DESC LIMIT 1) as last_message,
        COALESCE(
          (SELECT json_agg(json_build_object('id', wl.id, 'name', wl.name, 'color', wl.color))
           FROM whatsapp_conversation_labels wcl
           JOIN whatsapp_labels wl ON wl.id = wcl.label_id
           WHERE wcl.conversation_id = wc.id),
          '[]'::json
        ) as labels,
        (SELECT content FROM whatsapp_messages
         WHERE conversation_id = wc.id AND content ILIKE $1
         ORDER BY created_at DESC LIMIT 1) as matching_message
      FROM whatsapp_conversations wc
      LEFT JOIN whatsapp_messages wm ON wm.conversation_id = wc.id
      LEFT JOIN whatsapp_conversation_labels wcl2 ON wcl2.conversation_id = wc.id
      LEFT JOIN whatsapp_labels wl2 ON wl2.id = wcl2.label_id
      WHERE
        wc.client_name ILIKE $1
        OR wc.wa_id ILIKE $1
        OR wm.content ILIKE $1
        OR wl2.name ILIKE $1
      ORDER BY wc.last_message_at DESC NULLS LAST
      LIMIT 30
    `, [searchPattern]);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ success: false, error: 'Search failed' });
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

// ---------------------------------------------------------------------------
// Auto-migration: add sales_learned_at and sales_data columns
// ---------------------------------------------------------------------------
let salesColumnsMigrated = false;
async function ensureSalesColumns() {
  if (salesColumnsMigrated) return;
  try {
    await query(`
      ALTER TABLE whatsapp_conversations
      ADD COLUMN IF NOT EXISTS sales_learned_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS sales_data JSONB
    `);
    salesColumnsMigrated = true;
  } catch (err) {
    if (err.message?.includes('already exists')) {
      salesColumnsMigrated = true;
    } else {
      console.error('📊 Sales columns migration warning:', err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// 20. GET /sales-analytics — Comprehensive WhatsApp sales intelligence (auth)
// ---------------------------------------------------------------------------
router.get('/sales-analytics', authMiddleware, async (req, res) => {
  try {
    await ensureSalesColumns();

    // Safe query wrapper — returns empty result on failure
    async function safeQuery(sql, params = []) {
      try { return await query(sql, params); }
      catch (e) { console.error('📊 Query failed:', e.message); return { rows: [] }; }
    }

    // 1. Overview
    const overview = await safeQuery(`
      SELECT
        COUNT(DISTINCT wc.id) AS total_conversations,
        COALESCE((SELECT COUNT(*) FROM whatsapp_messages), 0) AS total_messages,
        COUNT(DISTINCT wc.client_id) FILTER (WHERE wc.client_id IS NOT NULL) AS total_clients,
        COUNT(DISTINCT wc.id) FILTER (WHERE EXISTS (
          SELECT 1 FROM orders o WHERE o.client_id = wc.client_id
        )) AS conversations_with_orders,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(
            COUNT(DISTINCT wc.id) FILTER (WHERE EXISTS (
              SELECT 1 FROM orders o WHERE o.client_id = wc.client_id
            ))::numeric / COUNT(DISTINCT wc.id)::numeric * 100, 2
          ) ELSE 0
        END AS close_rate
      FROM whatsapp_conversations wc
    `);

    // 2. Message stats — totals and avg length by sender
    const messageStatsBySender = await safeQuery(`
      SELECT
        sender,
        COUNT(*) AS total,
        ROUND(AVG(LENGTH(COALESCE(content, '')))::numeric, 1) AS avg_length
      FROM whatsapp_messages
      GROUP BY sender
      ORDER BY total DESC
    `);

    const messageStatsByDirection = await safeQuery(`
      SELECT direction, COUNT(*) AS total
      FROM whatsapp_messages
      GROUP BY direction
    `);

    // 3. Avg message length by sender AND by outcome
    const avgMessageLength = await safeQuery(`
      SELECT
        wm.sender,
        CASE WHEN EXISTS (SELECT 1 FROM orders o WHERE o.client_id = wc.client_id) THEN 'has_order' ELSE 'no_order' END AS outcome,
        ROUND(AVG(LENGTH(COALESCE(wm.content, '')))::numeric, 1) AS avg_length,
        COUNT(*) AS message_count
      FROM whatsapp_messages wm
      JOIN whatsapp_conversations wc ON wc.id = wm.conversation_id
      GROUP BY wm.sender, outcome
      ORDER BY wm.sender, outcome
    `);

    // 4. Response time patterns — bucket AI/admin reply times
    const responseTimePatterns = await safeQuery(`
      WITH response_times AS (
        SELECT
          wm_in.conversation_id,
          EXTRACT(EPOCH FROM (reply.created_at - wm_in.created_at)) AS seconds
        FROM whatsapp_messages wm_in
        JOIN LATERAL (
          SELECT created_at
          FROM whatsapp_messages
          WHERE conversation_id = wm_in.conversation_id
            AND direction = 'outbound'
            AND created_at > wm_in.created_at
          ORDER BY created_at ASC
          LIMIT 1
        ) reply ON true
        WHERE wm_in.direction = 'inbound' AND wm_in.sender = 'client'
      ),
      bucketed AS (
        SELECT
          conversation_id,
          AVG(seconds) AS avg_seconds
        FROM response_times
        WHERE seconds > 0 AND seconds < 86400
        GROUP BY conversation_id
      )
      SELECT
        CASE
          WHEN avg_seconds < 10 THEN '<10s'
          WHEN avg_seconds < 30 THEN '10-30s'
          WHEN avg_seconds < 60 THEN '30-60s'
          WHEN avg_seconds < 300 THEN '1-5min'
          ELSE '5min+'
        END AS bucket,
        COUNT(*) AS conversation_count
      FROM bucketed
      GROUP BY bucket
      ORDER BY MIN(avg_seconds)
    `);

    // 5. Hourly activity — Mexico City timezone, split by direction
    const hourlyActivity = await safeQuery(`
      SELECT
        EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Mexico_City')::int AS hour,
        COUNT(*) FILTER (WHERE direction = 'inbound') AS inbound,
        COUNT(*) FILTER (WHERE direction = 'outbound') AS outbound,
        COUNT(*) AS total
      FROM whatsapp_messages
      GROUP BY hour
      ORDER BY hour
    `);

    // 6. Daily activity — day of week, split by direction
    const dailyActivity = await safeQuery(`
      SELECT
        EXTRACT(DOW FROM created_at AT TIME ZONE 'America/Mexico_City')::int AS day_of_week,
        COUNT(*) FILTER (WHERE direction = 'inbound') AS inbound,
        COUNT(*) FILTER (WHERE direction = 'outbound') AS outbound,
        COUNT(*) AS total
      FROM whatsapp_messages
      GROUP BY day_of_week
      ORDER BY day_of_week
    `);

    // 7. Conversation depth — message count distribution by outcome
    const conversationDepth = await safeQuery(`
      SELECT
        CASE
          WHEN msg_count BETWEEN 1 AND 5 THEN '1-5'
          WHEN msg_count BETWEEN 6 AND 10 THEN '6-10'
          WHEN msg_count BETWEEN 11 AND 20 THEN '11-20'
          WHEN msg_count BETWEEN 21 AND 50 THEN '21-50'
          ELSE '50+'
        END AS depth_bucket,
        CASE WHEN has_order THEN 'has_order' ELSE 'no_order' END AS outcome,
        COUNT(*) AS conversation_count
      FROM (
        SELECT
          wc.id,
          (SELECT COUNT(*) FROM whatsapp_messages wm WHERE wm.conversation_id = wc.id) AS msg_count,
          EXISTS (SELECT 1 FROM orders o WHERE o.client_id = wc.client_id) AS has_order
        FROM whatsapp_conversations wc
      ) sub
      GROUP BY depth_bucket, outcome
      ORDER BY MIN(msg_count), outcome
    `);

    // 8. Question frequency — messages containing '?' by sender
    const questionFrequency = await safeQuery(`
      SELECT
        sender,
        COUNT(*) FILTER (WHERE content LIKE '%?%') AS questions,
        COUNT(*) AS total,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(COUNT(*) FILTER (WHERE content LIKE '%?%')::numeric / COUNT(*)::numeric * 100, 2)
          ELSE 0
        END AS question_ratio_pct
      FROM whatsapp_messages
      WHERE content IS NOT NULL
      GROUP BY sender
      ORDER BY sender
    `);

    // 9. Top words — most frequent words (>3 chars, excluding Spanish stopwords)
    const STOPWORDS_SQL = `'que','para','con','los','las','una','del','por','como','este','esta','pero','más','todo','tiene','están','hay','ser','son','https','sobre','puede','cuando','donde','otros','favor','haber','hacer','entre','desde','hasta','también','todos','estos','estas','mucho','muchas','esto','esos','esas','solo','cada','algo','otra','otro','usted','ustedes','bien','aquí','allí','después','antes','cual','cuál','ahora','muy','menos','nuestro','nuestra'`;

    const topWordsAi = await safeQuery(`
      SELECT LOWER(word) AS word, COUNT(*) AS count
      FROM whatsapp_messages wm,
        LATERAL unnest(string_to_array(
          regexp_replace(LOWER(COALESCE(wm.content, '')), '[^a-záéíóúñü\\s]', '', 'g'), ' '
        )) AS word
      WHERE wm.sender = 'ai'
        AND LENGTH(word) > 3
        AND LOWER(word) NOT IN (${STOPWORDS_SQL})
      GROUP BY LOWER(word)
      ORDER BY count DESC
      LIMIT 30
    `);

    const topWordsClient = await safeQuery(`
      SELECT LOWER(word) AS word, COUNT(*) AS count
      FROM whatsapp_messages wm,
        LATERAL unnest(string_to_array(
          regexp_replace(LOWER(COALESCE(wm.content, '')), '[^a-záéíóúñü\\s]', '', 'g'), ' '
        )) AS word
      WHERE wm.sender = 'client'
        AND LENGTH(word) > 3
        AND LOWER(word) NOT IN (${STOPWORDS_SQL})
      GROUP BY LOWER(word)
      ORDER BY count DESC
      LIMIT 30
    `);

    // 10. Message type breakdown
    const messageTypes = await safeQuery(`
      SELECT
        COALESCE(message_type, 'unknown') AS message_type,
        COUNT(*) AS count
      FROM whatsapp_messages
      GROUP BY message_type
      ORDER BY count DESC
    `);

    // 11. Conversation outcomes — detailed stats by outcome
    const conversationOutcomes = await safeQuery(`
      SELECT
        CASE WHEN has_order THEN 'has_order' ELSE 'no_order' END AS outcome,
        COUNT(*) AS conversations,
        ROUND(COALESCE(AVG(msg_count), 0)::numeric, 1) AS avg_messages,
        ROUND(COALESCE(AVG(duration_hours), 0)::numeric, 2) AS avg_duration_hours,
        ROUND(COALESCE(AVG(client_avg_len), 0)::numeric, 1) AS avg_client_msg_length,
        ROUND(COALESCE(AVG(ai_avg_len), 0)::numeric, 1) AS avg_ai_msg_length
      FROM (
        SELECT
          wc.id,
          EXISTS (SELECT 1 FROM orders o WHERE o.client_id = wc.client_id) AS has_order,
          (SELECT COUNT(*) FROM whatsapp_messages wm WHERE wm.conversation_id = wc.id) AS msg_count,
          EXTRACT(EPOCH FROM (wc.last_message_at - wc.created_at)) / 3600.0 AS duration_hours,
          (SELECT AVG(LENGTH(COALESCE(content, ''))) FROM whatsapp_messages wm WHERE wm.conversation_id = wc.id AND wm.sender = 'client') AS client_avg_len,
          (SELECT AVG(LENGTH(COALESCE(content, ''))) FROM whatsapp_messages wm WHERE wm.conversation_id = wc.id AND wm.sender = 'ai') AS ai_avg_len
        FROM whatsapp_conversations wc
      ) sub
      GROUP BY outcome
    `);

    // 12. Client response patterns — how fast clients reply after AI, by outcome
    const clientResponsePatterns = await safeQuery(`
      SELECT
        CASE WHEN EXISTS (SELECT 1 FROM orders o WHERE o.client_id = wc.client_id) THEN 'has_order' ELSE 'no_order' END AS outcome,
        ROUND(AVG(seconds)::numeric, 1) AS avg_client_response_seconds,
        COUNT(*) AS sample_size
      FROM (
        SELECT
          wm_ai.conversation_id,
          EXTRACT(EPOCH FROM (next_client.created_at - wm_ai.created_at)) AS seconds
        FROM whatsapp_messages wm_ai
        JOIN LATERAL (
          SELECT created_at
          FROM whatsapp_messages
          WHERE conversation_id = wm_ai.conversation_id
            AND direction = 'inbound'
            AND sender = 'client'
            AND created_at > wm_ai.created_at
          ORDER BY created_at ASC
          LIMIT 1
        ) next_client ON true
        WHERE wm_ai.direction = 'outbound'
          AND wm_ai.sender = 'ai'
      ) sub
      JOIN whatsapp_conversations wc ON wc.id = sub.conversation_id
      WHERE seconds > 0 AND seconds < 86400
      GROUP BY outcome
    `);

    // 13. First message analysis — first AI response characteristics by outcome
    const firstMessageAnalysis = await safeQuery(`
      SELECT
        CASE WHEN EXISTS (SELECT 1 FROM orders o WHERE o.client_id = wc.client_id) THEN 'has_order' ELSE 'no_order' END AS outcome,
        ROUND(AVG(LENGTH(COALESCE(first_ai.content, '')))::numeric, 1) AS avg_first_ai_length,
        ROUND(AVG(EXTRACT(EPOCH FROM (first_ai.created_at - wc.created_at)))::numeric, 1) AS avg_seconds_to_first_response,
        COUNT(*) AS conversations
      FROM whatsapp_conversations wc
      JOIN LATERAL (
        SELECT content, created_at
        FROM whatsapp_messages
        WHERE conversation_id = wc.id
          AND sender = 'ai'
        ORDER BY created_at ASC
        LIMIT 1
      ) first_ai ON true
      GROUP BY outcome
    `);

    // 14. Emoji usage — messages with emojis by sender, and close rates
    const emojiUsage = await safeQuery(`
      WITH emoji_flags AS (
        SELECT
          wm.conversation_id,
          wm.sender,
          CASE WHEN wm.content ~ '[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F900-\U0001F9FF\u2600-\u26FF\u2700-\u27BF\U0001FA00-\U0001FA6F\U0001FA70-\U0001FAFF]' THEN true ELSE false END AS has_emoji
        FROM whatsapp_messages wm
        WHERE wm.content IS NOT NULL
      )
      SELECT
        sender,
        COUNT(*) FILTER (WHERE has_emoji) AS messages_with_emoji,
        COUNT(*) AS total_messages,
        ROUND(COUNT(*) FILTER (WHERE has_emoji)::numeric / GREATEST(COUNT(*), 1)::numeric * 100, 2) AS emoji_pct
      FROM emoji_flags
      GROUP BY sender
      ORDER BY sender
    `);

    const emojiCloseRate = await safeQuery(`
      WITH conv_emoji AS (
        SELECT
          wc.id,
          EXISTS (SELECT 1 FROM orders o WHERE o.client_id = wc.client_id) AS has_order,
          EXISTS (
            SELECT 1 FROM whatsapp_messages wm
            WHERE wm.conversation_id = wc.id
              AND wm.content ~ '[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F900-\U0001F9FF\u2600-\u26FF\u2700-\u27BF\U0001FA00-\U0001FA6F\U0001FA70-\U0001FAFF]'
          ) AS has_emoji_messages
        FROM whatsapp_conversations wc
      )
      SELECT
        CASE WHEN has_emoji_messages THEN 'with_emoji' ELSE 'without_emoji' END AS category,
        COUNT(*) AS conversations,
        COUNT(*) FILTER (WHERE has_order) AS with_orders,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(COUNT(*) FILTER (WHERE has_order)::numeric / COUNT(*)::numeric * 100, 2)
          ELSE 0
        END AS close_rate_pct
      FROM conv_emoji
      GROUP BY category
    `);

    // 15. Links sent — messages with URLs, and close rates
    const linksSent = await safeQuery(`
      SELECT
        sender,
        COUNT(*) FILTER (WHERE content ~ 'https?://') AS messages_with_links,
        COUNT(*) AS total_messages
      FROM whatsapp_messages
      WHERE content IS NOT NULL
      GROUP BY sender
      ORDER BY sender
    `);

    const linksCloseRate = await safeQuery(`
      WITH conv_links AS (
        SELECT
          wc.id,
          EXISTS (SELECT 1 FROM orders o WHERE o.client_id = wc.client_id) AS has_order,
          EXISTS (
            SELECT 1 FROM whatsapp_messages wm
            WHERE wm.conversation_id = wc.id AND wm.content ~ 'https?://'
          ) AS has_links
        FROM whatsapp_conversations wc
      )
      SELECT
        CASE WHEN has_links THEN 'with_links' ELSE 'without_links' END AS category,
        COUNT(*) AS conversations,
        COUNT(*) FILTER (WHERE has_order) AS with_orders,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(COUNT(*) FILTER (WHERE has_order)::numeric / COUNT(*)::numeric * 100, 2)
          ELSE 0
        END AS close_rate_pct
      FROM conv_links
      GROUP BY category
    `);

    // 16. Peak engagement — close rate by hour of day
    const peakEngagement = await safeQuery(`
      WITH conv_hours AS (
        SELECT
          wc.id,
          EXTRACT(HOUR FROM wc.created_at AT TIME ZONE 'America/Mexico_City')::int AS hour,
          EXISTS (SELECT 1 FROM orders o WHERE o.client_id = wc.client_id) AS has_order
        FROM whatsapp_conversations wc
      )
      SELECT
        hour,
        COUNT(*) AS conversations,
        COUNT(*) FILTER (WHERE has_order) AS with_orders,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(COUNT(*) FILTER (WHERE has_order)::numeric / COUNT(*)::numeric * 100, 2)
          ELSE 0
        END AS close_rate_pct
      FROM conv_hours
      GROUP BY hour
      ORDER BY hour
    `);

    // 17. Conversation velocity — avg messages per hour, by outcome
    const conversationVelocity = await safeQuery(`
      SELECT
        CASE WHEN has_order THEN 'has_order' ELSE 'no_order' END AS outcome,
        ROUND(AVG(CASE WHEN duration_hours > 0 THEN msg_count / duration_hours ELSE msg_count END)::numeric, 2) AS avg_messages_per_hour,
        COUNT(*) AS conversations
      FROM (
        SELECT
          wc.id,
          (SELECT COUNT(*) FROM whatsapp_messages wm WHERE wm.conversation_id = wc.id) AS msg_count,
          EXISTS (SELECT 1 FROM orders o WHERE o.client_id = wc.client_id) AS has_order,
          GREATEST(EXTRACT(EPOCH FROM (wc.last_message_at - wc.created_at)) / 3600.0, 0.01) AS duration_hours
        FROM whatsapp_conversations wc
      ) sub
      GROUP BY outcome
    `);

    res.json({
      success: true,
      data: {
        overview: {
          totalConversations: parseInt(overview.rows[0]?.total_conversations || 0),
          totalMessages: parseInt(overview.rows[0]?.total_messages || 0),
          totalClients: parseInt(overview.rows[0]?.total_clients || 0),
          conversationsWithOrders: parseInt(overview.rows[0]?.conversations_with_orders || 0),
          closeRate: parseFloat(overview.rows[0]?.close_rate || 0)
        },
        messageStats: {
          bySender: messageStatsBySender.rows,
          byDirection: messageStatsByDirection.rows,
          avgLengthBySender: avgMessageLength.rows
        },
        responseTimePatterns: {
          buckets: responseTimePatterns.rows
        },
        hourlyActivity: hourlyActivity.rows,
        dailyActivity: dailyActivity.rows,
        conversationDepth: {
          distribution: conversationDepth.rows
        },
        questionFrequency: {
          bySender: questionFrequency.rows
        },
        topWords: {
          aiWords: topWordsAi.rows,
          clientWords: topWordsClient.rows
        },
        messageTypes: messageTypes.rows,
        conversationOutcomes: conversationOutcomes.rows,
        clientResponsePatterns: clientResponsePatterns.rows,
        firstMessageAnalysis: firstMessageAnalysis.rows,
        emojiUsage: {
          bySender: emojiUsage.rows,
          closeRates: emojiCloseRate.rows
        },
        linksSent: {
          bySender: linksSent.rows,
          closeRates: linksCloseRate.rows
        },
        peakEngagement: peakEngagement.rows,
        conversationVelocity: conversationVelocity.rows
      }
    });
  } catch (err) {
    console.error('📊 WhatsApp sales analytics error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate sales analytics' });
  }
});

// ---------------------------------------------------------------------------
// 21. POST /sales-analytics/learn — Analyze recent conversations for learning
// ---------------------------------------------------------------------------
router.post('/sales-analytics/learn', authMiddleware, async (req, res) => {
  try {
    await ensureSalesColumns();

    // Get last 50 conversations that haven't been analyzed yet
    const unanalyzed = await query(`
      SELECT wc.id, wc.wa_id, wc.client_name, wc.client_id, wc.intent,
             wc.created_at, wc.last_message_at
      FROM whatsapp_conversations wc
      WHERE wc.sales_learned_at IS NULL
        AND wc.last_message_at < NOW() - INTERVAL '24 hours'
      ORDER BY wc.last_message_at DESC
      LIMIT 50
    `);

    if (unanalyzed.rows.length === 0) {
      return res.json({ success: true, data: { analyzed: 0, message: 'No new conversations to analyze' } });
    }

    const results = [];

    for (const conv of unanalyzed.rows) {
      // Determine outcome
      let outcome = 'no_client';
      if (conv.client_id) {
        const orderCheck = await query(
          'SELECT id, total_price FROM orders WHERE client_id = $1 LIMIT 1',
          [conv.client_id]
        );
        outcome = orderCheck.rows.length > 0 ? 'order' : 'lost';
      }

      // Get message stats
      const msgStats = await query(`
        SELECT
          COUNT(*) AS total_messages,
          COALESCE(AVG(LENGTH(content)), 0) AS avg_length,
          COUNT(CASE WHEN sender = 'ai' THEN 1 END) AS ai_messages,
          COUNT(CASE WHEN sender = 'client' THEN 1 END) AS client_messages,
          COUNT(CASE WHEN sender = 'admin' THEN 1 END) AS admin_messages
        FROM whatsapp_messages
        WHERE conversation_id = $1
      `, [conv.id]);

      // Get response times for this conversation
      const convResponseTimes = await query(`
        SELECT
          COALESCE(AVG(response_seconds), 0) AS avg_response_seconds
        FROM (
          SELECT
            EXTRACT(EPOCH FROM (reply.created_at - inbound.created_at)) AS response_seconds
          FROM whatsapp_messages inbound
          JOIN LATERAL (
            SELECT created_at
            FROM whatsapp_messages
            WHERE conversation_id = inbound.conversation_id
              AND direction = 'outbound'
              AND sender = 'ai'
              AND created_at > inbound.created_at
            ORDER BY created_at ASC
            LIMIT 1
          ) reply ON true
          WHERE inbound.direction = 'inbound'
            AND inbound.conversation_id = $1
        ) sub
        WHERE response_seconds > 0 AND response_seconds < 3600
      `, [conv.id]);

      // Extract key AI phrases that preceded client engagement (fast replies)
      const keyPhrases = await query(`
        SELECT LEFT(ai_msg.content, 150) AS phrase
        FROM whatsapp_messages ai_msg
        JOIN LATERAL (
          SELECT created_at
          FROM whatsapp_messages
          WHERE conversation_id = ai_msg.conversation_id
            AND direction = 'inbound'
            AND created_at > ai_msg.created_at
          ORDER BY created_at ASC
          LIMIT 1
        ) next_client ON true
        WHERE ai_msg.conversation_id = $1
          AND ai_msg.sender = 'ai'
          AND ai_msg.message_type = 'text'
          AND LENGTH(ai_msg.content) > 10
        ORDER BY EXTRACT(EPOCH FROM (next_client.created_at - ai_msg.created_at)) ASC
        LIMIT 5
      `, [conv.id]);

      const salesData = {
        outcome,
        totalMessages: parseInt(msgStats.rows[0].total_messages),
        avgMessageLength: Math.round(parseFloat(msgStats.rows[0].avg_length)),
        aiMessages: parseInt(msgStats.rows[0].ai_messages),
        clientMessages: parseInt(msgStats.rows[0].client_messages),
        adminMessages: parseInt(msgStats.rows[0].admin_messages),
        avgResponseSeconds: Math.round(parseFloat(convResponseTimes.rows[0].avg_response_seconds)),
        durationHours: conv.last_message_at && conv.created_at
          ? Math.round((new Date(conv.last_message_at) - new Date(conv.created_at)) / 3600000 * 10) / 10
          : 0,
        keyPhrases: keyPhrases.rows.map(r => r.phrase),
        intent: conv.intent,
        analyzedAt: new Date().toISOString()
      };

      // Store analysis
      await query(
        `UPDATE whatsapp_conversations
         SET sales_data = $1, sales_learned_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(salesData), conv.id]
      );

      results.push({
        conversationId: conv.id,
        clientName: conv.client_name,
        outcome,
        totalMessages: salesData.totalMessages
      });
    }

    // Summary stats
    const orderCount = results.filter(r => r.outcome === 'order').length;
    const lostCount = results.filter(r => r.outcome === 'lost').length;
    const noClientCount = results.filter(r => r.outcome === 'no_client').length;

    res.json({
      success: true,
      data: {
        analyzed: results.length,
        outcomes: { order: orderCount, lost: lostCount, no_client: noClientCount },
        conversations: results
      }
    });
  } catch (err) {
    console.error('📊 WhatsApp sales learning error:', err);
    res.status(500).json({ success: false, error: 'Failed to run sales learning' });
  }
});

export default router;
