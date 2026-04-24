# Website — axkan.art

Public-facing e-commerce site. Next.js + Sanity CMS + Tailwind + Framer Motion.

## Commands

```bash
npm install
npm run dev          # Dev server (localhost:3000)
npm run build        # Production build
npm start            # Serve production build
npm run lint         # ESLint
```

## Tech Stack

- Next.js 16.1.1, TypeScript 5.9.3
- Tailwind CSS 4.1.18
- Sanity 5.1.0 (CMS for products, categories, testimonials)
- Framer Motion 12.23.26 (animations)

## Key Files

- `src/app/page.tsx` — Home page
- `src/app/catalogo/page.tsx` — Product catalog (reads from Sanity)
- `src/app/pedido/page.tsx` — Order form
- `src/components/` — UI components (Hero, Products, Footer, etc.)
- `src/sanity/client.ts` — Sanity client config
- `sanity.config.ts` — Sanity schema definitions
- `studio-axkan/` — Standalone Sanity Studio

## Sanity Schemas

product, category, testimonial, heroSection, aboutSection, siteSettings

## Rules

- All deps pinned (no ^ or ~)
- Use Sanity for all content — don't hardcode product data
- Images served via Sanity CDN
