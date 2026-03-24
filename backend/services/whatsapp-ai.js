/**
 * WhatsApp AI Service
 * Processes incoming WhatsApp messages using Claude API with AXKAN brand voice.
 * Handles product inquiries, order collection, and order creation.
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { query } from '../shared/database.js';
import { createOrderBothSystems } from '../agents/notion-agent/sync.js';
import { parseQuoteRequest, generateQuotePDF } from './quote-generator.js';
import { PRICING_TIERS } from '../shared/pricing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(__dirname, '..', 'chatbot_whatsapp');

// Global AI model setting — changeable at runtime via API
let currentModel = process.env.WHATSAPP_AI_MODEL || 'gpt-4.1-mini';
let globalAiEnabled = true;

export function getGlobalAiEnabled() { return globalAiEnabled; }
export async function setGlobalAiEnabled(enabled) {
  globalAiEnabled = !!enabled;
  console.log(`🤖 Global AI ${globalAiEnabled ? 'ENABLED' : 'DISABLED'}`);
  // Persist to DB so it survives server restarts
  try {
    const { query: dbQuery } = await import('../shared/database.js');
    await dbQuery(`
      INSERT INTO app_settings (key, value) VALUES ('global_ai_enabled', $1)
      ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
    `, [String(globalAiEnabled)]);
  } catch (e) {
    console.error('Failed to persist global AI state:', e.message);
  }
  return globalAiEnabled;
}

// Load persisted global AI state on startup
(async function loadGlobalAiState() {
  try {
    const { query: dbQuery } = await import('../shared/database.js');
    // Create settings table if not exists
    await dbQuery(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const result = await dbQuery("SELECT value FROM app_settings WHERE key = 'global_ai_enabled'");
    if (result.rows.length > 0) {
      globalAiEnabled = result.rows[0].value === 'true';
      console.log(`🤖 Global AI state loaded from DB: ${globalAiEnabled ? 'ENABLED' : 'DISABLED'}`);
    }
  } catch (e) {
    console.error('Failed to load global AI state:', e.message);
  }
})();

export function getAiModel() { return currentModel; }
export function setAiModel(model) {
  const allowed = [
    'claude-haiku-4-5-20251001',
    'claude-sonnet-4-5-20250929',
    'claude-sonnet-4-6-20250514',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
    'gpt-4o-mini'
  ];
  if (!allowed.includes(model)) return false;
  currentModel = model;
  console.log(`🤖 WhatsApp AI model changed to: ${model}`);
  return true;
}

/**
 * Load a chatbot config file. Returns its contents as a string.
 * Files are read fresh each time so edits take effect without restart.
 */
function loadConfig(filename) {
  try {
    return readFileSync(join(CONFIG_DIR, filename), 'utf-8').trim();
  } catch (err) {
    console.error(`🟢 WhatsApp AI: Config file ${filename} not found:`, err.message);
    return '';
  }
}

// Initialize Anthropic client lazily
let anthropic = null;
let openaiClient = null;

