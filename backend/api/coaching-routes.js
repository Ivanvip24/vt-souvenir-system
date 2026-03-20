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
