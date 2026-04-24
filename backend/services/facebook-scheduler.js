/**
 * Facebook Marketplace Scheduler
 *
 * Runs the Facebook upload process daily at 9 AM
 */

import cron from 'node-cron';
import facebookMarketplace from './facebook-marketplace.js';
import { query } from '../shared/database.js';
import { log, logError } from '../shared/logger.js';

let scheduledJob = null;

/**
 * Ensure the facebook_listings table exists
 */
async function ensureTableExists() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS facebook_listings (
        id SERIAL PRIMARY KEY,
        order_id INTEGER,
        order_item_id INTEGER,
        image_url TEXT NOT NULL,
        facebook_listing_id TEXT,
        listing_title TEXT NOT NULL,
        listing_price DECIMAL(10,2) DEFAULT 11.00,
        listing_status VARCHAR(50) DEFAULT 'pending',
        uploaded_at TIMESTAMP,
        last_refreshed_at TIMESTAMP,
        upload_attempts INTEGER DEFAULT 0,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(image_url)
      )
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_facebook_listings_status
      ON facebook_listings(listing_status)
    `);

    log('info', 'facebook.table.ready');
  } catch (error) {
    logError('facebook.table.error', error);
  }
}

/**
 * Initialize the Facebook Marketplace scheduler
 * Runs daily at 9:00 AM Mexico City time
 */
export async function initFacebookScheduler() {
  log('info', 'facebook.scheduler.init');

  // Ensure table exists
  await ensureTableExists();

  // Schedule for 9:00 AM every day
  // Cron format: minute hour day month weekday
  scheduledJob = cron.schedule('0 9 * * *', async () => {
    log('info', 'facebook.job.start');

    try {
      const result = await facebookMarketplace.runFullUploadProcess();

      if (result.success) {
        log('info', 'facebook.job.complete', { uploaded: result.uploaded });
      } else {
        log('error', 'facebook.job.failed', { error: result.error });
      }
    } catch (error) {
      logError('facebook.job.error', error);
    }
  }, {
    scheduled: true,
    timezone: 'America/Mexico_City'
  });

  log('info', 'facebook.scheduler.ready', { schedule: '0 9 * * *' });

  return scheduledJob;
}

/**
 * Stop the scheduler
 */
export function stopFacebookScheduler() {
  if (scheduledJob) {
    scheduledJob.stop();
    log('info', 'facebook.scheduler.stopped');
  }
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus() {
  return {
    active: scheduledJob !== null,
    schedule: '0 9 * * * (Daily at 9:00 AM)',
    timezone: 'America/Mexico_City',
    nextRun: getNextRunTime()
  };
}

/**
 * Calculate next run time
 */
function getNextRunTime() {
  const now = new Date();
  const mexicoTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));

  const next = new Date(mexicoTime);
  next.setHours(9, 0, 0, 0);

  // If it's past 9 AM today, schedule for tomorrow
  if (mexicoTime.getHours() >= 9) {
    next.setDate(next.getDate() + 1);
  }

  return next.toISOString();
}

/**
 * Manually trigger the upload process (for testing)
 */
export async function triggerManualUpload() {
  log('info', 'facebook.manual.trigger');
  return await facebookMarketplace.runFullUploadProcess();
}

export default {
  initFacebookScheduler,
  stopFacebookScheduler,
  getSchedulerStatus,
  triggerManualUpload
};
