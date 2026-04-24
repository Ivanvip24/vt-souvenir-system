import pg from 'pg';
import { config } from 'dotenv';

config();

const { Client } = pg;

async function addBarcodes() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected!');

    // Add barcode column if it doesn't exist
    console.log('📝 Adding barcode column...');
    await client.query(`
      ALTER TABLE materials
      ADD COLUMN IF NOT EXISTS barcode VARCHAR(50) UNIQUE
    `);

    // Get all materials
    const result = await client.query('SELECT id, name FROM materials ORDER BY id');

    console.log(`\n🏷️ Updating ${result.rows.length} materials with barcodes...\n`);

    // Update each material with a barcode
    for (const material of result.rows) {
      const barcode = `MAT-${String(material.id).padStart(3, '0')}`;

      await client.query(
        'UPDATE materials SET barcode = $1 WHERE id = $2',
        [barcode, material.id]
      );

      console.log(`  ✓ ${material.name} → ${barcode}`);
    }

    console.log('\n✅ All materials now have barcodes!');
    console.log('\n📋 Summary:');

    const updated = await client.query('SELECT name, barcode FROM materials ORDER BY id');
    updated.rows.forEach(m => {
      console.log(`  ${m.barcode}: ${m.name}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

addBarcodes();
