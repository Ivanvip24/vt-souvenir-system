# Tuko "Turismo Conectado" — Landing Page Design Document

**Date:** 2026-02-24
**Status:** Approved
**Approach:** A — "Immersive Scroll Cinema"

## Overview

Build a stunning landing page for **Tuko**, a two-sided tourism marketplace where travelers discover Mexican destinations and businesses pay to advertise. This first version is a single landing page to showcase the concept and attract both audiences.

**Name:** Tuko — Turismo Conectado
**Tagline:** "Descubre, conecta y vive los destinos más mágicos de México"

## File Location

- **New file:** `tuko/index.html`
- **Pattern:** Self-contained single HTML file with inline `<style>` and `<script>`
- **No frameworks** — vanilla HTML/CSS/JS
- **No external dependencies** except Google Fonts

## Design References

- **Apple.com** — Sticky scroll sections (position: sticky with tall parent), StaggeredFadeIn reveals, glassmorphic nav, scroll-linked animations, `will-change` management
- **Pueblos Magicos (Mexico Desconocido)** — Photography-first approach, destination card grids, gold/amber accents, category navigation
- **Chignahuapan historia page** — Floating animated objects, scroll-triggered counters, immersive dark sections

## Color Palette — "Bold Mexican Modern"

| Name | Hex | Usage |
|------|-----|-------|
| Magenta Papel Picado | `#E72A88` | Primary accent, CTAs, gradients |
| Cobalt Azulejo | `#2A4BF2` | Secondary accent, links, gradients |
| Lima Fresca | `#8AB73B` | Success states, nature accents |
| Marigold Cempasuchil | `#F5A623` | Gold highlights, counters, warmth |
| Turquesa Cenote | `#09ADC2` | Water/travel accents |
| Night Sky | `#0A0E1A` | Dark section backgrounds |
| Cream Papel | `#FFF8F0` | Light section backgrounds |

## Typography

- **Display/Headings:** Fredoka (bold, playful, rounded — the "TUKO" identity font)
- **Body:** Inter (clean, readable)
- **Nav/Buttons:** Montserrat (industry standard for Mexican tourism)

## Page Sections

### 1. Glassmorphic Nav (Fixed)

- Semi-transparent blur nav (`backdrop-filter: saturate(1.8) blur(20px)`)
- "TUKO" wordmark left side (bold Fredoka, placeholder until logo)
- Nav links: Destinos, Cómo Funciona, Para Negocios, Contacto
- CTA pill button: "Explorar Destinos" (magenta bg)
- Papel picado decorative edge at nav bottom (CSS triangles)
- Z-index above all content

### 2. Hero — "México te espera"

- Full-viewport height, dark cinematic photo background (Mexican landscape)
- Giant "TUKO" in Fredoka 120px+ with rainbow gradient text (`background-clip: text`)
  - Gradient: magenta → cobalt → turquesa → lima → marigold
- "TURISMO CONECTADO" subtitle in wide letter-spacing
- Tagline: "Descubre, conecta y vive los destinos más mágicos de México"
- Animated floating objects: SVG alebrije silhouettes, marigold petals, papel picado triangles
- Scroll indicator arrow at bottom
- Staggered fade-in on load: title (0ms) → subtitle (100ms) → tagline (200ms) → objects (400ms)

### 3. Sticky Scroll "Journey" — Featured Destinations

- **Section height: 4x viewport** (400vh)
- **Sticky inner container** (`position: sticky; top: 0; height: 100vh`) pinned while user scrolls
- Displays one destination at a time with crossfade transitions
- 5 featured destinations, each with:
  - Full-bleed background photo
  - Destination name (large)
  - 1-line fun fact
  - Accent color that shifts per destination
- Destinations:
  1. **Chignahuapan** — Christmas spheres, warm golds/reds
  2. **San Cristóbal de las Casas** — Colonial charm, amber/earth tones
  3. **Bacalar** — Laguna de 7 colores, turquesa blues
  4. **Taxco** — Silver capital, metallic grays/whites
  5. **Pátzcuaro** — Día de Muertos, marigold oranges/purples
- Progress dots on the side showing active destination
- JS monitors scroll position within section, maps to active destination index

### 4. How It Works — "Así de fácil"

- Light background (Cream Papel)
- Section header: "Así de fácil" in large Fredoka
- 3-column responsive layout with animated step cards:
  - Step 1: **Descubre** — Map/compass icon + "Explora destinos, experiencias y alojamiento"
  - Step 2: **Conecta** — Phone/link icon + "Contacta directo con negocios locales"
  - Step 3: **Vive** — Heart/star icon + "Vive experiencias únicas y auténticas"
- Each card has a floating SVG illustration with gentle bob animation
- Connecting dotted line between steps (desktop only)
- Cards stagger in from below on scroll (Apple StaggeredFadeIn pattern)
  - 150ms delay between each card

### 5. Stats — "México en números"

