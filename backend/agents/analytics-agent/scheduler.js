import cron from 'node-cron';
import { config } from 'dotenv';
import * as reportGenerator from './report-generator.js';
import * as emailSender from './email-sender.js';

config();

const scheduledJobs = new Map();

/**
 * Initialize all scheduled report jobs
 */
export function initializeScheduler() {
  console.log('🕐 Initializing report scheduler...\n');

  // Initialize email sender
  emailSender.initializeEmailSender();

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

  console.log(`\n✅ Scheduler initialized with ${scheduledJobs.size} jobs\n`);

  // List all scheduled jobs
  listScheduledJobs();
}

/**
 * Schedule daily report
 * @param {string} cronExpression - Cron expression (default: 8:00 AM every day)
 */
export function scheduleDailyReport(cronExpression = '0 8 * * *') {
  try {
    const job = cron.schedule(cronExpression, async () => {
      console.log('📊 Running scheduled daily report...');

      try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const report = await reportGenerator.generateDailyReport(yesterday);
        await emailSender.sendDailyReport(report.html, yesterday);

        console.log('✅ Daily report sent successfully');
      } catch (error) {
        console.error('❌ Error in daily report job:', error);
      }
    });

    scheduledJobs.set('daily-report', {
      name: 'Daily Report',
      schedule: cronExpression,
      description: 'Sends daily revenue and order report',
      job
    });

    console.log(`✓ Daily report scheduled: ${cronExpression}`);
    console.log(`  Next run: ${getNextRunTime(cronExpression)}`);

  } catch (error) {
    console.error('❌ Error scheduling daily report:', error);
  }
}

/**
 * Schedule weekly report
 * @param {string} cronExpression - Cron expression (default: 9:00 AM every Monday)
 */
export function scheduleWeeklyReport(cronExpression = '0 9 * * 1') {
  try {
    const job = cron.schedule(cronExpression, async () => {
      console.log('📊 Running scheduled weekly report...');

      try {
        const report = await reportGenerator.generateWeeklyReport();
        await emailSender.sendWeeklyReport(report.html);

        console.log('✅ Weekly report sent successfully');
      } catch (error) {
        console.error('❌ Error in weekly report job:', error);
      }
    });

    scheduledJobs.set('weekly-report', {
      name: 'Weekly Report',
      schedule: cronExpression,
      description: 'Sends weekly revenue and performance report',
      job
    });

    console.log(`✓ Weekly report scheduled: ${cronExpression}`);
    console.log(`  Next run: ${getNextRunTime(cronExpression)}`);

  } catch (error) {
    console.error('❌ Error scheduling weekly report:', error);
  }
}

/**
 * Schedule monthly report
 * @param {string} cronExpression - Cron expression (default: 10:00 AM on 1st of month)
 */
export function scheduleMonthlyReport(cronExpression = '0 10 1 * *') {
  try {
    const job = cron.schedule(cronExpression, async () => {
      console.log('📊 Running scheduled monthly report...');

      try {
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);

        const year = lastMonth.getFullYear();
        const month = lastMonth.getMonth() + 1;

        const report = await reportGenerator.generateMonthlyReport(year, month);
        await emailSender.sendMonthlyReport(report.html, year, month);

        console.log('✅ Monthly report sent successfully');
      } catch (error) {
        console.error('❌ Error in monthly report job:', error);
      }
    });

    scheduledJobs.set('monthly-report', {
      name: 'Monthly Report',
      schedule: cronExpression,
      description: 'Sends comprehensive monthly analytics report',
      job
    });

    console.log(`✓ Monthly report scheduled: ${cronExpression}`);
    console.log(`  Next run: ${getNextRunTime(cronExpression)}`);

  } catch (error) {
    console.error('❌ Error scheduling monthly report:', error);
  }
}

/**
 * Manually trigger daily report (for testing)
 */
export async function triggerDailyReport(date = new Date()) {
  console.log('🚀 Manually triggering daily report...');

  try {
    const report = await reportGenerator.generateDailyReport(date);
    const result = await emailSender.sendDailyReport(report.html, date);

    console.log('✅ Daily report sent successfully');
    return result;
  } catch (error) {
    console.error('❌ Error triggering daily report:', error);
    throw error;
  }
}

/**
 * Manually trigger monthly report (for testing)
 */
export async function triggerMonthlyReport(year, month) {
  console.log(`🚀 Manually triggering monthly report for ${year}-${month}...`);

  try {
    const report = await reportGenerator.generateMonthlyReport(year, month);
    const result = await emailSender.sendMonthlyReport(report.html, year, month);

    console.log('✅ Monthly report sent successfully');
    return result;
  } catch (error) {
    console.error('❌ Error triggering monthly report:', error);
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
    console.log(`✅ Stopped job: ${jobName}`);
    return true;
  } else {
    console.log(`⚠️  Job not found: ${jobName}`);
    return false;
  }
}

/**
 * Stop all scheduled jobs
 */
export function stopAllJobs() {
  console.log('🛑 Stopping all scheduled jobs...');

  scheduledJobs.forEach((jobInfo, name) => {
    jobInfo.job.stop();
    console.log(`  ✓ Stopped: ${name}`);
  });

  scheduledJobs.clear();
  console.log('✅ All jobs stopped');
}

/**
 * List all scheduled jobs
 */
export function listScheduledJobs() {
  console.log('📋 Scheduled Jobs:');
  console.log('─'.repeat(60));

  if (scheduledJobs.size === 0) {
    console.log('  No jobs scheduled');
    return;
  }

  scheduledJobs.forEach((jobInfo, name) => {
    console.log(`\n  ${jobInfo.name}`);
    console.log(`    Schedule: ${jobInfo.schedule}`);
    console.log(`    Description: ${jobInfo.description}`);
    console.log(`    Next run: ${getNextRunTime(jobInfo.schedule)}`);
  });

  console.log('\n' + '─'.repeat(60));
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
