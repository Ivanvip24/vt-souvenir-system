import { query, testConnection, closePool } from './database.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration(migrationFile) {
  console.log(`\n🔄 Running migration: ${migrationFile}\n`);

  try {
    // Read migration SQL file
    const migrationPath = path.join(__dirname, 'migrations', migrationFile);
    const sql = await fs.readFile(migrationPath, 'utf-8');

    // Execute migration
    await query(sql);

    console.log(`✅ Migration ${migrationFile} completed successfully\n`);
  } catch (error) {
    console.error(`❌ Migration ${migrationFile} failed:`, error.message);
    throw error;
  }
}

async function runAllMigrations() {
  console.log('🚀 Starting database migrations...\n');

  // Test connection first
  const connected = await testConnection();
  if (!connected) {
    console.error('❌ Database connection failed');
    process.exit(1);
  }

  try {
    // Run migrations in order
    await runMigration('001-add-client-order-system.sql');
    await runMigration('012-add-cep-verifications.sql');

    console.log('\n✨ All migrations completed successfully!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAllMigrations();
}

export { runMigration, runAllMigrations };
