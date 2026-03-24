import cron from 'node-cron';
import { query } from '../shared/database.js';
import { sendWhatsAppMessage, sendWhatsAppTemplate } from './whatsapp-api.js';
import { sendWhatsAppDocument } from './whatsapp-media.js';

let scheduledJobs = [];

/**
 * Send daily follow-up messages to designers with pending tasks.
 * Queries designer_tasks for today's pending items and notifies each designer via WhatsApp.
 */
export async function sendDailyFollowUp() {
  try {
    console.log('📋 Running designer daily follow-up...');

    const result = await query(`
      SELECT
        d.id AS designer_id,
        d.name AS designer_name,
        d.phone AS designer_phone,
        dt.description AS task_description
      FROM designer_tasks dt
      JOIN designers d ON d.id = dt.designer_id
      WHERE dt.status IN ('pending', 'correction')
      ORDER BY d.id, dt.created_at
    `);

    if (result.rows.length === 0) {
      console.log('📋 No pending designer tasks for today');
      return;
    }

    // Group tasks by designer
    const designerTasks = {};
    for (const row of result.rows) {
      if (!designerTasks[row.designer_id]) {
        designerTasks[row.designer_id] = {
          name: row.designer_name,
          phone: row.designer_phone,
          tasks: []
        };
      }
      designerTasks[row.designer_id].tasks.push(row.task_description);
    }

    // Send message to each designer
    for (const [designerId, designer] of Object.entries(designerTasks)) {
      if (!designer.phone) {
        console.log(`⚠️ Designer ${designer.name} has no phone number, skipping follow-up`);
        continue;
      }

      try {
        // Try template message first (works outside 24h window)
        const templateResult = await sendWhatsAppTemplate(
          designer.phone,
          'designer_daily_followup',
          'es_MX',
          [designer.name, String(designer.tasks.length)]
        );

        if (templateResult.success) {
          console.log(`📋 Template follow-up sent to ${designer.name} (${designer.tasks.length} tasks)`);
        } else {
          // Fallback to regular message (only works within 24h window)
          console.log(`📋 Template failed for ${designer.name}, trying regular message...`);
          const taskList = designer.tasks.map(t => `- ${t}`).join('\n');
          const message = `Hola ${designer.name}, tienes ${designer.tasks.length} tarea(s) pendiente(s):\n${taskList}\n\u00bfYa terminaste alguna? Responde "listo" cuando termines o "pendientes" para ver el detalle.`;
          await sendWhatsAppMessage(designer.phone, message);
          console.log(`📋 Regular follow-up sent to ${designer.name}`);
        }
      } catch (err) {
        console.error(`❌ Failed to send follow-up to ${designer.name}:`, err.message);
      }
    }

    console.log('📋 Designer daily follow-up complete');
  } catch (err) {
    console.error('❌ Error in designer daily follow-up:', err.message);
  }
}

/**
 * Generate and send daily designer report to Ivan via WhatsApp.
 */
export async function triggerDailyReport() {
  try {
    console.log('📊 Generating designer daily report...');

    // Lazy imports to avoid circular dependencies
    const { getDailySummary } = await import('./designer-task-tracker.js');
    const { generateDailyReport } = await import('./designer-report-generator.js');

    const summary = await getDailySummary();
    const reportResult = await generateDailyReport(summary);
    const pdfUrl = reportResult.pdfUrl || reportResult.url;
    const filename = reportResult.filename;

    const ivanPhone = process.env.IVAN_WHATSAPP_NUMBER;
    if (!ivanPhone) {
      console.log('⚠️ IVAN_WHATSAPP_NUMBER not set, skipping daily report delivery');
      return { success: true, pdfUrl, filename, delivered: false };
    }

    await sendWhatsAppDocument(ivanPhone, pdfUrl, filename, 'Reporte diario de produccion');
    console.log('📊 Designer daily report sent to Ivan');

    return { success: true, pdfUrl, filename, delivered: true };
  } catch (err) {
    console.error('❌ Error generating designer daily report:', err.message);
    throw err;
  }
}

/**
 * Generate and send weekly designer report with AI insights to Ivan via WhatsApp.
 */
