import { config } from 'dotenv';
import { query } from './database.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, '..', '.env') });

async function checkTables() {
  const result = await query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  console.log('\n📋 Database tables:\n');
  result.rows.forEach(row => {
    console.log(`   • ${row.table_name}`);
  });
  console.log('');

  // Check specifically for product_price_history
  const checkHistory = await query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'product_price_history'
    ) as exists
  `);

  console.log(`\n🔍 product_price_history exists: ${checkHistory.rows[0].exists}\n`);

  process.exit(0);
}

checkTables();
