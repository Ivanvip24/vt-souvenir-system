/**
 * WhatsApp Template Message Routes — Admin endpoints for proactive outbound messaging.
 */

import { Router } from 'express';
import { authMiddleware } from './admin-routes.js';
import { query } from '../shared/database.js';
import {
  listTemplates,
  createTemplate,
  sendTemplate,
  broadcastTemplate,
  listBroadcasts,
  seedDefaultTemplates
} from '../services/whatsapp-templates.js';
import { log, logError } from '../shared/logger.js';

const router = Router();

// Auto-create templates + broadcasts tables if missing
let templatesMigrated = false;
async function ensureTemplatesTables() {
  if (templatesMigrated) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS whatsapp_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        category VARCHAR(50) NOT NULL DEFAULT 'MARKETING',
        language VARCHAR(10) DEFAULT 'es_MX',
        status VARCHAR(50) DEFAULT 'pending',
        meta_template_id VARCHAR(100),
        header_type VARCHAR(20),
        body_text TEXT NOT NULL,
        footer_text TEXT,
        variables JSONB DEFAULT '[]',
        buttons JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS whatsapp_broadcasts (
        id SERIAL PRIMARY KEY,
        template_id INTEGER REFERENCES whatsapp_templates(id),
        sent_by VARCHAR(100),
        recipients JSONB NOT NULL,
        total_sent INTEGER DEFAULT 0,
        total_delivered INTEGER DEFAULT 0,
        total_read INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    templatesMigrated = true;
    log('info', 'whatsapp-template.whatsapp-templates-tables-ready');
    // Auto-seed default templates on startup
    await seedDefaultTemplates();
  } catch (e) {
    logError('whatsapp-template.templates-migration-error', e);
  }
}
ensureTemplatesTables();

// All routes require auth
router.use(authMiddleware);

// List all templates
router.get('/templates', async (req, res) => {
  try {
    const templates = await listTemplates();
    res.json({ templates });
  } catch (err) {
    logError('whatsapp-template.template-list-error', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Create a new template
router.post('/templates', async (req, res) => {
  try {
    const template = await createTemplate(req.body);
    res.json({ template });
  } catch (err) {
    logError('whatsapp-template.template-create-error', err);
    res.status(500).json({ error: 'Error interno del servidor' });
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
    logError('whatsapp-template.template-send-error', err);
    res.status(500).json({ error: 'Error interno del servidor' });
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
    logError('whatsapp-template.template-broadcast-error', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// List broadcast history
router.get('/broadcasts', async (req, res) => {
  try {
    const broadcasts = await listBroadcasts();
    res.json({ broadcasts });
  } catch (err) {
    logError('whatsapp-template.broadcast-list-error', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Update a template (e.g. remove buttons)
router.put('/templates/:name', async (req, res) => {
  try {
    const { bodyText, footerText, headerType, variables, buttons, language } = req.body;
    const sets = [];
    const vals = [];
    let i = 1;
    if (bodyText !== undefined) { sets.push(`body_text = $${i++}`); vals.push(bodyText); }
    if (footerText !== undefined) { sets.push(`footer_text = $${i++}`); vals.push(footerText); }
    if (headerType !== undefined) { sets.push(`header_type = $${i++}`); vals.push(headerType); }
    if (variables !== undefined) { sets.push(`variables = $${i++}`); vals.push(JSON.stringify(variables)); }
    if (buttons !== undefined) { sets.push(`buttons = $${i++}`); vals.push(JSON.stringify(buttons)); }
    if (language !== undefined) { sets.push(`language = $${i++}`); vals.push(language); }
    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.params.name);
    const result = await query(`UPDATE whatsapp_templates SET ${sets.join(', ')} WHERE name = $${i}`, vals);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Template not found' });
    const updated = await query('SELECT * FROM whatsapp_templates WHERE name = $1', [req.params.name]);
    res.json({ template: updated.rows[0] });
  } catch (err) {
    logError('whatsapp-template.template-update-error', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Delete a template from Meta and local DB
router.delete('/templates/:name', async (req, res) => {
  try {
    const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const { metaApiFetch, WHATSAPP_API_BASE } = await import('../services/whatsapp-api.js');

    // Delete from Meta (all languages)
    if (WABA_ID) {
      try {
        const metaRes = await metaApiFetch(
          `${WHATSAPP_API_BASE}/${WABA_ID}/message_templates?name=${req.params.name}`,
          { method: 'DELETE' }
        );
        const metaData = await metaRes.json();
        log('info', 'whatsapp-template.meta-template-delete-response');
      } catch (err) {
        logError('whatsapp-template.meta-template-delete-failed', err);
      }
    }

    // Delete from local DB
    await query('DELETE FROM whatsapp_templates WHERE name = $1', [req.params.name]);
    res.json({ message: `Template "${req.params.name}" deleted from Meta and local DB` });
  } catch (err) {
    logError('whatsapp-template.template-delete-error', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Seed default templates
router.post('/templates/seed', async (req, res) => {
  try {
    await seedDefaultTemplates();
    const templates = await listTemplates();
    res.json({ message: 'Default templates seeded', templates });
  } catch (err) {
    logError('whatsapp-template.template-seed-error', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
