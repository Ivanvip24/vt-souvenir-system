/**
 * WhatsApp Template Messages — Admin-triggered proactive outbound messaging.
 * Handles template creation, sending, and broadcasting.
 */

import { query } from '../shared/database.js';
import { log, logError } from '../shared/logger.js';
import { metaApiFetch, WHATSAPP_API_BASE } from './whatsapp-api.js';

const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

/**
 * Build Meta API payload for template submission.
 */
function buildMetaTemplatePayload(templateData) {
  const components = [];
  if (templateData.headerType === 'IMAGE') {
    components.push({ type: 'HEADER', format: 'IMAGE' });
  }
  const bodyComponent = {
    type: 'BODY',
    text: templateData.bodyText
  };
  if (templateData.variables?.length > 0) {
    bodyComponent.example = {
      body_text: [templateData.variables.map(v => v.example || 'example')]
    };
  }
  components.push(bodyComponent);
  if (templateData.footerText) {
    components.push({ type: 'FOOTER', text: templateData.footerText });
  }
  if (templateData.buttons?.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: templateData.buttons.map(b => ({ type: 'QUICK_REPLY', text: b.text }))
    });
  }
  return {
    name: templateData.name,
    category: templateData.category,
    language: templateData.language || 'es_MX',
    components
  };
}

/**
 * Create a template (store locally + submit to Meta for approval).
 */
export async function createTemplate(templateData) {
  const result = await query(
    `INSERT INTO whatsapp_templates (name, category, language, body_text, footer_text, header_type, variables, buttons)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (name) DO NOTHING
     RETURNING *`,
    [templateData.name, templateData.category, templateData.language || 'es_MX',
     templateData.bodyText, templateData.footerText || null, templateData.headerType || null,
     JSON.stringify(templateData.variables || []), JSON.stringify(templateData.buttons || [])]
  );

  if (!result.rows[0]) {
    // Template already exists
    const existing = await query('SELECT * FROM whatsapp_templates WHERE name = $1', [templateData.name]);
    return existing.rows[0];
  }

  // Submit to Meta if WABA ID is configured
  if (WABA_ID) {
    try {
      const metaPayload = buildMetaTemplatePayload(templateData);
      const response = await metaApiFetch(
        `${WHATSAPP_API_BASE}/${WABA_ID}/message_templates`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metaPayload) }
      );
      const data = await response.json();
      if (data.id) {
        await query('UPDATE whatsapp_templates SET meta_template_id = $1, status = $2 WHERE id = $3',
          [data.id, data.status || 'PENDING', result.rows[0].id]);
      }
    } catch (err) {
      logError('whatsapp.template.meta_submit_error', err);
    }
  }

  return result.rows[0];
}

/**
 * Send a template message to a single recipient.
 */
export async function sendTemplate(templateName, to, variables = {}, headerImageUrl = null) {
  const template = await query('SELECT * FROM whatsapp_templates WHERE name = $1', [templateName]);
  if (!template.rows[0]) throw new Error(`Template "${templateName}" not found`);

  const components = [];

  if (headerImageUrl && template.rows[0].header_type === 'IMAGE') {
    components.push({
      type: 'header',
      parameters: [{ type: 'image', image: { link: headerImageUrl } }]
    });
  }

  const vars = template.rows[0].variables || [];
  if (vars.length > 0) {
    components.push({
      type: 'body',
      parameters: vars.map((v, i) => ({
        type: 'text',
        text: variables[v.name] || variables[String(i + 1)] || ''
      }))
    });
  }

  const response = await metaApiFetch(
    `${WHATSAPP_API_BASE}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: template.rows[0].language || 'es_MX' },
          components
        }
      })
    }
  );

  return response.json();
}

/**
 * Broadcast a template to multiple recipients.
 */
export async function broadcastTemplate(templateName, recipients, variables = {}, sentBy = 'admin', headerImageUrl = null) {
  const results = [];
  for (const recipient of recipients) {
    const recipientVars = { ...variables, ...recipient.variables };
    try {
      const result = await sendTemplate(templateName, recipient.waId, recipientVars, headerImageUrl);
      results.push({ waId: recipient.waId, success: !result.error, data: result });
    } catch (err) {
      results.push({ waId: recipient.waId, success: false, error: err.message });
    }
  }

  await query(
    `INSERT INTO whatsapp_broadcasts (template_id, sent_by, recipients, total_sent)
     SELECT t.id, $1, $2, $3 FROM whatsapp_templates t WHERE t.name = $4`,
    [sentBy, JSON.stringify(results), results.filter(r => r.success).length, templateName]
  );

  return results;
}

/**
 * Seed the two default AXKAN templates.
 */
export async function seedDefaultTemplates() {
  const defaults = [
    {
      name: 'axkan_seasonal_promo',
      category: 'MARKETING',
      headerType: 'IMAGE',
      bodyText: '¡Hola {{1}}! {{2}} ¿Te gustaría saber más?',
      footerText: 'AXKAN — Recuerdos que cuentan historias',
      variables: [{ name: 'client_name', example: 'María' }, { name: 'promo_hook', example: 'Tenemos 20% en imanes' }],
      buttons: [{ text: 'Sí, cuéntame más' }, { text: 'No, gracias' }]
    },
    {
      name: 'axkan_payment_reminder',
      category: 'UTILITY',
      bodyText: 'Hola {{1}}, te recordamos que tu pedido #{{2}} por ${{3}} MXN tiene un saldo pendiente. Para agilizar tu envío, puedes realizar tu pago por transferencia. ¿Necesitas los datos bancarios?',
      footerText: null,
      headerType: null,
      variables: [
        { name: 'client_name', example: 'Juan' },
        { name: 'order_number', example: '1234' },
        { name: 'amount', example: '1,500' }
      ],
      buttons: [{ text: 'Enviar datos bancarios' }, { text: 'Ya pagué' }, { text: 'Hablar con alguien' }]
    },
    {
      name: 'axkan_order_followup',
      category: 'UTILITY',
      language: 'es_MX',
      bodyText: 'Hola {{1}}, tu pedido #{{2}} esta casi listo pero necesitamos que completes tu pago y elijas tu paqueteria para poder enviartelo',
      footerText: 'AXKAN - Recuerdos hechos souvenir',
      headerType: null,
      variables: [
        { name: 'client_name', example: 'Maria' },
        { name: 'order_number', example: 'AXK-1234' }
      ],
      buttons: []
    }
  ];

  for (const tpl of defaults) {
    await createTemplate(tpl);
  }
  log('info', 'whatsapp.template.seeded');
}

/**
 * List all templates from local DB.
 */
export async function listTemplates() {
  const result = await query('SELECT * FROM whatsapp_templates ORDER BY created_at DESC');
  return result.rows;
}

/**
 * List broadcasts with stats.
 */
export async function listBroadcasts() {
  const result = await query(
    `SELECT b.*, t.name as template_name FROM whatsapp_broadcasts b
     LEFT JOIN whatsapp_templates t ON b.template_id = t.id
     ORDER BY b.created_at DESC LIMIT 50`
  );
  return result.rows;
}
