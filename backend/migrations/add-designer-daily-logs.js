import { query } from '../shared/database.js';

export async function addDesignerDailyLogs() {
  try {
    console.log('🔄 Creating designer_daily_logs table...');

    await query(`
      CREATE TABLE IF NOT EXISTS designer_daily_logs (
        id SERIAL PRIMARY KEY,
        designer_id INTEGER NOT NULL REFERENCES designers(id),
        log_date DATE NOT NULL DEFAULT CURRENT_DATE,
        designs_completed INTEGER NOT NULL DEFAULT 0,
        armados_completed INTEGER NOT NULL DEFAULT 0,
        corrections_made INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(designer_id, log_date)
      )
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_daily_logs_designer_date
      ON designer_daily_logs(designer_id, log_date DESC)
    `);

    console.log('✅ designer_daily_logs table created');
  } catch (err) {
    console.error('❌ Error creating designer_daily_logs:', err.message);
    throw err;
  }
}
