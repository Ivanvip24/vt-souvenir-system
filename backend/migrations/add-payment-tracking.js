import { query, closePool } from '../shared/database.js';

async function runMigration() {
  console.log('🔄 Running payment tracking migration...');

  try {
    // Add new columns
    await query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS actual_deposit_amount DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS receipt_pdf_url TEXT,
      ADD COLUMN IF NOT EXISTS second_payment_proof_url TEXT,
      ADD COLUMN IF NOT EXISTS second_payment_received BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS second_payment_date TIMESTAMP;
    `);

    console.log('✅ Added new columns');

    // Add index
    await query(`
      CREATE INDEX IF NOT EXISTS idx_orders_second_payment ON orders(second_payment_received);
    `);

    console.log('✅ Added index');

    // Verify
    const result = await query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'orders'
      AND column_name IN ('actual_deposit_amount', 'receipt_pdf_url', 'second_payment_proof_url', 'second_payment_received', 'second_payment_date')
      ORDER BY column_name;
    `);

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📊 New columns added:');
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
