import { config } from 'dotenv';
import { query, closePool } from './shared/database.js';

config();

async function checkProducts() {
  try {
    const result = await query('SELECT id, name FROM products WHERE is_active = true ORDER BY id');
    console.log('Current products in database:');
    console.log('============================');
    result.rows.forEach(p => {
      console.log(`ID ${p.id}: ${p.name}`);
    });
    console.log(`\nTotal: ${result.rows.length} products`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await closePool();
  }
}

checkProducts();
