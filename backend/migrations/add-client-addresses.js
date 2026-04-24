import { query } from '../shared/database.js';

export async function addClientAddresses() {
  console.log('🔄 Running client_addresses migration...');

  // 1. Create the table
  await query(`
    CREATE TABLE IF NOT EXISTS client_addresses (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      label VARCHAR(100),
      street VARCHAR(255),
      street_number VARCHAR(50),
      colonia VARCHAR(255),
      city VARCHAR(100),
      state VARCHAR(100),
      postal VARCHAR(20),
      reference_notes VARCHAR(35),
      is_default BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_client_addresses_client_id ON client_addresses(client_id);
  `);

  // 2. Add shipping_address_id to orders (must succeed independently)
  await query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address_id INTEGER
  `);

  // 3. Migrate existing client addresses (best-effort, may fail if columns don't exist)
  try {
    await query(`
      INSERT INTO client_addresses (client_id, label, street, street_number, colonia, city, state, postal, reference_notes, is_default)
      SELECT id,
             COALESCE(NULLIF(colonia, ''), city) || ', ' || COALESCE(state, ''),
             street, street_number, colonia, city, state,
             COALESCE(postal, postal_code), reference_notes, true
      FROM clients
      WHERE (postal IS NOT NULL OR postal_code IS NOT NULL)
        AND city IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM client_addresses ca WHERE ca.client_id = clients.id)
    `);
  } catch (e) {
    console.warn('⚠️  Could not migrate existing addresses (columns may not exist):', e.message);
  }

  console.log('✅ client_addresses migration complete');
}
