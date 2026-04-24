import { query } from '../shared/database.js';

export async function migrate() {
  // Add reengagement_at column for 23hr follow-up timer
  await query(`
    ALTER TABLE whatsapp_conversations
    ADD COLUMN IF NOT EXISTS reengagement_at TIMESTAMP
  `);

  // Index for scheduler queries
  await query(`
    CREATE INDEX IF NOT EXISTS idx_wa_conv_reengagement
    ON whatsapp_conversations(reengagement_at)
    WHERE reengagement_at IS NOT NULL
  `);

  console.log('✅ Reengagement timer column ready');
}
