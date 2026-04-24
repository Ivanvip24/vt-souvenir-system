import { config } from 'dotenv';
import { query } from './database.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, '..', '.env') });

async function checkColumns() {
  const result = await query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'materials'
    ORDER BY ordinal_position
  `);

  console.log('\n📋 Materials table columns:\n');
  result.rows.forEach(row => {
    console.log(`   • ${row.column_name} (${row.data_type})`);
  });
  console.log('');

  process.exit(0);
}

checkColumns();
