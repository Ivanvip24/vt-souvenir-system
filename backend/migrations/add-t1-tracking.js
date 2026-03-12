/**
 * Migration: Add carrier_source to shipping_labels for T1 Envíos integration
 *
 * Adds carrier_source column to distinguish T1-generated labels from Skydropx ones.
 * Also adds a UNIQUE constraint on tracking_number for ON CONFLICT support.
 *
 * Run with: node backend/migrations/add-t1-tracking.js
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com') ? { rejectUnauthorized: false } : false
});

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('🚀 Starting migration: Add T1 Envíos tracking support...\n');

    await client.query('BEGIN');

    // 1. Add carrier_source column
    console.log('1. Adding carrier_source column...');
    await client.query(`
      ALTER TABLE shipping_labels
      ADD COLUMN IF NOT EXISTS carrier_source VARCHAR(20) DEFAULT 'skydropx'
    `);
    console.log('   ✅ carrier_source column added (default: skydropx)');

    // 2. Add UNIQUE constraint on tracking_number for ON CONFLICT support
    console.log('\n2. Adding UNIQUE constraint on tracking_number...');
    await client.query(`
      ALTER TABLE shipping_labels
      ADD CONSTRAINT shipping_labels_tracking_number_unique
      UNIQUE (tracking_number)
    `);
    console.log('   ✅ UNIQUE constraint added');

    // 3. Add index on carrier_source for filtering
    console.log('\n3. Adding index on carrier_source...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_shipping_labels_carrier_source
      ON shipping_labels(carrier_source)
    `);
    console.log('   ✅ Index created');

    await client.query('COMMIT');

    console.log('\n✅ Migration completed successfully!');
    console.log('   - carrier_source column added (skydropx | t1)');
    console.log('   - tracking_number is now UNIQUE');
    console.log('   - Index on carrier_source created');

  } catch (error) {
    await client.query('ROLLBACK');
    if (error.message.includes('already exists')) {
      console.log('⚠️  Migration already applied (constraint/column already exists)');
    } else {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
