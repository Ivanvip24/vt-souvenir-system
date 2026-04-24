/**
 * Migration: Add t1_client_name and t1_shipping_cost to shipping_labels
 *
 * T1-synced labels don't have a client_id (no matching AXKAN client),
 * so we store the client name and cost scraped from T1's dashboard directly.
 *
 * Run with: node backend/migrations/add-t1-extra-fields.js
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
    console.log('Starting migration: Add T1 extra fields...\n');

    await client.query('BEGIN');

    console.log('1. Adding t1_client_name column...');
    await client.query(`
      ALTER TABLE shipping_labels
      ADD COLUMN IF NOT EXISTS t1_client_name VARCHAR(255)
    `);
    console.log('   Done');

    console.log('2. Adding t1_shipping_cost column...');
    await client.query(`
      ALTER TABLE shipping_labels
      ADD COLUMN IF NOT EXISTS t1_shipping_cost DECIMAL(10,2)
    `);
    console.log('   Done');

    await client.query('COMMIT');
    console.log('\nMigration completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    if (error.message.includes('already exists')) {
      console.log('Migration already applied');
    } else {
      console.error('Migration failed:', error.message);
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
