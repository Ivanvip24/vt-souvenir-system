#!/usr/bin/env node
/**
 * Sync Design Gallery → Destination Pages
 *
 * Queries the design_gallery table for designs tagged with destination slugs,
 * builds a JSON mapping of Cloudinary URLs per destination, writes it to
 * frontend/landing/destination-images.json, and marks newly deployed designs.
 *
 * Usage: node backend/scripts/sync-gallery.js
 *
 * Tag convention for employees:
 *   Destination: cancun, cdmx, oaxaca, guanajuato, etc.
 *   Product type (optional): iman, llavero, portallave, destapador
 *
 * Example: A Cancún magnet design → tags: ["cancun", "iman"]
 */

import { query, closePool } from '../shared/database.js';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// All 20 destination slugs matching generate-destinations.js
const DESTINATION_SLUGS = [
  'cancun', 'cdmx', 'oaxaca', 'guanajuato', 'san-miguel-de-allende',
  'guadalajara', 'puerto-vallarta', 'merida', 'los-cabos', 'puebla',
  'huasteca-potosina', 'tulum', 'playa-del-carmen', 'queretaro',
  'mazatlan', 'morelia', 'chiapas', 'acapulco', 'monterrey', 'zacatecas'
];

// Product type tags → maps to the 4 product slots in generate-destinations.js
// Index 0: Imanes MDF, 1: Llaveros MDF, 2: Portallaves, 3: Destapadores
const PRODUCT_TAGS = ['iman', 'llavero', 'portallave', 'destapador'];

const OUTPUT_PATH = resolve(__dirname, '../../frontend/landing/destination-images.json');

async function syncGallery() {
  console.log('🔄 Syncing design gallery to destination pages...\n');

  // Query ALL non-archived designs that have at least one destination tag.
  // We always build the complete mapping (not just new designs) so the JSON
  // reflects the full current state. We only track "new" for the deploy flag.
  const result = await query(`
    SELECT id, name, file_url, thumbnail_url, tags, deployed_to_website
    FROM design_gallery
    WHERE is_archived = false
    AND tags && $1::text[]
    ORDER BY created_at DESC
  `, [DESTINATION_SLUGS]);

  const designs = result.rows;
  console.log(`📦 Found ${designs.length} designs with destination tags\n`);

  if (designs.length === 0) {
    console.log('⚠️  No designs with destination tags found. Nothing to sync.');
    await closePool();
    return;
  }

  // Group designs by destination and product type
  const destinationMap = {};
  for (const slug of DESTINATION_SLUGS) {
    destinationMap[slug] = { all: [], byProduct: {} };
    for (const tag of PRODUCT_TAGS) {
      destinationMap[slug].byProduct[tag] = [];
    }
  }

  for (const design of designs) {
    const tags = design.tags || [];
    const matchedDests = tags.filter(t => DESTINATION_SLUGS.includes(t));
    const matchedProducts = tags.filter(t => PRODUCT_TAGS.includes(t));
    const imageUrl = design.thumbnail_url || design.file_url;

    for (const dest of matchedDests) {
      destinationMap[dest].all.push({
        id: design.id,
        url: imageUrl,
        name: design.name,
        isNew: !design.deployed_to_website
      });

      // If design has product type tags, slot it into the right product bucket
      if (matchedProducts.length > 0) {
        for (const product of matchedProducts) {
          destinationMap[dest].byProduct[product].push(imageUrl);
        }
      }
    }
  }

  // Build output JSON
  const output = {};
  let updatedCount = 0;
  let newImageCount = 0;
  let placeholderCount = 0;

  for (const slug of DESTINATION_SLUGS) {
    const data = destinationMap[slug];

    if (data.all.length === 0) {
      placeholderCount++;
      continue;
    }

    updatedCount++;
    newImageCount += data.all.filter(d => d.isNew).length;

    // Pick hero: first available image (most recent due to ORDER BY created_at DESC)
    const hero = data.all[0].url;

    // Build product images array (4 slots, matching PRODUCT_TAGS order)
    const products = PRODUCT_TAGS.map(tag => {
      if (data.byProduct[tag].length > 0) {
        return data.byProduct[tag][0]; // first matching design for this product type
      }
      return null;
    });

    // Fill null product slots: distribute remaining images, then fall back to hero
    const otherImages = data.all.slice(1).map(d => d.url);
    let fillIndex = 0;
    for (let i = 0; i < products.length; i++) {
      if (products[i] === null) {
        if (fillIndex < otherImages.length) {
          products[i] = otherImages[fillIndex++];
        } else {
          products[i] = hero;
        }
      }
    }

    output[slug] = { hero, products };
    console.log(`  ✅ ${slug}: hero + ${data.all.length} designs (${data.all.filter(d => d.isNew).length} new)`);
  }

  // Write JSON mapping
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n📄 Written: ${OUTPUT_PATH}`);

  // Mark new designs as deployed (only those not already marked)
  const newDesignIds = designs
    .filter(d => !d.deployed_to_website)
    .map(d => d.id);

  if (newDesignIds.length > 0) {
    await query(`
      UPDATE design_gallery
      SET deployed_to_website = true, deployed_at = NOW()
      WHERE id = ANY($1::int[])
    `, [newDesignIds]);
    console.log(`\n🏷️  Marked ${newDesignIds.length} designs as deployed`);
  } else {
    console.log('\n🏷️  No new designs to mark (all already deployed)');
  }

  // Summary
  console.log(`\n═══════════════════════════════════════`);
  console.log(`📊 Summary`);
  console.log(`   ${updatedCount} destinations with images`);
  console.log(`   ${newImageCount} new images deployed`);
  console.log(`   ${placeholderCount} destinations still using placeholder`);
  console.log(`═══════════════════════════════════════\n`);

  await closePool();
}

syncGallery().catch(err => {
  console.error('❌ Sync failed:', err);
  process.exit(1);
});
