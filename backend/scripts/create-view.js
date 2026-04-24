import pg from 'pg';
import { config } from 'dotenv';

config();

const { Client } = pg;

async function createView() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    await client.connect();
    console.log('🔌 Connected to local database\n');

    // Drop the view if it exists
    console.log('📝 Creating/replacing material_inventory_status view...');

    await client.query(`
      CREATE OR REPLACE VIEW material_inventory_status AS
      SELECT
        m.*,
        CASE
          WHEN m.current_stock <= m.min_stock_level THEN 'critical'
          WHEN m.current_stock <= m.reorder_point THEN 'low'
          ELSE 'normal'
        END as stock_status
      FROM materials m
      WHERE m.is_active = true
      ORDER BY
        CASE
          WHEN m.current_stock <= m.min_stock_level THEN 1
          WHEN m.current_stock <= m.reorder_point THEN 2
          ELSE 3
        END,
        m.name;
    `);

    console.log('✅ View created successfully!\n');

    // Also add barcodes if missing
    console.log('🏷️ Checking for missing barcodes...');
    const result = await client.query('SELECT id, name, barcode FROM materials WHERE barcode IS NULL OR barcode = \'\'');

    if (result.rows.length > 0) {
      console.log(`📝 Adding barcodes to ${result.rows.length} materials...`);
      for (const row of result.rows) {
        const barcode = `MAT-${String(row.id).padStart(3, '0')}`;
        await client.query('UPDATE materials SET barcode = $1 WHERE id = $2', [barcode, row.id]);
        console.log(`  ✓ ${row.name} → ${barcode}`);
      }
    } else {
      console.log('✅ All materials have barcodes\n');
    }

    console.log('✅ Local database is ready!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createView();
