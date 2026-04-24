import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://souvenir_management_user:PSN6MKlWzsKH7ePzBOcnEC4g5aSK74OB@dpg-d45eb9n5r7bs73ag5ou0-a.oregon-postgres.render.com/souvenir_management',
  ssl: {
    rejectUnauthorized: false
  }
});

async function addReceiptPdfColumn() {
  try {
    console.log('📦 Adding receipt_pdf_url column to orders table...\n');

    // Add column for initial receipt PDF
    await pool.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS receipt_pdf_url VARCHAR(500)
    `);

    console.log('✅ receipt_pdf_url column added successfully');

    console.log('\n📊 Updated table structure:');
    const result = await pool.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'orders'
        AND column_name IN ('receipt_pdf_url', 'payment_proof_url', 'second_payment_proof_url')
      ORDER BY column_name
    `);

    console.table(result.rows);

    await pool.end();
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

addReceiptPdfColumn();
