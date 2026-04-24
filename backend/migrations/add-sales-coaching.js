/**
 * Migration: Sales Coaching Pills System
 *
 * Creates the sales_coaching table for AI-generated coaching suggestions
 * and adds coaching tracking columns to whatsapp_conversations.
 */

import { query } from '../shared/database.js';

export async function migrate() {
  console.log('🔄 Running sales coaching migration...');

  try {
    // =====================================================
    // SALES COACHING TABLE
    // =====================================================
    await query(`
      CREATE TABLE IF NOT EXISTS sales_coaching (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
        coaching_type VARCHAR(30) NOT NULL,
        suggested_message TEXT NOT NULL,
        context TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        followed_at TIMESTAMP,
        message_sent TEXT,
        client_responded BOOLEAN,
        client_responded_at TIMESTAMP,
        resulted_in_order BOOLEAN,
        order_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        expired_at TIMESTAMP
      );
    `);
    console.log('✅ Created sales_coaching table');

    // =====================================================
    // INDEXES
    // =====================================================
    await query(`CREATE INDEX IF NOT EXISTS idx_sales_coaching_conversation ON sales_coaching(conversation_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_sales_coaching_status ON sales_coaching(status);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_sales_coaching_type ON sales_coaching(coaching_type);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_sales_coaching_created ON sales_coaching(created_at);`);
    console.log('✅ Created sales_coaching indexes');

    // =====================================================
    // ADD COLUMNS TO whatsapp_conversations
    // =====================================================
    await query(`
      ALTER TABLE whatsapp_conversations
      ADD COLUMN IF NOT EXISTS last_coached_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS coaching_message_count INTEGER DEFAULT 0;
    `);
    console.log('✅ Added coaching columns to whatsapp_conversations');

    console.log('🎉 Sales coaching migration completed successfully!');
  } catch (error) {
    console.error('❌ Sales coaching migration failed:', error.message);
    throw error;
  }
}

const isDirectRun = process.argv[1]?.includes('add-sales-coaching');
if (isDirectRun) {
  const { closePool } = await import('../shared/database.js');
  migrate().then(() => closePool()).catch(e => { console.error(e); process.exit(1); });
}
