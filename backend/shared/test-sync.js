import { config } from 'dotenv';
import { query } from './database.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, '..', '.env') });

async function testSync() {
  console.log('\n🧪 Testing Inventory-to-BOM Cost Sync\n');
  console.log('─'.repeat(80));

  // Test 1: MDF Purchase (with unit conversion)
  console.log('\n📦 Test 1: Buying MDF Sheet');
  console.log('   Scenario: Purchase 1 sheet for $150');
  console.log('   Expected: BOM updates to $150 ÷ 297,680 = $0.000504 per cm²\n');

  // Get current BOM cost for MDF
  const mdfBefore = await query(
    'SELECT cost_per_unit FROM raw_materials WHERE id = 1'
  );
  console.log(`   Current BOM cost: $${mdfBefore.rows[0].cost_per_unit} per cm²`);

  // Record a test purchase
  const purchaseResult = await query(`
    INSERT INTO material_transactions (
      material_id,
      transaction_type,
      quantity,
      unit_cost,
      total_cost,
      notes
    ) VALUES (
      1, -- MDF Board
      'purchase',
      1, -- 1 sheet
      150.00, -- $150 per sheet
      150.00,
      'Test purchase for sync verification'
    ) RETURNING id
  `);

  console.log(`   ✅ Purchase recorded (transaction #${purchaseResult.rows[0].id})`);

  // Check updated BOM cost
  const mdfAfter = await query(
    'SELECT cost_per_unit FROM raw_materials WHERE id = 1'
  );
  const expectedCost = 150 / 297680;
  const actualCost = parseFloat(mdfAfter.rows[0].cost_per_unit);

  console.log(`   Updated BOM cost: $${actualCost.toFixed(6)} per cm²`);
  console.log(`   Expected cost: $${expectedCost.toFixed(6)} per cm²`);

  if (Math.abs(actualCost - expectedCost) < 0.000001) {
    console.log('   ✅ Test PASSED - Cost synced correctly with unit conversion!\n');
  } else {
    console.log('   ❌ Test FAILED - Cost mismatch!\n');
  }

  // Test 2: Magnet Purchase (no conversion)
  console.log('─'.repeat(80));
  console.log('\n📦 Test 2: Buying Magnets');
  console.log('   Scenario: Purchase 100 units for $0.50 each');
  console.log('   Expected: BOM updates to $0.50 per pieza (no conversion)\n');

  const magnetBefore = await query(
    'SELECT cost_per_unit FROM raw_materials WHERE id = 2'
  );
  console.log(`   Current BOM cost: $${magnetBefore.rows[0].cost_per_unit} per pieza`);

  const magnetPurchase = await query(`
    INSERT INTO material_transactions (
      material_id,
      transaction_type,
      quantity,
      unit_cost,
      total_cost,
      notes
    ) VALUES (
      2, -- Circular Black Magnets
      'purchase',
      100, -- 100 units
      0.50, -- $0.50 per unit
      50.00,
      'Test purchase for sync verification'
    ) RETURNING id
  `);

  console.log(`   ✅ Purchase recorded (transaction #${magnetPurchase.rows[0].id})`);

  const magnetAfter = await query(
    'SELECT cost_per_unit FROM raw_materials WHERE id = 2'
  );
  const magnetActualCost = parseFloat(magnetAfter.rows[0].cost_per_unit);

  console.log(`   Updated BOM cost: $${magnetActualCost.toFixed(4)} per pieza`);
  console.log(`   Expected cost: $0.5000 per pieza`);

  if (Math.abs(magnetActualCost - 0.50) < 0.0001) {
    console.log('   ✅ Test PASSED - Cost synced correctly without conversion!\n');
  } else {
    console.log('   ❌ Test FAILED - Cost mismatch!\n');
  }

  console.log('─'.repeat(80));

  // Show impact on products
  console.log('\n📊 Impact on Product Costs:\n');

  const products = await query(`
    SELECT
      p.id,
      p.name,
      p.production_cost,
      p.updated_at
    FROM products p
    ORDER BY p.name
  `);

  if (products.rows.length > 0) {
    console.log('Products with updated costs:');
    products.rows.forEach(p => {
      console.log(`   • ${p.name}: $${p.production_cost}`);
      console.log(`     (Last updated: ${new Date(p.updated_at).toLocaleString()})`);
    });
  } else {
    console.log('   No products found yet.');
  }

  console.log('\n');

  // Cleanup instructions
  console.log('─'.repeat(80));
  console.log('\n💡 Test transactions created. To clean up:');
  console.log(`   DELETE FROM material_transactions WHERE notes = 'Test purchase for sync verification';\n`);
  console.log('Or keep them if you want to see the sync working!\n');

  process.exit(0);
}

testSync().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
