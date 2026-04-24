import { config } from 'dotenv';
import { query } from './database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, '..', '.env') });

async function runPrecisionFix() {
  console.log('\n🔧 Increasing decimal precision for small costs...\n');

  try {
    const migrationPath = path.join(__dirname, 'migrations', '007-increase-cost-precision.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    await query(migrationSQL);
    console.log('✅ Precision increased successfully\n');
    console.log('   • raw_materials.cost_per_unit: DECIMAL(12, 8)');
    console.log('   • products.production_cost: DECIMAL(12, 8)');
    console.log('   • Trigger updated to use higher precision\n');

  } catch (error) {
    console.error('❌ Fix failed:', error.message);
    console.error(error);
    process.exit(1);
  }

  process.exit(0);
}

runPrecisionFix();
