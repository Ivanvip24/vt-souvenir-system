# Tuko Landing Page Redesign — AR Tourism with Axolotl Guide

**Date:** 2026-03-23
**Status:** Approved
**Replaces:** `docs/plans/2026-02-24-tuko-website-design.md`

## Concept

Tuko is an AR tourism platform. QR codes are placed at landmarks. Tourists scan them and an axolotl mascot ("Tuki") appears as a digital guide, shares historical facts about the landmark, then recommends nearby local businesses (sponsors who pay to be featured).

**Tagline:** "Turismo Conectado"
**Value prop:** "Escanea. Aprende. Descubre."
**Demo landmark:** Chignahuapan lagoon clock

## Target Audiences (Equal Weight)

1. **Tourists** — See the experience, get excited to scan QR codes
2. **Local businesses** — Understand the monetization, sign up as sponsors

## File

- **Modify:** `tuko/index.html`
- Self-contained single HTML file with inline `<style>` and `<script>`
- No frameworks — vanilla HTML/CSS/JS
- Font: Sora (already loaded)

## Axolotl Mascot — "Tuki"

- 3D vinyl-toy aesthetic (NOT flat illustration)
- Pink gills, big cute eyes, Mesoamerican/indigenous textile patterns on body
- Like a designer collectible figure meets Mexican heritage
- CSS/SVG recreation on the page with floating animation
- Personality traits: Historiador, Curioso, Local

## Color Palette (Keep Existing)

| Name | Hex |
|------|-----|
| Rosa | `#FF2D78` |
| Azul | `#3B5BF5` |
| Turquesa | `#00C9DB` |
| Verde | `#34D399` |
| Naranja | `#FF8C42` |
| Amarillo | `#FFBE0B` |
| Violeta | `#8B5CF6` |
| Ink | `#0D0D1A` |
| Snow | `#F6F7FB` |

## Page Sections

### 1. Hero — "Escanea. Aprende. Descubre."

- Dark cinematic background — Chignahuapan lagoon/clock area
- "TUKO" wordmark + "Turismo Conectado" tagline
- "Escanea. Aprende. Descubre." as the 3-word value prop
- 3D axolotl mascot (CSS/SVG) centered with floating animation
- Glowing QR code graphic next to axolotl
- Scroll indicator at bottom

### 2. Experience Demo — "Así funciona" (Phone Mockup)

Sticky phone mockup (CSS-drawn iPhone frame) center screen. Scroll-driven 4-step walkthrough:

1. **Scan** — Phone camera view + QR code being scanned
   - "Encuentra códigos QR en monumentos y puntos de interés"
2. **Meet** — Axolotl appears on phone with speech bubble
   - "Tu guía digital cobra vida y te da la bienvenida"
3. **Learn** — Axolotl "speaking" historical facts about lagoon clock
   - "Conoce la historia y datos curiosos del lugar"
4. **Discover** — Sponsor card (bakery) on phone screen
   - "Descubre negocios locales recomendados por tu guía"

Phone stays sticky, text panels change around it. Progress dots on side.

### 3. Character Spotlight — "Conoce a tu guía"

- Large 3D-style axolotl illustration (CSS/SVG — pink gills, Mesoamerican patterns, big eyes)
- Name reveal: "Tuki"
- Speech bubble: "¡Hola! Soy Tuki. Te cuento la historia de cada lugar que visitas."
- 3 trait badges: "Historiador" / "Curioso" / "Local"
- Bob animation, speech bubble fades in on scroll

### 4. Stats — "Chignahuapan en números"

Dark background, animated counters:
- **1531** — Año de fundación
- **70M+** — Esferas navideñas al año
- **150+** — Negocios locales
- **1** — Guía que lo sabe todo (with axolotl icon — playful)

Counters animate up on scroll. Colored underline accents.

### 5. Business CTA — "¿Tienes un negocio en un destino turístico?"

Gradient background (magenta → cobalt), split layout:

**Left:**
- "Miles de turistas escanean. Tu negocio aparece."
- Benefits: "Aparece cuando escanean cerca de ti" / "Analíticas de visitas en tiempo real" / "Paga solo por resultados"
- CTA: "Registra tu negocio"

**Right:**
- Mockup of sponsor card as seen in-app
- Bakery name, photo placeholder, "Recomendado por Tuki", distance badge

### 6. Footer

- "TUKO" wordmark + tagline
- Links: Para Turistas / Para Negocios / Contacto
- Social icons
- "Hecho en México"

## Animation Inventory

### Scroll-Triggered (IntersectionObserver)
- Hero stagger: title → subtitle → value prop → axolotl → QR
- Character spotlight: bob animation + speech bubble fade
- Stats counters: count up from 0 with easeOutCubic
- Business CTA: slide in from opposite sides

### Scroll-Position-Linked
- Phone mockup: sticky container, step transitions driven by scroll %
- Progress dots: active dot tracks current step

### Always Running
- Axolotl float: gentle translateY bob (6-8s loop)
- QR glow: pulsing box-shadow

## Responsive

- **Mobile (<768px):** Phone mockup scales down, text panels stack below, single-column business CTA
- **Desktop (>1024px):** Full experience with all animations

## Performance

- `prefers-reduced-motion` disables all animations
- Passive scroll listeners
- Animate only `transform` and `opacity`
- Lazy load images below fold
