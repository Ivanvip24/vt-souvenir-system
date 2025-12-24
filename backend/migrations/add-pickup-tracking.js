import { query, closePool } from '../shared/database.js';

async function runMigration() {
  console.log('🔄 Running pickup tracking migration...');

  try {
    // Add pickup columns to shipping_labels table
    await query(`
      ALTER TABLE shipping_labels
      ADD COLUMN IF NOT EXISTS pickup_id VARCHAR(100),
      ADD COLUMN IF NOT EXISTS pickup_status VARCHAR(50) DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS pickup_date DATE,
      ADD COLUMN IF NOT EXISTS pickup_time_from TIME,
      ADD COLUMN IF NOT EXISTS pickup_time_to TIME,
      ADD COLUMN IF NOT EXISTS pickup_requested_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS pickup_confirmed_at TIMESTAMP;
    `);

    console.log('✅ Added pickup columns to shipping_labels table');

    // Create pickups table to track daily pickup requests
    await query(`
      CREATE TABLE IF NOT EXISTS pickups (
        id SERIAL PRIMARY KEY,
        pickup_id VARCHAR(100) UNIQUE,
        carrier VARCHAR(50),
        pickup_date DATE NOT NULL,
        pickup_time_from TIME DEFAULT '09:00',
        pickup_time_to TIME DEFAULT '18:00',

        -- Shipment IDs included in this pickup
        shipment_ids TEXT[], -- Array of shipment IDs
        shipment_count INTEGER DEFAULT 0,

        -- Status
        status VARCHAR(50) DEFAULT 'pending',
        -- pending, requested, confirmed, completed, cancelled, scheduled

        -- Response from Skydropx
        response_data JSONB,

        -- Timestamps
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        requested_at TIMESTAMP,
        confirmed_at TIMESTAMP
      );
    `);

    // Add carrier column if it doesn't exist (for existing tables)
    await query(`
      ALTER TABLE pickups ADD COLUMN IF NOT EXISTS carrier VARCHAR(50);
    `);

    console.log('✅ Created pickups table');

    // Create indexes
    await query(`
      CREATE INDEX IF NOT EXISTS idx_shipping_labels_pickup ON shipping_labels(pickup_id);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_shipping_labels_pickup_status ON shipping_labels(pickup_status);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_pickups_date ON pickups(pickup_date);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_pickups_status ON pickups(status);
    `);

    console.log('✅ Created indexes');

    // Verify columns
    const result = await query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'shipping_labels' AND column_name LIKE 'pickup%'
      ORDER BY ordinal_position;
    `);

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📊 New pickup columns in shipping_labels:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await closePool();
  }
}

runMigration();
