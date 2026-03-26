# Chignahuapan Historia Page — Design Document

**Date:** 2026-02-23
**Status:** Approved
**Approach:** A — "Christmas Wonderland" (self-contained HTML)

## Overview

Create an immersive, animation-heavy destination page for Chignahuapan at `frontend/landing/souvenirs/chignahuapan/historia.html`. The page focuses on two main themes: **Christmas spheres** and **axolotls**, with a reviews section and the Pueblo Magico badge.

## File Location

- **New file:** `frontend/landing/souvenirs/chignahuapan/historia.html`
- **Pattern:** Self-contained single HTML file with inline `<style>` and `<script>` (like Huasteca Potosina)
- **No shared CSS/JS dependency** — full creative freedom for custom animations

## Page Sections

### 1. Hero — "Donde la Navidad nunca termina"
- Full-screen scenic background (Chignahuapan church or kiosk from Wikimedia/Unsplash)
- Giant "CHIGNAHUAPAN" in RL AQVA font with metallic shine
- Animated CSS Christmas spheres falling like snow across the entire viewport
- Pueblo Magico badge displayed prominently
- Tagline with twist line
- Subtitle: "Puebla, México"
- Scroll indicator arrow
- Caracol spiral watermark (AXKAN signature)

### 2. Fun Facts / Twist — "¿Sabías que...?"
- Chignahuapan = Christmas sphere capital of Mexico
- Animated counter: ~70 million spheres produced per year
- Fun facts about the sphere tradition (400+ workshops, started in 1960s)
- Comparison cards to other Christmas destinations
- Swinging ornament animations on the stat badges

### 3. The Axolotl — Full-screen immersive section
- Dark background with laguna/water imagery
- Story about Chignahuapan's Laguna de Chignahuapan and its axolotl population
- Animated SVG axolotls swimming across the section
- Glow effects on the water
- Fun facts about axolotls (regeneration, endemic to Mexico)
- Uses naranja/turquesa AXKAN colors for accents

### 4. Photo Gallery — "El Viaje Visual"
- Horizontal scrolling gallery (touch-optimized)
- Scenic tourism photos: Iglesia de la Inmaculada, kiosk, laguna, aguas termales, sphere workshops, sierra views
- Captions with fun facts
- Progress bar
- Drag-to-scroll on desktop

### 5. Reviews — "Lo que dicen los visitantes"
- Crafted testimonials (4-5 reviews)
- Animated cards that slide in on scroll
- Star ratings (4.5-5 stars)
- Reviewer avatars (initials-based, not photos)
- Quotes about: magical Christmas atmosphere, sphere workshops, warm town, axolotl encounters, aguas termales
- Overall rating badge

### 6. Products — AXKAN Souvenirs
- Product carousel with Shopify CDN images (existing 20 designs)
- "Lleva la magia navideña contigo" header
- WhatsApp CTA button
- Product cards with hover effects

### 7. Footer
- Standard AXKAN shared footer (nav, social links, legal)

## Animation Inventory

### Background Animations (always running)
- **Falling spheres:** 15-20 CSS-animated circles in AXKAN colors falling diagonally across hero and between sections
- **Floating ornaments:** Sphere shapes that gently bob up and down

### Scroll-triggered Animations
- **Reveal animations:** Elements fade up on scroll (IntersectionObserver)
- **Counter animations:** Numbers count up when visible
- **Review cards:** Stagger-animate in from alternating sides
- **Gallery progress bar:** Updates on scroll position

### Section-specific Animations
- **Hero:** Sphere rain, metallic title shine, spiral draw
- **Axolotl section:** SVG axolotls swim left-to-right with wiggle keyframes, bubble particles rising
- **Fun facts:** Ornament swing (pendulum motion), glowing stat badges
- **Reviews:** Cards flip/slide in, stars animate sequentially

### Performance
- `prefers-reduced-motion` media query disables all animations
- Visibility API pauses animations when tab hidden
- Passive scroll listeners
- Lazy loading on all below-fold images

## Images

### Tourism/scenic (Wikimedia Commons / public sources)
- Chignahuapan church (Iglesia de la Inmaculada Concepción)
- Town kiosk / zócalo
- Laguna de Chignahuapan
- Aguas termales
- Christmas sphere workshops / sphere displays
- Sierra Norte landscape

### Products (existing Shopify CDN)
- Use subset of the 20 existing images from `chignahuapan.html`

### Pueblo Magico badge
- Official SECTUR Pueblo Magico logo from public government source

## Color Palette (AXKAN + Christmas)
- Rosa Mexicano: #e72a88 (primary accents)
- Verde Selva: #8ab73b (Christmas green)
- Naranja Cálido: #f39223 (warm accents)
- Turquesa Caribe: #09adc2 (water/axolotl sections)
- Rojo Mexicano: #e52421 (Christmas red)
- Oro Maya: #D4A574 (ornament gold)
- Christmas additions: deep green (#1a5c2a), snow white, warm gold (#FFD700)

## Typography
- **Titles:** RL AQVA (brand font)
- **Body:** Inter (via Google Fonts, matching existing pages)
- **Display fallback:** Fredoka

## Technical Notes
- Single self-contained HTML file
- Google Analytics tags (same as other pages)
- Open Graph meta tags
- JSON-LD structured data
- Mobile-first responsive design
- Shared nav + footer pattern (matching Chichen Itza)
