/**
 * Migration: Add store pickup option to orders
 *
 * Adds is_store_pickup column to orders table.
 * When true, shipping is $0 and shipping processes (labels, guides, pickups) are skipped.
 */

import { query } from '../shared/database.js';

async function migrate() {
  console.log('🏪 Starting store pickup migration...');

  try {
    // Add is_store_pickup column to orders table
    await query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS is_store_pickup BOOLEAN DEFAULT FALSE
    `);
    console.log('✅ Added is_store_pickup column to orders table');

    // Create index for quick lookups
    await query(`
      CREATE INDEX IF NOT EXISTS idx_orders_store_pickup
      ON orders(is_store_pickup)
      WHERE is_store_pickup = TRUE
    `);
    console.log('✅ Created index for store pickup orders');

    console.log('🎉 Store pickup migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}

// Run migration
migrate()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
