/**
 * WhatsApp Template Message Routes — Admin endpoints for proactive outbound messaging.
 */

import { Router } from 'express';
import { authMiddleware } from './admin-routes.js';
import {
  listTemplates,
  createTemplate,
  sendTemplate,
  broadcastTemplate,
  listBroadcasts,
  seedDefaultTemplates
} from '../services/whatsapp-templates.js';

const router = Router();

// All routes require auth
router.use(authMiddleware);

// List all templates
router.get('/templates', async (req, res) => {
  try {
    const templates = await listTemplates();
    res.json({ templates });
  } catch (err) {
    console.error('🟢 Template list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Create a new template
router.post('/templates', async (req, res) => {
  try {
    const template = await createTemplate(req.body);
    res.json({ template });
  } catch (err) {
    console.error('🟢 Template create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Send template to single recipient
router.post('/templates/:name/send', async (req, res) => {
  try {
    const { to, variables, headerImageUrl } = req.body;
    if (!to) return res.status(400).json({ error: 'Missing "to" phone number' });
    const result = await sendTemplate(req.params.name, to, variables || {}, headerImageUrl);
    res.json({ result });
  } catch (err) {
    console.error('🟢 Template send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Broadcast template to multiple recipients
router.post('/templates/:name/broadcast', async (req, res) => {
  try {
    const { recipients, variables, headerImageUrl } = req.body;
    if (!recipients?.length) return res.status(400).json({ error: 'Missing recipients array' });
    const results = await broadcastTemplate(
      req.params.name, recipients, variables || {},
      req.body.sentBy || 'admin', headerImageUrl
    );
    res.json({
      results,
      totalSent: results.filter(r => r.success).length,
      totalFailed: results.filter(r => !r.success).length
    });
  } catch (err) {
    console.error('🟢 Template broadcast error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// List broadcast history
router.get('/broadcasts', async (req, res) => {
  try {
    const broadcasts = await listBroadcasts();
    res.json({ broadcasts });
  } catch (err) {
    console.error('🟢 Broadcast list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Seed default templates
router.post('/templates/seed', async (req, res) => {
  try {
    await seedDefaultTemplates();
    const templates = await listTemplates();
    res.json({ message: 'Default templates seeded', templates });
  } catch (err) {
    console.error('🟢 Template seed error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
