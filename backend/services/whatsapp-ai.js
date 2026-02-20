/**
 * WhatsApp AI Service
 * Processes incoming WhatsApp messages using Claude API with AXKAN brand voice.
 * Handles product inquiries, order collection, and order creation.
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { query } from '../shared/database.js';
import { createOrderBothSystems } from '../agents/notion-agent/sync.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(__dirname, '..', 'chatbot_whatsapp');

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

function getClient() {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  return anthropic;
}

/**
 * Build the system prompt with the product catalog injected.
 * @param {Array} products - Array of {name, base_price, description, category, production_cost}
 * @returns {string} The system prompt for Claude
 */
export function getSystemPrompt(products) {
  const catalogLines = products.map(p => {
    const price = parseFloat(p.base_price);
    const hasImage = p.image_url ? ' [FOTO DISPONIBLE]' : '';
    return `- ${p.name}: $${price.toFixed(2)} MXN${p.description ? ` — ${p.description}` : ''}${p.category ? ` (${p.category})` : ''}${hasImage}`;
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

${responseExamples}`;
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
function parseAIResponse(responseText) {
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
  // Remove SEND_IMAGE blocks from clean reply
  cleanReply = cleanReply.replace(/\[SEND_IMAGE\].*?\[\/SEND_IMAGE\]/g, '').trim();

  return { cleanReply, intent, orderJson, imagesToSend };
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
    // Load product catalog from database
    const products = await loadProductCatalog();

    // Build conversation history from stored messages
    const history = await buildConversationHistory(conversationId);

    // Build the system prompt with current catalog
    const systemPrompt = getSystemPrompt(products);

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

    // Call Claude API
    const client = getClient();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      system: systemPrompt,
      messages: sanitizedMessages
    });

    const rawReply = response.content[0].text;

    // Parse the response for intent and order blocks
    const { cleanReply, intent, orderJson, imagesToSend } = parseAIResponse(rawReply);

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

    // Resolve product image URLs for SEND_IMAGE requests
    const resolvedImages = (imagesToSend || []).map(img => {
      const nameLower = (img.productName || '').toLowerCase();
      const match = products.find(p => p.name.toLowerCase() === nameLower)
        || products.find(p => nameLower.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(nameLower));
      return {
        productName: img.productName,
        imageUrl: match?.image_url || null
      };
    }).filter(img => img.imageUrl);

    return {
      reply: cleanReply,
      intent: intent,
      orderData: orderData,
      actionTaken: actionTaken,
      imagesToSend: resolvedImages
    };

  } catch (error) {
    console.error('🟢 WhatsApp AI: Error processing message:', error.message);

    // Return a graceful fallback reply
    return {
      reply: 'Disculpa, tuve un problema procesando tu mensaje. Podrías repetirlo por favor?',
      intent: 'error',
      orderData: null,
      actionTaken: null,
      imagesToSend: []
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
    if (!msg.content || msg.content.trim().length === 0) continue;

    if (msg.role === lastRole) {
      // Merge consecutive messages of the same role
      sanitized[sanitized.length - 1].content += '\n' + msg.content;
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

export default {
  processIncomingMessage,
  getSystemPrompt,
  buildConversationHistory
};