function isOpenAiModel(model) {
  return model && (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3'));
}

function getClient() {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

function getOpenAiClient() {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

/**
 * Build the system prompt with the product catalog injected.
 * @param {Array} products - Array of {name, base_price, description, category, production_cost}
 * @returns {string} The system prompt for Claude
 */
export function getSystemPrompt(products) {
  const catalogLines = products.map(p => {
    const nameLower = p.name.toLowerCase();
    // Look up tiered pricing from the official source of truth
    // Prefer exact match, then partial match
    let priceDisplay;
    const matchedKey = Object.keys(PRICING_TIERS).find(key => nameLower === key)
      || Object.keys(PRICING_TIERS).find(key => nameLower.includes(key) || key.includes(nameLower));
    if (matchedKey) {
      const tiers = PRICING_TIERS[matchedKey];
      if (tiers.length > 1) {
        priceDisplay = tiers.map(t =>
          `${t.min}${t.max === Infinity ? '+' : '-' + t.max}: $${t.price.toFixed(2)}`
        ).join(' / ');
      } else {
        priceDisplay = `$${tiers[0].price.toFixed(2)}`;
      }
    } else {
      priceDisplay = `$${parseFloat(p.base_price).toFixed(2)}`;
    }
    const hasImage = p.image_url ? ' [FOTO DISPONIBLE]' : '';
    return `- ${p.name}: ${priceDisplay} MXN${p.description ? ` — ${p.description}` : ''}${p.category ? ` (${p.category})` : ''}${hasImage}`;
  }).join('\n');

  // Load all config sections from chatbot-config/ directory
  const identity = loadConfig('system-prompt.md');
  const brandVoice = loadConfig('brand-voice.md');
  const rules = loadConfig('rules.md');
  const salesProcess = loadConfig('sales-process.md');
  const orderCreation = loadConfig('order-creation.md');
  const orderStatus = loadConfig('order-status.md');
  const mediaHandling = loadConfig('media-handling.md');
  const responseExamples = loadConfig('response-examples.md');

  return `${identity}

${brandVoice}

CATÁLOGO DE PRODUCTOS (precios por pieza):
${catalogLines}

${rules}

${salesProcess}

${orderCreation}

${orderStatus}

${mediaHandling}

${responseExamples}

## REGLA ABSOLUTA — BREVEDAD (ESTO ANULA TODO LO ANTERIOR SI HAY CONFLICTO):
Tu respuesta COMPLETA debe tener MÁXIMO 2 líneas de texto (no más de 120 caracteres por línea).
Si tu respuesta tiene más de 3 líneas, ESTÁS FALLANDO. Reescríbela más corta.
Ivan escribe en promedio 59 caracteres por mensaje. Los clientes escriben 31. Tú NUNCA debes pasar de 120.
NO uses listas. NO uses viñetas. NO uses emojis como bullets. Escribe como WhatsApp real.
Ejemplo de respuesta CORRECTA: "Son $8,800 con todo incluido, diseño y envío. Te paso la liga para confirmar 👇"
Ejemplo de respuesta INCORRECTA: "¡Hola! Claro que sí, con gusto te ayudo. Te comento que nuestros imanes tienen un precio de $8 por pieza en pedidos de 1000 o más. El precio incluye diseño personalizado y envío nacional. Te comparto la liga para que puedas hacer tu pedido..."`;
}

/**
 * Build conversation history from the database for Claude API.
 * @param {number} conversationId - The conversation ID in the database
 * @returns {Array} Array of {role, content} messages for Claude
 */
export async function buildConversationHistory(conversationId) {
  const result = await query(
    `SELECT direction, sender, content, message_type, media_url, metadata
     FROM whatsapp_messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC
     LIMIT 20`,
    [conversationId]
  );

  return result.rows
    .filter(row => row.content && row.content.trim().length > 0)
    .map(row => {
      let content = row.content;
      // Add media context for image messages in history
      if (row.message_type === 'image' && row.direction === 'inbound') {
        content = `[Imagen recibida] ${content}`;
      } else if (row.message_type === 'audio' && row.direction === 'inbound') {
        const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : (row.metadata || {});
        if (meta.transcription) {
          content = meta.transcription;
        }
      }
      return {
        role: row.direction === 'inbound' ? 'user' : 'assistant',
        content: content
      };
    });
}

/**
 * Load the active product catalog from the database.
 * @returns {Array} Products with name, base_price, description, category, production_cost
 */
async function loadProductCatalog() {
  const result = await query(
    `SELECT name, base_price, description, category, production_cost, image_url
     FROM products
     WHERE is_active = true
     ORDER BY category, name`
  );
  return result.rows;
}

/**
 * Look up a product's production_cost by matching the product name.
 * Uses case-insensitive partial matching.
 * @param {string} productName - The product name from the order
 * @param {Array} products - The loaded product catalog
 * @returns {number} The production cost, or 0 if not found
 */
function lookupProductionCost(productName, products) {
  const nameLower = productName.toLowerCase();
  const match = products.find(p => p.name.toLowerCase() === nameLower);
  if (match) return parseFloat(match.production_cost);

  const partialMatch = products.find(p =>
    nameLower.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(nameLower)
  );
  if (partialMatch) return parseFloat(partialMatch.production_cost);

  return 0;
}

/**
 * Parse Claude's response to extract intent and any CREATE_ORDER block.
 * @param {string} responseText - The raw text from Claude
 * @returns {Object} { cleanReply, intent, orderJson }
 */
async function parseAIResponse(responseText) {
  let intent = 'general';
  let orderJson = null;
  let cleanReply = responseText;

  // Extract CREATE_ORDER block if present
  const orderMatch = responseText.match(/\[CREATE_ORDER\](.*?)\[\/CREATE_ORDER\]/s);
  if (orderMatch) {
    try {
      orderJson = JSON.parse(orderMatch[1].trim());
      intent = 'order_creation';
    } catch (err) {
      console.error('🟢 WhatsApp AI: Failed to parse CREATE_ORDER JSON:', err.message);
    }
    // Remove the order block from the reply shown to the client
    cleanReply = responseText.replace(/\[CREATE_ORDER\].*?\[\/CREATE_ORDER\]/s, '').trim();
  }

  // Detect intent from response content
  if (intent === 'general') {
    const textLower = responseText.toLowerCase();
    if (textLower.includes('déjame revisar tu pedido') || textLower.includes('revisar el estado')) {
      intent = 'status_inquiry';
    } else if (textLower.includes('bienvenido') || textLower.includes('hola')) {
      intent = 'greeting';
    } else if (textLower.includes('catálogo') || textLower.includes('tenemos') || textLower.includes('precio')) {
      intent = 'product_inquiry';
    } else if (textLower.includes('pedido queda así') || textLower.includes('resumen') || textLower.includes('total de')) {
      intent = 'order_summary';
    } else if (textLower.includes('dirección') || textLower.includes('nombre completo') || textLower.includes('cuántas personas')) {
      intent = 'collecting_info';
    }
  }

  // Extract SEND_IMAGE blocks
  const imagesToSend = [];
  const imageMatches = cleanReply.matchAll(/\[SEND_IMAGE\](.*?)\[\/SEND_IMAGE\]/g);
  for (const match of imageMatches) {
    try {
      const imageData = JSON.parse(match[1].trim());
      imagesToSend.push(imageData);
    } catch (err) {
      console.error('🟢 WhatsApp AI: Failed to parse SEND_IMAGE JSON:', err.message);
    }
  }
  cleanReply = cleanReply.replace(/\[SEND_IMAGE\].*?\[\/SEND_IMAGE\]/g, '').trim();

  // Extract SEND_LIST blocks (interactive list menus)
  const listsToSend = [];
  const listMatches = cleanReply.matchAll(/\[SEND_LIST\](.*?)\[\/SEND_LIST\]/gs);
  for (const match of listMatches) {
    try {
      listsToSend.push(JSON.parse(match[1].trim()));
    } catch (err) {
      console.error('🟢 WhatsApp AI: Failed to parse SEND_LIST JSON:', err.message);
    }
  }
  cleanReply = cleanReply.replace(/\[SEND_LIST\].*?\[\/SEND_LIST\]/gs, '').trim();

  // Extract SEND_BUTTONS blocks (quick reply buttons)
  const buttonsToSend = [];
  const buttonMatches = cleanReply.matchAll(/\[SEND_BUTTONS\](.*?)\[\/SEND_BUTTONS\]/gs);
  for (const match of buttonMatches) {
    try {
      buttonsToSend.push(JSON.parse(match[1].trim()));
    } catch (err) {
      console.error('🟢 WhatsApp AI: Failed to parse SEND_BUTTONS JSON:', err.message);
    }
  }
  cleanReply = cleanReply.replace(/\[SEND_BUTTONS\].*?\[\/SEND_BUTTONS\]/gs, '').trim();

  // Extract SEND_DOCUMENT blocks
  const documentsToSend = [];
  const docMatches = cleanReply.matchAll(/\[SEND_DOCUMENT\](.*?)\[\/SEND_DOCUMENT\]/gs);
  for (const match of docMatches) {
    try {
      documentsToSend.push(JSON.parse(match[1].trim()));
    } catch (err) {
      console.error('🟢 WhatsApp AI: Failed to parse SEND_DOCUMENT JSON:', err.message);
    }
  }
  cleanReply = cleanReply.replace(/\[SEND_DOCUMENT\].*?\[\/SEND_DOCUMENT\]/gs, '').trim();

  // Extract GENERATE_QUOTE block
  let generateQuoteData = null;
  const quoteGenMatch = cleanReply.match(/\[GENERATE_QUOTE\](.*?)\[\/GENERATE_QUOTE\]/s);
  if (quoteGenMatch) {
    try {
      generateQuoteData = JSON.parse(quoteGenMatch[1].trim());
      intent = 'quote_generation';
      console.log('🟢 WhatsApp AI: GENERATE_QUOTE parsed successfully:', JSON.stringify(generateQuoteData));
    } catch (err) {
      console.error('🟢 WhatsApp AI: Failed to parse GENERATE_QUOTE JSON:', err.message);
    }
    cleanReply = cleanReply.replace(/\[GENERATE_QUOTE\].*?\[\/GENERATE_QUOTE\]/s, '').trim();
  } else if (cleanReply.includes('[GENERATE_QUOTE]')) {
    // Truncated tag — try to salvage the JSON
    console.warn('⚠️ WhatsApp AI: GENERATE_QUOTE tag was truncated (no closing tag). Attempting recovery...');
    const truncatedMatch = cleanReply.match(/\[GENERATE_QUOTE\]\s*(\{.*)/s);
    if (truncatedMatch) {
      let jsonStr = truncatedMatch[1].trim();
      // Try to fix incomplete JSON by closing it
      if (!jsonStr.endsWith('}')) jsonStr += '"}';
      try {
        generateQuoteData = JSON.parse(jsonStr);
        intent = 'quote_generation';
        console.log('🟢 WhatsApp AI: Recovered truncated GENERATE_QUOTE:', JSON.stringify(generateQuoteData));
      } catch (e) {
        console.error('⚠️ WhatsApp AI: Could not recover truncated GENERATE_QUOTE JSON:', jsonStr);
      }
    }
    cleanReply = cleanReply.replace(/\[GENERATE_QUOTE\].*$/s, '').trim();
  }

  // Extract REACT block (emoji reaction)
  let reactionEmoji = null;
  const reactMatch = cleanReply.match(/\[REACT\](.*?)\[\/REACT\]/s);
  if (reactMatch) {
    try {
      const reactData = JSON.parse(reactMatch[1].trim());
      reactionEmoji = reactData.emoji || null;
    } catch (err) {
      console.error('🟢 WhatsApp AI: Failed to parse REACT JSON:', err.message);
    }
    cleanReply = cleanReply.replace(/\[REACT\].*?\[\/REACT\]/s, '').trim();
  }

  // Extract CHECK_SHIPPING block — check zip code against zonas extendidas list
  let shippingCheckResult = null;
  const shippingMatch = cleanReply.match(/\[CHECK_SHIPPING\](.*?)\[\/CHECK_SHIPPING\]/s);
  if (shippingMatch) {
    try {
      const shippingData = JSON.parse(shippingMatch[1].trim());
      const zip = String(shippingData.zip || shippingData.postal_code || shippingData.cp || '').trim();
      if (zip && zip.length === 5) {
        const { readFileSync } = await import('fs');
        const { join, dirname } = await import('path');
        const { fileURLToPath } = await import('url');
        const zonaData = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'zonas-extendidas.json'), 'utf-8'));
        const isExtended = zonaData.codes.includes(zip);
        shippingCheckResult = { zip, isExtended, available: true };
        console.log(`📦 Shipping check: CP ${zip} — ${isExtended ? 'ZONA EXTENDIDA' : 'zona normal'}`);
      }
    } catch (err) {
      console.error('📦 Shipping check error:', err.message);
    }
    cleanReply = cleanReply.replace(/\[CHECK_SHIPPING\].*?\[\/CHECK_SHIPPING\]/s, '').trim();
  }

  // Extract REQUEST_LOCATION block
  let locationRequest = null;
  const locationMatch = cleanReply.match(/\[REQUEST_LOCATION\](.*?)\[\/REQUEST_LOCATION\]/s);
  if (locationMatch) {
    try {
      locationRequest = JSON.parse(locationMatch[1].trim());
    } catch (err) {
      console.error('🟢 WhatsApp AI: Failed to parse REQUEST_LOCATION JSON:', err.message);
    }
    cleanReply = cleanReply.replace(/\[REQUEST_LOCATION\].*?\[\/REQUEST_LOCATION\]/s, '').trim();
  }

  // Extract SEND_CAROUSEL block
  let carouselRequest = null;
  const carouselMatch = cleanReply.match(/\[SEND_CAROUSEL\](.*?)\[\/SEND_CAROUSEL\]/s);
  if (carouselMatch) {
    try {
      carouselRequest = JSON.parse(carouselMatch[1].trim());
    } catch (err) {
      console.error('🟢 WhatsApp AI: Failed to parse SEND_CAROUSEL JSON:', err.message);
    }
    cleanReply = cleanReply.replace(/\[SEND_CAROUSEL\].*?\[\/SEND_CAROUSEL\]/s, '').trim();
  }

  // Extract SEND_FLOW block
  let flowRequest = null;
  const flowMatch = cleanReply.match(/\[SEND_FLOW\](.*?)\[\/SEND_FLOW\]/s);
  if (flowMatch) {
    try {
      flowRequest = JSON.parse(flowMatch[1].trim());
    } catch (err) {
      console.error('🟢 WhatsApp AI: Failed to parse SEND_FLOW JSON:', err.message);
    }
    cleanReply = cleanReply.replace(/\[SEND_FLOW\].*?\[\/SEND_FLOW\]/s, '').trim();
  }

  // Extract PAYMENT_RECEIPT detection
  let paymentReceiptDetected = false;
  const receiptMatch = cleanReply.match(/\[PAYMENT_RECEIPT\](.*?)\[\/PAYMENT_RECEIPT\]/s);
  if (receiptMatch) {
    try {
      const receiptData = JSON.parse(receiptMatch[1].trim());
      paymentReceiptDetected = !!receiptData.detected;
    } catch (err) {}
    cleanReply = cleanReply.replace(/\[PAYMENT_RECEIPT\].*?\[\/PAYMENT_RECEIPT\]/s, '').trim();
  }

  return { cleanReply, intent, orderJson, imagesToSend, listsToSend, buttonsToSend, documentsToSend, generateQuoteData, reactionEmoji, locationRequest, carouselRequest, flowRequest, paymentReceiptDetected, shippingCheckResult };
}

/**
 * Execute order creation from the parsed CREATE_ORDER data.
 * @param {Object} orderJson - Parsed order JSON from Claude
 * @param {string} waId - The WhatsApp phone number of the client
 * @param {Array} products - Product catalog for cost lookup
 * @returns {Object} { success, orderNumber?, error? }
 */
async function executeOrderCreation(orderJson, waId, products) {
  // Replace phone placeholder with actual WhatsApp ID
  const clientPhone = orderJson.clientPhone === 'PHONE_PLACEHOLDER' ? waId : orderJson.clientPhone;

  // Build items with production costs looked up from catalog
  const items = orderJson.items.map(item => {
    const unitCost = lookupProductionCost(item.productName, products);
    return {
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unitCost: unitCost
    };
  });

  // Calculate totals
  const totalPrice = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const productionCost = items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);

  const orderData = {
    clientName: orderJson.clientName,
    clientPhone: clientPhone,
    clientEmail: null,
    clientAddress: orderJson.clientAddress || null,
    clientCity: orderJson.clientCity || null,
    clientState: orderJson.clientState || null,
    status: 'new',
    department: 'design',
    priority: 'normal',
    items: items,
    totalPrice: totalPrice,
    productionCost: productionCost,
    subtotal: totalPrice,
    notes: [
      orderJson.eventType ? `Evento: ${orderJson.eventType}` : null,
      orderJson.deliveryDate ? `Fecha entrega: ${orderJson.deliveryDate}` : null,
      orderJson.notes || null,
      'Pedido creado via WhatsApp'
    ].filter(Boolean).join(' | '),
    eventType: orderJson.eventType || null
  };

  const result = await createOrderBothSystems(orderData);
  return {
    success: true,
    orderNumber: result.orderNumber,
    orderId: result.orderId
  };
}

