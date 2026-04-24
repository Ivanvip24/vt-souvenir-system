import { query, testConnection, closePool } from './database.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runBOMMigration() {
  console.log('\n🚀 Running Bill of Materials (BOM) System Migration...\n');

  // Test connection first
  const connected = await testConnection();
  if (!connected) {
    console.error('❌ Database connection failed. Check your .env configuration.');
    process.exit(1);
  }

  try {
    // Read migration SQL file
    const migrationPath = path.join(__dirname, 'migrations', '003-bill-of-materials-system.sql');
    console.log(`📄 Reading migration file: ${migrationPath}`);

    const sql = await fs.readFile(migrationPath, 'utf-8');

    console.log('⚙️  Executing migration...\n');

    // Execute migration
    await query(sql);

    console.log('\n✅ Bill of Materials system migration completed successfully!');
    console.log('\n📊 Created tables:');
    console.log('   - raw_materials (components like MDF, magnets, bags)');
    console.log('   - product_components (BOM - links products to materials)');
    console.log('\n📈 Created views:');
    console.log('   - bom_cost_summary (auto-calculated costs)');
    console.log('   - product_bom_detail (component breakdown)');
    console.log('   - material_usage_report (material usage across products)');
    console.log('\n🔔 Created triggers:');
    console.log('   - Auto-update product costs when components change');
    console.log('   - Auto-update product costs when material prices change');
    console.log('\n🎁 Sample materials added:');
    console.log('   - MDF 3mm sheets');
    console.log('   - Circular magnets');
    console.log('   - Transparent bags');
    console.log('   - Foil rolls');
    console.log('   - Adhesives');
    console.log('   - Gift boxes');
    console.log('\n🎉 Your BOM system is now ready!');
    console.log('   You can now define product components and costs will auto-calculate!\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

// Run migration
runBOMMigration();
