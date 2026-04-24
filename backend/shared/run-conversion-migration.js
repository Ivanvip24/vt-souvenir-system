import { config } from 'dotenv';
import { query } from './database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, '..', '.env') });

async function runConversionMigration() {
  console.log('\n🔄 Adding Unit Conversion Support...\n');

  try {
    // Read migration SQL
    const migrationPath = path.join(__dirname, 'migrations', '005-add-conversion-factor.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    // Run migration
    console.log('📝 Executing migration SQL...');
    await query(migrationSQL);
    console.log('✅ Migration completed successfully\n');

    // Show updated materials with conversion factors
    console.log('📊 Materials with Conversion Factors:\n');
    console.log('─'.repeat(100));

    const result = await query(`
      SELECT
        m.id,
        m.name as material_name,
        m.unit_type as inventory_unit,
        m.conversion_factor,
        rm.name as bom_material,
        rm.unit_label as bom_unit,
        rm.cost_per_unit as current_bom_cost
      FROM materials m
      LEFT JOIN raw_materials rm ON m.raw_material_id = rm.id
      WHERE m.is_active = true
      ORDER BY m.raw_material_id IS NULL, m.name
    `);

    result.rows.forEach(row => {
      if (row.bom_material) {
        console.log(`✅ [${row.id}] ${row.material_name}`);
        console.log(`   Inventory Unit: ${row.inventory_unit}`);
        console.log(`   BOM Material: ${row.bom_material} (${row.bom_unit})`);
        console.log(`   Conversion Factor: 1 ${row.inventory_unit} = ${row.conversion_factor} ${row.bom_unit}`);
        console.log(`   Current BOM Cost: $${row.current_bom_cost} per ${row.bom_unit}`);

        if (row.conversion_factor > 1) {
          console.log(`   📌 Example: If you buy for $100/${row.inventory_unit}, BOM will update to $${(100 / row.conversion_factor).toFixed(6)}/${row.bom_unit}`);
        }
        console.log();
      } else {
        console.log(`⚠️  [${row.id}] ${row.material_name} - NOT LINKED`);
        console.log();
      }
    });

    console.log('─'.repeat(100));
    console.log('\n✅ Unit conversion system is now active!\n');
    console.log('📌 When you record purchases:');
    console.log('   1. Enter the cost per inventory unit (e.g., $100 per sheet)');
    console.log('   2. System automatically converts to BOM units (e.g., $0.000336 per cm²)');
    console.log('   3. Product costs recalculate automatically\n');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }

  process.exit(0);
}

runConversionMigration();
