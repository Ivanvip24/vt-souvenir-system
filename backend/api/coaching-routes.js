/**
 * Sales Coaching Pills API Routes
 *
 * Endpoints for managing AI-generated coaching suggestions
 * that help close sales conversations on WhatsApp.
 */

import { Router } from 'express';
import { query } from '../shared/database.js';
import { authMiddleware } from './admin-routes.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// =====================================================
// GET /conversations/:conversationId/pills
// Fetch active coaching pills for a conversation
// =====================================================
router.get('/conversations/:conversationId/pills', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const result = await query(`
      SELECT id, coaching_type, suggested_message, context, created_at
      FROM sales_coaching
      WHERE conversation_id = $1 AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 3
    `, [conversationId]);

    res.json({ success: true, pills: result.rows });
  } catch (error) {
    console.error('Error fetching coaching pills:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// POST /pills/:id/follow
// Mark a coaching pill as followed
// =====================================================
router.post('/pills/:id/follow', async (req, res) => {
  try {
    const { id } = req.params;
    const { messageSent } = req.body;

    const result = await query(`
      UPDATE sales_coaching
      SET status = 'followed', followed_at = NOW(), message_sent = $2
      WHERE id = $1 AND status = 'pending'
      RETURNING id
    `, [id, messageSent || null]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Pill not found or already actioned' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error following coaching pill:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// POST /pills/:id/ignore
// Mark a coaching pill as ignored
// =====================================================
router.post('/pills/:id/ignore', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(`
      UPDATE sales_coaching
      SET status = 'ignored'
      WHERE id = $1 AND status = 'pending'
      RETURNING id
    `, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Pill not found or already actioned' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error ignoring coaching pill:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// POST /push
// Push new coaching suggestions (used by Claude Code)
// =====================================================
router.post('/push', async (req, res) => {
  try {
    const { suggestions } = req.body;

    if (!suggestions || !Array.isArray(suggestions) || suggestions.length === 0) {
      return res.status(400).json({ success: false, error: 'suggestions array required' });
    }

    let pushed = 0;

    for (const suggestion of suggestions) {
      const { conversationId, coachingType, suggestedMessage, context } = suggestion;

      if (!conversationId || !coachingType || !suggestedMessage) {
        continue;
      }

      // Expire existing pending pills for this conversation
      await query(`
        UPDATE sales_coaching
        SET status = 'expired', expired_at = NOW()
        WHERE conversation_id = $1 AND status = 'pending'
      `, [conversationId]);

      // Insert new pill
      await query(`
        INSERT INTO sales_coaching (conversation_id, coaching_type, suggested_message, context)
        VALUES ($1, $2, $3, $4)
      `, [conversationId, coachingType, suggestedMessage, context || null]);

      // Update conversation coaching metadata
      await query(`
        UPDATE whatsapp_conversations
        SET last_coached_at = NOW(),
            coaching_message_count = (SELECT COUNT(*) FROM whatsapp_messages WHERE conversation_id = $1)
        WHERE id = $1
      `, [conversationId]);

      pushed++;
    }

    res.json({ success: true, pushed });
  } catch (error) {
    console.error('Error pushing coaching suggestions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// GET /stats
// Coaching performance statistics
// =====================================================
router.get('/stats', async (req, res) => {
  try {
    const byStatusResult = await query(`
      SELECT status, COUNT(*)::int as count
      FROM sales_coaching
      GROUP BY status
    `);

    const byTypeResult = await query(`
      SELECT coaching_type,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'followed')::int as followed,
        COUNT(*) FILTER (WHERE status = 'ignored')::int as ignored,
        COUNT(*) FILTER (WHERE client_responded = true)::int as got_response,
        COUNT(*) FILTER (WHERE resulted_in_order = true)::int as led_to_order
      FROM sales_coaching
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY coaching_type
    `);

    res.json({
      success: true,
      stats: {
        byStatus: byStatusResult.rows,
        byType: byTypeResult.rows
      }
    });
  } catch (error) {
    console.error('Error fetching coaching stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// GET /dashboard
// Priority list + scoreboard for Sales AI dashboard
// =====================================================
router.get('/dashboard', async (req, res) => {
  try {
    // --- Priority lists ---
    const [coldLeads, readyToClose, waitingReply] = await Promise.all([
      query(`
        SELECT wc.id as conversation_id, wc.client_name,
          EXTRACT(EPOCH FROM (NOW() - wc.last_message_at))/3600 as hours_since,
          (SELECT content FROM whatsapp_messages WHERE conversation_id = wc.id ORDER BY created_at DESC LIMIT 1) as last_message,
          (SELECT coaching_type FROM sales_coaching WHERE conversation_id = wc.id AND status = 'pending' LIMIT 1) as pill_type
        FROM whatsapp_conversations wc
        WHERE wc.last_message_at > NOW() - INTERVAL '7 days'
          AND (SELECT direction FROM whatsapp_messages WHERE conversation_id = wc.id ORDER BY created_at DESC LIMIT 1) = 'outbound'
          AND wc.last_message_at < NOW() - INTERVAL '2 hours'
        ORDER BY wc.last_message_at ASC
        LIMIT 20
      `),
      query(`
        SELECT sc.conversation_id, wc.client_name,
          sc.suggested_message, sc.context,
          EXTRACT(EPOCH FROM (NOW() - wc.last_message_at))/3600 as hours_since,
          (SELECT content FROM whatsapp_messages WHERE conversation_id = wc.id ORDER BY created_at DESC LIMIT 1) as last_message
        FROM sales_coaching sc
        JOIN whatsapp_conversations wc ON wc.id = sc.conversation_id
        WHERE sc.coaching_type = 'ready_to_close' AND sc.status = 'pending'
        ORDER BY sc.created_at DESC
        LIMIT 10
      `),
      query(`
        SELECT wc.id as conversation_id, wc.client_name,
          EXTRACT(EPOCH FROM (NOW() - wc.last_message_at))/3600 as hours_since,
          (SELECT content FROM whatsapp_messages WHERE conversation_id = wc.id ORDER BY created_at DESC LIMIT 1) as last_message
        FROM whatsapp_conversations wc
        WHERE wc.last_message_at > NOW() - INTERVAL '48 hours'
          AND (SELECT direction FROM whatsapp_messages WHERE conversation_id = wc.id ORDER BY created_at DESC LIMIT 1) = 'inbound'
        ORDER BY wc.last_message_at ASC
        LIMIT 20
      `)
    ]);

    // --- Scoreboard (last 7 days) ---
    const [kpis, revenue, byType, weeklyTrend] = await Promise.all([
      query(`
        SELECT
          COUNT(*)::int as total_pills,
          COUNT(*) FILTER (WHERE status = 'followed')::int as followed,
          COUNT(*) FILTER (WHERE client_responded = true)::int as responses,
          COUNT(*) FILTER (WHERE resulted_in_order = true)::int as orders
        FROM sales_coaching
        WHERE created_at > NOW() - INTERVAL '7 days'
      `),
      query(`
        SELECT COALESCE(SUM(o.total_price), 0) as revenue
        FROM sales_coaching sc
        JOIN orders o ON o.id = sc.order_id
        WHERE sc.resulted_in_order = true AND sc.created_at > NOW() - INTERVAL '7 days'
      `),
      query(`
        SELECT coaching_type,
          COUNT(*)::int as sent,
          COUNT(*) FILTER (WHERE client_responded = true)::int as responded,
          ROUND(COUNT(*) FILTER (WHERE client_responded = true)::numeric / NULLIF(COUNT(*), 0), 2) as rate
        FROM sales_coaching
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY coaching_type
      `),
      query(`
        SELECT
          date_trunc('week', created_at) as week,
          COUNT(*)::int as sent,
          COUNT(*) FILTER (WHERE client_responded = true)::int as responded,
          ROUND(COUNT(*) FILTER (WHERE client_responded = true)::numeric / NULLIF(COUNT(*), 0), 2) as rate
        FROM sales_coaching
        WHERE created_at > NOW() - INTERVAL '28 days'
        GROUP BY date_trunc('week', created_at)
        ORDER BY week
      `)
    ]);

    const kpiRow = kpis.rows[0] || { total_pills: 0, followed: 0, responses: 0, orders: 0 };
    const revenueRow = revenue.rows[0] || { revenue: 0 };

    // --- Bot learnings / insights ---
    const learnings = await query(`
      SELECT type, category, insight, evidence, confidence, times_validated, created_at
      FROM sales_learnings
      WHERE applied = true
      ORDER BY times_validated DESC, created_at DESC
      LIMIT 20
    `);

    res.json({
      success: true,
      priorities: {
        coldLeads: coldLeads.rows,
        readyToClose: readyToClose.rows,
        waitingReply: waitingReply.rows
      },
      scoreboard: {
        totalPills: kpiRow.total_pills,
        followed: kpiRow.followed,
        responses: kpiRow.responses,
        orders: kpiRow.orders,
        revenue: parseFloat(revenueRow.revenue),
        byType: byType.rows,
        weeklyTrend: weeklyTrend.rows
      },
      learnings: learnings.rows
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// GET /insights — Latest AI-generated sales insights
// =====================================================
router.get('/insights', async (req, res) => {
  try {
    const latestBatch = await query(`
      SELECT batch_id, created_at FROM sales_insights
      ORDER BY created_at DESC LIMIT 1
    `);

    if (latestBatch.rows.length === 0) {
      return res.json({ success: true, insights: [], kpis: {}, lastUpdated: null, nextUpdate: null });
    }

    const { batch_id, created_at } = latestBatch.rows[0];

    const insights = await query(`
      SELECT id, category, title, body, evidence, confidence, created_at
      FROM sales_insights
      WHERE batch_id = $1
      ORDER BY
        CASE category
          WHEN 'working' THEN 1
          WHEN 'not_working' THEN 2
          WHEN 'experiment' THEN 3
          WHEN 'recommendation' THEN 4
        END,
        id
    `, [batch_id]);

    const kpis = await query(`
      SELECT
        COUNT(DISTINCT wc.id) FILTER (WHERE wc.last_message_at > NOW() - INTERVAL '7 days') AS conversations_7d,
        CASE WHEN COUNT(DISTINCT wc.id) FILTER (WHERE wc.last_message_at > NOW() - INTERVAL '7 days') > 0
          THEN ROUND(
            COUNT(DISTINCT wc.id) FILTER (WHERE wc.last_message_at > NOW() - INTERVAL '7 days' AND EXISTS (
              SELECT 1 FROM orders o WHERE o.client_id = wc.client_id AND o.created_at > NOW() - INTERVAL '7 days'
            ))::numeric /
            NULLIF(COUNT(DISTINCT wc.id) FILTER (WHERE wc.last_message_at > NOW() - INTERVAL '7 days'), 0)::numeric * 100, 1
          ) ELSE 0
        END AS close_rate_7d,
        COALESCE(
          (SELECT SUM(total_price) FROM orders WHERE created_at > NOW() - INTERVAL '7 days'), 0
        ) AS revenue_7d,
        COUNT(DISTINCT wc.id) FILTER (
          WHERE wc.last_message_at > NOW() - INTERVAL '48 hours'
          AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.client_id = wc.client_id)
        ) AS active_leads
      FROM whatsapp_conversations wc
    `);

    const avgResponse = await query(`
      WITH pairs AS (
        SELECT
          wm.created_at AS sent_at,
          LEAD(wm.created_at) OVER (PARTITION BY wm.conversation_id ORDER BY wm.created_at) AS reply_at,
          LEAD(wm.direction) OVER (PARTITION BY wm.conversation_id ORDER BY wm.created_at) AS reply_dir
        FROM whatsapp_messages wm
        WHERE wm.direction = 'outbound'
          AND wm.created_at > NOW() - INTERVAL '7 days'
      )
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM reply_at - sent_at)/60)::numeric, 1) AS avg_response_min
      FROM pairs
      WHERE reply_dir = 'inbound' AND reply_at - sent_at < INTERVAL '24 hours'
    `);

    const lastUpdated = new Date(created_at);
    const nextUpdate = new Date(lastUpdated.getTime() + 20 * 60 * 1000);

    res.json({
      success: true,
      insights: insights.rows,
      kpis: {
        conversations7d: parseInt(kpis.rows[0]?.conversations_7d || 0),
        closeRate7d: parseFloat(kpis.rows[0]?.close_rate_7d || 0),
        revenue7d: parseFloat(kpis.rows[0]?.revenue_7d || 0),
        activeLeads: parseInt(kpis.rows[0]?.active_leads || 0),
        avgResponseMin: parseFloat(avgResponse.rows[0]?.avg_response_min || 0)
      },
      lastUpdated: lastUpdated.toISOString(),
      nextUpdate: nextUpdate.toISOString()
    });
  } catch (error) {
    console.error('Error fetching insights:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// POST /insights/:id/apply — Apply an insight as a bot learning
// =====================================================
router.post('/insights/:id/apply', async (req, res) => {
  try {
    const insight = await query('SELECT * FROM sales_insights WHERE id = $1', [req.params.id]);
    if (insight.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Insight not found' });
    }
    const ins = insight.rows[0];

    // Check if already applied (avoid duplicates)
    const existing = await query(
      'SELECT id FROM sales_learnings WHERE insight = $1 AND applied = true LIMIT 1',
      [ins.title + ': ' + ins.body]
    );
    if (existing.rows.length > 0) {
      return res.json({ success: true, alreadyApplied: true, learningId: existing.rows[0].id });
    }

    // Create a sales_learning from the insight — bot picks it up via buildDynamicPromptSection()
    const result = await query(`
      INSERT INTO sales_learnings (type, category, insight, evidence, confidence, auto_adjustable, applied, approved)
      VALUES ($1, $2, $3, $4, $5, true, true, true)
      RETURNING id
    `, [
      ins.category === 'not_working' ? 'lost_deal' : 'pattern_insight',
      ins.category === 'recommendation' ? 'closing' : (ins.category === 'not_working' ? 'opening' : 'tone'),
      ins.title + ': ' + ins.body,
      JSON.stringify(ins.evidence),
      ins.confidence || 'medium'
    ]);

    console.log(`🧠 Insight #${req.params.id} applied as learning #${result.rows[0].id}`);
    res.json({ success: true, learningId: result.rows[0].id });
  } catch (error) {
    console.error('Error applying insight:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// POST /insights/:id/dismiss — Dismiss an insight
// =====================================================
router.post('/insights/:id/dismiss', async (req, res) => {
  try {
    await query('DELETE FROM sales_insights WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// PUT /learnings/:id — Update a learning's insight text
// =====================================================
router.put('/learnings/:id', async (req, res) => {
  try {
    const { insight } = req.body;
    if (!insight) return res.status(400).json({ success: false, error: 'insight is required' });
    await query('UPDATE sales_learnings SET insight = $1, updated_at = NOW() WHERE id = $2', [insight, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// DELETE /learnings/:id — Remove a learning
// =====================================================
router.delete('/learnings/:id', async (req, res) => {
  try {
    await query('DELETE FROM sales_learnings WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// POST /learnings — Create a new learning (manual rule)
// =====================================================
router.post('/learnings', async (req, res) => {
  try {
    const { insight, type, category } = req.body;
    if (!insight) return res.status(400).json({ success: false, error: 'insight is required' });
    await query(`
      INSERT INTO sales_learnings (type, category, insight, confidence, auto_adjustable, applied)
      VALUES ($1, $2, $3, 'high', true, true)
    `, [type || 'correction', category || 'tone', insight]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// POST /simulate — Simulate a client message and get bot response (no WhatsApp send)
// =====================================================
router.post('/simulate', async (req, res) => {
  try {
    const { message, conversationId } = req.body;
    if (!message) return res.status(400).json({ success: false, error: 'message required' });

    const { processIncomingMessage } = await import('../services/whatsapp-ai.js');

    // Use existing conversation or create temp one
    let convId = conversationId;
    if (!convId) {
      const conv = await query(`
        INSERT INTO whatsapp_conversations (wa_id, client_name, last_message_at)
        VALUES ('SIM_' || NOW()::text, 'Simulación Test', NOW())
        RETURNING id
      `);
      convId = conv.rows[0].id;
    }

    // Store client message
    await query(`
      INSERT INTO whatsapp_messages (conversation_id, wa_message_id, direction, sender, message_type, content)
      VALUES ($1, 'sim_' || NOW()::text, 'inbound', 'client', 'text', $2)
    `, [convId, message]);

    // Get AI response (won't send via WhatsApp — just returns the reply)
    const result = await processIncomingMessage(convId, 'SIM_TEST', message);

    // Store bot response
    if (result.reply) {
      await query(`
        INSERT INTO whatsapp_messages (conversation_id, wa_message_id, direction, sender, message_type, content)
        VALUES ($1, 'sim_bot_' || NOW()::text, 'outbound', 'ai', 'text', $2)
      `, [convId, result.reply]);
    }

    res.json({ success: true, conversationId: convId, reply: result.reply, intent: result.intent });
  } catch (err) {
    console.error('Simulation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// POST /digest
// Trigger sales digest manually
// =====================================================
router.post('/digest', async (req, res) => {
  try {
    const { triggerSalesDigest } = await import('../services/designer-scheduler.js');
    const result = await triggerSalesDigest();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Error triggering sales digest:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// POST /analyze — Trigger nightly pattern analysis now
// =====================================================
router.post('/analyze', async (req, res) => {
  try {
    const { nightlyPatternAnalysis, learnFromLostDeals } = await import('../services/sales-learning-engine.js');
    await nightlyPatternAnalysis();
    await learnFromLostDeals();
    const learnings = await query('SELECT id, type, category, insight, confidence, applied FROM sales_learnings ORDER BY created_at DESC');
    res.json({ success: true, totalLearnings: learnings.rows.length, learnings: learnings.rows });
  } catch (err) {
    console.error('Error triggering analysis:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// GET /conversations/active
// Conversations needing analysis (new messages since last coaching)
// =====================================================
router.get('/conversations/active', async (req, res) => {
  try {
    const result = await query(`
      SELECT wc.id, wc.wa_id, wc.client_name, wc.last_message_at,
        wc.last_coached_at, wc.coaching_message_count,
        (SELECT COUNT(*)::int FROM whatsapp_messages WHERE conversation_id = wc.id) as current_message_count
      FROM whatsapp_conversations wc
      WHERE wc.last_message_at > NOW() - INTERVAL '48 hours'
        AND (wc.last_coached_at IS NULL
             OR (SELECT COUNT(*) FROM whatsapp_messages WHERE conversation_id = wc.id) > COALESCE(wc.coaching_message_count, 0))
      ORDER BY wc.last_message_at DESC
      LIMIT 50
    `);

    res.json({ success: true, conversations: result.rows });
  } catch (error) {
    console.error('Error fetching active conversations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
