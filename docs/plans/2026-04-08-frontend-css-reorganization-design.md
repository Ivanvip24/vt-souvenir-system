# Frontend CSS Reorganization — Design

**Date:** 2026-04-08
**Status:** Approved, ready for Phase 1

## Problem

The AXKAN frontend CSS is disorganized, making changes risky and slow:

- **~4,500 lines of inline `<style>` blocks** across main HTML pages (`landing/index.html` alone has 1,978 inline style lines)
- **1,378 `@media` query instances** scattered throughout files
- **17 distinct breakpoints** in use (360, 380, 400, 480, 500, 540, 576, 599, 600, 767, 768, 769, 900, 960, 1024, 1100, 1264) — no consistency
- **Shared components trapped inline** — the mega nav CSS lives inside `landing/index.html` only, so when the souvenirs destination template tried to use `<!-- @NAV:mega -->`, the entire page broke (unstyled).
- **Duplicated `:root` blocks** with CSS variables redefined across multiple files
- No clear convention for where mobile vs desktop styles live

## Goals

1. **Find things fast** — a predictable structure so future-you always knows where a style lives
2. **Shared components stay shared** — nav, footer, buttons, etc. live in their own CSS files, not trapped in one page
3. **Mobile vs desktop separation** — clear sections inside each page's CSS file
4. **Breakpoint consolidation** — from 17 down to 3 official ones
5. **No big-bang migration** — nothing forced, nothing broken overnight

## Non-Goals

- Changing visual design (this is a refactor, not a redesign)
- Migrating pages that aren't being actively worked on
- Introducing a CSS framework (Tailwind, etc.) — keep vanilla CSS
- Touching backend or JS architecture

## Design

### Folder structure

```
frontend/
├── styles/
│   ├── _variables.css               ← single source of truth for colors, fonts, breakpoints
│   ├── _reset.css                   ← base body/html reset
│   ├── components/
│   │   ├── nav-mega.css             ← extracted from landing/index.html
│   │   ├── mobile-menu-mega.css
│   │   ├── footer.css
│   │   ├── buttons.css
│   │   └── whatsapp-float.css
│   └── pages/
│       ├── souvenirs-destination.css   (replaces souvenirs-page.css)
│       ├── souvenirs-index.css
│       ├── disenos.css
│       ├── productos.css
│       └── home.css
```

### Page CSS file convention

Every page CSS file follows the same internal structure, with clearly labeled mobile-first sections:

```css
/* ═══════════════════════════════════════════
   <PAGE NAME>
   ═══════════════════════════════════════════ */

/* ── BASE (mobile-first, <600px) ── */
.selector { ... }

/* ── TABLET (≥600px) ── */
@media (min-width: 600px) {
  .selector { ... }
}

/* ── DESKTOP (≥900px) ── */
@media (min-width: 900px) {
  .selector { ... }
}
```

### Official breakpoints (3 only)

| Name | Min width | Notes |
|---|---|---|
| Base | — (mobile-first, no media query) | Default for everything |
| Tablet | `min-width: 600px` | Grid expansions, larger typography |
| Desktop | `min-width: 900px` | Multi-column layouts, max-width containers |

All existing breakpoints (768, 1024, 1100, etc.) get mapped to the nearest official one during migration.

### Phase plan

**Phase 1 — Foundation** (tonight, ~1 hour, low risk)
- Create `frontend/styles/_variables.css` with all brand colors, fonts, and the 3 breakpoints as comments (CSS doesn't support `@media` variables yet)
- Extract mega nav CSS from `landing/index.html` → `frontend/styles/components/nav-mega.css`
- Extract mobile mega menu CSS → `frontend/styles/components/mobile-menu-mega.css`
- Add `<link>` to those files in the souvenirs destination template
- Now the destination template can actually use `<!-- @NAV:mega -->` without breaking

**Phase 2 — Destination template** (~1 hour)
- Move `souvenirs-page.css` to `frontend/styles/pages/souvenirs-destination.css`
- Reorganize internal sections into BASE / TABLET / DESKTOP with clear comment headers
- Consolidate all media queries to the 3 official breakpoints
- Update template `<link>` reference

**Phase 3 — Incremental page migration** (ongoing, no forced timeline)
- When editing any page in the future, extract its inline `<style>` to `frontend/styles/pages/<name>.css`
- Pages not being touched stay as-is and keep working

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Extracting inline styles breaks a page (as happened with the mega nav tonight) | Deploy after each phase, verify with hard refresh on key pages before moving on |
| CSS specificity conflicts when splitting files | External files load in controlled order via `<link>` tags |
| Build system (`build.js`) doesn't know about new CSS paths | CSS is just served as static files from `frontend/styles/`, no build step needed |
| Vercel routing needs rewrites for new paths | Add rewrite for `/styles/:path*` → `/styles/:path*` (already served as static) |

## Success criteria

After Phase 1:
- Destination template can use `<!-- @NAV:mega -->` without layout breaking
- No visual regression on any deployed page
- `frontend/styles/` directory exists with at least `_variables.css`, `nav-mega.css`, `mobile-menu-mega.css`

After Phase 2:
- `souvenirs-page.css` (old path) removed or redirected
- All souvenirs destination pages use the new file
- Media queries consolidated to only `600px` and `900px`

Phase 3 has no deadline — it happens naturally as pages are worked on.