export async function triggerWeeklyReport() {
  try {
    console.log('📊 Generating designer weekly report...');

    // Lazy imports to avoid circular dependencies
    const { getWeeklySummary, generateAIInsights } = await import('./designer-task-tracker.js');
    const { generateWeeklyReport } = await import('./designer-report-generator.js');

    const summary = await getWeeklySummary();
    const insights = await generateAIInsights(summary);
    const weeklyResult = await generateWeeklyReport(summary, insights);
    const pdfUrl = weeklyResult.pdfUrl || weeklyResult.url;
    const filename = weeklyResult.filename;

    const ivanPhone = process.env.IVAN_WHATSAPP_NUMBER;
    if (!ivanPhone) {
      console.log('⚠️ IVAN_WHATSAPP_NUMBER not set, skipping weekly report delivery');
      return { success: true, pdfUrl, filename, delivered: false };
    }

    await sendWhatsAppDocument(ivanPhone, pdfUrl, filename, 'Reporte semanal de produccion');
    console.log('📊 Designer weekly report sent to Ivan');

    return { success: true, pdfUrl, filename, delivered: true };
  } catch (err) {
    console.error('❌ Error generating designer weekly report:', err.message);
    throw err;
  }
}

/**
 * Generate and send daily sales digest to Ivan via WhatsApp.
 */
export async function triggerSalesDigest() {
  try {
    console.log('📊 Generating sales digest...');

    // --- Query priority counts ---
    const [coldLeads, waitingReply, readyToClose, kpis, revenue] = await Promise.all([
      query(`
        SELECT COUNT(*)::int as count
        FROM whatsapp_conversations wc
        WHERE wc.last_message_at > NOW() - INTERVAL '7 days'
          AND (SELECT direction FROM whatsapp_messages WHERE conversation_id = wc.id ORDER BY created_at DESC LIMIT 1) = 'outbound'
          AND wc.last_message_at < NOW() - INTERVAL '24 hours'
      `),
      query(`
        SELECT COUNT(*)::int as count
        FROM whatsapp_conversations wc
        WHERE wc.last_message_at > NOW() - INTERVAL '48 hours'
          AND (SELECT direction FROM whatsapp_messages WHERE conversation_id = wc.id ORDER BY created_at DESC LIMIT 1) = 'inbound'
      `),
      query(`
        SELECT COUNT(*)::int as count
        FROM sales_coaching
        WHERE coaching_type = 'ready_to_close' AND status = 'pending'
      `),
      query(`
        SELECT
          COUNT(*)::int as total_pills,
          COUNT(*) FILTER (WHERE client_responded = true)::int as responses
        FROM sales_coaching
        WHERE created_at > NOW() - INTERVAL '1 day'
      `),
      query(`
        SELECT COALESCE(SUM(o.total_price), 0) as revenue
        FROM sales_coaching sc
        JOIN orders o ON o.id = sc.order_id
        WHERE sc.resulted_in_order = true AND sc.created_at > NOW() - INTERVAL '7 days'
      `)
    ]);

    const coldCount = coldLeads.rows[0]?.count || 0;
    const waitingCount = waitingReply.rows[0]?.count || 0;
    const closeCount = readyToClose.rows[0]?.count || 0;
    const pillsSent = kpis.rows[0]?.total_pills || 0;
    const responsesCount = kpis.rows[0]?.responses || 0;
    const responseRate = pillsSent > 0 ? Math.round((responsesCount / pillsSent) * 100) : 0;
    const revenueAmount = parseFloat(revenue.rows[0]?.revenue || 0);

    const today = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' });

    // --- WhatsApp text summary ---
    const textMessage = [
      `📊 *Resumen de Ventas — ${today}*`,
      '',
      `🔴 ${coldCount} leads fríos (sin respuesta 24h+)`,
      `🟡 ${waitingCount} esperando tu respuesta`,
      `🟢 ${closeCount} listos para cerrar`,
      '',
      `💬 Ayer: ${pillsSent} pills enviados, ${responsesCount} respuestas (${responseRate}%)`,
      `💰 Revenue potencial: $${revenueAmount.toLocaleString('es-MX')}`,
      '',
      `📎 Reporte completo adjunto`
    ].join('\n');

    const ivanPhone = process.env.IVAN_WHATSAPP_NUMBER;
    if (!ivanPhone) {
      console.log('⚠️ IVAN_WHATSAPP_NUMBER not set, skipping sales digest delivery');
      return { success: true, delivered: false, textMessage };
    }

    // Send text summary
    await sendWhatsAppMessage(ivanPhone, textMessage);

    // Generate and send PDF
    let pdfDelivered = false;
    try {
      const { generateSalesDigestPDF } = await import('./sales-digest-generator.js');
      const cleanDate = new Date().toISOString().split('T')[0]; // 2026-03-20
      const { pdfUrl, filename } = await generateSalesDigestPDF({
        date: cleanDate,
        coldLeads: coldCount,
        waitingReply: waitingCount,
        readyToClose: closeCount,
        pillsSent,
        responses: responsesCount,
        responseRate,
        revenue: revenueAmount
      });
      await sendWhatsAppDocument(ivanPhone, pdfUrl, filename, 'Resumen de ventas diario');
      pdfDelivered = true;
      console.log('📊 Sales digest PDF sent to Ivan');
    } catch (pdfErr) {
      console.error('⚠️ PDF generation failed, text summary was still sent:', pdfErr.message);
    }

    console.log('📊 Sales digest sent to Ivan');
    return { success: true, delivered: true, pdfDelivered, textMessage };
  } catch (err) {
    console.error('❌ Error generating sales digest:', err.message);
    throw err;
  }
}

