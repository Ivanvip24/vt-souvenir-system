import { query } from '../shared/database.js';

/**
 * Migration: Add receipt_path column to orders table
 * Stores the file path to the generated PDF receipt
 */
export async function up() {
  console.log('Adding receipt_path column to orders table...');

  await query(`
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS receipt_path VARCHAR(500)
  `);

  console.log('✅ receipt_path column added successfully');
}

export async function down() {
  console.log('Removing receipt_path column from orders table...');

  await query(`
    ALTER TABLE orders
    DROP COLUMN IF EXISTS receipt_path
  `);

  console.log('✅ receipt_path column removed');
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
