/**
 * Pickup Scheduler Service
 * Automatically requests daily pickups for generated shipping labels
 */

import cron from 'node-cron';
import { requestDailyPickup, getPendingShipmentsForPickup } from './skydropx.js';
import { log, logError } from '../shared/logger.js';

let scheduledJob = null;

// Default schedule: 5:00 PM Mexico City time (17:00)
const DEFAULT_PICKUP_SCHEDULE = process.env.PICKUP_SCHEDULE || '0 17 * * 1-6'; // Monday to Saturday at 5 PM

/**
 * Initialize the pickup scheduler
 */
export function initializePickupScheduler() {
  if (scheduledJob) {
    log('warn', 'pickup.scheduler.already_running');
    return;
  }

  log('info', 'pickup.scheduler.init');
  log('info', 'pickup.scheduler.schedule', { cron: DEFAULT_PICKUP_SCHEDULE, tz: 'America/Mexico_City' });

  scheduledJob = cron.schedule(DEFAULT_PICKUP_SCHEDULE, async () => {
    log('info', 'pickup.run.start');

    try {
      // For scheduled runs, only pick up today's labels
      const result = await requestDailyPickup({ todayOnly: true });

      if (result.success && result.shipment_count > 0) {
        log('info', 'pickup.run.success', { pickupId: result.pickup_id, date: result.pickup_date, shipments: result.shipment_count });
      } else if (result.shipment_count === 0) {
        log('info', 'pickup.run.none');
      } else {
        log('error', 'pickup.run.fail', { error: result.error });
      }
    } catch (error) {
      logError('pickup.run.error', error);
    }

    log('info', 'pickup.run.end');
  }, {
    timezone: 'America/Mexico_City'
  });

  log('info', 'pickup.scheduler.ready');
}

/**
 * Stop the pickup scheduler
 */
export function stopPickupScheduler() {
  if (scheduledJob) {
    scheduledJob.stop();
    scheduledJob = null;
    log('info', 'pickup.scheduler.stopped');
  }
}

/**
 * Check if scheduler is running
 */
export function isSchedulerRunning() {
  return scheduledJob !== null;
}

/**
 * Get scheduler status
 */
export async function getSchedulerStatus() {
  const pendingShipments = await getPendingShipmentsForPickup();

  return {
    running: isSchedulerRunning(),
    schedule: DEFAULT_PICKUP_SCHEDULE,
    timezone: 'America/Mexico_City',
    nextRun: getNextRunTime(),
    pendingShipments: pendingShipments.length,
    shipments: pendingShipments.map(s => ({
      orderNumber: s.order_number,
      trackingNumber: s.tracking_number,
      carrier: s.carrier,
      createdAt: s.created_at
    }))
  };
}

/**
 * Calculate next run time
 */
function getNextRunTime() {
  if (!scheduledJob) return null;

  // Parse cron expression to estimate next run
  const now = new Date();
  const parts = DEFAULT_PICKUP_SCHEDULE.split(' ');
  const hour = parseInt(parts[1]) || 17;
  const minute = parseInt(parts[0]) || 0;

  const next = new Date();
  next.setHours(hour, minute, 0, 0);

  // If already past today's time, schedule for tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  // Skip Sunday if schedule is Mon-Sat
  if (parts[4] === '1-6' && next.getDay() === 0) {
    next.setDate(next.getDate() + 1);
  }

  return next.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
}

/**
 * Manually trigger a pickup request (for testing or manual override)
 */
export async function triggerManualPickup(options = {}) {
  log('info', 'pickup.manual.trigger');
  return await requestDailyPickup(options);
}

export default {
  initializePickupScheduler,
  stopPickupScheduler,
  isSchedulerRunning,
  getSchedulerStatus,
  triggerManualPickup
};
