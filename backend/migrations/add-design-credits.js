import { query, closePool } from '../shared/database.js';

async function runMigration() {
  console.log('🔄 Running Design Credits migration...');

  try {
    // 1. Add credits_balance column to design_subscribers
    await query(`
      ALTER TABLE design_subscribers
      ADD COLUMN IF NOT EXISTS credits_balance INTEGER DEFAULT 0;
    `);
    console.log('✅ Added credits_balance column to design_subscribers');

    // 2. Create credit_purchases table
    await query(`
      CREATE TABLE IF NOT EXISTS credit_purchases (
        id SERIAL PRIMARY KEY,
        subscriber_id INTEGER REFERENCES design_subscribers(id) ON DELETE SET NULL,
        credits INTEGER NOT NULL,
        amount_mxn NUMERIC(10,2) NOT NULL,
        pack_key VARCHAR(50) NOT NULL,
        stripe_session_id VARCHAR(255),
        stripe_payment_intent VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ Created credit_purchases table');

    await query(`CREATE INDEX IF NOT EXISTS idx_credit_purchases_subscriber ON credit_purchases(subscriber_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_credit_purchases_stripe ON credit_purchases(stripe_session_id)`);
    console.log('✅ Created indexes on credit_purchases');

    // 3. Add credits_spent to download log
    await query(`
      ALTER TABLE design_download_log
      ADD COLUMN IF NOT EXISTS credits_spent INTEGER DEFAULT 1;
    `);
    console.log('✅ Added credits_spent column to design_download_log');

    console.log('\n✅ Design Credits migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await closePool();
  }
}

runMigration().catch(console.error);
