import pg from 'pg';
import { config } from 'dotenv';

const { Pool } = pg;
config();

// Connect to production database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://souvenir_management_user:PSN6MKlWzsKH7ePzBOcnEC4g5aSK74OB@dpg-d45eb9n5r7bs73ag5ou0-a.oregon-postgres.render.com/souvenir_management',
  ssl: { rejectUnauthorized: false }
});

async function addImageUrlColumn() {
  console.log('🔄 Connecting to production database...');

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to database');

    // Add image_url column if it doesn't exist
    console.log('📝 Adding image_url column to products table...');
    await pool.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS image_url TEXT
    `);
    console.log('✅ Column added successfully');

    // Verify column exists
    const result = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'products' AND column_name = 'image_url'
    `);

    if (result.rows.length > 0) {
      console.log('✅ Verified: image_url column exists in products table');
    } else {
      console.log('❌ Warning: Could not verify column creation');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addImageUrlColumn();
