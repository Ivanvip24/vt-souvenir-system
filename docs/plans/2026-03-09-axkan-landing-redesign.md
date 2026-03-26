# AXKAN Landing Page Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use `/frontend-design` skill for EVERY section — this requires Apple-level polish, not template code.

**Goal:** Build a new `index-v2.html` with an 8-section Apple-style cinematic scroll experience, replacing the current catalog layout. Keep old version as backup.

**Architecture:** Single HTML file with inline CSS/JS (same pattern as current site). 8 full-viewport sections, each telling one story. IntersectionObserver for scroll reveals. Horizontal snap-scroll for carousels. Sanity CMS integration preserved. Deployed via Vercel.

**Tech Stack:** HTML5, CSS3 (custom properties, scroll-snap, backdrop-filter), vanilla JS, Sanity CMS API, Google Analytics.

**Design Reference:** `docs/plans/2026-03-09-axkan-landing-redesign-design.md`

---

### Task 1: Scaffold index-v2.html with Base Structure

**Files:**
- Create: `frontend/landing/index-v2.html`

**Step 1: Create the skeleton**

Create the base HTML file with:
- DOCTYPE, html lang="es", head with all meta tags (copy SEO tags from current index.html lines 1-50)
- Google Analytics script tags (copy from current index.html)
- Font preloads for RL Aqva and Objektiv (same as current)
- Google Fonts link for Inter
- CSS custom properties block with AXKAN brand colors, spacing scale, and typography
- Empty section placeholders for all 8 sections
- Sanity CMS fetch script (copy from current index.html lines 2234-2337)

**CSS Variables to define:**
```css
:root {
  --rosa: #e72a88;
  --verde: #8ab73b;
  --naranja: #f39223;
  --turquesa: #09adc2;
  --rojo: #e52421;
  --oro: #D4A574;
  --white: #fafafa;
  --dark: #0a0a0a;
  --gray-100: #f5f5f5;
  --gray-300: #d1d5db;
  --gray-500: #6b7280;
  --gray-800: #1f1f1f;
  --font-display: 'RL Aqva', sans-serif;
  --font-body: 'Objektiv', 'Inter', -apple-system, sans-serif;
}
```

**Step 2: Verify the file loads**

Open `frontend/landing/index-v2.html` in browser. Should see blank page with no console errors.

**Step 3: Commit**

```bash
git add frontend/landing/index-v2.html
git commit -m "feat: scaffold index-v2.html with base structure and CSS variables"
```

---

### Task 2: Navigation Bar

**Files:**
- Modify: `frontend/landing/index-v2.html`

**What to build:**

Fixed navigation that starts transparent (on hero) and transitions to solid white with blur on scroll.

**Requirements:**
- Logo: `assets/LOGO-03.png` at 40px height. Inverted (white) on transparent state, normal on scrolled.
- Links: Productos, Destinos, Mayoreo, Pedidos — RL Aqva, 0.9rem
- CTA button: "Cotizar" — rosa-mexicano, hidden initially, fades in after scrolling past hero
- Mobile: hamburger menu, slide-in panel
- Scroll detection: IntersectionObserver on hero section to toggle `.scrolled` class on nav
- Transition: background 0.3s, backdrop-filter: blur(20px) on scrolled state
- z-index: 1000

**Product links:**
- Productos → `/productos/`
- Destinos → `/souvenirs/`
- Mayoreo → `#mayoreo` (scroll to section 6)
- Pedidos → `/pedidos`

**Step 1: Build nav with scroll behavior**

Use `/frontend-design` skill. The nav should feel invisible until needed — Apple's nav is barely there.

**Step 2: Test on desktop and mobile**

- Desktop: nav transparent on hero, solid on scroll, CTA appears
- Mobile: hamburger works, menu slides in, links work

**Step 3: Commit**

```bash
git add frontend/landing/index-v2.html
git commit -m "feat(v2): add navigation with scroll-triggered transparency"
```

---

### Task 3: Section 1 — Hero "The Magnet Floats"

**Files:**
- Modify: `frontend/landing/index-v2.html`

**What to build:**

Full-viewport hero with a single floating magnet on white background.

