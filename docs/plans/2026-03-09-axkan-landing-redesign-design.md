# AXKAN Landing Page Redesign — Apple Storytelling Scroll

**Date:** 2026-03-09
**Goal:** Redesign axkan.art from "small business catalog" to Apple-level cinematic scroll experience.
**Approach:** One message per viewport. Massive whitespace. Magnets as hero product. AXKAN colors used with restraint.
**Vibe:** Modern & vibrant Apple-style with AXKAN's own color palette.

## Technical Strategy

- **New file:** `frontend/landing/index-v2.html` — keeps old `index.html` intact
- **Swap when ready:** Rename files to make v2 the live version
- **Same deployment:** Vercel, same directory, same routing
- **Same Sanity CMS integration** via `data-sanity` attributes
- **Same fonts:** RL Aqva (display), Objektiv (body)
- **No new dependencies** — pure HTML/CSS/JS
- **Uses `/frontend-design` skill for implementation** — Apple-level polish required

## Color Strategy (60/30/10 Rule)

- **60% White/neutral** `#fafafa` — backgrounds, breathing room
- **30% Dark** `#0a0a0a` — quality section, footer (contrast chapters)
- **10% Brand color** — one accent per section, never all 6 at once:
  - Hero: Rosa Mexicano on "Mexico"
  - Quality: Turquesa Caribe headlines
  - Destinations: Mixed (one per card, not all visible at once)
  - Process: Rosa Mexicano numbers
  - Products: One color per card (existing data-color system)
  - Social proof: Verde Selva gradient (full section)
  - CTA: Rosa Mexicano (full section)

## Sections (8 total, each ~100vh)

### 1. HERO — "The Magnet Floats"
- Pure white `#fafafa` background — no image grid, no overlay
- One magnet photo, centered, floating with subtle drop shadow, slight rotation (3deg)
- "Llévate México Contigo" — clamp(3rem, 8vw, 6rem), RL Aqva
- "México" highlighted in Rosa Mexicano
- Subtle subline: "Souvenirs personalizados con corte láser" in gray
- NO CTA buttons in hero — product speaks first
- Scroll chevron at bottom, animated, 50% opacity
- Load animation: magnet fades in + floats up (0.8s), title reveals staggered (0.3s)

### 2. QUALITY REVEAL — "Zoom In"
- Dark section `#0a0a0a`, white text — dramatic contrast after white hero
- Close-up product photo fills 60% of viewport (laser cut edge detail)
- "Corte Láser de Precisión" in turquesa-caribe
- 3-4 quality attributes in horizontal row: MDF Premium, Acabado Brillante, Full Color, Impresion UV
- Scroll-triggered: photo scales 0.8 -> 1.0, text fades up
- Minimal — no icons, just typography and one photo

### 3. DESTINATIONS — "Your City, Your Souvenir"
- White background, back to breathing room
- "243 Destinos" — "243" in rosa-mexicano, rest in black
- Horizontal scroll carousel (NOT a grid)
- Large cards (300px wide): destination photo + magnet overlaid
- Rounded corners, hover lift, destination name in RL Aqva
- CSS scroll-snap-type: x mandatory
- "Ver todos los destinos" link at bottom

### 4. HOW IT WORKS — "3 Steps"
- Light gray `#f5f5f5` background
- Numbers: 4rem, rosa-mexicano, RL Aqva
- Horizontal line between number and description
- 01 Elige tu diseno / 02 Producimos tu pedido / 03 Recibe en tu puerta
- Each step reveals staggered on scroll (0.2s delay each)
- NO clip-art icons — numbers + typography only

### 5. OTHER PRODUCTS — "The Collection"
- White background
- Horizontal snap-scroll gallery (NOT a grid)
- Large cards (350px): product photo on white, name, price
- Each card: one brand color accent (data-color system)
- Hover: card lifts, subtle shadow
- No badges, no descriptions — photo + name + price only
- "Ver todos los productos" link

### 6. SOCIAL PROOF + WHOLESALE
- Verde Selva gradient, full width — only colored section
- "Mas de 50,000 souvenirs entregados" — huge number
- 3 glass-morphism stat cards: 243 destinos, 9 productos, 50+ ciudades
- Numbers animate (count up) on scroll trigger
- Wholesale CTA: "Ventas al mayoreo?" + WhatsApp button

### 7. FINAL CTA
- Rosa Mexicano background, full viewport, white text
- "Haz tu pedido hoy" — large, centered
- Two buttons: WhatsApp (primary) + Online order form (secondary)
- Clean, single action per button

### 8. FOOTER
- Dark `#1f1f1f`, minimal
- Logo, 3 columns of links, social icons
- More spacing than current, fewer links
- Just: Productos, Destinos, Contacto, Legal

## Navigation
- Transparent on hero, solid white on scroll (same pattern)
- Fewer links: Productos, Destinos, Mayoreo, Pedidos
- Logo 40px
- CTA button hidden initially, appears after scrolling past hero

## Animations
- All scroll-triggered via IntersectionObserver
- Staggered reveals (0.2-0.3s between elements)
- Subtle transforms: translateY(30px) -> 0, opacity 0 -> 1
- Quality section photo: scale(0.8) -> scale(1) on scroll
- Social proof numbers: count-up animation
- Product carousel: scroll-snap with momentum
- Nav: transparent -> blur+white transition on scroll

## What's NOT Changing
- Domain: axkan.art
- Deployment: Vercel
- Fonts: RL Aqva + Objektiv
- Sanity CMS integration pattern
- Brand color hex values
- Product data/links
- Destination pages (243 pages stay as-is)
- Product detail pages (10 pages stay as-is)

## Backup Strategy
- Old version preserved as `index-v1.html`
- Can swap back instantly by renaming files
- No destructive changes to existing code
