# Tuko Landing Page — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a single-file immersive landing page for Tuko "Turismo Conectado" with Apple-inspired scroll animations, sticky destination showcase, and Bold Mexican Modern aesthetics.

**Architecture:** One self-contained HTML file (`tuko/index.html`) with inline `<style>` and `<script>`. No frameworks, no build step. Vanilla HTML/CSS/JS with IntersectionObserver + scroll listeners. Google Fonts loaded via CDN.

**Tech Stack:** HTML5, CSS3 (custom properties, keyframes, backdrop-filter, sticky positioning), Vanilla JS (IntersectionObserver, requestAnimationFrame, passive scroll listeners)

**Design doc:** `docs/plans/2026-02-24-tuko-website-design.md`

---

### Task 1: Scaffold — HTML skeleton + CSS variables + fonts

**Files:**
- Create: `tuko/index.html`

**Step 1: Create directory and file**

Create `tuko/index.html` with:
- `<!DOCTYPE html>` + lang="es"
- `<head>`: charset, viewport, title "Tuko — Turismo Conectado", meta description, Open Graph tags, JSON-LD (Organization), Google Fonts link (Fredoka 400-700, Inter 400-600, Montserrat 500-700)
- `<style>` block with CSS reset (`*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }`)
- CSS custom properties in `:root`:
  ```
  --magenta: #E72A88;
  --cobalt: #2A4BF2;
  --lima: #8AB73B;
  --marigold: #F5A623;
  --turquesa: #09ADC2;
  --night: #0A0E1A;
  --cream: #FFF8F0;
  ```
- Base typography: `body { font-family: 'Inter', sans-serif; color: #1a1a1a; background: var(--cream); overflow-x: hidden; }`
- Heading defaults: `h1, h2, h3 { font-family: 'Fredoka', sans-serif; }`
- `prefers-reduced-motion` media query: `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`
- Empty `<body>` with comment placeholders for each section
- Empty `<script>` block at end of body

**Step 2: Verify**

Open in browser via `python3 -m http.server 8889` from the `tuko/` directory. Page should load with cream background, no errors in console.

**Step 3: Commit**

```bash
git add tuko/index.html
git commit -m "feat(tuko): scaffold HTML skeleton with CSS variables and fonts"
```

---

### Task 2: Glassmorphic Nav

**Files:**
- Modify: `tuko/index.html`

**Step 1: Add nav HTML**

Inside `<body>`, add:
```html
<nav class="nav" id="mainNav">
  <div class="nav-inner">
    <a href="#" class="nav-logo">TUKO</a>
    <div class="nav-links">
      <a href="#destinos">Destinos</a>
      <a href="#como-funciona">Cómo Funciona</a>
      <a href="#negocios">Para Negocios</a>
      <a href="#contacto">Contacto</a>
    </div>
    <a href="#destinos" class="nav-cta">Explorar Destinos</a>
    <button class="nav-hamburger" aria-label="Menu">
      <span></span><span></span><span></span>
    </button>
  </div>
  <div class="papel-picado-edge"></div>
</nav>
```

**Step 2: Add nav CSS**

```css
.nav {
  position: fixed; top: 0; left: 0; right: 0;
  z-index: 1000;
  backdrop-filter: saturate(1.8) blur(20px);
  -webkit-backdrop-filter: saturate(1.8) blur(20px);
  background: rgba(10, 14, 26, 0.7);
  transition: background 0.3s;
}
.nav-inner {
  max-width: 1200px; margin: 0 auto;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.8rem 1.5rem;
}
.nav-logo {
  font-family: 'Fredoka', sans-serif; font-weight: 700; font-size: 1.8rem;
  background: linear-gradient(135deg, var(--magenta), var(--cobalt), var(--turquesa), var(--lima), var(--marigold));
  -webkit-background-clip: text; background-clip: text; color: transparent;
  text-decoration: none;
}
.nav-links { display: flex; gap: 2rem; }
.nav-links a {
  color: rgba(255,255,255,0.85); text-decoration: none;
  font-family: 'Montserrat', sans-serif; font-size: 0.9rem; font-weight: 500;
  transition: color 0.2s;
}
.nav-links a:hover { color: #fff; }
.nav-cta {
  background: var(--magenta); color: white; border: none;
  padding: 0.6rem 1.4rem; border-radius: 50px;
  font-family: 'Montserrat', sans-serif; font-weight: 600; font-size: 0.85rem;
  text-decoration: none; transition: transform 0.2s, box-shadow 0.2s;
}
.nav-cta:hover { transform: scale(1.05); box-shadow: 0 4px 20px rgba(231,42,136,0.4); }
.nav-hamburger { display: none; /* shown on mobile */ }
.papel-picado-edge {
  height: 12px; width: 100%;
  background: repeating-linear-gradient(
    90deg,
    var(--magenta) 0px, var(--magenta) 20px,
    transparent 20px, transparent 22px,
    var(--cobalt) 22px, var(--cobalt) 42px,
    transparent 42px, transparent 44px,
    var(--marigold) 44px, var(--marigold) 64px,
    transparent 64px, transparent 66px,
    var(--turquesa) 66px, var(--turquesa) 86px,
    transparent 86px, transparent 88px,
    var(--lima) 88px, var(--lima) 108px,
    transparent 108px, transparent 110px
  );
  mask: repeating-linear-gradient(90deg,
    transparent 0px, transparent 4px,
    black 4px, black 16px,
    transparent 16px, transparent 20px
  );
  -webkit-mask: repeating-linear-gradient(90deg,
    transparent 0px, transparent 4px,
    black 4px, black 16px,
    transparent 16px, transparent 20px
  );
  opacity: 0.8;
}
```

