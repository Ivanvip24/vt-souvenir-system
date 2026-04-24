#!/usr/bin/env node

/**
 * AXKAN Historia Page Builder
 *
 * Generates static historia pages from JSON destination files.
 * Each JSON in destinations/ produces a {slug}/historia.html file.
 *
 * Usage:
 *   node build-historia.js              # Build all destinations
 *   node build-historia.js acapulco     # Build one destination
 *
 * Destinations with "ejected": true are skipped (managed manually).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESTINATIONS_DIR = path.join(__dirname, 'destinations');
const OUTPUT_DIR = __dirname; // souvenirs/ — outputs to {slug}/historia.html

// ─── Color System ───────────────────────────────────────────────────────────

const COLORS = {
  rosa:     { var: 'var(--rosa)',     rgba: 'rgba(231,42,136,',  shadow: 'rgba(231,42,136,.25)' },
  verde:    { var: 'var(--verde)',    rgba: 'rgba(138,183,59,',  shadow: 'rgba(138,183,59,.25)' },
  naranja:  { var: 'var(--naranja)',  rgba: 'rgba(243,146,35,',  shadow: 'rgba(243,146,35,.25)' },
  turquesa: { var: 'var(--turquesa)', rgba: 'rgba(9,173,194,',   shadow: 'rgba(9,173,194,.25)' },
  rojo:     { var: 'var(--rojo)',     rgba: 'rgba(229,36,33,',   shadow: 'rgba(229,36,33,.25)' },
  oro:      { var: 'var(--oro)',      rgba: 'rgba(212,165,116,',  shadow: 'rgba(212,165,116,.25)' },
};

const ACCENT_PRESETS = {
  rosa:     { bg3: '#FFF7FB', timelineGradient: 'var(--rosa),var(--turquesa),var(--verde),var(--naranja)' },
  naranja:  { bg3: '#FFF7F0', timelineGradient: 'var(--naranja),var(--rojo),var(--rosa),var(--oro)' },
  turquesa: { bg3: '#F0FDFF', timelineGradient: 'var(--turquesa),var(--verde),var(--naranja),var(--rosa)' },
  verde:    { bg3: '#F5FFF0', timelineGradient: 'var(--verde),var(--turquesa),var(--naranja),var(--rosa)' },
  rojo:     { bg3: '#FFF0F0', timelineGradient: 'var(--rojo),var(--naranja),var(--rosa),var(--oro)' },
};

function cv(name) { return COLORS[name]?.var || `var(--${name})`; }
function crgba(name, op = '.1') { return (COLORS[name]?.rgba || 'rgba(0,0,0,') + op + ')'; }

// ─── HTML Generators ────────────────────────────────────────────────────────

function renderStats(stats) {
  return stats.map(s =>
    `      <div class="stat anim"><div class="stat-n" data-ct="${s.value}"${s.suffix ? ` data-sf="${s.suffix}"` : ''} style="color:${cv(s.color)}">0</div><div class="stat-d">${s.label}</div></div>`
  ).join('\n');
}

function renderMarquee(facts, opts = {}) {
  const pills = facts.map(f =>
    `    <div class="mq-pill"><span>${f.emoji}</span> ${f.text}</div>`
  ).join('\n');
  // Duplicate for seamless loop
  return `${pills}\n${pills}`;
}

function renderPillButtons(pills) {
  return pills.map((p, i) =>
    `    <button class="pill${i === 0 ? ' on' : ''}" data-pill="${i}">${p.emoji} ${p.label}</button>`
  ).join('\n');
}

function renderPillPanels(pills) {
  return pills.map((p, i) =>
    `    <div class="pill-panel${i === 0 ? ' on' : ''}" data-panel="${i}">
      <img src="${p.image}" alt="${p.imageAlt}" class="pill-panel-img">
      <h3>${p.title}</h3>
      <p>${p.text}</p>
      <div class="pill-fact" style="background:${crgba(p.factColor)};color:${cv(p.factColor)}">${p.factEmoji} ${p.factText}</div>
    </div>`
  ).join('\n');
}

function renderTimeline(items) {
  return items.map(t =>
    `      <div class="tl-item anim"><div class="tl-dot" style="border-color:${cv(t.color)}"></div><div class="tl-year" style="color:${cv(t.color)}">${t.year}</div><div class="tl-title">${t.title}</div><div class="tl-desc">${t.desc}</div></div>`
  ).join('\n');
}

function renderBlurCards(cards) {
  return cards.map(c =>
    `    <div class="blur-card" data-blur>
      <img src="${c.image}" alt="${c.alt}" class="blur-card-img">
      <div class="blur-card-label">${c.label}</div>
      <div class="blur-card-tap">+</div>
      <div class="blur-card-body"><h3>${c.title}</h3><p>${c.text}</p></div>
    </div>`
  ).join('\n');
}

function renderCarousel(slides) {
  return slides.map(s =>
    `      <div class="carousel-slide"><img src="${s.image}" alt="${s.alt}" loading="lazy"><div class="carousel-cap"><h3>${s.title}</h3><p>${s.subtitle}</p></div></div>`
  ).join('\n');
}

// ─── Main Template ──────────────────────────────────────────────────────────

function generateHTML(d) {
  const accent = COLORS[d.accent] || COLORS.rosa;
  const preset = ACCENT_PRESETS[d.accent] || ACCENT_PRESETS.rosa;

  const customAt = (pos) => (d.customSections || [])
    .filter(s => s.position === pos)
    .map(s => s.html)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-ZJG9RMJWZS"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-ZJG9RMJWZS');</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${d.name} — Historia | AXKAN Souvenirs</title>
<meta name="description" content="${d.metaDescription}">
<meta property="og:title" content="${d.name} — Historia | AXKAN Souvenirs">
<meta property="og:description" content="${d.ogDescription}">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap" rel="stylesheet">
<link rel="icon" type="image/png" href="../../assets/LOGO-01.png">

<script type="application/ld+json">
{
  "@context":"https://schema.org",
  "@type":"TouristDestination",
  "name":"${d.name}",
  "description":"${d.metaDescription}",
  "geo":{"@type":"GeoCoordinates","latitude":${d.coords.split('°')[0]},"longitude":-${d.coords.split('· ')[1].split('°')[0]}},
  "touristType":["Cultural","Beach","Adventure"],
  "isPartOf":{"@type":"AdministrativeArea","name":"${d.state}"}
}
</script>

<style>
@font-face{font-family:'RL AQVA';src:url('../../fonts/rl-aqva-black.otf') format('opentype');font-weight:900;font-display:swap}

:root{
  --rosa:#e72a88;--verde:#8ab73b;--naranja:#f39223;--turquesa:#09adc2;--rojo:#e52421;--oro:#D4A574;
  --bg:#fff;--bg2:#FAFAFA;--bg3:${preset.bg3};--cream:#FEF9F2;
  --tx:#1a1a1a;--tx2:#333;--tx3:#777;
  --fd:'RL AQVA','Syne',sans-serif;--fh:'Syne',sans-serif;--fb:'DM Sans',sans-serif;
  --eo:cubic-bezier(.16,1,.3,1);
}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html{-webkit-tap-highlight-color:transparent}
html.lenis,html.lenis body{height:auto}
body{font-family:var(--fb);color:var(--tx);background:var(--bg);overflow-x:hidden;line-height:1.65;-webkit-font-smoothing:antialiased}
img{max-width:100%;height:auto;display:block}
a{text-decoration:none;color:inherit}

.ld{position:fixed;inset:0;z-index:9999;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.5rem;transition:opacity .6s,visibility .6s}
.ld.done{opacity:0;visibility:hidden;pointer-events:none}
.ld-bar{width:100px;height:2px;background:#f0f0f0;border-radius:2px;overflow:hidden}
.ld-fill{height:100%;width:0%;background:${accent.var};border-radius:2px;transition:width .15s}

.sec{padding:4rem 1.25rem;position:relative}
.sec-inner{max-width:600px;margin:0 auto}
.sec-label{font-family:var(--fh);font-size:.55rem;font-weight:700;letter-spacing:5px;text-transform:uppercase;margin-bottom:.75rem}
.sec-title{font-family:var(--fd);font-size:clamp(1.8rem,6vw,2.8rem);font-weight:900;line-height:1;margin-bottom:1.25rem;color:var(--tx)}
.sec-body{font-size:.9rem;color:var(--tx2);line-height:1.75;margin-bottom:1rem}
.sec-body strong{color:var(--tx);font-weight:600}

.hero{min-height:100svh;display:flex;align-items:center;justify-content:center;text-align:center;padding:5rem 1.25rem;position:relative;overflow:hidden}
.hero-bg{position:absolute;inset:0;z-index:0}
.hero-bg img{width:100%;height:100%;object-fit:cover;filter:brightness(.4) saturate(1.2)}
.hero-over{position:absolute;inset:0;z-index:1;background:linear-gradient(to bottom,rgba(0,0,0,.15),rgba(30,15,0,.55))}
.hero-c{position:relative;z-index:2;color:#fff}
.hero-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border:1px solid rgba(255,255,255,.2);border-radius:100px;font-family:var(--fh);font-size:.55rem;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:rgba(255,255,255,.7);backdrop-filter:blur(8px);margin-bottom:1.5rem}
.hero-badge-dot{width:5px;height:5px;border-radius:50%;background:${accent.var};box-shadow:0 0 10px ${accent.var}}
.hero-title{font-family:var(--fd);font-size:clamp(3.8rem,18vw,11rem);font-weight:900;line-height:.82;letter-spacing:-2px;margin-bottom:1rem}
.hero-sub{font-size:clamp(.9rem,2.5vw,1.1rem);color:rgba(255,255,255,.65);font-style:italic;max-width:340px;margin:0 auto .75rem}
.hero-coords{font-family:var(--fh);font-size:.5rem;letter-spacing:5px;color:rgba(255,255,255,.3)}
.hero-scroll{margin-top:2.5rem;display:flex;flex-direction:column;align-items:center;gap:6px}
.hero-scroll span{font-family:var(--fh);font-size:.5rem;letter-spacing:4px;text-transform:uppercase;color:rgba(255,255,255,.3)}
.hero-scroll-line{width:1px;height:32px;position:relative;overflow:hidden}
.hero-scroll-line::after{content:'';position:absolute;top:-100%;width:100%;height:100%;background:linear-gradient(to bottom,transparent,${accent.var});animation:sl 2s ease-in-out infinite}
@keyframes sl{0%{top:-100%}100%{top:100%}}

.pills-wrap{position:relative;padding:3rem 1.25rem 4rem;background:var(--bg2)}
.pills-bar{display:flex;gap:6px;overflow-x:auto;padding:0 0 1rem;scrollbar-width:none;-webkit-overflow-scrolling:touch;max-width:600px;margin:0 auto 1.5rem}
.pills-bar::-webkit-scrollbar{display:none}
.pill{padding:10px 18px;border-radius:100px;border:1.5px solid #e0e0e0;background:var(--bg);font-family:var(--fh);font-size:.72rem;font-weight:600;color:var(--tx2);cursor:pointer;white-space:nowrap;transition:all .35s var(--eo);flex-shrink:0}
.pill.on{background:${accent.var};color:#fff;border-color:${accent.var};box-shadow:0 4px 16px ${accent.shadow}}
.pill:active{transform:scale(.95)}
.pill-content{max-width:600px;margin:0 auto;position:relative;min-height:300px}
.pill-panel{position:absolute;inset:0;opacity:0;transform:translateY(16px);transition:opacity .5s var(--eo),transform .5s var(--eo);pointer-events:none}
.pill-panel.on{opacity:1;transform:translateY(0);pointer-events:auto;position:relative}
.pill-panel-img{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:16px;margin-bottom:1rem;box-shadow:0 8px 32px rgba(0,0,0,.08)}
.pill-panel h3{font-family:var(--fd);font-size:1.5rem;font-weight:900;margin-bottom:.5rem;color:var(--tx)}
.pill-panel p{font-size:.88rem;color:var(--tx2);line-height:1.7}
.pill-panel .pill-fact{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:100px;font-size:.65rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-top:.75rem}

.px-break{position:relative;height:60vh;overflow:hidden}
.px-break img{position:absolute;inset:-20% 0;width:100%;height:140%;object-fit:cover;will-change:transform}
.px-break-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35);z-index:1}
.px-break-text{color:#fff;text-align:center;padding:0 1.5rem}
.px-break-text h2{font-family:var(--fd);font-size:clamp(1.6rem,5vw,2.5rem);font-weight:900;line-height:1;margin-bottom:.5rem}
.px-break-text p{font-size:.82rem;color:rgba(255,255,255,.65)}

.timeline{max-width:600px;margin:0 auto;position:relative;padding-left:28px}
.timeline::before{content:'';position:absolute;left:8px;top:0;bottom:0;width:2px;background:linear-gradient(to bottom,${preset.timelineGradient})}
.tl-item{position:relative;padding-bottom:2.5rem}
.tl-item:last-child{padding-bottom:0}
.tl-dot{position:absolute;left:-24px;top:4px;width:12px;height:12px;border-radius:50%;border:2px solid ${accent.var};background:#0a0f1a;z-index:1;transition:all .4s var(--eo)}
.tl-item.vis .tl-dot{background:${accent.var};box-shadow:0 0 0 4px ${crgba(d.accent, '.2')}}
.tl-year{font-family:var(--fd);font-size:1rem;font-weight:900;margin-bottom:4px}
.tl-title{font-family:var(--fh);font-size:.85rem;font-weight:700;color:#fff;margin-bottom:3px}
.tl-desc{font-size:.78rem;color:rgba(255,255,255,.5);line-height:1.6}

.blur-grid{display:grid;grid-template-columns:1fr;gap:12px;max-width:600px;margin:0 auto}
.blur-card{position:relative;border-radius:16px;overflow:hidden;cursor:pointer;transition:all .5s var(--eo)}
.blur-card-img{width:100%;aspect-ratio:16/10;object-fit:cover;filter:blur(8px) brightness(.7);transform:scale(1.1);transition:filter .6s var(--eo),transform .6s var(--eo)}
.blur-card.open .blur-card-img{filter:blur(0) brightness(.55);transform:scale(1)}
.blur-card-label{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:2;font-family:var(--fd);font-size:1.3rem;font-weight:900;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.3);transition:opacity .4s}
.blur-card.open .blur-card-label{opacity:0}
.blur-card-body{position:absolute;bottom:0;left:0;right:0;z-index:2;padding:2.5rem 1.25rem 1.25rem;background:linear-gradient(to top,rgba(0,0,0,.8),transparent);color:#fff;transform:translateY(100%);transition:transform .5s var(--eo)}
.blur-card.open .blur-card-body{transform:translateY(0)}
.blur-card-body h3{font-family:var(--fh);font-size:.95rem;font-weight:700;margin-bottom:4px}
.blur-card-body p{font-size:.78rem;color:rgba(255,255,255,.7);line-height:1.5}
.blur-card-tap{position:absolute;top:.75rem;right:.75rem;z-index:3;width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.15);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;font-size:.65rem;color:#fff;transition:transform .3s var(--eo)}
.blur-card.open .blur-card-tap{transform:rotate(45deg)}

.carousel-wrap{padding:0;position:relative}
.carousel-track{display:flex;gap:12px;padding:0 1.25rem;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.carousel-track::-webkit-scrollbar{display:none}
.carousel-slide{flex:0 0 82%;scroll-snap-align:center;border-radius:16px;overflow:hidden;position:relative}
.carousel-slide img{width:100%;aspect-ratio:3/4;object-fit:cover}
.carousel-cap{position:absolute;bottom:0;left:0;right:0;padding:3rem 1rem 1rem;background:linear-gradient(to top,rgba(0,0,0,.7),transparent);color:#fff}
.carousel-cap h3{font-family:var(--fh);font-size:.9rem;font-weight:700;margin-bottom:2px}
.carousel-cap p{font-size:.68rem;color:rgba(255,255,255,.6)}
.carousel-dots{display:flex;justify-content:center;gap:6px;margin-top:1rem;padding:0 1.25rem}
.carousel-dot{width:6px;height:6px;border-radius:50%;background:#ddd;transition:all .3s var(--eo)}
.carousel-dot.on{background:${accent.var};transform:scale(1.4)}

.stats{display:flex;justify-content:space-between;gap:.5rem;padding:1.5rem 0;border-top:1px solid #f0f0f0;border-bottom:1px solid #f0f0f0;margin:1.5rem 0}
.stat{text-align:center;flex:1}
.stat-n{font-family:var(--fd);font-size:clamp(1.2rem,4vw,1.6rem);font-weight:900;line-height:1;margin-bottom:3px}
.stat-d{font-size:.55rem;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--tx3);line-height:1.3}

.ft{padding:2.5rem 1.25rem 1.5rem;background:#111;color:rgba(255,255,255,.5);text-align:center}
.ft img{height:36px;margin:0 auto 1rem;filter:brightness(0) invert(1);opacity:.5}
.ft p{font-size:.75rem;line-height:1.6}
.ft-links{display:flex;justify-content:center;gap:1.5rem;margin-top:1rem;flex-wrap:wrap}
.ft-links a{font-size:.72rem;color:rgba(255,255,255,.4);transition:color .3s}

.marquee-wrap{overflow:hidden;padding:1.5rem 0;background:var(--bg)}
.marquee-track{display:flex;gap:12px;width:max-content;animation:marquee 60s linear infinite}
.marquee-track:hover{animation-play-state:paused}
@keyframes marquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.mq-pill{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:100px;background:var(--bg2);border:1px solid #eee;font-size:.75rem;font-weight:500;color:var(--tx2);white-space:nowrap;flex-shrink:0;transition:transform .3s var(--eo),box-shadow .3s}
.mq-pill:active{transform:scale(.95)}
.mq-pill span{font-size:1rem}

.anim{opacity:0;transform:translateY(32px);transition:opacity .7s var(--eo),transform .7s var(--eo)}
.anim.vis{opacity:1;transform:translateY(0)}

@media(min-width:600px){
  .blur-grid{grid-template-columns:1fr 1fr}
  .carousel-slide{flex:0 0 48%}
}
@media(min-width:900px){
  .carousel-slide{flex:0 0 38%}
  .sec-inner{max-width:700px}
}
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}
}
</style>
</head>
<body>

<div class="ld" id="ld"><div class="ld-bar"><div class="ld-fill" id="ldF"></div></div></div>

<a href="https://axkan.art" target="_blank" style="position:fixed;top:1rem;left:1.25rem;z-index:100"><img src="../../assets/LOGO-03.png" alt="AXKAN" style="height:36px;filter:drop-shadow(0 2px 8px rgba(0,0,0,.3))"></a>

<!-- HERO -->
<section class="hero" id="hero">
  <div class="hero-bg"><img src="${d.heroImage}" alt="${d.heroAlt}"></div>
  <div class="hero-over"></div>
  <div class="hero-c">
    <div class="hero-badge"><span class="hero-badge-dot"></span> ${d.state}</div>
    <h1 class="hero-title">${d.name.toUpperCase()}</h1>
    <p class="hero-sub">${d.tagline}</p>
    <p class="hero-coords">${d.coords}</p>
    <div class="hero-scroll"><span>Descubre</span><div class="hero-scroll-line"></div></div>
  </div>
</section>

<!-- STATS -->
<section class="sec" style="background:var(--bg)">
  <div class="sec-inner">
    <div class="stats">
${renderStats(d.stats)}
    </div>
  </div>
</section>
${customAt('after-stats')}

<!-- SCROLLING FACTS ROW 1+2 -->
<div class="marquee-wrap" style="display:flex;flex-direction:column;gap:8px;padding:1.5rem 0">
  <div class="marquee-track">
${renderMarquee(d.facts1)}
  </div>
  <div class="marquee-track" style="animation-direction:reverse;animation-duration:70s">
${renderMarquee(d.facts2)}
  </div>
</div>
${customAt('after-facts')}

<!-- PILL TABS -->
<section class="pills-wrap" id="pills">
  <div class="sec-inner" style="margin-bottom:0">
    <p class="sec-label anim" style="color:${accent.var}">${d.pillsLabel}</p>
    <h2 class="sec-title anim">Toca para descubrir</h2>
  </div>
  <div class="pills-bar" id="pillsBar">
${renderPillButtons(d.pills)}
  </div>
  <div class="pill-content" id="pillContent">
${renderPillPanels(d.pills)}
  </div>
</section>
${customAt('after-pills')}

<!-- PARALLAX BREAK 1 -->
<div class="px-break" id="px1">
  <img src="${d.parallax[0].image}" alt="${d.parallax[0].alt}" id="px1Img">
  <div class="px-break-overlay">
    <div class="px-break-text">
      <h2>${d.parallax[0].title}</h2>
      <p>${d.parallax[0].subtitle}</p>
    </div>
  </div>
</div>

<!-- TIMELINE -->
<section class="sec" style="background:#0a0f1a;color:#fff">
  <div class="sec-inner">
    <p class="sec-label anim" style="color:${accent.var}">A través del tiempo</p>
    <h2 class="sec-title anim" style="color:#fff">${d.timelineTitle}</h2>
    <div class="timeline" id="timeline">
${renderTimeline(d.timeline)}
    </div>
  </div>
</section>
${customAt('after-timeline')}

<!-- PARALLAX BREAK 2 -->
<div class="px-break" id="px2">
  <img src="${d.parallax[1].image}" alt="${d.parallax[1].alt}" id="px2Img">
  <div class="px-break-overlay">
    <div class="px-break-text">
      <h2>${d.parallax[1].title}</h2>
      <p>${d.parallax[1].subtitle}</p>
    </div>
  </div>
</div>

<!-- SCROLLING FACTS ROW 3 -->
<div class="marquee-wrap" style="background:var(--bg2)">
  <div class="marquee-track" style="animation-direction:reverse;animation-duration:35s">
${renderMarquee(d.facts3)}
  </div>
</div>

<!-- BLUR CARDS -->
<section class="sec" style="background:var(--bg2)">
  <div class="sec-inner">
    <p class="sec-label anim" style="color:${accent.var}">Toca para descubrir</p>
    <h2 class="sec-title anim">${d.blurTitle}</h2>
  </div>
  <div class="blur-grid" id="blurGrid" style="max-width:600px;margin:1.5rem auto 0;padding:0 1.25rem">
${renderBlurCards(d.blurCards)}
  </div>
</section>
${customAt('after-blur-cards')}

<!-- CAROUSEL -->
<section class="sec" style="background:var(--bg);padding-bottom:3rem">
  <div class="sec-inner">
    <p class="sec-label anim" style="color:${cv(d.carouselLabelColor)}">Momentos</p>
    <h2 class="sec-title anim">${d.carouselTitle}</h2>
  </div>
  <div class="carousel-wrap">
    <div class="carousel-track" id="carouselTrack">
${renderCarousel(d.carousel)}
    </div>
    <div class="carousel-dots" id="carouselDots"></div>
  </div>
</section>
${customAt('after-carousel')}

<!-- BRAND CLOSE -->
<section class="sec" style="background:var(--bg3);text-align:center;padding:5rem 1.25rem">
  <div class="sec-inner" style="display:flex;flex-direction:column;align-items:center">
    <p class="sec-label anim" style="color:${accent.var}">Recuerdos hechos souvenir</p>
    <h2 class="sec-title anim">Llévate México contigo</h2>
    <p class="sec-body anim" style="text-align:center;max-width:360px">Cada pieza AXKAN captura el momento exacto cuando México te hizo sentir algo real.</p>
    <a href="https://axkan.art" target="_blank"><img src="../../assets/LOGO-03.png" alt="AXKAN" class="anim" style="height:48px;opacity:.4;margin-top:1rem"></a>
  </div>
</section>

<!-- FOOTER -->
<footer class="ft">
  <a href="https://axkan.art" target="_blank"><img src="../../assets/LETTERS.png" alt="AXKAN"></a>
  <p>Souvenirs que despiertan el orgullo mexicano.</p>
  <div class="ft-links">
    <a href="/souvenirs/">Destinos</a>
    <a href="/productos/">Productos</a>
    <a href="https://vtanunciando.com" target="_blank">Catálogo</a>
    <a href="https://www.instagram.com/axkan.mx/" target="_blank">Instagram</a>
  </div>
  <p style="margin-top:1.5rem;font-size:.65rem;color:rgba(255,255,255,.25)">© 2026 AXKAN · Hecho en México</p>
</footer>

<script src="../assets/js/gsap.min.js"></script>
<script src="../assets/js/ScrollTrigger.min.js"></script>
<script src="../assets/js/lenis.min.js"></script>

<script>
(()=>{
'use strict';
gsap.registerPlugin(ScrollTrigger);

const lenis=new Lenis({lerp:.08,smoothWheel:true});
lenis.on('scroll',ScrollTrigger.update);
gsap.ticker.add(t=>lenis.raf(t*1000));
gsap.ticker.lagSmoothing(0);

const ldF=document.getElementById('ldF'),ld=document.getElementById('ld');
let pg=0;const li=setInterval(()=>{pg+=6+Math.random()*14;if(pg>100)pg=100;ldF.style.width=pg+'%';if(pg>=100){clearInterval(li);setTimeout(()=>{ld.classList.add('done');ScrollTrigger.refresh()},400)}},80);

gsap.to('.hero-bg img',{yPercent:20,scale:1.15,ease:'none',scrollTrigger:{trigger:'.hero',start:'top top',end:'bottom top',scrub:true}});
gsap.to('.hero-c',{opacity:0,y:-60,ease:'none',scrollTrigger:{trigger:'.hero',start:'30% top',end:'80% top',scrub:true}});

gsap.from('.hero-badge',{opacity:0,y:20,duration:1,delay:1,ease:'elastic.out(0.8,0.8)'});
gsap.from('.hero-title',{opacity:0,y:40,duration:1.2,delay:1.2,ease:'elastic.out(0.8,0.7)'});
gsap.from('.hero-sub',{opacity:0,y:20,duration:.9,delay:1.5,ease:'elastic.out(0.8,0.8)'});
gsap.from('.hero-coords',{opacity:0,y:15,duration:.8,delay:1.7,ease:'power3.out'});
gsap.from('.hero-scroll',{opacity:0,delay:2.2,duration:1});

let cDone=false;
ScrollTrigger.create({trigger:'.stats',start:'top 80%',onEnter:()=>{
  if(cDone)return;cDone=true;
  document.querySelectorAll('[data-ct]').forEach(el=>{
    const t=parseInt(el.dataset.ct),s=el.dataset.sf||'';
    gsap.fromTo({v:0},{v:0},{v:t,duration:1.5,ease:'power2.out',onUpdate:function(){el.textContent=Math.round(this.targets()[0].v).toLocaleString()+s}});
  });
}});

const pills=document.querySelectorAll('.pill');
const panels=document.querySelectorAll('.pill-panel');
pills.forEach(p=>{
  p.addEventListener('click',()=>{
    const idx=p.dataset.pill;
    pills.forEach(pp=>pp.classList.remove('on'));
    p.classList.add('on');
    panels.forEach(pn=>{pn.classList.remove('on')});
    document.querySelector('[data-panel="'+idx+'"]').classList.add('on');
  });
});

document.querySelectorAll('.px-break img').forEach(img=>{
  gsap.to(img,{yPercent:30,ease:'none',scrollTrigger:{trigger:img.parentElement,start:'top bottom',end:'bottom top',scrub:true}});
});

document.querySelectorAll('.px-break-text').forEach(el=>{
  gsap.from(el,{opacity:0,y:40,duration:1,ease:'elastic.out(0.8,0.8)',scrollTrigger:{trigger:el,start:'top 80%'}});
});

document.querySelectorAll('.tl-item').forEach(item=>{
  ScrollTrigger.create({trigger:item,start:'top 75%',onEnter:()=>item.classList.add('vis')});
});

document.querySelectorAll('[data-blur]').forEach(card=>{
  card.addEventListener('click',()=>{
    const wasOpen=card.classList.contains('open');
    document.querySelectorAll('[data-blur]').forEach(c=>c.classList.remove('open'));
    if(!wasOpen)card.classList.add('open');
  });
});

const cTrack=document.getElementById('carouselTrack');
const cDots=document.getElementById('carouselDots');
const slides=cTrack.querySelectorAll('.carousel-slide');
slides.forEach((_,i)=>{
  const dot=document.createElement('div');
  dot.classList.add('carousel-dot');
  if(i===0)dot.classList.add('on');
  cDots.appendChild(dot);
});
const allDots=cDots.querySelectorAll('.carousel-dot');
cTrack.addEventListener('scroll',()=>{
  const scrollLeft=cTrack.scrollLeft;
  const slideWidth=slides[0].offsetWidth+12;
  const idx=Math.round(scrollLeft/slideWidth);
  allDots.forEach((d,i)=>d.classList.toggle('on',i===idx));
},{passive:true});

const obs=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('vis');obs.unobserve(e.target)}})},{threshold:.15,rootMargin:'0px 0px -30px 0px'});
document.querySelectorAll('.anim').forEach(el=>obs.observe(el));

addEventListener('resize',()=>ScrollTrigger.refresh());
document.addEventListener('visibilitychange',()=>{if(document.hidden)gsap.globalTimeline.pause();else gsap.globalTimeline.resume()});

})();
</script>
</body>
</html>`;
}

// ─── Build Logic ────────────────────────────────────────────────────────────

export function buildHistoriaPages() {
  if (!fs.existsSync(DESTINATIONS_DIR)) {
    console.log('  No destinations/ directory found, skipping historia build');
    return 0;
  }

  const files = fs.readdirSync(DESTINATIONS_DIR).filter(f => f.endsWith('.json'));
  let built = 0;
  let skipped = 0;

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(DESTINATIONS_DIR, file), 'utf-8'));

    if (data.ejected) {
      console.log(`  ⏭  ${data.name} (ejected — skipping)`);
      skipped++;
      continue;
    }

    const outDir = path.join(OUTPUT_DIR, data.slug);
    fs.mkdirSync(outDir, { recursive: true });

    const html = generateHTML(data);
    const outPath = path.join(outDir, 'historia.html');
    fs.writeFileSync(outPath, html);
    console.log(`  ✓  ${data.name} → ${data.slug}/historia.html`);
    built++;
  }

  return { built, skipped };
}

// ─── CLI Entry Point ────────────────────────────────────────────────────────

// Run standalone if called directly
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  console.log('AXKAN Historia Builder\n');

  const filterSlug = process.argv[2];

  if (filterSlug) {
    const file = path.join(DESTINATIONS_DIR, `${filterSlug}.json`);
    if (!fs.existsSync(file)) {
      console.error(`Destination not found: ${filterSlug}.json`);
      process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (data.ejected) {
      console.log(`${data.name} is ejected — skipping`);
      process.exit(0);
    }
    const outDir = path.join(OUTPUT_DIR, data.slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'historia.html'), generateHTML(data));
    console.log(`✓ Built ${data.name} → ${data.slug}/historia.html`);
  } else {
    const result = buildHistoriaPages();
    console.log(`\nDone! ${result.built} built, ${result.skipped} skipped`);
  }
}
