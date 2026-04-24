import cron from 'node-cron';
import { config } from 'dotenv';
import * as reportGenerator from './report-generator.js';
import * as emailSender from './email-sender.js';
import * as orderAlerts from '../alerts/order-alerts.js';
import { log, logError } from '../../shared/logger.js';

config();

const scheduledJobs = new Map();

/**
 * Initialize all scheduled report jobs
 */
export function initializeScheduler() {
  log('info', 'scheduler.init.start');

  // Initialize email sender
  emailSender.initializeEmailSender();

  // Daily order alerts digest (always enabled if ADMIN_EMAIL is set)
  if (process.env.ADMIN_EMAIL || process.env.EMAIL_USER) {
    scheduleDailyDigest(process.env.DAILY_DIGEST_SCHEDULE || '0 8 * * *');
  }

  // Daily report
  if (process.env.ENABLE_DAILY_REPORTS === 'true') {
    scheduleDailyReport(process.env.DAILY_REPORT_SCHEDULE || '0 8 * * *');
  }

  // Weekly report
  if (process.env.ENABLE_WEEKLY_REPORTS === 'true') {
    scheduleWeeklyReport(process.env.WEEKLY_REPORT_SCHEDULE || '0 9 * * 1');
  }

  // Monthly report
  if (process.env.ENABLE_MONTHLY_REPORTS === 'true') {
    scheduleMonthlyReport(process.env.MONTHLY_REPORT_SCHEDULE || '0 10 1 * *');
  }

  log('info', 'scheduler.init.ok', { jobCount: scheduledJobs.size });

  // List all scheduled jobs
  listScheduledJobs();
}

/**
 * Schedule daily order alerts digest
 * @param {string} cronExpression - Cron expression (default: 8:00 AM every day)
 */
export function scheduleDailyDigest(cronExpression = '0 8 * * *') {
  try {
    const job = cron.schedule(cronExpression, async () => {
      log('info', 'scheduler.dailyDigest.run');

      try {
        const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;

        if (!adminEmail) {
          log('warn', 'scheduler.dailyDigest.noAdminEmail');
          return;
        }

        const digest = await orderAlerts.generateDailyDigestEmail();

        // Only send if there are alerts (or always send for daily visibility)
        const alwaysSend = process.env.DIGEST_ALWAYS_SEND !== 'false';

        if (digest.hasAlerts || alwaysSend) {
          await emailSender.sendEmail({
            to: adminEmail,
            subject: `📋 Resumen Diario: ${digest.summary.criticalCount} críticos, ${digest.summary.warningCount} advertencias`,
            html: digest.html
          });

          log('info', 'scheduler.dailyDigest.sent', { to: adminEmail, critical: digest.summary.criticalCount, warning: digest.summary.warningCount, upcoming: digest.summary.upcomingCount });
        } else {
          log('info', 'scheduler.dailyDigest.noAlerts');
        }

      } catch (error) {
        logError('scheduler.dailyDigest.fail', error);
      }
    });

    scheduledJobs.set('daily-digest', {
      name: 'Daily Order Alerts Digest',
      schedule: cronExpression,
      description: 'Sends daily summary of pending, urgent, and upcoming orders',
      job
    });

    log('info', 'scheduler.dailyDigest.scheduled', { cron: cronExpression, nextRun: getNextRunTime(cronExpression) });

  } catch (error) {
    logError('scheduler.dailyDigest.scheduleFail', error);
  }
}

/**
 * Schedule daily report
 * @param {string} cronExpression - Cron expression (default: 8:00 AM every day)
 */
export function scheduleDailyReport(cronExpression = '0 8 * * *') {
  try {
    const job = cron.schedule(cronExpression, async () => {
      log('info', 'scheduler.dailyReport.run');

      try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const report = await reportGenerator.generateDailyReport(yesterday);
        await emailSender.sendDailyReport(report.html, yesterday);

        log('info', 'scheduler.dailyReport.sent');
      } catch (error) {
        logError('scheduler.dailyReport.fail', error);
      }
    });

    scheduledJobs.set('daily-report', {
      name: 'Daily Report',
      schedule: cronExpression,
      description: 'Sends daily revenue and order report',
      job
    });

    log('info', 'scheduler.dailyReport.scheduled', { cron: cronExpression, nextRun: getNextRunTime(cronExpression) });

  } catch (error) {
    logError('scheduler.dailyReport.scheduleFail', error);
  }
}

/**
 * Schedule weekly report
 * @param {string} cronExpression - Cron expression (default: 9:00 AM every Monday)
 */
export function scheduleWeeklyReport(cronExpression = '0 9 * * 1') {
  try {
    const job = cron.schedule(cronExpression, async () => {
      log('info', 'scheduler.weeklyReport.run');

      try {
        const report = await reportGenerator.generateWeeklyReport();
        await emailSender.sendWeeklyReport(report.html);

        log('info', 'scheduler.weeklyReport.sent');
      } catch (error) {
        logError('scheduler.weeklyReport.fail', error);
      }
    });

    scheduledJobs.set('weekly-report', {
      name: 'Weekly Report',
      schedule: cronExpression,
      description: 'Sends weekly revenue and performance report',
      job
    });

    log('info', 'scheduler.weeklyReport.scheduled', { cron: cronExpression, nextRun: getNextRunTime(cronExpression) });

  } catch (error) {
    logError('scheduler.weeklyReport.scheduleFail', error);
  }
}

