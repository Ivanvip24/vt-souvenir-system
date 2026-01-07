/**
 * Facebook Marketplace Scheduler
 *
 * Runs the Facebook upload process daily at 9 AM
 */

import cron from 'node-cron';
import facebookMarketplace from './facebook-marketplace.js';
import { query } from '../shared/database.js';

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

    console.log('✅ Facebook Marketplace table ready');
  } catch (error) {
    console.warn('⚠️ Could not ensure facebook_listings table:', error.message);
  }
}

/**
 * Initialize the Facebook Marketplace scheduler
 * Runs daily at 9:00 AM Mexico City time
 */
export async function initFacebookScheduler() {
  console.log('📅 Initializing Facebook Marketplace scheduler...');

  // Ensure table exists
  await ensureTableExists();

  // Schedule for 9:00 AM every day
  // Cron format: minute hour day month weekday
  scheduledJob = cron.schedule('0 9 * * *', async () => {
    console.log('⏰ Facebook Marketplace scheduled job starting...');
    console.log(`   Time: ${new Date().toISOString()}`);

    try {
      const result = await facebookMarketplace.runFullUploadProcess();

      if (result.success) {
        console.log(`✅ Scheduled upload complete: ${result.uploaded} listings uploaded`);
      } else {
        console.error('❌ Scheduled upload failed:', result.error);
      }
    } catch (error) {
      console.error('❌ Scheduled job error:', error.message);
    }
  }, {
    scheduled: true,
    timezone: 'America/Mexico_City'
  });

  console.log('✅ Facebook Marketplace scheduler initialized');
  console.log('   Schedule: Daily at 9:00 AM (Mexico City time)');

  return scheduledJob;
}

/**
 * Stop the scheduler
 */
export function stopFacebookScheduler() {
  if (scheduledJob) {
    scheduledJob.stop();
    console.log('🛑 Facebook Marketplace scheduler stopped');
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
  console.log('🔧 Manual Facebook upload triggered...');
  return await facebookMarketplace.runFullUploadProcess();
}

export default {
  initFacebookScheduler,
  stopFacebookScheduler,
  getSchedulerStatus,
  triggerManualUpload
};
