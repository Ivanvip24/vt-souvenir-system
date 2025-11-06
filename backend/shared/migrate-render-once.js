/**
 * ONE-TIME MIGRATION FOR RENDER DATABASE
 * This script connects directly to Render's PostgreSQL and runs all migrations
 * Run once, then delete this file
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Render database connection
const renderPool = new Pool({
  connectionString: 'postgresql://souvenir_management_user:PSN6MKlWzsKH7ePzBOcnEC4g5aSK74OB@dpg-d45eb9n5r7bs73ag5ou0-a.oregon-postgres.render.com/souvenir_management',
  ssl: {
    rejectUnauthorized: false
  }
});

const MIGRATIONS = [
  { file: 'inventory-migration.sql', name: 'Inventory System' },
  { file: '001-add-client-order-system.sql', name: 'Client Order System' },
  { file: '002-price-tracking-system.sql', name: 'Price Tracking System' },
  { file: '003-bill-of-materials-system.sql', name: 'Bill of Materials' },
  { file: '004-sync-inventory-to-bom.sql', name: 'Inventory-BOM Sync' },
  { file: '005-add-conversion-factor.sql', name: 'Conversion Factors' },
  { file: '006-fix-trigger-functions.sql', name: 'Fix Trigger Functions' },
  { file: '007-increase-cost-precision.sql', name: 'Cost Precision' },
];

async function runMigrations() {
  console.log('\n🚀 ONE-TIME MIGRATION TO RENDER DATABASE');
  console.log('═'.repeat(80));
  console.log('\n📊 Target: dpg-d45eb9n5r7bs73ag5ou0-a.oregon-postgres.render.com');
  console.log('   Database: souvenir_management\n');
  console.log('═'.repeat(80));

  let stats = { success: 0, exists: 0, skipped: 0 };

  for (const migration of MIGRATIONS) {
    console.log(`\n📝 ${migration.name} (${migration.file})`);
    console.log('─'.repeat(80));

    try {
      const migrationPath = path.join(__dirname, 'migrations', migration.file);

      if (!fs.existsSync(migrationPath)) {
        console.log(`   ⚠️  File not found, skipping...`);
        stats.skipped++;
        continue;
      }

      const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

      console.log(`   ⏳ Executing...`);
      await renderPool.query(migrationSQL);

      console.log(`   ✅ Applied successfully!`);
      stats.success++;

    } catch (error) {
      if (error.message.includes('already exists') ||
          error.code === '42P07' ||
          error.code === '42710') {
        console.log(`   ℹ️  Already exists (skipping)`);
        stats.exists++;
      } else {
        console.log(`   ⚠️  Error: ${error.message}`);
        console.log(`   Continuing with next migration...`);
      }
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log('\n📊 Migration Summary:');
  console.log(`   ✅ New migrations: ${stats.success}`);
  console.log(`   ℹ️  Already existed: ${stats.exists}`);
  console.log(`   ⚠️  Skipped: ${stats.skipped}`);

  // Verify critical tables
  console.log('\n🔍 Verifying Critical Tables...\n');

  const criticalTables = [
    'products',
    'materials',
    'product_price_history',
    'raw_materials',
    'product_components'
  ];

  let allGood = true;

  for (const table of criticalTables) {
    try {
      const result = await renderPool.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1
        )`,
        [table]
      );

      if (result.rows[0].exists) {
        console.log(`   ✅ ${table}`);
      } else {
        console.log(`   ❌ ${table} - MISSING!`);
        allGood = false;
      }
    } catch (error) {
      console.log(`   ❌ ${table} - Error: ${error.message}`);
      allGood = false;
    }
  }

  console.log('\n' + '═'.repeat(80));

  if (allGood) {
    console.log('\n✅ SUCCESS! Render database is ready!');
    console.log('\n💡 Next steps:');
    console.log('   1. Go to https://vt-souvenir-backend.onrender.com/admin/');
    console.log('   2. Hard refresh browser (Cmd+Shift+R)');
    console.log('   3. Prices tab should work now!');
    console.log('   4. Delete this script: backend/shared/migrate-render-once.js\n');
  } else {
    console.log('\n⚠️  Some tables are missing. Review errors above.\n');
  }

  await renderPool.end();
  process.exit(0);
}

runMigrations().catch(error => {
  console.error('\n❌ Migration failed:', error);
  renderPool.end();
  process.exit(1);
});