- Dark background (Night Sky) with subtle CSS star/particle effect
- 4 animated counters in a horizontal row:
  - **177+** Pueblos Mágicos
  - **32** Estados por explorar
  - **1,000+** Negocios registrados (aspirational)
  - **4.8★** Calificación promedio
- Numbers count up from 0 when section enters viewport (requestAnimationFrame)
- Each counter has a glowing colored underline accent (different AXKAN color each)
- Staggered reveal with 150ms delays between counters
- Counter labels fade in after numbers finish counting

### 6. Business CTA — "¿Tienes un negocio turístico?"

- Split-screen diagonal gradient background: magenta → cobalt
- Left side:
  - Bold headline: "¿Tienes un negocio turístico?"
  - 3 bullet benefits with check icons:
    - "Alcanza miles de viajeros cada mes"
    - "Dashboard de analíticas en tiempo real"
    - "Reservaciones y contacto directo"
  - CTA button: "Registra tu negocio" (white bg, dark text)
- Right side:
  - Mockup/illustration of a business listing card (CSS-drawn)
  - Floating alebrije SVG accent in corner
- Both sides slide in from opposite directions on scroll

### 7. Footer

- Dark background (Night Sky)
- "TUKO" wordmark + "Turismo Conectado" tagline
- 4-column link grid:
  - Destinos: Pueblos Mágicos, Playas, Ciudades, Naturaleza
  - Negocios: Registra tu negocio, Planes, Soporte
  - Compañía: Nosotros, Blog, Prensa, Contacto
  - Legal: Privacidad, Términos, Cookies
- Social media icon placeholders (Instagram, Facebook, TikTok, YouTube)
- Bottom line: "Hecho con orgullo en México 🇲🇽" + "© 2026 Tuko"
- Papel picado decorative top border (CSS triangles matching nav)

## Animation Inventory

### Always Running
| Animation | Element | Technique |
|-----------|---------|-----------|
| Glassmorphic blur | Nav | `backdrop-filter: saturate(1.8) blur(20px)` |
| Floating objects | Hero | CSS `@keyframes` (translateY + rotate, 6-12s loops) |
| Star particles | Stats section | CSS animated dots |
| Papel picado sway | Nav/Footer borders | CSS `@keyframes` subtle translateX |

### Scroll-Triggered (IntersectionObserver)
| Animation | Trigger | Technique |
|-----------|---------|-----------|
| Hero stagger | Page load | `opacity` + `translateY` with incremental delays |
| Step cards reveal | Section visible | Staggered `translateY(40px)` → `translateY(0)` + opacity |
| Counter count-up | Section visible | `requestAnimationFrame` number interpolation |
| Counter glow | After count | CSS `box-shadow` pulse animation |
| Business CTA slide | Section visible | `translateX` from ±100px + opacity |
| Footer fade | Section visible | Simple opacity + translateY |

### Scroll-Position-Linked (Scroll Listener)
| Animation | Trigger | Technique |
|-----------|---------|-----------|
| Destination swap | Scroll % within sticky section | JS maps scroll position to destination index, crossfade |
| Progress dots | Scroll % within sticky section | Active dot highlight |
| Hero parallax | Any scroll | `transform: translateY` on background at 0.3x rate |

## Performance Requirements

- `prefers-reduced-motion` media query disables ALL animations, shows static content
- `will-change: transform, opacity` applied only during animation, removed after via JS
- Passive scroll listeners (`{ passive: true }`)
- All images below fold use `loading="lazy"`
- Visibility API pauses floating animations when tab hidden
- Animate only `transform` and `opacity` (GPU-composited properties)
- Hero image eager-loaded, all others lazy

## Images

### Hero Background
- High-quality Mexican landscape from Wikimedia Commons or Unsplash
- Panoramic/aerial preferred (cenotes, mountains, colonial towns)

### Destination Photos (Sticky Scroll Section)
- 5 photos, one per destination, from Wikimedia Commons:
  - Chignahuapan: Church or sphere displays
  - San Cristóbal: Colonial streets or churches
  - Bacalar: Laguna de los 7 colores
  - Taxco: Silver architecture panoramic
  - Pátzcuaro: Lake or Day of the Dead imagery

### SVG Illustrations
- Alebrije silhouettes (CSS/inline SVG)
- Papel picado triangles (CSS shapes)
- Marigold/cempasuchil petals (CSS/SVG)
- Step icons (compass, phone, heart — inline SVG)

## Responsive Breakpoints

- **Mobile:** < 768px — Single column, smaller fonts, simplified sticky section (swipe cards instead of scroll-linked), stacked step cards
- **Tablet:** 768px-1024px — 2-column grids, adjusted sticky section
- **Desktop:** > 1024px — Full experience with all animations

## Technical Notes

- Single self-contained HTML file
- No build step required
- Google Fonts loaded via `<link>` (Fredoka, Inter, Montserrat)
- Open Graph meta tags for social sharing
- JSON-LD structured data (Organization type)
- Mobile-first CSS with `min-width` media queries
- Smooth scroll for anchor navigation
- No logo yet — using "TUKO" text wordmark as placeholder
