/**
 * Trigger pickups for all pending shipping labels
 * Run this to schedule pickups for labels created before the auto-pickup feature
 */

import { query, closePool } from '../shared/database.js';
import * as skydropx from '../services/skydropx.js';

async function triggerPendingPickups() {
  console.log('📦 Triggering pickups for all pending labels...\n');

  try {
    // Get pending labels grouped by carrier
    const labelsResult = await query(`
      SELECT carrier, array_agg(shipment_id) as shipment_ids
      FROM shipping_labels
      WHERE pickup_status = 'pending'
        AND shipment_id IS NOT NULL
        AND carrier IS NOT NULL
      GROUP BY carrier
    `);

    if (labelsResult.rows.length === 0) {
      console.log('✅ No pending labels need pickup');
      return;
    }

    console.log(`Found ${labelsResult.rows.length} carriers with pending labels\n`);

    const results = [];

    // Request pickup for each carrier
    for (const row of labelsResult.rows) {
      const { carrier, shipment_ids } = row;
      console.log(`\n🚚 Processing ${carrier}: ${shipment_ids.length} shipment(s)`);

      try {
        // Request pickup for first shipment (it will create pickup for carrier)
        const result = await skydropx.requestPickupIfNeeded(shipment_ids[0], carrier);

        if (result.success) {
          console.log(`✅ ${carrier}: Pickup ${result.alreadyScheduled ? 'already exists' : 'scheduled'}`);
          console.log(`   Pickup ID: ${result.pickup_id}`);
          console.log(`   Pickup Date: ${result.pickup_date}`);

          // Link remaining shipments to this pickup
          if (shipment_ids.length > 1 && !result.alreadyScheduled) {
            for (let i = 1; i < shipment_ids.length; i++) {
              await query(`
                UPDATE shipping_labels
                SET pickup_id = $1, pickup_status = 'requested', pickup_date = $2
                WHERE shipment_id = $3
              `, [result.pickup_id, result.pickup_date, shipment_ids[i]]);
            }
            console.log(`   Linked ${shipment_ids.length - 1} additional shipments`);
          }

          results.push({
            carrier,
            success: true,
            pickup_id: result.pickup_id,
            pickup_date: result.pickup_date,
            shipment_count: shipment_ids.length
          });
        } else {
          console.log(`❌ ${carrier}: Failed - ${result.error || 'Unknown error'}`);
          results.push({ carrier, success: false, error: result.error });
        }
      } catch (error) {
        console.log(`❌ ${carrier}: Error - ${error.message}`);
        results.push({ carrier, success: false, error: error.message });
      }
    }

    console.log('\n\n========== PICKUP SUMMARY ==========');
    for (const r of results) {
      if (r.success) {
        console.log(`✅ ${r.carrier}: Pickup ${r.pickup_id} for ${r.pickup_date} (${r.shipment_count} shipments)`);
      } else {
        console.log(`❌ ${r.carrier}: ${r.error}`);
      }
    }
    console.log('=====================================\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await closePool();
  }
}

triggerPendingPickups();
