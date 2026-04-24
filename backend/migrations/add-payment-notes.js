import { query, closePool } from '../shared/database.js';

async function runMigration() {
  console.log('🔄 Running payment notes migration...');

  try {
    await query(`
      CREATE TABLE IF NOT EXISTS payment_notes (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        data JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(client_id)
      );
    `);
    console.log('✅ Created payment_notes table');

    await query(`
      CREATE INDEX IF NOT EXISTS idx_payment_notes_client_id ON payment_notes(client_id);
    `);
    console.log('✅ Created index on client_id');

    console.log('✅ Payment notes migration completed!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await closePool();
  }
}

runMigration();