Add mobile responsive:
```css
@media (max-width: 768px) {
  .nav-links, .nav-cta { display: none; }
  .nav-hamburger {
    display: flex; flex-direction: column; gap: 5px;
    background: none; border: none; cursor: pointer; padding: 4px;
  }
  .nav-hamburger span {
    width: 24px; height: 2px; background: white; border-radius: 2px;
    transition: transform 0.3s;
  }
}
```

**Step 3: Verify**

Refresh browser. Glassmorphic nav should appear at top with gradient "TUKO" wordmark, links, magenta CTA pill, and colorful papel picado bottom edge. On mobile viewport: hamburger icon visible, links hidden.

**Step 4: Commit**

```bash
git add tuko/index.html
git commit -m "feat(tuko): add glassmorphic nav with papel picado edge"
```

---

### Task 3: Hero Section

**Files:**
- Modify: `tuko/index.html`

**Step 1: Find hero background image**

Search Wikimedia Commons for a high-quality Mexican landscape panoramic photo. Good candidates:
- Cenote aerial shot
- Mexican colonial town aerial
- Sierra Norte landscape
- Guanajuato colorful buildings

Use the direct Wikimedia `upload.wikimedia.org` thumbnail URL (1920px wide). Verify it returns HTTP 200 with `curl -s -o /dev/null -w "%{http_code}" "<URL>"`.

**Step 2: Add hero HTML**

After the `</nav>`:
```html
<section class="hero" id="inicio">
  <div class="hero-bg">
    <img src="<WIKIMEDIA_URL>" alt="Vista panorámica de México" loading="eager">
    <div class="hero-overlay"></div>
  </div>
  <div class="hero-floating" aria-hidden="true">
    <!-- JS will generate floating objects -->
  </div>
  <div class="hero-content">
    <h1 class="hero-title" data-stagger="0">TUKO</h1>
    <p class="hero-subtitle" data-stagger="1">TURISMO CONECTADO</p>
    <p class="hero-tagline" data-stagger="2">Descubre, conecta y vive los destinos más mágicos de México</p>
  </div>
  <div class="hero-scroll" data-stagger="3">
    <span>DESCUBRE MÁS</span>
    <div class="scroll-arrow">↓</div>
  </div>
</section>
```

**Step 3: Add hero CSS**

Key styles:
- `.hero`: `min-height: 100svh; position: relative; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; overflow: hidden;`
- `.hero-bg`: absolute fill, img with `object-fit: cover`, `transform: scale(1.1)` for parallax room
- `.hero-overlay`: absolute fill, `background: linear-gradient(180deg, rgba(10,14,26,0.4) 0%, rgba(10,14,26,0.2) 40%, rgba(10,14,26,0.7) 100%);`
- `.hero-title`: Fredoka, 120px+, `background: linear-gradient(135deg, var(--magenta), var(--cobalt), var(--turquesa), var(--lima), var(--marigold)); -webkit-background-clip: text; color: transparent;` with `text-shadow` fallback
- `.hero-subtitle`: Montserrat, 1.2rem, letter-spacing: 0.5em, color: rgba(255,255,255,0.8)
- `.hero-tagline`: Inter, 1.3rem, max-width: 600px, color: rgba(255,255,255,0.9)
- Stagger system: `[data-stagger] { opacity: 0; transform: translateY(30px); transition: opacity 0.8s ease, transform 0.8s ease; }` + `.hero.loaded [data-stagger] { opacity: 1; transform: translateY(0); }` with nth delays
- `.hero-scroll`: absolute bottom, bounce animation

