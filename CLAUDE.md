# AXKAN Monorepo

## What This Is

The complete AXKAN ecosystem — a custom souvenir production business automation platform. Everything from the backend API to production floor tools lives here.

## Directory Map

| Directory | What | Tech | Entry Point |
|-----------|------|------|-------------|
| `backend/` | Main API server — orders, WhatsApp bot, analytics, agents | Node.js, Express, PostgreSQL | `npm start` |
| `frontend/` | Landing pages, admin & employee dashboards | HTML, JS, build.js component system | `node build.js` |
| `website/` | axkan.art public site | Next.js, Sanity CMS, Tailwind | `npm run dev` |
| `brand/` | Brand identity — logos, fonts, sales scripts, AI prompts | Assets + Markdown | Read-only reference |
| `tools/illustrator/` | AI-powered Illustrator arrangement | Node.js, Express, Claude API | `npm start` |
| `tools/orders-generator/` | PDF reference sheet generator | Python, ReportLab | `python generate_axkan.py` |
| `tools/printing/` | Auto-print & archive system | AppleScript, JSX | `osascript pdf_autoprint_ondemand.scpt` |
| `tools/assembly-prep/` | Illustrator prep scripts | Adobe JSX | Run from Illustrator |
| `tools/arduino-button/` | Physical button order trigger | Arduino C, Python | `python3 button_listener.py` |
| `automation/facebook-bot/` | Marketplace listing bot | Python, Selenium | `python main.py` |
| `automation/social-media/` | Social content management | Sanity Studio | `npm run dev` |
| `automation/backup/` | Scheduled backups & health checks | Bash, launchd | launchd plists |
| `docs/` | System docs, module guides, plans | Markdown | Read |

## Rules (from the AXKAN Master Playbook)

### The 12 Laws
1. **One repo** — this is it
2. **Pinned deps** — no `^` or `~` in any package.json
3. **No secrets in code** — .env only, never committed
4. **Pluggable services** — URLs and tokens from env vars
5. **Dev/prod parity** — same code everywhere
6. **Stateless processes** — no in-memory state that can't be lost
7. **Port binding** — self-contained servers
8. **Concurrency** — designed to scale horizontally
9. **Disposability** — fast startup, graceful shutdown
10. **Build/release/run** — separate stages
11. **Structured logs** — JSON, machine-parseable
12. **Admin tasks** — one-off scripts in `scripts/` directories

### Commit Rules
- **Atomic commits** — one concept per commit
- **Verify before commit** — `npm start` or equivalent must work
- **Never commit** `.env`, `node_modules/`, build artifacts

### Blast Radius
- Changes to 1 file = just do it
- Changes to 2-3 files = explain in commit message
- Changes to 4+ files = write a plan first in `docs/plans/`

## AXKAN Brand Quick Reference

**Use `/axkan` skill** for any brand decision.

| Color | Hex |
|-------|-----|
| Rosa Mexicano | #e72a88 |
| Verde Selva | #8ab73b |
| Naranja Calido | #f39223 |
| Turquesa Caribe | #09adc2 |
| Rojo Mexicano | #e52421 |

**Typography:** RL AQVA (titles), Objektiv VF (body)
**Contact:** informacion@axkan.art | @axkan.mx
**Catalog:** https://axkan.art/productos
