import { config } from 'dotenv';
import { query } from './database.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, '..', '.env') });

async function fixView() {
  console.log('\n🔧 Creating material_inventory_status view...\n');

  try {
    await query(`
      CREATE OR REPLACE VIEW material_inventory_status AS
      SELECT
        m.id,
        m.name,
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

    console.log('✅ View created successfully!\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

fixView();
