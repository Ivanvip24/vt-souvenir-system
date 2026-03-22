import { query } from '../shared/database.js';
import Anthropic from '@anthropic-ai/sdk';

export async function learnFromOrder(orderId) {
  try {
    // 1. Get order + client
    const order = await query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (!order.rows[0]) return;

    const clientId = order.rows[0].client_id;
    if (!clientId) return;

    // 2. Find conversation for this client
    const conv = await query('SELECT id FROM whatsapp_conversations WHERE client_id = $1 LIMIT 1', [clientId]);
    if (!conv.rows[0]) return;

    // 3. Get all messages
    const msgs = await query(`
      SELECT sender, direction, content, created_at
      FROM whatsapp_messages WHERE conversation_id = $1
      ORDER BY created_at ASC
    `, [conv.rows[0].id]);

    if (msgs.rows.length < 3) return; // Not enough data

    // 4. Build conversation text
    const chatText = msgs.rows.map(m => {
      const who = m.sender === 'client' ? 'CLIENTE' : m.sender === 'admin' ? 'IVAN' : 'BOT';
      return `${who}: ${(m.content || '').substring(0, 200)}`;
    }).join('\n');

    // 5. Analyze with Claude
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `Esta conversación de WhatsApp resultó en una venta de souvenirs AXKAN. Analiza qué funcionó.

Conversación:
${chatText}

Genera 2-3 insights específicos y accionables. Para cada uno indica si es auto-ajustable (tono, estilo, timing) o necesita aprobación (precios, políticas).

Responde SOLO JSON válido (sin markdown):
[
  {
    "type": "closing_pattern",
    "category": "tone|timing|opening|follow_up|objection|product_knowledge",
    "insight": "insight en español, máximo 1 línea",
    "evidence": "qué mensaje específico causó esto",
    "auto_adjustable": true/false,
    "confidence": "high|medium|low"
  }
]`
      }]
    });

    let rawText = response.content[0].text.trim();
    rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const insights = JSON.parse(rawText);

    // 6. Store insights
    for (const insight of insights) {
      // Check for duplicate
      const existing = await query(
        'SELECT id FROM sales_learnings WHERE insight = $1 LIMIT 1',
        [insight.insight]
      );

      if (existing.rows.length > 0) {
        // Validate existing insight
        await query('UPDATE sales_learnings SET times_validated = times_validated + 1, updated_at = NOW() WHERE id = $1', [existing.rows[0].id]);
      } else {
        await query(`
          INSERT INTO sales_learnings (type, category, insight, evidence, source_conversation_id, source_order_id, confidence, auto_adjustable, applied)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          insight.type || 'closing_pattern',
          insight.category || 'tone',
          insight.insight,
          insight.evidence || '',
          conv.rows[0].id,
          orderId,
          insight.confidence || 'medium',
          insight.auto_adjustable !== false,
          insight.auto_adjustable !== false // auto-apply if auto_adjustable
        ]);
      }
    }

    console.log(`🧠 Sales learning: analyzed order #${orderId}, found ${insights.length} insights`);
  } catch (error) {
    console.error('🧠 Sales learning error (order):', error.message);
  }
}

export async function detectCorrection(conversationId, adminMessageContent) {
  try {
    // Check if bot sent a message in the last 5 min
    const recentBotMsg = await query(`
      SELECT content FROM whatsapp_messages
      WHERE conversation_id = $1 AND sender = 'ai' AND direction = 'outbound'
        AND created_at > NOW() - INTERVAL '5 minutes'
      ORDER BY created_at DESC LIMIT 1
    `, [conversationId]);

    if (recentBotMsg.rows.length === 0) return; // No recent bot message, not a correction

    const botMessage = recentBotMsg.rows[0].content;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `El bot de ventas AXKAN envió este mensaje:
BOT: "${botMessage}"

Ivan (el dueño) lo corrigió enviando:
IVAN: "${adminMessageContent}"

¿Qué debería aprender el bot de esta corrección? Responde SOLO JSON (sin markdown):
{
  "insight": "lo que el bot debe hacer diferente (1 línea, español)",
  "category": "tone|timing|opening|follow_up|objection|product_knowledge",
  "confidence": "high"
}`
      }]
    });

    let rawText = response.content[0].text.trim();
    rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const correction = JSON.parse(rawText);

    // Store correction (always applied immediately)
    await query(`
      INSERT INTO sales_learnings (type, category, insight, evidence, source_conversation_id, confidence, auto_adjustable, applied)
      VALUES ('correction', $1, $2, $3, $4, 'high', true, true)
    `, [
      correction.category || 'tone',
      correction.insight,
      `Bot: "${botMessage.substring(0, 100)}" → Ivan: "${adminMessageContent.substring(0, 100)}"`,
      conversationId
    ]);

    console.log(`🧠 Sales learning: correction detected in conv ${conversationId}`);
  } catch (error) {
    console.error('🧠 Sales correction detection error:', error.message);
  }
}

