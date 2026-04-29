/**
 * Test script: Publish a single product to MercadoLibre (Mexico - MLM)
 *
 * Usage:
 *   node scripts/test-ml-publish.js [image_path]
 *
 * If image_path is provided, uploads to Cloudinary first.
 * Otherwise uses a default product image.
 */

import { config } from 'dotenv';
config();

import { query, closePool } from '../shared/database.js';
import * as ml from '../services/mercadolibre.js';
import { uploadImage } from '../shared/cloudinary-config.js';
import { readFileSync } from 'fs';

const IMAGE_PATH = process.argv[2] || null;

async function main() {
  try {
    // Step 1: Check ML connection
    console.log('1️⃣  Checking MercadoLibre connection...');
    const connected = await ml.isConnected();
    if (!connected) {
      console.error('❌ Not connected to MercadoLibre. Run OAuth flow first.');
      process.exit(1);
    }
    console.log('   ✅ Connected');

    // Step 2: Get valid token (refresh if needed)
    console.log('2️⃣  Getting valid access token...');
    const token = await ml.getValidAccessToken();
    console.log('   ✅ Token valid');

    // Step 3: Upload image if provided
    let imageUrl = null;
    if (IMAGE_PATH) {
      console.log(`3️⃣  Uploading image from: ${IMAGE_PATH}`);
      const imageBuffer = readFileSync(IMAGE_PATH);
      const base64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
      const uploadResult = await uploadImage(base64, 'products', 'cancun-musa-magnet');
      imageUrl = uploadResult.url;
      console.log(`   ✅ Uploaded: ${imageUrl}`);
    } else {
      // Use a default AXKAN product image
      imageUrl = 'https://vtanunciando.com/cdn/shop/files/IMAGENES-IMANES-3.jpg?crop=center&height=600&v=1727106231&width=600';
      console.log('3️⃣  No image path provided, using default product image');
      console.log(`   📷 ${imageUrl}`);
    }

    // Step 4: Predict category
    const productTitle = 'Iman Decorativo MDF Cancun MUSA Underwater Souvenir';
    console.log(`4️⃣  Predicting category for: "${productTitle}"...`);
    const prediction = await ml.predictCategory(productTitle, 'MLM');
    const categoryId = prediction?.category_id || 'MLM1915'; // Fallback: Imanes decorativos
    const categoryName = prediction?.category_name || 'Imanes Decorativos';
    console.log(`   ✅ Category: ${categoryId} (${categoryName})`);

    // Step 5: Get category attributes to see what's required
    console.log('5️⃣  Checking required attributes...');
    let requiredAttrs = [];
    try {
      const attrs = await ml.getCategoryAttributes(categoryId);
      requiredAttrs = attrs.filter(a => a.tags?.required);
      console.log(`   📋 Required attributes: ${requiredAttrs.map(a => a.id).join(', ') || 'none'}`);
    } catch (e) {
      console.log(`   ⚠️  Could not fetch attributes: ${e.message}`);
    }

    // Step 6: Build product data
    console.log('6️⃣  Building listing payload...');
    const productData = {
      productId: 4, // Imanes de MDF from your products table
      familyName: 'Iman Decorativo MDF Cancun MUSA Souvenir',
      description: 'Iman decorativo de MDF con diseno del Museo Subacuatico MUSA de Cancun. Souvenir turistico premium con impresion a color de alta calidad. Perfecto como recuerdo de viaje o regalo. Marca AXKAN.',
      price: 45,
      currencyId: 'MXN',
      categoryId: categoryId,
      quantity: 50,
      condition: 'new',
      listingType: 'gold_special',
      pictures: [imageUrl],
      attributes: [
        { id: 'BRAND', value_name: 'AXKAN' },
        { id: 'MODEL', value_name: 'Cancun MUSA Underwater' },
        { id: 'MAGNET_TYPE', value_name: 'Decorativo' },
        // Package dimensions (required by ML) - small MDF magnet
        { id: 'SELLER_PACKAGE_HEIGHT', value_name: '1 cm' },
        { id: 'SELLER_PACKAGE_WIDTH', value_name: '12 cm' },
        { id: 'SELLER_PACKAGE_LENGTH', value_name: '15 cm' },
        { id: 'SELLER_PACKAGE_WEIGHT', value_name: '50 g' }
      ]
    };

    console.log('\n   📦 Listing details:');
    console.log(`      Name:     ${productData.familyName}`);
    console.log(`      Price:    $${productData.price} MXN`);
    console.log(`      Category: ${categoryId}`);
    console.log(`      Quantity: ${productData.quantity}`);
    console.log(`      Image:    ${imageUrl.substring(0, 60)}...`);

    // Step 7: Publish!
    console.log('\n7️⃣  Publishing to MercadoLibre (MLM - Mexico)...');
    const result = await ml.createListing(productData, 'MLM');

    console.log('\n🎉 SUCCESS! Product published to MercadoLibre!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   ML Item ID:  ${result.id}`);
    console.log(`   Status:      ${result.status}`);
    console.log(`   Permalink:   ${result.permalink}`);
    console.log(`   Thumbnail:   ${result.thumbnail || 'pending'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('\n❌ FAILED:', error.message);
    if (error.cause) {
      console.error('   Cause:', JSON.stringify(error.cause, null, 2));
    }
  } finally {
    await closePool();
  }
}

main();