/**
 * Initialize all designer tracking cron jobs.
 */
export function initializeDesignerScheduler() {
  console.log('📋 Initializing Designer Task Tracking Scheduler...');

  // 0. Sales coaching batch analysis — every 30 min
  const coachingJob = cron.schedule('*/30 * * * *', async () => {
    try {
      const { analyzeAllActive } = await import('./sales-coach.js');
      await analyzeAllActive();
    } catch (err) {
      console.error('📊 Sales coaching batch error:', err.message);
    }
  }, {
    timezone: 'America/Mexico_City',
    scheduled: true
  });
  scheduledJobs.push(coachingJob);
  console.log('  ✅ Sales coaching: every 30 min');

  // 0b. Sales digest — 9 AM Mexico City
  const salesDigestJob = cron.schedule('0 9 * * *', () => {
    triggerSalesDigest();
  }, {
    timezone: 'America/Mexico_City',
    scheduled: true
  });
  scheduledJobs.push(salesDigestJob);
  console.log('  ✅ Sales digest: 9:00 AM (Mexico City)');

  // 1. Daily follow-up — 6 PM Mexico City
  const followUpJob = cron.schedule('0 18 * * *', () => {
    sendDailyFollowUp();
  }, {
    timezone: 'America/Mexico_City',
    scheduled: true
  });
  scheduledJobs.push(followUpJob);
  console.log('  ✅ Daily follow-up: 6:00 PM (Mexico City)');

  // 2. Daily report — 7 PM Mexico City
  const dailyReportJob = cron.schedule('0 19 * * *', () => {
    triggerDailyReport();
  }, {
    timezone: 'America/Mexico_City',
    scheduled: true
  });
  scheduledJobs.push(dailyReportJob);
  console.log('  ✅ Daily report: 7:00 PM (Mexico City)');

  // 3. Weekly report — Sunday 9 AM Mexico City
  const weeklyReportJob = cron.schedule('0 9 * * 0', () => {
    triggerWeeklyReport();
  }, {
    timezone: 'America/Mexico_City',
    scheduled: true
  });
  scheduledJobs.push(weeklyReportJob);
  console.log('  ✅ Weekly report: Sunday 9:00 AM (Mexico City)');

  // 4. Nightly sales pattern analysis — 12 AM Mexico City
  const nightlyAnalysisJob = cron.schedule('0 0 * * *', async () => {
    try {
      const { nightlyPatternAnalysis } = await import('./sales-learning-engine.js');
      await nightlyPatternAnalysis();
    } catch (err) {
      console.error('🧠 Nightly analysis cron error:', err.message);
    }
  }, {
    timezone: 'America/Mexico_City',
    scheduled: true
  });
  scheduledJobs.push(nightlyAnalysisJob);
  console.log('  ✅ Nightly sales analysis: 12:00 AM (Mexico City)');

  console.log('📋 Designer scheduler initialized (6 jobs)');
}

/**
 * Stop all scheduled designer tracking jobs.
 */
export function stopDesignerScheduler() {
  for (const job of scheduledJobs) {
    job.stop();
  }
  scheduledJobs = [];
  console.log('📋 Designer scheduler stopped');
}
