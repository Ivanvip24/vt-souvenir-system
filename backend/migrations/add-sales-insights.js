import { query } from '../shared/database.js';

export async function migrate() {
  console.log('🔄 Running sales insights migration...');
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS sales_insights (
        id SERIAL PRIMARY KEY,
        batch_id VARCHAR(30) NOT NULL,
        category VARCHAR(20) NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        evidence JSONB DEFAULT '{}',
        confidence VARCHAR(10) DEFAULT 'medium',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_sales_insights_batch ON sales_insights(batch_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_sales_insights_created ON sales_insights(created_at DESC)`);
    console.log('✅ Sales insights table ready');
  } catch (error) {
    console.error('❌ Sales insights migration failed:', error.message);
    throw error;
  }
}

const isDirectRun = process.argv[1]?.includes('add-sales-insights');
if (isDirectRun) {
  const { closePool } = await import('../shared/database.js');
  migrate().then(() => closePool()).catch(e => { console.error(e); process.exit(1); });
}