**Step 4: Add hero JS**

In `<script>`:
- On `DOMContentLoaded`, add class `loaded` to `.hero` after 200ms
- Generate floating objects: 12-15 papel picado triangle divs + marigold petal divs with random positions, sizes, animation durations (6-14s), and delays
- Each floating object: CSS `@keyframes float` (translateY ±30px + rotate ±15deg)
- Simple parallax: passive scroll listener, `hero-bg img` translateY at 0.3x scroll rate

**Step 5: Verify**

Refresh. Full-screen hero with photo background, gradient "TUKO" title, staggered text reveal, floating colored shapes, scroll indicator bouncing at bottom. Scrolling moves background at parallax rate.

**Step 6: Commit**

```bash
git add tuko/index.html
git commit -m "feat(tuko): add hero with gradient title, floating objects, parallax"
```

---

### Task 4: Sticky Scroll Destinations Section

**Files:**
- Modify: `tuko/index.html`

This is the most complex section — the Apple-style sticky scroll with destination crossfades.

**Step 1: Find 5 destination photos**

Search Wikimedia Commons for landscape-oriented photos (1920px thumbnails) of:
1. Chignahuapan (church/spheres) — already have Basilica: `https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Basilica_Chignahuapan.jpg/1920px-Basilica_Chignahuapan.jpg`
2. San Cristóbal de las Casas (colonial streets)
3. Bacalar (laguna)
4. Taxco (panoramic)
5. Pátzcuaro (lake/island)

Verify each with curl for HTTP 200.

**Step 2: Add destinations HTML**

```html
<section class="destinations" id="destinos">
  <div class="destinations-sticky">
    <div class="destination-slides">
      <!-- 5 slides, each with bg image, name, fact, color -->
      <div class="destination-slide active" data-color="var(--marigold)" style="--accent: var(--marigold);">
        <img src="<CHIGNAHUAPAN_URL>" alt="Chignahuapan" loading="lazy">
        <div class="destination-overlay"></div>
        <div class="destination-info">
          <span class="destination-badge">Pueblo Mágico</span>
          <h2 class="destination-name">Chignahuapan</h2>
          <p class="destination-fact">Capital mundial de las esferas navideñas — 70 millones al año</p>
          <span class="destination-state">Puebla, México</span>
        </div>
      </div>
      <!-- Repeat for 4 more destinations -->
    </div>
    <div class="destination-dots">
      <button class="dot active" data-index="0"></button>
      <button class="dot" data-index="1"></button>
      <button class="dot" data-index="2"></button>
      <button class="dot" data-index="3"></button>
      <button class="dot" data-index="4"></button>
    </div>
  </div>
</section>
```

**Step 3: Add destinations CSS**

- `.destinations`: `height: 400vh; position: relative;` (4x viewport for scroll room)
- `.destinations-sticky`: `position: sticky; top: 0; height: 100vh; overflow: hidden;`
- `.destination-slide`: absolute fill, `opacity: 0; transition: opacity 0.8s ease;`
- `.destination-slide.active`: `opacity: 1;`
- `.destination-slide img`: `object-fit: cover; width: 100%; height: 100%;`
- `.destination-overlay`: gradient overlay for text readability
- `.destination-info`: absolute bottom-left, padding, z-index above overlay
- `.destination-name`: Fredoka, 4rem+, white, text-shadow
- `.destination-dots`: absolute right center, flex column, gap 12px
- `.dot`: 12px circles, `border: 2px solid white; border-radius: 50%; background: transparent;`
- `.dot.active`: `background: white; transform: scale(1.3);`

**Step 4: Add destinations JS**

```javascript
// Sticky scroll destination switcher
const destSection = document.querySelector('.destinations');
const slides = document.querySelectorAll('.destination-slide');
const dots = document.querySelectorAll('.destination-dots .dot');

function updateDestination() {
  if (!destSection) return;
  const rect = destSection.getBoundingClientRect();
  const sectionHeight = destSection.offsetHeight;
  const viewportHeight = window.innerHeight;
  const scrolled = -rect.top;
  const scrollableDistance = sectionHeight - viewportHeight;
  const progress = Math.max(0, Math.min(1, scrolled / scrollableDistance));
  const index = Math.min(slides.length - 1, Math.floor(progress * slides.length));

  slides.forEach((s, i) => s.classList.toggle('active', i === index));
  dots.forEach((d, i) => d.classList.toggle('active', i === index));
}

window.addEventListener('scroll', updateDestination, { passive: true });
```