**Requirements:**
- Background: pure white `#fafafa`, 100vh
- Center: one product photo — use `https://vtanunciando.com/cdn/shop/files/IMAGENES-IMANES-3.jpg?v=1727106231&width=800`
- Photo treatment: max-width 450px, subtle drop shadow `0 30px 60px rgba(0,0,0,0.15)`, slight rotation `transform: rotate(-3deg)`
- Below photo: "Llévate México Contigo" — `clamp(3rem, 8vw, 6rem)`, RL Aqva
- "México" wrapped in span with rosa-mexicano color
- Subline: "Souvenirs personalizados con corte láser" — 1.1rem, Objektiv, `#999`
- NO CTA buttons in hero
- Scroll indicator: animated chevron at bottom, opacity 0.4, bouncing animation
- Load animation: photo fades in + translateY(40px→0) over 0.8s, title follows at 0.3s delay
- Sanity attributes: `data-sanity="heroTagline"`, `data-sanity="heroTitleLine1"`, `data-sanity="heroHighlight"`, `data-sanity="heroTitleLine2"`

**Step 1: Build hero section**

Use `/frontend-design` skill. This is THE most important section — it must feel like opening apple.com. Massive breathing room. The product is the star.

**Step 2: Test**

- Full viewport, centered content, no scroll bar on hero
- Animation plays on load
- Responsive: photo scales down on mobile, text still readable

**Step 3: Commit**

```bash
git add frontend/landing/index-v2.html
git commit -m "feat(v2): add hero section — floating magnet on white"
```

---

### Task 4: Section 2 — Quality Reveal "Zoom In"

**Files:**
- Modify: `frontend/landing/index-v2.html`

**What to build:**

Dark section showcasing product quality with a close-up photo.

**Requirements:**
- Background: `#0a0a0a`, min-height 100vh, white text
- Large product image filling ~60% width — use `AXKAN_SOURCES/IMAGENES-IMANES-3.jpg` or a close-up crop via Shopify CDN with larger width: `?width=1200`
- Headline: "Corte Láser de Precisión" in turquesa-caribe, RL Aqva, 3rem
- Short paragraph: "Cada pieza cortada con tecnología láser..." Objektiv, 1.1rem, opacity 0.7
- Quality attributes row: 4 items horizontally
  - MDF Premium | Acabado Brillante | Full Color | Impresion UV
  - Each: small dot/circle in turquesa + text, Objektiv 0.85rem
- Scroll animation: image scales from 0.85→1.0 as section enters viewport, text fades up staggered
- Layout: 2-column on desktop (image left, text right), stacked on mobile

**Step 1: Build quality section**

Use `/frontend-design` skill. The contrast from white hero → dark section should feel like a chapter change.

**Step 2: Test**

- Scroll from hero to this section — contrast is dramatic
- Image scales on scroll entry
- Text reveals staggered
- Mobile: stacks properly

**Step 3: Commit**

```bash
git add frontend/landing/index-v2.html
git commit -m "feat(v2): add quality reveal section — dark, dramatic"
```

---

### Task 5: Section 3 — Destinations Carousel

**Files:**
- Modify: `frontend/landing/index-v2.html`

**What to build:**

Horizontal scroll carousel of destination cards.

**Requirements:**
- Background: white, min-height 100vh
- Headline: "243 Destinos" — "243" in rosa-mexicano at 5rem, "Destinos" in black. Below: "El Tuyo También." in gray
- Horizontal scroll container with CSS `scroll-snap-type: x mandatory`, `overflow-x: auto`, `-webkit-overflow-scrolling: touch`
- Cards: 300px wide, 400px tall, rounded 16px, overflow hidden
  - Background: destination photo (use Shopify CDN images from destination-images.json — pick 8-10 popular ones: Cancun, Oaxaca, CDMX, Puebla, Guanajuato, Merida, Playa del Carmen, San Miguel de Allende)
  - Gradient overlay: transparent top → dark bottom
  - City name: white, RL Aqva, 1.5rem, positioned bottom-left
  - Hover: translateY(-8px), shadow grows
- Each card: `scroll-snap-align: start`, margin-right gap
- Link at bottom: "Ver todos los destinos →" in rosa-mexicano, pointing to `/souvenirs/`
- No custom scrollbar — let native scroll behavior work
- Sanity: hardcoded initially, can be enhanced later

