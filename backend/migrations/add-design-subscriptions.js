import { query, closePool } from '../shared/database.js';

async function runMigration() {
  console.log('🔄 Running Design Subscriptions migration...');

  try {
    // 1. Add is_public column to design_gallery
    await query(`
      ALTER TABLE design_gallery
      ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;
    `);
    console.log('✅ Added is_public column to design_gallery');

    await query(`
      CREATE INDEX IF NOT EXISTS idx_design_gallery_public ON design_gallery(is_public);
    `);
    console.log('✅ Created index on is_public');

    // 2. Create design_subscribers table
    await query(`
      CREATE TABLE IF NOT EXISTS design_subscribers (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        subscription_status VARCHAR(50) DEFAULT 'free',
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ Created design_subscribers table');

    await query(`
      CREATE INDEX IF NOT EXISTS idx_design_subscribers_email ON design_subscribers(email);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_design_subscribers_stripe ON design_subscribers(stripe_customer_id);
    `);
    console.log('✅ Created indexes on design_subscribers');

    // 3. Create design_download_log table
    await query(`
      CREATE TABLE IF NOT EXISTS design_download_log (
        id SERIAL PRIMARY KEY,
        subscriber_id INTEGER REFERENCES design_subscribers(id) ON DELETE SET NULL,
        design_id INTEGER REFERENCES design_gallery(id) ON DELETE SET NULL,
        downloaded_at TIMESTAMPTZ DEFAULT NOW(),
        ip_address VARCHAR(45)
      );
    `);
    console.log('✅ Created design_download_log table');

    await query(`
      CREATE INDEX IF NOT EXISTS idx_download_log_subscriber ON design_download_log(subscriber_id);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_download_log_design ON design_download_log(design_id);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_download_log_date ON design_download_log(downloaded_at);
    `);
    console.log('✅ Created indexes on design_download_log');

    console.log('\n✅ Design Subscriptions migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await closePool();
  }
}

runMigration().catch(console.error);
