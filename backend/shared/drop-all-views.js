import { config } from 'dotenv';
import { query } from './database.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, '..', '.env') });

async function dropAllViews() {
  console.log('\n🗑️  Dropping all views...\n');

  try {
    // Get all views
    const viewsResult = await query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
    `);

    if (viewsResult.rows.length === 0) {
      console.log('No views found.');
      process.exit(0);
    }

    console.log(`Found ${viewsResult.rows.length} views:\n`);

    for (const row of viewsResult.rows) {
      console.log(`   Dropping view: ${row.table_name}`);
      await query(`DROP VIEW IF EXISTS ${row.table_name} CASCADE`);
    }

    console.log('\n✅ All views dropped successfully\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }

  process.exit(0);
}

dropAllViews();
