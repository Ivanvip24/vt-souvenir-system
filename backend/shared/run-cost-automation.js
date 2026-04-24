import { query, testConnection, closePool } from './database.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runCostAutomationMigration() {
  console.log('\n🚀 Running Automatic Cost Calculation Migration...\n');

  // Test connection first
  const connected = await testConnection();
  if (!connected) {
    console.error('❌ Database connection failed. Check your .env configuration.');
    process.exit(1);
  }

  try {
    // Read migration SQL file
    const migrationPath = path.join(__dirname, 'migrations', '010-automatic-cost-calculations.sql');
    console.log(`📄 Reading migration file: ${migrationPath}`);

    const sql = await fs.readFile(migrationPath, 'utf-8');

    console.log('⚙️  Executing migration...\n');

    // Execute migration
    await query(sql);

    console.log('\n✅ Automatic cost calculation migration completed successfully!');
    console.log('\n🔄 Created Functions:');
    console.log('   - calculate_product_cost_from_bom() - Calculates material costs from BOM');
    console.log('   - update_product_costs() - Updates product costs automatically');
    console.log('\n⚡ Created Triggers:');
    console.log('   - trg_component_change_update_cost - Auto-update when components change');
    console.log('   - trg_material_cost_change_update_products - Auto-update when material prices change');
    console.log('   - trg_labor_cost_change_update_product - Auto-update when labor costs change');
    console.log('\n📊 Created Views:');
    console.log('   - cost_analysis - Enhanced product cost analysis');
    console.log('   - product_bom_costs - Detailed BOM cost breakdown');
    console.log('\n🎉 Your financial automation is now active!');
    console.log('   Product costs will automatically update when:');
    console.log('   ✓ BOM components are added/changed/removed');
    console.log('   ✓ Material prices are updated');
    console.log('   ✓ Labor costs are modified');
    console.log('\n💡 Next Steps:');
    console.log('   1. Add BOM components to your products');
    console.log('   2. Costs and margins will calculate automatically');
    console.log('   3. Check the Prices & Margins dashboard to see the results\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

// Run migration
runCostAutomationMigration();
