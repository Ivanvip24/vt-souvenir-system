#!/usr/bin/env node
/**
 * Fix mobile layout for all destination pages:
 * - Title above circle (display: contents trick)
 * - Centered text
 * - Hide "Hacer Pedido" button, show only WhatsApp with dashed border
 * - Hide state label on mobile
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const DIR = new URL('.', import.meta.url).pathname;
const SKIP = new Set(['index.html', 'fix-mobile.js', 'assets', 'historia', 'chignahuapan', 'huasteca-potosina', 'chichen-itza']);

const OLD_MOBILE = `@media (max-width: 768px) {
        .dest-hero { flex-direction: column-reverse; padding: 32px 5% 24px; gap: 24px; }
        .dest-hero-img { flex: none; width: 100%; max-width: 300px; margin: 0 auto; }
        .hero-circle { width: 240px; height: 240px; }
        .hero-circle-icon { font-size: 4rem; }
        .nav-links { gap: 12px; font-size: 12px; }
        .btn-secondary { margin-left: 0; margin-top: 8px; }
      }`;

const NEW_MOBILE = `@media (max-width: 768px) {
        .dest-hero { display: flex; flex-direction: column; align-items: center; padding: 24px 5% 24px; gap: 12px; text-align: center; }
        .dest-hero-text { display: contents; }
        .dest-hero-text h1 { order: 1; width: 100%; }
        .dest-state { order: 2; display: none; }
        .dest-hero-img { order: 3; flex: none; width: 100%; max-width: 300px; margin: 0 auto; }
        .dest-hero-text p { order: 4; text-align: left; margin-top: 8px; }
        .btn-primary { order: 5; display: none; }
        .btn-secondary { order: 6; margin-left: 0; margin-top: 8px; border-style: dashed; }
        .hero-circle { width: 240px; height: 240px; }
        .hero-circle-icon { font-size: 4rem; }
        .nav-links { gap: 12px; font-size: 12px; }
      }`;

async function main() {
  const entries = await readdir(DIR);
  const files = entries.filter(f => f.endsWith('.html') && !SKIP.has(f)).map(f => join(DIR, f));

  console.log(`Processing ${files.length} files...`);
  let updated = 0, skipped = 0;

  for (const file of files) {
    let html = await readFile(file, 'utf-8');
    if (html.includes('display: contents')) {
      skipped++;
      continue;
    }
    if (!html.includes('column-reverse')) {
      skipped++;
      continue;
    }
    html = html.replace(OLD_MOBILE, NEW_MOBILE);
    await writeFile(file, html, 'utf-8');
    updated++;
  }

  console.log(`Done: ${updated} updated, ${skipped} skipped`);
}

main().catch(console.error);
