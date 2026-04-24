import { query } from '../shared/database.js';
import { logError } from '../shared/logger.js';

/**
 * Sales insights data fetcher.
 * No longer calls Anthropic API — data is analyzed locally via Claude Code.
 * Run: node backend/scripts/sales-insights-local.js
 */

// Fetch only data that changed since a given timestamp
export async function fetchInsightsData({ since = null, messageLimit = 50 } = {}) {
  const sinceFilter = since ? `AND wm.created_at > '${since}'` : '';
  const sinceDateFilter = since ? `WHERE wm.created_at > '${since}'` : '';
  const sinceConvFilter = since ? `AND wc.updated_at > '${since}'` : '';

  const [
    overview,
    responseTimePatterns,
    hourlyActivity,
    dailyActivity,
    conversationDepth,
    messageTypes,
    conversationOutcomes,
    firstMessageAnalysis,
    imageUsage,
    linksSent,
    peakEngagement,
    conversationVelocity,
    allLearnings,
    coachingPills,
    coachingByType,
    recentConversations,
    previousBatch,
    newMessages,
    newOrders
  ] = await Promise.all([
    safeQuery(`
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
    `),

    safeQuery(`
      WITH response_pairs AS (
        SELECT
          wm.conversation_id,
          wm.created_at AS outbound_at,
          LEAD(wm.created_at) OVER (PARTITION BY wm.conversation_id ORDER BY wm.created_at) AS next_msg_at,
          LEAD(wm.direction) OVER (PARTITION BY wm.conversation_id ORDER BY wm.created_at) AS next_direction
        FROM whatsapp_messages wm
        WHERE wm.direction = 'outbound'
      )
      SELECT
        CASE
          WHEN EXTRACT(EPOCH FROM next_msg_at - outbound_at) < 10 THEN '<10s'
          WHEN EXTRACT(EPOCH FROM next_msg_at - outbound_at) < 30 THEN '10-30s'
          WHEN EXTRACT(EPOCH FROM next_msg_at - outbound_at) < 60 THEN '30-60s'
          WHEN EXTRACT(EPOCH FROM next_msg_at - outbound_at) < 300 THEN '1-5min'
          ELSE '5min+'
        END AS bucket,
        COUNT(*) AS count,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM orders o
          JOIN whatsapp_conversations wc ON wc.id = response_pairs.conversation_id
          WHERE o.client_id = wc.client_id
        )) AS with_order
      FROM response_pairs
      WHERE next_direction = 'inbound'
      GROUP BY 1
    `),

    safeQuery(`
      SELECT
        EXTRACT(HOUR FROM wm.created_at AT TIME ZONE 'America/Mexico_City')::int AS hour,
        COUNT(DISTINCT wm.conversation_id) AS conversations,
        COUNT(DISTINCT wm.conversation_id) FILTER (WHERE EXISTS (
          SELECT 1 FROM orders o
          JOIN whatsapp_conversations wc ON wc.id = wm.conversation_id
          WHERE o.client_id = wc.client_id
        )) AS with_orders
      FROM whatsapp_messages wm
      GROUP BY 1
      ORDER BY 1
    `),

    safeQuery(`
      SELECT
        EXTRACT(DOW FROM wm.created_at AT TIME ZONE 'America/Mexico_City')::int AS dow,
        COUNT(DISTINCT wm.conversation_id) AS conversations,
        COUNT(DISTINCT wm.conversation_id) FILTER (WHERE EXISTS (
          SELECT 1 FROM orders o
          JOIN whatsapp_conversations wc ON wc.id = wm.conversation_id
          WHERE o.client_id = wc.client_id
        )) AS with_orders
      FROM whatsapp_messages wm
      GROUP BY 1
      ORDER BY 1
    `),

    safeQuery(`
      WITH conv_counts AS (
        SELECT conversation_id, COUNT(*) AS msg_count,
          EXISTS (
            SELECT 1 FROM orders o
            JOIN whatsapp_conversations wc ON wc.id = conversation_id
            WHERE o.client_id = wc.client_id
          ) AS has_order
        FROM whatsapp_messages
        GROUP BY conversation_id
      )
      SELECT
        CASE
          WHEN msg_count BETWEEN 1 AND 5 THEN '1-5'
          WHEN msg_count BETWEEN 6 AND 10 THEN '6-10'
          WHEN msg_count BETWEEN 11 AND 20 THEN '11-20'
          WHEN msg_count BETWEEN 21 AND 50 THEN '21-50'
          ELSE '50+'
        END AS depth,
        COUNT(*) AS conversations,
        COUNT(*) FILTER (WHERE has_order) AS with_orders
      FROM conv_counts
      GROUP BY 1
    `),

    safeQuery(`SELECT message_type, COUNT(*) AS count FROM whatsapp_messages GROUP BY message_type ORDER BY count DESC`),

    safeQuery(`
      WITH conv_stats AS (
        SELECT
          wc.id,
          COUNT(wm.id) AS msg_count,
          AVG(LENGTH(COALESCE(wm.content, ''))) AS avg_msg_length,
          EXTRACT(EPOCH FROM MAX(wm.created_at) - MIN(wm.created_at))/3600 AS duration_hours,
          EXISTS (SELECT 1 FROM orders o WHERE o.client_id = wc.client_id) AS has_order
        FROM whatsapp_conversations wc
        JOIN whatsapp_messages wm ON wm.conversation_id = wc.id
        GROUP BY wc.id
      )
      SELECT
        has_order,
        ROUND(AVG(msg_count)::numeric, 1) AS avg_messages,
        ROUND(AVG(avg_msg_length)::numeric, 1) AS avg_msg_length,
        ROUND(AVG(duration_hours)::numeric, 1) AS avg_duration_hours,
        COUNT(*) AS conversation_count
      FROM conv_stats
      GROUP BY has_order
    `),

    safeQuery(`
      WITH first_msgs AS (
        SELECT DISTINCT ON (conversation_id)
          conversation_id, content,
          LENGTH(content) AS msg_length, message_type, sender
        FROM whatsapp_messages
        WHERE direction = 'outbound'
        ORDER BY conversation_id, created_at ASC
      )
      SELECT
        fm.message_type AS first_msg_type, fm.sender AS first_sender,
        ROUND(AVG(fm.msg_length)::numeric, 0) AS avg_length,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM orders o
          JOIN whatsapp_conversations wc ON wc.id = fm.conversation_id
          WHERE o.client_id = wc.client_id
        )) AS with_orders
      FROM first_msgs fm
      GROUP BY fm.message_type, fm.sender
    `),

    safeQuery(`
      WITH conv_emoji AS (
        SELECT wc.id,
          bool_or(wm.message_type = 'image') AS has_image,
          EXISTS (SELECT 1 FROM orders o WHERE o.client_id = wc.client_id) AS has_order
        FROM whatsapp_conversations wc
        JOIN whatsapp_messages wm ON wm.conversation_id = wc.id AND wm.direction = 'outbound'
        GROUP BY wc.id
      )
      SELECT has_image, COUNT(*) AS conversations, COUNT(*) FILTER (WHERE has_order) AS with_orders
      FROM conv_emoji
      GROUP BY has_image
    `),

    safeQuery(`
      WITH conv_links AS (
        SELECT wc.id,
          bool_or(wm.content LIKE '%http%') AS has_link,
          EXISTS (SELECT 1 FROM orders o WHERE o.client_id = wc.client_id) AS has_order
        FROM whatsapp_conversations wc
        JOIN whatsapp_messages wm ON wm.conversation_id = wc.id AND wm.direction = 'outbound'
        GROUP BY wc.id
      )
      SELECT has_link, COUNT(*) AS conversations, COUNT(*) FILTER (WHERE has_order) AS with_orders
      FROM conv_links
      GROUP BY has_link
    `),

    safeQuery(`
      SELECT
        EXTRACT(HOUR FROM wm.created_at AT TIME ZONE 'America/Mexico_City')::int AS hour,
        COUNT(DISTINCT wm.conversation_id) AS active_convs,
        COUNT(DISTINCT wm.conversation_id) FILTER (WHERE EXISTS (
          SELECT 1 FROM orders o
          JOIN whatsapp_conversations wc ON wc.id = wm.conversation_id
          WHERE o.client_id = wc.client_id
        )) AS closed_convs
      FROM whatsapp_messages wm
      WHERE wm.direction = 'inbound'
      GROUP BY 1 ORDER BY closed_convs DESC LIMIT 5
    `),

    safeQuery(`
      WITH conv_velocity AS (
        SELECT wc.id,
          COUNT(wm.id)::numeric / GREATEST(EXTRACT(EPOCH FROM MAX(wm.created_at) - MIN(wm.created_at))/3600, 0.1) AS msgs_per_hour,
          EXISTS (SELECT 1 FROM orders o WHERE o.client_id = wc.client_id) AS has_order
        FROM whatsapp_conversations wc
        JOIN whatsapp_messages wm ON wm.conversation_id = wc.id
        GROUP BY wc.id HAVING COUNT(wm.id) > 3
      )
      SELECT has_order, ROUND(AVG(msgs_per_hour)::numeric, 1) AS avg_velocity, COUNT(*) AS count
      FROM conv_velocity GROUP BY has_order
    `),

    safeQuery(`
      SELECT type, category, insight, evidence, confidence, times_validated, applied, created_at
      FROM sales_learnings ORDER BY times_validated DESC, created_at DESC
    `),

    safeQuery(`
      SELECT coaching_type, status, COUNT(*) AS count,
        COUNT(*) FILTER (WHERE client_responded = true) AS responded,
        COUNT(*) FILTER (WHERE resulted_in_order = true) AS orders
      FROM sales_coaching GROUP BY coaching_type, status
    `),

    safeQuery(`
      SELECT coaching_type, COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'followed') AS followed,
        COUNT(*) FILTER (WHERE client_responded = true) AS responded,
        COUNT(*) FILTER (WHERE resulted_in_order = true) AS orders,
        ROUND(AVG(EXTRACT(EPOCH FROM client_responded_at - created_at)/60) FILTER (WHERE client_responded = true)::numeric, 1) AS avg_response_min
      FROM sales_coaching GROUP BY coaching_type
    `),

    safeQuery(`
      SELECT
        wc.id, wc.client_name, wc.intent, wc.ai_summary,
        COUNT(wm.id) AS msg_count,
        MAX(wm.created_at) AS last_msg_at,
        EXISTS (SELECT 1 FROM orders o WHERE o.client_id = wc.client_id) AS has_order
      FROM whatsapp_conversations wc
      JOIN whatsapp_messages wm ON wm.conversation_id = wc.id
      WHERE wc.updated_at > NOW() - INTERVAL '7 days'
      GROUP BY wc.id ORDER BY last_msg_at DESC LIMIT ${messageLimit}
    `),

    safeQuery(`
      SELECT category, title, body, evidence, confidence
      FROM sales_insights
      WHERE batch_id = (SELECT batch_id FROM sales_insights ORDER BY created_at DESC LIMIT 1)
      ORDER BY category, id
    `),

    // Delta: new messages since last run
    since ? safeQuery(`
      SELECT wm.id, wm.conversation_id, wm.direction, wm.content, wm.message_type,
        wm.sender, wm.created_at, wc.client_name
      FROM whatsapp_messages wm
      JOIN whatsapp_conversations wc ON wc.id = wm.conversation_id
      WHERE wm.created_at > $1
      ORDER BY wm.created_at DESC LIMIT ${messageLimit}
    `, [since]) : { rows: [] },

    // Delta: new orders since last run
    since ? safeQuery(`
      SELECT o.id, o.order_number, c.name AS client_name, o.status, o.total_price,
        o.total_production_cost, o.profit, o.created_at,
        json_agg(json_build_object('product', oi.product_name, 'qty', oi.quantity, 'price', oi.unit_price)) AS items
      FROM orders o
      LEFT JOIN clients c ON c.id = o.client_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.created_at > $1
      GROUP BY o.id, c.name ORDER BY o.created_at DESC
    `, [since]) : { rows: [] }
  ]);

  return {
    overview: overview.rows[0] || {},
    responseTimePatterns: responseTimePatterns.rows,
    hourlyActivity: hourlyActivity.rows,
    dailyActivity: dailyActivity.rows,
    conversationDepth: conversationDepth.rows,
    messageTypes: messageTypes.rows,
    conversationOutcomes: conversationOutcomes.rows,
    firstMessageAnalysis: firstMessageAnalysis.rows,
    imageUsage: imageUsage.rows,
    linksSent: linksSent.rows,
    peakEngagement: peakEngagement.rows,
    conversationVelocity: conversationVelocity.rows,
    allLearnings: allLearnings.rows,
    coachingPills: coachingPills.rows,
    coachingByType: coachingByType.rows,
    recentConversations: recentConversations.rows,
    previousInsights: previousBatch.rows,
    // Delta sections (only populated when 'since' is provided)
    ...(since ? {
      delta: {
        since,
        newMessages: newMessages.rows,
        newMessageCount: newMessages.rows.length,
        newOrders: newOrders.rows,
        newOrderCount: newOrders.rows.length
      }
    } : {})
  };
}

// Store insights back to the database (called by the local script after Claude analyzes)
export async function storeInsights(insights) {
  if (!Array.isArray(insights) || insights.length === 0) return 0;

  const batchId = 'local_' + Date.now();
  await query(`DELETE FROM sales_insights WHERE created_at < NOW() - INTERVAL '24 hours'`);

  for (const insight of insights) {
    await query(`
      INSERT INTO sales_insights (batch_id, category, title, body, evidence, confidence)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      batchId,
      insight.category || 'recommendation',
      insight.title || '',
      insight.body || '',
      JSON.stringify(insight.evidence || {}),
      insight.confidence || 'medium'
    ]);
  }
  return insights.length;
}

async function safeQuery(sql, params = []) {
  try { return await query(sql, params); }
  catch (e) { logError('sales_insights.query_failed', e); return { rows: [] }; }
}
