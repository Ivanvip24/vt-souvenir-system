# Landing Pages

> 250+ SEO souvenir pages, product catalog, and destination-specific pages.

## What it does

1. Main landing page with 27 product sections and interactive 3D globe
2. 250+ auto-generated city/destination souvenir pages for SEO
3. Product category pages (imanes, llaveros, destapadores, etc.)
4. Historia (history) pages per destination with unique designs
5. Component system: reusable nav, footer, WhatsApp float, analytics
6. Build script injects components into source HTML

## How it works

```
Source HTML files with placeholders:
    <!-- @NAV -->
    <!-- @FOOTER -->
    <!-- @WHATSAPP -->
    |
    v
build.js reads components from frontend/components/
    +--> Injects nav, footer, WhatsApp widget, analytics
    +--> Outputs to public/ directory
    |
    v
Vercel serves from public/
    +--> vercel --prod --yes (deploys from repo root)
```

## Key files

| File | Purpose |
|------|---------|
| `frontend/landing/index.html` | Main landing page (207 KB) |
| `frontend/landing/souvenirs/` | 250+ city directories |
| `frontend/landing/productos/` | 16 product category pages |
| `frontend/components/` | Reusable nav, footer, etc. |
| `frontend/landing/shared-nav-footer.css` | Shared component styles |
| `frontend/landing/globe-section.js` | Three.js 3D globe |
| `frontend/landing/generate-destinations.js` | Page generator |

## Current state

### What works
1. Full SEO coverage for major Mexican tourist destinations
2. Product pages with size guides, pricing, galleries
3. Component injection build system
4. Responsive design
5. WhatsApp float on every page

### What still fails or needs work
1. Some older pages use generic template CSS (cookie-cutter look)
2. Main landing page is 207 KB — heavy
3. No analytics on which landing pages convert

### Future plans
1. All new destination/historia pages MUST use `/frontend-design` skill (Apple-level polish)
2. Unique animations and color palettes per destination
3. Landing page conversion tracking
4. A/B testing on product pages

## Design rule

> Existing pages (chichen-itza, huasteca-potosina, chignahuapan) used templated CSS. Future pages should have distinctive design — scroll animations, unique palettes, professional typography. The Tuko page redesign is the quality bar.