/**
 * Process an incoming WhatsApp message through the AI pipeline.
 * @param {number} conversationId - The conversation ID in the database
 * @param {string} waId - The WhatsApp phone number (e.g., "5215512345678")
 * @param {string} messageText - The text message from the client
 * @returns {Object} { reply, intent, orderData?, actionTaken? }
 */
export async function processIncomingMessage(conversationId, waId, messageText, mediaContext = null) {
  try {
    // Check global AI kill switch
    if (!globalAiEnabled) {
      return { reply: null, intent: null, skipped: true, reason: 'global_ai_disabled' };
    }

    // ---- Design Portal: route client messages to design_messages ----
    // If client has active design assignments, copy message to portal (but AI still replies)
    try {
      const activeAssignments = await query(
        `SELECT da.id, da.order_id, c.name as client_name
         FROM design_assignments da
         LEFT JOIN whatsapp_conversations wc ON wc.wa_id = $1
         LEFT JOIN clients c ON wc.client_id = c.id
         WHERE da.client_phone = $1 AND da.status NOT IN ('aprobado')
         LIMIT 1`,
        [waId]
      );
      if (activeAssignments.rows.length > 0) {
        const assignment = activeAssignments.rows[0];
        const clientName = assignment.client_name || 'Cliente';
        const msgType = (mediaContext?.type === 'image') ? 'image' : 'text';
        const msgContent = (mediaContext?.type === 'image' && mediaContext.cloudinaryUrl)
          ? mediaContext.cloudinaryUrl
          : messageText;
        await query(
          `INSERT INTO design_messages (design_assignment_id, order_id, sender_type, sender_name, message_type, content)
           VALUES ($1, $2, 'client', $3, $4, $5)`,
          [assignment.id, assignment.order_id, clientName, msgType, msgContent]
        );
        console.log(`📋 Design portal: routed message from ${waId} to order ${assignment.order_id}, AI continues`);
        // Don't skip AI — let it respond normally even during active design assignments
      }
    } catch (designPortalErr) {
      console.error('Design portal routing error (non-blocking):', designPortalErr.message);
      // Continue with normal AI if routing fails
    }

    // Load product catalog from database
    const products = await loadProductCatalog();

    // Build conversation history from stored messages
    const history = await buildConversationHistory(conversationId);

    // Build the system prompt with current catalog
    let systemPrompt = getSystemPrompt(products);

    // Append dynamic sales learnings (non-blocking — degrades gracefully)
    try {
      const { buildDynamicPromptSection } = await import('./sales-learning-engine.js');
      const dynamicLearnings = await buildDynamicPromptSection();
      if (dynamicLearnings) {
        systemPrompt += dynamicLearnings;
      }
    } catch (e) {
      // Non-blocking — sales learning engine may not be available yet
    }

    // Build the new incoming message content based on media context
    let userMessageContent;

    if (mediaContext?.type === 'image' && mediaContext.imageBase64) {
      // Claude Vision: send image + text
      userMessageContent = [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaContext.imageMimeType || 'image/jpeg',
            data: mediaContext.imageBase64
          }
        },
        {
          type: 'text',
          text: messageText || 'El cliente envió esta imagen.'
        }
      ];
    } else if (mediaContext?.type === 'audio' && mediaContext.transcription) {
      userMessageContent = messageText; // Already contains transcription
    } else {
      userMessageContent = messageText;
    }

    // Add the new incoming message to the history for the API call
    const messages = [
      ...history,
      { role: 'user', content: userMessageContent }
    ];

    // Ensure messages alternate properly (Claude requires user/assistant alternation)
    const sanitizedMessages = sanitizeMessageHistory(messages);

    // Call AI API (Claude or OpenAI depending on model)
    let rawReply;

    if (isOpenAiModel(currentModel)) {
      // OpenAI API call
      const oai = getOpenAiClient();
      // Convert Claude-format messages to OpenAI format
      const oaiMessages = [
        { role: 'system', content: systemPrompt },
        ...sanitizedMessages.map(m => {
          // Handle image content (Claude uses array format, OpenAI uses different)
          if (Array.isArray(m.content)) {
            const parts = m.content.map(part => {
              if (part.type === 'text') return { type: 'text', text: part.text };
              if (part.type === 'image' && part.source?.type === 'base64') {
                return { type: 'image_url', image_url: { url: `data:${part.source.media_type};base64,${part.source.data}` } };
              }
              return { type: 'text', text: part.text || '' };
            });
            return { role: m.role, content: parts };
          }
          return { role: m.role, content: m.content };
        })
      ];

      const oaiResponse = await oai.chat.completions.create({
        model: currentModel,
        max_tokens: 300,
        messages: oaiMessages
      });
      rawReply = oaiResponse.choices[0].message.content;
    } else {
      // Claude API call
      const client = getClient();
      const response = await client.messages.create({
        model: currentModel,
        max_tokens: 300,
        system: systemPrompt,
        messages: sanitizedMessages
      });
      rawReply = response.content[0].text;
    }

    // Parse the response for intent and order blocks
    const { cleanReply, intent, orderJson, imagesToSend, listsToSend, buttonsToSend, documentsToSend, generateQuoteData, reactionEmoji, locationRequest, carouselRequest, flowRequest, paymentReceiptDetected, shippingCheckResult } = await parseAIResponse(rawReply);

    let actionTaken = null;
    let orderData = null;

    // If Claude generated an order creation block, execute it
    if (orderJson) {
      try {
        const orderResult = await executeOrderCreation(orderJson, waId, products);
        actionTaken = 'order_created';
        orderData = {
          orderNumber: orderResult.orderNumber,
          orderId: orderResult.orderId,
          clientName: orderJson.clientName,
          items: orderJson.items,
          total: orderJson.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
        };
        // Auto-set follow-up timer based on quantity ordered
        try {
          const totalPieces = orderJson.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
          let followUpDays;
          if (totalPieces >= 1000) followUpDays = 45;
          else if (totalPieces >= 600) followUpDays = 30;
          else if (totalPieces >= 300) followUpDays = 21;
          else followUpDays = 14;
          const followUpDate = new Date();
          followUpDate.setDate(followUpDate.getDate() + followUpDays);
          await query(
            'UPDATE whatsapp_conversations SET follow_up_at = $1 WHERE wa_id = $2',
            [followUpDate.toISOString(), waId]
          );
          console.log(`⏱ Follow-up set: ${followUpDays} days for ${totalPieces} pieces (${waId})`);
        } catch (fuErr) {
          console.error('⏱ Follow-up timer error:', fuErr.message);
        }
      } catch (orderError) {
        console.error('🟢 WhatsApp AI: Order creation failed:', orderError.message);
        actionTaken = 'order_failed';
        // Override the reply to inform the client about the failure
        return {
          reply: 'Hubo un problema al registrar tu pedido. Podrías intentar confirmarlo de nuevo? Disculpa la molestia.',
          intent: 'order_creation',
          orderData: null,
          actionTaken: 'order_failed'
        };
      }
    }

    // Generate quote PDF if GENERATE_QUOTE was triggered
    if (generateQuoteData) {
      try {
        const quoteText = generateQuoteData.text || '';
        const clientName = generateQuoteData.clientName || null;

        // Parse the text into structured items
        const parsedItems = parseQuoteRequest(quoteText);

        if (parsedItems.length > 0) {
          // Generate the PDF — save to public catalogs/quotes/ directory
          const quoteResult = await generateQuotePDF({
            clientName,
            items: parsedItems,
            validityDays: 3,
            outputDir: join(__dirname, '../catalogs/quotes')
          });

          // Upload PDF to Cloudinary for persistent storage
          let pdfUrl;
          try {
            const { readFileSync } = await import('fs');
            const { v2: cloudinary } = await import('cloudinary');
            const pdfPath = quoteResult.filepath || join(__dirname, '../catalogs/quotes', quoteResult.filename);
            const pdfBuffer = readFileSync(pdfPath);
            const base64 = pdfBuffer.toString('base64');
            const dataUri = `data:application/pdf;base64,${base64}`;
            const cloudResult = await cloudinary.uploader.upload(dataUri, {
              folder: 'whatsapp-quotes',
              resource_type: 'raw',
              access_mode: 'public',
              public_id: quoteResult.filename.replace('.pdf', '')
            });
            pdfUrl = cloudResult.secure_url;
            console.log(`☁️ Quote PDF uploaded to Cloudinary: ${pdfUrl}`);
          } catch (uploadErr) {
            console.error('☁️ Cloudinary upload failed, using local URL:', uploadErr.message);
            const backendUrl = process.env.BACKEND_URL
              || process.env.RENDER_EXTERNAL_URL
              || 'https://vt-souvenir-backend.onrender.com';
            pdfUrl = `${backendUrl}/catalogs/quotes/${quoteResult.filename}`;
          }

          // Convert PDF to image and send as WhatsApp image (easier to view on phone)
          let quoteImageUrl = null;
          try {
            const { readFileSync: readFS } = await import('fs');
            const { pdf } = await import('pdf-to-img');
            const pdfPathForImg = quoteResult.filepath || join(__dirname, '../catalogs/quotes', quoteResult.filename);
            const pdfDoc = await pdf(pdfPathForImg, { scale: 2 });
            // Get first page as PNG buffer
            for await (const page of pdfDoc) {
              const { v2: cloudImg } = await import('cloudinary');
              const imgBase64 = Buffer.from(page).toString('base64');
              const imgDataUri = `data:image/png;base64,${imgBase64}`;
              const imgResult = await cloudImg.uploader.upload(imgDataUri, {
                folder: 'whatsapp-quotes-img',
                public_id: quoteResult.filename.replace('.pdf', ''),
                resource_type: 'image'
              });
              quoteImageUrl = imgResult.secure_url;
              console.log(`🖼️ Quote image uploaded to Cloudinary: ${quoteImageUrl}`);
              break; // Only first page
            }
          } catch (imgErr) {
            console.error('🖼️ PDF to image conversion failed:', imgErr.message);
          }

          // Send as image (client sees it inline) + keep PDF on Cloudinary for records
          if (quoteImageUrl) {
            // Send image to WhatsApp (client sees quote as picture)
            imagesToSend.push({
              productName: `Cotización ${quoteResult.quoteNumber}`,
              imageUrl: quoteImageUrl
            });
          }
          // PDF stored on Cloudinary for records but NOT sent to client
          // Only sent if client explicitly asks for the PDF
          console.log(`📄 Quote PDF saved on Cloudinary (not sent): ${pdfUrl}`);

          actionTaken = actionTaken || 'quote_generated';
          console.log(`🟢 WhatsApp AI: Quote generated — ${quoteResult.quoteNumber}, ${quoteResult.itemCount} items, total: $${quoteResult.total}`);
        } else {
          console.warn('🟢 WhatsApp AI: GENERATE_QUOTE triggered but no valid items parsed from:', quoteText);
        }
      } catch (quoteError) {
        console.error('🟢 WhatsApp AI: Quote generation failed:', quoteError.message);
      }
    }

    // Resolve product image URLs for SEND_IMAGE requests
    const resolvedImages = (imagesToSend || []).map(img => {
      // If image already has a URL (e.g., quote image from Cloudinary), use it directly
      if (img.imageUrl) return img;
      // Otherwise, look up product image from catalog
      const nameLower = (img.productName || '').toLowerCase();
      const match = products.find(p => p.name.toLowerCase() === nameLower)
        || products.find(p => nameLower.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(nameLower));
      return {
        productName: img.productName,
        imageUrl: match?.image_url || null
      };
    }).filter(img => img.imageUrl);

    // Resolve carousel product cards from catalog
    let carouselCards = [];
    if (carouselRequest?.products) {
      carouselCards = carouselRequest.products.map(productName => {
        const nameLower = productName.toLowerCase();
        const match = products.find(p => p.name.toLowerCase() === nameLower)
          || products.find(p => nameLower.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(nameLower));
        if (match) {
          return {
            name: match.name,
            price: match.base_price,
            description: match.description || '',
            imageUrl: match.image_url || null,
            productId: match.id
          };
        }
        return null;
      }).filter(Boolean);
    }

    // Final safety net: strip ANY remaining action tags that weren't caught by parsing
    // (handles edge cases: truncated tokens, smart quotes, invisible chars, etc.)
    let finalReply = cleanReply
      .replace(/\[\/?\w+\]\s*\{[^}]*\}\s*\[\/\w+\]/g, '')  // [TAG]{...}[/TAG]
      .replace(/\[\w+\][^[]*\[\/\w+\]/g, '')                 // [TAG]...[/TAG]
      .replace(/\[GENERATE_QUOTE\].*$/s, '')                  // unclosed [GENERATE_QUOTE]...
      .replace(/\[CREATE_ORDER\].*$/s, '')                    // unclosed [CREATE_ORDER]...
      .replace(/\[SEND_\w+\].*$/s, '')                        // unclosed [SEND_...]...
      .replace(/\[REACT\].*$/s, '')                           // unclosed [REACT]...
      .replace(/\[REQUEST_LOCATION\].*$/s, '')                // unclosed [REQUEST_LOCATION]...
      .replace(/\[SEND_FLOW\].*$/s, '')                       // unclosed [SEND_FLOW]...
      .trim();

    return {
      reply: finalReply,
      intent: intent,
      orderData: orderData,
      actionTaken: actionTaken,
      imagesToSend: resolvedImages,
      listsToSend: listsToSend || [],
      buttonsToSend: buttonsToSend || [],
      documentsToSend: documentsToSend || [],
      reactionEmoji: reactionEmoji || null,
      locationRequest: locationRequest || null,
      carouselCards,
      flowRequest: flowRequest || null,
      paymentReceiptDetected: paymentReceiptDetected || false,
      shippingCheckResult: shippingCheckResult || null,
    };

  } catch (error) {
    console.error('🟢 WhatsApp AI: Error processing message:', error.message);

    // Return a graceful fallback reply
    return {
      reply: 'Disculpa, tuve un problema procesando tu mensaje. Podrías repetirlo por favor?',
      intent: 'error',
      orderData: null,
      actionTaken: null,
      imagesToSend: [],
      listsToSend: [],
      buttonsToSend: [],
      documentsToSend: [],
      reactionEmoji: null,
      locationRequest: null,
      carouselCards: [],
      flowRequest: null,
    };
  }
}

