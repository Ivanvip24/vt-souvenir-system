import { config } from 'dotenv';
import { query } from './database.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, '..', '.env') });

/**
 * Link Materials Helper
 *
 * This script helps link inventory materials to BOM raw materials
 * with optional unit conversion factors.
 *
 * UNIT CONVERSIONS:
 * - MDF: 1 sheet (1.22m x 2.44m) = 297,680 cm²
 * - Magnet: 1 unit = 1 pieza (no conversion needed)
 * - Glue: Depends on bottle size (need to know ml/grams per bottle)
 */

const MATERIAL_LINKS = [
  {
    inventory_name: 'MDF Board 1.22x2.44m',
    inventory_id: 1,
    raw_material_name: 'MDF 3mm Sheet',
    raw_material_id: 1,
    conversion_factor: 297680, // 1 sheet = 297,680 cm²
    note: '1 sheet (1.22m x 2.44m) = 297,680 cm²'
  },
  {
    inventory_name: 'Circular Black Magnets',
    inventory_id: 2,
    raw_material_name: 'Circular Magnet 2cm',
    raw_material_id: 2,
    conversion_factor: 1, // 1 unit = 1 pieza
    note: '1 unit = 1 pieza (no conversion)'
  },
  // {
  //   inventory_name: 'Industrial Glue',
  //   inventory_id: 4,
  //   raw_material_name: 'Strong Glue',
  //   raw_material_id: 7,
  //   conversion_factor: ???, // Need to know bottle size in grams
  //   note: '1 bottle = ??? grams (UPDATE THIS)'
  // },
];

async function linkMaterials() {
  console.log('\n🔗 Linking Inventory Materials to BOM Raw Materials...\n');
  console.log('─'.repeat(80));

  for (const link of MATERIAL_LINKS) {
    console.log(`\n📦 ${link.inventory_name} → 🔧 ${link.raw_material_name}`);
    console.log(`   Conversion: ${link.note}`);

    // Update the materials table with the link
    await query(
      'UPDATE materials SET raw_material_id = $1 WHERE id = $2',
      [link.raw_material_id, link.inventory_id]
    );

    console.log(`   ✅ Linked successfully`);

    // Note about conversion
    if (link.conversion_factor !== 1) {
      console.log(`   ⚠️  Remember: Purchase costs will be divided by ${link.conversion_factor}`);
      console.log(`      Example: If you buy 1 ${link.inventory_name} for $100`);
      console.log(`      BOM cost will be: $${(100 / link.conversion_factor).toFixed(6)} per ${link.raw_material_name.split(' ').pop()}`);
    }
  }

  console.log('\n' + '─'.repeat(80));
  console.log('\n✅ Material linking complete!\n');
  console.log('💡 Note: "Industrial Glue" was not linked because we need to know');
  console.log('   the bottle size in grams. Once you know, update the MATERIAL_LINKS');
  console.log('   array in this script and run it again.\n');

  console.log('🔍 To manually link materials:');
  console.log('   UPDATE materials SET raw_material_id = <raw_material_id> WHERE id = <material_id>;\n');

  // Show current status
  console.log('📊 Current Linking Status:\n');
  const result = await query(`
    SELECT
      m.id as mat_id,
      m.name as material_name,
      m.unit_type as mat_unit,
      rm.id as raw_mat_id,
      rm.name as raw_material_name,
      rm.unit_label as raw_unit,
      rm.cost_per_unit
    FROM materials m
    LEFT JOIN raw_materials rm ON m.raw_material_id = rm.id
    WHERE m.is_active = true
    ORDER BY m.name
  `);

  result.rows.forEach(row => {
    if (row.raw_mat_id) {
      console.log(`   ✅ [${row.mat_id}] ${row.material_name} (${row.mat_unit})`);
      console.log(`      → [${row.raw_mat_id}] ${row.raw_material_name} (${row.raw_unit}) - $${row.cost_per_unit}`);
    } else {
      console.log(`   ⚠️  [${row.mat_id}] ${row.material_name} (${row.mat_unit}) - NOT LINKED`);
    }
  });

  console.log('\n');
  process.exit(0);
}

linkMaterials().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