**Step 5: Verify**

Scroll through the tall section. As you scroll, destinations crossfade between 5 photos with name/fact overlays. Progress dots on the right track the active slide. The sticky container stays pinned to viewport while scrolling.

**Step 6: Commit**

```bash
git add tuko/index.html
git commit -m "feat(tuko): add Apple-style sticky scroll destination showcase"
```

---

### Task 5: How It Works Section

**Files:**
- Modify: `tuko/index.html`

**Step 1: Add HTML**

```html
<section class="how-it-works" id="como-funciona">
  <h2 class="section-title reveal">Así de fácil</h2>
  <div class="steps">
    <div class="step reveal" style="--delay: 0s">
      <div class="step-icon"><!-- SVG compass --></div>
      <div class="step-number">01</div>
      <h3>Descubre</h3>
      <p>Explora destinos, experiencias y alojamiento en los rincones más mágicos de México</p>
    </div>
    <div class="step-connector reveal" style="--delay: 0.15s"></div>
    <div class="step reveal" style="--delay: 0.3s">
      <div class="step-icon"><!-- SVG phone --></div>
      <div class="step-number">02</div>
      <h3>Conecta</h3>
      <p>Contacta directo con negocios locales y planifica tu aventura sin intermediarios</p>
    </div>
    <div class="step-connector reveal" style="--delay: 0.45s"></div>
    <div class="step reveal" style="--delay: 0.6s">
      <div class="step-icon"><!-- SVG heart --></div>
      <div class="step-number">03</div>
      <h3>Vive</h3>
      <p>Vive experiencias únicas y auténticas que solo México puede ofrecer</p>
    </div>
  </div>
</section>
```

**Step 2: Add CSS**

- `.how-it-works`: padding 6rem 2rem, background var(--cream), text-align center
- `.section-title`: Fredoka, 3rem, margin-bottom 4rem
- `.steps`: display flex, justify-content center, align-items flex-start, gap 1rem, max-width 1000px, margin auto
- `.step`: flex 1, padding 2rem, background white, border-radius 16px, box-shadow subtle
- `.step-icon`: 80px circle with colored gradient bg, margin auto, contains inline SVG
- `.step-number`: Fredoka, small, magenta colored
- `.step h3`: Fredoka, 1.5rem
- `.step-connector`: width 60px, border-top 2px dashed var(--marigold), align-self center (desktop only, hidden on mobile)
- `.reveal`: `opacity: 0; transform: translateY(40px); transition: opacity 0.7s ease var(--delay, 0s), transform 0.7s ease var(--delay, 0s);`
- `.reveal.visible`: `opacity: 1; transform: translateY(0);`
- Mobile: `.steps` flex-direction column, connectors hidden

**Step 3: Add reveal observer JS**

```javascript
// Generic reveal animation observer
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
```

**Step 4: Verify**

Scroll to "Así de fácil" section. Three step cards stagger in from below with 150ms delays. Dotted connectors between them. Clean white cards on cream background.

**Step 5: Commit**

```bash
git add tuko/index.html
git commit -m "feat(tuko): add How It Works section with staggered reveals"
```

---

### Task 6: Stats Section with Counters

**Files:**
- Modify: `tuko/index.html`

**Step 1: Add HTML**

```html
<section class="stats" id="stats">
  <div class="stats-particles" aria-hidden="true"></div>
  <h2 class="section-title section-title--light reveal">México en números</h2>
  <div class="stats-grid">
    <div class="stat reveal" style="--delay: 0s; --accent: var(--magenta)">
      <span class="stat-number" data-target="177" data-suffix="+">0</span>
      <span class="stat-label">Pueblos Mágicos</span>
    </div>
    <div class="stat reveal" style="--delay: 0.15s; --accent: var(--cobalt)">
      <span class="stat-number" data-target="32">0</span>
      <span class="stat-label">Estados por explorar</span>
    </div>
    <div class="stat reveal" style="--delay: 0.3s; --accent: var(--marigold)">
      <span class="stat-number" data-target="1000" data-suffix="+">0</span>
      <span class="stat-label">Negocios registrados</span>
    </div>
    <div class="stat reveal" style="--delay: 0.45s; --accent: var(--turquesa)">
      <span class="stat-number" data-target="4.8" data-suffix="★" data-decimals="1">0</span>
      <span class="stat-label">Calificación promedio</span>
    </div>
  </div>
</section>
```