/**
 * Sanitize message history to ensure proper alternation for Claude API.
 * Claude requires messages to alternate between user and assistant roles.
 * @param {Array} messages - Array of {role, content} messages
 * @returns {Array} Sanitized array with proper alternation
 */
function sanitizeMessageHistory(messages) {
  if (messages.length === 0) return messages;

  const sanitized = [];
  let lastRole = null;

  for (const msg of messages) {
    // Skip empty messages (but allow array content for vision messages)
    if (!msg.content) continue;
    if (typeof msg.content === 'string' && msg.content.trim().length === 0) continue;

    if (msg.role === lastRole) {
      // Merge consecutive messages of the same role (only for string content)
      if (typeof sanitized[sanitized.length - 1].content === 'string' && typeof msg.content === 'string') {
        sanitized[sanitized.length - 1].content += '\n' + msg.content;
      }
      // If either is an array (vision), keep separate — don't merge
    } else {
      sanitized.push({ role: msg.role, content: msg.content });
      lastRole = msg.role;
    }
  }

  // Claude requires the first message to be from the user
  if (sanitized.length > 0 && sanitized[0].role !== 'user') {
    sanitized.shift();
  }

  // Claude requires the last message to be from the user
  while (sanitized.length > 0 && sanitized[sanitized.length - 1].role !== 'user') {
    sanitized.pop();
  }

  return sanitized;
}

