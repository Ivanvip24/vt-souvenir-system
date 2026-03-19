import cron from 'node-cron';
import { query } from '../shared/database.js';
import { sendWhatsAppMessage } from './whatsapp-api.js';
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
      WHERE dt.status = 'pending'
        AND dt.created_at::date = CURRENT_DATE
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

      const taskList = designer.tasks.map(t => `- ${t}`).join('\n');
      const message = `Hola ${designer.name}, tienes ${designer.tasks.length} tarea(s) pendiente(s):\n${taskList}\n\u00bfYa terminaste alguna? Responde 'listo [tarea]' o 'listo todas'`;

      try {
        await sendWhatsAppMessage(designer.phone, message);
        console.log(`📋 Follow-up sent to ${designer.name} (${designer.tasks.length} tasks)`);
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
    const { pdfUrl, filename } = await generateDailyReport(summary);

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
    const { pdfUrl, filename } = await generateWeeklyReport(summary, insights);

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
 * Initialize all designer tracking cron jobs.
 */
export function initializeDesignerScheduler() {
  console.log('📋 Initializing Designer Task Tracking Scheduler...');

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

  console.log('📋 Designer scheduler initialized (3 jobs)');
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
