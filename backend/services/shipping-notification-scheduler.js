/**
 * Shipping Notification Scheduler
 * Polls Skydropx for status updates on active shipping labels.
 * When a shipment transitions to IN_TRANSIT (carrier has the package),
 * sends a branded notification email to the client.
 */

import cron from 'node-cron';
import { query } from '../shared/database.js';
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
    console.log('⚠️  Shipping notification scheduler already running');
    return;
  }

  console.log('📬 Initializing shipping notification scheduler...');
  console.log(`   Schedule: ${DEFAULT_SCHEDULE} (Mexico City time)`);

  scheduledJob = cron.schedule(DEFAULT_SCHEDULE, async () => {
    console.log('\n📬 ========== SHIPPING NOTIFICATION CHECK ==========');
    console.log(`   Time: ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}`);

    try {
      const result = await checkAndNotify();
      console.log(`   Checked: ${result.checked} labels`);
      console.log(`   Notified: ${result.notified} clients`);
      console.log(`   Errors: ${result.errors}`);
    } catch (error) {
      console.error('❌ Shipping notification scheduler error:', error.message);
    }

    console.log('📬 ================================================\n');
  }, {
    timezone: 'America/Mexico_City'
  });

  console.log('✅ Shipping notification scheduler initialized');
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
  // 2. Haven't been notified yet
  // 3. Are in a pre-transit status (label_generated, pending, processing)
  const { rows: labels } = await query(`
    SELECT
      sl.id, sl.shipment_id, sl.tracking_number, sl.tracking_url,
      sl.carrier, sl.service, sl.delivery_days, sl.status,
      sl.order_id, sl.created_at,
      o.order_number,
      c.name AS client_name, c.email AS client_email
    FROM shipping_labels sl
    LEFT JOIN orders o ON sl.order_id = o.id
    LEFT JOIN clients c ON sl.client_id = c.id
    WHERE sl.shipment_id IS NOT NULL
      AND sl.status NOT IN ('shipped', 'delivered', 'cancelled')
      AND (sl.notification_sent IS NULL OR sl.notification_sent = false)
    ORDER BY sl.created_at ASC
  `);

  if (labels.length === 0) {
    console.log('   No pending labels to check');
    return { checked: 0, notified: 0, errors: 0 };
  }

  console.log(`   Found ${labels.length} labels to check...`);

  for (const label of labels) {
    checked++;

    try {
      // Small delay between API calls to avoid rate limiting
      if (checked > 1) await sleep(500);

      const shipment = await getShipment(label.shipment_id);
      const status = (shipment.status || '').toUpperCase().replace(/\s+/g, '_');

      console.log(`   [${label.tracking_number}] Skydropx status: ${status}`);

      // Check if carrier has the package
      const isInTransit = ['IN_TRANSIT', 'PICKED_UP', 'ON_THE_WAY', 'TRANSIT'].includes(status);

      if (isInTransit) {
        // Update local status to 'shipped'
        await query(`
          UPDATE shipping_labels
          SET status = 'shipped', shipped_at = NOW()
          WHERE id = $1
        `, [label.id]);

        // Send notification email if client has email
        if (label.client_email) {
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

            console.log(`   ✅ Notification sent to ${label.client_email}`);
            notified++;
          } catch (emailError) {
            console.error(`   ❌ Email failed for ${label.client_email}:`, emailError.message);
            errors++;
          }
        } else {
          console.log(`   ⚠️  No email for order ${label.order_number}, skipping notification`);
        }

        // Mark as notified regardless (so we don't retry failed emails forever)
        await query(`
          UPDATE shipping_labels
          SET notification_sent = true, notification_sent_at = NOW()
          WHERE id = $1
        `, [label.id]);

      } else if (['DELIVERED', 'ENTREGADO'].includes(status)) {
        // Already delivered — update status and mark notified (skip email since it's already there)
        await query(`
          UPDATE shipping_labels
          SET status = 'delivered', delivered_at = NOW(), notification_sent = true, notification_sent_at = NOW()
          WHERE id = $1
        `, [label.id]);
        console.log(`   📦 Already delivered, updated status`);

      } else if (['CANCELED', 'CANCELLED', 'VOIDED', 'REFUNDED', 'EXPIRED'].includes(status)) {
        // Cancelled — update status, no notification needed
        await query(`
          UPDATE shipping_labels
          SET status = 'cancelled', notification_sent = true, notification_sent_at = NOW()
          WHERE id = $1
        `, [label.id]);
        console.log(`   🚫 Cancelled, updated status`);
      }
      // If still LABEL_CREATED or similar, do nothing — check again next cycle

    } catch (error) {
      console.error(`   ❌ Error checking label ${label.id}:`, error.message);
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
    console.log('🛑 Shipping notification scheduler stopped');
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
  console.log('📬 Manual shipping notification check triggered...');
  return await checkAndNotify();
}

export default {
  initializeShippingNotificationScheduler,
  stopShippingNotificationScheduler,
  isSchedulerRunning,
  triggerManualCheck
};
