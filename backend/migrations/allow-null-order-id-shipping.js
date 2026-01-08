/**
 * Migration: Allow NULL order_id in shipping_labels
 *
 * This allows creating shipping labels for clients without an associated order.
 *
 * Run with: node backend/migrations/allow-null-order-id-shipping.js
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
    console.log('🚀 Starting migration: Allow NULL order_id in shipping_labels...\n');

    await client.query('BEGIN');

    // Drop the NOT NULL constraint on order_id
    console.log('1. Dropping NOT NULL constraint on order_id...');
    await client.query(`
      ALTER TABLE shipping_labels
      ALTER COLUMN order_id DROP NOT NULL
    `);
    console.log('   ✅ order_id is now nullable');

    // Add an index for client_id to improve query performance
    console.log('\n2. Adding index on client_id...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_shipping_labels_client_id
      ON shipping_labels(client_id)
    `);
    console.log('   ✅ Index created');

    await client.query('COMMIT');

    console.log('\n✅ Migration completed successfully!');
    console.log('   - shipping_labels.order_id can now be NULL');
    console.log('   - Client-only shipping labels are now supported');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
