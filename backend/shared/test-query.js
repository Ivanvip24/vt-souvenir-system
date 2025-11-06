import { config } from 'dotenv';
import { query } from './database.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, '..', '.env') });

async function testQuery() {
  console.log('\n🔍 Testing database queries...\n');

  try {
    // Test 1: Check if table exists
    console.log('1. Checking if product_price_history table exists...');
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'product_price_history'
      ) as exists
    `);
    console.log(`   ✅ Table exists: ${tableCheck.rows[0].exists}\n`);

    // Test 2: Try to count rows
    console.log('2. Counting rows in product_price_history...');
    const countResult = await query('SELECT COUNT(*) FROM product_price_history');
    console.log(`   ✅ Row count: ${countResult.rows[0].count}\n`);

    // Test 3: Try the actual query from the API
    console.log('3. Testing the API query (last 30 days)...');
    const priceChanges = await query(`
      SELECT COUNT(*) AS price_changes
      FROM product_price_history
      WHERE effective_date >= CURRENT_DATE - 30
    `);
    console.log(`   ✅ Price changes (30 days): ${priceChanges.rows[0].price_changes}\n`);

    console.log('✅ All queries successful! Database is working correctly.\n');
    console.log('💡 The issue might be:');
    console.log('   - Render using different database credentials');
    console.log('   - Render needs restart to clear cached connections');
    console.log('   - Frontend code not deployed to Render yet\n');

  } catch (error) {
    console.error('❌ Query failed:', error.message);
    console.error('\nFull error:', error);
  }

  process.exit(0);
}

testQuery();
