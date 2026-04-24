import { query } from '../shared/database.js';

export async function migrate() {
  console.log('🔄 Running sales learnings migration...');
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS sales_learnings (
          id SERIAL PRIMARY KEY,
          type VARCHAR(30) NOT NULL,
          category VARCHAR(30),
          insight TEXT NOT NULL,
          evidence TEXT,
          source_conversation_id INTEGER,
          source_order_id INTEGER,
          confidence VARCHAR(10) DEFAULT 'medium',
          auto_adjustable BOOLEAN DEFAULT true,
          applied BOOLEAN DEFAULT false,
          approved BOOLEAN,
          times_validated INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_sales_learnings_type ON sales_learnings(type)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_sales_learnings_applied ON sales_learnings(applied)`);

    await query(`
      CREATE TABLE IF NOT EXISTS bot_adjustments (
          id SERIAL PRIMARY KEY,
          learning_id INTEGER REFERENCES sales_learnings(id),
          adjustment_type VARCHAR(30),
          old_behavior TEXT,
          new_behavior TEXT,
          auto_applied BOOLEAN DEFAULT false,
          approved_by VARCHAR(50),
          reverted BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('🎉 Sales learnings migration completed successfully!');
  } catch (error) {
    console.error('❌ Sales learnings migration failed:', error.message);
    throw error;
  }
}

const isDirectRun = process.argv[1]?.includes('add-sales-learnings');
if (isDirectRun) {
  const { closePool } = await import('../shared/database.js');
  migrate().then(() => closePool()).catch(e => { console.error(e); process.exit(1); });
}
