/**
 * Shipping Notification Scheduler
 * Polls Skydropx for status updates on active shipping labels.
 * When a shipment transitions to IN_TRANSIT (carrier has the package),
 * sends a branded notification email to the client.
 */

import cron from 'node-cron';
import { query } from '../shared/database.js';
import { log, logError } from '../shared/logger.js';
import { getShipment } from './skydropx.js';
import { sendShippingNotificationEmail } from '../agents/analytics-agent/email-sender.js';

let scheduledJob = null;

// Check every 4 hours during business hours (9 AM, 1 PM, 5 PM, 9 PM) Monday-Saturday
const DEFAULT_SCHEDULE = process.env.SHIPPING_NOTIFICATION_SCHEDULE || '0 9,13,17,21 * * 1-6';

/**
 * Initialize the shipping notification scheduler
 */
export function initializeShippingNotificationScheduler() {
  if (scheduledJob) {
    log('warn', 'shipping.scheduler.already_running');
    return;
  }

  log('info', 'shipping.scheduler.init', { schedule: DEFAULT_SCHEDULE });

  scheduledJob = cron.schedule(DEFAULT_SCHEDULE, async () => {
    log('info', 'shipping.check.start');

    try {
      const result = await checkAndNotify();
      log('info', 'shipping.check.complete', { checked: result.checked, notified: result.notified, errors: result.errors });
    } catch (error) {
      logError('shipping.scheduler.error', error);
    }

  }, {
    timezone: 'America/Mexico_City'
  });

  log('info', 'shipping.scheduler.ready');
}

/**
 * Check all active shipping labels for status updates and send notifications
 */
async function checkAndNotify() {
  let checked = 0;
  let notified = 0;
  let errors = 0;

  // Get all shipping labels that:
  // 1. Have a shipment_id (were created via Skydropx)
  // 2. Are not yet delivered or cancelled
  // (includes 'shipped' so we can detect DELIVERED transition)
  const { rows: labels } = await query(`
    SELECT
      sl.id, sl.shipment_id, sl.tracking_number, sl.tracking_url,
      sl.carrier, sl.service, sl.delivery_days, sl.status,
      sl.order_id, sl.created_at,
      o.order_number, o.order_date,
      c.name AS client_name, c.email AS client_email
    FROM shipping_labels sl
    LEFT JOIN orders o ON sl.order_id = o.id
    LEFT JOIN clients c ON sl.client_id = c.id
    WHERE sl.shipment_id IS NOT NULL
      AND sl.status NOT IN ('delivered', 'cancelled')
    ORDER BY sl.created_at ASC
  `);

  if (labels.length === 0) {
    log('info', 'shipping.check.none');
    return { checked: 0, notified: 0, errors: 0 };
  }

  log('info', 'shipping.check.found', { count: labels.length });

  for (const label of labels) {
    checked++;

    try {
      // Small delay between API calls to avoid rate limiting
      if (checked > 1) await sleep(500);

      const shipment = await getShipment(label.shipment_id);
      const status = (shipment.status || '').toUpperCase().replace(/\s+/g, '_');

      log('info', 'shipping.label.status', { trackingNumber: label.tracking_number, status });

      // Check if carrier has the package
      const isInTransit = ['IN_TRANSIT', 'PICKED_UP', 'ON_THE_WAY', 'TRANSIT'].includes(status);

      if (isInTransit && label.status !== 'shipped') {
        // Update local status to 'shipped'
        await query(`
          UPDATE shipping_labels
          SET status = 'shipped', shipped_at = NOW()
          WHERE id = $1
        `, [label.id]);

        // Send notification email if client has email and not already notified
        if (label.client_email && !label.notification_sent) {
          try {
            await sendShippingNotificationEmail({
              email: label.client_email,
              clientName: label.client_name || 'Cliente',
              orderNumber: label.order_number || `#${label.order_id}`,
              trackingNumber: shipment.tracking_number || label.tracking_number,
              carrier: label.carrier,
              trackingUrl: shipment.tracking_url || label.tracking_url,
              deliveryDays: label.delivery_days,
              shippedAt: new Date()
            });

            log('info', 'shipping.notification.sent', { email: label.client_email, orderNumber: label.order_number });
            notified++;
          } catch (emailError) {
            logError('shipping.notification.email_error', emailError, { email: label.client_email });
            errors++;
          }
        } else if (!label.client_email) {
          log('warn', 'shipping.notification.no_email', { orderNumber: label.order_number });
        }

        // Mark as notified regardless (so we don't retry failed emails forever)
        await query(`
          UPDATE shipping_labels
          SET notification_sent = true, notification_sent_at = NOW()
          WHERE id = $1
        `, [label.id]);

      } else if (['DELIVERED', 'ENTREGADO'].includes(status)) {
        // Package delivered — update status with timestamp
        await query(`
          UPDATE shipping_labels
          SET status = 'delivered', delivered_at = NOW()
          WHERE id = $1
        `, [label.id]);

        // Log turnaround time
        const turnaroundDays = label.order_date ? Math.round((Date.now() - new Date(label.order_date).getTime()) / (1000 * 60 * 60 * 24)) : null;
        log('info', 'shipping.delivered', { orderNumber: label.order_number, turnaroundDays });

      } else if (['CANCELED', 'CANCELLED', 'VOIDED', 'REFUNDED', 'EXPIRED'].includes(status)) {
        // Cancelled — update status, no notification needed
        await query(`
          UPDATE shipping_labels
          SET status = 'cancelled', notification_sent = true, notification_sent_at = NOW()
          WHERE id = $1
        `, [label.id]);
        log('info', 'shipping.cancelled', { labelId: label.id });
      }
      // If still LABEL_CREATED or similar, do nothing — check again next cycle

    } catch (error) {
      logError('shipping.label.error', error, { labelId: label.id });
      errors++;
    }
  }

  return { checked, notified, errors };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Stop the scheduler
 */
export function stopShippingNotificationScheduler() {
  if (scheduledJob) {
    scheduledJob.stop();
    scheduledJob = null;
    log('info', 'shipping.scheduler.stopped');
  }
}

/**
 * Check if scheduler is running
 */
export function isSchedulerRunning() {
  return scheduledJob !== null;
}

/**
 * Manually trigger a check (for testing)
 */
export async function triggerManualCheck() {
  log('info', 'shipping.manual.trigger');
  return await checkAndNotify();
}

export default {
  initializeShippingNotificationScheduler,
  stopShippingNotificationScheduler,
  isSchedulerRunning,
  triggerManualCheck
};
