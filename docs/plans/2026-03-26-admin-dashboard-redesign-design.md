# Admin Dashboard Redesign — AXKAN Glassmorphism

**Date:** 2026-03-26
**Status:** Design in progress
**Goal:** Retheme the admin dashboard with AXKAN brand colors, glassmorphic cards, rounded buttons, and a Skydropx-style saldo pill in the header.

---

## Reference

- **Brand:** axkan.art color system (rosa #e72a88, verde #8ab73b, turquesa #09adc2, naranja #f39223, rojo #e52421)
- **Inspiration:** Skydropx dashboard (glassmorphism, balance pill, clean cards)
- **Current:** vt-souvenir-frontend.onrender.com/admin-dashboard/

## Key Changes

### 1. Header — Saldo Pill
- Green/turquoise pill showing total revenue balance (from existing dashboard data)
- Format: `$X,XXX.XX MXN` with colored background
- Position: top-right header area, next to "Pendientes" and "Hoy"

### 2. Color Retheme
- Replace current pink/red header gradient with AXKAN brand gradient
- Sidebar: dark obsidiana background with rosa active states
- Buttons: all rounded (border-radius: 100px pill shape)
- Accent colors: use AXKAN 5-color palette for status badges, charts, etc.

### 3. Glassmorphism Cards
- Main content cards: white/transparent glass with backdrop-blur
- Subtle borders (white/10), rounded-2xl corners
- Drop shadows matching AXKAN style

### 4. Rounded Buttons
- All buttons: pill shape (border-radius: 100px)
- Primary: rosa mexicano gradient
- Secondary: glass with border
- Danger: rojo with shadow

### 5. Typography
- RL Aqva for section headers
- DM Sans / Inter for body (keep current)

## Files to Modify
- `frontend/admin-dashboard/styles.css` — main CSS retheme
- `frontend/admin-dashboard/index.html` — add saldo pill to header
- `frontend/admin-dashboard/dashboard.js` — fetch and display saldo data

## Implementation
- CSS-only retheme (override variables + component styles)
- No structural HTML changes except header saldo pill
- Use `/frontend-design` skill for aesthetic quality
