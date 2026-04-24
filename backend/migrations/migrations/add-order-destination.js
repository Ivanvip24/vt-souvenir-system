import { query } from '../shared/database.js';

export async function addOrderDestination() {
  try {
    console.log('🔄 Adding destination column to orders...');

    await query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS destination VARCHAR(150)
    `);

    console.log('✅ destination column added to orders');
  } catch (err) {
    console.error('❌ Error adding destination column:', err.message);
    throw err;
  }
}
