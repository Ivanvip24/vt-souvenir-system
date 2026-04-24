#!/usr/bin/env node

/**
 * Extract per-destination metadata from existing 234 souvenirs HTML files.
 * Outputs destinations-meta.json with: name, state, description, aboutText,
 * keywords, relatedDestinations, ogImage.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const htmlFiles = fs.readdirSync(__dirname)
  .filter(f => f.endsWith('.html') && f !== 'index.html' && f !== 'template.html')
  .sort();

console.log(`Found ${htmlFiles.length} HTML files to process.`);

const meta = {};

for (const file of htmlFiles) {
  const slug = file.replace('.html', '');
  const html = fs.readFileSync(path.join(__dirname, file), 'utf-8');

  // Extract city display name from <h1>Souvenirs <span class="highlight">CITY NAME</span></h1>
  const h1Match = html.match(/<h1>Souvenirs\s+<span class="highlight">([^<]+)<\/span><\/h1>/);
  const name = h1Match ? h1Match[1].trim() : slug;

  // Extract state from <span class="dest-state">STATE, México</span>
  const stateMatch = html.match(/<span class="dest-state">([^<]+)<\/span>/);
  const stateRaw = stateMatch ? stateMatch[1].trim() : '';
  // Remove ", México" suffix if present
  const state = stateRaw.replace(/,\s*M[eé]xico$/i, '').trim();

  // Extract meta description
  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/);
  const description = descMatch ? descMatch[1] : '';

  // Extract keywords
  const kwMatch = html.match(/<meta\s+name="keywords"\s+content="([^"]+)"/);
  const keywords = kwMatch ? kwMatch[1] : '';

  // Extract about section text (first <p> inside dest-about)
  const aboutMatch = html.match(/<section class="dest-about">\s*<h2>[^<]+<\/h2>\s*<p>([^<]+(?:<[^>]+>[^<]*)*)<\/p>/s);
  let aboutText = '';
  if (aboutMatch) {
    // Clean HTML tags from about text
    aboutText = aboutMatch[1].replace(/<[^>]+>/g, '').trim();
  }

  // Extract OG image
  const ogImgMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
  const ogImage = ogImgMatch ? ogImgMatch[1] : '';

  // Extract related destinations
  const related = [];
  const relatedRegex = /<a href="\/souvenirs\/([^"]+)" class="related-card">\s*<span class="related-name">([^<]+)<\/span>\s*<span class="related-state">([^<]+)<\/span>/g;
  let relMatch;
  while ((relMatch = relatedRegex.exec(html)) !== null) {
    related.push({
      slug: relMatch[1],
      name: relMatch[2].trim(),
      state: relMatch[3].trim()
    });
  }

  meta[slug] = {
    name,
    state,
    description,
    keywords,
    aboutText,
    ogImage,
    related
  };
}

const outPath = path.join(__dirname, 'destinations-meta.json');
fs.writeFileSync(outPath, JSON.stringify(meta, null, 2), 'utf-8');
console.log(`Wrote ${Object.keys(meta).length} destinations to ${outPath}`);

// Print a few samples
const samples = ['acapulco', 'cancun', 'cdmx', 'guanajuato'];
for (const s of samples) {
  if (meta[s]) {
    console.log(`\n--- ${s} ---`);
    console.log(`  name: ${meta[s].name}`);
    console.log(`  state: ${meta[s].state}`);
    console.log(`  description: ${meta[s].description.substring(0, 80)}...`);
    console.log(`  aboutText: ${meta[s].aboutText.substring(0, 80)}...`);
    console.log(`  related: ${meta[s].related.map(r => r.slug).join(', ')}`);
  }
}