export async function nightlyPatternAnalysis() {
  try {
    console.log('🧠 Running nightly pattern analysis...');

    // Get aggregate stats from last 24 hours
    const stats = await query(`
      SELECT
        COUNT(DISTINCT wc.id) as total_conversations,
        COUNT(DISTINCT wc.id) FILTER (WHERE EXISTS (SELECT 1 FROM orders o WHERE o.client_id = wc.client_id)) as conversations_with_orders,
        AVG(LENGTH(wm.content)) FILTER (WHERE wm.sender = 'ai') as avg_bot_message_length,
        AVG(LENGTH(wm.content)) FILTER (WHERE wm.sender = 'admin') as avg_admin_message_length,
        AVG(LENGTH(wm.content)) FILTER (WHERE wm.sender = 'client') as avg_client_message_length,
        COUNT(*) FILTER (WHERE wm.sender = 'ai') as bot_messages,
        COUNT(*) FILTER (WHERE wm.sender = 'admin') as admin_messages,
        COUNT(*) FILTER (WHERE wm.sender = 'client') as client_messages
      FROM whatsapp_conversations wc
      JOIN whatsapp_messages wm ON wm.conversation_id = wc.id
      WHERE wm.created_at > NOW() - INTERVAL '24 hours'
    `);

    // Response rates by hour
    const hourlyRates = await query(`
      SELECT
        EXTRACT(HOUR FROM wm.created_at AT TIME ZONE 'America/Mexico_City') as hour,
        COUNT(*) FILTER (WHERE wm.direction = 'outbound') as outbound,
        COUNT(*) FILTER (WHERE wm.direction = 'inbound') as inbound
      FROM whatsapp_messages wm
      WHERE wm.created_at > NOW() - INTERVAL '7 days'
      GROUP BY EXTRACT(HOUR FROM wm.created_at AT TIME ZONE 'America/Mexico_City')
      ORDER BY hour
    `);

    // Messages that got responses vs silence
    const responseAnalysis = await query(`
      WITH outbound_msgs AS (
        SELECT wm.id, wm.conversation_id, wm.content, wm.sender, wm.created_at,
          LENGTH(wm.content) as msg_length,
          LEAD(wm.direction) OVER (PARTITION BY wm.conversation_id ORDER BY wm.created_at) as next_direction,
          LEAD(wm.created_at) OVER (PARTITION BY wm.conversation_id ORDER BY wm.created_at) as next_msg_at
        FROM whatsapp_messages wm
        WHERE wm.direction = 'outbound'
          AND wm.created_at > NOW() - INTERVAL '7 days'
      )
      SELECT
        sender,
        COUNT(*) as total_sent,
        COUNT(*) FILTER (WHERE next_direction = 'inbound') as got_response,
        AVG(msg_length) FILTER (WHERE next_direction = 'inbound') as avg_length_responded,
        AVG(msg_length) FILTER (WHERE next_direction IS NULL OR next_direction = 'outbound') as avg_length_no_response
      FROM outbound_msgs
      GROUP BY sender
    `);

    // Get current applied learnings count
    const currentLearnings = await query('SELECT COUNT(*) as count FROM sales_learnings WHERE applied = true');

    const statsData = {
      ...stats.rows[0],
      hourlyRates: hourlyRates.rows,
      responseAnalysis: responseAnalysis.rows,
      currentLearningsCount: currentLearnings.rows[0].count
    };

    // Only analyze if enough data
    if (parseInt(statsData.total_conversations) < 3) {
      console.log('🧠 Not enough conversations for pattern analysis');
      return;
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `Analiza estos datos de ventas de WhatsApp del bot AXKAN (souvenirs personalizados México).

Stats últimas 24h:
${JSON.stringify(statsData, null, 2)}

Genera 2-4 insights de patrones. Solo incluye insights que sean NUEVOS y accionables.
- auto_adjustable = true para: tono, longitud de mensaje, timing, estilo de apertura, uso de emojis
- auto_adjustable = false para: precios, cantidades mínimas, tiempos de entrega, políticas

Responde SOLO JSON (sin markdown):
[
  {
    "type": "pattern_insight",
    "category": "tone|timing|opening|follow_up",
    "insight": "insight en español, máximo 1 línea",
    "evidence": "dato específico que lo respalda",
    "auto_adjustable": true/false,
    "confidence": "high|medium|low"
  }
]`
      }]
    });

    let rawText = response.content[0].text.trim();
    rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const insights = JSON.parse(rawText);

    for (const insight of insights) {
      // Check for duplicate
      const existing = await query(
        'SELECT id, times_validated FROM sales_learnings WHERE insight = $1 LIMIT 1',
        [insight.insight]
      );

      if (existing.rows.length > 0) {
        await query('UPDATE sales_learnings SET times_validated = times_validated + 1, updated_at = NOW() WHERE id = $1', [existing.rows[0].id]);
      } else {
        // Cap at 15 per type
        const typeCount = await query(
          'SELECT COUNT(*) as count FROM sales_learnings WHERE type = $1 AND applied = true',
          [insight.type]
        );

        const shouldApply = insight.auto_adjustable !== false && parseInt(typeCount.rows[0].count) < 15;

        await query(`
          INSERT INTO sales_learnings (type, category, insight, evidence, confidence, auto_adjustable, applied)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          insight.type || 'pattern_insight',
          insight.category || 'tone',
          insight.insight,
          insight.evidence || '',
          insight.confidence || 'medium',
          insight.auto_adjustable !== false,
          shouldApply
        ]);
      }
    }

    console.log(`🧠 Nightly analysis complete: ${insights.length} new insights`);
  } catch (error) {
    console.error('🧠 Nightly pattern analysis error:', error.message);
  }
}

export async function buildDynamicPromptSection() {
  try {
    const learnings = await query(`
      SELECT type, insight FROM sales_learnings
      WHERE applied = true
      ORDER BY times_validated DESC, confidence DESC, created_at DESC
      LIMIT 45
    `);

    if (learnings.rows.length === 0) return '';

    const patterns = learnings.rows.filter(l => l.type === 'pattern_insight');
    const corrections = learnings.rows.filter(l => l.type === 'correction');
    const closings = learnings.rows.filter(l => l.type === 'closing_pattern');

    let section = '\n\n## LO QUE HE APRENDIDO DE VENTAS REALES:\n';

    if (patterns.length > 0) {
      section += '\n### Patrones (auto-ajustado):\n';
      patterns.slice(0, 15).forEach(p => { section += '- ' + p.insight + '\n'; });
    }

    if (corrections.length > 0) {
      section += '\n### Correcciones de Ivan:\n';
      corrections.slice(0, 15).forEach(c => { section += '- ' + c.insight + '\n'; });
    }

    if (closings.length > 0) {
      section += '\n### Técnicas de cierre (de ventas reales):\n';
      closings.slice(0, 15).forEach(c => { section += '- ' + c.insight + '\n'; });
    }

    return section;
  } catch (error) {
    console.error('🧠 Error building dynamic prompt section:', error.message);
    return '';
  }
}
