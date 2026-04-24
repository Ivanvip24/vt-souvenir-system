/**
 * Migration: Add per-chat AI toggle to WhatsApp conversations
 *
 * Adds ai_enabled BOOLEAN column (default true) so admins can
 * disable AI auto-replies for individual conversations.
 */

import { query } from '../shared/database.js';

async function migrate() {
  console.log('🤖 Starting WhatsApp AI toggle migration...');

  try {
    await query(`
      ALTER TABLE whatsapp_conversations
      ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT true
    `);
    console.log('✅ Added ai_enabled column to whatsapp_conversations');

    console.log('🎉 WhatsApp AI toggle migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}

// Run migration
migrate()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
