import { config } from 'dotenv';
import { query } from './database.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, '..', '.env') });

async function checkMaterials() {
  console.log('\n📦 Inventory Materials:\n');
  const inventoryResult = await query('SELECT id, name, unit_type FROM materials WHERE is_active = true ORDER BY name');
  inventoryResult.rows.forEach(m => {
    console.log(`  [${m.id}] ${m.name} (${m.unit_type})`);
  });

  console.log('\n\n🔧 BOM Raw Materials:\n');
  const bomResult = await query('SELECT id, name, unit_type, unit_label, cost_per_unit FROM raw_materials ORDER BY name');
  bomResult.rows.forEach(m => {
    console.log(`  [${m.id}] ${m.name} (${m.unit_label}) - $${m.cost_per_unit}`);
  });

  process.exit(0);
}

checkMaterials();
