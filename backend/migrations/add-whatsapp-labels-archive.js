/**
 * Migration: Add labels, archive, and pin support to WhatsApp conversations
 *
 * - Adds is_archived and is_pinned columns to whatsapp_conversations
 * - Creates whatsapp_labels table for custom labels
 * - Creates whatsapp_conversation_labels junction table
 */

import { query } from '../shared/database.js';

export async function migrate() {
  console.log('🏷️ Starting WhatsApp labels & archive migration...');

  try {
    // Add archive and pin columns
    await query(`
      ALTER TABLE whatsapp_conversations
      ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false
    `);
    console.log('✅ Added is_archived and is_pinned columns to whatsapp_conversations');

    // Create labels table
    await query(`
      CREATE TABLE IF NOT EXISTS whatsapp_labels (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        color VARCHAR(7) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Created whatsapp_labels table');

    // Create junction table
    await query(`
      CREATE TABLE IF NOT EXISTS whatsapp_conversation_labels (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
        label_id INTEGER REFERENCES whatsapp_labels(id) ON DELETE CASCADE,
        UNIQUE(conversation_id, label_id)
      )
    `);
    console.log('✅ Created whatsapp_conversation_labels junction table');

    console.log('🎉 WhatsApp labels & archive migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}

// Allow running standalone
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
