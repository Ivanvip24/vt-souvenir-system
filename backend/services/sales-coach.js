/**
 * Sales Coach — AI-powered coaching pill generator
 *
 * Analyzes WhatsApp conversations and generates actionable suggestions.
 * Uses Claude Haiku for fast, cheap analysis (~$0.01 per conversation).
 *
 * Rules:
 * - NEVER suggest discounts or special prices
 * - NEVER break minimum quantities
 * - NEVER promise faster delivery times
 * - NEVER contradict AXKAN pricing/policy
 */

import { query } from '../shared/database.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Analyze a single conversation and generate coaching pills.
 * Called automatically when new messages arrive.
 */
export async function analyzeConversation(conversationId) {
  try {
    // Get last 15 messages for context
    const msgs = await query(`
      SELECT direction, content, created_at
      FROM whatsapp_messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT 15
    `, [conversationId]);

    if (msgs.rows.length < 2) return; // Not enough context

    const conv = await query(
      'SELECT client_name, wa_id FROM whatsapp_conversations WHERE id = $1',
      [conversationId]
    );
    if (conv.rows.length === 0) return;

    const clientName = conv.rows[0].client_name || 'Cliente';

    // Build conversation text for AI
    const chatHistory = msgs.rows.reverse().map(m => {
      const who = m.direction === 'outbound' ? 'VENDEDOR' : 'CLIENTE';
      return `${who}: ${(m.content || '').substring(0, 200)}`;
    }).join('\n');

    const lastMsg = msgs.rows[msgs.rows.length - 1];
    const lastDir = lastMsg.direction;
    const hoursSinceLastMsg = (Date.now() - new Date(lastMsg.created_at).getTime()) / (1000 * 60 * 60);

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Eres un coach de ventas para AXKAN, una empresa de souvenirs personalizados de MDF con corte láser en México.

REGLAS ABSOLUTAS (nunca las rompas):
- NUNCA sugerir descuentos ni precios especiales
- NUNCA romper cantidades mínimas (100 piezas por diseño)
- NUNCA prometer tiempos de entrega más rápidos
- Los precios son fijos: imanes $11 c/u (100pz), llaveros $10 c/u (100pz), destapadores $20 c/u (100pz)
- Catálogo: axkan.art/productos | Pedidos: axkan.art/pedidos

Analiza esta conversación y genera UNA sugerencia de mensaje corto (1-2 líneas, español mexicano casual) que el vendedor puede enviar.

Nombre del cliente: ${clientName}
Último mensaje es del: ${lastDir === 'outbound' ? 'VENDEDOR' : 'CLIENTE'}
Horas desde último mensaje: ${Math.round(hoursSinceLastMsg)}

Conversación:
${chatHistory}

Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "coachingType": "cold_lead" | "change_technique" | "ready_to_close" | "missing_info",
  "suggestedMessage": "el mensaje sugerido",
  "context": "por qué sugieres esto (1 línea en inglés)"
}

Si la conversación no necesita intervención (cliente acaba de responder, todo va bien), responde:
{"coachingType": "none", "suggestedMessage": "", "context": "no action needed"}`
      }]
    });

    let rawText = response.content[0].text.trim();
    rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

    const parsed = JSON.parse(rawText);

    if (parsed.coachingType === 'none' || !parsed.suggestedMessage) {
      // No action needed — expire any existing pending pills
      await query(
        `UPDATE sales_coaching SET status = 'expired', expired_at = NOW() WHERE conversation_id = $1 AND status = 'pending'`,
        [conversationId]
      );
      return;
    }

    // Expire old pending pills for this conversation
    await query(
      `UPDATE sales_coaching SET status = 'expired', expired_at = NOW() WHERE conversation_id = $1 AND status = 'pending'`,
      [conversationId]
    );

    // Insert new pill
    await query(`
      INSERT INTO sales_coaching (conversation_id, coaching_type, suggested_message, context, status, created_at)
      VALUES ($1, $2, $3, $4, 'pending', NOW())
    `, [conversationId, parsed.coachingType, parsed.suggestedMessage, parsed.context]);

    // Update coaching timestamp
    await query(
      `UPDATE whatsapp_conversations SET last_coached_at = NOW(), coaching_message_count = (SELECT COUNT(*) FROM whatsapp_messages WHERE conversation_id = $1) WHERE id = $1`,
      [conversationId]
    );

    console.log(`📊 Sales coach: generated ${parsed.coachingType} pill for conv ${conversationId} (${clientName})`);

  } catch (error) {
    console.error(`📊 Sales coach error for conv ${conversationId}:`, error.message);
  }
}

/**
 * Analyze all active conversations that have changed since last coaching.
 * Called by the scheduler periodically.
 */
export async function analyzeAllActive() {
  try {
    const result = await query(`
      SELECT wc.id, wc.client_name
      FROM whatsapp_conversations wc
      WHERE wc.last_message_at > NOW() - INTERVAL '48 hours'
        AND (
          wc.last_coached_at IS NULL
          OR (SELECT COUNT(*) FROM whatsapp_messages WHERE conversation_id = wc.id) > COALESCE(wc.coaching_message_count, 0)
        )
      ORDER BY wc.last_message_at DESC
      LIMIT 30
    `);

    console.log(`📊 Sales coach: analyzing ${result.rows.length} conversations...`);

    for (const row of result.rows) {
      await analyzeConversation(row.id);
      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`📊 Sales coach: batch analysis complete`);
  } catch (error) {
    console.error('📊 Sales coach batch error:', error.message);
  }
}
