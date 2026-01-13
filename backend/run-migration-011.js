/**
 * Migration 011: Add production_sheet_url column
 * This migration adds a column to store reference sheet PDFs
 */

import { config } from 'dotenv';
import { query } from './shared/database.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, '.env') });

async function runMigration() {
  console.log('\n🚀 Running Migration 011: Add production_sheet_url column\n');
  console.log('═'.repeat(60));

  try {
    // Add production_sheet_url column to orders table
    console.log('\n📝 Adding production_sheet_url column to orders table...');

    await query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS production_sheet_url TEXT;
    `);

    console.log('✅ Column added successfully!\n');

    // Add comment for documentation
    console.log('📝 Adding column comment...');
    await query(`
      COMMENT ON COLUMN orders.production_sheet_url IS 'Stores the production reference sheet PDF as a base64 data URL';
    `);

    console.log('✅ Comment added successfully!\n');

    console.log('═'.repeat(60));
    console.log('\n✅ Migration 011 completed successfully!\n');

  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('ℹ️  Column already exists, skipping...\n');
    } else {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  }

  process.exit(0);
}

runMigration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
