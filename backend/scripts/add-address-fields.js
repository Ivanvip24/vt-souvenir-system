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

async function addAddressFields() {
  try {
    console.log('🔄 Adding new address fields to clients table...');

    // Add new columns to clients table
    await pool.query(`
      ALTER TABLE clients
      ADD COLUMN IF NOT EXISTS street VARCHAR(255),
      ADD COLUMN IF NOT EXISTS street_number VARCHAR(50),
      ADD COLUMN IF NOT EXISTS colonia VARCHAR(255),
      ADD COLUMN IF NOT EXISTS postal VARCHAR(20),
      ADD COLUMN IF NOT EXISTS reference_notes VARCHAR(35)
    `);

    console.log('✅ New address fields added successfully');

    // Check if there's existing data in the address column that needs to be migrated
    const result = await pool.query(`
      SELECT COUNT(*) as count FROM clients WHERE address IS NOT NULL AND address != ''
    `);

    if (result.rows[0].count > 0) {
      console.log(`📊 Found ${result.rows[0].count} clients with existing address data`);

      // Migrate existing address data to street field
      await pool.query(`
        UPDATE clients
        SET street = address
        WHERE address IS NOT NULL
        AND street IS NULL
      `);

      console.log('✅ Migrated existing address data to street field');
    }

    // Show the updated table structure
    const columns = await pool.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'clients'
      ORDER BY ordinal_position
    `);

    console.log('\n📋 Updated clients table structure:');
    columns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}${col.character_maximum_length ? `(${col.character_maximum_length})` : ''}`);
    });

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding address fields:', error.message);
    await pool.end();
    process.exit(1);
  }
}

addAddressFields();