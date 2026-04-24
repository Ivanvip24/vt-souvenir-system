#!/usr/bin/env node

/**
 * AXKAN Frontend Build System
 * Replaces <!-- @COMPONENT --> placeholders with shared HTML components.
 *
 * Usage:
 *   node build.js          # Build all pages
 *   node build.js --watch  # Watch for changes and rebuild
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildHistoriaPages } from './landing/souvenirs/build-historia.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPONENTS_DIR = path.join(__dirname, 'components');
const SOURCE_DIR = __dirname; // frontend/
const DIST_DIR = path.join(__dirname, 'public');

// Directories to process (relative to frontend/)
const PROCESS_DIRS = [
  'landing',
  'faq',
  'lead-form',
  'shipping-form',
  'order-tracking',
  'configurador',
  'pedidos',
];

// Directories to copy as-is (no processing)
const COPY_DIRS = [
  'admin-dashboard',
  'employee-dashboard',
  'brand-manual-web',
  'mobile-app',
  'chrome-extension-whatsapp-crm',
  'chrome-extension-t1-sync',
  'sanity-studio',
  'shared',
  'assets',
  'fonts',
  'styles',
];

// Load all component files
function loadComponents() {
  const components = {};
  if (!fs.existsSync(COMPONENTS_DIR)) {
    console.error('Components directory not found:', COMPONENTS_DIR);
    process.exit(1);
  }

  const files = fs.readdirSync(COMPONENTS_DIR).filter(f => f.endsWith('.html'));
  for (const file of files) {
    const name = file.replace('.html', '');
    components[name] = fs.readFileSync(path.join(COMPONENTS_DIR, file), 'utf-8');
  }

  console.log(`Loaded ${Object.keys(components).length} components: ${Object.keys(components).join(', ')}`);
  return components;
}

// Replace placeholders in HTML content
function injectComponents(html, components) {
  let injections = 0;

  // Pattern: <!-- @COMPONENT_NAME --> or <!-- @COMPONENT_NAME:variant -->
  const processed = html.replace(/<!--\s*@(\w[\w-]*?)(?::(\w[\w-]*?))?\s*-->/g, (match, name, variant) => {
    const key = variant ? `${name}-${variant}` : name;
    const altKey = name; // fallback without variant

    // Map common aliases
    const aliases = {
      'NAV': 'nav-solid',
      'NAV-solid': 'nav-solid',
      'NAV-transparent': 'nav-transparent',
      'NAV-mega': 'nav-mega',
      'MOBILE_MENU': 'mobile-menu',
      'MOBILE-MENU': 'mobile-menu',
      'MOBILE_MENU-mega': 'mobile-menu-mega',
      'FOOTER': 'footer-mega',
      'FOOTER-mega': 'footer-mega',
      'FOOTER-simple': 'footer-simple',
      'HEAD_COMMON': 'head-common',
      'HEAD-COMMON': 'head-common',
      'WHATSAPP': 'whatsapp-float',
      'WHATSAPP-FLOAT': 'whatsapp-float',
      'ANALYTICS': 'analytics',
    };

    const componentKey = aliases[key] || aliases[altKey] || key;

    if (components[componentKey]) {
      injections++;
      return components[componentKey];
    }

    // Not a known component — leave the comment as-is
    console.warn(`  Warning: Unknown component: ${match}`);
    return match;
  });

  return { html: processed, injections };
}

// Recursively find all files in a directory
function walkDir(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }
  return fileList;
}

// Copy a directory recursively
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      count += copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}

// Main build function
function build() {
  console.log('AXKAN Frontend Build\n');

  const components = loadComponents();

  // Clean dist
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });

  let totalPages = 0;
  let totalInjections = 0;
  let totalCopied = 0;

  // Process HTML files in source directories
  for (const dir of PROCESS_DIRS) {
    const srcDir = path.join(SOURCE_DIR, dir);
    if (!fs.existsSync(srcDir)) continue;

    const files = walkDir(srcDir);
    for (const filePath of files) {
      const relativePath = path.relative(SOURCE_DIR, filePath);
      const destPath = path.join(DIST_DIR, relativePath);

      fs.mkdirSync(path.dirname(destPath), { recursive: true });

      if (filePath.endsWith('.html')) {
        const source = fs.readFileSync(filePath, 'utf-8');
        const { html, injections } = injectComponents(source, components);
        fs.writeFileSync(destPath, html);
        totalPages++;
        totalInjections += injections;
      } else {
        // Copy non-HTML files as-is (CSS, JS, JSON, images, etc.)
        fs.copyFileSync(filePath, destPath);
        totalCopied++;
      }
    }
  }

  // Copy non-processed directories as-is
  for (const dir of COPY_DIRS) {
    const srcDir = path.join(SOURCE_DIR, dir);
    const destDir = path.join(DIST_DIR, dir);
    totalCopied += copyDir(srcDir, destDir);
  }

  // Copy root-level files (vercel.json, etc.)
  const rootFiles = fs.readdirSync(SOURCE_DIR).filter(f => {
    const full = path.join(SOURCE_DIR, f);
    return fs.statSync(full).isFile() && f !== 'build.js' && f !== 'package.json';
  });
  for (const file of rootFiles) {
    fs.copyFileSync(path.join(SOURCE_DIR, file), path.join(DIST_DIR, file));
    totalCopied++;
  }

  // Build historia pages from destination JSON files
  console.log('\nBuilding historia pages...');
  const historiaResult = buildHistoriaPages();

  console.log(`\nBuild complete!`);
  console.log(`   ${totalPages} HTML pages processed`);
  console.log(`   ${totalInjections} component injections`);
  console.log(`   ${totalCopied} files copied`);
  if (historiaResult) console.log(`   ${historiaResult.built} historia pages built, ${historiaResult.skipped} ejected`);
  console.log(`   Output: ${DIST_DIR}`);
}

build();
