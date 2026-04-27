/**
 * Batch Upload Products Script
 * Uploads images from fotos-axkan folder to Cloudinary
 * and creates products in the database
 */

import { v2 as cloudinary } from 'cloudinary';
import { config } from 'dotenv';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

config();

const { Pool } = pg;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://souvenir_management_user:PSN6MKlWzsKH7ePzBOcnEC4g5aSK74OB@dpg-d45eb9n5r7bs73ag5ou0-a.oregon-postgres.render.com/souvenir_management',
  ssl: { rejectUnauthorized: false }
});

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configuration
const IMAGES_FOLDER = '/Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/axkan-brain-v2/automation/facebook-bot/fotos-axkan';
const BASE_PRICE = 300; // $300 MXN
const PRODUCTION_COST = 50; // Estimated production cost

// Stats
let stats = {
  totalImages: 0,
  uploaded: 0,
  created: 0,
  errors: 0,
  skipped: 0
};

/**
 * Upload image to Cloudinary
 */
async function uploadToCloudinary(imagePath, folder, publicId) {
  try {
    const result = await cloudinary.uploader.upload(imagePath, {
      folder: `axkan-products/${folder}`,
      public_id: publicId,
      resource_type: 'image',
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' },
        { quality: 'auto:good' }
      ]
    });
    return result.secure_url;
  } catch (error) {
    console.error(`  ❌ Cloudinary error: ${error.message}`);
    throw error;
  }
}

/**
 * Create product in database
 */
async function createProduct(name, description, category, imageUrl) {
  try {
    const result = await pool.query(`
      INSERT INTO products (name, description, base_price, production_cost, category, image_url, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, true)
      ON CONFLICT DO NOTHING
      RETURNING id
    `, [name, description, BASE_PRICE, PRODUCTION_COST, category, imageUrl]);

    return result.rows[0]?.id;
  } catch (error) {
    console.error(`  ❌ Database error: ${error.message}`);
    throw error;
  }
}

/**
 * Process a single image
 */
async function processImage(imagePath, destinationName, imageIndex) {
  const fileName = path.basename(imagePath, path.extname(imagePath));
  const productName = `Imán Souvenir ${destinationName} #${String(imageIndex).padStart(2, '0')}`;
  const description = `Imán decorativo de ${destinationName}. Paquete de 5 piezas. Diseño exclusivo AXKAN.`;

  try {
    // Upload to Cloudinary
    const publicId = `${destinationName.toLowerCase().replace(/\s+/g, '-')}-${String(imageIndex).padStart(2, '0')}`;
    const imageUrl = await uploadToCloudinary(imagePath, destinationName.replace(/\s+/g, '-'), publicId);
    stats.uploaded++;

    // Create product in database
    const productId = await createProduct(productName, description, destinationName, imageUrl);
    if (productId) {
      stats.created++;
      console.log(`  ✅ Created: ${productName} (ID: ${productId})`);
    } else {
      stats.skipped++;
      console.log(`  ⏭️ Skipped (already exists): ${productName}`);
    }

    return { success: true, productName, imageUrl };
  } catch (error) {
    stats.errors++;
    console.error(`  ❌ Failed: ${productName} - ${error.message}`);
    return { success: false, productName, error: error.message };
  }
}

/**
 * Process a destination folder
 */
async function processDestination(folderPath, folderName) {
  // Clean destination name (remove "- Catálogo VT" suffix)
  const destinationName = folderName.replace(' - Catálogo VT', '').trim();

  console.log(`\n📁 Processing: ${destinationName}`);

  // Get all images in folder
  const files = fs.readdirSync(folderPath)
    .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
    .sort();

  if (files.length === 0) {
    console.log(`  ⚠️ No images found`);
    return;
  }

  console.log(`  Found ${files.length} images`);

  // Process each image
  for (let i = 0; i < files.length; i++) {
    const imagePath = path.join(folderPath, files[i]);
    await processImage(imagePath, destinationName, i + 1);

    // Rate limiting - wait 500ms between uploads
    await new Promise(r => setTimeout(r, 500));
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting batch upload of products...\n');
  console.log(`📂 Source folder: ${IMAGES_FOLDER}`);
  console.log(`💰 Base price: $${BASE_PRICE} MXN`);

  // Test database connection
  try {
    await pool.query('SELECT 1');
    console.log('✅ Database connected\n');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }

  // Test Cloudinary connection
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    console.error('❌ Cloudinary not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
    process.exit(1);
  }
  console.log(`☁️ Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME}\n`);

  // Get all destination folders
  const folders = fs.readdirSync(IMAGES_FOLDER)
    .filter(f => {
      const fullPath = path.join(IMAGES_FOLDER, f);
      return fs.statSync(fullPath).isDirectory() && !f.startsWith('.');
    })
    .sort();

  console.log(`📊 Found ${folders.length} destinations to process\n`);

  // Count total images
  for (const folder of folders) {
    const folderPath = path.join(IMAGES_FOLDER, folder);
    const images = fs.readdirSync(folderPath).filter(f => /\.(png|jpg|jpeg)$/i.test(f));
    stats.totalImages += images.length;
  }
  console.log(`📷 Total images to upload: ${stats.totalImages}\n`);

  const startTime = Date.now();

  // Process each destination
  for (let i = 0; i < folders.length; i++) {
    const folder = folders[i];
    const folderPath = path.join(IMAGES_FOLDER, folder);

    console.log(`\n[${i + 1}/${folders.length}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    await processDestination(folderPath, folder);

    // Progress update every 10 folders
    if ((i + 1) % 10 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      console.log(`\n📈 Progress: ${i + 1}/${folders.length} folders | ${stats.uploaded} uploaded | ${elapsed} min elapsed`);
    }
  }

  // Final stats
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 BATCH UPLOAD COMPLETE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Total images:    ${stats.totalImages}`);
  console.log(`  Uploaded:        ${stats.uploaded}`);
  console.log(`  Products created: ${stats.created}`);
  console.log(`  Skipped:         ${stats.skipped}`);
  console.log(`  Errors:          ${stats.errors}`);
  console.log(`  Time elapsed:    ${totalTime} minutes`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await pool.end();
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
