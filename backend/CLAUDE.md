# Backend — AXKAN Brain

The main API server. Express + PostgreSQL. Handles orders, WhatsApp bot, shipping, analytics, payments, and design portal.

## The 12 Laws (Playbook)

- L2: Pinned deps only. No `^` or `~`.
- L3: Config in `.env`. Never hardcode secrets or URLs.
- L6: Stateless. No in-memory caches that outlive a request.
- L11: Use `log()` from `shared/logger.js`. No `console.log`.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Dev server with nodemon
npm start            # Production server
node demo-server.js  # Database-free demo mode
```

## Key Files

- `api/server.js` — Main entry point (~5400 lines, decomposition planned)
- `api/*-routes.js` — 28 route modules
- `services/` — 37 service modules (WhatsApp, shipping, AI, payments, etc.)
- `agents/` — Notion sync, analytics/reports, inventory, alerts
- `shared/database.js` — PostgreSQL connection pool (use this for all queries)
- `shared/logger.js` — Structured JSON logging (use instead of console.log)
- `scripts/` — All admin/one-off scripts (Playbook L12)
- `.env.example` — All config vars with descriptions

## Database

PostgreSQL with SSL. Key tables: orders, order_items, clients, products, shipping_labels, employees.
Generated columns: `orders.profit`, `orders.profit_margin`, `order_items.line_total`.
Views: `order_summary`, `daily_revenue`, `top_products`, `top_clients`.

## Creating an Order (correct flow)

```javascript
import { createOrderBothSystems } from './agents/notion-agent/sync.js';
const result = await createOrderBothSystems({ clientName, items, ... });
// Automatically: DB + Notion + transaction safety
```

Never insert directly into the database AND Notion separately.

## External APIs (all must use fetchWithTimeout)

| Service | File | Timeout |
|---------|------|---------|
| WhatsApp Cloud | services/whatsapp-api.js | 30s |
| Notion | agents/notion-agent/index.js | 30s |
| Skydropx | services/skydropx.js | 30s |
| T1 Envios | services/t1-envios-service.js | 30s |
| Banxico CEP | services/cep-service.js | 30s |
| MercadoLibre | services/mercadolibre.js | 30s |
| Gemini AI | services/gemini-image.js | 60s |

## Forbidden

- `console.log` — use `log()` from shared/logger.js
- Bare `fetch()` — use `fetchWithTimeout()` from shared/fetch-with-timeout.js
- Hardcoded URLs — use `process.env.X`
- Direct state mutation in globals
- `catch(e) {}` silent swallows
