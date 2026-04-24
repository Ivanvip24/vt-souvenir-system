import { config } from 'dotenv';
import { query } from './database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, '..', '.env') });

async function runFix() {
  console.log('\n🔧 Fixing trigger function issues...\n');

  try {
    const migrationPath = path.join(__dirname, 'migrations', '006-fix-trigger-functions.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    await query(migrationSQL);
    console.log('✅ Trigger functions fixed successfully\n');

  } catch (error) {
    console.error('❌ Fix failed:', error.message);
    console.error(error);
    process.exit(1);
  }

  process.exit(0);
}

runFix();
