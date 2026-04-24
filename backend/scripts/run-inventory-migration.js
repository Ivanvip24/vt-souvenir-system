import pg from 'pg';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config();

const { Client } = pg;

async function runMigration() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected!');

    console.log('📖 Reading migration file...');
    const sql = readFileSync('./shared/migrations/inventory-migration.sql', 'utf8');

    console.log('🚀 Running inventory migration...');
    await client.query(sql);

    console.log('✅ Inventory migration completed successfully!');
    console.log('\nCreated:');
    console.log('  ✓ materials table');
    console.log('  ✓ product_materials table');
    console.log('  ✓ material_transactions table');
    console.log('  ✓ inventory_alerts table');
    console.log('  ✓ order_material_reservations table');
    console.log('  ✓ material_consumption_analytics view');
    console.log('  ✓ material_inventory_status view');
    console.log('  ✓ Sample data (4 materials)');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
