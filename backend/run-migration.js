import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function runMigration() {
  try {
    await client.connect();
    console.log('✅ Connected to database');

    const result = await client.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS second_payment_proof_url TEXT;
    `);

    console.log('✅ Migration completed successfully!');
    console.log('✅ Column "second_payment_proof_url" added to orders table');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('✅ Database connection closed');
  }
}

runMigration();