// ---------------------------------------------------------------------------
// Conversation Insights — AI-powered analysis for the admin dashboard
// ---------------------------------------------------------------------------

const INSIGHTS_SYSTEM_PROMPT = `Extrae SOLO datos concretos de esta conversacion de venta de souvenirs AXKAN. NO analices, NO resumas — solo extrae hechos.

Responde UNICAMENTE con JSON valido, sin markdown, sin backticks.
{
  "insights": [
    {
      "category": "categoria",
      "icon": "emoji",
      "text": "dato concreto, maximo 1 oracion corta",
      "priority": "high|medium|low"
    }
  ]
}

SOLO incluye una categoria si hay DATO CONCRETO mencionado en la conversacion. Si no se menciono, NO la incluyas.

Categorias permitidas (usa SOLO las que apliquen):
- "nombre": SIEMPRE primero si el cliente dijo su nombre. Ej: "Lupita Flores" (priority: high, icon: "👤")
- "pedido": Producto + cantidad confirmados. Ej: "500 imanes MDF + 200 llaveros" (priority: high)
- "disenos": Cuantos disenos necesita. Ej: "8 disenos diferentes" (priority: high)
- "deposito": Si ya pago anticipo o deposito. Ej: "Deposito de $2,750 recibido" o "Pendiente de deposito" (priority: high)
- "entrega": Fecha limite o evento. Ej: "Boda 15 marzo — entrega antes del 12" (priority: high)
- "envio": Ciudad/estado de envio. Ej: "Envio a Monterrey, NL" (priority: medium)
- "riesgo": SOLO si hay queja real o el cliente dijo que se va. Ej: "Cliente molesto por tiempo de entrega" (priority: high)

REGLAS ESTRICTAS:
- "nombre" SIEMPRE va primero si el cliente lo dio. Busca frases como "me llamo...", "soy...", "mi nombre es...", o cuando responden a "cual es su nombre?"
- Maximo 5 insights
- Si la conversacion es solo saludo o pregunta inicial, responde con array VACIO: {"insights": []}
- NO incluyas: "cliente interesado en...", "conversacion en etapa...", "falta recopilar...", "bot presento opciones..."
- Solo HECHOS CONCRETOS con numeros, fechas o datos especificos
- Si no hay datos concretos todavia, devuelve array vacio`;