**Step 2: Add CSS**

- `.stats`: background var(--night), padding 6rem 2rem, text-align center, position relative, overflow hidden
- `.stats-particles`: absolute fill, z-index 0 (JS generates star dots)
- `.stats-grid`: display grid, grid-template-columns repeat(4, 1fr), gap 2rem, max-width 900px, margin auto
- `.stat-number`: Fredoka, 4rem, color white, display block
- `.stat-label`: Montserrat, 0.9rem, color rgba(255,255,255,0.7), uppercase, letter-spacing 0.1em
- `.stat::after`: pseudo-element colored underline bar using `var(--accent)`, width 60px, height 3px, glow box-shadow
- Star particle keyframes: small white dots with `@keyframes twinkle { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }`
- Mobile: 2-column grid

**Step 3: Add counter JS**

```javascript
// Counter animation
const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const el = entry.target;
      const target = parseFloat(el.dataset.target);
      const suffix = el.dataset.suffix || '';
      const decimals = parseInt(el.dataset.decimals) || 0;
      const duration = 2000;
      const start = performance.now();

      function update(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        const current = eased * target;
        el.textContent = (decimals ? current.toFixed(decimals) : Math.floor(current).toLocaleString()) + suffix;
        if (progress < 1) requestAnimationFrame(update);
      }
      requestAnimationFrame(update);
      counterObserver.unobserve(el);
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('.stat-number').forEach(el => counterObserver.observe(el));
```

Generate star particles: 30-40 small divs with random positions, twinkle keyframe at random delays.

**Step 4: Verify**

Scroll to dark stats section. Stars twinkle in background. Numbers count up with easeOutCubic when visible. Each stat has a colored glowing underline.

**Step 5: Commit**

```bash
git add tuko/index.html
git commit -m "feat(tuko): add stats section with animated counters and star particles"
```

---

### Task 7: Business CTA Section

**Files:**
- Modify: `tuko/index.html`

**Step 1: Add HTML**

```html
<section class="business-cta" id="negocios">
  <div class="business-content">
    <div class="business-text reveal" style="--delay: 0s">
      <h2>¿Tienes un negocio turístico?</h2>
      <p class="business-sub">Únete a la plataforma que conecta viajeros con experiencias auténticas</p>
      <ul class="business-benefits">
        <li><span class="check">✓</span> Alcanza miles de viajeros cada mes</li>
        <li><span class="check">✓</span> Dashboard de analíticas en tiempo real</li>
        <li><span class="check">✓</span> Reservaciones y contacto directo</li>
      </ul>
      <a href="#" class="business-btn">Registra tu negocio</a>
    </div>
    <div class="business-visual reveal" style="--delay: 0.2s">
      <!-- CSS-drawn mockup of a listing card -->
      <div class="mockup-card">
        <div class="mockup-img"></div>
        <div class="mockup-title"></div>
        <div class="mockup-stars">★★★★★</div>
        <div class="mockup-text"></div>
        <div class="mockup-btn"></div>
      </div>
    </div>
  </div>
</section>
```

**Step 2: Add CSS**

- `.business-cta`: `background: linear-gradient(135deg, var(--magenta) 0%, var(--cobalt) 100%);` padding 6rem 2rem
- `.business-content`: max-width 1100px, margin auto, display grid, grid-template-columns 1fr 1fr, gap 4rem, align-items center
- `.business-text h2`: Fredoka, 2.8rem, white
- `.business-benefits li`: flex, gap 0.5rem, color rgba(255,255,255,0.9), margin 0.8rem 0
- `.check`: color var(--marigold), font-weight bold
- `.business-btn`: inline-block, background white, color var(--night), padding 1rem 2.5rem, border-radius 50px, font-weight 700, Montserrat, hover transform scale
- `.mockup-card`: white bg, border-radius 16px, padding 1.5rem, box-shadow, transform rotate(3deg)
- Mockup internals: colored placeholder bars (skeleton-style) to represent a listing card
- Mobile: single column, mockup hidden or below text

**Step 3: Verify**

