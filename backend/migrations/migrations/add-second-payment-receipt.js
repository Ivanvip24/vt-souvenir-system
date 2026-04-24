import { query } from '../shared/database.js';

/**
 * Migration: Add second_payment_receipt column to orders table
 * Stores the file path to the second payment receipt uploaded by client
 */
export async function up() {
  console.log('Adding second_payment_receipt column to orders table...');

  await query(`
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS second_payment_receipt VARCHAR(500),
    ADD COLUMN IF NOT EXISTS second_payment_date TIMESTAMP,
    ADD COLUMN IF NOT EXISTS second_payment_status VARCHAR(50) DEFAULT 'pending'
  `);

  console.log('✅ second_payment_receipt columns added successfully');
}

export async function down() {
  console.log('Removing second_payment_receipt columns from orders table...');

  await query(`
    ALTER TABLE orders
    DROP COLUMN IF EXISTS second_payment_receipt,
    DROP COLUMN IF EXISTS second_payment_date,
    DROP COLUMN IF EXISTS second_payment_status
  `);

  console.log('✅ second_payment_receipt columns removed');
}

// Run migration if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await up();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}