**Destination images (Shopify CDN):**
```
cancun: https://vtanunciando.com/cdn/shop/files/cancun.png?width=600
oaxaca: https://vtanunciando.com/cdn/shop/files/oaxaca.png?width=600
cdmx: https://vtanunciando.com/cdn/shop/files/cdmx.png?width=600
puebla: https://vtanunciando.com/cdn/shop/files/puebla.png?width=600
guanajuato: https://vtanunciando.com/cdn/shop/files/guanajuato.png?width=600
```
If these don't exist, use the mexico-1 through mexico-6 hero images from assets/ as fallback.

**Step 1: Build destinations carousel**

Use `/frontend-design` skill. The carousel should invite interaction — Apple's horizontal scroll sections are addictive to swipe.

**Step 2: Test**

- Horizontal scroll works on desktop (mouse wheel / drag) and mobile (swipe)
- Snap to each card
- Cards link to `/souvenirs/{destination}`
- "Ver todos" link works

**Step 3: Commit**

```bash
git add frontend/landing/index-v2.html
git commit -m "feat(v2): add destinations horizontal scroll carousel"
```

---

### Task 6: Section 4 — How It Works (3 Steps)

**Files:**
- Modify: `frontend/landing/index-v2.html`

**What to build:**

Minimal 3-step process section.

**Requirements:**
- Background: `#f5f5f5`, padding 120px vertical
- Headline: "Cómo Funciona" — RL Aqva, 2.5rem, centered
- 3 steps, vertically stacked, centered, max-width 600px:
  - `01` — "Elige tu diseño" / "Personaliza con tu destino o evento"
  - `02` — "Producimos tu pedido" / "Corte láser + impresión UV de alta calidad"
  - `03` — "Recibe en tu puerta" / "Envío a todo México en 8-14 días"