/**
 * Generate AI-powered insights for a WhatsApp conversation.
 * Uses caching by message count to avoid redundant API calls.
 *
 * @param {number} conversationId
 * @returns {Promise<{insights: Array, cached: boolean}>}
 */
// Auto-migrate: ensure ai_enabled column exists (runs once per server lifecycle)
let aiToggleColumnReady = false;

export async function ensureAiToggleColumn() {
  if (aiToggleColumnReady) return;
  try {
    await query(`
      ALTER TABLE whatsapp_conversations
      ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT true
    `);
    aiToggleColumnReady = true;
  } catch (err) {
    if (err.message?.includes('already exists')) {
      aiToggleColumnReady = true;
    } else {
      console.error('🟢 WhatsApp AI Toggle: Auto-migration warning:', err.message);
    }
  }
}

// Auto-migrate: ensure insights columns exist (runs once per server lifecycle)
let insightsColumnsReady = false;

async function ensureInsightsColumns() {
  if (insightsColumnsReady) return;
  try {
    await query(`
      ALTER TABLE whatsapp_conversations
      ADD COLUMN IF NOT EXISTS insights_data JSONB,
      ADD COLUMN IF NOT EXISTS insights_generated_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS insights_message_count INTEGER DEFAULT 0
    `);
    insightsColumnsReady = true;
  } catch (err) {
    // Columns may already exist or concurrent migration — that's fine
    if (err.message?.includes('already exists')) {
      insightsColumnsReady = true;
    } else {
      console.error('🟢 WhatsApp Insights: Auto-migration warning:', err.message);
    }
  }
}

