#!/usr/bin/env node
/**
 * Sales Coaching — Local script for Claude Code sessions.
 *
 * Usage:
 *   node backend/scripts/sales-coaching-local.js fetch     — prints active conversations needing coaching
 *   node backend/scripts/sales-coaching-local.js store     — reads JSON coaching pills from stdin and writes to DB
 *
 * The AI analysis is done by Claude Code itself, NOT by an API call.
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

if (command === 'fetch') {
  // Fetch active conversations that need coaching
  const result = await query(`
    SELECT wc.id, wc.client_name, wc.wa_id, wc.last_message_at,
           EXTRACT(EPOCH FROM (NOW() - wc.last_message_at)) / 3600 AS hours_since_last
    FROM whatsapp_conversations wc
    WHERE wc.last_message_at > NOW() - INTERVAL '48 hours'
      AND (
        wc.last_coached_at IS NULL
        OR (SELECT COUNT(*) FROM whatsapp_messages WHERE conversation_id = wc.id) > COALESCE(wc.coaching_message_count, 0)
      )
    ORDER BY wc.last_message_at DESC
    LIMIT 30
  `);

  if (result.rows.length === 0) {
    console.log('NO_CONVERSATIONS_NEED_COACHING');
    process.exit(0);
  }

  // For each conversation, fetch last 15 messages
  const conversations = [];
  for (const row of result.rows) {
    const msgs = await query(`
      SELECT direction, content, created_at
      FROM whatsapp_messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT 15
    `, [row.id]);

    if (msgs.rows.length < 2) continue;

    const chatHistory = msgs.rows.reverse().map(m => {
      const who = m.direction === 'outbound' ? 'VENDEDOR' : 'CLIENTE';
      return `${who}: ${(m.content || '').substring(0, 200)}`;
    }).join('\n');

    const lastMsg = msgs.rows[msgs.rows.length - 1];

    conversations.push({
      id: row.id,
      clientName: row.client_name || 'Cliente',
      lastDirection: lastMsg.direction === 'outbound' ? 'VENDEDOR' : 'CLIENTE',
      hoursSinceLastMsg: Math.round(parseFloat(row.hours_since_last)),
      chatHistory
    });
  }

  console.log(JSON.stringify(conversations, null, 2));
  process.exit(0);

} else if (command === 'store') {
  // Read JSON pills from stdin
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const pills = JSON.parse(input);

  let stored = 0;
  for (const pill of pills) {
    try {
      if (pill.coachingType === 'none' || !pill.suggestedMessage) {
        await query(
          `UPDATE sales_coaching SET status = 'expired', expired_at = NOW() WHERE conversation_id = $1 AND status = 'pending'`,
          [pill.conversationId]
        );
        stored++;
        continue;
      }

      await query(
        `UPDATE sales_coaching SET status = 'expired', expired_at = NOW() WHERE conversation_id = $1 AND status = 'pending'`,
        [pill.conversationId]
      );

      await query(`
        INSERT INTO sales_coaching (conversation_id, coaching_type, suggested_message, context, status, created_at)
        VALUES ($1, $2, $3, $4, 'pending', NOW())
      `, [pill.conversationId, pill.coachingType, pill.suggestedMessage, pill.context]);

      await query(
        `UPDATE whatsapp_conversations SET last_coached_at = NOW(), coaching_message_count = (SELECT COUNT(*) FROM whatsapp_messages WHERE conversation_id = $1) WHERE id = $1`,
        [pill.conversationId]
      );
      stored++;
    } catch (err) {
      console.error(`Failed pill for conversation ${pill.conversationId}: ${err.message}`);
    }
  }

  console.log(`Stored ${stored}/${pills.length} coaching pills.`);
  process.exit(0);

} else {
  console.error('Usage: node sales-coaching-local.js [fetch|store]');
  process.exit(1);
}