Scroll to gradient section. Left side text + benefits + white CTA button, right side tilted mockup card. Both slide in on scroll.

**Step 4: Commit**

```bash
git add tuko/index.html
git commit -m "feat(tuko): add business CTA section with gradient and mockup"
```

---

### Task 8: Footer

**Files:**
- Modify: `tuko/index.html`

**Step 1: Add HTML**

```html
<footer class="footer" id="contacto">
  <div class="papel-picado-edge"></div>
  <div class="footer-content">
    <div class="footer-brand">
      <span class="footer-logo">TUKO</span>
      <p>Turismo Conectado</p>
      <p class="footer-tagline">Descubre, conecta y vive México</p>
    </div>
    <div class="footer-col">
      <h4>Destinos</h4>
      <a href="#">Pueblos Mágicos</a>
      <a href="#">Playas</a>
      <a href="#">Ciudades</a>
      <a href="#">Naturaleza</a>
    </div>
    <div class="footer-col">
      <h4>Negocios</h4>
      <a href="#">Registra tu negocio</a>
      <a href="#">Planes</a>
      <a href="#">Soporte</a>
    </div>
    <div class="footer-col">
      <h4>Compañía</h4>
      <a href="#">Nosotros</a>
      <a href="#">Blog</a>
      <a href="#">Contacto</a>
    </div>
  </div>
  <div class="footer-bottom">
    <p>Hecho con orgullo en México</p>
    <p>© 2026 Tuko. Todos los derechos reservados.</p>
  </div>
</footer>
```

**Step 2: Add CSS**

- `.footer`: background var(--night), color white, padding-top 0 (papel picado takes top)
- `.footer .papel-picado-edge`: same pattern as nav
- `.footer-content`: max-width 1100px, margin auto, display grid, grid-template-columns 2fr 1fr 1fr 1fr, gap 2rem, padding 4rem 2rem
- `.footer-brand .footer-logo`: Fredoka, gradient text (same as nav)
- `.footer-col h4`: Montserrat, 0.9rem, uppercase, letter-spacing, margin-bottom 1rem, color var(--marigold)
- `.footer-col a`: display block, color rgba(255,255,255,0.7), text-decoration none, margin 0.5rem 0, hover color white
- `.footer-bottom`: border-top 1px solid rgba(255,255,255,0.1), padding 2rem, text-align center, color rgba(255,255,255,0.5), font-size 0.85rem
- Mobile: single column

**Step 3: Verify**

Full footer with gradient TUKO logo, 4-column link grid, papel picado top border, bottom credits line.

**Step 4: Commit**

```bash
git add tuko/index.html
git commit -m "feat(tuko): add footer with link grid and papel picado border"
```

---

### Task 9: Final Polish — Mobile Nav, Smooth Scroll, Visibility API

**Files:**
- Modify: `tuko/index.html`

**Step 1: Mobile hamburger menu**

Add JS: toggle class on `.nav` when hamburger clicked, show full-screen mobile menu overlay with links. Close on link click or X.

**Step 2: Smooth scroll**

```javascript
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.querySelector(link.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});
```

**Step 3: Visibility API pause**

```javascript
document.addEventListener('visibilitychange', () => {
  document.body.classList.toggle('paused', document.hidden);
});
// In CSS: .paused * { animation-play-state: paused !important; }
```

**Step 4: will-change management**

Add JS that applies `will-change: transform, opacity` to `.reveal` elements just before they enter viewport (via observer with larger rootMargin), removes it 1s after animation completes.

**Step 5: Full visual test**

Test on desktop and mobile viewport. Check:
- All sections load and animate correctly
- Sticky scroll destination section crossfades properly
- Nav glassmorphism works
- Counters count up
- Mobile hamburger menu works
- Smooth scroll to sections
- No console errors
- `prefers-reduced-motion` disables animations

**Step 6: Commit**

```bash
git add tuko/index.html
git commit -m "feat(tuko): add mobile nav, smooth scroll, visibility pause, polish"
```

---

### Task 10: Deploy

**Step 1: Deploy to Vercel**

Since this is a standalone project, deploy the `tuko/` directory:
```bash
cd tuko && vercel --prod
```

Or if deploying within the existing frontend project, add rewrite rules to `frontend/vercel.json` for `/tuko` path.

**Step 2: Verify live URL**

Open deployed URL and test all sections, animations, and mobile responsiveness.

**Step 3: Commit any deployment config**

```bash
git add -A
git commit -m "feat(tuko): deploy landing page"
```
