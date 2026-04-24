# Component Build System — Single Source of Truth

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a build system where nav, mobile menu, footer, and shared scripts are defined ONCE in component files and automatically injected into all 257 HTML pages at build time.

**Architecture:** Source HTML files use placeholder comments (`<!-- @NAV -->`, `<!-- @MOBILE_MENU -->`, `<!-- @FOOTER -->`, etc.). A Node.js build script reads component files from `frontend/components/`, replaces placeholders in all source HTML files, and outputs to `frontend/dist/`. Vercel deploys from `dist/` instead of raw source. Existing pages continue to work — we just extract the repeated parts into components.

**Tech Stack:** Node.js (already in the project), no new dependencies.

---

## Task 1: Create Component Files

Extract the shared HTML blocks that are currently duplicated across 250+ files into single-source component files.

**Files to create:**
- `frontend/components/nav-solid.html` — The `<nav class="site-nav nav--solid">` block
- `frontend/components/nav-transparent.html` — The `<nav class="site-nav">` block (for pages with hero images)
- `frontend/components/mobile-menu.html` — The rich product grid mobile menu
- `frontend/components/mobile-menu-js.html` — The hamburger toggle + scroll detection script
- `frontend/components/footer-mega.html` — The full mega footer (products, designs, etc.)
- `frontend/components/footer-simple.html` — The minimal destination footer
- `frontend/components/head-fonts.html` — Font preloads + shared CSS link
- `frontend/components/whatsapp-float.html` — WhatsApp floating button
- `frontend/components/analytics.html` — Google Analytics/Tag Manager snippet

## Task 2: Build Script

**File:** `frontend/build.js`

The script:
1. Recursively finds all `.html` files in `frontend/landing/`, `frontend/faq/`, `frontend/lead-form/`, etc.
2. Reads each file
3. Replaces `<!-- @COMPONENT_NAME -->` placeholders with the content of the corresponding component file
4. Also supports `<!-- @NAV:solid -->` and `<!-- @NAV:transparent -->` variants
5. Writes output to `frontend/dist/` preserving directory structure
6. Copies non-HTML assets (CSS, JS, JSON, images, fonts) to dist
7. Reports: "Built X pages, Y components injected"

Placeholders supported:
- `<!-- @NAV -->` or `<!-- @NAV:solid -->` → nav-solid.html
- `<!-- @NAV:transparent -->` → nav-transparent.html  
- `<!-- @MOBILE_MENU -->` → mobile-menu.html + mobile-menu-js.html
- `<!-- @FOOTER -->` or `<!-- @FOOTER:mega -->` → footer-mega.html
- `<!-- @FOOTER:simple -->` → footer-simple.html
- `<!-- @HEAD_FONTS -->` → head-fonts.html
- `<!-- @WHATSAPP -->` → whatsapp-float.html
- `<!-- @ANALYTICS -->` → analytics.html

## Task 3: Convert Source Files to Use Placeholders

Replace the duplicated nav/menu/footer HTML in ALL source files with placeholder comments.

**Approach per file category:**

### Souvenirs pages (234 files):
- Replace `<nav class="site-nav nav--solid">...</nav>` → `<!-- @NAV -->`
- Replace `<div class="mobile-menu"...>...</div>` → `<!-- @MOBILE_MENU -->`
- Replace footer HTML → `<!-- @FOOTER:simple -->`
- Replace hamburger JS script → (included in @MOBILE_MENU)
- Replace WhatsApp button → `<!-- @WHATSAPP -->`

### Productos pages (11 files):
- Same replacements as souvenirs

### Diseños page (1 file):
- Replace nav → `<!-- @NAV -->`
- Replace mobile menu → `<!-- @MOBILE_MENU -->`
- Replace footer → `<!-- @FOOTER:mega -->`

### Historia pages (4 files):
- Same as souvenirs

### Other pages (ubicacion, faq, etc.):
- Audit each, apply appropriate placeholders

## Task 4: Update Vercel Config

**File:** `frontend/vercel.json`

Update the root directory or build command so Vercel serves from `dist/` instead of the source directory.

Option A: Add `"buildCommand": "node build.js"` and `"outputDirectory": "dist"`
Option B: Change all rewrite destinations to point to `/dist/landing/...`

Preferred: Option A (cleaner)

## Task 5: Add npm Scripts

**File:** `frontend/package.json` (create if needed)

```json
{
  "scripts": {
    "build": "node build.js",
    "dev": "node build.js --watch"
  }
}
```

## Task 6: Verify & Deploy

- Run build script
- Verify output matches current live site
- Deploy to Vercel
- Spot-check 5 pages across categories
