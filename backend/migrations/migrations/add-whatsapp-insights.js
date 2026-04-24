/**
 * Migration: Add WhatsApp conversation insights caching columns
 *
 * Adds insights_data (JSONB), insights_generated_at, and insights_message_count
 * to whatsapp_conversations for caching AI-generated conversation analysis.
 */

import { query } from '../shared/database.js';

async function migrate() {
  console.log('🔍 Starting WhatsApp insights migration...');

  try {
    await query(`
      ALTER TABLE whatsapp_conversations
      ADD COLUMN IF NOT EXISTS insights_data JSONB,
      ADD COLUMN IF NOT EXISTS insights_generated_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS insights_message_count INTEGER DEFAULT 0
    `);
    console.log('✅ Added insights columns to whatsapp_conversations');

    console.log('🎉 WhatsApp insights migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}

// Run migration
migrate()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