/**
 * Schedule monthly report
 * @param {string} cronExpression - Cron expression (default: 10:00 AM on 1st of month)
 */
export function scheduleMonthlyReport(cronExpression = '0 10 1 * *') {
  try {
    const job = cron.schedule(cronExpression, async () => {
      log('info', 'scheduler.monthlyReport.run');

      try {
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);

        const year = lastMonth.getFullYear();
        const month = lastMonth.getMonth() + 1;

        const report = await reportGenerator.generateMonthlyReport(year, month);
        await emailSender.sendMonthlyReport(report.html, year, month);

        log('info', 'scheduler.monthlyReport.sent', { year, month });
      } catch (error) {
        logError('scheduler.monthlyReport.fail', error);
      }
    });

    scheduledJobs.set('monthly-report', {
      name: 'Monthly Report',
      schedule: cronExpression,
      description: 'Sends comprehensive monthly analytics report',
      job
    });

    log('info', 'scheduler.monthlyReport.scheduled', { cron: cronExpression, nextRun: getNextRunTime(cronExpression) });

  } catch (error) {
    logError('scheduler.monthlyReport.scheduleFail', error);
  }
}

/**
 * Manually trigger daily report (for testing)
 */
export async function triggerDailyReport(date = new Date()) {
  log('info', 'scheduler.triggerDailyReport.start');

  try {
    const report = await reportGenerator.generateDailyReport(date);
    const result = await emailSender.sendDailyReport(report.html, date);

    log('info', 'scheduler.triggerDailyReport.ok');
    return result;
  } catch (error) {
    logError('scheduler.triggerDailyReport.fail', error);
    throw error;
  }
}

/**
 * Manually trigger monthly report (for testing)
 */
export async function triggerMonthlyReport(year, month) {
  log('info', 'scheduler.triggerMonthlyReport.start', { year, month });

  try {
    const report = await reportGenerator.generateMonthlyReport(year, month);
    const result = await emailSender.sendMonthlyReport(report.html, year, month);

    log('info', 'scheduler.triggerMonthlyReport.ok', { year, month });
    return result;
  } catch (error) {
    logError('scheduler.triggerMonthlyReport.fail', error);
    throw error;
  }
}

/**
 * Stop a scheduled job
 */
export function stopJob(jobName) {
  const jobInfo = scheduledJobs.get(jobName);

  if (jobInfo) {
    jobInfo.job.stop();
    scheduledJobs.delete(jobName);
    log('info', 'scheduler.stopJob.ok', { job: jobName });
    return true;
  } else {
    log('warn', 'scheduler.stopJob.notFound', { job: jobName });
    return false;
  }
}

/**
 * Stop all scheduled jobs
 */
export function stopAllJobs() {
  log('info', 'scheduler.stopAll.start');

  scheduledJobs.forEach((jobInfo, name) => {
    jobInfo.job.stop();
    log('info', 'scheduler.stopAll.stopped', { job: name });
  });

  scheduledJobs.clear();
  log('info', 'scheduler.stopAll.ok');
}

/**
 * List all scheduled jobs
 */
export function listScheduledJobs() {
  const jobs = [];
  scheduledJobs.forEach((jobInfo, name) => {
    jobs.push({ name: jobInfo.name, schedule: jobInfo.schedule, description: jobInfo.description, nextRun: getNextRunTime(jobInfo.schedule) });
  });
  log('info', 'scheduler.listJobs', { count: jobs.length, jobs });
}

/**
 * Get scheduled jobs info
 */
export function getScheduledJobs() {
  const jobs = [];

  scheduledJobs.forEach((jobInfo, name) => {
    jobs.push({
      id: name,
      name: jobInfo.name,
      schedule: jobInfo.schedule,
      description: jobInfo.description,
      nextRun: getNextRunTime(jobInfo.schedule)
    });
  });

  return jobs;
}

/**
 * Helper function to get next run time from cron expression
 */
function getNextRunTime(cronExpression) {
  try {
    // This is a simple approximation
    // For production, consider using a proper cron parser library
    const now = new Date();
    const parts = cronExpression.split(' ');

    // Parse: minute hour day month weekday
    const minute = parts[0] === '*' ? now.getMinutes() : parseInt(parts[0]);
    const hour = parts[1] === '*' ? now.getHours() : parseInt(parts[1]);

    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);

    // If time has passed today, schedule for tomorrow
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    return next.toLocaleString('es-MX', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: process.env.COMPANY_TIMEZONE || 'America/Mexico_City'
    });
  } catch (error) {
    return 'Unable to calculate';
  }
}

export default {
  initializeScheduler,
  scheduleDailyReport,
  scheduleWeeklyReport,
  scheduleMonthlyReport,
  triggerDailyReport,
  triggerMonthlyReport,
  stopJob,
  stopAllJobs,
  listScheduledJobs,
  getScheduledJobs
};
