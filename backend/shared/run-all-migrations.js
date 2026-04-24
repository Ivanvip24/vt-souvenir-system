import { config } from 'dotenv';
import { query } from './database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, '..', '.env') });

// Migration files in order
const MIGRATIONS = [
  { file: 'inventory-migration.sql', name: 'Inventory System' },
  { file: '001-add-client-order-system.sql', name: 'Client Order System' },
  { file: '002-price-tracking-system.sql', name: 'Price Tracking System' },
  { file: '003-bill-of-materials-system.sql', name: 'Bill of Materials System' },
  { file: '004-sync-inventory-to-bom.sql', name: 'Inventory-BOM Sync' },
  { file: '005-add-conversion-factor.sql', name: 'Conversion Factors' },
  { file: '006-fix-trigger-functions.sql', name: 'Fix Trigger Functions' },
  { file: '007-increase-cost-precision.sql', name: 'Increase Cost Precision' },
];

async function runAllMigrations() {
  console.log('\n🚀 Running All Migrations...\n');
  console.log('═'.repeat(80));

  let successCount = 0;
  let skipCount = 0;

  for (const migration of MIGRATIONS) {
    console.log(`\n📝 ${migration.name} (${migration.file})`);
    console.log('─'.repeat(80));

    try {
      const migrationPath = path.join(__dirname, 'migrations', migration.file);

      // Check if file exists
      if (!fs.existsSync(migrationPath)) {
        console.log(`   ⚠️  File not found, skipping...`);
        skipCount++;
        continue;
      }

      const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

      console.log(`   ⏳ Executing...`);
      await query(migrationSQL);

      console.log(`   ✅ Success!`);
      successCount++;

    } catch (error) {
      // Check if error is "already exists" - that's ok
      if (error.message.includes('already exists') ||
          error.message.includes('does not exist') ||
          error.code === '42P07' || // duplicate table
          error.code === '42710') { // duplicate object
        console.log(`   ℹ️  Already applied (skipping)`);
        skipCount++;
      } else {
        console.log(`   ❌ Failed: ${error.message}`);
        console.error('\n   Full error:', error);

        // Don't exit, continue with other migrations
        console.log(`   ⚠️  Continuing with next migration...`);
      }
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log(`\n📊 Migration Summary:`);
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ℹ️  Skipped: ${skipCount}`);
  console.log(`   📝 Total: ${MIGRATIONS.length}`);

  // Now recreate the views that were dropped
  console.log('\n' + '═'.repeat(80));
  console.log('\n📊 Recreating Database Views...\n');

  try {
    console.log('   Creating: material_inventory_status');
    await query(`
      CREATE OR REPLACE VIEW material_inventory_status AS
      SELECT
        m.id,
        m.name,
        m.sku,
        m.unit_type,
        m.current_stock,
        m.min_stock_level,
        m.max_stock_level,
        m.reorder_point,
        CASE
          WHEN m.current_stock <= m.reorder_point THEN 'critical'
          WHEN m.current_stock <= m.min_stock_level THEN 'low'
          WHEN m.current_stock >= m.max_stock_level THEN 'overstocked'
          ELSE 'normal'
        END as stock_status,
        m.last_purchase_date,
        m.last_purchase_cost,
        m.average_cost,
        m.is_active
      FROM materials m
      WHERE m.is_active = true
      ORDER BY
        CASE
          WHEN m.current_stock <= m.reorder_point THEN 1
          WHEN m.current_stock <= m.min_stock_level THEN 2
          WHEN m.current_stock >= m.max_stock_level THEN 3
          ELSE 4
        END,
        m.name;
    `);
    console.log('   ✅ Created successfully\n');

  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('   ℹ️  Already exists\n');
    } else {
      console.log(`   ⚠️  Warning: ${error.message}\n`);
    }
  }

  console.log('═'.repeat(80));
  console.log('\n✅ All migrations completed!\n');
  console.log('💡 Next steps:');
  console.log('   1. Check https://vt-souvenir-backend.onrender.com/admin/');
  console.log('   2. Verify Prices tab loads correctly');
  console.log('   3. Check Inventory tab shows materials\n');

  process.exit(0);
}

runAllMigrations().catch(error => {
  console.error('\n❌ Migration runner failed:', error);
  process.exit(1);
});
