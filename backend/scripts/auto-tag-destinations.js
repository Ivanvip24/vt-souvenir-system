#!/usr/bin/env node
/**
 * One-time script: Auto-tag designs with destination slugs based on their name.
 * After running, use sync-gallery.js to generate the image mapping.
 */

import { query, closePool } from '../shared/database.js';

const slugMap = {
  'cancun': 'cancun', 'cancún': 'cancun',
  'cdmx': 'cdmx', 'ciudad de méxico': 'cdmx', 'ciudad de mexico': 'cdmx',
  'oaxaca': 'oaxaca',
  'guanajuato': 'guanajuato',
  'san miguel de allende': 'san-miguel-de-allende',
  'guadalajara': 'guadalajara',
  'puerto vallarta': 'puerto-vallarta', 'vallarta': 'puerto-vallarta',
  'merida': 'merida', 'mérida': 'merida',
  'los cabos': 'los-cabos', 'cabo san lucas': 'los-cabos',
  'puebla': 'puebla',
  'huasteca potosina': 'huasteca-potosina', 'huasteca': 'huasteca-potosina',
  'tulum': 'tulum',
  'playa del carmen': 'playa-del-carmen',
  'queretaro': 'queretaro', 'querétaro': 'queretaro',
  'mazatlan': 'mazatlan', 'mazatlán': 'mazatlan',
  'morelia': 'morelia',
  'chiapas': 'chiapas',
  'acapulco': 'acapulco',
  'monterrey': 'monterrey',
  'zacatecas': 'zacatecas',
};

async function autoTag() {
  console.log('🏷️  Auto-tagging designs with destination slugs...\n');

  const res = await query('SELECT id, name, tags FROM design_gallery WHERE is_archived = false ORDER BY name');
  let updated = 0;

  for (const row of res.rows) {
    const nameLower = row.name.toLowerCase().trim();
    let slug = null;
    for (const [keyword, s] of Object.entries(slugMap)) {
      if (nameLower.includes(keyword)) {
        slug = s;
        break;
      }
    }
    if (!slug) continue;

    const currentTags = row.tags || [];
    if (currentTags.includes(slug)) continue;

    const newTags = [...currentTags, slug];
    await query('UPDATE design_gallery SET tags = $1 WHERE id = $2', [newTags, row.id]);
    console.log(`  ✅ [${row.id}] "${row.name}" → ${slug}`);
    updated++;
  }

  console.log(`\n🏷️  Tagged ${updated} designs with destination slugs`);
  await closePool();
}

autoTag().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