- Number: RL Aqva, 4rem, rosa-mexicano, inline with horizontal line (1px #d1d5db)
- Title: RL Aqva, 1.5rem, black
- Description: Objektiv, 1rem, gray-500
- NO icons — just typography
- Scroll-triggered: each step reveals staggered (0.2s delay between each)

**Step 1: Build 3-step section**

Use `/frontend-design` skill. The restraint here IS the design. Apple would never add a cartoon icon.

**Step 2: Test**

- Steps reveal one by one on scroll
- Responsive: works on mobile (may need smaller number size)
- Clean typography hierarchy

**Step 3: Commit**

```bash
git add frontend/landing/index-v2.html
git commit -m "feat(v2): add how-it-works 3-step section"
```

---

### Task 7: Section 5 — Products Horizontal Gallery

**Files:**
- Modify: `frontend/landing/index-v2.html`

**What to build:**

Horizontal snap-scroll gallery of all products (NOT the old grid).

**Requirements:**
- Background: white, min-height: 80vh
- Headline: "La Colección" — RL Aqva, 3rem, centered
- Horizontal scroll container: same scroll-snap pattern as destinations
- Cards: 320px wide, white background, rounded 16px, padding 24px
  - Product photo: centered, max-height 200px, object-fit contain, white bg
  - Product name: RL Aqva, 1.2rem
  - Price: "Desde $X c/u" — Objektiv, 1rem, colored per brand accent
  - One accent color per card (use existing data-color system): border-bottom 3px
- 9 products in order (same as current site):
  1. Imanes MDF (rosa) — $8/u — `/productos/imanes-mdf`
  2. Llaveros MDF (verde) — $6/u — `/productos/llaveros-mdf`
  3. Imanes 3D (turquesa) — $12/u — `/productos/imanes-3d`
  4. Imanes Foil (oro) — $10/u — `/productos/imanes-foil`
  5. Destapadores (naranja) — $10/u — `/productos/destapadores-mdf`
  6. Botones (rojo) — $5/u — `/productos/botones`
  7. Portallaves (rosa) — $12/u — `/productos/portallaves-mdf`
  8. Portarretratos (verde) — $15/u — `/productos/portarretratos-mdf`
  9. Souvenir Box (turquesa) — consultar — `/productos/souvenir-box`

**Image URLs (from current site):**
```
imanes: https://vtanunciando.com/cdn/shop/files/IMAGENES-IMANES-3.jpg?width=600
llaveros: https://vtanunciando.com/cdn/shop/files/mockup-llavero.png?width=600
imanes-3d: https://vtanunciando.com/cdn/shop/files/tamasopo.png?width=600
imanes-foil: https://vtanunciando.com/cdn/shop/files/IMAN-FOIL-MOCKUP---vtweb.png?width=600
destapadores: https://vtanunciando.com/cdn/shop/files/DESTAPADOR---VTWEB.png?width=600
botones: https://vtanunciando.com/cdn/shop/files/fotobotones.png?width=600
portallaves: https://vtanunciando.com/cdn/shop/files/PORTALLAVES-VTWEB.png?width=600
portarretratos: https://res.cloudinary.com/dg1owvdhw/image/upload/v1771364794/products/portarretratos-mdf-axkan.png
souvenir-box: https://vtanunciando.com/cdn/shop/files/souvenir-box-axkan.png?width=600
```

- Hover: card lifts, subtle shadow
- "Ver todos los productos →" link at bottom → `/productos/`

**Step 1: Build product gallery**

Use `/frontend-design` skill.

**Step 2: Test**

- Horizontal scroll with snap
- Cards clickable → navigate to product pages
- Responsive on mobile

**Step 3: Commit**

```bash
git add frontend/landing/index-v2.html
git commit -m "feat(v2): add products horizontal scroll gallery"
```

---

### Task 8: Section 6 — Social Proof & Wholesale

**Files:**
- Modify: `frontend/landing/index-v2.html`

**What to build:**

Verde Selva gradient section with impressive numbers.

**Requirements:**
- Background: linear-gradient(135deg, #8ab73b, #6B9B3D), full width, min-height 80vh
- Anchor: `id="mayoreo"` for nav link
- Main stat: "50,000+" — RL Aqva, clamp(4rem, 10vw, 7rem), white
- Subtitle: "souvenirs entregados" — Objektiv, 1.5rem, white opacity 0.8
- 3 stat cards in a row: glass-morphism (backdrop-filter: blur(20px), white/10% bg)
  - "243" / "Destinos"
  - "9" / "Productos"
  - "24" / "Estados"
  - Number: RL Aqva, 2.5rem. Label: Objektiv, 0.85rem, opacity 0.7
- Counter animation: numbers count up from 0 when section enters viewport (IntersectionObserver + requestAnimationFrame)
- Wholesale CTA: "¿Ventas al mayoreo?" — 1.2rem, white
- WhatsApp button: green #25D366, white text, icon + "Cotizar por WhatsApp"
- Sanity attribute: `data-sanity="wholesaleDescription"` on wholesale text

**Step 1: Build social proof section**

Use `/frontend-design` skill. The verde gradient should feel earned — it's the only colored section on the whole page.

**Step 2: Test**

- Numbers animate on scroll
- Glass-morphism cards render properly
- WhatsApp link works (should open wa.me/...)
- Responsive: cards stack on mobile

**Step 3: Commit**

```bash
git add frontend/landing/index-v2.html
git commit -m "feat(v2): add social proof section with counter animation"
```

---

### Task 9: Section 7 — Final CTA

**Files:**
- Modify: `frontend/landing/index-v2.html`

**What to build:**

Full-viewport rosa-mexicano CTA section.

**Requirements:**
- Background: rosa-mexicano `#e72a88`, 80vh, centered content
- Headline: "Haz Tu Pedido Hoy" — RL Aqva, clamp(2.5rem, 6vw, 4rem), white
- Two buttons, stacked or side-by-side:
  - Primary: WhatsApp — green #25D366, white text, rounded, "Cotizar por WhatsApp" → `https://wa.me/529931602708`
  - Secondary: Online order — white bg, rosa text, "Crear pedido en línea" → `/pedidos`
- Subtle animation: buttons fade in staggered on scroll

**Step 1: Build CTA section**

Use `/frontend-design` skill. This is the closer. It should feel urgent but not desperate.

**Step 2: Test**

- WhatsApp link opens correctly
- Pedidos link goes to order form
- Responsive

**Step 3: Commit**

```bash
git add frontend/landing/index-v2.html
git commit -m "feat(v2): add final CTA section"
```

---

### Task 10: Section 8 — Footer

**Files:**
- Modify: `frontend/landing/index-v2.html`

**What to build:**

Minimal dark footer.

**Requirements:**
- Background: `#1f1f1f`, white text
- 3-column layout:
  - Column 1: Logo (assets/LETTERS.png, 120px wide, inverted) + short brand description + social icons (Instagram @axkan.mx, TikTok, Facebook)
  - Column 2: "Productos" — links to all 9 product pages
  - Column 3: "Contacto" — WhatsApp, email, ubicaciones
- Bottom bar: copyright "2026 AXKAN" + legal links
- Social icons: 36px circles, gray, rosa on hover
- Mobile: stack columns, accordion optional but not required
- Keep it SHORT — Apple's footer is utilitarian, not decorative

**Step 1: Build footer**

Use `/frontend-design` skill.

**Step 2: Test**

- All links work
- Responsive layout stacks cleanly
- Social links open correctly

**Step 3: Commit**

```bash
git add frontend/landing/index-v2.html
git commit -m "feat(v2): add minimal dark footer"
```

---

### Task 11: Polish, Transitions & Global Scroll Behavior

**Files:**
- Modify: `frontend/landing/index-v2.html`

**What to build:**

Global scroll-triggered animations and polish pass.

**Requirements:**
- IntersectionObserver: add `.reveal` class system
  - `.reveal` elements: opacity 0, translateY(30px)
  - `.reveal.visible`: opacity 1, translateY(0), transition 0.8s ease
  - Stagger: `.reveal-delay-1` through `.reveal-delay-4` with 0.1-0.4s delays
- Smooth scroll: `html { scroll-behavior: smooth }`
- Section transitions: ensure white→dark→white→gray→white→verde→rosa→dark rhythm flows naturally
- Performance: add `will-change: transform, opacity` to animated elements, `loading="lazy"` on images below fold
- Mobile: verify all 8 sections work on 375px width
- Accessibility: alt text on all images, aria-labels on nav, semantic HTML (section, article, nav, footer)

**Step 1: Add global animation system and polish**

Review the full page flow and ensure transitions between sections feel cinematic.

**Step 2: Full test**

- Load page, scroll through all 8 sections
- Animations trigger at right time
- No layout shifts or flicker
- Mobile: test on 375px

**Step 3: Commit**

```bash
git add frontend/landing/index-v2.html
git commit -m "feat(v2): add scroll animations and polish pass"
```

---

### Task 12: Deploy & Verify

**Files:**
- No code changes — deployment only

**Step 1: Push to deploy**

```bash
git push origin main
```

Vercel auto-deploys from main branch.

**Step 2: Verify v2 is accessible**

The v2 file should be accessible at: `https://axkan.art/index-v2.html`
(Vercel serves static files by their path)

**Step 3: Compare side by side**

- `https://axkan.art/` → old version (index.html)
- `https://axkan.art/index-v2.html` → new version

User reviews both and decides when to swap.

**Step 4: When ready to swap (ONLY when user confirms)**

```bash
# Backup old version
mv frontend/landing/index.html frontend/landing/index-v1.html
# Activate new version
cp frontend/landing/index-v2.html frontend/landing/index.html
git add frontend/landing/index-v1.html frontend/landing/index.html
git commit -m "feat: activate v2 landing page, backup v1"
git push origin main
```

---

### Summary

| Task | Section | Description |
|------|---------|-------------|
| 1 | Setup | Scaffold index-v2.html with CSS vars and base structure |
| 2 | Nav | Transparent → solid navigation with scroll detection |
| 3 | Hero | Floating magnet on white — the money shot |
| 4 | Quality | Dark contrast section with close-up product detail |
| 5 | Destinations | Horizontal scroll carousel of 8-10 cities |
| 6 | Process | "3 Steps" — minimal typography, no icons |
| 7 | Products | Horizontal gallery of all 9 products |
| 8 | Social Proof | Verde gradient with animated counters + wholesale CTA |
| 9 | CTA | Rosa-mexicano full-screen closer |
| 10 | Footer | Minimal dark footer with links |
| 11 | Polish | Global animations, performance, accessibility |
| 12 | Deploy | Push, verify v2 side-by-side, swap when ready |

**CRITICAL:** Every section (Tasks 2-10) MUST use the `/frontend-design` skill. This is not a template job — each section needs distinctive, Apple-level craft.
