import { query } from '../shared/database.js';

export async function migrate() {
  console.log('Running migration: add-chat-assignment...');

  await query(`
    ALTER TABLE whatsapp_conversations
    ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES employees(id) ON DELETE SET NULL
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_wa_conv_assigned_to
    ON whatsapp_conversations(assigned_to)
  `);

  console.log('✅ Migration complete: added assigned_to to whatsapp_conversations');
}
