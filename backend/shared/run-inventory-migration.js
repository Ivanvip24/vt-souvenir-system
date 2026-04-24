/**
 * Run the inventory database migration
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';
import { config } from 'dotenv';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config();

async function runMigration() {
  console.log('🚀 Running Inventory Management System Migration...\n');

  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    // Test connection
    console.log('📡 Testing database connection...');
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to database\n');

    // Read migration file
    console.log('📝 Reading migration file...');
    const migrationSQL = readFileSync(join(__dirname, 'inventory-migration.sql'), 'utf8');

    // Execute migration
    console.log('⚙️  Executing migration...');
    await pool.query(migrationSQL);

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📊 Created tables:');
    console.log('   - materials');
    console.log('   - product_materials (BOM)');
    console.log('   - material_transactions');
    console.log('   - inventory_alerts');
    console.log('   - order_material_reservations');
    console.log('   - material_consumption_history');

    console.log('\n📈 Created views:');
    console.log('   - material_inventory_status');
    console.log('   - material_consumption_analytics');
    console.log('   - order_material_requirements');

    console.log('\n🎯 Created triggers:');
    console.log('   - Auto-update material timestamps');
    console.log('   - Auto-update reserved stock');

    console.log('\n📦 Sample data inserted:');
    console.log('   - 4 materials (MDF, Magnets, Backs, Glue)');
    console.log('   - BOM entries for existing products');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nDetails:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
