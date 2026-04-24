import { config } from 'dotenv';
import { query, closePool } from './shared/database.js';

config(); // Load .env file

async function fixOrdersSchema() {
  try {
    console.log('🔧 Fixing orders table schema...\n');

    // Add missing columns to orders table
    console.log('Adding missing columns to orders table...');

    const alterQueries = [
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS event_type VARCHAR(100)',
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS event_date DATE',
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_notes TEXT',
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(10, 2)',
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_paid BOOLEAN DEFAULT false',
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)',
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_proof_url TEXT',
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_id TEXT',
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS approval_status VARCHAR(50) DEFAULT \'pending_review\'',
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal DECIMAL(10, 2)'
    ];

    for (const q of alterQueries) {
      await query(q);
    }

    console.log('✅ Columns added successfully!\n');

    // Create payments table if it doesn't exist
    console.log('Creating payments table if not exists...');
    await query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        payment_type VARCHAR(50) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        payment_method VARCHAR(50),
        transaction_id VARCHAR(255),
        stripe_payment_intent_id TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        proof_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Payments table ready\n');

    // Create order_files table if it doesn't exist
    console.log('Creating order_files table if not exists...');
    await query(`
      CREATE TABLE IF NOT EXISTS order_files (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        file_type VARCHAR(50) NOT NULL,
        file_url TEXT NOT NULL,
        file_name VARCHAR(255),
        file_size INTEGER,
        mime_type VARCHAR(100),
        uploaded_by VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Order files table ready\n');

    console.log('\n✨ Database schema fixed successfully!');
    console.log('You can now submit orders without errors.');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await closePool();
  }
}

fixOrdersSchema();
