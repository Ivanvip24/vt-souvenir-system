import { query } from './database.js';

/**
 * Test Script: Add BOM components for "Imanes de MDF" product
 *
 * Product: Imanes de MDF (ID: 14)
 * Components:
 * - MDF 3mm Sheet 8x8cm (64 cm²)
 * - Circular Magnet 2cm (1 piece)
 * - Transparent Bag Small (1 piece)
 */

async function testMagnetBOM() {
  console.log('\n🧲 Setting up BOM for Imanes de MDF...\n');

  const productId = 14;

  try {
    // Check if product exists
    const productCheck = await query('SELECT * FROM products WHERE id = $1', [productId]);
    if (productCheck.rows.length === 0) {
      throw new Error('Product not found');
    }

    const product = productCheck.rows[0];
    console.log('✅ Product found:', product.name);
    console.log('   Current Price:', product.base_price);
    console.log('   Current Cost:', product.production_cost);
    console.log('   Current Labor:', product.labor_cost);
    console.log();

    // Clear existing components
    await query('DELETE FROM product_components WHERE product_id = $1', [productId]);
    console.log('🗑️  Cleared existing components\n');

    // Component 1: MDF 3mm Sheet (8x8cm = 64 cm²)
    console.log('📦 Adding Component 1: MDF 3mm Sheet (8x8cm)');
    const mdfComponent = await query(`
      INSERT INTO product_components (
        product_id,
        raw_material_id,
        quantity_needed,
        unit_type,
        piece_width,
        piece_height,
        waste_percentage,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      productId,        // product_id
      1,                // raw_material_id (MDF 3mm Sheet)
      64,               // quantity_needed (8 x 8 = 64 cm²)
      'area',           // unit_type
      8.00,             // piece_width
      8.00,             // piece_height
      5.00,             // waste_percentage
      'Pieza de MDF cortada de 8x8cm'
    ]);

    const mdfCost = 64 * 0.0005; // 64 cm² × $0.0005 per cm²
    const mdfCostWithWaste = mdfCost * 1.05; // + 5% waste
    console.log(`   ✓ MDF: 64 cm² × $0.0005 = $${mdfCost.toFixed(4)} (with waste: $${mdfCostWithWaste.toFixed(4)})`);

    // Component 2: Circular Magnet
    console.log('\n📦 Adding Component 2: Circular Magnet 2cm');
    const magnetComponent = await query(`
      INSERT INTO product_components (
        product_id,
        raw_material_id,
        quantity_needed,
        unit_type,
        waste_percentage,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      productId,        // product_id
      2,                // raw_material_id (Circular Magnet)
      1,                // quantity_needed
      'piece',          // unit_type
      2.00,             // waste_percentage (lower for magnets)
      '1 imán circular por pieza'
    ]);

    const magnetCost = 1 * 0.60; // 1 × $0.60
    const magnetCostWithWaste = magnetCost * 1.02; // + 2% waste
    console.log(`   ✓ Magnet: 1 piece × $0.60 = $${magnetCost.toFixed(2)} (with waste: $${magnetCostWithWaste.toFixed(4)})`);

    // Component 3: Transparent Bag
    console.log('\n📦 Adding Component 3: Transparent Bag Small');
    const bagComponent = await query(`
      INSERT INTO product_components (
        product_id,
        raw_material_id,
        quantity_needed,
        unit_type,
        waste_percentage,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      productId,        // product_id
      3,                // raw_material_id (Transparent Bag Small)
      1,                // quantity_needed
      'piece',          // unit_type
      1.00,             // waste_percentage (very low)
      '1 bolsa transparente por pieza'
    ]);

    const bagCost = 1 * 0.10; // 1 × $0.10
    const bagCostWithWaste = bagCost * 1.01; // + 1% waste
    console.log(`   ✓ Bag: 1 piece × $0.10 = $${bagCost.toFixed(2)} (with waste: $${bagCostWithWaste.toFixed(4)})`);

    // Calculate totals
    console.log('\n' + '='.repeat(60));
    console.log('💰 COST BREAKDOWN:');
    console.log('='.repeat(60));

    const totalMaterialsCost = mdfCostWithWaste + magnetCostWithWaste + bagCostWithWaste;
    const laborCost = parseFloat(product.labor_cost || 0);
    const totalCost = totalMaterialsCost + laborCost;
    const price = parseFloat(product.base_price);
    const profit = price - totalCost;
    const margin = (profit / price * 100);

    console.log(`Materials Cost:  $${totalMaterialsCost.toFixed(4)}`);
    console.log(`  - MDF (8x8cm): $${mdfCostWithWaste.toFixed(4)}`);
    console.log(`  - Magnet:      $${magnetCostWithWaste.toFixed(4)}`);
    console.log(`  - Bag:         $${bagCostWithWaste.toFixed(4)}`);
    console.log(`Labor Cost:      $${laborCost.toFixed(2)}`);
    console.log(`TOTAL COST:      $${totalCost.toFixed(4)}`);
    console.log();
    console.log(`Product Price:   $${price.toFixed(2)}`);
    console.log(`Profit:          $${profit.toFixed(4)}`);
    console.log(`Margin:          ${margin.toFixed(2)}%`);
    console.log('='.repeat(60));

    // Check updated product cost (should be auto-updated by trigger)
    console.log('\n🔄 Checking if database trigger updated product cost...');
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for trigger

    const updatedProduct = await query('SELECT * FROM products WHERE id = $1', [productId]);
    const dbCost = parseFloat(updatedProduct.rows[0].production_cost);
    const dbMaterialCost = parseFloat(updatedProduct.rows[0].material_cost || 0);

    console.log(`✅ Database updated automatically!`);
    console.log(`   Production Cost: $${dbCost.toFixed(4)}`);
    console.log(`   Material Cost:   $${dbMaterialCost.toFixed(4)}`);

    if (Math.abs(dbCost - totalCost) < 0.01) {
      console.log('   ✅ Trigger calculation matches our calculation!');
    } else {
      console.log(`   ⚠️  Cost mismatch: Expected $${totalCost.toFixed(4)}, got $${dbCost.toFixed(4)}`);
    }

    console.log('\n✅ BOM setup complete for Imanes de MDF!\n');
    console.log('🎯 Next steps:');
    console.log('   1. Open admin dashboard');
    console.log('   2. Go to Precios → Componentes (BOM)');
    console.log('   3. Select "Imanes de MDF" from the dropdown');
    console.log('   4. View the components and cost breakdown\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }

  process.exit(0);
}

testMagnetBOM();
