import pg from 'pg';
import { config } from 'dotenv';

config();

const { Client } = pg;

async function fixLocalDB() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    await client.connect();
    console.log('🔌 Connected to local database');

    // Check if view exists
    const viewCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.views
        WHERE table_name = 'material_inventory_status'
      );
    `);

    if (!viewCheck.rows[0].exists) {
      console.log('📝 Creating material_inventory_status view...');

      await client.query(`
        CREATE VIEW material_inventory_status AS
        SELECT
          m.id,
          m.name,
          m.barcode,
          m.current_stock,
          m.unit_type,
          m.min_stock_level,
          m.reorder_point,
          m.supplier_name,
          m.last_restock_date,
          m.is_active,
          m.notes,
          CASE
            WHEN m.current_stock <= m.min_stock_level THEN 'critical'
            WHEN m.current_stock <= m.reorder_point THEN 'low'
            ELSE 'ok'
          END as status,
          COALESCE(
            (SELECT SUM(quantity)
             FROM material_transactions
             WHERE material_id = m.id
             AND transaction_type = 'out'
             AND transaction_date >= CURRENT_DATE - INTERVAL '30 days'),
            0
          ) as monthly_usage
        FROM materials m
        WHERE m.is_active = true;
      `);

      console.log('✅ View created successfully!');
    } else {
      console.log('✅ View already exists');
    }

    // Add barcodes if missing
    console.log('🏷️ Checking for barcodes...');
    const result = await client.query('SELECT id, barcode FROM materials WHERE barcode IS NULL');

    if (result.rows.length > 0) {
      console.log(`📝 Adding barcodes to ${result.rows.length} materials...`);
      for (const row of result.rows) {
        const barcode = `MAT-${String(row.id).padStart(3, '0')}`;
        await client.query('UPDATE materials SET barcode = $1 WHERE id = $2', [barcode, row.id]);
        console.log(`  ✓ Material ID ${row.id} → ${barcode}`);
      }
    } else {
      console.log('✅ All materials have barcodes');
    }

    console.log('\n✅ Local database is ready!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

fixLocalDB();
