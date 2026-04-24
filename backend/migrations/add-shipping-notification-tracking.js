/**
 * Migration: Add notification tracking columns to shipping_labels
 *
 * Adds notification_sent and notification_sent_at so the scheduler
 * knows which clients have already been notified about their shipment.
 *
 * Run with: node backend/migrations/add-shipping-notification-tracking.js
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
    console.log('Starting migration: Add shipping notification tracking...\n');

    await client.query('BEGIN');

    // 1. Add notification_sent column
    console.log('1. Adding notification_sent column...');
    await client.query(`
      ALTER TABLE shipping_labels
      ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT false
    `);
    console.log('   Done.');

    // 2. Add notification_sent_at column
    console.log('2. Adding notification_sent_at column...');
    await client.query(`
      ALTER TABLE shipping_labels
      ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMP
    `);
    console.log('   Done.');

    await client.query('COMMIT');
    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
