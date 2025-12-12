import { query, closePool } from '../shared/database.js';

async function runMigration() {
  console.log('🔄 Running shipping labels migration...');

  try {
    // Create shipping_labels table
    await query(`
      CREATE TABLE IF NOT EXISTS shipping_labels (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        client_id INTEGER REFERENCES clients(id),

        -- Skydropx IDs
        shipment_id VARCHAR(100),
        quotation_id VARCHAR(100),
        rate_id VARCHAR(100),

        -- Tracking info
        tracking_number VARCHAR(100),
        tracking_url TEXT,
        label_url TEXT,

        -- Carrier info
        carrier VARCHAR(100),
        service VARCHAR(100),
        delivery_days INTEGER,
        shipping_cost DECIMAL(10, 2),

        -- Package info
        package_number INTEGER DEFAULT 1,
        weight DECIMAL(5, 2) DEFAULT 3,
        length INTEGER DEFAULT 30,
        width INTEGER DEFAULT 25,
        height INTEGER DEFAULT 20,

        -- Status
        status VARCHAR(50) DEFAULT 'pending',
        -- pending, processing, label_generated, shipped, delivered, cancelled

        -- Timestamps
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        label_generated_at TIMESTAMP,
        shipped_at TIMESTAMP,
        delivered_at TIMESTAMP
      );
    `);

    console.log('✅ Created shipping_labels table');

    // Create indexes
    await query(`
      CREATE INDEX IF NOT EXISTS idx_shipping_labels_order ON shipping_labels(order_id);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_shipping_labels_client ON shipping_labels(client_id);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_shipping_labels_tracking ON shipping_labels(tracking_number);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_shipping_labels_status ON shipping_labels(status);
    `);

    console.log('✅ Created indexes');

    // Add columns to orders table for shipping summary
    await query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS shipping_labels_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS shipping_ready BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS all_labels_generated BOOLEAN DEFAULT false;
    `);

    console.log('✅ Added shipping columns to orders table');

    // Verify table creation
    const result = await query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'shipping_labels'
      ORDER BY ordinal_position;
    `);

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📊 shipping_labels table columns:');
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
