/**
 * Run Inventory-to-BOM Sync Migration
 * Links inventory system with BOM pricing system
 */

import { config } from 'dotenv';
import { query } from './database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from backend directory (parent of shared)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, '..', '.env') });

async function runSyncMigration() {
  console.log('\n🔗 Running Inventory-to-BOM Sync Migration...\n');

  try {
    // Read migration SQL
    const migrationPath = path.join(__dirname, 'migrations', '004-sync-inventory-to-bom.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    // Run migration
    console.log('📝 Executing migration SQL...');
    await query(migrationSQL);
    console.log('✅ Migration completed successfully\n');

    // Link existing materials
    console.log('🔗 Linking existing materials to raw_materials...');
    const linkResult = await query('SELECT * FROM link_materials_to_raw_materials()');

    console.log(`\n📊 Linking Results (${linkResult.rows.length} materials):\n`);
    console.log('─'.repeat(80));

    linkResult.rows.forEach(row => {
      const status = row.linked ? '✅ LINKED' : '⚠️  NOT LINKED';
      const rawMaterial = row.raw_material_name || 'No match found';
      console.log(`${status}: ${row.material_name}`);
      if (row.linked) {
        console.log(`         → ${rawMaterial}`);
      }
    });

    console.log('─'.repeat(80));

    const linkedCount = linkResult.rows.filter(r => r.linked).length;
    const unlinkedCount = linkResult.rows.length - linkedCount;

    console.log(`\n📈 Summary:`);
    console.log(`   ✅ Linked: ${linkedCount}`);
    console.log(`   ⚠️  Unlinked: ${unlinkedCount}`);

    if (unlinkedCount > 0) {
      console.log(`\n💡 Tip: Unlinked materials won't sync costs to BOM.`);
      console.log(`   To link manually:`);
      console.log(`   UPDATE materials SET raw_material_id = <id> WHERE name = '<material_name>';`);
    }

    console.log(`\n✅ Inventory-BOM sync is now active!`);
    console.log(`   📌 When you record purchases, costs will auto-update in BOM`);
    console.log(`   📌 Product costs will recalculate automatically\n`);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }

  process.exit(0);
}

runSyncMigration();
