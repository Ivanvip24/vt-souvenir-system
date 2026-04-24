#!/usr/bin/env node
/**
 * Nightly Sales Learning — Local script for Claude Code sessions.
 *
 * Usage:
 *   node backend/scripts/nightly-learning-local.js fetch-patterns  — prints stats for pattern analysis
 *   node backend/scripts/nightly-learning-local.js fetch-lost      — prints lost deal conversations
 *   node backend/scripts/nightly-learning-local.js store            — reads JSON insights from stdin, writes to DB
 *
 * AI analysis done by Claude Code, NOT by API calls.
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

process.env.DB_TYPE = 'postgres';
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';
process.env.QUIET_DB = '1';

const { query } = await import('../shared/database.js');

const command = process.argv[2];

if (command === 'fetch-patterns') {
  // Aggregate stats from last 24 hours
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

  if (parseInt(stats.rows[0].total_conversations) < 3) {
    console.log('NOT_ENOUGH_DATA');
    process.exit(0);
  }

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

  const currentLearnings = await query('SELECT COUNT(*) as count FROM sales_learnings WHERE applied = true');

  console.log(JSON.stringify({
    ...stats.rows[0],
    hourlyRates: hourlyRates.rows,
    responseAnalysis: responseAnalysis.rows,
    currentLearningsCount: currentLearnings.rows[0].count
  }, null, 2));
  process.exit(0);

} else if (command === 'fetch-lost') {
  // Find lost deals — buying signals but no order
  const lostDeals = await query(`
    SELECT wc.id, wc.wa_id, wc.client_name, wc.created_at,
      COUNT(wm.id) as message_count,
      MAX(wm.created_at) as last_message_at
    FROM whatsapp_conversations wc
    JOIN whatsapp_messages wm ON wm.conversation_id = wc.id
    WHERE wc.status = 'active'
      AND wc.created_at > NOW() - INTERVAL '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM orders o WHERE o.client_id = wc.client_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM sales_learnings sl
        WHERE sl.source_conversation_id = wc.id AND sl.type = 'lost_deal'
      )
      AND EXISTS (
        SELECT 1 FROM whatsapp_messages wm2
        WHERE wm2.conversation_id = wc.id
          AND wm2.sender = 'client'
          AND (
            wm2.content ~* '(\\d+\\s*(piezas|imanes|llaveros|destapadores))'
            OR wm2.content ~* '(cuánto|precio|costo|cotiza)'
            OR wm2.content ~* '(sí claro|si claro|va dale|cómo (le )?hago|cómo pago)'
          )
      )
    GROUP BY wc.id
    HAVING COUNT(wm.id) >= 6
    ORDER BY wc.created_at DESC
    LIMIT 5
  `);

  if (lostDeals.rows.length === 0) {
    console.log('NO_LOST_DEALS');
    process.exit(0);
  }

  const results = [];
  for (const deal of lostDeals.rows) {
    const msgs = await query(`
      SELECT sender, direction, content, message_type, created_at
      FROM whatsapp_messages WHERE conversation_id = $1
      ORDER BY created_at ASC
    `, [deal.id]);

    if (msgs.rows.length < 6) continue;

    const chatHistory = msgs.rows.map(m => {
      const who = m.sender === 'client' ? 'CLIENTE' : m.sender === 'admin' ? 'IVAN' : 'BOT';
      const typeTag = m.message_type !== 'text' ? ` [${m.message_type}]` : '';
      return `${who}${typeTag}: ${(m.content || '').substring(0, 250)}`;
    }).join('\n');

    results.push({
      id: deal.id,
      clientName: deal.client_name || deal.wa_id,
      messageCount: deal.message_count,
      chatHistory
    });
  }

  console.log(JSON.stringify(results, null, 2));
  process.exit(0);

} else if (command === 'store') {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const insights = JSON.parse(input);
  let stored = 0;

  for (const insight of insights) {
    try {
      const existing = await query(
        'SELECT id, times_validated FROM sales_learnings WHERE insight = $1 LIMIT 1',
        [insight.insight]
      );

      if (existing.rows.length > 0) {
        await query('UPDATE sales_learnings SET times_validated = times_validated + 1, updated_at = NOW() WHERE id = $1', [existing.rows[0].id]);
      } else {
        const typeCount = await query(
          'SELECT COUNT(*) as count FROM sales_learnings WHERE type = $1 AND applied = true',
          [insight.type || 'pattern_insight']
        );

        const shouldApply = insight.auto_adjustable !== false && parseInt(typeCount.rows[0].count) < 15;

        await query(`
          INSERT INTO sales_learnings (type, category, insight, evidence, source_conversation_id, confidence, auto_adjustable, applied)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          insight.type || 'pattern_insight',
          insight.category || 'tone',
          insight.insight,
          insight.evidence || '',
          insight.sourceConversationId || null,
          insight.confidence || 'medium',
          insight.auto_adjustable !== false,
          shouldApply
        ]);
      }
      stored++;
    } catch (err) {
      console.error(`Failed to store insight: ${err.message}`);
    }
  }

  console.log(`Stored ${stored}/${insights.length} learnings.`);
  process.exit(0);

} else {
  console.error('Usage: node nightly-learning-local.js [fetch-patterns|fetch-lost|store]');
  process.exit(1);
}
