import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a database pool with SSL enabled
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  try {
    console.log('📦 Running migration 009: Add Archive Status...\n');

    const migrationPath = path.join(__dirname, 'shared/migrations/009-add-archive-status.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('SQL to execute:');
    console.log(sql);
    console.log('\n');

    await pool.query(sql);

    console.log('✅ Migration completed successfully!\n');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await pool.end();
    process.exit(1);
  }
}

runMigration();