export async function generateConversationInsights(conversationId) {
  // Auto-migrate on first call
  await ensureInsightsColumns();

  // 1. Load all messages
  const messagesResult = await query(
    `SELECT direction, sender, content, message_type, metadata, created_at
     FROM whatsapp_messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC`,
    [conversationId]
  );

  // 2. Check cache
  const convResult = await query(
    `SELECT insights_data, insights_message_count, client_name, wa_id
     FROM whatsapp_conversations WHERE id = $1`,
    [conversationId]
  );

  if (convResult.rows.length === 0) {
    throw new Error('Conversation not found');
  }

  const conv = convResult.rows[0];
  const currentMsgCount = messagesResult.rows.length;

  // Return cached if still fresh
  if (conv.insights_data && conv.insights_message_count >= currentMsgCount) {
    return { insights: conv.insights_data, cached: true };
  }

  if (currentMsgCount === 0) {
    return { insights: { insights: [] }, cached: false };
  }

  // 3. Build compact transcript
  const transcript = messagesResult.rows
    .filter(r => r.content && r.content.trim())
    .map(r => {
      const role = r.direction === 'inbound' ? 'CLIENTE' : (r.sender === 'ai' ? 'BOT' : 'ADMIN');
      const time = new Date(r.created_at).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
      let line = `[${time}] ${role}: ${r.content}`;
      if (r.message_type === 'audio' && r.metadata?.transcription) {
        line += ` (transcripcion de audio: ${r.metadata.transcription})`;
      }
      return line;
    })
    .join('\n');

  // Truncate very long transcripts (keep most recent)
  const MAX_CHARS = 80000;
  const trimmedTranscript = transcript.length > MAX_CHARS
    ? '...[mensajes anteriores omitidos]...\n' + transcript.slice(-MAX_CHARS)
    : transcript;

  // 4. Call Claude
  const client = getClient();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1000,
    system: INSIGHTS_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Analiza esta conversacion de WhatsApp con el cliente "${conv.client_name || conv.wa_id}":\n\n${trimmedTranscript}`
      }
    ]
  });

  // 5. Parse JSON response
  let insightsJson;
  try {
    const raw = response.content[0].text.trim();
    const cleaned = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
    insightsJson = JSON.parse(cleaned);
  } catch (parseErr) {
    console.error('🟢 WhatsApp Insights: Failed to parse AI response:', parseErr.message);
    insightsJson = {
      insights: [{
        category: 'info',
        icon: '\u26a0\ufe0f',
        text: 'No se pudo analizar la conversacion. Intenta de nuevo.',
        priority: 'low'
      }]
    };
  }

  // 6. Cache in database
  await query(
    `UPDATE whatsapp_conversations
     SET insights_data = $1, insights_generated_at = NOW(), insights_message_count = $2
     WHERE id = $3`,
    [JSON.stringify(insightsJson), currentMsgCount, conversationId]
  );

  return { insights: insightsJson, cached: false };
}

export default {
  processIncomingMessage,
  getSystemPrompt,
  buildConversationHistory,
  generateConversationInsights
};
