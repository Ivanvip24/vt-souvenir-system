import { query } from '../shared/database.js';

export async function addDailyLogDetails() {
  try {
    console.log('🔄 Adding details column to designer_daily_logs...');

    await query(`
      ALTER TABLE designer_daily_logs
      ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '[]'::jsonb
    `);

    console.log('✅ details column added to designer_daily_logs');
  } catch (err) {
    console.error('❌ Error adding details column:', err.message);
    throw err;
  }
}
