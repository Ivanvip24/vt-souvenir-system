import pg from 'pg';
import { config } from 'dotenv';

config();

const { Client } = pg;

async function checkBarcodes() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    await client.connect();
    console.log('🔍 Checking barcode values...\n');

    const result = await client.query('SELECT id, name, barcode FROM materials ORDER BY id');

    console.log('Materials in database:');
    result.rows.forEach(m => {
      console.log(`  ID: ${m.id}, Name: ${m.name}, Barcode: ${m.barcode} (type: ${typeof m.barcode})`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

checkBarcodes();
